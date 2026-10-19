package com.windowsfx.launcher.apps

import android.annotation.SuppressLint
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.text.format.DateFormat
import android.view.DragEvent
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.PopupMenu
import android.widget.ScrollView
import android.widget.TextView
import com.windowsfx.launcher.DesktopActivity
import com.windowsfx.launcher.R
import com.windowsfx.launcher.core.Prefs
import com.windowsfx.launcher.core.Th
import com.windowsfx.launcher.core.W
import com.windowsfx.launcher.core.dp
import com.windowsfx.launcher.core.dpf
import com.windowsfx.launcher.core.pressable
import com.windowsfx.launcher.core.rounded
import com.windowsfx.launcher.files.DragFiles
import com.windowsfx.launcher.files.Files
import com.windowsfx.launcher.files.Storage
import com.windowsfx.launcher.wm.FxWindow
import java.io.File
import java.util.Date

/** Clipboard shared by all Explorer windows. */
object FileClipboard {
    var files: List<File> = emptyList()
    var cut = false
}

/**
 * File Explorer: "This PC", drives, folders, selection of several files,
 * drag and drop between folders and windows, copy / cut / paste / rename / delete.
 */
@SuppressLint("ViewConstructor", "ClickableViewAccessibility")
class ExplorerView(private val act: DesktopActivity, private val win: FxWindow, start: File?) : LinearLayout(act) {

    private class Entry(val file: File, val label: String? = null, val icon: Int? = null, val sub: String? = null)

    private var cwd: File? = null // null = This PC
    private val back = ArrayDeque<File?>()
    private val crumbs = W.hbox(act)
    private val crumbScroll = HorizontalScrollView(act)
    private val list = ListView(act)
    private val adapter = FileAdapter()
    private val status = W.statusBar(act)
    private val nav = W.vbox(act)
    private val navScroll = ScrollView(act)
    private val permissionPanel = W.vbox(act)
    private val selectBar = W.hbox(act)
    private val selectCount = W.text(act, "", 13f, Th.p.text, bold = true)
    private var entries: List<Entry> = emptyList()
    private val main = Handler(Looper.getMainLooper())
    private val onChange: () -> Unit = { refresh() }

    // selection
    private var selectMode = false
    private val selected = linkedSetOf<String>()

    // drag highlight
    private var hoverPos = -1
    private var listHover = false

