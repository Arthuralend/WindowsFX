package com.windowsfx.launcher.files

import android.content.ClipData
import android.content.ClipDescription
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Point
import android.view.DragEvent
import android.view.View
import com.windowsfx.launcher.core.Th
import com.windowsfx.launcher.core.dpf
import java.io.File
import kotlin.math.hypot

/** Drag-and-drop of files between Explorer windows, folders and apps. */
object DragFiles {
    const val MIME = "application/x-windowsfx-files"

    class Payload(val files: List<File>, val source: Any?)

    /** Screen position where the drag began, to tell a "long press" from a real drag. */
    var downRawX = 0f
    var downRawY = 0f
    var moved = false
        private set

    fun start(view: View, files: List<File>, source: Any?): Boolean {
        if (files.isEmpty()) return false
        moved = false
        val clip = ClipData(
            ClipDescription("files", arrayOf(MIME)),
            ClipData.Item(files.joinToString("\n") { it.absolutePath }),
        )
        return view.startDragAndDrop(clip, Shadow(view, files.size), Payload(files, source), 0)
    }

    fun payload(e: DragEvent): Payload? = e.localState as? Payload

    /** Call from every drag listener on LOCATION / ENTERED events. */
    fun track(v: View, e: DragEvent) {
        if (moved) return
        val loc = IntArray(2)
        v.getLocationOnScreen(loc)
        val sx = loc[0] + e.x
        val sy = loc[1] + e.y
        if (hypot(sx - downRawX, sy - downRawY) > v.dpf(18)) moved = true
    }

    /** Drag shadow: the dragged row plus a counter badge when several files are dragged. */
    private class Shadow(private val v: View, private val count: Int) : View.DragShadowBuilder(v) {
        private val badge = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Th.p.accent }
        private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textAlign = Paint.Align.CENTER
            textSize = v.dpf(12)
            isFakeBoldText = true
        }

        override fun onProvideShadowMetrics(size: Point, touch: Point) {
            val w = minOf(v.width, v.dpf(320).toInt()).coerceAtLeast(1)
            val h = v.height.coerceAtLeast(1)
            size.set(w, h)
            touch.set(w / 3, h / 2)
        }

        override fun onDrawShadow(c: Canvas) {
            c.saveLayerAlpha(0f, 0f, c.width.toFloat(), c.height.toFloat(), 210)
            c.drawColor(Th.p.surface2)
            v.draw(c)
            c.restore()
            if (count > 1) {
                val r = v.dpf(11)
                val cx = c.width - r - v.dpf(4)
                val cy = r + v.dpf(2)
                c.drawCircle(cx, cy, r, badge)
                c.drawText(count.toString(), cx, cy + text.textSize / 3, text)
            }
        }
    }
}
