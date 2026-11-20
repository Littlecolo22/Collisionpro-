package com.rrautoexpress.collisionpro;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Incoming texts (needs RECEIVE_SMS; only the system can send this broadcast). Joins multipart texts and hands them
 * to SmsEngine, which forwards them to the shop server only while this phone is linked for texting. The server keeps
 * only texts from customers' numbers, so personal texts are dropped.
 */
public class SmsReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(i.getAction())) return;
        SmsEngine e = SmsEngine.get(c);
        if (!e.linked()) return;
        SmsMessage[] msgs = Telephony.Sms.Intents.getMessagesFromIntent(i);
        if (msgs == null) return;
        Map<String, StringBuilder> by = new LinkedHashMap<>();
        long ts = System.currentTimeMillis();
        for (SmsMessage m : msgs) {
            if (m == null || m.getOriginatingAddress() == null) continue;
            by.computeIfAbsent(m.getOriginatingAddress(), k -> new StringBuilder()).append(m.getMessageBody() == null ? "" : m.getMessageBody());
            ts = m.getTimestampMillis();
        }
        for (Map.Entry<String, StringBuilder> en : by.entrySet()) e.incoming(en.getKey(), en.getValue().toString(), ts);
    }
}
