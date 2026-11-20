package com.rrautoexpress.collisionpro;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.PowerManager;
import android.telephony.SmsManager;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;

/**
 * Texting from this phone. The shop server keeps a queue of outgoing customer texts; this engine checks in with
 * POST /api/sms/device/sync (Authorization: Bearer device-token), reports sent / delivered / failed results and
 * customer replies, and gets back at most one text at a time, so the owner's "seconds between texts" pacing holds.
 *
 * It runs while the app is open (MainActivity) and, when "Send texts when the app is closed" is on, inside
 * SmsService, a foreground service with a small "Texting on" notification.
 */
public final class SmsEngine {
    static final String TAG = "RRSms";
    static final String PREFS = "rr_sms";
    static final String SYNC_URL = "https://" + MainActivity.HOST + "/api/sms/device/sync";
    static final String ACTION_SENT = "com.rrautoexpress.collisionpro.SMS_SENT";
    static final String ACTION_DELIVERED = "com.rrautoexpress.collisionpro.SMS_DELIVERED";
    static final Object LOCK = new Object();
    private static SmsEngine inst;

    final Context app;
    final SharedPreferences sp;
    final Handler h;
    volatile boolean foreground, service;
    long lastSend = 0, backoff = 0;
    int pace = 20;
    volatile String appVersion = "";
    MainActivity activity; // set while the app is on screen, for events to the page

    static synchronized SmsEngine get(Context c) {
        if (inst == null) inst = new SmsEngine(c.getApplicationContext());
        return inst;
    }

    private SmsEngine(Context c) {
        app = c;
        sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        HandlerThread t = new HandlerThread("rr-sms");
        t.start();
        h = new Handler(t.getLooper());
        pace = sp.getInt("pace", 20);
        try { appVersion = c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; } catch (Exception ignored) { }
    }

    // ---------- state ----------
    boolean linked() { return sp.getString("token", null) != null; }
    String hint() { return sp.getString("hint", ""); }
    boolean bg() { return sp.getBoolean("bg", false); }
    boolean canSend() { return app.checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED; }
    boolean canReceive() { return app.checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED; }
    boolean notifNeeded() { return Build.VERSION.SDK_INT >= 33; }
    boolean canNotify() { return Build.VERSION.SDK_INT < 33 || app.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED; }
    boolean hasTelephony() {
        PackageManager pm = app.getPackageManager();
        return Build.VERSION.SDK_INT >= 33 ? pm.hasSystemFeature(PackageManager.FEATURE_TELEPHONY_MESSAGING) : pm.hasSystemFeature(PackageManager.FEATURE_TELEPHONY);
    }
    boolean batteryOk() {
        PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
        return pm == null || pm.isIgnoringBatteryOptimizations(app.getPackageName());
    }

    JSONObject status() {
        JSONObject o = new JSONObject();
        try {
            o.put("send", canSend()); o.put("receive", canReceive());
            o.put("notif", canNotify()); o.put("notifNeeded", notifNeeded());
            o.put("telephony", hasTelephony());
            o.put("blocked", sp.getBoolean("blocked", false) && !(canSend() && canReceive()));
            o.put("linked", linked()); o.put("hint", hint());
            o.put("bg", bg()); o.put("batteryOk", batteryOk());
            o.put("running", service);
            o.put("name", Build.MANUFACTURER + " " + Build.MODEL);
            o.put("model", Build.MODEL); o.put("android", Build.VERSION.RELEASE);
            o.put("appVersion", appVersion);
        } catch (Exception ignored) { }
        return o;
    }

    void link(String token, String hint) {
        sp.edit().putString("token", token).putString("hint", hint).putBoolean("forward", true).apply();
        kick();
        if (bg()) SmsService.start(app);
    }

    void unlink() {
        sp.edit().remove("token").remove("hint").remove("incoming").apply();
        SmsService.stop(app);
        h.removeCallbacksAndMessages(null);
    }

    void setBackground(boolean on) {
        sp.edit().putBoolean("bg", on).apply();
        if (on && linked()) SmsService.start(app); else SmsService.stop(app);
    }

    // ---------- loop ----------
    void setForeground(boolean f) { foreground = f; if (f) kick(); }
    void setService(boolean s) { service = s; if (s) kick(); }
    boolean active() { return linked() && (foreground || service); }

