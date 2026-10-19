package com.windowsfx.launcher

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.view.PointerIcon
import android.webkit.WebView
import kotlin.math.roundToInt

/** WebView with WindowsFX mouse pointers: the system arrow (a round dot on many tablets),
 *  hand, I-beam and resize pointers are replaced by WindowsFX's own Windows-style set. */
@SuppressLint("ViewConstructor")
class FxWebView(ctx: Context) : WebView(ctx) {
    override fun setPointerIcon(pointerIcon: PointerIcon?) {
        super.setPointerIcon(Cursors.map(context, pointerIcon) ?: pointerIcon)
    }
}

object Cursors {
    /** System pointer type → our image (assets/os/img/cursors) and its hot spot on a 32-px grid. */
    private val TYPES = mapOf(
        PointerIcon.TYPE_ARROW to "arrow", PointerIcon.TYPE_CONTEXT_MENU to "arrow", PointerIcon.TYPE_HELP to "arrow",
        PointerIcon.TYPE_HAND to "hand", PointerIcon.TYPE_WAIT to "wait", PointerIcon.TYPE_CELL to "cross",
        PointerIcon.TYPE_CROSSHAIR to "cross", PointerIcon.TYPE_TEXT to "text", PointerIcon.TYPE_VERTICAL_TEXT to "text",
        PointerIcon.TYPE_ALL_SCROLL to "move", PointerIcon.TYPE_HORIZONTAL_DOUBLE_ARROW to "ew",
        PointerIcon.TYPE_VERTICAL_DOUBLE_ARROW to "ns", PointerIcon.TYPE_TOP_RIGHT_DIAGONAL_DOUBLE_ARROW to "nesw",
        PointerIcon.TYPE_TOP_LEFT_DIAGONAL_DOUBLE_ARROW to "nwse", PointerIcon.TYPE_GRAB to "grab", PointerIcon.TYPE_GRABBING to "grab",
    )
    private val HOT = mapOf(
        "arrow" to (2 to 2), "wait" to (2 to 2), "hand" to (10 to 2), "text" to (16 to 16), "move" to (16 to 16),
        "ew" to (16 to 16), "ns" to (16 to 16), "nwse" to (16 to 16), "nesw" to (16 to 16), "grab" to (16 to 14), "cross" to (16 to 16),
    )
    private val cache = HashMap<String, PointerIcon>()
    private var system: List<Pair<PointerIcon, Int>>? = null
    @Volatile var enabled = true

    fun map(ctx: Context, icon: PointerIcon?): PointerIcon? {
        if (!enabled || icon == null) return null
        val sys = system ?: TYPES.keys.mapNotNull { t -> runCatching { PointerIcon.getSystemIcon(ctx, t) to t }.getOrNull() }.also { system = it }
        val type = sys.firstOrNull { it.first == icon }?.second ?: return null
        val name = TYPES[type] ?: return null
        cache[name]?.let { return it }
        val made = runCatching { load(ctx, name) }.getOrNull() ?: return null
        cache[name] = made
        return made
    }

    private fun load(ctx: Context, name: String): PointerIcon {
        val src: Bitmap = ctx.assets.open("os/img/cursors/$name@2x.png").use { BitmapFactory.decodeStream(it) }
        val density = ctx.resources.displayMetrics.density
        val size = (32 * density).roundToInt().coerceIn(24, 128)
        val bmp = if (size == src.width) src else Bitmap.createScaledBitmap(src, size, size, true)
        val (hx, hy) = HOT[name] ?: (0 to 0)
        val k = size / 32f
        return PointerIcon.create(bmp, (hx * k).coerceIn(0f, size - 1f), (hy * k).coerceIn(0f, size - 1f))
    }
}
