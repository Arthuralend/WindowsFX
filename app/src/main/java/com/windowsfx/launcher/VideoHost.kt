package com.windowsfx.launcher

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.util.Base64
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import org.json.JSONArray
import org.json.JSONObject
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import org.videolan.libvlc.interfaces.IMedia
import org.videolan.libvlc.util.VLCVideoLayout
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * The WindowsFX video player engine: libVLC (LGPL-2.1) plays almost any file — MKV, AVI, MP4, MOV,
 * WMV, FLV, TS, VOB, WebM, RMVB, with AC-3/DTS/FLAC sound and SRT/ASS/SSA subtitles.
 * Each player is a native video surface laid over the player window of the web desktop, like the
 * browser tabs; the controls are drawn by the desktop.
 */
class VideoHost(private val act: MainActivity, private val layer: FrameLayout) {

    private var vlc: LibVLC? = null

    private class Player(val box: FrameLayout, val layout: VLCVideoLayout, val mp: MediaPlayer) {
        var lastTime = 0L
        var wasPlaying = false
    }

    private val players = HashMap<String, Player>()

    private fun lib(): LibVLC = vlc ?: LibVLC(act, arrayListOf("--audio-time-stretch", "--avcodec-skiploopfilter=1", "--sub-autodetect-file")).also { vlc = it }

    private fun ev(id: String, type: String, extra: JSONObject = JSONObject()) {
        act.emit("vlc", extra.put("id", id).put("type", type))
    }

