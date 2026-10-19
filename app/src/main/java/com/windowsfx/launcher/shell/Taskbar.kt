package com.windowsfx.launcher.shell

import android.annotation.SuppressLint
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.format.DateFormat
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.TextView
import com.windowsfx.launcher.DesktopActivity
import com.windowsfx.launcher.R
import com.windowsfx.launcher.apps.Builtin
import com.windowsfx.launcher.core.Lang
import com.windowsfx.launcher.core.Prefs
import com.windowsfx.launcher.core.Th
import com.windowsfx.launcher.core.W
import com.windowsfx.launcher.core.dp
import com.windowsfx.launcher.core.dpf
import com.windowsfx.launcher.core.pressable
import com.windowsfx.launcher.core.rounded
import com.windowsfx.launcher.wm.FxWindow
import java.util.Date

/** Windows 11 style taskbar: centered apps, tray with language, Wi-Fi, battery and clock. */
@SuppressLint("ViewConstructor")
class Taskbar(private val act: DesktopActivity) : FrameLayout(act) {

    private val center = W.hbox(act, Gravity.CENTER)
    private val tray = W.hbox(act, Gravity.CENTER_VERTICAL or Gravity.END)
    private val clock: TextView
    private val battery: TextView
    private val handler = Handler(Looper.getMainLooper())
    private val tick = object : Runnable {
        override fun run() {
            updateTray()
            handler.postDelayed(this, 15_000)
        }
    }

    init {
        setBackgroundColor(Th.p.taskbar)
        val topLine = View(act).apply { setBackgroundColor(Th.p.border) }
        addView(topLine, LayoutParams(LayoutParams.MATCH_PARENT, 1, Gravity.TOP))
        addView(center, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.MATCH_PARENT, Gravity.CENTER))

