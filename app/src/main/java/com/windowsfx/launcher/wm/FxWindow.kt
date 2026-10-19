package com.windowsfx.launcher.wm

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.SystemClock
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.windowsfx.launcher.DesktopActivity
import com.windowsfx.launcher.apps.Builtin
import com.windowsfx.launcher.core.Th
import com.windowsfx.launcher.core.W
import com.windowsfx.launcher.core.dp
import com.windowsfx.launcher.core.dpf
import com.windowsfx.launcher.core.pressable
import com.windowsfx.launcher.core.rounded
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** A movable, resizable window inside the WindowsFX desktop. */
@SuppressLint("ViewConstructor", "ClickableViewAccessibility")
class FxWindow(val act: DesktopActivity, private val host: WindowHost, val app: Builtin) : LinearLayout(act) {

    private val titleView: TextView
    private val bar: LinearLayout
    private val body = FrameLayout(act)
    private val grip: View
    var title: String = act.getString(app.title)
        private set

    var maximized = false
        private set
    private var savedX = 0f
    private var savedY = 0f
    private var savedW = 0
    private var savedH = 0

    /** Return false to keep the window open (e.g. to ask about unsaved changes). */
    var onCloseRequest: (() -> Boolean)? = null
    var onClosed: (() -> Unit)? = null
    /** Called when the same app is asked to open something new while this window exists. */
    var onArgument: ((Any) -> Unit)? = null

    private val radius = dpf(10)

    init {
        orientation = VERTICAL
        background = rounded(Th.p.surface, radius, 1, Th.p.border)
        elevation = dpf(20)
        outlineProvider = ViewOutlineProvider.BACKGROUND
        clipToOutline = true

        bar = W.hbox(act).apply {
            setPadding(dp(10), 0, 0, 0)
            setBackgroundColor(Th.p.surface2)
        }
        val icon = ImageView(act).apply { setImageResource(app.icon) }
        bar.addView(icon, LayoutParams(dp(16), dp(16)))
        titleView = W.text(act, title, 12.5f, Th.p.text).apply { setPadding(dp(8), 0, dp(8), 0) }
        bar.addView(titleView, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
        bar.addView(capButton("—", false) { host.minimize(this) })
        bar.addView(capButton("☐", false) { toggleMaximize() })
        bar.addView(capButton("✕", true) { host.close(this) })
        addView(bar, LayoutParams(LayoutParams.MATCH_PARENT, dp(36)))

        addView(body, LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))

        grip = W.text(act, "◢", 11f, Th.p.textDim).apply {
            gravity = Gravity.CENTER
            alpha = 0.7f
        }
        body.addView(grip, FrameLayout.LayoutParams(dp(26), dp(26), Gravity.BOTTOM or Gravity.END))

        setupDrag()
        setupResize()
    }

    private fun capButton(glyph: String, danger: Boolean, onClick: () -> Unit): TextView =
        W.text(act, glyph, 13f, Th.p.text).apply {
            gravity = Gravity.CENTER
            background = if (danger) android.graphics.drawable.RippleDrawable(
                android.content.res.ColorStateList.valueOf(0xFFE81123.toInt()), null,
                android.graphics.drawable.ColorDrawable(Color.WHITE),
            ) else pressable(null, 0f)
            isClickable = true
            setOnClickListener { onClick() }
            layoutParams = LayoutParams(dp(46), LayoutParams.MATCH_PARENT)
        }

    fun setContent(v: View) {
        body.addView(v, 0, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    }

    fun setTitle(s: String) {
        title = s
        titleView.text = s
        host.changed()
    }

    fun setActive(active: Boolean) {
        titleView.alpha = if (active) 1f else 0.55f
        elevation = dpf(if (active) 24 else 8)
    }

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
        if (ev.actionMasked == MotionEvent.ACTION_DOWN) host.focus(this)
        return false
    }

    // ---------------------------------------------------------------- maximize

    fun maximize() {
        if (maximized) return
        savedX = x; savedY = y; savedW = layoutParams.width; savedH = layoutParams.height
        maximized = true
        applyBounds(0f, 0f, host.width, host.height)
        background = rounded(Th.p.surface, 0f)
        grip.visibility = GONE
    }

