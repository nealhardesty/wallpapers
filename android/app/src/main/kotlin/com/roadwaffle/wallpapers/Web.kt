package com.roadwaffle.wallpapers

import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.ApplicationInfo
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.graphics.Color
import android.net.Uri
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

// The web app is served from the APK's assets at a fixed https origin, so
// every WebView in the app shares one localStorage: the wallpaper and the
// settings screen see the same settings (SPEC §6.2).
const val HOST = "appassets.androidplatform.net"
const val ORIGIN = "https://$HOST"

/**
 * A WebView for our own pages. Nothing outside our origin loads in it: a
 * link (Bing's photo credit, say) goes to [external] instead. The page's
 * bing.json is made on the spot from Bing (see [BingJson]), so the Bing
 * wallpaper works the way it does on a served site.
 */
@SuppressLint("SetJavaScriptEnabled")
fun Context.webView(bridge: Bridge, onLoaded: () -> Unit, external: (Uri) -> Unit): WebView {
    val assets = WebViewAssetLoader.Builder()
        .setDomain(HOST)
        .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
        .build()
    // Debug builds can be inspected from chrome://inspect, which is also how
    // make android-bench drives the wallpaper.
    WebView.setWebContentsDebuggingEnabled(applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0)
    return WebView(this).apply {
        setBackgroundColor(Color.BLACK)
        overScrollMode = View.OVER_SCROLL_NEVER
        isVerticalScrollBarEnabled = false
        isHorizontalScrollBarEnabled = false
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        // Jellyfin (SPEC §10.21): a home server is usually plain http on the
        // LAN, and our https origin would block its API as mixed content.
        // (Its video can't be let through this way; MediaProxy carries it.)
        // Only the user's own server is ever asked, and the page's CSP still
        // allows no script from anywhere but here.
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        // Muted is the default; "start with sound" is the user's choice.
        settings.mediaPlaybackRequiresUserGesture = false
        addJavascriptInterface(bridge, "WallpapersApp")
        // The page's console, in logcat under "Wallpapers" (make android-logcat).
        webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                val level = when (message.messageLevel()) {
                    ConsoleMessage.MessageLevel.ERROR -> Log.ERROR
                    ConsoleMessage.MessageLevel.WARNING -> Log.WARN
                    else -> Log.INFO
                }
                Log.println(level, "Wallpapers", "${message.message()} (${message.sourceId().substringAfterLast('/')}:${message.lineNumber()})")
                return true
            }
        }
        webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val url = request.url
                if (url.host == HOST && url.path == "/bing.json") return BingJson.response()
                if (url.host == HOST && MediaProxy.handles(request)) return MediaProxy.response(request)
                return assets.shouldInterceptRequest(url)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == HOST) return false
                external(request.url)
                return true
            }

            override fun onPageFinished(view: WebView, url: String) = onLoaded()
        }
    }
}

/** Calls into the page, quietly: before it has loaded, WP isn't there yet. */
fun WebView.js(code: String) = evaluateJavascript("try { $code } catch (e) {}", null)
