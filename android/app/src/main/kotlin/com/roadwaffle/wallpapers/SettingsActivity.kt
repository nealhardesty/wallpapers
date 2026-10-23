package com.roadwaffle.wallpapers

import android.app.Activity
import android.app.WallpaperManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.webkit.WebView

/**
 * The launcher icon and the wallpaper's Settings: the same page with the
 * panel open (SPEC §6.3). It shares localStorage with the wallpaper, whose
 * page picks up changes through storage events. The panel also offers
 * "Set as wallpaper" here.
 */
class SettingsActivity : Activity() {
    private lateinit var web: WebView

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        web = webView(
            Bridge(onSetWallpaper = ::setAsWallpaper),
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
}
