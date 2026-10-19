package com.windowsfx.launcher

import android.app.Activity
import android.app.ActivityOptions
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.LruCache
import org.json.JSONArray
import org.json.JSONObject
import org.lsposed.hiddenapibypass.HiddenApiBypass
import java.io.ByteArrayOutputStream
import java.lang.reflect.Method

/** Installed Android apps: listing, icons and launching in floating windows. */
class AndroidApps(private val ctx: Context) {

    private val iconCache = object : LruCache<String, ByteArray>(8 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ByteArray) = value.size
    }
    private var cascade = 0

    fun list(): JSONArray {
        val pm = ctx.packageManager
        val ris = pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
        val out = JSONArray()
        ris.filter { it.activityInfo.packageName != ctx.packageName }
            .map { it to it.loadLabel(pm).toString() }
            .sortedBy { it.second.lowercase() }
            .forEach { (ri, label) ->
                val cn = ComponentName(ri.activityInfo.packageName, ri.activityInfo.name)
                out.put(JSONObject().put("id", cn.flattenToShortString()).put("label", label).put("pkg", cn.packageName))
            }
        return out
    }

    /** PNG bytes of the app icon for component "pkg/cls" (or package name). */
    fun iconPng(id: String, sizePx: Int = 144): ByteArray? {
        iconCache.get(id)?.let { return it }
        return try {
            val pm = ctx.packageManager
            val cn = ComponentName.unflattenFromString(id)
            val d: Drawable = if (cn != null) pm.getActivityIcon(cn) else pm.getApplicationIcon(id)
            val bmp = if (d is BitmapDrawable && d.bitmap != null) Bitmap.createScaledBitmap(d.bitmap, sizePx, sizePx, true)
            else Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888).also {
                val c = Canvas(it)
                d.setBounds(0, 0, sizePx, sizePx)
                d.draw(c)
            }
            val out = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
            out.toByteArray().also { iconCache.put(id, it) }
        } catch (_: PackageManager.NameNotFoundException) {
            null
        } catch (_: Throwable) {
            null
        }
    }

    // ------------------------------------------------------------------ windows

    fun freeformStatus(): JSONObject {
        val cr = ctx.contentResolver
        val feature = ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_FREEFORM_WINDOW_MANAGEMENT)
        val dev = Settings.Global.getInt(cr, "enable_freeform_support", 0) != 0
        val resizable = Settings.Global.getInt(cr, "force_resizable_activities", 0) != 0
        return JSONObject().put("supported", feature || dev).put("feature", feature).put("dev", dev).put("resizable", resizable)
            .put("hiddenApi", exempted)
    }

    fun launch(act: Activity, id: String, inWindow: Boolean, x: Int = -1, y: Int = -1, w: Int = -1, h: Int = -1): Boolean {
        val cn = ComponentName.unflattenFromString(id)
        val intent = if (cn != null) Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setComponent(cn)
        else ctx.packageManager.getLaunchIntentForPackage(id) ?: return false
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        return start(act, intent, inWindow, x, y, w, h)
    }

    fun start(act: Activity, intent: Intent, inWindow: Boolean, x: Int = -1, y: Int = -1, w: Int = -1, h: Int = -1): Boolean {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            if (inWindow) act.startActivity(intent, windowOptions(act, x, y, w, h)) else act.startActivity(intent)
            true
        } catch (_: Throwable) {
            try {
                act.startActivity(intent)
                true
            } catch (_: Throwable) {
                false
            }
        }
    }

    private fun windowOptions(act: Activity, x: Int, y: Int, w: Int, h: Int): Bundle {
        allowHiddenApi()
        val dm = act.resources.displayMetrics
        val ww = if (w > 0) w else (dm.widthPixels * 0.6f).toInt()
        val hh = if (h > 0) h else (dm.heightPixels * 0.68f).toInt()
        val off = (dm.density * 32).toInt() * (cascade++ % 5)
        val left = if (x >= 0) x else ((dm.widthPixels - ww) / 2 - (dm.density * 64).toInt() + off).coerceAtLeast(0)
        val top = if (y >= 0) y else ((dm.heightPixels - hh) / 2 - (dm.density * 48).toInt() + off).coerceAtLeast(0)
        val opts = ActivityOptions.makeBasic()
        try {
            // WINDOWING_MODE_FREEFORM = 5
            ActivityOptions::class.java.getMethod("setLaunchWindowingMode", Int::class.javaPrimitiveType).invoke(opts, 5)
        } catch (_: Throwable) {
        }
        opts.setLaunchBounds(Rect(left, top, left + ww, top + hh))
        return opts.toBundle()
    }

    fun appInfo(act: Activity, pkg: String) {
        act.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    @Suppress("DEPRECATION")
    fun uninstall(act: Activity, pkg: String) {
        act.startActivity(Intent(Intent.ACTION_UNINSTALL_PACKAGE, Uri.parse("package:$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    companion object {
        @Volatile
        var exempted = false
            private set

        /** Lets us request floating windows (a hidden API since Android 9). */
        fun allowHiddenApi() {
            if (exempted || Build.VERSION.SDK_INT < 28) return
            try {
                exempted = HiddenApiBypass.addHiddenApiExemptions("L")
                if (exempted) return
            } catch (_: Throwable) {
            }
            try {
                val forName = Class::class.java.getDeclaredMethod("forName", String::class.java)
                val getDeclared = Class::class.java.getDeclaredMethod("getDeclaredMethod", String::class.java, arrayOf<Class<*>>()::class.java)
                val vmRuntime = forName.invoke(null, "dalvik.system.VMRuntime") as Class<*>
                val getRuntime = getDeclared.invoke(vmRuntime, "getRuntime", null) as Method
                val setExemptions = getDeclared.invoke(vmRuntime, "setHiddenApiExemptions", arrayOf<Class<*>>(Array<String>::class.java)) as Method
                setExemptions.invoke(getRuntime.invoke(null), arrayOf("L"))
                exempted = true
            } catch (_: Throwable) {
            }
        }
    }
}