        val lang = W.text(act, if (Lang.current(act) == "ru") "RU" else "ENG", 12f, Th.p.text, bold = true).apply {
            gravity = Gravity.CENTER
            setPadding(dp(8), 0, dp(8), 0)
            background = pressable(null, dpf(6))
            isClickable = true
            setOnClickListener { act.setLanguage(if (Lang.current(act) == "ru") "en" else "ru") }
        }
        tray.addView(lang, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(40)))

        val wifi = W.iconButton(act, R.drawable.ic_wifi, act.getString(R.string.network), Th.p.text, 40) {
            try {
                if (Build.VERSION.SDK_INT >= 29) act.startActivity(Intent(Settings.Panel.ACTION_INTERNET_CONNECTIVITY))
                else act.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS))
            } catch (_: Exception) {
                act.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS))
            }
        }
        tray.addView(wifi)

        battery = W.text(act, "", 12f, Th.p.text).apply {
            gravity = Gravity.CENTER
            setPadding(dp(6), 0, dp(6), 0)
            background = pressable(null, dpf(6))
            isClickable = true
            setOnClickListener {
                try {
                    act.startActivity(Intent(Intent.ACTION_POWER_USAGE_SUMMARY))
                } catch (_: Exception) {
                }
            }
        }
        tray.addView(battery, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(40)))

        clock = W.text(act, "", 12f, Th.p.text, lines = 2).apply {
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            setPadding(dp(8), 0, dp(10), 0)
            setLineSpacing(dpf(2), 1f)
            background = pressable(null, dpf(6))
            isClickable = true
            setOnClickListener {
                try {
                    act.startActivity(Intent(Settings.ACTION_DATE_SETTINGS))
                } catch (_: Exception) {
                }
            }
        }
        tray.addView(clock, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(42)))

        // "show desktop" sliver at the far right, like Windows
        val showDesktop = View(act).apply {
            background = pressable(null, 0f)
            isClickable = true
            setOnClickListener { act.windows.minimizeAll() }
        }
        tray.addView(showDesktop, LinearLayout.LayoutParams(dp(8), LinearLayout.LayoutParams.MATCH_PARENT))
        addView(tray, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.MATCH_PARENT, Gravity.END))

        refresh()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        handler.post(tick)
    }

    override fun onDetachedFromWindow() {
        handler.removeCallbacks(tick)
        super.onDetachedFromWindow()
    }

    private fun updateTray() {
        val now = Date()
        clock.text = DateFormat.getTimeFormat(act).format(now) + "\n" + DateFormat.getDateFormat(act).format(now)
        val st = act.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        if (st != null) {
            val level = st.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = st.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
            val plugged = st.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0
            if (level >= 0) battery.text = (if (plugged) "⚡" else "") + (level * 100 / scale) + "%"
        }
    }

    /** Rebuilds the centered button group from pins and open windows. */
    fun refresh() {
        center.removeAllViews()
        center.addView(item(act.getDrawable(R.drawable.ic_logo), act.getString(R.string.start), null) { act.start.toggle() })
        center.addView(item(act.getDrawable(R.drawable.ic_search), act.getString(R.string.search), Th.p.text) {
            act.start.show(focusSearch = true)
        })

        val windows = act.windows.windows
        val shownWindows = mutableSetOf<FxWindow>()
        for (key in Prefs.pinned) {
            val e = AndroidApps.find(act, key) ?: continue
            val b = e.builtin
            if (b != null) {
                val wins = windows.filter { it.app == b }
                shownWindows.addAll(wins)
                center.addView(item(e.icon, e.label, null, state(wins), longClick = { v -> pinMenu(v, key, wins) }) {
                    clickBuiltin(b, wins)
                })
            } else {
                center.addView(item(e.icon, e.label, null, longClick = { v -> pinMenu(v, key, emptyList()) }) {
                    e.component?.let { AndroidApps.launch(act, it) }
                })
            }
        }
        // running windows that are not pinned
        val groups = windows.filter { it !in shownWindows }.groupBy { it.app }
        for ((b, wins) in groups) {
            center.addView(item(act.getDrawable(b.icon), act.getString(b.title), null, state(wins),
                longClick = { v -> pinMenu(v, "b:" + b.key, wins) }) { clickBuiltin(b, wins) })
        }
    }

    /** 0 = not running, 1 = running, 2 = focused */
    private fun state(wins: List<FxWindow>): Int = when {
        wins.isEmpty() -> 0
        wins.any { act.windows.isActive(it) } -> 2
        else -> 1
    }

    private fun clickBuiltin(b: Builtin, wins: List<FxWindow>) {
        act.start.hide()
        if (wins.isEmpty()) {
            act.windows.open(b)
            return
        }
        val top = wins.last()
        if (act.windows.isActive(top)) act.windows.minimize(top) else act.windows.restore(top)
    }

    private fun pinMenu(anchor: View, key: String, wins: List<FxWindow>) {
        val pm = PopupMenu(act, anchor)
        val pinned = Prefs.pinned.contains(key)
        pm.menu.add(0, 1, 0, if (pinned) R.string.unpin_taskbar else R.string.pin_taskbar)
        if (wins.isNotEmpty()) pm.menu.add(0, 2, 1, R.string.close_window)
        pm.setOnMenuItemClickListener {
            when (it.itemId) {
                1 -> {
                    val l = Prefs.pinned
                    if (pinned) l.remove(key) else l.add(key)
                    Prefs.pinned = l
                    refresh()
                }
                2 -> wins.toList().forEach { w -> act.windows.close(w) }
            }
            true
        }
        pm.show()
    }

    private fun item(
        icon: android.graphics.drawable.Drawable?, label: String, tint: Int?, state: Int = 0,
        longClick: ((View) -> Unit)? = null, click: () -> Unit,
    ): View = FrameLayout(act).apply {
        val img = ImageView(act).apply {
            setImageDrawable(icon)
            if (tint != null) imageTintList = android.content.res.ColorStateList.valueOf(tint)
        }
        addView(img, LayoutParams(dp(26), dp(26), Gravity.CENTER))
        if (state > 0) {
            val ind = View(act).apply { background = rounded(if (state == 2) Th.p.accent else Th.p.textDim, dpf(2)) }
            addView(ind, LayoutParams(dp(if (state == 2) 16 else 6), dp(3), Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply {
                bottomMargin = dp(2)
            })
        }
        val base = if (state == 2) rounded(Th.p.press, dpf(6)) else null
        background = pressable(base, dpf(6))
        contentDescription = label
        isClickable = true
        setOnClickListener { click() }
        if (longClick != null) setOnLongClickListener { longClick(it); true }
        else setOnLongClickListener { W.toast(act, label); true }
        layoutParams = LinearLayout.LayoutParams(dp(44), dp(44)).apply { setMargins(dp(2), 0, dp(2), 0) }
    }
}
