package com.windowsfx.launcher

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File

/** Shares device files with other apps through content:// links. */
class FileShareProvider : ContentProvider() {
    companion object {
        const val AUTHORITY = "com.windowsfx.launcher.files"
        fun uriFor(f: File): Uri = Uri.Builder().scheme("content").authority(AUTHORITY)
            .encodedPath(Uri.encode(f.absolutePath, "/")).build()
    }

    private fun fileOf(uri: Uri) = File(uri.path ?: "/")
    override fun onCreate() = true
    override fun getType(uri: Uri): String = DeviceFs(context!!).mime(fileOf(uri))
    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor =
        ParcelFileDescriptor.open(fileOf(uri), ParcelFileDescriptor.parseMode(mode))

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor {
        val f = fileOf(uri)
        val cols = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        return MatrixCursor(cols).apply {
            addRow(cols.map { if (it == OpenableColumns.DISPLAY_NAME) f.name else if (it == OpenableColumns.SIZE) f.length() else null }.toTypedArray())
        }
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0
}
