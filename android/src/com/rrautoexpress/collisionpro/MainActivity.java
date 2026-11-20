package com.rrautoexpress.collisionpro;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;

/** R&R Auto Express: a full-screen shell around the live estimating app. New screens appear here as soon as they go live. */
public class MainActivity extends Activity {
    static final String HOST = "collisionpro.pages.dev";
    static final String START = "https://" + HOST + "/";
    static final int REQ_FILE = 11, REQ_CAM_FOR_PAGE = 21, REQ_CAM_FOR_FILE = 22, REQ_SMS = 31, REQ_NOTIF = 32;

    WebView web;
    ValueCallback<Uri[]> fileCb;
    WebChromeClient.FileChooserParams fileParams;
    Uri captureUri;
    PermissionRequest pendingPerm;
    SmsEngine sms;
    volatile String pageHost = HOST; // the bridge only answers pages from the app's own site
    long smsAskAt;
    boolean showingConnectionError = false;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        web.setBackgroundColor(BG);
        setContentView(buildRoot());
        styleSystemBars();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setUserAgentString(s.getUserAgentString() + " RRAutoExpressApp/1.4");
        CookieManager.getInstance().setAcceptCookie(true);

        web.addJavascriptInterface(new Bridge(), "CPNative");
        web.addJavascriptInterface(new SmsBridge(), "RRAndroid");
        sms = SmsEngine.get(this);
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            Uri download = Uri.parse(url);
            if (!"https".equals(download.getScheme()) || !HOST.equals(download.getHost()) || !download.getPath().endsWith(".apk")) {
                Toast.makeText(this, "This download link is not supported", Toast.LENGTH_SHORT).show();
                return;
            }
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (manager == null) {
                Toast.makeText(this, "Download service is unavailable", Toast.LENGTH_SHORT).show();
                return;
            }
            try {
                DownloadManager.Request request = new DownloadManager.Request(download)
                    .setTitle("R&R Auto Express")
                    .setDescription("Downloading Android app")
                    .setMimeType("application/vnd.android.package-archive")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                manager.enqueue(request);
                Toast.makeText(this, "Download started. Open Downloads when it finishes.", Toast.LENGTH_LONG).show();
            } catch (IllegalArgumentException e) {
                Toast.makeText(this, "Could not start the app download", Toast.LENGTH_LONG).show();
            }
        });

        // Restored WebView state can be empty or stale after a process restart/update.
        // Always fall back to the production URL when restoration did not succeed.
        boolean restored = false;
        if (b != null) {
            try { restored = web.restoreState(b) != null; } catch (Exception ignored) { restored = false; }
        }
        if (!restored || web.getUrl() == null || web.getUrl().isEmpty()) web.loadUrl(START);
    }

    // ---------- Keep the page clear of the status bar, notch, gesture bar and keyboard (Android 15+ always draws edge-to-edge) ----------
    static final int HEADER = 0xFF060608, BG = 0xFF0E0E13;
    View statusBg;

    View buildRoot() {
        final FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        statusBg = new View(this);
        statusBg.setBackgroundColor(HEADER);
        root.addView(statusBg, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, Gravity.TOP));
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.setOnApplyWindowInsetsListener((v, in) -> {
            int l, t, r, btm;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = in.getInsets(WindowInsets.Type.ime());
                l = bars.left; t = bars.top; r = bars.right; btm = Math.max(bars.bottom, ime.bottom);
            } else {
                l = in.getSystemWindowInsetLeft(); t = in.getSystemWindowInsetTop();
                r = in.getSystemWindowInsetRight(); btm = in.getSystemWindowInsetBottom();
                if (Build.VERSION.SDK_INT >= 28 && in.getDisplayCutout() != null) {
                    l = Math.max(l, in.getDisplayCutout().getSafeInsetLeft()); t = Math.max(t, in.getDisplayCutout().getSafeInsetTop());
                    r = Math.max(r, in.getDisplayCutout().getSafeInsetRight()); btm = Math.max(btm, in.getDisplayCutout().getSafeInsetBottom());
                }
            }
            FrameLayout.LayoutParams sp = (FrameLayout.LayoutParams) statusBg.getLayoutParams();
            if (sp.height != t) { sp.height = t; statusBg.setLayoutParams(sp); }
            FrameLayout.LayoutParams wp = (FrameLayout.LayoutParams) web.getLayoutParams();
            if (wp.leftMargin != l || wp.topMargin != t || wp.rightMargin != r || wp.bottomMargin != btm) {
                wp.setMargins(l, t, r, btm); web.setLayoutParams(wp);
            }
            return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : in.consumeSystemWindowInsets();
        });
        return root;
    }

    void styleSystemBars() {
        Window w = getWindow();
        // Draw behind the bars on every version and pad the page ourselves, so old and new Android look the same.
        if (Build.VERSION.SDK_INT >= 30) w.setDecorFitsSystemWindows(false);
        else w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        if (Build.VERSION.SDK_INT >= 28) w.getAttributes().layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30
            ? android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
            : android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) { w.setStatusBarContrastEnforced(false); w.setNavigationBarContrastEnforced(false); }
        // Light (white) clock, signal and battery icons on the dark header.
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) c.setSystemBarsAppearance(0, WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); sms.setForeground(false); sms.activity = null; }
    @Override protected void onResume() {
        super.onResume();
        sms.activity = this; sms.setForeground(true);
        if (sms.linked() && sms.bg() && !sms.service) { try { SmsService.start(this); } catch (Exception ignored) { } }
        jsEvent("{\"type\":\"resume\"}"); // back from Android settings: the Texting card re-reads the permissions
    }

    /** Fires window 'rrnative' events on the page: {type: 'perm' | 'resume' | 'sms' | 'linkchange', ...}. */
    void jsEvent(final String json) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('rrnative',{detail:" + json + "}))", null); });
    }

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    // ---------- Links: stay inside for the app, hand everything else to the phone ----------
    class Client extends WebViewClient {
        @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap f) {
            showingConnectionError = false;
            try { pageHost = Uri.parse(url).getHost(); } catch (Exception e) { pageHost = null; }
        }
        @Override public void doUpdateVisitedHistory(WebView v, String url, boolean reload) {
            try { pageHost = Uri.parse(url).getHost(); } catch (Exception e) { pageHost = null; }
        }
        @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            String scheme = u.getScheme() == null ? "" : u.getScheme();
            if ("https".equals(scheme) && HOST.equals(u.getHost())) return false;
            try {
                Intent i;
                if ("intent".equals(scheme)) i = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                else if ("sms".equals(scheme)) i = new Intent(Intent.ACTION_SENDTO, Uri.parse(u.toString().replaceFirst("^sms:", "smsto:")));
                else i = new Intent(Intent.ACTION_VIEW, u);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                startActivity(i);
            } catch (Exception e) {
                Toast.makeText(MainActivity.this, "No app on this phone can open that link", Toast.LENGTH_SHORT).show();
            }
            return true;
        }

        @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
            if (Build.VERSION.SDK_INT >= 23 && !r.isForMainFrame()) return;
            showConnectionError(v, "Network error", Build.VERSION.SDK_INT >= 23 ? e.getDescription().toString() : "Unable to reach website");
        }

        @Override public void onReceivedHttpError(WebView v, WebResourceRequest r, android.webkit.WebResourceResponse response) {
            if (Build.VERSION.SDK_INT >= 23 && !r.isForMainFrame()) return;
            if (response.getStatusCode() >= 400) showConnectionError(v, "Website response " + response.getStatusCode(), "The website returned an error. Try again in a moment.");
        }

        void showConnectionError(WebView v, String heading, String detail) {
            if (showingConnectionError) return;
            showingConnectionError = true;
            String safeDetail = detail == null ? "Connection failed" : detail.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
            String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                + "<body style='font-family:system-ui,sans-serif;background:#0E0E13;color:#fff;text-align:center;padding:40px 20px'>"
                + "<h2>R&amp;R Auto Express</h2><p style='color:#cbd5e1'>The app could not connect to CollisionPro.</p>"
                + "<p style='font-size:13px;color:#94a3b8'>" + heading + ": " + safeDetail + "</p>"
                + "<p style='font-size:13px;color:#94a3b8'>Server: " + START + "</p>"
                + "<button style='font-size:18px;padding:14px 28px;border-radius:10px;border:0;background:#2563eb;color:white' onclick=\"location.href='" + START + "'\">Reconnect / Try again</button>"
                + "<p><a style='color:#93c5fd' href='" + START + "'>Open website directly</a></p></body></html>";
            v.loadDataWithBaseURL(START, html, "text/html", "utf-8", null);
        }
    }

    // ---------- Camera (VIN scanning) and photo / file pickers ----------
    class Chrome extends WebChromeClient {
        @Override public void onPermissionRequest(final PermissionRequest req) {
            runOnUiThread(() -> {
                boolean wantsCam = false;
                for (String r : req.getResources()) if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCam = true;
                if (!wantsCam || req.getOrigin() == null || !HOST.equals(req.getOrigin().getHost())) { req.deny(); return; }
                if (hasCam()) req.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                else { pendingPerm = req; requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAM_FOR_PAGE); }
            });
        }

        @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (fileCb != null) fileCb.onReceiveValue(null);
            fileCb = cb; fileParams = p;
            boolean images = false;
            for (String a : p.getAcceptTypes()) if (a == null || a.isEmpty() || a.startsWith("image")) images = true;
            if (images && !hasCam()) { requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAM_FOR_FILE); return true; }
            openChooser(images && hasCam());
            return true;
        }
    }

    boolean hasCam() { return checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED; }

    void openChooser(boolean withCamera) {
        Intent pick = fileParams.createIntent();
        if (fileParams.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        ArrayList<Intent> extra = new ArrayList<>();
        captureUri = null;
        if (withCamera) {
            captureUri = FileProvider.uriFor("capture", "photo_" + System.currentTimeMillis() + ".jpg");
            Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            cam.putExtra(MediaStore.EXTRA_OUTPUT, captureUri);
            cam.setClipData(ClipData.newRawUri("", captureUri));
            cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            extra.add(cam);
        }
        Intent chooser = Intent.createChooser(pick, "Add photo or file");
        if (!extra.isEmpty()) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extra.toArray(new Intent[0]));
        try { startActivityForResult(chooser, REQ_FILE); }
        catch (ActivityNotFoundException e) { fileCb.onReceiveValue(null); fileCb = null; }
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_FILE || fileCb == null) return;
        Uri[] out = null;
        if (res == RESULT_OK) {
            if (data != null && data.getClipData() != null) {
                ClipData cd = data.getClipData();
                out = new Uri[cd.getItemCount()];
                for (int i = 0; i < cd.getItemCount(); i++) out[i] = cd.getItemAt(i).getUri();
            } else if (data != null && data.getData() != null) {
                out = new Uri[]{data.getData()};
            } else if (captureUri != null) {
                File f = new File(new File(getCacheDir(), "capture"), captureUri.getLastPathSegment());
                if (f.length() > 0) out = new Uri[]{captureUri};
            }
        }
        fileCb.onReceiveValue(out);
        fileCb = null;
    }

    @Override public void onRequestPermissionsResult(int req, String[] perms, int[] grants) {
        boolean ok = grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED;
        if (req == REQ_SMS) {
            boolean send = sms.canSend(), recv = sms.canReceive();
            // No dialog at all (an instant denial that Android won't explain) means Android blocked it: a restricted
            // setting for apps installed outside the Play Store, or "Don't allow" picked twice. Both are fixed in App info.
            boolean instant = System.currentTimeMillis() - smsAskAt < 600;
            boolean noRationale = !shouldShowRequestPermissionRationale(Manifest.permission.SEND_SMS);
            boolean blocked = !(send && recv) && noRationale && (instant || sms.sp.getBoolean("asked", false));
            sms.sp.edit().putBoolean("blocked", blocked).putBoolean("asked", true).apply();
            if (send && sms.linked() && sms.bg()) { try { SmsService.start(this); } catch (Exception ignored) { } }
            if (send) sms.kick();
            jsEvent("{\"type\":\"perm\",\"send\":" + send + ",\"receive\":" + recv + ",\"blocked\":" + blocked + "}");
            return;
        }
        if (req == REQ_NOTIF) { jsEvent("{\"type\":\"perm\",\"send\":" + sms.canSend() + ",\"receive\":" + sms.canReceive() + "}"); return; }
        if (req == REQ_CAM_FOR_PAGE && pendingPerm != null) {
            if (ok) pendingPerm.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE}); else pendingPerm.deny();
            pendingPerm = null;
        } else if (req == REQ_CAM_FOR_FILE && fileCb != null) {
            openChooser(ok);
        }
    }

    // ---------- PDFs: open, share and print (called by the web app as window.CPNative) ----------
    class Bridge {
        @JavascriptInterface public void openPdf(String b64, String name) {
            Uri u = savePdf(b64, name); if (u == null) return;
            Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(u, "application/pdf").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try { startActivity(i); } catch (ActivityNotFoundException e) { share(u, name, ""); }
        }
        @JavascriptInterface public void sharePdf(String b64, String name, String text) {
            Uri u = savePdf(b64, name); if (u != null) share(u, name, text);
        }
        @JavascriptInterface public void printPdf(String b64, final String name) {
            final Uri u = savePdf(b64, name); if (u == null) return;
            final File f = new File(new File(getCacheDir(), "pdf"), safeName(name));
            runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                pm.print(name, new PrintDocumentAdapter() {
                    @Override public void onLayout(PrintAttributes o, PrintAttributes n, CancellationSignal c, LayoutResultCallback cb, Bundle x) {
                        if (c.isCanceled()) { cb.onLayoutCancelled(); return; }
                        cb.onLayoutFinished(new PrintDocumentInfo.Builder(safeName(name)).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(), true);
                    }
                    @Override public void onWrite(PageRange[] pages, ParcelFileDescriptor dest, CancellationSignal c, WriteResultCallback cb) {
                        try (InputStream in = new FileInputStream(f); OutputStream out = new FileOutputStream(dest.getFileDescriptor())) {
                            byte[] buf = new byte[16384]; int n;
                            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                            cb.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
                        } catch (Exception e) { cb.onWriteFailed(e.getMessage()); }
                    }
                }, null);
            });
        }
    }

    // ---------- Texting from this phone (called by the web app as window.RRAndroid) ----------
    class SmsBridge {
        boolean ok() { return HOST.equals(pageHost); }
        @JavascriptInterface public String smsStatus() { return ok() ? sms.status().toString() : "{}"; }
        @JavascriptInterface public boolean hasSmsPermission() { return ok() && sms.canSend(); }
        @JavascriptInterface public void requestSmsPermission() {
            if (!ok()) return;
            runOnUiThread(() -> {
                ArrayList<String> want = new ArrayList<>();
                if (!sms.canSend()) want.add(Manifest.permission.SEND_SMS);
                if (!sms.canReceive()) want.add(Manifest.permission.RECEIVE_SMS);
                if (Build.VERSION.SDK_INT >= 33 && !sms.canNotify()) want.add(Manifest.permission.POST_NOTIFICATIONS);
                if (want.isEmpty()) { jsEvent("{\"type\":\"perm\",\"send\":true,\"receive\":true}"); return; }
                smsAskAt = System.currentTimeMillis();
                requestPermissions(want.toArray(new String[0]), REQ_SMS);
            });
        }
        /** Sends one text right now (multipart when long). Results arrive as rrnative events {type:'sms', id, status: sent|delivered|failed, error}. */
        @JavascriptInterface public void sendSms(String phone, String text, String cbId) {
            if (!ok() || phone == null || text == null) return;
            String c = cbId == null ? "" : cbId.replaceAll("[^A-Za-z0-9_-]", "");
            final String id = "js:" + (c.length() > 40 ? c.substring(0, 40) : c);
            sms.h.post(() -> sms.send(id, phone, text));
        }
        @JavascriptInterface public void openAppSettings() {
            if (!ok()) return;
            runOnUiThread(() -> {
                try { startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))); }
                catch (Exception e) { Toast.makeText(MainActivity.this, "Open Settings › Apps › R&R Auto Express", Toast.LENGTH_LONG).show(); }
            });
        }
        @JavascriptInterface public void openBatterySettings() {
            if (!ok()) return;
            runOnUiThread(() -> {
                try { startActivity(new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()))); }
                catch (Exception e) {
                    try { startActivity(new Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); } catch (Exception ignored) { }
                }
            });
        }
        @JavascriptInterface public void link(String token, String hint, String origin) {
            if (!ok() || token == null || !token.startsWith("d_") || !("https://" + HOST).equals(origin)) return;
            sms.link(token, hint == null ? "" : hint);
        }
        @JavascriptInterface public void unlink() { if (ok()) sms.unlink(); }
        @JavascriptInterface public void setBackground(boolean on) {
            if (!ok()) return;
            runOnUiThread(() -> {
                if (on && Build.VERSION.SDK_INT >= 33 && !sms.canNotify()) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
                try { sms.setBackground(on); } catch (Exception e) { Toast.makeText(MainActivity.this, "Android didn't allow texting in the background", Toast.LENGTH_LONG).show(); }
            });
        }
        @JavascriptInterface public void syncNow() { if (ok()) sms.kick(); }
    }

    static String safeName(String n) {
        String s = (n == null ? "estimate.pdf" : n).replaceAll("[^A-Za-z0-9._-]", "_");
        if (!s.toLowerCase().endsWith(".pdf")) s += ".pdf";
        return s.length() > 80 ? s.substring(s.length() - 80) : s;
    }

    Uri savePdf(String b64, String name) {
        try {
            File d = new File(getCacheDir(), "pdf"); d.mkdirs();
            File f = new File(d, safeName(name));
            try (FileOutputStream o = new FileOutputStream(f)) { o.write(Base64.decode(b64, Base64.DEFAULT)); }
            return FileProvider.uriFor("pdf", f.getName());
        } catch (Exception e) {
            runOnUiThread(() -> Toast.makeText(this, "Could not save the PDF", Toast.LENGTH_SHORT).show());
            return null;
        }
    }

    void share(Uri u, String name, String text) {
        Intent i = new Intent(Intent.ACTION_SEND).setType("application/pdf");
        i.putExtra(Intent.EXTRA_STREAM, u);
        i.putExtra(Intent.EXTRA_SUBJECT, name);
        if (text != null && !text.isEmpty()) i.putExtra(Intent.EXTRA_TEXT, text);
        i.setClipData(ClipData.newRawUri("", u));
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(Intent.createChooser(i, "Send estimate"));
    }
}