    init {
        orientation = VERTICAL
        setBackgroundColor(Th.p.surface)

        // ---- toolbar
        val tb = W.toolbar(act)
        tb.addView(W.iconButton(act, R.drawable.ic_back, act.getString(R.string.back)) { goBack() })
        tb.addView(W.iconButton(act, R.drawable.ic_up, act.getString(R.string.up)) { goUp() })
        tb.addView(W.iconButton(act, R.drawable.ic_refresh, act.getString(R.string.refresh)) { refresh() })
        crumbScroll.isHorizontalScrollBarEnabled = false
        crumbScroll.addView(crumbs)
        crumbScroll.background = rounded(Th.p.surface3, dpf(6), 1, Th.p.border)
        crumbScroll.setPadding(dp(4), 0, dp(4), 0)
        tb.addView(crumbScroll, W.lp(0, dp(32), 1f).apply { setMargins(dp(6), 0, dp(6), 0) })
        tb.addView(W.iconButton(act, R.drawable.ic_check, act.getString(R.string.select)) { setSelectMode(!selectMode) })
        tb.addView(W.iconButton(act, R.drawable.ic_new_folder, act.getString(R.string.new_folder)) { newFolder() })
        tb.addView(W.iconButton(act, R.drawable.ic_paste, act.getString(R.string.paste)) { paste() })
        tb.addView(W.iconButton(act, R.drawable.ic_more, act.getString(R.string.more)) { v -> moreMenu(v) })
        addView(tb, W.lp(W.MATCH, W.WRAP))

        // ---- selection action bar (visible in select mode)
        selectBar.setPadding(dp(10), dp(4), dp(6), dp(4))
        selectBar.setBackgroundColor(Th.p.selection)
        selectBar.addView(selectCount, W.lp(0, W.WRAP, 1f))
        selectBar.addView(W.tool(act, act.getString(R.string.select_all)) { selectAll() })
        selectBar.addView(W.tool(act, act.getString(R.string.copy)) { selectionFiles().let { if (it.isNotEmpty()) setClipboard(it, false) } })
        selectBar.addView(W.tool(act, act.getString(R.string.cut)) { selectionFiles().let { if (it.isNotEmpty()) setClipboard(it, true) } })
        selectBar.addView(W.tool(act, act.getString(R.string.delete)) { selectionFiles().let { if (it.isNotEmpty()) delete(it) } })
        selectBar.addView(W.tool(act, "✕") { setSelectMode(false) })
        selectBar.visibility = GONE
        addView(selectBar, W.lp(W.MATCH, W.WRAP))

        // ---- body: navigation pane + list
        val body = W.hbox(act, Gravity.TOP)
        navScroll.addView(nav)
        navScroll.setBackgroundColor(Th.p.surface2)
        nav.setPadding(dp(6), dp(6), dp(6), dp(6))
        body.addView(navScroll, W.lp(dp(200), W.MATCH))
        val right = FrameLayout(act)
        list.adapter = adapter
        list.divider = null
        list.selector = android.graphics.drawable.ColorDrawable(0)
        list.setOnItemClickListener { _, _, pos, _ -> onRowClick(pos) }
        list.setOnItemLongClickListener { _, v, pos, _ -> onRowLongPress(v, pos); true }
        list.setOnTouchListener { _, e ->
            if (e.actionMasked == MotionEvent.ACTION_DOWN) {
                DragFiles.downRawX = e.rawX
                DragFiles.downRawY = e.rawY
            }
            false
        }
        list.setOnDragListener { v, e -> onListDrag(v, e) }
        right.addView(list)
        buildPermissionPanel()
        right.addView(permissionPanel)
        body.addView(right, W.lp(0, W.MATCH, 1f))
        addView(body, W.lp(W.MATCH, 0, 1f))
        addView(status, W.lp(W.MATCH, W.WRAP))

        buildNav()
        act.resumeListeners.add(onChange)
        act.fileListeners.add(onChange)
        win.onClosed = {
            act.resumeListeners.remove(onChange)
            act.fileListeners.remove(onChange)
        }
        win.onArgument = { a -> (a as? File)?.let { navigate(it) } }
        navigate(start, addHistory = false)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        navScroll.visibility = if (w < dp(560)) GONE else VISIBLE
    }

    // ================================================================ navigation pane

    private fun buildNav() {
        nav.removeAllViews()
        navItem(R.drawable.ic_this_pc, act.getString(R.string.this_pc), null) { navigate(null) }
        navHeader(act.getString(R.string.quick_access))
        quickFolders().forEach { (label, icon, f) -> navItem(icon, label, f) { navigate(f) } }
        navHeader(act.getString(R.string.drives))
        navItem(R.drawable.ic_storage, act.getString(R.string.internal_storage), Storage.internal()) { navigate(Storage.internal()) }
        Storage.removable(act).forEachIndexed { i, f ->
            navItem(R.drawable.ic_storage, act.getString(R.string.sd_card) + if (i > 0) " ${i + 1}" else "", f) { navigate(f) }
        }
        navHeader(act.getString(R.string.cloud))
        navItem(R.drawable.ic_cloud, act.getString(R.string.cloud_soon), null) {
            W.toast(act, act.getString(R.string.cloud_soon_msg))
        }
    }

    private fun navHeader(s: String) {
        nav.addView(W.text(act, s, 11f, Th.p.textDim, bold = true).apply { setPadding(dp(8), dp(12), dp(8), dp(4)) })
    }

    /** A navigation row; when [dropDir] is set, files can be dropped onto it. */
    private fun navItem(icon: Int, label: String, dropDir: File?, click: () -> Unit) {
        val row = W.hbox(act).apply {
            setPadding(dp(8), dp(6), dp(8), dp(6))
            background = pressable(null, dpf(6))
            isClickable = true
            setOnClickListener { click() }
        }
        row.addView(ImageView(act).apply { setImageResource(icon) }, W.lp(dp(18), dp(18)))
        row.addView(W.text(act, label, 13f).apply { setPadding(dp(10), 0, 0, 0) }, W.lp(0, W.WRAP, 1f))
        if (dropDir != null) makeDropTarget(row, dropDir)
        nav.addView(row, W.lp(W.MATCH, W.WRAP))
    }

