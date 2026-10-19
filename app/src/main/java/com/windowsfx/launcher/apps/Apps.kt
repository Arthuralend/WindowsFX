package com.windowsfx.launcher.apps

import android.view.View
import com.windowsfx.launcher.DesktopActivity
import com.windowsfx.launcher.R
import com.windowsfx.launcher.wm.FxWindow
import java.io.File

/** Programs built into WindowsFX. */
enum class Builtin(
    val key: String,
    val title: Int,
    val icon: Int,
    val defW: Int,
    val defH: Int,
    val single: Boolean = false,
) {
    EXPLORER("explorer", R.string.app_explorer, R.drawable.ic_app_explorer, 940, 600),
    NOTEPAD("notepad", R.string.app_notepad, R.drawable.ic_app_notepad, 760, 540),
    PAINT("paint", R.string.app_paint, R.drawable.ic_app_paint, 960, 660),
    PDF("pdf", R.string.app_pdf, R.drawable.ic_app_pdf, 840, 700),
    CALC("calc", R.string.app_calc, R.drawable.ic_app_calc, 340, 540, single = true),
    SETTINGS("settings", R.string.app_settings, R.drawable.ic_app_settings, 900, 660, single = true);

    companion object {
        fun byKey(k: String): Builtin? = values().firstOrNull { it.key == k }
    }
}

object Apps {
    fun create(act: DesktopActivity, app: Builtin, win: FxWindow, arg: Any?): View = when (app) {
        Builtin.EXPLORER -> ExplorerView(act, win, arg as? File)
        Builtin.NOTEPAD -> NotepadView(act, win, arg as? File)
        Builtin.PAINT -> PaintView(act, win, arg as? File)
        Builtin.PDF -> PdfView(act, win, arg as? File)
        Builtin.CALC -> CalculatorView(act)
        Builtin.SETTINGS -> SettingsView(act, win)
    }
}
