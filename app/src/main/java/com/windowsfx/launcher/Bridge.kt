package com.windowsfx.launcher

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.widget.Toast
import org.json.JSONObject

/**
 * window.FXNative — the bridge the web desktop uses to reach Android.
 * Every method returns a JSON string: {"ok": value} or {"err": code, "msg": text}.
 * File-system calls are synchronous on purpose: the web FS layer is synchronous.
 */
class Bridge(private val act: MainActivity) {

    private val fs get() = act.fs

    private fun ok(v: Any? = true): String = JSONObject().put("ok", v ?: JSONObject.NULL).toString()
    private fun err(code: String, msg: String?): String = JSONObject().put("err", code).put("msg", msg ?: code).toString()

    private inline fun run(block: () -> Any?): String = try {
        ok(block())
    } catch (e: DeviceFs.FsError) {
        err(e.code, e.message)
    } catch (e: SecurityException) {
        err("EACCES", e.message)
    } catch (e: java.io.FileNotFoundException) {
        err("ENOENT", e.message)
    } catch (e: Throwable) {
        err("EIO", e.message)
    }

    private fun ui(block: () -> Unit) = act.runOnUiThread { try { block() } catch (_: Throwable) {} }

    // ================================================================ info

    @JavascriptInterface
    fun info(): String = ok(JSONObject()
        .put("version", BuildConfig.VERSION_NAME)
        .put("model", Build.MANUFACTURER + " " + Build.MODEL)
        .put("android", Build.VERSION.RELEASE)
        .put("sdk", Build.VERSION.SDK_INT)
        .put("lang", java.util.Locale.getDefault().language))

    // ================================================================ files

    @JavascriptInterface fun hasAccess(): String = ok(fs.hasAccess())
    @JavascriptInterface fun requestAccess(): String { ui { fs.requestAccess(act) }; return ok() }
    @JavascriptInterface fun roots(): String = run { fs.roots() }
    @JavascriptInterface fun stat(p: String): String = run { fs.stat(p) }
    @JavascriptInterface fun list(p: String): String = run { fs.list(p) }
    @JavascriptInterface fun readText(p: String, max: Double): String = run { fs.readText(p, max.toLong()) }
    @JavascriptInterface fun readBase64(p: String, max: Double): String = run { fs.readBase64(p, max.toLong()) }
    @JavascriptInterface fun writeText(p: String, s: String): String = run { fs.writeText(p, s) }
    @JavascriptInterface fun writeBase64(p: String, b: String): String = run { fs.writeBase64(p, b) }
    @JavascriptInterface fun mkdir(p: String): String = run { fs.mkdir(p) }
    @JavascriptInterface fun rename(p: String, n: String): String = run { fs.rename(p, n) }
    @JavascriptInterface fun remove(p: String): String = run { fs.remove(p) }
    @JavascriptInterface fun copy(s: String, d: String): String = run { fs.copy(s, d) }
    @JavascriptInterface fun move(s: String, d: String): String = run { fs.move(s, d) }
    @JavascriptInterface fun trash(p: String): String = run { fs.trash(p) }
    @JavascriptInterface fun untrash(t: String, d: String): String = run { fs.untrash(t, d) }
    @JavascriptInterface fun purge(t: String): String = run { fs.purge(t) }
    @JavascriptInterface fun search(d: String, q: String, limit: Int): String = run { fs.search(d, q, limit) }
    @JavascriptInterface fun usage(p: String): String = run { fs.usage(p) }
    @JavascriptInterface fun openExternal(p: String, chooser: Boolean): String { act.openExternal(p, chooser); return ok() }
    @JavascriptInterface fun share(p: String): String { act.share(p); return ok() }

