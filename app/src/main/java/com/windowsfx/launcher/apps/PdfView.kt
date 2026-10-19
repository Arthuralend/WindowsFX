package com.windowsfx.launcher.apps

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import android.util.LruCache
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.AbsListView
import android.widget.BaseAdapter
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import com.windowsfx.launcher.DesktopActivity
import com.windowsfx.launcher.R
import com.windowsfx.launcher.core.Th
import com.windowsfx.launcher.core.W
import com.windowsfx.launcher.core.dp
import com.windowsfx.launcher.wm.FxWindow
import java.io.File
import java.util.concurrent.Executors

/** PDF viewer built on Android's PdfRenderer: zoom, page counter, open from Explorer or picker. */
@SuppressLint("ViewConstructor")
class PdfView(private val act: DesktopActivity, private val win: FxWindow, start: File?) : LinearLayout(act) {

    private var pfd: ParcelFileDescriptor? = null
    private var renderer: PdfRenderer? = null
    private var pageCount = 0
    private var aspects = FloatArray(0)
    private var zoom = 1f
    private var generation = 0
    private val exec = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val cache = object : LruCache<Int, Bitmap>((Runtime.getRuntime().maxMemory() / 6).toInt()) {
        override fun sizeOf(key: Int, value: Bitmap) = value.byteCount
    }
    private val list = ListView(act)
    private val hscroll = HorizontalScrollView(act)
    private val zoomLabel: TextView
    private val pageLabel: TextView
    private val empty: TextView
    private val adapter = PageAdapter()

