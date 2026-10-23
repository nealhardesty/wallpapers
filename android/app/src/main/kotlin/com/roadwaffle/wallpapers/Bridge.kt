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
}
