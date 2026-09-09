package com.brosuhue.inksign;

import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;

/**
 * A shell around the web app in assets/www.
 *
 * The pages are served over https://appassets.androidplatform.net rather than
 * file:// so the app runs on a proper web origin — ES modules, the pdf.js
 * worker and localStorage all behave exactly as they do on the website.
 */
public class MainActivity extends AppCompatActivity {

    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String START = ORIGIN + "/assets/www/index.html";
    private static final int MAX_INBOUND_BYTES = 40 * 1024 * 1024;

    private WebView web;
    private ValueCallback<Uri[]> filePicked;
    private ActivityResultLauncher<Intent> filePicker;
    private File lastSaved;
    private String lastSavedName;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#101317"));
        setContentView(web);

        // Keep the page clear of the status and navigation bars.
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), web);
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);            // the signature library lives here
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return loader.shouldInterceptRequest(req.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                // Anything outside the bundled app opens in the browser, not in here.
                Uri u = req.getUrl();
                if (u != null && ORIGIN.equals(u.getScheme() + "://" + u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (ActivityNotFoundException ignored) { }
                return true;
            }
        });

        filePicker = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    if (filePicked == null) return;
                    filePicked.onReceiveValue(
                            WebChromeClient.FileChooserParams.parseResult(
                                    result.getResultCode(), result.getData()));
                    filePicked = null;
                });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (filePicked != null) filePicked.onReceiveValue(null);
                filePicked = cb;
                try {
                    filePicker.launch(params.createIntent());
                    return true;
                } catch (Exception e) {
                    filePicked = null;
                    return false;
                }
            }
        });

        web.addJavascriptInterface(new Bridge(), "InkSignAndroid");

        // The app is a single page, so hand Back to it and only exit at the top.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                web.evaluateJavascript(
                        "(window.inkSignBack && window.inkSignBack()) ? 'held' : 'exit'",
                        value -> {
                            if (value == null || !value.contains("held")) finish();
                        });
            }
        });

        if (savedInstanceState == null) {
            web.loadUrl(START);
            handleIncoming(getIntent());
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncoming(intent);
    }

    /** A PDF or picture shared into the app from elsewhere. */
    private void handleIncoming(Intent intent) {
        if (intent == null) return;
        Uri uri = null;
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        } else if (Intent.ACTION_VIEW.equals(intent.getAction())) {
            uri = intent.getData();
        }
        if (uri == null) return;

        final Uri source = uri;
        final String type = intent.getType() != null ? intent.getType() : "application/pdf";
        web.postDelayed(() -> {
            try {
                byte[] data = readAll(source);
                if (data == null) return;
                String name = displayName(source);
                String js = "window.inkSignOpenFile && window.inkSignOpenFile("
                        + quote(name) + "," + quote(type) + ","
                        + quote(Base64.encodeToString(data, Base64.NO_WRAP)) + ")";
                web.evaluateJavascript(js, null);
            } catch (Exception e) {
                toast(getString(R.string.save_failed));
            }
        }, 900);   // give the page a moment to finish loading
    }

    private byte[] readAll(Uri uri) throws Exception {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n, total = 0;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > MAX_INBOUND_BYTES) return null;
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        }
    }

    private String displayName(Uri uri) {
        String last = uri.getLastPathSegment();
        if (last == null) return "document";
        int slash = last.lastIndexOf('/');
        return slash >= 0 ? last.substring(slash + 1) : last;
    }

    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "").replace("\r", "") + "\"";
    }

    private void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_LONG).show());
    }

    /* ---------- what the web app can ask the phone to do ---------- */

    private class Bridge {

        /** Writes the finished PDF into the phone's Downloads folder. */
        @JavascriptInterface
        public void saveBase64(String filename, String mime, String base64) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                String name = filename == null || filename.isEmpty() ? "signed.pdf" : filename;

                // Keep a copy the share sheet can reach without any permission.
                File dir = new File(getCacheDir(), "shared");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("no cache dir");
                File copy = new File(dir, name);
                try (FileOutputStream fos = new FileOutputStream(copy)) {
                    fos.write(data);
                }
                lastSaved = copy;
                lastSavedName = name;

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    cv.put(MediaStore.Downloads.MIME_TYPE, mime);
                    cv.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri item = getContentResolver()
                            .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (item == null) throw new Exception("no download slot");
                    try (OutputStream out = getContentResolver().openOutputStream(item)) {
                        if (out == null) throw new Exception("no stream");
                        out.write(data);
                    }
                    cv.clear();
                    cv.put(MediaStore.Downloads.IS_PENDING, 0);
                    getContentResolver().update(item, cv, null, null);
                    toast(getString(R.string.saved_to_downloads) + ": " + name);
                } else {
                    // Older Androids cannot write to Downloads without a permission
                    // prompt, so hand the file straight to the share sheet instead.
                    shareLast();
                }
            } catch (Exception e) {
                toast(getString(R.string.save_failed));
            }
        }

        /** Offers the last saved PDF to another app — mail, WhatsApp, Drive. */
        @JavascriptInterface
        public void shareLast() {
            final File f = lastSaved;
            if (f == null || !f.exists()) return;
            runOnUiThread(() -> {
                try {
                    Uri uri = FileProvider.getUriForFile(
                            MainActivity.this, getPackageName() + ".files", f);
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("application/pdf");
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    send.putExtra(Intent.EXTRA_SUBJECT, lastSavedName);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(send, lastSavedName));
                } catch (Exception e) {
                    toast(getString(R.string.save_failed));
                }
            });
        }

        /** Lets the web app show a Share button only when there is something to share. */
        @JavascriptInterface
        public boolean canShare() {
            return lastSaved != null && lastSaved.exists();
        }
    }
}
