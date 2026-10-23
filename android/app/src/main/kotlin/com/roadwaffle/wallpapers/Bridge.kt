package com.roadwaffle.wallpapers

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface

/**
 * What the page can ask of the app, as window.WallpapersApp. Calls arrive on
 * a WebView thread, so each hops to the main thread.
 */
class Bridge(
    private val onAccent: (String) -> Unit = {},
    private val onSetWallpaper: (() -> Unit)? = null,
    private val onLocate: (() -> Unit)? = null,
    private val localNetwork: ((ask: Boolean) -> Boolean)? = null,
) {
    private val main = Handler(Looper.getMainLooper())

    /** The wallpaper's accent, for Material You's colours. */
    @JavascriptInterface fun setAccent(color: String) {
        main.post { onAccent(color) }
    }

    @JavascriptInterface fun canSetWallpaper(): Boolean = onSetWallpaper != null

    @JavascriptInterface fun setWallpaper() {
        onSetWallpaper?.let { main.post(it) }
    }

    /** "Use my location" (SPEC §10.1): the answer comes back as WP.located({...}). */
    @JavascriptInterface fun canLocate(): Boolean = onLocate != null

    @JavascriptInterface fun locate() {
        onLocate?.let { main.post(it) }
    }

    /** Jellyfin (SPEC §10.21): does reaching the home network still need Android 17's permission? */
    @JavascriptInterface fun needsLocalNetwork(): Boolean = localNetwork?.invoke(false) ?: false

    /** Ask for it; the answer comes back as WP.localNetworkAnswered(granted). */
    @JavascriptInterface fun askLocalNetwork() {
        localNetwork?.let { main.post { it(true) } }
    }
}
