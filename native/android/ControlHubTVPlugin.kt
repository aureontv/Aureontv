package com.controlhub.tv

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Handler
import android.os.Looper
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Initial Android DNS-SD discovery layer.
 * Discovery is not pairing: commands remain disabled until vendor adapters
 * implement and verify authenticated sessions.
 */
@CapacitorPlugin(name = "ControlHubTV")
class ControlHubTVPlugin : Plugin() {
    private val discovered = ConcurrentHashMap<String, NsdServiceInfo>()
    private val serviceTypes = listOf(
        "_webos._tcp.",
        "_samsungmsf._tcp.",
        "_googlecast._tcp.",
        "_androidtvremote2._tcp."
    )

    @PluginMethod
    fun discover(call: PluginCall) {
        val manager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
        discovered.clear()
        val active = mutableListOf<NsdManager.DiscoveryListener>()
        val completed = AtomicBoolean(false)
        val handler = Handler(Looper.getMainLooper())

        fun finishScan() {
            if (!completed.compareAndSet(false, true)) return
            active.toList().forEach { listener ->
                try { manager.stopServiceDiscovery(listener) } catch (_: Exception) { }
            }
            active.clear()
            // Allow asynchronous resolveService callbacks to finish.
            handler.postDelayed({
                val devices = JSArray()
                discovered.values.forEach { info ->
                    val item = JSObject()
                    item.put("id", info.serviceName + "|" + info.serviceType)
                    item.put("name", info.serviceName)
                    item.put("platform", info.serviceType)
                    item.put("protocol", "DNS-SD")
                    info.host?.hostAddress?.let { item.put("address", it) }
                    item.put("port", info.port)
                    devices.put(item)
                }
                val response = JSObject()
                response.put("devices", devices)
                call.resolve(response)
            }, 700L)
        }

        serviceTypes.forEach { type ->
            val listener = object : NsdManager.DiscoveryListener {
                override fun onDiscoveryStarted(serviceType: String) = Unit
                override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                    try {
                        manager.resolveService(serviceInfo, object : NsdManager.ResolveListener {
                            override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) = Unit
                            override fun onServiceResolved(info: NsdServiceInfo) {
                                discovered[info.serviceName + "|" + info.serviceType] = info
                            }
                        })
                    } catch (_: Exception) { }
                }
                override fun onServiceLost(serviceInfo: NsdServiceInfo) = Unit
                override fun onDiscoveryStopped(serviceType: String) = Unit
                override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) = Unit
                override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) = Unit
            }
            active.add(listener)
            try {
                manager.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, listener)
            } catch (_: Exception) { }
        }

        handler.postDelayed({ finishScan() }, 5000L)
    }

    @PluginMethod
    fun pair(call: PluginCall) {
        call.reject("El emparejamiento autenticado del fabricante aún no está implementado. No se ha vinculado ningún televisor.")
    }

    @PluginMethod
    fun sendCommand(call: PluginCall) {
        call.reject("No hay un adaptador autenticado conectado. No se ha enviado ningún comando al televisor.")
    }

    @PluginMethod
    fun unpair(call: PluginCall) {
        call.resolve()
    }
}
