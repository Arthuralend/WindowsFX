package com.windowsfx.launcher.shell

import android.app.Activity
import android.app.ActivityOptions
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Rect
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import com.windowsfx.launcher.R
import com.windowsfx.launcher.apps.Builtin
import com.windowsfx.launcher.core.Prefs
import com.windowsfx.launcher.core.W

/** One launchable thing: a built-in program or an installed Android app. */
class AppEntry(
    val key: String,
    val label: String,
    val builtin: Builtin? = null,
    val component: ComponentName? = null,
    val icon: Drawable? = null,
)

object AndroidApps {
    @Volatile
    var list: List<AppEntry> = emptyList()
        private set
    private var loading = false
    private val waiters = mutableListOf<() -> Unit>()
    private var cascade = 0

    fun load(ctx: Context, done: (() -> Unit)? = null) {
        if (done != null) waiters.add(done)
        if (loading) return
        loading = true
        val app = ctx.applicationContext
        Thread {
            val pm = app.packageManager
            val ris = pm.queryIntentActivities(
                Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0,
            )
            val l = ris.filter { it.activityInfo.packageName != app.packageName }.map {
                val cn = ComponentName(it.activityInfo.packageName, it.activityInfo.name)
                AppEntry("a:" + cn.flattenToShortString(), it.loadLabel(pm).toString(), component = cn, icon = it.loadIcon(pm))
            }.sortedBy { it.label.lowercase() }
            Handler(Looper.getMainLooper()).post {
                list = l
                loading = false
                val w = waiters.toList()
                waiters.clear()
                w.forEach { it() }
            }
        }.start()
    }

    fun builtinEntry(ctx: Context, b: Builtin): AppEntry =
        AppEntry("b:" + b.key, ctx.getString(b.title), builtin = b, icon = ctx.getDrawable(b.icon))

    /** Resolves a pin / desktop key to an entry (null if the app was uninstalled). */
    fun find(ctx: Context, key: String): AppEntry? {
        if (key.startsWith("b:")) return Builtin.byKey(key.substring(2))?.let { builtinEntry(ctx, it) }
        list.firstOrNull { it.key == key }?.let { return it }
        val cn = ComponentName.unflattenFromString(key.removePrefix("a:")) ?: return null
        return try {
            val pm = ctx.packageManager
            val ai = pm.getActivityInfo(cn, 0)
            AppEntry(key, ai.loadLabel(pm).toString(), component = cn, icon = ai.loadIcon(pm))
        } catch (_: PackageManager.NameNotFoundException) {
            null
        }
    }

    fun freeformSupported(ctx: Context): Boolean {
        val pm = ctx.packageManager
        val cr = ctx.contentResolver
        return pm.hasSystemFeature(PackageManager.FEATURE_FREEFORM_WINDOW_MANAGEMENT) ||
            Settings.Global.getInt(cr, "enable_freeform_support", 0) != 0 ||
            Settings.Global.getInt(cr, "force_resizable_activities", 0) != 0
    }

    /** Starts an activity, as a floating window when possible. */
    fun startInWindow(act: Activity, intent: Intent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (!Prefs.freeform) {
            act.startActivity(intent)
            return
        }
        val dm = act.resources.displayMetrics
        val w = (dm.widthPixels * 0.62f).toInt()
        val h = (dm.heightPixels * 0.68f).toInt()
        val off = (dm.density * 30).toInt() * (cascade++ % 5)
        val left = (dm.widthPixels - w) / 2 - off + (dm.density * 60).toInt()
        val top = (dm.heightPixels - h) / 2 - off + (dm.density * 40).toInt()
        val opts = ActivityOptions.makeBasic()
        try {
            // WINDOWING_MODE_FREEFORM = 5 (hidden API, works on most Android 10+ builds)
            ActivityOptions::class.java.getMethod("setLaunchWindowingMode", Int::class.javaPrimitiveType)
                .invoke(opts, 5)
        } catch (_: Throwable) {
        }
        opts.setLaunchBounds(Rect(left, top, left + w, top + h))
        try {
            act.startActivity(intent, opts.toBundle())
        } catch (_: Throwable) {
            act.startActivity(intent)
        }
    }

    fun launch(act: Activity, cn: ComponentName) {
        val i = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setComponent(cn)
            .addFlags(Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        try {
            startInWindow(act, i)
        } catch (_: ActivityNotFoundException) {
            W.toast(act, act.getString(R.string.app_not_found))
        }
    }

    fun appInfo(act: Activity, pkg: String) {
        act.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    @Suppress("DEPRECATION")
    fun uninstall(act: Activity, pkg: String) {
        act.startActivity(Intent(Intent.ACTION_UNINSTALL_PACKAGE, Uri.parse("package:$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
