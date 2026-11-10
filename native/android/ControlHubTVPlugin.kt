package com.controlhub.tv

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.net.Inet4Address
import java.net.InetAddress
import java.net.DatagramPacket
import java.net.HttpURLConnection
import java.net.MulticastSocket
import java.net.SocketTimeoutException
import java.net.URL
import javax.xml.parsers.DocumentBuilderFactory
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

/**
 * Descubrimiento de televisores de la LAN y sesiones explícitamente autorizadas.
 * LG webOS: intenta WSS/3001 con pinning del certificado en el primer vínculo
 * y después WS/3000 como alternativa para modelos antiguos.
 * Samsung: WS heredado/8001. Los protocolos TLS-only no se degradan a texto plano.
 */
@CapacitorPlugin(name = "ControlHubTV")
class ControlHubTVPlugin : Plugin() {
    private data class Candidate(
        val id: String,
        val name: String,
        val serviceType: String,
        val address: String,
        val port: Int,
        val manufacturer: String? = null,
        val model: String? = null
    )

    private data class Session(
        val platform: String,
        val host: String,
        val socket: WebSocket,
        @Volatile var registered: Boolean = false,
        val pointerSocket: WebSocket? = null
    )

    private val discovered = ConcurrentHashMap<String, Candidate>()
    private val sessions = ConcurrentHashMap<String, Session>()
    private val handler = Handler(Looper.getMainLooper())
    private val baseClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .writeTimeout(8, TimeUnit.SECONDS)
        .pingInterval(25, TimeUnit.SECONDS)
        .build()

    private val preferences by lazy {
        context.getSharedPreferences("aureon_tv_pairings", Context.MODE_PRIVATE)
    }

    private val serviceTypes = listOf(
        "_webos._tcp.",
        "_webos-second-screen._tcp.",
        "_samsungmsf._tcp.",
        "_samsung-smart-tv._tcp.",
        "_googlecast._tcp.",
        "_androidtvremote2._tcp."
    )

