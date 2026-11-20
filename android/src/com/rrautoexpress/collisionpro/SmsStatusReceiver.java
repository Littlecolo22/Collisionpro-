package com.rrautoexpress.collisionpro;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.telephony.SmsManager;
import android.telephony.SmsMessage;

/** Sent and delivered results for each part of a text this app sent (explicit, not exported). */
public class SmsStatusReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        String id = i.getStringExtra("id");
        if (id == null) return;
        SmsEngine e = SmsEngine.get(c);
        if (SmsEngine.ACTION_SENT.equals(i.getAction())) {
            int rc = getResultCode();
            e.partResult(id, false, rc == Activity.RESULT_OK, rc == Activity.RESULT_OK ? null : why(rc));
        } else if (SmsEngine.ACTION_DELIVERED.equals(i.getAction())) {
            boolean ok = true;
            try {
                byte[] pdu = i.getByteArrayExtra("pdu");
                if (pdu != null) {
                    SmsMessage m = SmsMessage.createFromPdu(pdu, i.getStringExtra("format"));
                    // GSM status: 0x00-0x1F delivered, 0x20-0x3F still trying, 0x40+ failed
                    if (m != null) { int st = m.getStatus(); if (st >= 0x20 && st < 0x40) return; ok = st < 0x40; }
                }
            } catch (Exception ignored) { }
            e.partResult(id, true, ok, ok ? null : "The carrier could not deliver this text");
        }
    }

    static String why(int rc) {
        switch (rc) {
            case SmsManager.RESULT_ERROR_NO_SERVICE: return "No phone signal";
            case SmsManager.RESULT_ERROR_RADIO_OFF: return "Airplane mode is on or the phone radio is off";
            case SmsManager.RESULT_ERROR_NULL_PDU: return "The phone could not build this text";
            case SmsManager.RESULT_ERROR_LIMIT_EXCEEDED: return "Android's texting limit was reached; try again shortly";
            case 6: return "Android blocked this text (premium or short code)"; // RESULT_ERROR_SHORT_CODE_NOT_ALLOWED
            case 7: return "Android blocked this text (short code)"; // RESULT_ERROR_SHORT_CODE_NEVER_ALLOWED
            case SmsManager.RESULT_ERROR_GENERIC_FAILURE: return "The carrier rejected the text";
            default: return "The phone could not send this text (code " + rc + ")";
        }
    }
}
