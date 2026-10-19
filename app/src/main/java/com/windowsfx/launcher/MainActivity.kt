package com.windowsfx.launcher

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.net.URLDecoder

/**
 * WindowsFX host: a full-screen WebView running the desktop (assets/os), plus the native
 * layers the web side cannot do itself — device files, Android apps, the Chromium browser.
 */
class MainActivity : Activity() {

    companion object {
        const val HOST = "appassets.androidplatform.net"
        const val START_URL = "https://$HOST/assets/os/index.html"
    }

    lateinit var web: WebView
        private set
    private lateinit var browserLayer: FrameLayout
    private lateinit var fullLayer: FrameLayout
    lateinit var fs: DeviceFs
        private set
    lateinit var apps: AndroidApps
        private set
    lateinit var browser: BrowserHost
        private set

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPermission: PermissionRequest? = null
    private val pickCallbacks = HashMap<Int, (Uri?) -> Unit>()
    private var nextReq = 2000
    private var pageReady = false

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, i: Intent?) {
            when (i?.action) {
                Intent.ACTION_BATTERY_CHANGED -> emitBattery(i)
                Intent.ACTION_PACKAGE_ADDED, Intent.ACTION_PACKAGE_REMOVED, Intent.ACTION_PACKAGE_CHANGED -> emit("apps", "{}")
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AndroidApps.allowHiddenApi()
        fs = DeviceFs(this)
        apps = AndroidApps(this)
        applyImmersive(true)

        val root = FrameLayout(this)
        root.setBackgroundColor(Color.BLACK)
        web = WebView(this)
        browserLayer = FrameLayout(this)
        fullLayer = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            visibility = View.GONE
        }
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        root.addView(browserLayer, FrameLayout.LayoutParams(-1, -1))
        root.addView(fullLayer, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        browser = BrowserHost(this, browserLayer)

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.allowFileAccess = false
        s.allowContentAccess = true
        s.setSupportZoom(false)
        s.textZoom = 100
        s.useWideViewPort = true
        s.loadWithOverviewMode = false
        s.setSupportMultipleWindows(false)
        web.isVerticalScrollBarEnabled = false
        web.isHorizontalScrollBarEnabled = false
        web.overScrollMode = View.OVER_SCROLL_NEVER
        web.setBackgroundColor(Color.BLACK)
        web.addJavascriptInterface(Bridge(this), "FXNative")

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? =
                serve(req)

            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                // the desktop itself never navigates away; links open in the browser app
                val u = req.url
                if (u.host == HOST) return false
                emit("openurl", JSONObject().put("url", u.toString()).toString())
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                pageReady = true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams) =
                showFileChooser(cb, params)

            override fun onPermissionRequest(request: PermissionRequest) = handlePermission(request)

            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                if (BuildConfig.DEBUG) android.util.Log.d("WFX", "${m.sourceId()}:${m.lineNumber()} ${m.message()}")
                return true
            }
        }

        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val pkgFilter = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_CHANGED)
            addDataScheme("package")
        }
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
            registerReceiver(receiver, pkgFilter, Context.RECEIVER_EXPORTED)
        } else {
            registerReceiver(receiver, filter)
            registerReceiver(receiver, pkgFilter)
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        if (web.url == null) web.loadUrl(START_URL)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        try {
            unregisterReceiver(receiver)
        } catch (_: Exception) {
        }
        web.destroy()
        super.onDestroy()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        browser.onResume()
        applyImmersive(true)
        emit("resume", JSONObject().put("storage", fs.hasAccess()).toString())
    }

    override fun onPause() {
        browser.onPause()
        web.onPause()
        super.onPause()
    }

    /** Home button while the desktop is already open. */
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        emit("home", "{}")
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (fullLayer.visibility == View.VISIBLE) {
            hideFullscreen()
            return
        }
        // the desktop decides: close a menu, go back in the browser, minimise a window…
        web.evaluateJavascript("window.FXHost ? FXHost.back() : false", null)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_META_LEFT || keyCode == KeyEvent.KEYCODE_META_RIGHT) {
            emit("startkey", "{}")
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) applyImmersive(true)
    }

    // ------------------------------------------------------------------ JS events

    /** Sends an event to the web desktop: FXHost.emit(name, data). */
    fun emit(name: String, json: String) {
        runOnUiThread {
            if (!::web.isInitialized) return@runOnUiThread
            web.evaluateJavascript("window.FXHost && FXHost.emit(${JSONObject.quote(name)}, $json)", null)
        }
    }

    fun emit(name: String, obj: JSONObject) = emit(name, obj.toString())

    private fun emitBattery(i: Intent) {
        val level = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = i.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
        val plugged = i.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0
        if (level >= 0) emit("battery", JSONObject().put("level", level.toDouble() / scale).put("charging", plugged))
    }

    // ------------------------------------------------------------------ system bars

    @Suppress("DEPRECATION")
    fun applyImmersive(on: Boolean) {
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(!on)
            window.insetsController?.let {
                if (on) {
                    it.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                    it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                } else it.show(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
            }
        } else {
            window.decorView.systemUiVisibility = if (on) (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN) else 0
        }
        if (Build.VERSION.SDK_INT >= 28) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
    }

    fun showFullscreen(v: View) {
        fullLayer.removeAllViews()
        fullLayer.addView(v, FrameLayout.LayoutParams(-1, -1))
        fullLayer.visibility = View.VISIBLE
    }

    fun hideFullscreen() {
        fullLayer.removeAllViews()
        fullLayer.visibility = View.GONE
    }

    // ------------------------------------------------------------------ pickers & permissions

    fun showFileChooser(cb: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean {
        fileCallback?.onReceiveValue(null)
        fileCallback = cb
        return try {
            val i = params.createIntent()
            if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            @Suppress("DEPRECATION")
            startActivityForResult(i, 1001)
            true
        } catch (_: Exception) {
            fileCallback = null
            false
        }
    }

    fun pick(intent: Intent, done: (Uri?) -> Unit) {
        val code = nextReq++
        pickCallbacks[code] = done
        try {
            @Suppress("DEPRECATION")
            startActivityForResult(intent, code)
        } catch (_: Exception) {
            pickCallbacks.remove(code)
            done(null)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 1001) {
            val cb = fileCallback ?: return
            fileCallback = null
            cb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            return
        }
        pickCallbacks.remove(requestCode)?.invoke(if (resultCode == RESULT_OK) data?.data else null)
    }

    fun handlePermission(request: PermissionRequest) {
        runOnUiThread {
            val needs = mutableListOf<String>()
            for (r in request.resources) {
                if (r == PermissionRequest.RESOURCE_VIDEO_CAPTURE && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) needs.add(Manifest.permission.CAMERA)
                if (r == PermissionRequest.RESOURCE_AUDIO_CAPTURE && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) needs.add(Manifest.permission.RECORD_AUDIO)
            }
            if (needs.isEmpty()) request.grant(request.resources)
            else {
                pendingPermission = request
                requestPermissions(needs.toTypedArray(), 88)
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 88) {
            val req = pendingPermission ?: return
            pendingPermission = null
            if (grantResults.all { it == PackageManager.PERMISSION_GRANTED }) req.grant(req.resources) else req.deny()
        }
        if (requestCode == 77) emit("resume", JSONObject().put("storage", fs.hasAccess()).toString())
    }

    // ------------------------------------------------------------------ local server

    private fun serve(req: WebResourceRequest): WebResourceResponse? {
        val u = req.url
        if (u.host != HOST) return null
        val path = u.encodedPath ?: return null
        return try {
            when {
                path.startsWith("/assets/") -> asset(URLDecoder.decode(path.removePrefix("/assets/"), "UTF-8"))
                path.startsWith("/fs/") -> deviceFile(URLDecoder.decode(path.removePrefix("/fs"), "UTF-8"), req.requestHeaders["Range"] ?: req.requestHeaders["range"])
                path.startsWith("/thumb/") -> thumb(URLDecoder.decode(path.removePrefix("/thumb"), "UTF-8"), u.getQueryParameter("s")?.toIntOrNull() ?: 256)
                path.startsWith("/appicon/") -> {
                    val png = apps.iconPng(URLDecoder.decode(path.removePrefix("/appicon/"), "UTF-8")) ?: return notFound()
                    resp("image/png", ByteArrayInputStream(png), cache = true)
                }
                else -> notFound()
            }
        } catch (_: Exception) {
            notFound()
        }
    }

    private fun mimeOf(name: String): String {
        val e = name.substringAfterLast('.', "").lowercase()
        return DeviceFs.MIME_EXTRA[e] ?: android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(e) ?: "application/octet-stream"
    }

    private fun resp(mime: String, data: InputStream, status: Int = 200, extra: Map<String, String> = emptyMap(), cache: Boolean = false): WebResourceResponse {
        val headers = HashMap<String, String>()
        headers["Access-Control-Allow-Origin"] = "*"
        headers["Cache-Control"] = if (cache) "max-age=86400" else "no-cache"
        headers.putAll(extra)
        val enc = if (mime.startsWith("text/") || mime.endsWith("javascript") || mime.endsWith("json")) "utf-8" else null
        return WebResourceResponse(mime, enc, status, if (status == 206) "Partial Content" else "OK", headers, data)
    }

    private fun notFound() = WebResourceResponse("text/plain", "utf-8", 404, "Not Found", mapOf("Access-Control-Allow-Origin" to "*"), ByteArrayInputStream(ByteArray(0)))

    private val craftIndex = Regex("^craft/([a-z]+)/index\\.html$")

    private fun asset(p: String): WebResourceResponse {
        if (p.contains("..")) return notFound()
        // Lexicon / Tabs / Prism: подключаем мост WindowsFX внутри страницы движка
        craftIndex.find(p)?.let { m ->
            val html = assets.open(p).bufferedReader().use { it.readText() }
            val tag = "<script src=\"/assets/os/js/fx/craft-frame.js\" data-app=\"${m.groupValues[1]}\"></script>"
            val out = if (html.contains("<head>")) html.replaceFirst("<head>", "<head>$tag") else tag + html
            return resp("text/html", ByteArrayInputStream(out.toByteArray()))
        }
        val stream = assets.open(p)
        return resp(mimeOf(p), stream, cache = p.endsWith(".wasm"))
    }

    private fun deviceFile(p: String, range: String?): WebResourceResponse {
        if (!fs.hasAccess()) return notFound()
        val f = File(p)
        if (!f.isFile) return notFound()
        val mime = fs.mime(f)
        val len = f.length()
        if (range != null && range.startsWith("bytes=")) {
            val parts = range.removePrefix("bytes=").split("-")
            val start = parts[0].toLongOrNull() ?: 0L
            val end = parts.getOrNull(1)?.toLongOrNull()?.coerceAtMost(len - 1) ?: (len - 1)
            if (start in 0..end) {
                val ins = FileInputStream(f)
                var skipped = 0L
                while (skipped < start) {
                    val n = ins.skip(start - skipped)
                    if (n <= 0) break
                    skipped += n
                }
                val count = end - start + 1
                val limited = object : InputStream() {
                    var left = count
                    override fun read(): Int = if (left <= 0) -1 else ins.read().also { if (it >= 0) left-- }
                    override fun read(b: ByteArray, off: Int, l: Int): Int {
                        if (left <= 0) return -1
                        val r = ins.read(b, off, minOf(l.toLong(), left).toInt())
                        if (r > 0) left -= r
                        return r
                    }
                    override fun close() = ins.close()
                }
                return resp(mime, limited, 206, mapOf(
                    "Content-Range" to "bytes $start-$end/$len", "Accept-Ranges" to "bytes", "Content-Length" to count.toString(),
                ))
            }
        }
        return resp(mime, FileInputStream(f), 200, mapOf("Accept-Ranges" to "bytes", "Content-Length" to len.toString()))
    }

    private fun thumb(p: String, size: Int): WebResourceResponse {
        if (!fs.hasAccess()) return notFound()
        val f = File(p)
        val bytes = fs.thumbnail(f, size.coerceIn(32, 1024)) ?: return deviceFile(p, null)
        return resp("image/jpeg", ByteArrayInputStream(bytes), cache = false)
    }

    fun openExternal(path: String, chooser: Boolean) {
        val f = File(path)
        val uri = FileShareProvider.uriFor(f)
        val i = Intent(Intent.ACTION_VIEW).setDataAndType(uri, fs.mime(f))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        runOnUiThread {
            try {
                if (chooser) startActivity(Intent.createChooser(i, f.name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                else if (!apps.start(this, i, inWindow = true)) emit("toast", JSONObject().put("msg", "no-app").toString())
            } catch (_: Exception) {
                emit("toast", JSONObject().put("msg", "no-app").toString())
            }
        }
    }

    fun share(path: String) {
        val f = File(path)
        val i = Intent(Intent.ACTION_SEND).setType(fs.mime(f)).putExtra(Intent.EXTRA_STREAM, FileShareProvider.uriFor(f))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        runOnUiThread {
            try {
                startActivity(Intent.createChooser(i, f.name))
            } catch (_: Exception) {
            }
        }
    }

}
