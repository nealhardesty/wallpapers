package com.roadwaffle.wallpapers

import android.webkit.WebResourceResponse
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * The page's bing.json, made natively: the same shape tools/bing.mjs writes
 * for served sites (SPEC §4.6), so the web code needs no Android case. A
 * page can't fetch Bing's archive itself (no CORS), but the app can.
 * Kept for an hour.
 */
object BingJson {
    private const val ARCHIVE = "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=en-US"
    private var cached: Pair<Long, ByteArray>? = null

    @Synchronized
    fun response(): WebResourceResponse {
        val now = System.currentTimeMillis()
        val body = cached?.takeIf { now - it.first < 3_600_000 }?.second
            ?: runCatching { fetch() }.getOrNull()?.also { cached = now to it }
            ?: return WebResourceResponse("application/json", "utf-8", 503, "Bing unavailable", null, ByteArrayInputStream(ByteArray(0)))
        return WebResourceResponse("application/json", "utf-8", ByteArrayInputStream(body))
    }

    private fun fetch(): ByteArray {
        val connection = URL(ARCHIVE).openConnection() as HttpURLConnection
        connection.connectTimeout = 8000
        connection.readTimeout = 8000
        try {
            val images = JSONObject(connection.inputStream.bufferedReader().readText()).getJSONArray("images")
            val kept = JSONArray()
            for (i in 0 until images.length()) {
                val image = images.getJSONObject(i)
                val url = image.getString("url")
                if (!url.startsWith("/th?id=")) continue
                kept.put(JSONObject().apply {
                    for (key in listOf("copyright", "copyrightlink", "startdate")) put(key, image.optString(key))
                    put("url", url)
                })
            }
            return JSONObject().put("images", kept).toString().toByteArray()
        } finally {
            connection.disconnect()
        }
    }
}