    init {
        orientation = VERTICAL
        setBackgroundColor(Th.p.surface)
        val tb = W.toolbar(act)
        tb.addView(W.tool(act, act.getString(R.string.open)) { act.pickDocument("application/pdf") { openUri(it) } })
        tb.addView(W.divider(act, vertical = true))
        tb.addView(W.tool(act, "−") { setZoom(zoom / 1.25f) })
        zoomLabel = W.text(act, "100%", 12.5f).apply { gravity = Gravity.CENTER }
        tb.addView(zoomLabel, W.lp(dp(52), W.WRAP))
        tb.addView(W.tool(act, "+") { setZoom(zoom * 1.25f) })
        tb.addView(W.tool(act, act.getString(R.string.fit_width)) { setZoom(1f) })
        tb.addView(W.spacer(act))
        pageLabel = W.text(act, "", 12.5f, Th.p.textDim).apply { setPadding(dp(8), 0, dp(10), 0) }
        tb.addView(pageLabel)
        addView(tb, W.lp(W.MATCH, W.WRAP))

        val frame = FrameLayout(act)
        frame.setBackgroundColor(if (Th.p.dark) 0xFF15182A.toInt() else 0xFFD9DCE8.toInt())
        list.divider = null
        list.dividerHeight = 0
        list.selector = android.graphics.drawable.ColorDrawable(0)
        list.adapter = adapter
        list.setOnScrollListener(object : AbsListView.OnScrollListener {
            override fun onScrollStateChanged(v: AbsListView?, s: Int) {}
            override fun onScroll(v: AbsListView?, first: Int, visible: Int, total: Int) {
                if (pageCount > 0) pageLabel.text = act.getString(R.string.page_of, first + 1, pageCount)
            }
        })
        hscroll.isFillViewport = true
        hscroll.addView(list, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        frame.addView(hscroll)
        empty = W.text(act, act.getString(R.string.pdf_empty), 14f, Th.p.textDim, lines = 3).apply { gravity = Gravity.CENTER }
        frame.addView(empty, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        addView(frame, W.lp(W.MATCH, 0, 1f))

        win.onClosed = { closeDoc(); exec.shutdown() }
        win.onArgument = { a -> (a as? File)?.let { openFile(it) } }
        win.onFileDrop = { files ->
            val pdf = files.firstOrNull { it.isFile && it.name.endsWith(".pdf", ignoreCase = true) }
            if (pdf != null) openFile(pdf) else W.toast(act, act.getString(R.string.drop_not_supported))
        }
        if (start != null) openFile(start)
    }

    private fun baseWidth(): Int = (hscroll.width.takeIf { it > 0 } ?: width.takeIf { it > 0 } ?: dp(800)) - dp(16)

    private fun setZoom(z: Float) {
        zoom = z.coerceIn(0.5f, 4f)
        zoomLabel.text = "${(zoom * 100).toInt()}%"
        cache.evictAll()
        generation++
        val lp = list.layoutParams
        lp.width = if (zoom <= 1f) FrameLayout.LayoutParams.MATCH_PARENT else (baseWidth() * zoom).toInt() + dp(16)
        list.layoutParams = lp
        adapter.notifyDataSetChanged()
    }

    private fun openFile(f: File) {
        try {
            open(ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY), f.name)
        } catch (_: Exception) {
            W.toast(act, act.getString(R.string.failed))
        }
    }

    private fun openUri(uri: Uri) {
        try {
            val p = act.contentResolver.openFileDescriptor(uri, "r") ?: return
            var name = "PDF"
            act.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) name = c.getString(0) ?: name
            }
            open(p, name)
        } catch (_: Exception) {
            W.toast(act, act.getString(R.string.failed))
        }
    }

    private fun open(p: ParcelFileDescriptor, name: String) {
        exec.execute {
            try {
                closeDocSync()
                val r = PdfRenderer(p)
                val asp = FloatArray(r.pageCount) { i ->
                    r.openPage(i).use { pg -> pg.height.toFloat() / pg.width.toFloat() }
                }
                main.post {
                    pfd = p
                    renderer = r
                    pageCount = r.pageCount
                    aspects = asp
                    cache.evictAll()
                    generation++
                    empty.visibility = GONE
                    win.setTitle("$name — " + act.getString(R.string.app_pdf))
                    pageLabel.text = act.getString(R.string.page_of, 1, pageCount)
                    adapter.notifyDataSetChanged()
                    list.setSelection(0)
                }
            } catch (_: Exception) {
                main.post { W.toast(act, act.getString(R.string.pdf_error)) }
            }
        }
    }

    private fun closeDocSync() {
        try {
            renderer?.close()
        } catch (_: Exception) {
        }
        try {
            pfd?.close()
        } catch (_: Exception) {
        }
        renderer = null
        pfd = null
    }

    private fun closeDoc() {
        if (!exec.isShutdown) exec.execute { closeDocSync() }
    }

    private inner class PageAdapter : BaseAdapter() {
        override fun getCount() = if (renderer == null) 0 else pageCount
        override fun getItem(p: Int) = p
        override fun getItemId(p: Int) = p.toLong()

        override fun getView(p: Int, convert: View?, parent: ViewGroup?): View {
            val holder = (convert as? FrameLayout) ?: FrameLayout(act).apply {
                setPadding(dp(8), dp(8), dp(8), 0)
                addView(ImageView(act).apply {
                    setBackgroundColor(Color.WHITE)
                    scaleType = ImageView.ScaleType.FIT_XY
                    elevation = 4f
                })
            }
            val img = holder.getChildAt(0) as ImageView
            val w = (baseWidth() * zoom).toInt().coerceAtLeast(100)
            val h = (w * aspects.getOrElse(p) { 1.414f }).toInt()
            img.layoutParams = FrameLayout.LayoutParams(w, h, Gravity.CENTER_HORIZONTAL)
            img.tag = p
            val cached = cache.get(p)
            img.setImageBitmap(cached)
            if (cached == null) {
                val gen = generation
                exec.execute {
                    val r = renderer ?: return@execute
                    val bmp = try {
                        r.openPage(p).use { page ->
                            // render at a capped resolution to save memory
                            val scale = (w.toFloat() / page.width).coerceAtMost(3f)
                            val bw = (page.width * scale).toInt().coerceAtMost(3000)
                            val bh = (bw * page.height.toFloat() / page.width).toInt()
                            Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888).also {
                                it.eraseColor(Color.WHITE)
                                page.render(it, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                            }
                        }
                    } catch (_: Exception) {
                        null
                    } ?: return@execute
                    main.post {
                        if (gen != generation) return@post
                        cache.put(p, bmp)
                        if (img.tag == p) img.setImageBitmap(bmp)
                    }
                }
            }
            return holder
        }
    }

}
