package com.roadwaffle.wallpapers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import org.json.JSONObject

/**
 * The device's power state, for the page's power policy (SPEC §4.8):
 * battery level and charging, battery saver, and heat (Android 10+).
 * [onChange] gets the JSON that WP.power() takes, whenever any of it changes.
 */
class Power(private val context: Context, private val onChange: (String) -> Unit) {
    private val power = context.getSystemService(PowerManager::class.java)
    private var battery = JSONObject()
    private var thermal = "none"

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == Intent.ACTION_BATTERY_CHANGED) readBattery(intent)
            onChange(state())
        }
    }

    private val thermalListener: Any? = if (Build.VERSION.SDK_INT >= 29) {
        PowerManager.OnThermalStatusChangedListener { status ->
            thermal = THERMAL.getOrElse(status) { "none" }
            onChange(state())
        }
    } else null

    fun start() {
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_BATTERY_CHANGED)
            addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
        }
        // Battery changes are sticky: registering returns the current state.
        context.registerReceiver(receiver, filter)?.let(::readBattery)
        if (Build.VERSION.SDK_INT >= 29) {
            thermal = THERMAL.getOrElse(power.currentThermalStatus) { "none" }
            power.addThermalStatusListener(thermalListener as PowerManager.OnThermalStatusChangedListener)
        }
    }

    fun stop() {
        runCatching { context.unregisterReceiver(receiver) }
        if (Build.VERSION.SDK_INT >= 29) power.removeThermalStatusListener(thermalListener as PowerManager.OnThermalStatusChangedListener)
    }

    fun state(): String = JSONObject()
        .put("battery", battery)
        .put("saver", power.isPowerSaveMode)
        .put("thermal", thermal)
        .toString()

    private fun readBattery(intent: Intent) {
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        val plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)
        battery = JSONObject()
            .put("charging", plugged != 0)
            .put("level", if (level >= 0 && scale > 0) level.toDouble() / scale else 1.0)
    }

    private companion object {
        val THERMAL = listOf("none", "light", "moderate", "severe", "critical", "emergency", "shutdown")
    }
}
