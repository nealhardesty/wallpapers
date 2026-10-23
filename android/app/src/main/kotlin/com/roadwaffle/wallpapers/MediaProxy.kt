package com.roadwaffle.wallpapers

import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Jellyfin's video and pictures for the page (SPEC §10.21). The page is https
 * and a home server is usually plain http, and WebView blocks http media as
 * mixed content even when mixed content is allowed (its fetches get through;
 * a <video> doesn't). So on Android the page asks for
 *
 *   https://appassets.androidplatform.net/jellyfin-media/http/<host:port>/<path>?<query>
 *
 * and the app fetches that from the server and streams it back, Range
 * requests included, so seeking and HLS work. Only GETs, only http, and only
 * Jellyfin's media and image paths: it's not a general proxy.
 */
object MediaProxy {
    const val PREFIX = "/jellyfin-media/http/"
    private val HOST = Regex("^[A-Za-z0-9.\\-\\[\\]:]+$")
    private val PATHS = Regex("^/(Videos|videos|Items)/[A-Za-z0-9/._\\-]+$")
    private val FORWARD = listOf("Range", "Accept")
    private val RETURN = listOf("Content-Length", "Content-Range", "Accept-Ranges", "Cache-Control", "Last-Modified", "ETag")

    fun handles(request: WebResourceRequest) = request.method == "GET" && request.url.path?.startsWith(PREFIX) == true

    fun response(request: WebResourceRequest): WebResourceResponse {
        val rest = request.url.encodedPath!!.removePrefix(PREFIX)
        val host = rest.substringBefore('/')
        val path = "/" + rest.substringAfter('/', "")
        if (!HOST.matches(host) || !PATHS.matches(Uri.decode(path))) return failed(400, "Not a Jellyfin media path")
        val target = "http://$host$path" + (request.url.encodedQuery?.let { "?$it" } ?: "")
        return try {
            val connection = URL(target).openConnection() as HttpURLConnection
            connection.connectTimeout = 10_000
            connection.readTimeout = 30_000
            for (name in FORWARD) request.requestHeaders.entries.firstOrNull { it.key.equals(name, true) }?.let { connection.setRequestProperty(name, it.value) }
            val status = connection.responseCode
            val type = connection.contentType ?: "application/octet-stream"
            val headers = RETURN.mapNotNull { name -> connection.getHeaderField(name)?.let { name to it } }.toMap()
            val body = if (status >= 400) connection.errorStream ?: ByteArrayInputStream(ByteArray(0)) else connection.inputStream
            WebResourceResponse(type.substringBefore(';').trim(), null, status, connection.responseMessage?.ifBlank { null } ?: "OK", headers, body)
        } catch (error: Exception) {
            failed(502, "Server unavailable")
        }
    }

    private fun failed(status: Int, reason: String) =
        WebResourceResponse("text/plain", "utf-8", status, reason, null, ByteArrayInputStream(ByteArray(0)))
}