    private fun quickFolders(): List<Triple<String, Int, File>> = listOf(
        Triple(act.getString(R.string.downloads), R.drawable.ic_download, Storage.publicDir(Environment.DIRECTORY_DOWNLOADS)),
        Triple(act.getString(R.string.documents), R.drawable.ic_doc, Storage.publicDir(Environment.DIRECTORY_DOCUMENTS)),
        Triple(act.getString(R.string.pictures), R.drawable.ic_image, Storage.publicDir(Environment.DIRECTORY_PICTURES)),
        Triple(act.getString(R.string.camera), R.drawable.ic_image, Storage.publicDir(Environment.DIRECTORY_DCIM)),
        Triple(act.getString(R.string.music), R.drawable.ic_music, Storage.publicDir(Environment.DIRECTORY_MUSIC)),
        Triple(act.getString(R.string.videos), R.drawable.ic_movie, Storage.publicDir(Environment.DIRECTORY_MOVIES)),
    )

    private fun navigate(dir: File?, addHistory: Boolean = true) {
        if (addHistory && dir?.absolutePath != cwd?.absolutePath) back.addLast(cwd)
        cwd = dir
        selected.clear()
        refresh()
    }

    private fun goBack() {
        if (back.isEmpty()) return
        cwd = back.removeLast()
        selected.clear()
        refresh()
    }

    private fun goUp() {
        val c = cwd ?: return
        val roots = listOf(Storage.internal()) + Storage.removable(act)
        if (roots.any { it.absolutePath == c.absolutePath }) navigate(null)
        else navigate(c.parentFile)
    }

    // ================================================================ listing

