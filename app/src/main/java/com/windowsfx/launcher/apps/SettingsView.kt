package com.windowsfx.launcher.apps

import android.annotation.SuppressLint
import android.content.Intent
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.Switch
import com.windowsfx.launcher.BuildConfig
import com.windowsfx.launcher.DesktopActivity
import com.windowsfx.launcher.R
import com.windowsfx.launcher.core.Prefs
import com.windowsfx.launcher.core.Th
import com.windowsfx.launcher.core.W
import com.windowsfx.launcher.core.dp
import com.windowsfx.launcher.core.dpf
import com.windowsfx.launcher.core.pressable
import com.windowsfx.launcher.core.rounded
import com.windowsfx.launcher.shell.AndroidApps
import com.windowsfx.launcher.shell.Wallpapers
import com.windowsfx.launcher.wm.FxWindow

/** "Settings" app: personalization, language, windows, system shortcuts, about. */
@SuppressLint("ViewConstructor", "UseSwitchCompatOrMaterialCode")
class SettingsView(private val act: DesktopActivity, private val win: FxWindow) : LinearLayout(act) {

    private val navList = W.vbox(act)
    private val navScroll = ScrollView(act)
    private val content = W.vbox(act)
    private val contentScroll = ScrollView(act)
    private val pages = listOf(
        Triple(R.string.set_personalization, R.drawable.ic_app_paint, ::pagePersonalization),
        Triple(R.string.language, R.drawable.ic_doc, ::pageLanguage),
        Triple(R.string.set_windows, R.drawable.ic_apps, ::pageWindows),
        Triple(R.string.set_system, R.drawable.ic_this_pc, ::pageSystem),
        Triple(R.string.set_about, R.drawable.ic_logo, ::pageAbout),
    )
    private var current = 0

    init {
        orientation = HORIZONTAL
        setBackgroundColor(Th.p.surface)
        navScroll.setBackgroundColor(Th.p.surface2)
        navList.setPadding(dp(8), dp(12), dp(8), dp(12))
        navScroll.addView(navList)
        addView(navScroll, W.lp(dp(220), W.MATCH))
        content.setPadding(dp(24), dp(20), dp(24), dp(24))
        contentScroll.addView(content)
        addView(contentScroll, W.lp(0, W.MATCH, 1f))
        win.onArgument = { a -> (a as? Int)?.let { show(it) } }
        show(0)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        // on narrow screens the navigation becomes a row of chips above the content
        val narrow = w < dp(600)
        if (narrow != (orientation == VERTICAL)) post {
            orientation = if (narrow) VERTICAL else HORIZONTAL
            navScroll.layoutParams = if (narrow) W.lp(W.MATCH, W.WRAP) else W.lp(dp(220), W.MATCH)
            contentScroll.layoutParams = if (narrow) W.lp(W.MATCH, 0, 1f) else W.lp(0, W.MATCH, 1f)
            buildNav()
        }
    }

    private fun buildNav() {
        navList.removeAllViews()
        pages.forEachIndexed { i, (title, icon, _) ->
            val row = W.hbox(act).apply {
                setPadding(dp(10), dp(9), dp(10), dp(9))
                background = pressable(if (i == current) rounded(Th.p.press, dpf(6)) else null, dpf(6))
                isClickable = true
                setOnClickListener { show(i) }
            }
            if (i == current) {
                row.addView(View(act).apply { background = rounded(Th.p.accent, dpf(2)) }, W.lp(dp(3), dp(16)).apply {
                    setMargins(0, 0, dp(8), 0)
                })
            }
            row.addView(ImageView(act).apply { setImageResource(icon) }, W.lp(dp(18), dp(18)))
            row.addView(W.text(act, act.getString(title), 13.5f).apply { setPadding(dp(12), 0, 0, 0) })
            navList.addView(row, W.lp(W.MATCH, W.WRAP))
        }
    }

    private fun show(i: Int) {
        current = i.coerceIn(0, pages.size - 1)
        buildNav()
        content.removeAllViews()
        content.addView(W.text(act, act.getString(pages[current].first), 24f, bold = true).apply {
            setPadding(0, 0, 0, dp(16))
        })
        pages[current].third.invoke()
        contentScroll.scrollTo(0, 0)
    }

    // ----------------------------------------------------------------- building blocks

    private fun card(): LinearLayout = W.vbox(act).apply {
        background = rounded(Th.p.surface2, dpf(8), 1, Th.p.border)
        setPadding(dp(16), dp(12), dp(16), dp(12))
        content.addView(this, W.lp(W.MATCH, W.WRAP).apply { setMargins(0, 0, 0, dp(8)) })
    }

