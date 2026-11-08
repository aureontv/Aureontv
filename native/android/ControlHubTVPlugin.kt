package com.controlhub.tv

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
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
import org.json.JSONObject
import java.net.InetAddress
import java.net.URI
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Local-network TV discovery and explicitly authorized vendor sessions.
 * Supported transport scope: LG webOS over ws://:3000 and Samsung Tizen
 * legacy remote control over ws://:8001. TLS-only Samsung models and newer
 * vendor variants are reported as unsupported rather than bypassing TLS.
 */
@CapacitorPlugin(name = "ControlHubTV")
class ControlHubTVPlugin : Plugin() {
    private data class Candidate(
        val id: String, val name: String, val serviceType: String,
        val address: String, val port: Int
    )
    private data class Session(
        val platform: String, val socket: WebSocket,
        @Volatile var registered: Boolean = false
    )

    private val discovered = ConcurrentHashMap<String, Candidate>()
    private val sessions = ConcurrentHashMap<String, Session>()
    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .writeTimeout(8, TimeUnit.SECONDS)
        .build()
    private val serviceTypes = listOf(
        "_webos._tcp.", "_samsungmsf._tcp.", "_samsung-smart-tv._tcp.",
        "_googlecast._tcp.", "_androidtvremote2._tcp."
    )

