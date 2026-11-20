package com.rrautoexpress.collisionpro;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Turns "Texting on" back on after a restart or an app update, if the owner had it on. */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        String a = i.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) return;
        SmsEngine e = SmsEngine.get(c);
        if (e.linked() && e.bg() && e.canSend()) {
            try { SmsService.start(c); } catch (Exception ignored) { }
        }
    }
}