    final Runnable tick = this::tick;
    void kick() { h.removeCallbacks(tick); h.post(tick); }
    void later(long ms) { h.removeCallbacks(tick); h.postDelayed(tick, ms); }

    private void tick() {
        if (!linked()) return;
        // Results and replies still go up even when nothing else is running (the receivers kick us); new sends need the app open or the service on.
        boolean act = active();
        JSONArray st, inc;
        synchronized (LOCK) { st = arr("statuses"); inc = arr("incoming"); }
        if (!act && st.length() == 0 && inc.length() == 0) return;
        long now = System.currentTimeMillis();
        long wait = lastSend + pace * 1000L - now;
        boolean want = act && canSend() && wait <= 0;
        try {
            JSONObject body = new JSONObject();
            JSONObject perm = new JSONObject();
            perm.put("send", canSend()); perm.put("receive", canReceive()); perm.put("notif", canNotify());
            body.put("perm", perm); body.put("bg", bg()); body.put("battery_ok", batteryOk()); body.put("app_version", appVersion);
            body.put("statuses", st); body.put("incoming", inc); body.put("want", want ? 1 : 0);
            JSONObject r = post(body);
            if (r == null) return; // unlinked
            backoff = 0;
            synchronized (LOCK) { drop("statuses", st.length()); drop("incoming", inc.length()); }
            pace = Math.max(1, r.optInt("pace", 20));
            sp.edit().putInt("pace", pace).putBoolean("forward", r.optBoolean("forward_incoming", true)).putLong("last_ok", now).apply();
            if (!r.optBoolean("forward_incoming", true)) synchronized (LOCK) { sp.edit().remove("incoming").apply(); }
            JSONArray out = r.optJSONArray("outbox");
            boolean sent = false;
            if (out != null) for (int i = 0; i < out.length(); i++) {
                JSONObject m = out.getJSONObject(i);
                send(String.valueOf(m.getLong("id")), m.getString("to"), m.getString("body"));
                lastSend = System.currentTimeMillis();
                sent = true;
            }
            if (!act) return;
            if (r.optBoolean("more") || (wait > 0 && !want)) later(Math.max(1000, lastSend + pace * 1000L - System.currentTimeMillis()));
            else if (sent) later(Math.max(3000, pace * 1000L)); // sent / delivered results usually arrive within seconds
            else later(foreground ? 15000 : 30000);
        } catch (Exception e) {
            Log.w(TAG, "sync failed: " + e);
            backoff = Math.min(backoff == 0 ? 15000 : backoff * 2, 300000);
            if (act || st.length() > 0 || inc.length() > 0) later(backoff);
        }
    }

