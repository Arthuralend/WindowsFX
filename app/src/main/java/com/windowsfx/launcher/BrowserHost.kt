package com.windowsfx.launcher

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import android.os.Environment
import android.os.Message
import android.util.Base64
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * Browser tabs of the WindowsFX browser: real Android WebViews (the Chromium engine)
 * laid over the browser window of the web desktop.
 */
@SuppressLint("SetJavaScriptEnabled")
class BrowserHost(private val act: MainActivity, private val layer: FrameLayout) {

    private val views = HashMap<String, WebView>()
    private val desktopMode = HashMap<String, Boolean>()
    private var mobileUa: String? = null

    private fun ev(id: String, type: String, extra: JSONObject = JSONObject()) {
        act.emit("web", extra.put("id", id).put("type", type))
    }

    fun create(id: String, url: String) {
        if (views.containsKey(id)) return
        val w = FxWebView(act)
        val s = w.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.loadWithOverviewMode = true
        s.useWideViewPort = true
        s.builtInZoomControls = true
        s.displayZoomControls = false
        s.setSupportMultipleWindows(true)
        s.javaScriptCanOpenWindowsAutomatically = true
        s.mediaPlaybackRequiresUserGesture = false
        s.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        if (mobileUa == null) mobileUa = s.userAgentString
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, true)
        w.visibility = View.GONE
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                val u = req.url
                val scheme = u.scheme ?: return false
                if (scheme == "http" || scheme == "https" || scheme == "about" || scheme == "data" || scheme == "blob") return false
                // tel:, mailto:, intent:, market: … go to the matching Android app
                try {
                    val i = if (scheme == "intent") Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME) else Intent(Intent.ACTION_VIEW, u)
                    act.apps.start(act, i, inWindow = true)
                } catch (_: Exception) {
                }
                return true
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                ev(id, "start", JSONObject().put("url", url))
                nav(id, view)
            }

            override fun onPageFinished(view: WebView, url: String) {
                ev(id, "finish", JSONObject().put("url", url).put("title", view.title ?: ""))
                nav(id, view)
            }

            override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
                ev(id, "url", JSONObject().put("url", url))
                nav(id, view)
            }
        }
        w.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, p: Int) = ev(id, "progress", JSONObject().put("p", p))
            override fun onReceivedTitle(view: WebView, title: String) = ev(id, "title", JSONObject().put("title", title))
            override fun onReceivedIcon(view: WebView, icon: Bitmap) {
                val out = ByteArrayOutputStream()
                Bitmap.createScaledBitmap(icon, 32, 32, true).compress(Bitmap.CompressFormat.PNG, 100, out)
                ev(id, "icon", JSONObject().put("icon", "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)))
            }

            override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
                // target=_blank / window.open → ask the web side for a new tab, then hand it the transport
                val newId = "tab" + System.nanoTime().toString(36)
                create(newId, "")
                val nw = views[newId] ?: return false
                (resultMsg.obj as WebView.WebViewTransport).webView = nw
                resultMsg.sendToTarget()
                ev(id, "newtab", JSONObject().put("newId", newId))
                return true
            }

            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean =
                act.showFileChooser(cb, params)

            override fun onPermissionRequest(request: PermissionRequest) = act.handlePermission(request)

            private var custom: View? = null
            private var customCb: CustomViewCallback? = null
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                custom = view
                customCb = callback
                act.showFullscreen(view)
            }

            override fun onHideCustomView() {
                act.hideFullscreen()
                customCb?.onCustomViewHidden()
                custom = null
            }
        }
        w.setDownloadListener { dl, ua, cd, mime, _ ->
            try {
                if (dl.startsWith("blob:") || dl.startsWith("data:")) {
                    ev(id, "toast", JSONObject().put("msg", "download-unsupported"))
                    return@setDownloadListener
                }
                val name = URLUtil.guessFileName(dl, cd, mime)
                val req = DownloadManager.Request(Uri.parse(dl))
                    .setMimeType(mime)
                    .addRequestHeader("User-Agent", ua)
                    .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(dl) ?: "")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
                (act.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
                ev(id, "download", JSONObject().put("name", name))
            } catch (e: Exception) {
                ev(id, "toast", JSONObject().put("msg", "download-failed"))
            }
        }
        views[id] = w
        layer.addView(w, FrameLayout.LayoutParams(1, 1))
        if (url.isNotEmpty()) w.loadUrl(url)
    }

    private fun nav(id: String, w: WebView) {
        ev(id, "nav", JSONObject().put("back", w.canGoBack()).put("fwd", w.canGoForward()).put("url", w.url ?: ""))
    }

    fun navigate(id: String, url: String) {
        views[id]?.loadUrl(url)
    }

    fun action(id: String, a: String) {
        val w = views[id] ?: return
        when (a) {
            "back" -> if (w.canGoBack()) w.goBack()
            "forward" -> if (w.canGoForward()) w.goForward()
            "reload" -> w.reload()
            "stop" -> w.stopLoading()
            "zoomin" -> w.zoomIn()
            "zoomout" -> w.zoomOut()
            "desktop" -> setDesktop(id, !(desktopMode[id] ?: false))
            "focus" -> w.requestFocus()
        }
    }

    private fun setDesktop(id: String, on: Boolean) {
        val w = views[id] ?: return
        desktopMode[id] = on
        w.settings.userAgentString = if (on)
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
        else mobileUa
        w.reload()
        ev(id, "desktop", JSONObject().put("on", on))
    }

    /** Positions a tab over the browser window. Coordinates are physical pixels of the desktop view. */
    fun bounds(id: String, x: Int, y: Int, w: Int, h: Int, visible: Boolean) {
        val v = views[id] ?: return
        if (!visible || w <= 0 || h <= 0) {
            if (v.visibility != View.GONE) v.visibility = View.GONE
            return
        }
        val lp = v.layoutParams as FrameLayout.LayoutParams
        if (lp.leftMargin != x || lp.topMargin != y || lp.width != w || lp.height != h) {
            lp.leftMargin = x
            lp.topMargin = y
            lp.width = w
            lp.height = h
            v.layoutParams = lp
        }
        if (v.visibility != View.VISIBLE) v.visibility = View.VISIBLE
    }

    /** A JPEG picture of the tab, shown in its place while it is covered by other windows. */
    fun snapshot(id: String) {
        val v = views[id] ?: return
        if (v.width <= 0 || v.height <= 0) return
        try {
            val scale = 0.5f
            val bmp = Bitmap.createBitmap((v.width * scale).toInt().coerceAtLeast(1), (v.height * scale).toInt().coerceAtLeast(1), Bitmap.Config.RGB_565)
            val c = Canvas(bmp)
            c.scale(scale, scale)
            c.translate(-v.scrollX.toFloat(), -v.scrollY.toFloat())
            v.draw(c)
            val out = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, 70, out)
            ev(id, "snapshot", JSONObject().put("img", "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)))
        } catch (_: Throwable) {
        }
    }

    fun destroy(id: String) {
        val v = views.remove(id) ?: return
        desktopMode.remove(id)
        (v.parent as? ViewGroup)?.removeView(v)
        v.destroy()
    }

    fun hideAll() {
        views.values.forEach { it.visibility = View.GONE }
    }

    fun onPause() = views.values.forEach { it.onPause() }
    fun onResume() = views.values.forEach { it.onResume() }
}