    private fun row(title: String, sub: String?, trailing: View?, click: (() -> Unit)? = null) {
        val c = card()
        val r = W.hbox(act)
        val texts = W.vbox(act)
        texts.addView(W.text(act, title, 14f, lines = 2))
        if (sub != null) texts.addView(W.text(act, sub, 12f, Th.p.textDim, lines = 4).apply { setPadding(0, dp(3), 0, 0) })
        r.addView(texts, W.lp(0, W.WRAP, 1f))
        if (trailing != null) r.addView(trailing)
        c.addView(r)
        if (click != null) {
            c.background = pressable(rounded(Th.p.surface2, dpf(8), 1, Th.p.border), dpf(8))
            c.isClickable = true
            c.setOnClickListener { click() }
            if (trailing == null) r.addView(W.text(act, "›", 20f, Th.p.textDim))
        }
    }

    private fun toggle(title: String, sub: String?, value: Boolean, change: (Boolean) -> Unit) {
        val sw = Switch(act).apply {
            isChecked = value
            setOnCheckedChangeListener { _, v -> change(v) }
        }
        row(title, sub, sw)
    }

    private fun section(s: String) {
        content.addView(W.text(act, s, 13f, Th.p.text, bold = true).apply { setPadding(dp(2), dp(14), 0, dp(8)) })
    }

    private fun choiceRow(options: List<Pair<String, Boolean>>, pick: (Int) -> Unit): LinearLayout {
        val box = W.hbox(act)
        options.forEachIndexed { i, (label, selected) ->
            val b = W.text(act, label, 13f, if (selected) android.graphics.Color.WHITE else Th.p.text, bold = selected).apply {
                gravity = Gravity.CENTER
                setPadding(dp(14), dp(9), dp(14), dp(9))
                background = pressable(
                    if (selected) rounded(Th.p.accent, dpf(6)) else rounded(Th.p.surface3, dpf(6), 1, Th.p.border), dpf(6),
                )
                isClickable = true
                setOnClickListener { pick(i) }
            }
            box.addView(b, W.lp(W.WRAP, W.WRAP).apply { setMargins(0, 0, dp(8), 0) })
        }
        return box
    }

    // ----------------------------------------------------------------- pages

