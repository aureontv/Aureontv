package com.controlhub.ir

import android.hardware.ConsumerIrManager
import android.content.pm.PackageManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "AureonIR")
class AureonIRPlugin : Plugin() {
    private fun irManager(): ConsumerIrManager? =
        context.getSystemService(android.content.Context.CONSUMER_IR_SERVICE) as? ConsumerIrManager

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val manager = irManager()
        val featureReported = try {
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_CONSUMER_IR)
        } catch (_: Exception) {
            false
        }
        // Some Android vendor builds omit the optional package feature flag even
        // when ConsumerIrManager can successfully drive the physical IR emitter.
        // The hardware API is the authoritative runtime check; do not reject a
        // Redmi/Xiaomi device solely because its feature flag is missing.
        val emitterAvailable = try {
            manager?.hasIrEmitter() == true
        } catch (_: Exception) {
            false
        }
        val available = emitterAvailable
        val result = JSObject()
        result.put("available", available)
        result.put("systemFeatureReported", featureReported)
        result.put("serviceAvailable", manager != null)
        result.put("emitterAvailable", emitterAvailable)
        result.put("frequencyHz", 38000)
        val ranges = JSArray()
        if (emitterAvailable && manager != null) {
            try {
                manager.carrierFrequencies?.forEach { range ->
                    val item = JSObject()
                    item.put("minHz", range.minFrequency)
                    item.put("maxHz", range.maxFrequency)
                    ranges.put(item)
                }
            } catch (_: Exception) {}
        }
        result.put("frequencyRanges", ranges)
        call.resolve(result)
    }

    @PluginMethod
    fun transmit(call: PluginCall) {
        val manager = irManager()
        if (manager == null || !manager.hasIrEmitter()) {
            call.reject("Este teléfono no tiene un emisor infrarrojo disponible para AUREON TV.")
            return
        }

        val manufacturer = call.getString("manufacturer", "LG")?.uppercase() ?: "LG"
        if (manufacturer != "LG") {
            call.reject("El perfil infrarrojo disponible en esta versión es LG. Otras marcas se añadirán después de validarlas.")
            return
        }

        val command = call.getString("command") ?: run {
            call.reject("Falta el comando infrarrojo.")
            return
        }
        val code = lgCommands[command]
        if (code == null) {
            call.reject("Este botón todavía no tiene un código infrarrojo LG configurado.")
            return
        }

        val frequency = 38000
        val supportsFrequency = try {
            manager.carrierFrequencies?.any { frequency in it.minFrequency..it.maxFrequency } ?: true
        } catch (_: Exception) { true }
        if (!supportsFrequency) {
            call.reject("El emisor infrarrojo del teléfono no informa compatibilidad con 38 kHz.")
            return
        }

        // LG NEC: address 04, inverse FB, command, inverse command.
        val bytes = intArrayOf(0x04, 0xFB, code, code xor 0xFF)
        val pattern = ArrayList<Int>(70)
        pattern.add(9000)
        pattern.add(4500)
        bytes.forEach { value ->
            for (bit in 0 until 8) {
                pattern.add(560)
                pattern.add(if (((value shr bit) and 1) == 1) 1690 else 560)
            }
        }
        pattern.add(560)

        try {
            manager.transmit(frequency, pattern.toIntArray())
            val result = JSObject()
            result.put("accepted", true)
            result.put("manufacturer", "LG")
            result.put("command", command)
            result.put("frequencyHz", frequency)
            call.resolve(result)
        } catch (error: Exception) {
            call.reject("Android no pudo transmitir la señal infrarroja: ${error.message}", error)
        }
    }

    companion object {
        private val lgCommands = mapOf(
            "power" to 0x08,
            "mute" to 0x09,
            "volume_up" to 0x02,
            "volume_down" to 0x03,
            "channel_up" to 0x00,
            "channel_down" to 0x01,
            "up" to 0x40,
            "down" to 0x41,
            "left" to 0x07,
            "right" to 0x06,
            "select" to 0x44,
            "home" to 0x7C,
            "menu" to 0x43,
            "input" to 0x0B
        )
    }
}
