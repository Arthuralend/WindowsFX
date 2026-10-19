package com.windowsfx.launcher.apps

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.media.MediaScannerConnection
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import com.windowsfx.launcher.DesktopActivity
import com.windowsfx.launcher.R
import com.windowsfx.launcher.core.Th
import com.windowsfx.launcher.core.W
import com.windowsfx.launcher.core.dp
import com.windowsfx.launcher.core.dpf
import com.windowsfx.launcher.core.pressable
import com.windowsfx.launcher.core.rounded
import com.windowsfx.launcher.files.Files
import com.windowsfx.launcher.files.Storage
import com.windowsfx.launcher.wm.FxWindow
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** Paint: brush, line, rectangle, ellipse, fill, eraser, colors, undo, open / save PNG. */
@SuppressLint("ViewConstructor")
class PaintView(private val act: DesktopActivity, private val win: FxWindow, start: File?) : LinearLayout(act) {

    enum class Tool { BRUSH, LINE, RECT, OVAL, FILL, ERASER }

    private val canvasView = PaintCanvas(act)
    private val toolButtons = mutableMapOf<Tool, TextView>()
    private val colorViews = mutableListOf<View>()
    private val status = W.statusBar(act)
    private var file: File? = null
    private val main = Handler(Looper.getMainLooper())

    private val palette = intArrayOf(
        Color.BLACK, 0xFF7F7F7F.toInt(), Color.WHITE, 0xFFED1C24.toInt(), 0xFFFF7F27.toInt(), 0xFFFFF200.toInt(),
        0xFF22B14C.toInt(), 0xFF00A2E8.toInt(), 0xFF3F48CC.toInt(), 0xFFA349A4.toInt(), 0xFFB97A57.toInt(), 0xFFFFAEC9.toInt(),
    )