    private fun pagePersonalization() {
        section(act.getString(R.string.wallpaper))
        val c = card()
        val grid = android.widget.GridLayout(act).apply { columnCount = 3 }
        for (i in 0 until Wallpapers.count) {
            val sel = !Prefs.customWallpaper && Prefs.wallpaper == i
            val cell = W.vbox(act).apply { gravity = Gravity.CENTER_HORIZONTAL }
            val thumb = FrameLayout(act).apply {
                background = Wallpapers.preset(i)
                foreground = rounded(0, dpf(6), dp(if (sel) 3 else 1), if (sel) Th.p.accent else Th.p.border)
                clipToOutline = true
                outlineProvider = android.view.ViewOutlineProvider.BACKGROUND
                isClickable = true
                setOnClickListener {
                    Prefs.wallpaper = i
                    Prefs.customWallpaper = false
                    act.applyWallpaper()
                    show(current)
                }
            }
            cell.addView(thumb, W.lp(dp(120), dp(72)))
            cell.addView(W.text(act, Wallpapers.name(act, i), 12f, Th.p.textDim).apply { setPadding(0, dp(4), 0, dp(8)) })
            grid.addView(cell, android.widget.GridLayout.LayoutParams().apply { setMargins(0, 0, dp(10), 0) })
        }
        c.addView(grid)
        c.addView(W.button(act, act.getString(R.string.choose_picture)) {
            act.pickDocument("image/*") { uri ->
                if (Wallpapers.importImage(act, uri)) {
                    Prefs.customWallpaper = true
                    act.applyWallpaper()
                    show(current)
                } else W.toast(act, act.getString(R.string.failed))
            }
        }, W.lp(W.WRAP, W.WRAP).apply { setMargins(0, dp(6), 0, 0) })

        section(act.getString(R.string.theme))
        val tc = card()
        tc.addView(choiceRow(listOf(
            act.getString(R.string.theme_dark) to Prefs.dark,
            act.getString(R.string.theme_light) to !Prefs.dark,
        )) { i ->
            val dark = i == 0
            if (dark != Prefs.dark) {
                Prefs.dark = dark
                act.rebuild()
            }
        })

        section(act.getString(R.string.scale))
        val sc = card()
        val label = W.text(act, act.getString(R.string.scale_value, (Prefs.uiScale * 100).toInt()), 13f)
        sc.addView(label)
        sc.addView(W.text(act, act.getString(R.string.scale_hint), 12f, Th.p.textDim, lines = 3).apply { setPadding(0, dp(4), 0, dp(4)) })
        var pending = Prefs.uiScale
        val seek = SeekBar(act).apply {
            max = 15 // 75% .. 150% in 5% steps
            progress = ((Prefs.uiScale - 0.75f) / 0.05f).toInt().coerceIn(0, 15)
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(s: SeekBar?, p: Int, user: Boolean) {
                    pending = 0.75f + p * 0.05f
                    label.text = act.getString(R.string.scale_value, (pending * 100 + 0.5f).toInt())
                }
                override fun onStartTrackingTouch(s: SeekBar?) {}
                override fun onStopTrackingTouch(s: SeekBar?) {}
            })
        }
        sc.addView(seek, W.lp(W.MATCH, W.WRAP))
        sc.addView(W.button(act, act.getString(R.string.apply), primary = true) {
            Prefs.uiScale = pending
            act.rebuild()
        }, W.lp(W.WRAP, W.WRAP).apply { setMargins(0, dp(8), 0, 0) })

        section(act.getString(R.string.taskbar))
        toggle(act.getString(R.string.hide_status_bar), act.getString(R.string.hide_status_bar_sub), Prefs.hideStatusBar) {
            Prefs.hideStatusBar = it
            act.rebuild()
        }
    }

    private fun pageLanguage() {
        val c = card()
        c.addView(W.text(act, act.getString(R.string.language_sub), 13f, Th.p.textDim, lines = 3).apply {
            setPadding(0, 0, 0, dp(12))
        })
        val cur = Prefs.lang
        c.addView(choiceRow(listOf(
            "Русский" to (cur == "ru"),
            "English" to (cur == "en"),
            act.getString(R.string.lang_system) to (cur == "system"),
        )) { i -> act.setLanguage(listOf("ru", "en", "system")[i]) })
        content.addView(W.text(act, act.getString(R.string.language_tip), 12f, Th.p.textDim, lines = 3).apply {
            setPadding(dp(2), dp(8), 0, 0)
        })
    }

    private fun pageWindows() {
        val supported = AndroidApps.freeformSupported(act)
        toggle(act.getString(R.string.freeform_toggle), act.getString(R.string.freeform_sub), Prefs.freeform) { Prefs.freeform = it }
        row(
            act.getString(R.string.freeform_status),
            act.getString(if (supported) R.string.freeform_on else R.string.freeform_off),
            W.text(act, if (supported) "✓" else "!", 18f, if (supported) 0xFF2DBE8C.toInt() else 0xFFF0A040.toInt(), bold = true),
        )
        row(act.getString(R.string.freeform_howto), act.getString(R.string.freeform_howto_sub), null) {
            W.dialog(act).setTitle(R.string.freeform_howto).setMessage(R.string.freeform_steps)
                .setPositiveButton(R.string.open_dev_options) { _, _ -> act.openSystem(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS) }
                .setNegativeButton(R.string.close, null).show()
        }
        row(act.getString(R.string.choose_home_app), act.getString(R.string.choose_home_app_sub), null) {
            act.openSystem(Settings.ACTION_HOME_SETTINGS)
        }
    }

    private fun pageSystem() {
        val items = listOf(
            Triple(R.string.sys_wifi, R.string.sys_wifi_sub, Settings.ACTION_WIFI_SETTINGS),
            Triple(R.string.sys_bluetooth, R.string.sys_bluetooth_sub, Settings.ACTION_BLUETOOTH_SETTINGS),
            Triple(R.string.sys_display, R.string.sys_display_sub, Settings.ACTION_DISPLAY_SETTINGS),
            Triple(R.string.sys_sound, R.string.sys_sound_sub, Settings.ACTION_SOUND_SETTINGS),
            Triple(R.string.sys_battery, R.string.sys_battery_sub, Intent.ACTION_POWER_USAGE_SUMMARY),
            Triple(R.string.sys_storage, R.string.sys_storage_sub, Settings.ACTION_INTERNAL_STORAGE_SETTINGS),
            Triple(R.string.sys_apps, R.string.sys_apps_sub, Settings.ACTION_APPLICATION_SETTINGS),
            Triple(R.string.sys_datetime, R.string.sys_datetime_sub, Settings.ACTION_DATE_SETTINGS),
            Triple(R.string.sys_language, R.string.sys_language_sub, Settings.ACTION_LOCALE_SETTINGS),
            Triple(R.string.sys_all, R.string.sys_all_sub, Settings.ACTION_SETTINGS),
        )
        for ((t, s, action) in items) row(act.getString(t), act.getString(s), null) { act.openSystem(action) }
    }

    private fun pageAbout() {
        val c = card()
        val head = W.hbox(act)
        head.addView(ImageView(act).apply { setImageResource(R.mipmap.ic_launcher) }, W.lp(dp(64), dp(64)))
        val texts = W.vbox(act).apply { setPadding(dp(16), 0, 0, 0) }
        texts.addView(W.text(act, "WindowsFX", 22f, bold = true))
        texts.addView(W.text(act, act.getString(R.string.version, BuildConfig.VERSION_NAME), 13f, Th.p.textDim).apply {
            setPadding(0, dp(4), 0, 0)
        })
        head.addView(texts)
        c.addView(head)
        c.addView(W.text(act, act.getString(R.string.about_text), 13f, Th.p.textDim, lines = 0).apply {
            setPadding(0, dp(14), 0, 0)
        })
        row(act.getString(R.string.device), android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL +
            " · Android " + android.os.Build.VERSION.RELEASE, null)
        val dm = act.resources.displayMetrics
        row(act.getString(R.string.screen), "${dm.widthPixels} × ${dm.heightPixels} · ${dm.densityDpi} dpi", null)
    }

}
