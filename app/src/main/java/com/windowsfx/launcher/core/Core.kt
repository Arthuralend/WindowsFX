package com.windowsfx.launcher.core

import android.content.Context
import android.content.SharedPreferences
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.view.View
import java.util.Locale

/** All persistent settings of WindowsFX. */
object Prefs {
    private lateinit var sp: SharedPreferences

    fun init(ctx: Context) {
        if (!::sp.isInitialized) sp = ctx.getSharedPreferences("wfx", Context.MODE_PRIVATE)
    }

    private fun str(k: String, d: String) = sp.getString(k, d) ?: d
    private fun put(k: String, v: String) = sp.edit().putString(k, v).apply()
    private fun list(k: String, d: String) = str(k, d).split('|').filter { it.isNotEmpty() }.toMutableList()

    /** "ru", "en" or "system" */
    var lang: String
        get() = str("lang", "system")
        set(v) = put("lang", v)

    var dark: Boolean
        get() = sp.getBoolean("dark", true)
        set(v) = sp.edit().putBoolean("dark", v).apply()

    var uiScale: Float
        get() = sp.getFloat("scale", 1f)
        set(v) = sp.edit().putFloat("scale", v).apply()

    var wallpaper: Int
        get() = sp.getInt("wp", 0)
        set(v) = sp.edit().putInt("wp", v).apply()

    var customWallpaper: Boolean
        get() = sp.getBoolean("wp_custom", false)
        set(v) = sp.edit().putBoolean("wp_custom", v).apply()

    /** Open Android apps in freeform windows when the system allows it. */
    var freeform: Boolean
        get() = sp.getBoolean("freeform", true)
        set(v) = sp.edit().putBoolean("freeform", v).apply()

    var freeformHintShown: Boolean
        get() = sp.getBoolean("ff_hint", false)
        set(v) = sp.edit().putBoolean("ff_hint", v).apply()

    var hideStatusBar: Boolean
        get() = sp.getBoolean("hide_sb", true)
        set(v) = sp.edit().putBoolean("hide_sb", v).apply()

    var showHidden: Boolean
        get() = sp.getBoolean("hidden", false)
        set(v) = sp.edit().putBoolean("hidden", v).apply()

    var sortMode: Int
        get() = sp.getInt("sort", 0)
        set(v) = sp.edit().putInt("sort", v).apply()

    /** Taskbar pins: "b:<builtin>" or "a:<component>" */
    var pinned: MutableList<String>
        get() = list("pinned", "b:explorer|b:notepad|b:paint|b:settings")
        set(v) = put("pinned", v.joinToString("|"))

    /** Android apps placed on the desktop: "a:<component>" */
    var desktop: MutableList<String>
        get() = list("desktop", "")
        set(v) = put("desktop", v.joinToString("|"))
}

/** Per-app interface language. */
object Lang {
    fun current(ctx: Context): String {
        val l = Prefs.lang
        if (l != "system") return l
        return ctx.resources.configuration.locales[0].language
    }

    fun wrap(base: Context): Context {
        Prefs.init(base)
        val code = Prefs.lang
        if (code == "system") return base
        val loc = Locale.forLanguageTag(code)
        Locale.setDefault(loc)
        val cfg = Configuration(base.resources.configuration)
        cfg.setLocale(loc)
        return base.createConfigurationContext(cfg)
    }
}

object Ui {
    var scale = 1f
}

fun Context.dp(v: Number): Int = (v.toFloat() * resources.displayMetrics.density * Ui.scale + 0.5f).toInt()
fun Context.dpf(v: Number): Float = v.toFloat() * resources.displayMetrics.density * Ui.scale
fun View.dp(v: Number): Int = context.dp(v)
fun View.dpf(v: Number): Float = context.dpf(v)

class Palette(
    val dark: Boolean,
    val surface: Int,
    val surface2: Int,
    val surface3: Int,
    val text: Int,
    val textDim: Int,
    val border: Int,
    val taskbar: Int,
    val press: Int,
    val accent: Int,
    val selection: Int,
    val menu: Int,
)

object Th {
    val DARK = Palette(
        dark = true,
        surface = 0xF51E2236.toInt(),
        surface2 = 0xFF272C43.toInt(),
        surface3 = 0xFF323855.toInt(),
        text = 0xFFF2F4FF.toInt(),
        textDim = 0xFFA3A9C9.toInt(),
        border = 0x2EFFFFFF,
        taskbar = 0xEB121627.toInt(),
        press = 0x33FFFFFF,
        accent = 0xFF7C6CFF.toInt(),
        selection = 0x557C6CFF,
        menu = 0xF7232840.toInt(),
    )
    val LIGHT = Palette(
        dark = false,
        surface = 0xF7FAFAFD.toInt(),
        surface2 = 0xFFEEF0F7.toInt(),
        surface3 = 0xFFE1E4F0.toInt(),
        text = 0xFF1A1D2E.toInt(),
        textDim = 0xFF5D6280.toInt(),
        border = 0x26000000,
        taskbar = 0xEBF2F3F9.toInt(),
        press = 0x1F000000,
        accent = 0xFF5B4BFF.toInt(),
        selection = 0x405B4BFF,
        menu = 0xFAF8F9FD.toInt(),
    )
    var p: Palette = DARK
    fun apply() {
        p = if (Prefs.dark) DARK else LIGHT
    }
}

fun rounded(color: Int, radius: Float, strokeW: Int = 0, strokeColor: Int = 0): GradientDrawable =
    GradientDrawable().apply {
        setColor(color)
        cornerRadius = radius
        if (strokeW > 0) setStroke(strokeW, strokeColor)
    }

fun pressable(base: Drawable?, radius: Float): Drawable =
    RippleDrawable(ColorStateList.valueOf(Th.p.press), base, rounded(Color.WHITE, radius))
