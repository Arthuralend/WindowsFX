package com.windowsfx.launcher.shell

import android.annotation.SuppressLint
import android.graphics.Color
import android.view.DragEvent
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
import com.windowsfx.launcher.core.Prefs
import com.windowsfx.launcher.core.W
import com.windowsfx.launcher.core.dp
import com.windowsfx.launcher.core.dpf
import com.windowsfx.launcher.core.pressable
import com.windowsfx.launcher.core.rounded
import com.windowsfx.launcher.core.Th
import com.windowsfx.launcher.files.DragFiles

/** Desktop shortcuts, laid out in columns from the top-left like Windows. */
@SuppressLint("ViewConstructor")
class DesktopIcons(private val act: DesktopActivity) : FrameLayout(act) {

    private class Item(val key: String, val label: String, val icon: android.graphics.drawable.Drawable?, val open: () -> Unit)

    private val cellW get() = dp(88)
    private val cellH get() = dp(96)

    init {
        isLongClickable = true
        setOnLongClickListener { desktopMenu(); true }
        refresh()
    }

    fun refresh() {
        removeAllViews()
        val items = mutableListOf(
            Item("pc", act.getString(R.string.this_pc), act.getDrawable(R.drawable.ic_this_pc)) { act.windows.open(Builtin.EXPLORER) },
        )
        for (b in listOf(Builtin.NOTEPAD, Builtin.PAINT, Builtin.PDF, Builtin.CALC, Builtin.SETTINGS)) {
            items.add(Item("b:" + b.key, act.getString(b.title), act.getDrawable(b.icon)) { act.windows.open(b) })
        }
        for (key in Prefs.desktop) {
            val e = AndroidApps.find(act, key) ?: continue
            items.add(Item(key, e.label, e.icon) { e.component?.let { AndroidApps.launch(act, it) } })
        }
        items.forEach { addView(iconView(it), LayoutParams(cellW, cellH)) }
        arrange()
    }

    private fun iconView(it: Item): View = LinearLayout(act).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER_HORIZONTAL
        setPadding(dp(4), dp(8), dp(4), dp(4))
        background = pressable(null, dpf(6))
        addView(ImageView(act).apply { setImageDrawable(it.icon) }, W.lp(dp(42), dp(42)))
        addView(W.text(act, it.label, 12f, Color.WHITE, lines = 2).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(5), 0, 0)
            setShadowLayer(dpf(3), 0f, dpf(1), 0xCC000000.toInt())
        }, W.lp(W.MATCH, W.WRAP))
        isClickable = true
        setOnClickListener { _ -> act.start.hide(); it.open() }
        setOnLongClickListener { v -> itemMenu(v, it); true }
        tag = it.key
        // dropping a file on Notepad / Paint / PDF shortcuts opens it there
        val target = Builtin.byKey(it.key.removePrefix("b:"))?.takeIf { b ->
            b == Builtin.NOTEPAD || b == Builtin.PAINT || b == Builtin.PDF
        }
        if (target != null) setOnDragListener { v, e ->
            val payload = DragFiles.payload(e) ?: return@setOnDragListener false
            when (e.action) {
                DragEvent.ACTION_DRAG_ENTERED -> {
                    DragFiles.track(v, e)
                    v.background = pressable(rounded(Th.p.selection, dpf(6)), dpf(6))
                }
                DragEvent.ACTION_DRAG_LOCATION -> DragFiles.track(v, e)
                DragEvent.ACTION_DRAG_EXITED, DragEvent.ACTION_DRAG_ENDED -> v.background = pressable(null, dpf(6))
                DragEvent.ACTION_DROP -> payload.files.firstOrNull { f -> f.isFile }?.let { f -> act.windows.open(target, f) }
            }
            true
        }
    }

    private fun arrange() {
        val h = if (height > 0) height else act.resources.displayMetrics.heightPixels - dp(60)
        val rows = ((h - dp(8)) / cellH).coerceAtLeast(1)
        for (i in 0 until childCount) {
            val c = getChildAt(i)
            c.x = (dp(6) + (i / rows) * cellW).toFloat()
            c.y = (dp(6) + (i % rows) * cellH).toFloat()
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        post { arrange() }
    }

    private fun itemMenu(anchor: View, it: Item) {
        val pm = PopupMenu(act, anchor)
        pm.menu.add(0, 1, 0, R.string.open)
        if (it.key.startsWith("a:")) pm.menu.add(0, 2, 1, R.string.remove_desktop)
        if (!Prefs.pinned.contains(it.key) && it.key != "pc") pm.menu.add(0, 3, 2, R.string.pin_taskbar)
        pm.setOnMenuItemClickListener { mi ->
            when (mi.itemId) {
                1 -> it.open()
                2 -> {
                    Prefs.desktop = Prefs.desktop.apply { remove(it.key) }
                    refresh()
                }
                3 -> {
                    Prefs.pinned = Prefs.pinned.apply { add(it.key) }
                    act.taskbar.refresh()
                }
            }
            true
        }
        pm.show()
    }

    private fun desktopMenu() {
        val anchor = View(act)
        addView(anchor, LayoutParams(1, 1))
        anchor.x = width / 2f
        anchor.y = height / 2f
        val pm = PopupMenu(act, anchor)
        pm.menu.add(0, 1, 0, R.string.refresh)
        pm.menu.add(0, 2, 1, R.string.personalize)
        pm.menu.add(0, 3, 2, R.string.display_settings)
        pm.setOnMenuItemClickListener {
            when (it.itemId) {
                1 -> refresh()
                2 -> act.windows.open(Builtin.SETTINGS)
                3 -> act.openSystem(android.provider.Settings.ACTION_DISPLAY_SETTINGS)
            }
            true
        }
        pm.setOnDismissListener { removeView(anchor) }
        anchor.post { pm.show() }
    }
}
