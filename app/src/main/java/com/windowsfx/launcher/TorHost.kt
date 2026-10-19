package com.windowsfx.launcher

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.ServiceConnection
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.WebStorage
import androidx.webkit.ProxyConfig
import androidx.webkit.ProxyController
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import org.torproject.jni.TorService

/**
 * Tor mode of the WindowsFX browser: the Tor daemon (Guardian Project tor-android, BSD licence)
 * runs inside the app; while it is on, every WebView of WindowsFX goes through its SOCKS proxy,
 * so sites see a Tor exit node and .onion addresses open. Turning it off removes the proxy and
 * wipes cookies and site data.
 */
class TorHost(private val act: MainActivity) {
    @Volatile var status = "OFF"
        private set
    private var service: TorService? = null
    private var bound = false
    private var registered = false
    private var bootstrap = 0
    private val main = Handler(Looper.getMainLooper())

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                TorService.ACTION_STATUS -> {
                    val s = intent.getStringExtra(TorService.EXTRA_STATUS) ?: return
                    status = s
                    if (s == TorService.STATUS_ON) {
                        bootstrap = 100
                        applyProxy()
                    }
                    emit()
                }
                TorService.ACTION_ERROR -> {
                    status = "ERROR"
                    emit(JSONObject().put("error", intent.getStringExtra(Intent.EXTRA_TEXT) ?: "Tor error"))
                }
            }
        }
    }

    private val conn = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder) {
            service = (binder as TorService.LocalBinder).service
            pollBootstrap()
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            service = null
        }
    }

    private fun emit(extra: JSONObject = JSONObject()) {
        act.emit("tor", extra.put("status", status).put("progress", bootstrap).put("socks", socksPort()))
    }

    private fun socksPort(): Int = runCatching { service?.socksPort ?: 0 }.getOrDefault(0).let { if (it > 0) it else 9050 }

    fun start() {
        if (status == TorService.STATUS_ON || status == TorService.STATUS_STARTING) { emit(); return }
        if (!registered) {
            val f = IntentFilter().apply { addAction(TorService.ACTION_STATUS); addAction(TorService.ACTION_ERROR) }
            if (Build.VERSION.SDK_INT >= 33) act.registerReceiver(receiver, f, Context.RECEIVER_NOT_EXPORTED)
            else @Suppress("UnspecifiedRegisterReceiverFlag") act.registerReceiver(receiver, f)
            registered = true
        }
        status = TorService.STATUS_STARTING
        bootstrap = 0
        // Until Tor is ready, point WebViews at its port: nothing leaks past the proxy meanwhile.
        applyProxy()
        bound = act.bindService(Intent(act, TorService::class.java), conn, Context.BIND_AUTO_CREATE)
        emit()
    }

    private fun pollBootstrap() {
        main.postDelayed({
            val s = service ?: return@postDelayed
            if (status != TorService.STATUS_STARTING) return@postDelayed
            Thread {
                val info = runCatching { s.torControlConnection?.getInfo("status/bootstrap-phase") }.getOrNull() ?: ""
                val p = Regex("PROGRESS=(\\d+)").find(info)?.groupValues?.get(1)?.toIntOrNull()
                if (p != null && p != bootstrap) { bootstrap = p; emit(JSONObject().put("phase", Regex("SUMMARY=\"([^\"]*)\"").find(info)?.groupValues?.get(1) ?: "")) }
                if (p == 100 && status == TorService.STATUS_STARTING) { status = TorService.STATUS_ON; main.post { applyProxy() }; emit() }
            }.start()
            pollBootstrap()
        }, 800)
    }

    private fun applyProxy() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
            emit(JSONObject().put("error", "WebView этого устройства не поддерживает прокси"))
            return
        }
        val cfg = ProxyConfig.Builder().addProxyRule("socks://127.0.0.1:" + socksPort()).build()
        ProxyController.getInstance().setProxyOverride(cfg, { it.run() }) { emit(JSONObject().put("proxy", true)) }
    }

    fun newIdentity() {
        Thread {
            runCatching { service?.torControlConnection?.signal("NEWNYM") }
            main.post { wipe(); emit(JSONObject().put("newnym", true)) }
        }.start()
    }

    private fun wipe() {
        CookieManager.getInstance().removeAllCookies(null)
        CookieManager.getInstance().flush()
        WebStorage.getInstance().deleteAllData()
    }

    fun stop() {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
            ProxyController.getInstance().clearProxyOverride({ it.run() }) {}
        }
        if (bound) runCatching { act.unbindService(conn) }
        bound = false
        runCatching { act.stopService(Intent(act, TorService::class.java)) }
        service = null
        status = "OFF"
        bootstrap = 0
        wipe()
        emit()
    }

    fun info(): JSONObject = JSONObject().put("status", status).put("progress", bootstrap).put("socks", socksPort())

    fun onDestroy() {
        if (status != "OFF") stop()
        if (registered) runCatching { act.unregisterReceiver(receiver) }
        registered = false
    }
}