    private JSONObject post(JSONObject body) throws Exception {
        String tok = sp.getString("token", null);
        if (tok == null) return null;
        HttpURLConnection c = (HttpURLConnection) new URL(SYNC_URL).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(20000);
        c.setRequestMethod("POST"); c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json");
        c.setRequestProperty("Authorization", "Bearer " + tok);
        c.setRequestProperty("User-Agent", "RRAutoExpressApp/" + appVersion + " (texting)");
        try (OutputStream o = c.getOutputStream()) { o.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        int code = c.getResponseCode();
        if (code == 401) {
            // The server forgot this phone (another phone was linked, or the owner tapped "Stop using this phone")
            unlink();
            event("{\"type\":\"linkchange\"}");
            return null;
        }
        InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[8192]; int n;
        if (in != null) while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
        c.disconnect();
        if (code >= 400) throw new Exception("HTTP " + code);
        return new JSONObject(b.toString("UTF-8"));
    }

    // ---------- sending (multipart for long texts, with sent and delivered callbacks per part) ----------
    /** id: a server message id, or "js:..." for a text the page sent through RRAndroid.sendSms. */
    void send(String id, String to, String text) {
        try {
            if (!canSend()) { result(id, "failed", "SMS permission is off for R&R Auto Express"); return; }
            SmsManager sm = Build.VERSION.SDK_INT >= 31 ? app.getSystemService(SmsManager.class) : SmsManager.getDefault();
            if (sm == null) { result(id, "failed", "This phone can't send texts"); return; }
            ArrayList<String> parts = sm.divideMessage(text);
            int n = Math.max(1, parts.size());
            synchronized (LOCK) { sp.edit().putInt("parts:" + id, n).putInt("sent:" + id, 0).putInt("dlv:" + id, 0).putBoolean("fail:" + id, false).apply(); }
            ArrayList<PendingIntent> sentPi = new ArrayList<>(), dlvPi = new ArrayList<>();
            for (int i = 0; i < n; i++) { sentPi.add(pi(ACTION_SENT, id, i)); dlvPi.add(pi(ACTION_DELIVERED, id, i)); }
            if (n == 1) sm.sendTextMessage(to, null, text, sentPi.get(0), dlvPi.get(0));
            else sm.sendMultipartTextMessage(to, null, parts, sentPi, dlvPi);
        } catch (Exception e) {
            Log.w(TAG, "send failed: " + e);
            result(id, "failed", e instanceof SecurityException ? "SMS permission is off for R&R Auto Express" : "The phone could not send this text");
        }
    }

    private PendingIntent pi(String action, String id, int part) {
        Intent i = new Intent(action).setClass(app, SmsStatusReceiver.class)
            .setData(Uri.parse("rrsms://" + action.hashCode() + "/" + Uri.encode(id) + "/" + part))
            .putExtra("id", id).putExtra("part", part);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getBroadcast(app, 0, i, flags);
    }

    /** Called by SmsStatusReceiver for each part. */
    void partResult(String id, boolean delivered, boolean ok, String error) {
        String fin = null, err = null;
        synchronized (LOCK) {
            int n = sp.getInt("parts:" + id, 1);
            if (sp.getBoolean("fail:" + id, false)) return;
            if (!ok) {
                sp.edit().putBoolean("fail:" + id, true).apply();
                fin = "failed"; err = error;
            } else {
                String k = (delivered ? "dlv:" : "sent:") + id;
                int c = sp.getInt(k, 0) + 1;
                sp.edit().putInt(k, c).apply();
                if (c == n) fin = delivered ? "delivered" : "sent";
                if (delivered && c == n) sp.edit().remove("parts:" + id).remove("sent:" + id).remove("dlv:" + id).remove("fail:" + id).apply();
            }
        }
        if (fin != null) result(id, fin, err);
    }

    void result(String id, String status, String error) {
        if (id.startsWith("js:")) {
            try {
                JSONObject e = new JSONObject();
                e.put("type", "sms"); e.put("id", id.substring(3)); e.put("status", status);
                if (error != null) e.put("error", error);
                event(e.toString());
            } catch (Exception ignored) { }
            return;
        }
        try {
            JSONObject s = new JSONObject();
            s.put("id", Long.parseLong(id)); s.put("status", status);
            if (error != null) s.put("error", error);
            synchronized (LOCK) { JSONArray a = arr("statuses"); a.put(s); trimPut("statuses", a, 200); }
        } catch (Exception ignored) { }
        kick();
    }

    // ---------- incoming customer replies (from SmsReceiver) ----------
    void incoming(String from, String body, long ts) {
        if (!linked() || !sp.getBoolean("forward", true)) return;
        String d = from == null ? "" : from.replaceAll("[^0-9]", "");
        if (d.length() < 10) return; // short codes (bank codes, alerts) are never customers
        try {
            JSONObject o = new JSONObject();
            o.put("from", from); o.put("body", body);
            o.put("ref", d + "-" + ts + "-" + Integer.toHexString(body.hashCode()));
            synchronized (LOCK) { JSONArray a = arr("incoming"); a.put(o); trimPut("incoming", a, 100); }
        } catch (Exception ignored) { }
        kick();
    }

    // ---------- events to the page ----------
    void event(String json) {
        MainActivity a = activity;
        if (a != null) a.jsEvent(json);
    }

    // ---------- small JSON queues in private prefs (allowBackup=false) ----------
    private JSONArray arr(String k) {
        try { return new JSONArray(sp.getString(k, "[]")); } catch (Exception e) { return new JSONArray(); }
    }
    private void drop(String k, int n) {
        if (n == 0) return;
        JSONArray a = arr(k), b = new JSONArray();
        for (int i = n; i < a.length(); i++) b.put(a.opt(i));
        sp.edit().putString(k, b.toString()).apply();
    }
    private void trimPut(String k, JSONArray a, int max) {
        JSONArray b = a;
        if (a.length() > max) { b = new JSONArray(); for (int i = a.length() - max; i < a.length(); i++) b.put(a.opt(i)); }
        sp.edit().putString(k, b.toString()).apply();
    }
}