    init {
        orientation = VERTICAL
        setBackgroundColor(Th.p.surface)

        val tb = W.toolbar(act)
        tb.addView(W.tool(act, act.getString(R.string.new_doc)) { canvasView.newImage(); file = null; updateTitle() })
        tb.addView(W.tool(act, act.getString(R.string.open)) { act.pickDocument("image/*") { uri -> canvasView.loadUri(uri) } })
        tb.addView(W.tool(act, act.getString(R.string.save)) { save() })
        tb.addView(W.tool(act, "↶ " + act.getString(R.string.undo)) { canvasView.undo() })
        tb.addView(W.divider(act, vertical = true))
        addTool(tb, Tool.BRUSH, "✎", R.string.tool_brush)
        addTool(tb, Tool.LINE, "╱", R.string.tool_line)
        addTool(tb, Tool.RECT, "▭", R.string.tool_rect)
        addTool(tb, Tool.OVAL, "◯", R.string.tool_oval)
        addTool(tb, Tool.FILL, "◧", R.string.tool_fill)
        addTool(tb, Tool.ERASER, "⌫", R.string.tool_eraser)
        tb.addView(W.divider(act, vertical = true))
        palette.forEach { c ->
            val v = View(act).apply {
                isClickable = true
                setOnClickListener { selectColor(c) }
                tag = c
            }
            colorViews.add(v)
            tb.addView(v, W.lp(dp(24), dp(24)).apply { setMargins(dp(3), 0, dp(3), 0) })
        }
        tb.addView(W.divider(act, vertical = true))
        tb.addView(W.text(act, act.getString(R.string.size), 12f, Th.p.textDim).apply { setPadding(dp(6), 0, dp(4), 0) })
        val seek = SeekBar(act).apply {
            max = 60
            progress = 6
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(s: SeekBar?, p: Int, user: Boolean) {
                    canvasView.stroke = max(1, p).toFloat()
                }
                override fun onStartTrackingTouch(s: SeekBar?) {}
                override fun onStopTrackingTouch(s: SeekBar?) {}
            })
        }
        tb.addView(seek, W.lp(dp(130), W.WRAP))

        val scroll = HorizontalScrollView(act).apply {
            isHorizontalScrollBarEnabled = false
            setBackgroundColor(Th.p.surface2)
            addView(tb)
        }
        addView(scroll, W.lp(W.MATCH, W.WRAP))
        canvasView.setBackgroundColor(if (Th.p.dark) 0xFF15182A.toInt() else 0xFFD9DCE8.toInt())
        addView(canvasView, W.lp(W.MATCH, 0, 1f))
        addView(status, W.lp(W.MATCH, W.WRAP))

        selectTool(Tool.BRUSH)
        selectColor(Color.BLACK)
        canvasView.stroke = 6f
        win.onArgument = { a -> (a as? File)?.let { load(it) } }
        if (start != null) post { load(start) }
        updateTitle()
    }

    private fun addTool(tb: LinearLayout, t: Tool, glyph: String, name: Int) {
        val b = W.text(act, glyph, 16f).apply {
            gravity = Gravity.CENTER
            isClickable = true
            setOnClickListener { selectTool(t) }
            setOnLongClickListener { W.toast(act, act.getString(name)); true }
            contentDescription = act.getString(name)
        }
        toolButtons[t] = b
        tb.addView(b, W.lp(dp(36), dp(34)))
    }

    private fun selectTool(t: Tool) {
        canvasView.tool = t
        toolButtons.forEach { (k, v) ->
            v.background = pressable(if (k == t) rounded(Th.p.selection, dpf(6)) else null, dpf(6))
        }
    }

    private fun selectColor(c: Int) {
        canvasView.color = c
        colorViews.forEach { v ->
            val sel = v.tag == c
            v.background = rounded(v.tag as Int, dpf(12), dp(if (sel) 3 else 1), if (sel) Th.p.accent else Th.p.border)
        }
    }

    private fun updateTitle() {
        win.setTitle((file?.name ?: act.getString(R.string.untitled)) + " — " + act.getString(R.string.app_paint))
        status.text = canvasView.bitmap?.let { "${it.width} × ${it.height} px" } ?: ""
    }

    private fun load(f: File) {
        if (canvasView.loadFile(f)) {
            file = f
            updateTitle()
        } else W.toast(act, act.getString(R.string.failed))
    }

    private fun save() {
        val bmp = canvasView.bitmap ?: return
        if (!Storage.hasAccess(act)) {
            Storage.request(act)
            return
        }
        val target = file?.takeIf { Files.ext(it) in setOf("png", "jpg", "jpeg", "webp") } ?: run {
            val dir = File(Storage.publicDir(Environment.DIRECTORY_PICTURES), "WindowsFX")
            dir.mkdirs()
            File(dir, "paint_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date()) + ".png")
        }
        Thread {
            val ok = try {
                target.outputStream().use {
                    val fmt = when (Files.ext(target)) {
                        "jpg", "jpeg" -> Bitmap.CompressFormat.JPEG
                        "webp" -> @Suppress("DEPRECATION") Bitmap.CompressFormat.WEBP
                        else -> Bitmap.CompressFormat.PNG
                    }
                    bmp.compress(fmt, 95, it)
                }
                true
            } catch (_: Exception) {
                false
            }
            main.post {
                if (ok) {
                    file = target
                    updateTitle()
                    MediaScannerConnection.scanFile(act, arrayOf(target.absolutePath), null, null)
                    W.toast(act, act.getString(R.string.saved_to, target.parentFile?.name ?: ""))
                } else W.toast(act, act.getString(R.string.failed))
            }
        }.start()
    }

    /** The drawing surface. The bitmap is shown fit-to-view; touches are mapped back to bitmap pixels. */
    inner class PaintCanvas(ctx: Context) : View(ctx) {
        var bitmap: Bitmap? = null
            private set
        private var cv: Canvas? = null
        var tool = Tool.BRUSH
        var color = Color.BLACK
        var stroke = 6f
        private val undoStack = ArrayList<Bitmap>()
        private val toView = Matrix()
        private val toBmp = Matrix()
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
        }
        private val shadow = Paint().apply { color = 0x40000000 }
        private var sx = 0f
        private var sy = 0f
        private var lx = 0f
        private var ly = 0f
        private var drawingShape = false

        fun newImage(w: Int = width, h: Int = height) {
            val bw = if (w > 0) w else 1280
            val bh = if (h > 0) h else 800
            setBitmap(Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.WHITE) })
            undoStack.clear()
        }

        private fun setBitmap(b: Bitmap) {
            bitmap = b
            cv = Canvas(b)
            computeMatrix()
            invalidate()
            updateTitle()
        }

        fun loadFile(f: File): Boolean = decode { opts -> BitmapFactory.decodeFile(f.absolutePath, opts) }

        fun loadUri(uri: android.net.Uri) {
            val ok = decode { opts -> act.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) } }
            if (ok) {
                file = null
                updateTitle()
            } else W.toast(act, act.getString(R.string.failed))
        }

        private fun decode(src: (BitmapFactory.Options) -> Bitmap?): Boolean {
            return try {
                val b = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                src(b)
                if (b.outWidth <= 0) return false
                var sample = 1
                while (max(b.outWidth, b.outHeight) / sample > 4096) sample *= 2
                val bmp = src(BitmapFactory.Options().apply { inSampleSize = sample; inMutable = true }) ?: return false
                val mutable = if (bmp.isMutable && bmp.config == Bitmap.Config.ARGB_8888) bmp else bmp.copy(Bitmap.Config.ARGB_8888, true)
                undoStack.clear()
                setBitmap(mutable)
                true
            } catch (_: Throwable) {
                false
            }
        }

        fun undo() {
            if (undoStack.isEmpty()) return
            val b = undoStack.removeAt(undoStack.size - 1)
            bitmap = b
            cv = Canvas(b)
            invalidate()
        }

        private fun pushUndo() {
            val b = bitmap ?: return
            undoStack.add(b.copy(Bitmap.Config.ARGB_8888, true))
            if (undoStack.size > 15) undoStack.removeAt(0)
        }

        private fun computeMatrix() {
            val b = bitmap ?: return
            if (width == 0 || height == 0) return
            val pad = dpf(8)
            val s = min((width - 2 * pad) / b.width, (height - 2 * pad) / b.height).coerceAtMost(1f)
            val dx = (width - b.width * s) / 2
            val dy = (height - b.height * s) / 2
            toView.reset()
            toView.postScale(s, s)
            toView.postTranslate(dx, dy)
            toView.invert(toBmp)
        }

        override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
            super.onSizeChanged(w, h, oldw, oldh)
            if (bitmap == null && w > 0 && h > 0) newImage(w - dp(16), h - dp(16)) else computeMatrix()
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val b = bitmap ?: return
            val r = RectF(0f, 0f, b.width.toFloat(), b.height.toFloat())
            toView.mapRect(r)
            canvas.drawRect(r.left + 3, r.top + 3, r.right + 3, r.bottom + 3, shadow)
            canvas.drawBitmap(b, toView, null)
            if (drawingShape) {
                canvas.save()
                canvas.concat(toView)
                drawShape(canvas)
                canvas.restore()
            }
        }

        private fun configurePaint() {
            paint.color = if (tool == Tool.ERASER) Color.WHITE else color
            paint.strokeWidth = if (tool == Tool.ERASER) stroke * 3 else stroke
        }

        private fun drawShape(c: Canvas) {
            configurePaint()
            when (tool) {
                Tool.LINE -> c.drawLine(sx, sy, lx, ly, paint)
                Tool.RECT -> c.drawRect(min(sx, lx), min(sy, ly), max(sx, lx), max(sy, ly), paint)
                Tool.OVAL -> c.drawOval(min(sx, lx), min(sy, ly), max(sx, lx), max(sy, ly), paint)
                else -> {}
            }
        }

        @SuppressLint("ClickableViewAccessibility")
        override fun onTouchEvent(e: MotionEvent): Boolean {
            val b = bitmap ?: return false
            val pts = floatArrayOf(e.x, e.y)
            toBmp.mapPoints(pts)
            val x = pts[0]
            val y = pts[1]
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    parent?.requestDisallowInterceptTouchEvent(true)
                    pushUndo()
                    sx = x; sy = y; lx = x; ly = y
                    when (tool) {
                        Tool.FILL -> {
                            floodFill(b, x.toInt(), y.toInt(), color)
                            invalidate()
                        }
                        Tool.BRUSH, Tool.ERASER -> {
                            configurePaint()
                            cv?.drawPoint(x, y, paint)
                            invalidate()
                        }
                        else -> drawingShape = true
                    }
                }
                MotionEvent.ACTION_MOVE -> {
                    if (tool == Tool.BRUSH || tool == Tool.ERASER) {
                        configurePaint()
                        for (i in 0 until e.historySize) {
                            val hp = floatArrayOf(e.getHistoricalX(i), e.getHistoricalY(i))
                            toBmp.mapPoints(hp)
                            cv?.drawLine(lx, ly, hp[0], hp[1], paint)
                            lx = hp[0]; ly = hp[1]
                        }
                        cv?.drawLine(lx, ly, x, y, paint)
                    }
                    lx = x; ly = y
                    invalidate()
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (drawingShape) {
                        lx = x; ly = y
                        cv?.let { drawShape(it) }
                        drawingShape = false
                    }
                    invalidate()
                }
            }
            return true
        }

        private fun floodFill(b: Bitmap, x0: Int, y0: Int, newColor: Int) {
            val w = b.width
            val h = b.height
            if (x0 !in 0 until w || y0 !in 0 until h) return
            val px = IntArray(w * h)
            b.getPixels(px, 0, w, 0, 0, w, h)
            val target = px[y0 * w + x0]
            if (target == newColor) return
            fun same(c: Int): Boolean {
                if (c == target) return true
                val dr = abs(Color.red(c) - Color.red(target))
                val dg = abs(Color.green(c) - Color.green(target))
                val db = abs(Color.blue(c) - Color.blue(target))
                return dr + dg + db < 60
            }
            if (same(newColor)) return
            val stack = ArrayDeque<Int>()
            stack.addLast(y0 * w + x0)
            while (stack.isNotEmpty()) {
                val idx = stack.removeLast()
                var x = idx % w
                val y = idx / w
                while (x >= 0 && same(px[y * w + x])) x--
                x++
                var up = false
                var down = false
                while (x < w && same(px[y * w + x])) {
                    px[y * w + x] = newColor
                    if (y > 0) {
                        val s = same(px[(y - 1) * w + x])
                        if (s && !up) { stack.addLast((y - 1) * w + x); up = true } else if (!s) up = false
                    }
                    if (y < h - 1) {
                        val s = same(px[(y + 1) * w + x])
                        if (s && !down) { stack.addLast((y + 1) * w + x); down = true } else if (!s) down = false
                    }
                    x++
                }
            }
            b.setPixels(px, 0, w, 0, 0, w, h)
        }
    }
}