    @PluginMethod
    fun discover(call: PluginCall) {
        val manager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
        discovered.clear()
        val listeners = mutableListOf<NsdManager.DiscoveryListener>()
        val finished = AtomicBoolean(false)
        val handler = Handler(Looper.getMainLooper())
        fun finish() {
            if (!finished.compareAndSet(false, true)) return
            listeners.forEach { try { manager.stopServiceDiscovery(it) } catch (_: Exception) {} }
            handler.postDelayed({
                val array = JSArray()
                discovered.values.sortedBy { it.name }.forEach { c ->
                    val item = JSObject()
                    item.put("id", c.id)
                    item.put("name", c.name)
                    item.put("platform", c.serviceType)
                    item.put("protocol", "DNS-SD")
                    item.put("address", c.address)
                    item.put("port", c.port)
                    item.put("manufacturer", manufacturer(c.serviceType, c.name))
                    array.put(item)
                }
                val out = JSObject()
                out.put("devices", array)
                call.resolve(out)
            }, 900L)
        }
        serviceTypes.forEach { type ->
            val listener = object : NsdManager.DiscoveryListener {
                override fun onDiscoveryStarted(serviceType: String) = Unit
                override fun onServiceFound(info: NsdServiceInfo) {
                    try {
                        manager.resolveService(info, object : NsdManager.ResolveListener {
                            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) = Unit
                            override fun onServiceResolved(resolved: NsdServiceInfo) {
                                val ip = resolved.host?.hostAddress ?: return
                                val id = "${resolved.serviceName}|${resolved.serviceType}|$ip|${resolved.port}"
                                discovered[id] = Candidate(id, resolved.serviceName, resolved.serviceType, ip, resolved.port)
                            }
                        })
                    } catch (_: Exception) {}
                }
                override fun onServiceLost(serviceInfo: NsdServiceInfo) = Unit
                override fun onDiscoveryStopped(serviceType: String) = Unit
                override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                    try { manager.stopServiceDiscovery(this) } catch (_: Exception) {}
                }
                override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) = Unit
            }
            listeners.add(listener)
            try { manager.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, listener) }
            catch (_: Exception) { }
        }
        handler.postDelayed({ finish() }, 6500L)
    }

    @PluginMethod
    fun pair(call: PluginCall) {
        val id = call.getString("deviceId")
        val candidate = id?.let { discovered[it] }
        if (candidate == null) {
            call.reject("El televisor ya no está en la lista de dispositivos detectados. Vuelve a buscar.")
            return
        }
        val type = candidate.serviceType.lowercase()
        when {
            type.contains("webos") -> pairLg(candidate, call)
            type.contains("samsung") -> pairSamsung(candidate, call)
            else -> call.reject("Se detectó el servicio, pero todavía no hay un adaptador de vinculación para esta plataforma.")
        }
    }

    private fun pairLg(c: Candidate, call: PluginCall) {
        val connectionId = UUID.randomUUID().toString()
        val request = Request.Builder().url("ws://${c.address}:3000").build()
        val listener = object : WebSocketListener() {
            private var finished = false
            override fun onOpen(ws: WebSocket, response: Response) {
                val manifest = JSONObject()
                    .put("manifest", JSONObject()
                        .put("manifestVersion", 1)
                        .put("appVersion", "1.0")
                        .put("signed", JSONObject()
                            .put("created", "20261107")
                            .put("appId", "com.aureontv.controlhub")
                            .put("vendorId", "AUREON")
                            .put("localizedAppNames", JSONObject().put("es", "AUREON TV").put("en", "AUREON TV"))
                            .put("localizedVendorNames", JSONObject().put("es", "AUREON").put("en", "AUREON"))
                            .put("permissions", org.json.JSONArray(listOf(
                                "CONTROL_AUDIO", "CONTROL_INPUT_TEXT", "CONTROL_MOUSE_AND_KEYBOARD",
                                "CONTROL_POWER", "READ_CURRENT_CHANNEL", "READ_RUNNING_APPS",
                                "WRITE_NOTIFICATION_TOAST", "READ_NOTIFICATIONS"
                            )))
                        )
                    )
                    .put("type", "register")
                ws.send(manifest.toString())
            }
            override fun onMessage(ws: WebSocket, text: String) {
                try {
                    val msg = JSONObject(text)
                    val type = msg.optString("type")
                    if (type == "registered" || (type == "response" && msg.optJSONObject("payload")?.optString("pairingType") != null)) {
                        if (!finished) {
                            finished = true
                            sessions[connectionId] = Session("lg", ws, true)
                            val out = JSObject()
                            out.put("paired", true)
                            out.put("connectionId", connectionId)
                            out.put("capabilities", capabilities())
                            call.resolve(out)
                        }
                    } else if (type == "error") {
                        fail("El televisor LG rechazó la vinculación. Revisa la solicitud en la pantalla del TV.")
                    }
                } catch (_: Exception) {}
            }
            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                fail("No se pudo conectar con LG webOS por el puerto 3000. Comprueba que LG Connect Apps esté activado y que el modelo admita este protocolo.")
            }
            private fun fail(message: String) {
                if (!finished) { finished = true; call.reject(message) }
            }
        }
        client.newWebSocket(request, listener)
    }

    private fun pairSamsung(c: Candidate, call: PluginCall) {
        // Use the non-TLS legacy endpoint only. Never disable certificate validation.
        val encodedName = Base64.encodeToString("AUREON TV".toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
        val connectionId = UUID.randomUUID().toString()
        val request = Request.Builder()
            .url("ws://${c.address}:8001/api/v2/channels/samsung.remote.control?name=$encodedName")
            .build()
        val listener = object : WebSocketListener() {
            private var finished = false
            override fun onMessage(ws: WebSocket, text: String) {
                try {
                    val msg = JSONObject(text)
                    val event = msg.optString("event")
                    if (event == "ms.channel.connect") {
                        finished = true
                        sessions[connectionId] = Session("samsung", ws, true)
                        val out = JSObject()
                        out.put("paired", true)
                        out.put("connectionId", connectionId)
                        out.put("capabilities", capabilities())
                        call.resolve(out)
                    } else if (event == "ms.channel.unauthorized") {
                        fail("El televisor Samsung no autorizó la conexión. Acepta la solicitud en la pantalla del TV y vuelve a intentar.")
                    }
                } catch (_: Exception) {}
            }
            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                fail("No se pudo abrir el canal Samsung sin cifrar (puerto 8001). Este modelo puede exigir WSS/puerto 8002; AUREON no desactiva la validación TLS, así que aún no es compatible con ese modo.")
            }
            private fun fail(message: String) {
                if (!finished) { finished = true; call.reject(message) }
            }
        }
        client.newWebSocket(request, listener)
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
            "volume_up" -> "VOLUMEUP"
            "volume_down" -> "VOLUMEDOWN"
            "play_pause" -> "PLAY"
            else -> null
        }
        if (key == null) { call.reject("Orden no reconocida."); return }
        val payload = if (session.platform == "lg") {
            JSONObject().put("type", "request")
                .put("id", "aureon-${UUID.randomUUID()}")
                .put("uri", "ssap://com.webos.service.networkinput/sendKey")
                .put("payload", JSONObject().put("key", key))
        } else {
            JSONObject().put("method", "ms.remote.control")
                .put("params", JSONObject().put("Cmd", "Click").put("DataOfCmd", "KEY_$key")
                    .put("Option", "false").put("TypeOfRemote", "SendRemoteKey"))
        }
        val accepted = session.socket.send(payload.toString())
        if (!accepted) { call.reject("La conexión con el televisor se cerró; vuelve a vincularlo."); return }
        val out = JSObject()
        out.put("accepted", true)
        call.resolve(out)
    }

    @PluginMethod
    fun unpair(call: PluginCall) {
        val id = call.getString("connectionId")
        id?.let { sessions.remove(it)?.socket?.close(1000, "AUREON desvinculado") }
        call.resolve()
    }

    override fun handleOnDestroy() {
        sessions.values.forEach { try { it.socket.close(1000, "App cerrada") } catch (_: Exception) {} }
        sessions.clear()
        client.dispatcher.executorService.shutdown()
        super.handleOnDestroy()
    }

    private fun manufacturer(type: String, name: String): String {
        val value = (type + " " + name).lowercase()
        return when {
            value.contains("webos") -> "LG"
            value.contains("samsung") -> "Samsung"
            else -> ""
        }
    }

    private fun capabilities(): JSArray = JSArray().apply {
        listOf("power", "mute", "home", "back", "menu", "up", "down", "left", "right",
            "select", "volume_up", "volume_down", "play_pause").forEach { put(it) }
    }
}