    /** System picker → copies the chosen document into [destDir]; result arrives as event "imported". */
    @JavascriptInterface
    fun importDocument(mime: String, destDir: String): String {
        ui {
            val i = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime.ifEmpty { "*/*" })
            act.pick(i) { uri ->
                if (uri == null) return@pick
                Thread {
                    val res = JSONObject()
                    try {
                        var name = "file"
                        act.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                            if (c.moveToFirst()) name = c.getString(0) ?: name
                        }
                        var target = java.io.File(destDir, name)
                        var n = 2
                        val stem = name.substringBeforeLast('.', name)
                        val ext = if (name.contains('.')) "." + name.substringAfterLast('.') else ""
                        while (target.exists()) target = java.io.File(destDir, "$stem ($n)$ext").also { n++ }
                        act.contentResolver.openInputStream(uri)?.use { ins -> target.outputStream().use { ins.copyTo(it) } }
                        res.put("path", target.absolutePath)
                    } catch (e: Exception) {
                        res.put("error", e.message ?: "error")
                    }
                    act.emit("imported", res)
                }.start()
            }
        }
        return ok()
    }

    // ================================================================ Android apps

    @JavascriptInterface fun apps(): String = run { act.apps.list() }

    @JavascriptInterface
    fun launch(id: String, inWindow: Boolean): String {
        ui { if (!act.apps.launch(act, id, inWindow)) Toast.makeText(act, "App not found", Toast.LENGTH_SHORT).show() }
        return ok()
    }

    @JavascriptInterface fun freeform(): String = run { act.apps.freeformStatus() }
    @JavascriptInterface fun appInfo(pkg: String): String { ui { act.apps.appInfo(act, pkg) }; return ok() }
    @JavascriptInterface fun uninstall(pkg: String): String { ui { act.apps.uninstall(act, pkg) }; return ok() }

    // ================================================================ system

    @JavascriptInterface
    fun openSettings(action: String): String {
        ui {
            val a = when (action) {
                "wifi" -> Settings.ACTION_WIFI_SETTINGS
                "bluetooth" -> Settings.ACTION_BLUETOOTH_SETTINGS
                "display" -> Settings.ACTION_DISPLAY_SETTINGS
                "sound" -> Settings.ACTION_SOUND_SETTINGS
                "battery" -> Intent.ACTION_POWER_USAGE_SUMMARY
                "storage" -> Settings.ACTION_INTERNAL_STORAGE_SETTINGS
                "apps" -> Settings.ACTION_APPLICATION_SETTINGS
                "date" -> Settings.ACTION_DATE_SETTINGS
                "language" -> Settings.ACTION_LOCALE_SETTINGS
                "developer" -> Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS
                "home" -> Settings.ACTION_HOME_SETTINGS
                "about" -> Settings.ACTION_DEVICE_INFO_SETTINGS
                "internet" -> if (Build.VERSION.SDK_INT >= 29) Settings.Panel.ACTION_INTERNET_CONNECTIVITY else Settings.ACTION_WIFI_SETTINGS
                "volume" -> if (Build.VERSION.SDK_INT >= 29) Settings.Panel.ACTION_VOLUME else Settings.ACTION_SOUND_SETTINGS
                else -> Settings.ACTION_SETTINGS
            }
            try {
                act.startActivity(Intent(a).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Exception) {
                act.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }
        return ok()
    }

    @JavascriptInterface
    fun battery(): String = run {
        val st = act.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = st?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = st?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        JSONObject().put("level", if (level < 0) 1.0 else level.toDouble() / scale)
            .put("charging", (st?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0)
    }

    @Suppress("DEPRECATION")
    @JavascriptInterface
    fun network(): String = run {
        val cm = act.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork)
        val wifi = caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
        var ssid = ""
        if (wifi) {
            try {
                val wm = act.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                ssid = wm.connectionInfo?.ssid?.trim('"')?.takeIf { it != "<unknown ssid>" } ?: ""
            } catch (_: Exception) {
            }
        }
        JSONObject().put("online", caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true)
            .put("wifi", wifi).put("cellular", caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true).put("ssid", ssid)
    }

    @JavascriptInterface fun immersive(on: Boolean): String { ui { act.applyImmersive(on) }; return ok() }
    @JavascriptInterface fun toast(msg: String): String { ui { Toast.makeText(act, msg, Toast.LENGTH_SHORT).show() }; return ok() }

    @Suppress("DEPRECATION")
    @JavascriptInterface
    fun vibrate(ms: Int): String {
        try {
            val v = act.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms.toLong(), VibrationEffect.DEFAULT_AMPLITUDE)) else v.vibrate(ms.toLong())
        } catch (_: Exception) {
        }
        return ok()
    }

    // ================================================================ browser (Chromium WebView tabs)

    @JavascriptInterface fun webCreate(id: String, url: String): String { ui { act.browser.create(id, url) }; return ok() }
    @JavascriptInterface fun webNavigate(id: String, url: String): String { ui { act.browser.navigate(id, url) }; return ok() }
    @JavascriptInterface fun webAction(id: String, a: String): String { ui { act.browser.action(id, a) }; return ok() }
    @JavascriptInterface fun webBounds(id: String, x: Int, y: Int, w: Int, h: Int, visible: Boolean): String {
        ui { act.browser.bounds(id, x, y, w, h, visible) }; return ok()
    }
    @JavascriptInterface fun webSnapshot(id: String): String { ui { act.browser.snapshot(id) }; return ok() }
    @JavascriptInterface fun webDestroy(id: String): String { ui { act.browser.destroy(id) }; return ok() }
    @JavascriptInterface
    fun launchUrl(url: String): String {
        ui { act.apps.start(act, Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)), inWindow = true) }
        return ok()
    }

    @JavascriptInterface fun webHideAll(): String { ui { act.browser.hideAll() }; return ok() }
}