    @SuppressLint("ClickableViewAccessibility")
    fun create(id: String) {
        if (players.containsKey(id)) return
        val box = FrameLayout(act)
        box.setBackgroundColor(Color.BLACK)
        box.visibility = View.GONE
        val layout = VLCVideoLayout(act)
        box.addView(layout, FrameLayout.LayoutParams(-1, -1))
        val mp = MediaPlayer(lib())
        mp.attachViews(layout, null, true, true)
        val p = Player(box, layout, mp)
        mp.setEventListener { e -> onEvent(id, p, e) }
        val gd = GestureDetector(act, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent): Boolean = true
            override fun onSingleTapConfirmed(e: MotionEvent): Boolean { ev(id, "tap"); return true }
            override fun onDoubleTap(e: MotionEvent): Boolean { ev(id, "dbltap"); return true }
            override fun onFling(e1: MotionEvent?, e2: MotionEvent, vx: Float, vy: Float): Boolean {
                if (kotlin.math.abs(vx) > kotlin.math.abs(vy) * 1.5f) ev(id, "swipe", JSONObject().put("dir", if (vx > 0) 1 else -1))
                return true
            }
        })
        box.isClickable = true
        box.setOnTouchListener { _, e -> gd.onTouchEvent(e); true }
        box.setOnGenericMotionListener { _, e ->
            if (e.action == MotionEvent.ACTION_SCROLL) {
                ev(id, "wheel", JSONObject().put("dy", e.getAxisValue(MotionEvent.AXIS_VSCROLL).toDouble()))
                true
            } else false
        }
        layer.addView(box, FrameLayout.LayoutParams(1, 1))
        players[id] = p
    }

    private fun onEvent(id: String, p: Player, e: MediaPlayer.Event) {
        when (e.type) {
            MediaPlayer.Event.Opening -> ev(id, "opening")
            MediaPlayer.Event.Buffering -> ev(id, "buffering", JSONObject().put("pct", e.buffering.toDouble()))
            MediaPlayer.Event.Playing -> ev(id, "playing", info(id))
            MediaPlayer.Event.Paused -> ev(id, "paused")
            MediaPlayer.Event.Stopped -> ev(id, "stopped")
            MediaPlayer.Event.EndReached -> ev(id, "end")
            MediaPlayer.Event.EncounteredError -> ev(id, "error")
            MediaPlayer.Event.LengthChanged -> ev(id, "length", JSONObject().put("length", e.lengthChanged))
            MediaPlayer.Event.TimeChanged -> {
                val t = e.timeChanged
                if (kotlin.math.abs(t - p.lastTime) >= 250) {
                    p.lastTime = t
                    ev(id, "time", JSONObject().put("time", t).put("length", p.mp.length))
                }
            }
            MediaPlayer.Event.ESAdded, MediaPlayer.Event.ESDeleted, MediaPlayer.Event.Vout -> ev(id, "tracks", info(id))
        }
    }

    /** Opens a file (absolute path) or a stream URL. */
    fun open(id: String, path: String, startMs: Long, hw: Boolean, subEnc: String) {
        val p = players[id] ?: return
        val media = if (path.startsWith("/")) Media(lib(), Uri.fromFile(File(path))) else Media(lib(), Uri.parse(path))
        media.setHWDecoderEnabled(hw, false)
        if (startMs > 0) media.addOption(":start-time=" + (startMs / 1000.0))
        if (subEnc.isNotEmpty()) media.addOption(":subsdec-encoding=$subEnc")
        p.mp.setMedia(media)
        media.release()
        p.lastTime = 0
        p.mp.play()
    }

    fun cmd(id: String, cmd: String, arg: String) {
        val p = players[id] ?: return
        val mp = p.mp
        try {
            when (cmd) {
                "play" -> mp.play()
                "pause" -> mp.pause()
                "toggle" -> if (mp.isPlaying) mp.pause() else mp.play()
                "stop" -> mp.stop()
                "seek" -> mp.setTime(arg.toLong().coerceAtLeast(0))
                "seekRel" -> mp.setTime((mp.time + arg.toLong()).coerceIn(0, maxOf(0L, mp.length - 500)))
                "rate" -> mp.setRate(arg.toFloat())
                "volume" -> mp.setVolume(arg.toInt().coerceIn(0, 200))
                "audio" -> mp.setAudioTrack(arg.toInt())
                "spu" -> mp.setSpuTrack(arg.toInt())
                "sub" -> mp.addSlave(IMedia.Slave.Type.Subtitle, Uri.fromFile(File(arg)), true)
                "aspect" -> { mp.setAspectRatio(arg.ifEmpty { null }); mp.setScale(0f) }
                "spuDelay" -> mp.setSpuDelay(arg.toLong() * 1000)
                "audioDelay" -> mp.setAudioDelay(arg.toLong() * 1000)
            }
        } catch (_: Throwable) {
        }
    }

    fun info(id: String): JSONObject {
        val p = players[id] ?: return JSONObject()
        val mp = p.mp
        val o = JSONObject()
        runCatching { o.put("time", mp.time).put("length", mp.length).put("playing", mp.isPlaying).put("rate", mp.rate.toDouble()).put("volume", mp.volume) }
        runCatching {
            val a = JSONArray()
            mp.audioTracks?.forEach { a.put(JSONObject().put("id", it.id).put("name", it.name)) }
            o.put("audioTracks", a).put("audioTrack", mp.audioTrack)
        }
        runCatching {
            val s = JSONArray()
            mp.spuTracks?.forEach { s.put(JSONObject().put("id", it.id).put("name", it.name)) }
            o.put("spuTracks", s).put("spuTrack", mp.spuTrack)
        }
        runCatching {
            val v = mp.currentVideoTrack
            if (v != null) o.put("width", v.width).put("height", v.height)
        }
        return o
    }

    /** Positions a player over its window. Coordinates are physical pixels of the desktop view. */
    fun bounds(id: String, x: Int, y: Int, w: Int, h: Int, visible: Boolean) {
        val v = players[id]?.box ?: return
        if (!visible || w <= 0 || h <= 0) {
            if (v.visibility != View.GONE) v.visibility = View.GONE
            return
        }
        val lp = v.layoutParams as FrameLayout.LayoutParams
        if (lp.leftMargin != x || lp.topMargin != y || lp.width != w || lp.height != h) {
            lp.leftMargin = x
            lp.topMargin = y
            lp.width = w
            lp.height = h
            v.layoutParams = lp
        }
        if (v.visibility != View.VISIBLE) v.visibility = View.VISIBLE
    }

    private fun texture(v: View): TextureView? {
        if (v is TextureView) return v
        if (v is ViewGroup) for (i in 0 until v.childCount) texture(v.getChildAt(i))?.let { return it }
        return null
    }

    /** The current picture, shown in place of the video while other windows cover it. */
    fun snapshot(id: String) {
        val p = players[id] ?: return
        try {
            val tv = texture(p.layout) ?: return
            if (tv.width <= 0 || tv.height <= 0) return
            val bmp: Bitmap = tv.getBitmap((tv.width / 2).coerceAtLeast(1), (tv.height / 2).coerceAtLeast(1)) ?: return
            val out = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, 75, out)
            ev(id, "snapshot", JSONObject().put("img", "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)))
        } catch (_: Throwable) {
        }
    }

    fun destroy(id: String) {
        val p = players.remove(id) ?: return
        try {
            p.mp.setEventListener(null)
            p.mp.stop()
            p.mp.detachViews()
            p.mp.release()
        } catch (_: Throwable) {
        }
        (p.box.parent as? ViewGroup)?.removeView(p.box)
    }

    fun hideAll() {
        players.values.forEach { it.box.visibility = View.GONE }
    }

    /** The launcher went to the background: pause playback (it resumes from the controls). */
    fun onPause() {
        players.values.forEach {
            it.wasPlaying = runCatching { it.mp.isPlaying }.getOrDefault(false)
            if (it.wasPlaying) runCatching { it.mp.pause() }
        }
    }

    fun onDestroy() {
        players.keys.toList().forEach { destroy(it) }
        runCatching { vlc?.release() }
        vlc = null
    }
}