    fun restoreSize() {
        if (!maximized) return
        maximized = false
        background = rounded(Th.p.surface, radius, 1, Th.p.border)
        grip.visibility = VISIBLE
        applyBounds(savedX, savedY, savedW, savedH)
    }

    fun toggleMaximize() = if (maximized) restoreSize() else maximize()

    fun applyBounds(nx: Float, ny: Float, w: Int, h: Int) {
        val lp = layoutParams ?: FrameLayout.LayoutParams(w, h)
        lp.width = w
        lp.height = h
        layoutParams = lp
        x = nx
        y = ny
    }

    /** Called by the host when the desktop area changes size (rotation, keyboard...). */
    fun fitInto(w: Int, h: Int) {
        if (maximized) {
            applyBounds(0f, 0f, w, h)
            return
        }
        val lp = layoutParams ?: return
        val nw = min(lp.width, w)
        val nh = min(lp.height, h)
        applyBounds(x.coerceIn(0f, max(0f, (w - nw).toFloat())), y.coerceIn(0f, max(0f, (h - nh).toFloat())), nw, nh)
    }

    /** Left / right half snapping, like Windows. */
    private fun snap(left: Boolean) {
        if (!maximized) { savedX = x; savedY = y; savedW = layoutParams.width; savedH = layoutParams.height }
        maximized = false
        background = rounded(Th.p.surface, radius, 1, Th.p.border)
        grip.visibility = VISIBLE
        val half = host.width / 2
        applyBounds(if (left) 0f else half.toFloat(), 0f, half, host.height)
    }

    // ---------------------------------------------------------------- gestures

    private fun setupDrag() {
        val slop = ViewConfiguration.get(act).scaledTouchSlop
        var downX = 0f
        var downY = 0f
        var startX = 0f
        var startY = 0f
        var dragging = false
        var lastTap = 0L
        bar.setOnTouchListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    host.focus(this)
                    downX = e.rawX; downY = e.rawY; startX = x; startY = y
                    dragging = false
                    val now = SystemClock.uptimeMillis()
                    if (now - lastTap < 320) {
                        lastTap = 0
                        toggleMaximize()
                        return@setOnTouchListener true
                    }
                    lastTap = now
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX
                    val dy = e.rawY - downY
                    if (!dragging && (abs(dx) > slop || abs(dy) > slop)) {
                        dragging = true
                        lastTap = 0
                        if (maximized) {
                            // restore under the finger, keeping the grab point proportional
                            val ratio = (downX - host.screenX()) / max(1, host.width).toFloat()
                            restoreSize()
                            startX = downX - host.screenX() - layoutParams.width * ratio
                            startY = 0f
                        }
                    }
                    if (dragging) {
                        val w = layoutParams.width
                        x = (startX + dx).coerceIn((-w + dp(90)).toFloat(), (host.width - dp(90)).toFloat())
                        y = (startY + dy).coerceIn(0f, (host.height - dp(36)).toFloat())
                    }
                }
                MotionEvent.ACTION_UP -> {
                    if (dragging) {
                        val rx = e.rawX - host.screenX()
                        val ry = e.rawY - host.screenY()
                        when {
                            ry < dp(6) -> maximize()
                            rx < dp(6) -> snap(true)
                            rx > host.width - dp(6) -> snap(false)
                        }
                    }
                }
            }
            true
        }
    }

    private fun setupResize() {
        var downX = 0f
        var downY = 0f
        var startW = 0
        var startH = 0
        grip.setOnTouchListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    host.focus(this)
                    downX = e.rawX; downY = e.rawY
                    startW = layoutParams.width; startH = layoutParams.height
                }
                MotionEvent.ACTION_MOVE -> {
                    val w = (startW + (e.rawX - downX)).toInt().coerceIn(dp(240), max(dp(240), (host.width - x).toInt()))
                    val h = (startH + (e.rawY - downY)).toInt().coerceIn(dp(160), max(dp(160), (host.height - y).toInt()))
                    val lp = layoutParams
                    lp.width = w
                    lp.height = h
                    layoutParams = lp
                }
            }
            true
        }
    }
}
