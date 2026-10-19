package com.windowsfx.launcher.core

import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

/** Small factory of styled widgets used across the shell and the built-in apps. */
object W {
    const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT

    fun text(
        ctx: Context, s: CharSequence, sizeSp: Float = 14f, color: Int = Th.p.text,
        bold: Boolean = false, lines: Int = 1,
    ): TextView = TextView(ctx).apply {
        text = s
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp * Ui.scale)
        setTextColor(color)
        if (bold) typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        if (lines > 0) {
            maxLines = lines
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        includeFontPadding = false
    }

    fun icon(ctx: Context, res: Int, sizeDp: Int, tint: Int? = null): ImageView = ImageView(ctx).apply {
        setImageResource(res)
        scaleType = ImageView.ScaleType.FIT_CENTER
        if (tint != null) imageTintList = android.content.res.ColorStateList.valueOf(tint)
        layoutParams = LinearLayout.LayoutParams(ctx.dp(sizeDp), ctx.dp(sizeDp))
    }

    /** Square icon button for toolbars. */
    fun iconButton(
        ctx: Context, res: Int, desc: String, tint: Int? = Th.p.text, sizeDp: Int = 36, onClick: (View) -> Unit,
    ): FrameLayout = FrameLayout(ctx).apply {
        val img = ImageView(ctx).apply {
            setImageResource(res)
            if (tint != null) imageTintList = android.content.res.ColorStateList.valueOf(tint)
        }
        addView(img, FrameLayout.LayoutParams(ctx.dp(sizeDp * 0.55f), ctx.dp(sizeDp * 0.55f), Gravity.CENTER))
        background = pressable(null, ctx.dpf(6))
        contentDescription = desc
        isClickable = true
        setOnClickListener(onClick)
        setOnLongClickListener { toast(ctx, desc); true }
        layoutParams = LinearLayout.LayoutParams(ctx.dp(sizeDp), ctx.dp(sizeDp))
    }

    /** Text button; [primary] gives the accent fill. */
    fun button(ctx: Context, label: String, primary: Boolean = false, onClick: (View) -> Unit): TextView =
        text(ctx, label, 13f, if (primary) Color.WHITE else Th.p.text, bold = true).apply {
            gravity = Gravity.CENTER
            setPadding(ctx.dp(14), ctx.dp(8), ctx.dp(14), ctx.dp(8))
            val base = if (primary) rounded(Th.p.accent, ctx.dpf(6))
            else rounded(Th.p.surface3, ctx.dpf(6), 1, Th.p.border)
            background = pressable(base, ctx.dpf(6))
            isClickable = true
            setOnClickListener(onClick)
        }

    /** Compact flat text button for app toolbars. */
    fun tool(ctx: Context, label: String, onClick: (View) -> Unit): TextView =
        text(ctx, label, 13f).apply {
            gravity = Gravity.CENTER
            setPadding(ctx.dp(10), ctx.dp(6), ctx.dp(10), ctx.dp(6))
            background = pressable(null, ctx.dpf(6))
            isClickable = true
            setOnClickListener(onClick)
        }

    fun hbox(ctx: Context, gravity: Int = Gravity.CENTER_VERTICAL): LinearLayout = LinearLayout(ctx).apply {
        orientation = LinearLayout.HORIZONTAL
        this.gravity = gravity
    }

    fun vbox(ctx: Context): LinearLayout = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }

    fun lp(w: Int, h: Int, weight: Float = 0f): LinearLayout.LayoutParams = LinearLayout.LayoutParams(w, h, weight)

    fun spacer(ctx: Context): View = View(ctx).apply { layoutParams = LinearLayout.LayoutParams(0, 1, 1f) }

    fun divider(ctx: Context, vertical: Boolean = false): View = View(ctx).apply {
        setBackgroundColor(Th.p.border)
        layoutParams = if (vertical) LinearLayout.LayoutParams(1, ctx.dp(20)).apply {
            setMargins(ctx.dp(4), 0, ctx.dp(4), 0)
        } else LinearLayout.LayoutParams(MATCH, 1)
    }

    /** Toolbar strip at the top of an app window. */
    fun toolbar(ctx: Context): LinearLayout = hbox(ctx).apply {
        setPadding(ctx.dp(6), ctx.dp(4), ctx.dp(6), ctx.dp(4))
        setBackgroundColor(Th.p.surface2)
    }

    fun statusBar(ctx: Context): TextView = text(ctx, "", 12f, Th.p.textDim).apply {
        setPadding(ctx.dp(12), ctx.dp(5), ctx.dp(12), ctx.dp(5))
        setBackgroundColor(Th.p.surface2)
    }

    fun toast(ctx: Context, msg: CharSequence) = Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show()

    fun dialog(ctx: Context): AlertDialog.Builder = AlertDialog.Builder(
        ctx,
        if (Th.p.dark) android.R.style.Theme_Material_Dialog_Alert else android.R.style.Theme_Material_Light_Dialog_Alert,
    )

    /** Simple text prompt. */
    fun prompt(ctx: Context, title: String, initial: String, ok: String, cancel: String, selectBase: Boolean = false, done: (String) -> Unit) {
        val edit = EditText(ctx).apply {
            setText(initial)
            inputType = InputType.TYPE_CLASS_TEXT
            setSingleLine()
            val dot = initial.lastIndexOf('.')
            if (selectBase && dot > 0) setSelection(0, dot) else selectAll()
        }
        val box = FrameLayout(ctx).apply {
            setPadding(ctx.dp(20), ctx.dp(8), ctx.dp(20), 0)
            addView(edit)
        }
        val d = dialog(ctx).setTitle(title).setView(box)
            .setPositiveButton(ok) { _, _ ->
                val v = edit.text.toString().trim()
                if (v.isNotEmpty()) done(v)
            }
            .setNegativeButton(cancel, null)
            .create()
        d.window?.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE)
        d.show()
        edit.requestFocus()
    }

    fun confirm(ctx: Context, title: String, msg: String, ok: String, cancel: String, done: () -> Unit) {
        dialog(ctx).setTitle(title).setMessage(msg)
            .setPositiveButton(ok) { _, _ -> done() }
            .setNegativeButton(cancel, null)
            .show()
    }
}
