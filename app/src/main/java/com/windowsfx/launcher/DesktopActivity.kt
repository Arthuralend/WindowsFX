package com.windowsfx.launcher

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import com.windowsfx.launcher.core.Lang
import com.windowsfx.launcher.core.Prefs
import com.windowsfx.launcher.core.Th
import com.windowsfx.launcher.core.Ui
import com.windowsfx.launcher.core.W
import com.windowsfx.launcher.core.dp
import com.windowsfx.launcher.shell.AndroidApps
import com.windowsfx.launcher.shell.DesktopIcons
import com.windowsfx.launcher.shell.StartMenu
import com.windowsfx.launcher.shell.Taskbar
import com.windowsfx.launcher.shell.Wallpapers

/** The WindowsFX desktop: wallpaper, icons, windows, start menu and taskbar. */
class DesktopActivity : Activity() {

    lateinit var root: FrameLayout
        private set
    private lateinit var wallpaper: ImageView
    lateinit var desktop: DesktopIcons
        private set
    lateinit var windows: com.windowsfx.launcher.wm.WindowHost
        private set
    lateinit var taskbar: Taskbar
        private set
    lateinit var start: StartMenu
        private set

    /** Views that want to know when the user comes back (e.g. after granting storage access). */
    val resumeListeners = mutableListOf<() -> Unit>()

    /** Views that show files and must refresh after a copy / move / delete anywhere. */
    val fileListeners = mutableListOf<() -> Unit>()

    fun filesChanged() {
        fileListeners.toList().forEach { it() }
    }
    private val pickCallbacks = mutableMapOf<Int, (Uri) -> Unit>()
    private var nextRequest = 1000

    private val packageReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, i: Intent?) {
            AndroidApps.load(this@DesktopActivity) {
                taskbar.refresh()
                desktop.refresh()
            }
        }
    }

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(Lang.wrap(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        Prefs.init(this)
        Ui.scale = Prefs.uiScale
        Th.apply()
        setTheme(if (Th.p.dark) R.style.Theme_WFX else R.style.Theme_WFX_Light)
        super.onCreate(savedInstanceState)
        applySystemBars()

        root = FrameLayout(this)
        wallpaper = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
        root.addView(wallpaper, FrameLayout.LayoutParams(W.MATCH, W.MATCH))
        applyWallpaper()

        val barH = dp(52)
        desktop = DesktopIcons(this)
        root.addView(desktop, FrameLayout.LayoutParams(W.MATCH, W.MATCH).apply { bottomMargin = barH })

        windows = com.windowsfx.launcher.wm.WindowHost(this)
        root.addView(windows, FrameLayout.LayoutParams(W.MATCH, W.MATCH).apply { bottomMargin = barH })

        start = StartMenu(this)
        root.addView(start, FrameLayout.LayoutParams(W.MATCH, W.MATCH).apply { bottomMargin = barH })

        taskbar = Taskbar(this)
        root.addView(taskbar, FrameLayout.LayoutParams(W.MATCH, barH, Gravity.BOTTOM))

        windows.onChanged = { taskbar.refresh() }
        setContentView(root)

        AndroidApps.allowHiddenApi()
        AndroidApps.load(this) {
            taskbar.refresh()
            desktop.refresh()
        }
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_CHANGED)
            addDataScheme("package")
        }
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(packageReceiver, filter, Context.RECEIVER_EXPORTED)
        else registerReceiver(packageReceiver, filter)
    }

    override fun onDestroy() {
        try {
            unregisterReceiver(packageReceiver)
        } catch (_: Exception) {
        }
        super.onDestroy()
    }

    override fun onResume() {
        super.onResume()
        applySystemBars()
        resumeListeners.toList().forEach { it() }
    }

    @Suppress("DEPRECATION")
    private fun applySystemBars() {
        window.navigationBarColor = Th.p.taskbar or 0xFF000000.toInt()
        if (Prefs.hideStatusBar) {
            if (Build.VERSION.SDK_INT >= 30) {
                window.insetsController?.let {
                    it.hide(WindowInsets.Type.statusBars())
                    it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                }
            } else {
                window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
            }
        } else {
            if (Build.VERSION.SDK_INT >= 30) window.insetsController?.show(WindowInsets.Type.statusBars())
            else window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        }
    }

    fun applyWallpaper() {
        wallpaper.setImageDrawable(Wallpapers.current(this, Prefs.customWallpaper, Prefs.wallpaper))
    }

    /** Pressing Home while already on the desktop. */
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        if (::start.isInitialized) start.hide()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        when {
            start.isOpen -> start.hide()
            windows.topVisible() != null -> windows.topVisible()?.let { windows.minimize(it) }
            // A launcher never closes itself on Back.
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        // Physical keyboard: the Windows/Meta key opens Start.
        if (keyCode == KeyEvent.KEYCODE_META_LEFT || keyCode == KeyEvent.KEYCODE_META_RIGHT) {
            start.toggle()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    /** Switches the interface language and rebuilds the desktop. */
    fun setLanguage(code: String) {
        if (Prefs.lang == code) return
        val apply = {
            Prefs.lang = code
            recreate()
        }
        if (windows.windows.isNotEmpty()) {
            W.confirm(this, getString(R.string.language), getString(R.string.windows_will_close), getString(R.string.ok), getString(R.string.cancel), apply)
        } else apply()
    }

    /** Re-creates the UI after a theme / scale change. */
    fun rebuild() {
        Ui.scale = Prefs.uiScale
        recreate()
    }

    fun openSystem(action: String) {
        try {
            startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
            try {
                startActivity(Intent(android.provider.Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Exception) {
                W.toast(this, getString(R.string.not_available))
            }
        }
    }

    /** Lets the user pick a document with the system picker. */
    @Suppress("DEPRECATION")
    fun pickDocument(mime: String, onPicked: (Uri) -> Unit) {
        val code = nextRequest++
        pickCallbacks[code] = onPicked
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime)
        try {
            startActivityForResult(i, code)
        } catch (_: Exception) {
            pickCallbacks.remove(code)
            W.toast(this, getString(R.string.not_available))
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val cb = pickCallbacks.remove(requestCode) ?: return
        val uri = data?.data
        if (resultCode == RESULT_OK && uri != null) cb(uri)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        resumeListeners.toList().forEach { it() }
    }
}
