package com.windowsfx.launcher.wm

import android.annotation.SuppressLint
import android.view.View
import android.widget.FrameLayout
import com.windowsfx.launcher.DesktopActivity
import com.windowsfx.launcher.apps.Apps
import com.windowsfx.launcher.apps.Builtin
import com.windowsfx.launcher.core.dp
import kotlin.math.min

/** Holds all WindowsFX windows (the desktop area above the taskbar). */
@SuppressLint("ViewConstructor")
class WindowHost(private val act: DesktopActivity) : FrameLayout(act) {

    /** Z-order: last element is on top. */
    val windows = mutableListOf<FxWindow>()
    var onChanged: (() -> Unit)? = null
    private var cascade = 0

    fun changed() {
        onChanged?.invoke()
    }

    fun screenX(): Float {
        val loc = IntArray(2)
        getLocationOnScreen(loc)
        return loc[0].toFloat()
    }

    fun screenY(): Float {
        val loc = IntArray(2)
        getLocationOnScreen(loc)
        return loc[1].toFloat()
    }

    fun open(app: Builtin, arg: Any? = null): FxWindow {
        if (app.single) {
            windows.firstOrNull { it.app == app }?.let { w ->
                restore(w)
                if (arg != null) w.onArgument?.invoke(arg)
                return w
            }
        }
        val w = FxWindow(act, this, app)
        w.setContent(Apps.create(act, app, w, arg))

        val hw = if (width > 0) width else act.resources.displayMetrics.widthPixels
        val hh = if (height > 0) height else act.resources.displayMetrics.heightPixels - dp(52)
        val ww = min(dp(app.defW), hw - dp(16))
        val wh = min(dp(app.defH), hh - dp(16))
        addView(w, LayoutParams(ww, wh))
        val off = dp(28) * (cascade++ % 6)
        w.x = ((hw - ww) / 2 + off - dp(56)).coerceAtLeast(0).toFloat().coerceAtMost((hw - ww).toFloat().coerceAtLeast(0f))
        w.y = ((hh - wh) / 2 + off - dp(56)).coerceAtLeast(0).toFloat().coerceAtMost((hh - wh).toFloat().coerceAtLeast(0f))

        windows.add(w)
        if (hw < dp(700)) post { w.maximize() }

        w.alpha = 0f
        w.scaleX = 0.94f
        w.scaleY = 0.94f
        w.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(160).start()
        focus(w)
        return w
    }

    fun focus(w: FxWindow) {
        if (windows.lastOrNull() !== w) {
            windows.remove(w)
            windows.add(w)
            w.bringToFront()
        }
        windows.forEach { it.setActive(it === w && it.visibility == View.VISIBLE) }
        changed()
    }

    fun minimize(w: FxWindow) {
        w.animate().alpha(0f).translationYBy(dp(40).toFloat()).setDuration(140).withEndAction {
            w.visibility = View.GONE
            w.alpha = 1f
            w.translationY -= dp(40)
            topVisible()?.let { focus(it) } ?: changed()
        }.start()
    }

    fun restore(w: FxWindow) {
        if (w.visibility != View.VISIBLE) {
            w.visibility = View.VISIBLE
            w.alpha = 0f
            w.animate().alpha(1f).setDuration(140).start()
        }
        focus(w)
    }

    fun close(w: FxWindow, force: Boolean = false) {
        if (!force && w.onCloseRequest?.invoke() == false) return
        windows.remove(w)
        w.animate().alpha(0f).scaleX(0.95f).scaleY(0.95f).setDuration(120).withEndAction {
            removeView(w)
        }.start()
        try {
            w.onClosed?.invoke()
        } catch (_: Throwable) {
        }
        topVisible()?.let { focus(it) } ?: changed()
    }

    fun topVisible(): FxWindow? = windows.lastOrNull { it.visibility == View.VISIBLE }

    fun isActive(w: FxWindow): Boolean = topVisible() === w

    fun minimizeAll() {
        windows.filter { it.visibility == View.VISIBLE }.forEach { minimize(it) }
    }

    fun closeAll() {
        windows.toList().forEach { close(it, force = true) }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w > 0 && h > 0) post { windows.forEach { it.fitInto(w, h) } }
    }
}