    @PluginMethod
    fun discover(call: PluginCall) {
        val manager = context.getSystemService(Context.NSD_SERVICE) as? NsdManager
        if (manager == null) {
            call.reject("Android no ofrece el servicio de detección de dispositivos en esta versión.")
            return
        }

        discovered.clear()
        val listeners = mutableListOf<NsdManager.DiscoveryListener>()
        val completed = AtomicBoolean(false)
        var multicastLock: WifiManager.MulticastLock? = null

        try {
            val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            multicastLock = wifi?.createMulticastLock("AUREON_TV_DISCOVERY")?.apply {
                setReferenceCounted(false)
                acquire()
            }
        } catch (_: Exception) {
            // Android 13+ manages foreground mDNS reception on current system extensions.
        }

        fun finish() {
            if (!completed.compareAndSet(false, true)) return
            listeners.forEach { listener ->
                try { manager.stopServiceDiscovery(listener) } catch (_: Exception) {}
            }
            try { if (multicastLock?.isHeld == true) multicastLock?.release() } catch (_: Exception) {}

            val items = JSArray()
            discovered.values
                .filter { isLocalAddress(it.address) }
                .sortedBy { it.name.lowercase() }
                .forEach { candidate ->
                    val item = JSObject()
                    item.put("id", candidate.id)
                    item.put("name", candidate.name)
                    item.put("platform", candidate.serviceType)
                    item.put("protocol", "DNS-SD")
                    item.put("address", candidate.address)
                    item.put("port", candidate.port)
                    item.put("manufacturer", candidate.manufacturer ?: manufacturer(candidate.serviceType, candidate.name))
                    if (!candidate.model.isNullOrBlank()) item.put("model", candidate.model)
                    items.put(item)
                }

            val result = JSObject()
            result.put("devices", items)
            result.put("scanDurationMs", 6500)
            call.resolve(result)
        }

        // LG webOS commonly advertises its Second Screen service through SSDP/UPnP
        // rather than Bonjour. Run SSDP alongside DNS-SD in the same scan window.
        Thread({ discoverLgSsdp() }, "AUREON-TV-SSDP").start()

        serviceTypes.forEach { serviceType ->
            val listener = object : NsdManager.DiscoveryListener {
                override fun onDiscoveryStarted(type: String) = Unit

                override fun onServiceFound(info: NsdServiceInfo) {
                    try {
                        manager.resolveService(info, object : NsdManager.ResolveListener {
                            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) = Unit

                            override fun onServiceResolved(resolved: NsdServiceInfo) {
                                val host = resolved.host?.hostAddress ?: return
                                if (!isLocalAddress(host)) return
                                val resolvedType = resolved.serviceType ?: serviceType
                                val id = "${resolved.serviceName}|${resolvedType}|${host}|${resolved.port}"
                                discovered[id] = Candidate(
                                    id = id,
                                    name = resolved.serviceName ?: "Televisor",
                                    serviceType = resolvedType,
                                    address = host,
                                    port = resolved.port
                                )
                            }
                        })
                    } catch (_: Exception) {
                        // Unsupported or temporarily busy service resolutions are ignored.
                    }
                }

                override fun onServiceLost(info: NsdServiceInfo) = Unit
                override fun onDiscoveryStopped(type: String) = Unit

                override fun onStartDiscoveryFailed(type: String, errorCode: Int) {
                    try { manager.stopServiceDiscovery(this) } catch (_: Exception) {}
                }

                override fun onStopDiscoveryFailed(type: String, errorCode: Int) = Unit
            }

            listeners.add(listener)
            try {
                manager.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, listener)
            } catch (_: Exception) {
                // Other service types continue scanning.
            }
        }

        handler.postDelayed({ finish() }, 7200L)
    }

    private data class SsdpMetadata(
        val name: String,
        val manufacturer: String,
        val model: String,
        val udn: String?
    )

    /**
     * Discover LG webOS TVs through their documented UPnP/SSDP advertisements.
     * Only private/local LOCATION hosts are fetched; redirects are not followed.
     */
    private fun discoverLgSsdp() {
        val targets = listOf(
            "urn:lge-com:service:webos-second-screen:1",
            "urn:schemas-upnp-org:device:MediaRenderer:1",
            "urn:schemas-upnp-org:device:Basic:1"
        )
        val multicastAddress = try {
            InetAddress.getByName("239.255.255.250")
        } catch (_: Exception) {
            return
        }

        try {
            MulticastSocket().use { socket ->
                socket.soTimeout = 450
                socket.broadcast = true
                targets.forEach { target ->
                    val request = (
                        "M-SEARCH * HTTP/1.1\r\n" +
                        "HOST: 239.255.255.250:1900\r\n" +
                        "MAN: \"ssdp:discover\"\r\n" +
                        "MX: 2\r\n" +
                        "ST: $target\r\n\r\n"
                    ).toByteArray(Charsets.US_ASCII)
                    try {
                        socket.send(DatagramPacket(request, request.size, multicastAddress, 1900))
                    } catch (_: Exception) {}
                }

                val deadline = System.currentTimeMillis() + 3600L
                val buffer = ByteArray(8192)
                while (System.currentTimeMillis() < deadline) {
                    val packet = DatagramPacket(buffer, buffer.size)
                    try {
                        socket.receive(packet)
                    } catch (_: SocketTimeoutException) {
                        continue
                    } catch (_: Exception) {
                        break
                    }

                    val headers = parseSsdpHeaders(
                        String(packet.data, packet.offset, packet.length, Charsets.ISO_8859_1)
                    )
                    val location = headers["location"] ?: continue
                    val url = try { URL(location) } catch (_: Exception) { continue }
                    if (url.protocol != "http" || !isLocalAddress(url.host)) continue

                    val metadata = readLgSsdpDescription(url) ?: continue
                    val responseTarget = headers["st"].orEmpty().lowercase()
                    val brand = metadata.manufacturer.lowercase()
                    if (!brand.contains("lg") && !responseTarget.contains("lge") &&
                        !responseTarget.contains("webos")
                    ) continue

                    val address = url.host
                    if (!isLocalAddress(address)) continue
                    val id = "${metadata.udn ?: headers["usn"] ?: metadata.name}|ssdp|$address"
                    discovered[id] = Candidate(
                        id = id,
                        name = metadata.name.ifBlank { "LG webOS TV" },
                        serviceType = "urn:lge-com:service:webos-second-screen:1",
                        address = address,
                        port = 3000,
                        manufacturer = metadata.manufacturer.ifBlank { "LG" },
                        model = metadata.model
                    )
                }
            }
        } catch (_: Exception) {
            // DNS-SD discovery continues if SSDP is blocked by the router or Android.
        }
    }

    private fun parseSsdpHeaders(response: String): Map<String, String> {
        val headers = mutableMapOf<String, String>()
        response.lineSequence().drop(1).forEach { line ->
            val separator = line.indexOf(':')
            if (separator > 0) {
                headers[line.substring(0, separator).trim().lowercase()] =
                    line.substring(separator + 1).trim()
            }
        }
        return headers
    }

    private fun readLgSsdpDescription(url: URL): SsdpMetadata? {
        val connection = try {
            (url.openConnection() as? HttpURLConnection) ?: return null
        } catch (_: Exception) {
            return null
        }

        return try {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 1400
            connection.readTimeout = 1400
            connection.requestMethod = "GET"
            connection.connect()
            if (connection.responseCode !in 200..299) return null

            val factory = DocumentBuilderFactory.newInstance()
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false)
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false)
            factory.isXIncludeAware = false
            factory.isExpandEntityReferences = false
            val document = connection.inputStream.use { input ->
                factory.newDocumentBuilder().parse(input)
            }

            fun value(tag: String): String =
                document.getElementsByTagName(tag).item(0)?.textContent?.trim().orEmpty()

            SsdpMetadata(
                name = value("friendlyName"),
                manufacturer = value("manufacturer"),
                model = value("modelName").ifBlank { value("modelNumber") },
                udn = value("UDN").ifBlank { null }
            )
        } catch (_: Exception) {
            null
        } finally {
            connection.disconnect()
        }
    }

    @PluginMethod
    fun pair(call: PluginCall) {
        val id = call.getString("deviceId")
        val candidate = id?.let { discovered[it] }
        if (candidate == null) {
            call.reject("El televisor ya no está en la lista de dispositivos. Pulsa Buscar dispositivos otra vez.")
            return
        }
        if (!isLocalAddress(candidate.address)) {
            call.reject("Por seguridad, AUREON TV solo puede vincular dispositivos de la red local.")
            return
        }

        val type = candidate.serviceType.lowercase()
        when {
            type.contains("webos") -> pairLg(candidate, call)
            type.contains("samsung") -> pairSamsung(candidate, call)
            else -> call.reject("Se detectó este dispositivo, pero su protocolo de control todavía no está implementado.")
        }
    }

    private fun pairLg(candidate: Candidate, call: PluginCall) {
        val ports = listOf(3001, candidate.port, 3000).distinct().filter { it in 1..65535 }
        val connectionId = UUID.randomUUID().toString()
        val allFinished = AtomicBoolean(false)

        fun rejectOnce(message: String, socket: WebSocket? = null) {
            if (allFinished.compareAndSet(false, true)) {
                try { socket?.cancel() } catch (_: Exception) {}
                call.reject(message)
            }
        }

        fun attempt(index: Int) {
            if (allFinished.get()) return
            if (index >= ports.size) {
                rejectOnce(
                    "No se pudo vincular el LG. Enciende el televisor, comprueba que ambos equipos estén en el mismo Wi-Fi y acepta la solicitud de AUREON TV en la pantalla."
                )
                return
            }

            val port = ports[index]
            val secure = port == 3001
            val client = try {
                if (secure) pinnedLgClient(candidate.address) else baseClient
            } catch (_: Exception) {
                handler.post { attempt(index + 1) }
                return
            }

            val host = urlHost(candidate.address)
            val scheme = if (secure) "wss" else "ws"
            val request = Request.Builder().url("$scheme://$host:$port").build()
            val attemptFinished = AtomicBoolean(false)
            val registrationReceived = AtomicBoolean(false)
            var mainSocket: WebSocket? = null

            fun failAndContinue() {
                if (registrationReceived.get()) return
                if (!attemptFinished.compareAndSet(false, true) || allFinished.get()) return
                handler.postDelayed({ attempt(index + 1) }, 250L)
            }

            fun failAfterRegistration(message: String) {
                if (allFinished.compareAndSet(false, true)) {
                    try { mainSocket?.cancel() } catch (_: Exception) {}
                    call.reject(message)
                }
            }

            val listener = object : WebSocketListener() {
                override fun onOpen(socket: WebSocket, response: Response) {
                    if (secure) {
                        try {
                            val certificate = response.handshake?.peerCertificates?.firstOrNull() as? X509Certificate
                                ?: throw CertificateException("El televisor no presentó un certificado TLS.")
                            saveLgCertificatePin(candidate.address, certificate)
                        } catch (_: Exception) {
                            socket.cancel()
                            failAndContinue()
                            return
                        }
                    }

                    val payload = JSONObject()
                        .put("forcePairing", false)
                        .put("pairingType", "PROMPT")
                        .put(
                            "manifest",
                            JSONObject()
                                .put("manifestVersion", 1)
                                .put("appVersion", "1.2")
                                .put(
                                    "permissions",
                                    JSONArray(
                                        listOf(
                                            "CONTROL_AUDIO",
                                            "CONTROL_INPUT_JOYSTICK",
                                            "CONTROL_INPUT_MEDIA_PLAYBACK",
                                            "CONTROL_INPUT_TEXT",
                                            "CONTROL_MOUSE_AND_KEYBOARD",
                                            "CONTROL_POWER",
                                            "READ_CURRENT_CHANNEL",
                                            "READ_RUNNING_APPS",
                                            "WRITE_NOTIFICATION_TOAST",
                                            "READ_NOTIFICATIONS"
                                        )
                                    )
                                )
                        )

                    val savedKey = preferences.getString(lgClientKeyName(candidate.address), null)
                    if (!savedKey.isNullOrBlank()) payload.put("client-key", savedKey)

                    val register = JSONObject()
                        .put("type", "register")
                        .put("id", "aureon-register")
                        .put("payload", payload)

                    if (!socket.send(register.toString())) {
                        failAndContinue()
                        return
                    }

                    handler.postDelayed({
                        rejectOnce(
                            "El televisor LG no terminó el emparejamiento o no entregó su canal de navegación. Comprueba el permiso de control remoto y vuelve a intentarlo.",
                            socket
                        )
                    }, 45000L)
                }

                override fun onMessage(socket: WebSocket, text: String) {
                    try {
                        val message = JSONObject(text)
                        when {
                            message.optString("type") == "registered" -> {
                                if (!registrationReceived.compareAndSet(false, true) || allFinished.get()) return

                                val key = message.optJSONObject("payload")?.optString("client-key")
                                if (!key.isNullOrBlank() && key != "null") {
                                    preferences.edit()
                                        .putString(lgClientKeyName(candidate.address), key)
                                        .apply()
                                }

                                // webOS sends navigation input through a separate pointer socket.
                                // A successful SSAP registration alone does not mean the D-pad is ready.
                                val pointerRequest = JSONObject()
                                    .put("type", "request")
                                    .put("id", "aureon-pointer-socket")
                                    .put("uri", "ssap://com.webos.service.networkinput/getPointerInputSocket")
                                    .put("payload", JSONObject())

                                if (!socket.send(pointerRequest.toString())) {
                                    failAfterRegistration("El LG se vinculó, pero no se pudo solicitar el canal de navegación. Vuelve a intentarlo.")
                                }
                            }

                            message.optString("id") == "aureon-pointer-socket" -> {
                                if (allFinished.get()) return
                                val pointerPayload = message.optJSONObject("payload")
                                val pointerPath = pointerPayload?.optString("socketPath").orEmpty()
                                if (message.optString("type") == "error" ||
                                    pointerPayload?.optBoolean("returnValue", true) == false ||
                                    pointerPath.isBlank() || pointerPath == "null"
                                ) {
                                    failAfterRegistration(
                                        "El televisor aceptó el vínculo, pero no concedió el canal de navegación. Revisa el permiso de control remoto en el LG y vuelve a vincularlo."
                                    )
                                    return
                                }

                                val pointerUrl = try { URL(pointerPath) } catch (_: Exception) {
                                    failAfterRegistration("El televisor devolvió una dirección de navegación no válida.")
                                    return
                                }
                                val pointerHost = pointerUrl.host.trim('[', ']')
                                val expectedHost = candidate.address.trim('[', ']')
                                if (!pointerHost.equals(expectedHost, ignoreCase = true) ||
                                    !isLocalAddress(pointerHost) ||
                                    pointerUrl.protocol !in listOf("ws", "wss") ||
                                    pointerUrl.port !in listOf(3000, 3001)
                                ) {
                                    failAfterRegistration("AUREON TV bloqueó una dirección de navegación que no pertenece al televisor vinculado.")
                                    return
                                }

                                val pointerSecure = pointerUrl.protocol == "wss"
                                val pointerClient = try {
                                    if (pointerSecure) pinnedLgClient(candidate.address) else baseClient
                                } catch (_: Exception) {
                                    failAfterRegistration("No se pudo preparar la conexión segura de navegación.")
                                    return
                                }

                                val pointerRequest = Request.Builder().url(pointerUrl).build()
                                pointerClient.newWebSocket(pointerRequest, object : WebSocketListener() {
                                    override fun onOpen(pointerSocket: WebSocket, pointerResponse: Response) {
                                        if (pointerSecure) {
                                            try {
                                                val certificate = pointerResponse.handshake?.peerCertificates?.firstOrNull() as? X509Certificate
                                                    ?: throw CertificateException("El televisor no presentó un certificado TLS para navegación.")
                                                saveLgCertificatePin(candidate.address, certificate)
                                            } catch (_: Exception) {
                                                pointerSocket.cancel()
                                                failAfterRegistration("No se pudo verificar la conexión segura de navegación del LG.")
                                                return
                                            }
                                        }

                                        if (allFinished.compareAndSet(false, true)) {
                                            sessions[connectionId] = Session(
                                                "lg",
                                                candidate.address,
                                                socket,
                                                true,
                                                pointerSocket
                                            )
                                            val result = JSObject()
                                            result.put("paired", true)
                                            result.put("connectionId", connectionId)
                                            result.put("capabilities", capabilities())
                                            result.put("address", candidate.address)
                                            result.put("port", port)
                                            result.put("secure", secure)
                                            result.put("navigationReady", true)
                                            call.resolve(result)
                                        } else {
                                            pointerSocket.close(1000, "AUREON TV pairing finished")
                                        }
                                    }

                                    override fun onFailure(pointerSocket: WebSocket, error: Throwable, response: Response?) {
                                        failAfterRegistration(
                                            "El LG se vinculó, pero no se pudo abrir su canal de navegación. Comprueba la red local y vuelve a vincularlo."
                                        )
                                    }
                                })
                            }

                            message.optString("type") == "error" -> {
                                failAfterRegistration(
                                    "El televisor LG rechazó la solicitud. Acepta el acceso de AUREON TV en la pantalla del televisor."
                                )
                            }
                        }
                    } catch (_: Exception) {
                        // Ignore unrelated status notifications.
                    }
                }

                override fun onFailure(socket: WebSocket, error: Throwable, response: Response?) {
                    if (registrationReceived.get()) {
                        failAfterRegistration("Se interrumpió la conexión con el televisor LG durante el emparejamiento.")
                    } else if (secure && isCertificatePinMismatch(error)) {
                        rejectOnce(
                            "El certificado de seguridad del televisor LG cambió. Por protección, AUREON TV detuvo la conexión. Desvincula el televisor y vuelve a autorizarlo si reconoces el cambio.",
                            socket
                        )
                    } else {
                        failAndContinue()
                    }
                }
            }

            mainSocket = client.newWebSocket(request, listener)
        }

        attempt(0)
    }

    private fun isCertificatePinMismatch(error: Throwable): Boolean {
        var current: Throwable? = error
        while (current != null) {
            if (current.message?.contains("El certificado del televisor cambió", ignoreCase = true) == true) {
                return true
            }
            current = current.cause
        }
        return false
    }

    /**
     * First-time WSS pairing accepts the TV's self-signed certificate only after
     * the user chose this discovered LAN device. Its SHA-256 fingerprint is
     * pinned in app-private storage; subsequent sessions reject certificate changes.
     */
    private fun pinnedLgClient(host: String): OkHttpClient {
        val savedPin = preferences.getString(lgCertificatePinName(host), null)
        val trustManager = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = Unit

            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
                if (chain.isEmpty()) throw CertificateException("Certificado del televisor vacío.")
                val receivedPin = certificateFingerprint(chain[0])
                if (!savedPin.isNullOrBlank() && !savedPin.equals(receivedPin, ignoreCase = true)) {
                    throw CertificateException("El certificado del televisor cambió. Desvincula el TV y vuelve a autorizarlo.")
                }
            }

            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
        }

        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(null, arrayOf(trustManager), SecureRandom())

        val hostVerifier = HostnameVerifier { requestedHost, _ ->
            requestedHost.equals(host, ignoreCase = true)
        }

        return baseClient.newBuilder()
            .sslSocketFactory(sslContext.socketFactory, trustManager)
            .hostnameVerifier(hostVerifier)
            .build()
    }

    private fun saveLgCertificatePin(host: String, certificate: X509Certificate) {
        val key = lgCertificatePinName(host)
        val existing = preferences.getString(key, null)
        val current = certificateFingerprint(certificate)
        if (!existing.isNullOrBlank() && !existing.equals(current, ignoreCase = true)) {
            throw CertificateException("El certificado del televisor cambió.")
        }
        preferences.edit().putString(key, current).apply()
    }

    private fun certificateFingerprint(certificate: X509Certificate): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(certificate.encoded)
        return digest.joinToString(":") { "%02X".format(it) }
    }

    private fun pairSamsung(candidate: Candidate, call: PluginCall) {
        val encodedName = Base64.encodeToString("AUREON TV".toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
        val connectionId = UUID.randomUUID().toString()
        val host = urlHost(candidate.address)
        val request = Request.Builder()
            .url("ws://$host:8001/api/v2/channels/samsung.remote.control?name=$encodedName")
            .build()
        val finished = AtomicBoolean(false)

        val listener = object : WebSocketListener() {
            override fun onMessage(socket: WebSocket, text: String) {
                try {
                    val event = JSONObject(text).optString("event")
                    if (event == "ms.channel.connect" && finished.compareAndSet(false, true)) {
                        sessions[connectionId] = Session("samsung", candidate.address, socket, true)
                        val result = JSObject()
                        result.put("paired", true)
                        result.put("connectionId", connectionId)
                        result.put("capabilities", capabilities())
                        call.resolve(result)
                    } else if (event == "ms.channel.unauthorized") {
                        if (finished.compareAndSet(false, true)) {
                            socket.cancel()
                            call.reject("El televisor Samsung rechazó la conexión. Acepta la solicitud en la pantalla del TV.")
                        }
                    }
                } catch (_: Exception) {}
            }

            override fun onFailure(socket: WebSocket, error: Throwable, response: Response?) {
                if (finished.compareAndSet(false, true)) {
                    call.reject("No se pudo conectar al protocolo LAN heredado de Samsung. Este modelo puede requerir WSS/8002, que aún no está habilitado.")
                }
            }

            override fun onOpen(socket: WebSocket, response: Response) {
                handler.postDelayed({
                    if (finished.compareAndSet(false, true)) {
                        socket.cancel()
                        call.reject("No llegó la autorización de Samsung. Acepta la solicitud en la pantalla del televisor y vuelve a intentar.")
                    }
                }, 45000L)
            }
        }

        baseClient.newWebSocket(request, listener)
    }

    @PluginMethod
    fun sendCommand(call: PluginCall) {
        val connectionId = call.getString("connectionId")
        val command = call.getString("command")
        val session = connectionId?.let { sessions[it] }
        if (session == null || !session.registered) {
            call.reject("No existe una sesión autorizada con el televisor. Vuelve a vincularlo.")
            return
        }

        val key = when (command) {
            "power" -> "POWER"
            "mute" -> "MUTE"
            "home" -> "HOME"
            "back" -> "RETURN"
            "menu" -> "MENU"
            "up" -> "UP"
            "down" -> "DOWN"
            "left" -> "LEFT"
            "right" -> "RIGHT"
            "select" -> "ENTER"
            "volume_up" -> if (session.platform == "samsung") "VOLUP" else "VOLUMEUP"
            "volume_down" -> if (session.platform == "samsung") "VOLDOWN" else "VOLUMEDOWN"
            "play_pause" -> "PLAY"
            else -> null
        }

        if (key == null) {
            call.reject("Orden no reconocida.")
            return
        }

        if (session.platform == "lg") {
            val pointer = session.pointerSocket
            if (pointer == null) {
                call.reject("El canal de navegación del LG no está disponible. Vuelve a vincular el televisor.")
                return
            }
            // LG webOS pointer input uses a line-based message on its dedicated socket.
            val pointerMessage = "type:button\nname:$key\n\n"
            if (!pointer.send(pointerMessage)) {
                call.reject("La conexión de navegación con el LG se cerró. Vuelve a vincular el televisor.")
                return
            }
        } else {
            val payload = JSONObject()
                .put("method", "ms.remote.control")
                .put(
                    "params",
                    JSONObject()
                        .put("Cmd", "Click")
                        .put("DataOfCmd", "KEY_$key")
                        .put("Option", "false")
                        .put("TypeOfRemote", "SendRemoteKey")
                )
            if (!session.socket.send(payload.toString())) {
                call.reject("La conexión con el televisor se cerró. Vuelve a vincularlo.")
                return
            }
        }

        val result = JSObject()
        result.put("accepted", true)
        call.resolve(result)
    }

    @PluginMethod
    fun unpair(call: PluginCall) {
        val id = call.getString("connectionId")
        id?.let {
            val session = sessions.remove(it)
            session?.pointerSocket?.close(1000, "AUREON TV desvinculado")
            session?.socket?.close(1000, "AUREON TV desvinculado")
            if (session?.platform == "lg") {
                preferences.edit()
                    .remove(lgClientKeyName(session.host))
                    .remove(lgCertificatePinName(session.host))
                    .apply()
            }
        }
        call.resolve()
    }

    override fun handleOnDestroy() {
        sessions.values.forEach { session ->
            try { session.pointerSocket?.close(1000, "AUREON TV cerrado") } catch (_: Exception) {}
            try { session.socket.close(1000, "AUREON TV cerrado") } catch (_: Exception) {}
        }
        sessions.clear()
        baseClient.dispatcher.executorService.shutdown()
        baseClient.connectionPool.evictAll()
        super.handleOnDestroy()
    }

    private fun lgClientKeyName(host: String) = "lg_client_key_$host"
    private fun lgCertificatePinName(host: String) = "lg_certificate_pin_$host"

    private fun manufacturer(type: String, name: String): String {
        val value = "$type $name".lowercase()
        return when {
            value.contains("webos") -> "LG"
            value.contains("samsung") -> "Samsung"
            else -> ""
        }
    }

    private fun capabilities(): JSArray = JSArray().apply {
        listOf(
            "power", "mute", "home", "back", "menu",
            "up", "down", "left", "right", "select",
            "volume_up", "volume_down", "play_pause"
        ).forEach { put(it) }
    }

    private fun urlHost(address: String): String =
        if (address.contains(":") && !address.startsWith("[")) "[$address]" else address

    private fun isLocalAddress(value: String): Boolean {
        return try {
            val address = InetAddress.getByName(value)
            if (address.isAnyLocalAddress || address.isLoopbackAddress || address.isMulticastAddress) {
                false
            } else if (address is Inet4Address) {
                val b = address.address.map { it.toInt() and 0xFF }
                (b[0] == 10) ||
                    (b[0] == 172 && b[1] in 16..31) ||
                    (b[0] == 192 && b[1] == 168) ||
                    (b[0] == 169 && b[1] == 254) ||
                    (b[0] == 100 && b[1] in 64..127)
            } else {
                address.isLinkLocalAddress || address.isSiteLocalAddress ||
                    value.lowercase().startsWith("fc") || value.lowercase().startsWith("fd")
            }
        } catch (_: Exception) {
            false
        }
    }
}