    private fun buildPermissionPanel() {
        permissionPanel.gravity = Gravity.CENTER
        permissionPanel.setPadding(dp(24), dp(24), dp(24), dp(24))
        permissionPanel.setBackgroundColor(Th.p.surface)
        permissionPanel.addView(ImageView(act).apply { setImageResource(R.drawable.ic_storage) }, W.lp(dp(56), dp(56)))
        permissionPanel.addView(W.text(act, act.getString(R.string.storage_access_title), 16f, bold = true, lines = 2).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(14), 0, dp(6))
        })
        permissionPanel.addView(W.text(act, act.getString(R.string.storage_access_msg), 13f, Th.p.textDim, lines = 5).apply {
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(16))
        })
        permissionPanel.addView(W.button(act, act.getString(R.string.grant_access), primary = true) { Storage.request(act) })
    }

    fun refresh() {
        val hasAccess = Storage.hasAccess(act)
        permissionPanel.visibility = if (hasAccess) GONE else VISIBLE
        val dir = cwd
        buildCrumbs()
        if (dir == null) {
            win.setTitle(act.getString(R.string.this_pc))
            entries = thisPcEntries()
            adapter.notifyDataSetChanged()
            updateStatus()
            return
        }
        win.setTitle(displayName(dir))
        val showHidden = Prefs.showHidden
        val sort = Prefs.sortMode
        Thread {
            val files = (dir.listFiles() ?: emptyArray()).filter { showHidden || !it.name.startsWith(".") }
            val sorted = when (sort) {
                1 -> files.sortedWith(compareBy<File>({ !it.isDirectory }).thenByDescending { it.lastModified() })
                2 -> files.sortedWith(compareBy<File>({ !it.isDirectory }).thenByDescending { if (it.isDirectory) 0L else it.length() })
                else -> files.sortedWith(compareBy<File>({ !it.isDirectory }, { it.name.lowercase() }))
            }
            val e = sorted.map { Entry(it) }
            main.post {
                if (cwd?.absolutePath != dir.absolutePath) return@post
                entries = e
                val existing = e.map { it.file.absolutePath }.toSet()
                selected.retainAll(existing)
                adapter.notifyDataSetChanged()
                updateStatus()
            }
        }.start()
    }

    private fun updateStatus() {
        val sel = if (selected.isNotEmpty()) "   •   " + act.getString(R.string.n_selected, selected.size) else ""
        status.text = act.getString(R.string.n_items, entries.size) + sel + clipboardNote()
        selectCount.text = act.getString(R.string.n_selected, selected.size)
    }

    private fun clipboardNote(): String =
        if (FileClipboard.files.isEmpty()) "" else "   •   " + act.getString(
            if (FileClipboard.cut) R.string.n_to_move else R.string.n_to_copy, FileClipboard.files.size,
        )

    private fun thisPcEntries(): List<Entry> {
        val l = mutableListOf<Entry>()
        val internal = Storage.internal()
        val (free, total) = Storage.freeTotal(internal)
        l.add(Entry(internal, act.getString(R.string.internal_storage), R.drawable.ic_storage,
            act.getString(R.string.free_of, Files.size(act, free), Files.size(act, total))))
        Storage.removable(act).forEachIndexed { i, f ->
            val (fr, tt) = Storage.freeTotal(f)
            l.add(Entry(f, act.getString(R.string.sd_card) + if (i > 0) " ${i + 1}" else "", R.drawable.ic_storage,
                act.getString(R.string.free_of, Files.size(act, fr), Files.size(act, tt))))
        }
        quickFolders().forEach { (label, icon, f) -> l.add(Entry(f, label, icon)) }
        return l
    }

    private fun displayName(f: File): String {
        if (f.absolutePath == Storage.internal().absolutePath) return act.getString(R.string.internal_storage)
        if (Storage.removable(act).any { it.absolutePath == f.absolutePath }) return act.getString(R.string.sd_card)
        return f.name
    }

    private fun buildCrumbs() {
        crumbs.removeAllViews()
        crumb(act.getString(R.string.this_pc), null) { navigate(null) }
        val dir = cwd ?: return
        val roots = listOf(Storage.internal()) + Storage.removable(act)
        val root = roots.firstOrNull { Files.isInside(dir, it) }
        val chain = mutableListOf<File>()
        var f: File? = dir
        while (f != null) {
            chain.add(0, f)
            if (root != null && f.absolutePath == root.absolutePath) break
            f = f.parentFile
        }
        for (c in chain) {
            crumbs.addView(W.text(act, "›", 13f, Th.p.textDim).apply { setPadding(dp(2), 0, dp(2), 0) })
            crumb(displayName(c).ifEmpty { "/" }, c) { navigate(c) }
        }
        crumbScroll.post { crumbScroll.fullScroll(View.FOCUS_RIGHT) }
    }

    private fun crumb(label: String, dropDir: File?, click: () -> Unit) {
        val v = W.text(act, label, 13f).apply {
            setPadding(dp(6), dp(6), dp(6), dp(6))
            background = pressable(null, dpf(4))
            isClickable = true
            setOnClickListener { click() }
        }
        if (dropDir != null) makeDropTarget(v, dropDir)
        crumbs.addView(v)
    }

    // ================================================================ selection

    private fun setSelectMode(on: Boolean) {
        selectMode = on
        if (!on) selected.clear()
        selectBar.visibility = if (on) VISIBLE else GONE
        adapter.notifyDataSetChanged()
        updateStatus()
    }

    private fun toggleSelect(f: File) {
        val p = f.absolutePath
        if (!selected.remove(p)) selected.add(p)
        adapter.notifyDataSetChanged()
        updateStatus()
    }

    private fun selectAll() {
        if (cwd == null) return
        if (!selectMode) setSelectMode(true)
        selected.clear()
        entries.forEach { selected.add(it.file.absolutePath) }
        adapter.notifyDataSetChanged()
        updateStatus()
    }

    private fun selectionFiles(): List<File> = selected.map { File(it) }

    /** Files that an action on [e] should apply to: the whole selection if [e] is part of it. */
    private fun targetsFor(e: Entry): List<File> =
        if (selected.contains(e.file.absolutePath) && selected.size > 1) selectionFiles() else listOf(e.file)

    // ================================================================ clicks

    private fun onRowClick(pos: Int) {
        val e = entries.getOrNull(pos) ?: return
        if (selectMode && e.label == null) {
            toggleSelect(e.file)
            return
        }
        openEntry(e)
    }

    /** Long press: start dragging; releasing without moving opens the context menu instead. */
    private fun onRowLongPress(row: View, pos: Int) {
        val e = entries.getOrNull(pos) ?: return
        if (e.label != null || !Storage.hasAccess(act)) {
            contextMenu(row, e)
            return
        }
        val files = targetsFor(e)
        pendingMenu = row to e
        if (!DragFiles.start(row, files, this)) contextMenu(row, e)
    }

    private var pendingMenu: Pair<View, Entry>? = null

    private fun openEntry(e: Entry) {
        val f = e.file
        if (f.isDirectory || e.label != null) {
            navigate(f)
            return
        }
        openFile(f)
    }

    private fun openFile(f: File) {
        when (Files.ext(f)) {
            in Files.TEXT -> act.windows.open(Builtin.NOTEPAD, f)
            "pdf" -> act.windows.open(Builtin.PDF, f)
            "png", "jpg", "jpeg", "bmp", "webp" -> act.windows.open(Builtin.PAINT, f)
            else -> Files.openExternal(act, f)
        }
    }

    // ================================================================ drag and drop

    /** Where a drop at list position [pos] lands: the folder under the finger or the current folder. */
    private fun dropDirAt(pos: Int): File? {
        val e = entries.getOrNull(pos)
        if (e != null && (e.file.isDirectory || e.label != null)) return e.file
        return cwd
    }

    private fun onListDrag(v: View, e: DragEvent): Boolean {
        val payload = DragFiles.payload(e) ?: return false
        when (e.action) {
            DragEvent.ACTION_DRAG_STARTED -> return true
            DragEvent.ACTION_DRAG_ENTERED -> {
                DragFiles.track(v, e)
                listHover = true
            }
            DragEvent.ACTION_DRAG_LOCATION -> {
                DragFiles.track(v, e)
                val pos = list.pointToPosition(e.x.toInt(), e.y.toInt())
                val dir = entries.getOrNull(pos)?.takeIf { it.file.isDirectory || it.label != null }
                val newHover = if (dir != null && payload.files.none { it.absolutePath == dir.file.absolutePath }) pos else -1
                if (newHover != hoverPos) {
                    hoverPos = newHover
                    adapter.notifyDataSetChanged()
                }
                autoScroll(e.y)
            }
            DragEvent.ACTION_DRAG_EXITED -> clearHover()
            DragEvent.ACTION_DROP -> {
                val pos = list.pointToPosition(e.x.toInt(), e.y.toInt())
                clearHover()
                // released on the same spot: it was a long press, show the menu
                if (!DragFiles.moved && payload.source === this) {
                    pendingMenu?.let { (row, entry) -> contextMenu(row, entry) }
                    pendingMenu = null
                    return true
                }
                val target = dropDirAt(pos) ?: return false
                val anchor = list.getChildAt(pos - list.firstVisiblePosition) ?: list
                askDrop(anchor, payload.files, target)
                return true
            }
            DragEvent.ACTION_DRAG_ENDED -> {
                clearHover()
                pendingMenu = null
            }
        }
        return true
    }

    private fun autoScroll(y: Float) {
        val edge = dp(40)
        when {
            y < edge -> list.smoothScrollBy(-dp(24), 50)
            y > list.height - edge -> list.smoothScrollBy(dp(24), 50)
        }
    }

    private fun clearHover() {
        if (hoverPos != -1 || listHover) {
            hoverPos = -1
            listHover = false
            adapter.notifyDataSetChanged()
        }
    }

    /** Navigation rows and breadcrumbs accept dropped files into their folder. */
    private fun makeDropTarget(v: View, dir: File) {
        v.setOnDragListener { view, e ->
            val payload = DragFiles.payload(e) ?: return@setOnDragListener false
            when (e.action) {
                DragEvent.ACTION_DRAG_STARTED -> true
                DragEvent.ACTION_DRAG_ENTERED -> {
                    DragFiles.track(view, e)
                    view.background = pressable(rounded(Th.p.selection, dpf(6)), dpf(6))
                    true
                }
                DragEvent.ACTION_DRAG_LOCATION -> {
                    DragFiles.track(view, e); true
                }
                DragEvent.ACTION_DRAG_EXITED, DragEvent.ACTION_DRAG_ENDED -> {
                    view.background = pressable(null, dpf(6))
                    true
                }
                DragEvent.ACTION_DROP -> {
                    view.background = pressable(null, dpf(6))
                    askDrop(view, payload.files, dir)
                    true
                }
                else -> true
            }
        }
    }

    /** "Move here / Copy here / Cancel", like a right-button drag in Windows. */
    private fun askDrop(anchor: View, files: List<File>, dir: File) {
        val real = files.filter { f ->
            f.parentFile?.absolutePath != dir.absolutePath && f.absolutePath != dir.absolutePath &&
                !(f.isDirectory && Files.isInside(dir, f))
        }
        if (real.isEmpty()) {
            if (files.any { it.isDirectory && Files.isInside(dir, it) && it.absolutePath != dir.absolutePath }) {
                W.toast(act, act.getString(R.string.cant_into_itself))
            }
            return
        }
        val sameVolume = sameRoot(real.first(), dir)
        val pm = PopupMenu(act, anchor)
        val title = act.getString(R.string.n_to_folder, real.size, displayName(dir))
        pm.menu.add(0, 0, 0, title).isEnabled = false
        // Windows default: move on the same drive, copy to another drive — offered first
        if (sameVolume) {
            pm.menu.add(0, 1, 1, R.string.move_here)
            pm.menu.add(0, 2, 2, R.string.copy_here)
        } else {
            pm.menu.add(0, 2, 1, R.string.copy_here)
            pm.menu.add(0, 1, 2, R.string.move_here)
        }
        pm.menu.add(0, 3, 3, R.string.cancel)
        pm.setOnMenuItemClickListener {
            when (it.itemId) {
                1 -> transfer(real, dir, move = true)
                2 -> transfer(real, dir, move = false)
            }
            true
        }
        pm.show()
    }

    private fun sameRoot(a: File, b: File): Boolean {
        val roots = listOf(Storage.internal()) + Storage.removable(act)
        val ra = roots.firstOrNull { Files.isInside(a, it) }
        val rb = roots.firstOrNull { Files.isInside(b, it) }
        return ra != null && ra.absolutePath == rb?.absolutePath
    }

    // ================================================================ file operations

    private fun contextMenu(anchor: View, e: Entry) {
        val f = e.file
        val many = e.label == null && selected.contains(f.absolutePath) && selected.size > 1
        val pm = PopupMenu(act, anchor)
        val m = pm.menu
        if (many) {
            m.add(0, 0, 0, act.getString(R.string.n_selected, selected.size)).isEnabled = false
        } else {
            m.add(0, 1, 0, R.string.open)
        }
        if (e.label == null) {
            if (f.isFile && !many) m.add(0, 2, 1, R.string.open_with)
            m.add(0, 3, 2, R.string.copy)
            m.add(0, 4, 3, R.string.cut)
            if (f.isDirectory && !many && FileClipboard.files.isNotEmpty()) m.add(0, 5, 4, R.string.paste_into)
            if (!many) m.add(0, 6, 5, R.string.rename)
            m.add(0, 7, 6, R.string.delete)
            if (f.isFile && !many) m.add(0, 8, 7, R.string.share)
            if (!selectMode) m.add(0, 10, 8, R.string.select)
        }
        if (!many) m.add(0, 9, 9, R.string.properties)
        pm.setOnMenuItemClickListener {
            when (it.itemId) {
                1 -> openEntry(e)
                2 -> Files.openExternal(act, f, chooser = true)
                3 -> setClipboard(targetsFor(e), false)
                4 -> setClipboard(targetsFor(e), true)
                5 -> pasteInto(f)
                6 -> rename(f)
                7 -> delete(targetsFor(e))
                8 -> Files.share(act, f)
                9 -> properties(f)
                10 -> {
                    setSelectMode(true)
                    toggleSelect(f)
                }
            }
            true
        }
        pm.show()
    }

    private fun setClipboard(files: List<File>, cut: Boolean) {
        FileClipboard.files = files
        FileClipboard.cut = cut
        W.toast(act, act.getString(if (cut) R.string.n_to_move else R.string.n_to_copy, files.size))
        if (selectMode) setSelectMode(false)
        act.filesChanged()
    }

    private fun paste() {
        val dir = cwd
        if (dir == null) {
            W.toast(act, act.getString(R.string.open_folder_first))
            return
        }
        pasteInto(dir)
    }

    private fun pasteInto(dir: File) {
        val files = FileClipboard.files
        if (files.isEmpty()) {
            W.toast(act, act.getString(R.string.clipboard_empty))
            return
        }
        val move = FileClipboard.cut
        if (move) FileClipboard.files = emptyList()
        transfer(files, dir, move)
    }

    private fun transfer(files: List<File>, dir: File, move: Boolean) {
        status.text = act.getString(if (move) R.string.moving else R.string.copying, files.size)
        Thread {
            var errors = 0
            for (f in files) {
                try {
                    Files.transfer(f, dir, move)
                } catch (_: Exception) {
                    errors++
                }
            }
            main.post {
                if (errors > 0) W.toast(act, act.getString(R.string.n_failed, errors))
                else W.toast(act, act.getString(R.string.done))
                if (selectMode) setSelectMode(false)
                act.filesChanged()
            }
        }.start()
    }

    private fun newFolder() {
        val dir = cwd ?: run {
            W.toast(act, act.getString(R.string.open_folder_first))
            return
        }
        val def = Files.unique(dir, act.getString(R.string.new_folder_name)).name
        W.prompt(act, act.getString(R.string.new_folder), def, act.getString(R.string.create), act.getString(R.string.cancel)) { name ->
            val f = File(dir, name)
            if (f.exists() || !f.mkdirs()) W.toast(act, act.getString(R.string.failed)) else act.filesChanged()
        }
    }

    private fun rename(f: File) {
        W.prompt(act, act.getString(R.string.rename), f.name, act.getString(R.string.ok), act.getString(R.string.cancel), selectBase = f.isFile) { name ->
            val t = File(f.parentFile, name)
            if (t.exists() || !f.renameTo(t)) W.toast(act, act.getString(R.string.failed)) else act.filesChanged()
        }
    }

    private fun delete(files: List<File>) {
        val msg = if (files.size == 1) act.getString(R.string.delete_confirm, files[0].name)
        else act.getString(R.string.delete_many_confirm, files.size)
        W.confirm(act, act.getString(R.string.delete), msg, act.getString(R.string.delete), act.getString(R.string.cancel)) {
            Thread {
                var errors = 0
                files.forEach { if (!it.deleteRecursively()) errors++ }
                main.post {
                    if (errors > 0) W.toast(act, act.getString(R.string.n_failed, errors))
                    if (selectMode) setSelectMode(false)
                    act.filesChanged()
                }
            }.start()
        }
    }

    private fun properties(f: File) {
        val msg = StringBuilder()
        msg.append(act.getString(R.string.prop_path)).append(": ").append(f.absolutePath).append("\n\n")
        msg.append(act.getString(R.string.prop_modified)).append(": ")
            .append(DateFormat.getDateFormat(act).format(Date(f.lastModified()))).append(' ')
            .append(DateFormat.getTimeFormat(act).format(Date(f.lastModified()))).append("\n")
        val d = W.dialog(act).setTitle(f.name).setMessage(msg.toString() + act.getString(R.string.prop_size) + ": …")
            .setPositiveButton(R.string.ok, null).show()
        Thread {
            var count = 0
            val size = if (f.isDirectory) f.walkTopDown().filter { it.isFile }.onEach { count++ }.sumOf { it.length() } else f.length()
            main.post {
                val extra = if (f.isDirectory) "\n" + act.getString(R.string.n_files, count) else ""
                d.setMessage(msg.toString() + act.getString(R.string.prop_size) + ": " + Files.size(act, size) + extra)
            }
        }.start()
    }

    private fun moreMenu(anchor: View) {
        val pm = PopupMenu(act, anchor)
        pm.menu.add(0, 1, 0, R.string.sort_name).isCheckable = true
        pm.menu.add(0, 2, 1, R.string.sort_date).isCheckable = true
        pm.menu.add(0, 3, 2, R.string.sort_size).isCheckable = true
        pm.menu.getItem(Prefs.sortMode.coerceIn(0, 2)).isChecked = true
        pm.menu.add(0, 4, 3, R.string.show_hidden).apply {
            isCheckable = true
            isChecked = Prefs.showHidden
        }
        pm.menu.add(0, 5, 4, R.string.select_all)
        pm.menu.add(0, 6, 5, R.string.new_window)
        pm.setOnMenuItemClickListener {
            when (it.itemId) {
                1, 2, 3 -> Prefs.sortMode = it.itemId - 1
                4 -> Prefs.showHidden = !Prefs.showHidden
                5 -> {
                    selectAll(); return@setOnMenuItemClickListener true
                }
                6 -> {
                    act.windows.open(Builtin.EXPLORER, cwd); return@setOnMenuItemClickListener true
                }
            }
            refresh()
            true
        }
        pm.show()
    }

    // ================================================================ adapter

    private inner class FileAdapter : BaseAdapter() {
        override fun getCount() = entries.size
        override fun getItem(p: Int) = entries[p]
        override fun getItemId(p: Int) = p.toLong()

        override fun getView(p: Int, convert: View?, parent: ViewGroup?): View {
            val row = (convert as? LinearLayout) ?: W.hbox(act).apply {
                setPadding(dp(10), dp(7), dp(12), dp(7))
                addView(W.text(act, "", 16f, Th.p.accent).apply { gravity = Gravity.CENTER }, W.lp(dp(26), W.WRAP))
                addView(ImageView(act), W.lp(dp(24), dp(24)))
                val texts = W.vbox(act).apply { setPadding(dp(12), 0, dp(8), 0) }
                texts.addView(W.text(act, "", 13.5f))
                texts.addView(W.text(act, "", 11.5f, Th.p.textDim).apply { setPadding(0, dp(2), 0, 0) })
                addView(texts, W.lp(0, W.WRAP, 1f))
                addView(W.text(act, "", 12f, Th.p.textDim).apply { gravity = Gravity.END }, W.lp(dp(90), W.WRAP))
            }
            val e = entries[p]
            val f = e.file
            val isSel = selected.contains(f.absolutePath)
            val check = row.getChildAt(0) as TextView
            check.visibility = if (selectMode && e.label == null) VISIBLE else GONE
            check.text = if (isSel) "☑" else "☐"
            (row.getChildAt(1) as ImageView).setImageResource(e.icon ?: Files.iconFor(f))
            val texts = row.getChildAt(2) as LinearLayout
            (texts.getChildAt(0) as TextView).text = e.label ?: f.name
            val sub = texts.getChildAt(1) as TextView
            val right = row.getChildAt(3) as TextView
            if (e.label != null) {
                sub.text = e.sub ?: ""
                sub.visibility = if (e.sub == null) GONE else VISIBLE
                right.text = ""
            } else {
                val d = Date(f.lastModified())
                sub.text = DateFormat.getDateFormat(act).format(d) + "  " + DateFormat.getTimeFormat(act).format(d)
                sub.visibility = VISIBLE
                right.text = if (f.isDirectory) "" else Files.size(act, f.length())
            }
            val bg = when {
                p == hoverPos -> rounded(Th.p.selection, dpf(4), dp(2), Th.p.accent)
                isSel -> rounded(Th.p.selection, dpf(4))
                else -> null
            }
            row.background = pressable(bg, dpf(4))
            row.alpha = if (FileClipboard.cut && FileClipboard.files.any { it.absolutePath == f.absolutePath }) 0.5f else 1f
            return row
        }
    }
}
