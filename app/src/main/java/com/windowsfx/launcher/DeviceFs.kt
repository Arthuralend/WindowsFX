package com.windowsfx.launcher

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaScannerConnection
import android.media.ThumbnailUtils
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.Settings
import android.util.Base64
import android.util.Size
import android.webkit.MimeTypeMap
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException

/** Real device storage for the WindowsFX file system. All paths are absolute. */
class DeviceFs(private val ctx: Context) {

    class FsError(val code: String, msg: String) : Exception(msg)

    // ------------------------------------------------------------------ access

    fun hasAccess(): Boolean =
        if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager()
        else ctx.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED

    fun requestAccess(act: Activity) {
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                act.startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + act.packageName)))
            } catch (_: Exception) {
                act.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            }
        } else {
            act.requestPermissions(arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE), 77)
        }
    }

    private fun need() {
        if (!hasAccess()) throw FsError("EACCES", "no storage access")
    }

    // ------------------------------------------------------------------ roots

    fun internal(): File = Environment.getExternalStorageDirectory()

    fun removable(): List<File> = ctx.getExternalFilesDirs(null).drop(1).filterNotNull().mapNotNull { dir ->
        val p = dir.absolutePath
        val i = p.indexOf("/Android/")
        if (i > 0) File(p.substring(0, i)) else null
    }

    fun roots(): JSONArray {
        val out = JSONArray()
        fun add(key: String, f: File) {
            val (free, total) = try {
                val s = StatFs(f.absolutePath)
                s.availableBytes to s.totalBytes
            } catch (_: Exception) {
                0L to 0L
            }
            out.put(JSONObject().put("key", key).put("path", f.absolutePath).put("free", free).put("total", total))
        }
        add("internal", internal())
        removable().forEachIndexed { i, f -> add("sd$i", f) }
        return out
    }

    // ------------------------------------------------------------------ queries

    private fun info(f: File): JSONObject = JSONObject()
        .put("n", f.name)
        .put("d", f.isDirectory)
        .put("s", if (f.isFile) f.length() else 0L)
        .put("m", f.lastModified())

    fun stat(path: String): JSONObject? {
        val f = File(path)
        if (!f.exists()) return null
        return JSONObject().put("t", if (f.isDirectory) "d" else "f").put("s", if (f.isFile) f.length() else 0L).put("m", f.lastModified())
    }

    fun list(path: String): JSONArray {
        need()
        val f = File(path)
        if (!f.isDirectory) throw FsError("ENOENT", "not a folder")
        val arr = JSONArray()
        (f.listFiles() ?: throw FsError("EACCES", "cannot read folder")).forEach { arr.put(info(it)) }
        return arr
    }

    fun readText(path: String, max: Long): String {
        need()
        val f = File(path)
        if (!f.isFile) throw FsError("ENOENT", "file not found")
        if (f.length() > max) throw FsError("EFBIG", "file too large")
        return f.readText()
    }

    fun readBase64(path: String, max: Long): String {
        need()
        val f = File(path)
        if (!f.isFile) throw FsError("ENOENT", "file not found")
        if (f.length() > max) throw FsError("EFBIG", "file too large")
        return Base64.encodeToString(f.readBytes(), Base64.NO_WRAP)
    }

    fun writeText(path: String, text: String) {
        need()
        val f = File(path)
        if (f.isDirectory) throw FsError("EISDIR", "is a folder")
        f.parentFile?.mkdirs()
        f.writeText(text)
        scan(f)
    }

    fun writeBase64(path: String, b64: String) {
        need()
        val f = File(path)
        if (f.isDirectory) throw FsError("EISDIR", "is a folder")
        f.parentFile?.mkdirs()
        f.writeBytes(Base64.decode(b64, Base64.DEFAULT))
        scan(f)
    }

    /** Запись частями (архиватор): первая часть создаёт файл, остальные дописываются. */
    fun writeChunk(path: String, b64: String, append: Boolean, done: Boolean, mtime: Long) {
        need()
        val f = File(path)
        if (f.isDirectory) throw FsError("EISDIR", "is a folder")
        f.parentFile?.mkdirs()
        java.io.FileOutputStream(f, append).use { if (b64.isNotEmpty()) it.write(Base64.decode(b64, Base64.DEFAULT)) }
        if (done) {
            if (mtime > 0) f.setLastModified(mtime)
            scan(f)
        }
    }

    fun mkdir(path: String) {
        need()
        val f = File(path)
        if (f.exists()) throw FsError("EEXIST", "already exists")
        if (!f.mkdirs()) throw FsError("EIO", "cannot create folder")
    }

    fun rename(path: String, newName: String): String {
        need()
        val f = File(path)
        val t = File(f.parentFile, newName)
        if (t.exists() && !t.absolutePath.equals(f.absolutePath, ignoreCase = true)) throw FsError("EEXIST", "already exists")
        if (!f.renameTo(t)) throw FsError("EIO", "cannot rename")
        scan(t)
        return t.absolutePath
    }

    fun remove(path: String) {
        need()
        val f = File(path)
        if (!f.exists()) return
        if (!f.deleteRecursively()) throw FsError("EIO", "cannot delete")
        scan(f)
    }

    private fun isInside(child: File, parent: File): Boolean {
        val c = child.canonicalPath
        val p = parent.canonicalPath
        return c == p || c.startsWith("$p/")
    }

    fun copy(src: String, dest: String) {
        need()
        val s = File(src)
        val d = File(dest)
        if (!s.exists()) throw FsError("ENOENT", "source not found")
        if (d.exists()) throw FsError("EEXIST", "already exists")
        if (s.isDirectory && isInside(d, s)) throw FsError("EINVAL", "into itself")
        d.parentFile?.mkdirs()
        if (s.isDirectory) {
            if (!s.copyRecursively(d, overwrite = false)) throw FsError("EIO", "copy failed")
        } else {
            s.copyTo(d, overwrite = false)
            d.setLastModified(s.lastModified())
        }
        scan(d)
    }

    fun move(src: String, dest: String) {
        need()
        val s = File(src)
        val d = File(dest)
        if (!s.exists()) throw FsError("ENOENT", "source not found")
        if (d.exists()) throw FsError("EEXIST", "already exists")
        if (s.isDirectory && isInside(d, s)) throw FsError("EINVAL", "into itself")
        d.parentFile?.mkdirs()
        if (!s.renameTo(d)) {
            copy(src, dest)
            s.deleteRecursively()
        }
        scan(s)
        scan(d)
    }

    // ------------------------------------------------------------------ recycle bin

    private fun trashDir(forFile: File): File {
        val root = (removable() + internal()).firstOrNull { isInside(forFile, it) } ?: internal()
        return File(root, ".WindowsFX/RecycleBin").apply { mkdirs() }
    }

    /** Moves a file into the hidden recycle bin of its volume; returns where it went. */
    fun trash(path: String): String {
        need()
        val f = File(path)
        if (!f.exists()) throw FsError("ENOENT", "not found")
        val dir = File(trashDir(f), System.currentTimeMillis().toString(36) + "_" + (0..9999).random())
        dir.mkdirs()
        val t = File(dir, f.name)
        if (!f.renameTo(t)) {
            if (f.isDirectory) f.copyRecursively(t) else f.copyTo(t)
            f.deleteRecursively()
        }
        scan(f)
        return t.absolutePath
    }

    fun untrash(trashPath: String, dest: String) {
        move(trashPath, dest)
        File(trashPath).parentFile?.let { if (it.list()?.isEmpty() == true) it.delete() }
    }

    fun purge(trashPath: String) {
        val f = File(trashPath)
        f.deleteRecursively()
        f.parentFile?.let { if (it.list()?.isEmpty() == true) it.delete() }
    }

    // ------------------------------------------------------------------ search / stats

    fun search(dir: String, query: String, limit: Int): JSONArray {
        need()
        val q = query.lowercase()
        val out = JSONArray()
        val root = File(dir)
        val stack = ArrayDeque<File>()
        stack.add(root)
        var visited = 0
        while (stack.isNotEmpty() && out.length() < limit && visited < 60_000) {
            val d = stack.removeFirst()
            val kids = d.listFiles() ?: continue
            for (k in kids) {
                visited++
                if (k.name.startsWith(".")) continue
                if (k.name.lowercase().contains(q)) {
                    out.put(info(k).put("p", k.absolutePath))
                    if (out.length() >= limit) break
                }
                if (k.isDirectory) stack.add(k)
            }
        }
        return out
    }

    fun usage(path: String): JSONObject {
        var files = 0
        var dirs = 0
        var size = 0L
        File(path).walkTopDown().drop(1).forEach {
            if (it.isDirectory) dirs++ else {
                files++
                size += it.length()
            }
        }
        return JSONObject().put("files", files).put("dirs", dirs).put("size", size)
    }

    // ------------------------------------------------------------------ media helpers

    fun mime(f: File): String {
        val e = f.name.substringAfterLast('.', "").lowercase()
        return MIME_EXTRA[e] ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(e) ?: "application/octet-stream"
    }

    /** JPEG thumbnail for images and videos (null if not possible). */
    fun thumbnail(f: File, size: Int): ByteArray? {
        return try {
            val m = mime(f)
            val bmp: Bitmap? = when {
                m.startsWith("video/") && Build.VERSION.SDK_INT >= 29 -> ThumbnailUtils.createVideoThumbnail(f, Size(size, size), null)
                m.startsWith("image/") && Build.VERSION.SDK_INT >= 29 -> ThumbnailUtils.createImageThumbnail(f, Size(size, size), null)
                m.startsWith("image/") -> {
                    val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeFile(f.absolutePath, o)
                    var s = 1
                    while (maxOf(o.outWidth, o.outHeight) / (s * 2) >= size) s *= 2
                    BitmapFactory.decodeFile(f.absolutePath, BitmapFactory.Options().apply { inSampleSize = s })
                }
                else -> null
            }
            bmp ?: return null
            val out = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, 82, out)
            out.toByteArray()
        } catch (_: IOException) {
            null
        } catch (_: Throwable) {
            null
        }
    }

    private fun scan(f: File) {
        try {
            MediaScannerConnection.scanFile(ctx, arrayOf(f.absolutePath), null, null)
        } catch (_: Exception) {
        }
    }

    companion object {
        val MIME_EXTRA = mapOf(
            "js" to "text/javascript", "mjs" to "text/javascript", "wasm" to "application/wasm",
            "json" to "application/json", "svg" to "image/svg+xml", "md" to "text/markdown",
            "webp" to "image/webp", "heic" to "image/heic", "m4a" to "audio/mp4", "flac" to "audio/flac",
            "opus" to "audio/ogg", "mkv" to "video/x-matroska", "ttf" to "font/ttf", "otf" to "font/otf",
            "woff" to "font/woff", "woff2" to "font/woff2", "css" to "text/css", "html" to "text/html",
            "htm" to "text/html", "txt" to "text/plain", "csv" to "text/csv", "xml" to "text/xml",
            "pdf" to "application/pdf",
            "docx" to "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "xlsx" to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "pptx" to "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "doc" to "application/msword", "xls" to "application/vnd.ms-excel", "odt" to "application/vnd.oasis.opendocument.text",
            "ods" to "application/vnd.oasis.opendocument.spreadsheet", "psd" to "image/vnd.adobe.photoshop",
            "zip" to "application/zip", "apk" to "application/vnd.android.package-archive",
        )
    }
}
