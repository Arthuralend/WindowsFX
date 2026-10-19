package com.windowsfx.launcher.apps

import android.annotation.SuppressLint
import android.graphics.Typeface
import android.net.Uri
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.text.Editable
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.widget.EditText
import android.widget.LinearLayout
import com.windowsfx.launcher.DesktopActivity
import com.windowsfx.launcher.R
import com.windowsfx.launcher.core.Th
import com.windowsfx.launcher.core.Ui
import com.windowsfx.launcher.core.W
import com.windowsfx.launcher.core.dp
import com.windowsfx.launcher.files.Storage
import com.windowsfx.launcher.wm.FxWindow
import java.io.File

/** Notepad: plain text editor with save / save as, word wrap and zoom. */
@SuppressLint("ViewConstructor")
class NotepadView(private val act: DesktopActivity, private val win: FxWindow, start: File?) : LinearLayout(act) {

    private var file: File? = null
    private var docName = act.getString(R.string.untitled)
    private var dirty = false
    private var loading = false
    private var wrap = true
    private var fontSp = 15f
    private val editor = EditText(act)
    private val status = W.statusBar(act)
    private val main = Handler(Looper.getMainLooper())

    init {
        orientation = VERTICAL
        setBackgroundColor(Th.p.surface)

        val tb = W.toolbar(act)
        tb.addView(W.tool(act, act.getString(R.string.new_doc)) { confirmDiscard { newDoc() } })
        tb.addView(W.tool(act, act.getString(R.string.open)) { confirmDiscard { openPicker() } })
        tb.addView(W.tool(act, act.getString(R.string.save)) { save() })
        tb.addView(W.tool(act, act.getString(R.string.save_as)) { saveAs() })
        tb.addView(W.divider(act, vertical = true))
        val wrapBtn = W.tool(act, "") {}
        fun syncWrap() {
            wrapBtn.text = act.getString(R.string.word_wrap) + if (wrap) " ✓" else ""
        }
        syncWrap()
        wrapBtn.setOnClickListener {
            wrap = !wrap
            editor.setHorizontallyScrolling(!wrap)
            syncWrap()
        }
        tb.addView(wrapBtn)
        tb.addView(W.tool(act, "A−") { setFont(fontSp - 1) })
        tb.addView(W.tool(act, "A+") { setFont(fontSp + 1) })
        val tbScroll = android.widget.HorizontalScrollView(act).apply {
            isHorizontalScrollBarEnabled = false
            setBackgroundColor(Th.p.surface2)
            addView(tb)
        }
        addView(tbScroll, W.lp(W.MATCH, W.WRAP))

        editor.apply {
            gravity = Gravity.TOP or Gravity.START
            background = null
            setTextColor(Th.p.text)
            setHintTextColor(Th.p.textDim)
            highlightColor = Th.p.selection
            typeface = Typeface.MONOSPACE
            setPadding(dp(14), dp(10), dp(14), dp(10))
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            isSingleLine = false
            setHorizontallyScrolling(false)
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun afterTextChanged(s: Editable?) {
                    if (!loading && !dirty) {
                        dirty = true
                        updateTitle()
                    }
                    updateStatus()
                }
            })
        }
        setFont(fontSp)
        addView(editor, W.lp(W.MATCH, 0, 1f))
        addView(status, W.lp(W.MATCH, W.WRAP))

        win.onCloseRequest = {
            if (dirty) {
                askSave { win.act.windows.close(win, force = true) }
                false
            } else true
        }
        win.onArgument = { a -> (a as? File)?.let { f -> confirmDiscard { load(f) } } }
        win.onFileDrop = { files -> files.firstOrNull { it.isFile }?.let { f -> confirmDiscard { load(f) } } }
        win.acceptFileDrops(editor)
        if (start != null) load(start) else newDoc()
    }

    private fun setFont(sp: Float) {
        fontSp = sp.coerceIn(9f, 40f)
        editor.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSp * Ui.scale)
    }

    private fun updateTitle() {
        win.setTitle((if (dirty) "*" else "") + docName + " — " + act.getString(R.string.app_notepad))
    }

    private fun updateStatus() {
        val t = editor.text
        var lines = 1
        for (i in t.indices) if (t[i] == '\n') lines++
        status.text = act.getString(R.string.notepad_status, lines, t.length)
    }

    private fun setText(s: String) {
        loading = true
        editor.setText(s)
        loading = false
        dirty = false
        updateTitle()
        updateStatus()
    }

    private fun newDoc() {
        file = null
        docName = act.getString(R.string.untitled)
        setText("")
    }

    private fun load(f: File) {
        if (f.length() > 8L * 1024 * 1024) {
            W.toast(act, act.getString(R.string.file_too_big))
            return
        }
        Thread {
            val text = try {
                f.readText()
            } catch (e: Exception) {
                null
            }
            main.post {
                if (text == null) {
                    W.toast(act, act.getString(R.string.failed))
                } else {
                    file = f
                    docName = f.name
                    setText(text)
                }
            }
        }.start()
    }

    private fun openPicker() {
        act.pickDocument("text/*") { uri -> loadUri(uri) }
    }

    private fun loadUri(uri: Uri) {
        Thread {
            val text = try {
                act.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) }
            } catch (_: Exception) {
                null
            }
            var name = act.getString(R.string.untitled)
            try {
                act.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                    if (c.moveToFirst()) name = c.getString(0) ?: name
                }
            } catch (_: Exception) {
            }
            main.post {
                if (text == null) W.toast(act, act.getString(R.string.failed))
                else {
                    file = null
                    docName = name
                    setText(text)
                }
            }
        }.start()
    }

    private fun save(after: (() -> Unit)? = null) {
        val f = file
        if (f == null) {
            saveAs(after)
            return
        }
        writeTo(f, after)
    }

    private fun saveAs(after: (() -> Unit)? = null) {
        if (!Storage.hasAccess(act)) {
            W.toast(act, act.getString(R.string.storage_access_title))
            Storage.request(act)
            return
        }
        val dir = file?.parentFile ?: Storage.publicDir(Environment.DIRECTORY_DOCUMENTS)
        val def = if (docName.contains('.')) docName else "$docName.txt"
        W.prompt(act, act.getString(R.string.save_as), def, act.getString(R.string.save), act.getString(R.string.cancel), selectBase = true) { name ->
            dir.mkdirs()
            val target = File(dir, if (name.contains('.')) name else "$name.txt")
            val go = { writeTo(target, after) }
            if (target.exists() && target.absolutePath != file?.absolutePath) {
                W.confirm(act, act.getString(R.string.save_as), act.getString(R.string.replace_confirm, target.name),
                    act.getString(R.string.replace), act.getString(R.string.cancel), go)
            } else go()
        }
    }

    private fun writeTo(f: File, after: (() -> Unit)?) {
        val text = editor.text.toString()
        Thread {
            val ok = try {
                f.writeText(text)
                true
            } catch (_: Exception) {
                false
            }
            main.post {
                if (!ok) {
                    W.toast(act, act.getString(R.string.failed))
                } else {
                    file = f
                    docName = f.name
                    dirty = false
                    updateTitle()
                    W.toast(act, act.getString(R.string.saved_to, f.parentFile?.name ?: f.absolutePath))
                    after?.invoke()
                }
            }
        }.start()
    }

    private fun askSave(after: () -> Unit) {
        W.dialog(act).setTitle(act.getString(R.string.app_notepad))
            .setMessage(act.getString(R.string.save_changes_q, docName))
            .setPositiveButton(R.string.save) { _, _ -> save(after) }
            .setNegativeButton(R.string.dont_save) { _, _ -> after() }
            .setNeutralButton(R.string.cancel, null)
            .show()
    }

    private fun confirmDiscard(go: () -> Unit) {
        if (!dirty) go() else askSave(go)
    }

}
