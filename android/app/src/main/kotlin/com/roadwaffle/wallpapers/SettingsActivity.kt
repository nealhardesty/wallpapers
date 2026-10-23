package com.roadwaffle.wallpapers

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.WallpaperManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import java.util.Locale

/**
 * The launcher icon and the wallpaper's Settings: the same page with the
 * panel open (SPEC §6.3). It shares localStorage with the wallpaper, whose
 * page picks up changes through storage events. The panel also offers
 * "Set as wallpaper" here, and "Use my location" for wallpapers that need
 * one: the phone's last known coarse position, which the live wallpaper then
 * reads from the shared storage. Nothing asks from the background.
 */
class SettingsActivity : Activity() {
    private lateinit var web: WebView

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        web = webView(
            Bridge(onSetWallpaper = ::setAsWallpaper, onLocate = ::locate),
            onLoaded = { web.js("WP.power({ hidden: false })") },
            external = { uri -> runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) } },
        )
        setContentView(web)
        if (state != null) web.restoreState(state) else web.loadUrl("$ORIGIN/index.html?host=android&panel=open")
    }

    private fun setAsWallpaper() {
        startActivity(Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER)
            .putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, ComponentName(this, LiveWallpaper::class.java)))
    }

    private fun locate() {
        if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) sendLocation()
        else requestPermissions(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION), LOCATE)
    }

    override fun onRequestPermissionsResult(code: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, permissions, results)
        if (code != LOCATE) return
        if (results.firstOrNull() == PackageManager.PERMISSION_GRANTED) sendLocation()
        else web.js("WP.located?.({ error: 'denied' })")
    }

    // The newest last-known position from any provider; failing that, one
    // fresh network fix (API 30+). Rounded here too, before it reaches JS.
    @SuppressLint("MissingPermission")
    private fun sendLocation() {
        val manager = getSystemService(LocationManager::class.java)
        val last = manager.getProviders(true)
            .mapNotNull { runCatching { manager.getLastKnownLocation(it) }.getOrNull() }
            .maxByOrNull { it.time }
        if (last != null) return report(last)
        if (Build.VERSION.SDK_INT >= 30 && manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            manager.getCurrentLocation(LocationManager.NETWORK_PROVIDER, null, mainExecutor) { fix ->
                if (fix != null) report(fix) else web.js("WP.located?.({ error: 'none' })")
            }
        } else {
            web.js("WP.located?.({ error: 'none' })")
        }
    }

    private fun report(location: Location) {
        web.js(String.format(Locale.ROOT, "WP.located?.({ lat: %.1f, lon: %.1f })", location.latitude, location.longitude))
    }

    override fun onSaveInstanceState(state: Bundle) {
        super.onSaveInstanceState(state)
        web.saveState(state)
    }

    override fun onPause() {
        super.onPause()
        web.js("WP.power({ hidden: true })")
    }

    override fun onResume() {
        super.onResume()
        web.js("WP.power({ hidden: false })")
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    private companion object {
        const val LOCATE = 1
    }
}
