package com.windowsfx.launcher

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

/** Reminders: Android notifications at the set time, also when WindowsFX is in the background. */
object Notifier {
    private const val CHANNEL = "reminders"
    const val EXTRA_ID = "reminder_id"

    private fun channel(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(CHANNEL) == null) {
            val c = NotificationChannel(CHANNEL, "Напоминания", NotificationManager.IMPORTANCE_HIGH)
            c.description = "Напоминания WindowsFX"
            c.enableVibration(true)
            nm.createNotificationChannel(c)
        }
    }

    private fun pending(ctx: Context, id: String, title: String, body: String, flags: Int): PendingIntent? {
        val i = Intent(ctx, ReminderReceiver::class.java).setAction("com.windowsfx.REMINDER.$id")
            .putExtra(EXTRA_ID, id).putExtra("title", title).putExtra("body", body)
        return PendingIntent.getBroadcast(ctx, id.hashCode(), i, flags or PendingIntent.FLAG_IMMUTABLE)
    }

    fun schedule(ctx: Context, id: String, at: Long, title: String, body: String) {
        if (at <= System.currentTimeMillis()) return
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val pi = pending(ctx, id, title, body, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
        try {
            if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        } catch (_: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }

    fun cancel(ctx: Context, id: String) {
        val pi = pending(ctx, id, "", "", PendingIntent.FLAG_NO_CREATE) ?: return
        ctx.getSystemService(AlarmManager::class.java)?.cancel(pi)
        pi.cancel()
    }

    fun requestPermission(act: MainActivity) {
        if (Build.VERSION.SDK_INT >= 33 && act.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            act.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 77)
        }
    }

    fun show(ctx: Context, id: String, title: String, body: String) {
        channel(ctx)
        val open = Intent(ctx, MainActivity::class.java).putExtra(EXTRA_ID, id).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
        val pi = PendingIntent.getActivity(ctx, id.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = android.app.Notification.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(android.app.Notification.BigTextStyle().bigText(body))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setCategory(android.app.Notification.CATEGORY_REMINDER)
            .build()
        try { ctx.getSystemService(NotificationManager::class.java)?.notify(id.hashCode(), n) } catch (_: SecurityException) {}
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(Notifier.EXTRA_ID) ?: return
        Notifier.show(context, id, intent.getStringExtra("title") ?: "Напоминание", intent.getStringExtra("body") ?: "")
    }
}
