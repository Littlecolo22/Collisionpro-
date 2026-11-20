package com.rrautoexpress.collisionpro;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * "Send texts when the app is closed": a foreground service, so Android keeps it running, with a quiet
 * "Texting on" notification. It only keeps SmsEngine checking in with the shop server every 30 seconds.
 */
public class SmsService extends Service {
    static final String CH = "texting";
    static final int NID = 7;

    static void start(Context c) {
        Intent i = new Intent(c, SmsService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }
    static void stop(Context c) { c.stopService(new Intent(c, SmsService.class)); }

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
            NotificationChannel ch = new NotificationChannel(CH, "Texting", NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("Shows while this phone sends the shop's customer texts");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle("Texting on")
            .setContentText("Customer texts go out from this phone")
            .setContentIntent(open).setOngoing(true).setShowWhen(false);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_MIN);
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(NID, b.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING);
            else startForeground(NID, b.build());
        } catch (Exception e) { stopSelf(); return START_NOT_STICKY; }
        SmsEngine e = SmsEngine.get(this);
        if (!e.linked() || !e.bg()) { stopSelf(); return START_NOT_STICKY; }
        e.setService(true);
        return START_STICKY;
    }

    @Override public void onDestroy() { SmsEngine.get(this).setService(false); super.onDestroy(); }
    @Override public IBinder onBind(Intent i) { return null; }
}
