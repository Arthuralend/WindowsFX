package com.windowsfx.launcher.files

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.os.StatFs
import android.provider.OpenableColumns
import android.provider.Settings
import android.webkit.MimeTypeMap
import com.windowsfx.launcher.R
import com.windowsfx.launcher.core.W
import java.io.File
import java.text.DecimalFormat

object Storage {
    fun hasAccess(ctx: Context): Boolean =
        if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager()
        else ctx.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED

    fun request(act: Activity) {
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                act.startActivity(
                    Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + act.packageName)),
                )
            } catch (_: Exception) {
                act.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            }
        } else {
            act.requestPermissions(
                arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE), 77,
            )
        }
    }

    fun internal(): File = Environment.getExternalStorageDirectory()

    /** Removable SD cards / USB drives that are mounted. */
    fun removable(ctx: Context): List<File> =
        ctx.getExternalFilesDirs(null).drop(1).filterNotNull().mapNotNull { dir ->
            val p = dir.absolutePath
            val i = p.indexOf("/Android/")
            if (i > 0) File(p.substring(0, i)) else null
        }

    @Suppress("DEPRECATION")
    fun publicDir(type: String): File = Environment.getExternalStoragePublicDirectory(type)

    fun freeTotal(f: File): Pair<Long, Long> = try {
        val s = StatFs(f.absolutePath)
        s.availableBytes to s.totalBytes
    } catch (_: Exception) {
        0L to 0L
    }
}

object Files {
    private val sizeFmt = DecimalFormat("#,##0.#")

    fun ext(f: File): String = f.name.substringAfterLast('.', "").lowercase()

    fun mime(f: File): String = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext(f)) ?: "*/*"

    fun size(ctx: Context, bytes: Long): String {
        val units = ctx.resources.getStringArray(R.array.size_units)
        var v = bytes.toDouble()
        var i = 0
        while (v >= 1024 && i < units.size - 1) {
            v /= 1024; i++
        }
        return sizeFmt.format(v) + " " + units[i]
    }

    val TEXT = setOf("txt", "log", "md", "json", "xml", "csv", "ini", "conf", "cfg", "kt", "java", "py", "js", "ts",
        "html", "htm", "css", "sh", "yml", "yaml", "properties", "gradle", "c", "cpp", "h", "srt")
    val IMAGE = setOf("png", "jpg", "jpeg", "bmp", "webp", "gif", "heic")

    fun iconFor(f: File): Int {
        if (f.isDirectory) return R.drawable.ic_folder
        return when (ext(f)) {
            in IMAGE -> R.drawable.ic_image
            "pdf" -> R.drawable.ic_pdf
            "doc", "docx", "odt", "rtf" -> R.drawable.ic_doc
            "xls", "xlsx", "ods" -> R.drawable.ic_table
            "mp3", "wav", "ogg", "flac", "m4a", "aac" -> R.drawable.ic_music
            "mp4", "mkv", "avi", "mov", "webm", "3gp" -> R.drawable.ic_movie
            "zip", "rar", "7z", "tar", "gz" -> R.drawable.ic_zip
            "apk" -> R.drawable.ic_apk
            in TEXT -> R.drawable.ic_doc
            else -> R.drawable.ic_file
        }
    }

    /** "name (2).ext" if the name is taken. */
    fun unique(dir: File, name: String): File {
        var f = File(dir, name)
        if (!f.exists()) return f
        val base = name.substringBeforeLast('.', name)
        val ext = if (name.contains('.') && !name.startsWith('.')) "." + name.substringAfterLast('.') else ""
        var n = 2
        while (f.exists()) {
            f = File(dir, "$base ($n)$ext")
            n++
        }
        return f
    }

    fun uriFor(f: File): Uri = Uri.Builder().scheme("content").authority(FileShareProvider.AUTHORITY)
        .encodedPath(Uri.encode(f.absolutePath, "/")).build()

    /** Opens a file with another Android app. */
    fun openExternal(act: Activity, f: File, chooser: Boolean = false) {
        val i = Intent(Intent.ACTION_VIEW).setDataAndType(uriFor(f), mime(f))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            act.startActivity(if (chooser) Intent.createChooser(i, act.getString(R.string.open_with)) else i)
        } catch (_: ActivityNotFoundException) {
            W.toast(act, act.getString(R.string.no_app_for_file))
        }
    }

    fun share(act: Activity, f: File) {
        val i = Intent(Intent.ACTION_SEND).setType(mime(f)).putExtra(Intent.EXTRA_STREAM, uriFor(f))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        try {
            act.startActivity(Intent.createChooser(i, act.getString(R.string.share)))
        } catch (_: ActivityNotFoundException) {
            W.toast(act, act.getString(R.string.no_app_for_file))
        }
    }

    fun isInside(child: File, parent: File): Boolean {
        val c = child.canonicalPath
        val p = parent.canonicalPath
        return c == p || c.startsWith("$p/")
    }

    /** Copy or move [src] into [dir]. Returns the new file. */
    fun transfer(src: File, dir: File, move: Boolean): File {
        if (src.isDirectory && isInside(dir, src)) throw IllegalArgumentException("into itself")
        val target = if (move && src.parentFile?.canonicalPath == dir.canonicalPath) return src else unique(dir, src.name)
        if (move && src.renameTo(target)) return target
        if (src.isDirectory) {
            if (!src.copyRecursively(target, overwrite = false)) throw java.io.IOException("copy failed")
        } else {
            src.copyTo(target, overwrite = false)
            target.setLastModified(src.lastModified())
        }
        if (move) src.deleteRecursively()
        return target
    }
}

/** Shares local files with other apps via content:// URIs (no AndroidX needed). */
class FileShareProvider : ContentProvider() {
    companion object {
        const val AUTHORITY = "com.windowsfx.launcher.files"
    }

    private fun fileOf(uri: Uri): File = File(uri.path ?: "/")

    override fun onCreate(): Boolean = true

    override fun getType(uri: Uri): String = Files.mime(fileOf(uri))

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor =
        ParcelFileDescriptor.open(fileOf(uri), ParcelFileDescriptor.parseMode(mode))

    override fun query(
        uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?,
    ): Cursor {
        val f = fileOf(uri)
        val cols = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        val c = MatrixCursor(cols)
        c.addRow(cols.map {
            when (it) {
                OpenableColumns.DISPLAY_NAME -> f.name
                OpenableColumns.SIZE -> f.length()
                else -> null
            }
        }.toTypedArray())
        return c
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}
