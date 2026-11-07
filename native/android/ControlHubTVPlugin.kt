package com.controlhub.tv

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.ConcurrentHashMap

/**
 * First Android transport layer for Control Hub.
 *
 * IMPORTANT: NSD results are service advertisements, not proof that a TV
 * supports remote control. Pairing and commands must be implemented by
 * model-specific authenticated adapters before they can report success.
 */
@CapacitorPlugin(name = "ControlHubTV")
class ControlHubTVPlugin : Plugin() {
    private val discovered = ConcurrentHashMap<String, NsdServiceInfo>()
    private val listeners = mutableListOf<NsdManager.DiscoveryListener>()
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
        val results = JSArray()
        val pending = serviceTypes.size
        var finished = 0

        fun finishOne() {
            synchronized(this) {
                finished++
                if (finished == pending) {
                    discovered.values.forEach { info ->
                        val item = JSObject()
                        item.put("id", info.serviceName + "|" + info.serviceType)
                        item.put("name", info.serviceName)
                        item.put("platform", info.serviceType)
                        item.put("protocol", "DNS-SD")
                        item.put("address", info.host?.hostAddress)
                        item.put("port", info.port)
                        results.put(item)
                    }
                    val response = JSObject()
                    response.put("devices", results)
                    call.resolve(response)
                }
            }
        }

        serviceTypes.forEach { type ->
            val listener = object : NsdManager.DiscoveryListener {
                override fun onDiscoveryStarted(serviceType: String) = Unit
                override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                    manager.resolveService(serviceInfo, object : NsdManager.ResolveListener {
                        override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) = Unit
                        override fun onServiceResolved(info: NsdServiceInfo) {
                            val key = info.serviceName + "|" + info.serviceType
                            discovered[key] = info
                        }
                    })
                }
                override fun onServiceLost(serviceInfo: NsdServiceInfo) = Unit
                override fun onDiscoveryStopped(serviceType: String) = finishOne()
                override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                    manager.stopServiceDiscovery(this)
                    finishOne()
                }
                override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                    manager.stopServiceDiscovery(this)
                }
            }
            listeners.add(listener)
            try {
                manager.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, listener)
            } catch (_: Exception) {
                finishOne()
            }
        }

        // Keep discovery bounded; stop all listeners after a short scan.
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            listeners.toList().forEach { listener ->
                try { manager.stopServiceDiscovery(listener) } catch (_: Exception) { }
            }
            listeners.clear()
        }, 5000L)
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
