package com.roadwaffle.wallpapers

import android.app.Presentation
import android.app.WallpaperColors
import android.content.Intent
import android.graphics.Color
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.os.Build
import android.service.wallpaper.WallpaperService
import android.view.MotionEvent
import android.view.SurfaceHolder
import android.view.WindowManager
import android.webkit.WebView

/**
 * The live wallpaper (SPEC §6). A wallpaper gets a bare Surface, and a
 * WebView can't draw onto one, so the engine makes a private VirtualDisplay
 * whose output *is* that surface, and shows a Presentation holding the
 * WebView on it. The system composites the WebView straight into the
 * wallpaper: no copies, and no frames at all while the page is idle.
 * Render scale works as in a browser: the page lowers its own pixel ratio.
 */
class LiveWallpaper : WallpaperService() {
    override fun onCreateEngine(): Engine = WebEngine()

    inner class WebEngine : Engine() {
        private var display: VirtualDisplay? = null
        private var presentation: Presentation? = null
        private var web: WebView? = null
        private var power: Power? = null
        private var accent: Int? = null
        private var loaded = false

        override fun onCreate(holder: SurfaceHolder) {
            setTouchEventsEnabled(true)
            setOffsetNotificationsEnabled(true)
            power = Power(this@LiveWallpaper) { state -> push("WP.power($state)") }.also { it.start() }
        }

        override fun onSurfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
            val dpi = resources.displayMetrics.densityDpi
            val existing = display
            if (existing != null) {
                existing.resize(width, height, dpi)
                existing.surface = holder.surface
                return
            }
            val virtual = getSystemService(DisplayManager::class.java)
                .createVirtualDisplay("wallpapers", width, height, dpi, holder.surface, 0)
            display = virtual
            val view = webView(
                Bridge(onAccent = ::setAccent),
                onLoaded = {
                    loaded = true
                    power?.let { push("WP.power(${it.state()})") }
                    push("WP.power({ hidden: ${!isVisible}, preview: $isPreview })")
                },
                external = { uri ->
                    // A tap on a link on the home screen opens the browser.
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                },
            )
            web = view
            presentation = Presentation(this@LiveWallpaper, virtual.display).apply {
                // A window made from a service isn't hardware accelerated
                // by default, and WebView draws nothing without it.
                window?.setFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED, WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED)
                setContentView(view)
                show()
            }
            view.loadUrl("$ORIGIN/index.html?host=android")
        }

        override fun onVisibilityChanged(visible: Boolean) = push("WP.power({ hidden: ${!visible} })")

        // The home screen's touches, on the wallpaper's own coordinates.
        override fun onTouchEvent(event: MotionEvent) {
            web?.dispatchTouchEvent(event)
        }

        // Swiping between home screens: 0 at the first, 1 at the last.
        override fun onOffsetsChanged(xOffset: Float, yOffset: Float, xStep: Float, yStep: Float, xPixels: Int, yPixels: Int) =
            push("WP.scroll($xOffset)")

        override fun onComputeColors(): WallpaperColors? =
            accent?.let { if (Build.VERSION.SDK_INT >= 27) WallpaperColors(Color.valueOf(it), null, null) else null }

        override fun onSurfaceDestroyed(holder: SurfaceHolder) = release()

        override fun onDestroy() {
            power?.stop()
            release()
        }

        private fun push(code: String) {
            if (loaded) web?.js(code)
        }

        private fun setAccent(color: String) {
            accent = runCatching { Color.parseColor(color) }.getOrNull() ?: return
            if (Build.VERSION.SDK_INT >= 27) notifyColorsChanged()
        }

        private fun release() {
            presentation?.dismiss()
            web?.destroy()
            display?.release()
            presentation = null
            web = null
            display = null
            loaded = false
        }
    }
}
