package com.windowsfx.launcher.shell

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.net.Uri
import com.windowsfx.launcher.R
import java.io.File

object Wallpapers {
    private class Preset(val name: Int, val base: IntArray, val glowA: Int, val glowB: Int)

    private val presets = listOf(
        Preset(R.string.wp_aurora, intArrayOf(0xFF0B1230.toInt(), 0xFF1E1650.toInt(), 0xFF3A1663.toInt()), 0x8022D3EE.toInt(), 0x80D946EF.toInt()),
        Preset(R.string.wp_ocean, intArrayOf(0xFF031B34.toInt(), 0xFF07406B.toInt(), 0xFF0A6E8F.toInt()), 0x7038BDF8, 0x6014B8A6),
        Preset(R.string.wp_sunset, intArrayOf(0xFF2A0E3A.toInt(), 0xFF7A1E4F.toInt(), 0xFFE0703A.toInt()), 0x70FB923C, 0x70F43F5E),
        Preset(R.string.wp_forest, intArrayOf(0xFF07211A.toInt(), 0xFF0E3B2C.toInt(), 0xFF1F6B47.toInt()), 0x6034D399, 0x50A3E635),
        Preset(R.string.wp_graphite, intArrayOf(0xFF111318.toInt(), 0xFF1C2028.toInt(), 0xFF2B303B.toInt()), 0x406B7280, 0x30A5B4FC),
        Preset(R.string.wp_bloom, intArrayOf(0xFFE8ECFF.toInt(), 0xFFD6DEFF.toInt(), 0xFFF3E6FF.toInt()), 0x806366F1.toInt(), 0x80EC4899.toInt()),
    )

    val count get() = presets.size

    fun name(ctx: Context, i: Int): String = ctx.getString(presets[i.coerceIn(0, presets.size - 1)].name)

    fun preset(i: Int): Drawable {
        val p = presets[i.coerceIn(0, presets.size - 1)]
        val base = GradientDrawable(GradientDrawable.Orientation.TL_BR, p.base)
        val glow1 = GradientDrawable().apply {
            gradientType = GradientDrawable.RADIAL_GRADIENT
            colors = intArrayOf(p.glowA, p.glowA and 0x00FFFFFF)
            setGradientCenter(0.15f, 0.9f)
            gradientRadius = 1400f
        }
        val glow2 = GradientDrawable().apply {
            gradientType = GradientDrawable.RADIAL_GRADIENT
            colors = intArrayOf(p.glowB, p.glowB and 0x00FFFFFF)
            setGradientCenter(0.9f, 0.1f)
            gradientRadius = 1300f
        }
        return LayerDrawable(arrayOf(base, glow1, glow2))
    }

    private fun customFile(ctx: Context) = File(ctx.filesDir, "wallpaper.jpg")

    fun current(ctx: Context, prefsCustom: Boolean, index: Int): Drawable {
        if (prefsCustom) {
            val f = customFile(ctx)
            if (f.exists()) {
                BitmapFactory.decodeFile(f.absolutePath)?.let { return BitmapDrawable(ctx.resources, it) }
            }
        }
        return preset(index)
    }

    /** Copies a picked image into app storage, downscaled to the screen size. */
    fun importImage(ctx: Context, uri: Uri): Boolean {
        return try {
            val dm = ctx.resources.displayMetrics
            val target = maxOf(dm.widthPixels, dm.heightPixels)
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= target) sample *= 2
            val bmp = ctx.contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
            } ?: return false
            customFile(ctx).outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 92, it) }
            true
        } catch (_: Exception) {
            false
        }
    }
}
