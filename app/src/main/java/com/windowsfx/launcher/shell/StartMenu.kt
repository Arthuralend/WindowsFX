package com.windowsfx.launcher.shell

import android.annotation.SuppressLint
import android.content.Context
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.GridView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.TextView
import com.windowsfx.launcher.DesktopActivity
import com.windowsfx.launcher.R
import com.windowsfx.launcher.apps.Builtin
import com.windowsfx.launcher.core.Prefs
import com.windowsfx.launcher.core.Th
import com.windowsfx.launcher.core.W
import com.windowsfx.launcher.core.dp
import com.windowsfx.launcher.core.dpf
import com.windowsfx.launcher.core.pressable
import com.windowsfx.launcher.core.rounded
import kotlin.math.min

/** Start menu: search, built-in programs and all installed Android apps. */
@SuppressLint("ViewConstructor")
class StartMenu(private val act: DesktopActivity) : FrameLayout(act) {

    private val panel = W.vbox(act)
    private val search: EditText
    private val grid = GridView(act)
    private val adapter = Adapter()
    private var entries: List<AppEntry> = emptyList()
    private var shown: List<AppEntry> = emptyList()
    val isOpen get() = visibility == VISIBLE

    init {
        visibility = GONE
        isClickable = true
        setOnClickListener { hide() } // tap outside the panel closes it

        panel.background = rounded(Th.p.menu, dpf(12), 1, Th.p.border)
        panel.elevation = dpf(30)
        panel.isClickable = true
        panel.setPadding(dp(18), dp(18), dp(18), 0)

        search = EditText(act).apply {
            hint = act.getString(R.string.search_hint)
            setHintTextColor(Th.p.textDim)
            setTextColor(Th.p.text)
            textSize = 14f * com.windowsfx.launcher.core.Ui.scale
            setSingleLine()
            background = rounded(Th.p.surface3, dpf(20), 1, Th.p.border)
            setPadding(dp(16), dp(9), dp(16), dp(9))
            setCompoundDrawablesRelativeWithIntrinsicBounds(
                act.getDrawable(R.drawable.ic_search)?.mutate()?.apply { setTint(Th.p.textDim) }, null, null, null,
            )
            compoundDrawablePadding = dp(10)
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun afterTextChanged(s: Editable?) = filter()
            })
            setOnEditorActionListener { _, _, _ ->
                shown.firstOrNull()?.let { launch(it) }
                true
            }
        }
        panel.addView(search, W.lp(W.MATCH, W.WRAP))

        val header = W.hbox(act).apply { setPadding(dp(4), dp(16), dp(4), dp(8)) }
        header.addView(W.text(act, act.getString(R.string.all_apps), 14f, Th.p.text, bold = true), W.lp(0, W.WRAP, 1f))
        panel.addView(header)

        grid.numColumns = GridView.AUTO_FIT
        grid.columnWidth = dp(92)
        grid.stretchMode = GridView.STRETCH_COLUMN_WIDTH
        grid.verticalSpacing = dp(4)
        grid.selector = android.graphics.drawable.ColorDrawable(0)
        grid.adapter = adapter
        grid.setOnItemClickListener { _, _, pos, _ -> launch(shown[pos]) }
        grid.setOnItemLongClickListener { _, v, pos, _ -> itemMenu(v, shown[pos]); true }
        panel.addView(grid, W.lp(W.MATCH, 0, 1f))

        // footer: brand + quick buttons
        val footer = W.hbox(act).apply {
            setPadding(0, dp(8), 0, dp(8))
        }
        val divider = View(act).apply { setBackgroundColor(Th.p.border) }
        panel.addView(divider, W.lp(W.MATCH, 1).apply { setMargins(-dp(18), 0, -dp(18), 0) })
        val brand = W.hbox(act)
        brand.addView(ImageView(act).apply { setImageResource(R.drawable.ic_logo) }, W.lp(dp(22), dp(22)))
        brand.addView(W.text(act, "WindowsFX", 13f, Th.p.text, bold = true).apply { setPadding(dp(10), 0, 0, 0) })
        footer.addView(brand, W.lp(0, W.WRAP, 1f))
        footer.addView(W.iconButton(act, R.drawable.ic_app_explorer, act.getString(R.string.app_explorer), null, 38) {
            hide(); act.windows.open(Builtin.EXPLORER)
        })
        footer.addView(W.iconButton(act, R.drawable.ic_gear, act.getString(R.string.app_settings), Th.p.text, 38) {
            hide(); act.windows.open(Builtin.SETTINGS)
        })
        footer.addView(W.iconButton(act, R.drawable.ic_power, act.getString(R.string.power), Th.p.text, 38) { v ->
            powerMenu(v)
        })
        panel.addView(footer, W.lp(W.MATCH, W.WRAP))

        addView(panel, LayoutParams(dp(600), dp(640), Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL))
    }

    fun toggle() = if (isOpen) hide() else show()

    fun show(focusSearch: Boolean = false) {
        reload()
        val lp = panel.layoutParams as LayoutParams
        val pw = if (width > 0) width else act.resources.displayMetrics.widthPixels
        val ph = if (height > 0) height else act.resources.displayMetrics.heightPixels
        lp.width = min(dp(640), pw - dp(16))
        lp.height = min(dp(700), ph - dp(16))
        lp.bottomMargin = dp(8)
        panel.layoutParams = lp
        search.setText("")
        visibility = VISIBLE
        bringToFront()
        panel.translationY = dpf(60)
        panel.alpha = 0f
        panel.animate().translationY(0f).alpha(1f).setDuration(170).start()
        if (focusSearch) {
            search.requestFocus()
            post {
                (act.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
                    .showSoftInput(search, InputMethodManager.SHOW_IMPLICIT)
            }
        }
        if (AndroidApps.list.isEmpty()) AndroidApps.load(act) { if (isOpen) reload() }
    }

    fun hide() {
        if (!isOpen) return
        (act.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(windowToken, 0)
        search.clearFocus()
        panel.animate().translationY(dpf(60)).alpha(0f).setDuration(130).withEndAction { visibility = GONE }.start()
    }

    private fun reload() {
        entries = Builtin.values().map { AndroidApps.builtinEntry(act, it) } + AndroidApps.list
        filter()
    }

    private fun filter() {
        val q = search.text?.toString()?.trim()?.lowercase() ?: ""
        shown = if (q.isEmpty()) entries else entries.filter { it.label.lowercase().contains(q) }
        adapter.notifyDataSetChanged()
    }

    private fun launch(e: AppEntry) {
        hide()
        val b = e.builtin
        if (b != null) act.windows.open(b) else e.component?.let { AndroidApps.launch(act, it) }
    }

    private fun itemMenu(anchor: View, e: AppEntry) {
        val pm = PopupMenu(act, anchor)
        val pinned = Prefs.pinned.contains(e.key)
        pm.menu.add(0, 1, 0, if (pinned) R.string.unpin_taskbar else R.string.pin_taskbar)
        val onDesk = Prefs.desktop.contains(e.key)
        if (e.component != null) {
            pm.menu.add(0, 2, 1, if (onDesk) R.string.remove_desktop else R.string.add_desktop)
            pm.menu.add(0, 3, 2, R.string.app_info)
            pm.menu.add(0, 4, 3, R.string.uninstall)
        }
        pm.setOnMenuItemClickListener {
            when (it.itemId) {
                1 -> {
                    val l = Prefs.pinned
                    if (pinned) l.remove(e.key) else l.add(e.key)
                    Prefs.pinned = l
                    act.taskbar.refresh()
                }
                2 -> {
                    val l = Prefs.desktop
                    if (onDesk) l.remove(e.key) else l.add(e.key)
                    Prefs.desktop = l
                    act.desktop.refresh()
                }
                3 -> e.component?.let { c -> AndroidApps.appInfo(act, c.packageName) }
                4 -> e.component?.let { c -> AndroidApps.uninstall(act, c.packageName) }
            }
            true
        }
        pm.show()
    }

    private fun powerMenu(anchor: View) {
        val pm = PopupMenu(act, anchor)
        pm.menu.add(0, 1, 0, R.string.close_all_windows)
        pm.menu.add(0, 2, 1, R.string.choose_home_app)
        pm.setOnMenuItemClickListener {
            hide()
            when (it.itemId) {
                1 -> act.windows.closeAll()
                2 -> act.openSystem(android.provider.Settings.ACTION_HOME_SETTINGS)
            }
            true
        }
        pm.show()
    }

    private inner class Adapter : BaseAdapter() {
        override fun getCount() = shown.size
        override fun getItem(p: Int) = shown[p]
        override fun getItemId(p: Int) = p.toLong()
        override fun getView(p: Int, convert: View?, parent: ViewGroup?): View {
            val v = (convert as? LinearLayout) ?: W.vbox(act).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                setPadding(dp(4), dp(10), dp(4), dp(8))
                background = pressable(null, dpf(8))
                addView(ImageView(act), W.lp(dp(40), dp(40)))
                addView(W.text(act, "", 12f, Th.p.text, lines = 2).apply {
                    gravity = Gravity.CENTER
                    setPadding(0, dp(6), 0, 0)
                }, W.lp(W.MATCH, W.WRAP))
            }
            val e = shown[p]
            (v.getChildAt(0) as ImageView).setImageDrawable(e.icon)
            (v.getChildAt(1) as TextView).text = e.label
            return v
        }
    }
}
