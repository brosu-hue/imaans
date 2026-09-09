package com.rasuul.inksign;

import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

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

    /** Where a document shared into the app is parked for the page to fetch. */
    private static final String INBOX_PATH = "/inbox/";
    private static final int MAX_INBOUND_BYTES = 40 * 1024 * 1024;

    /**
     * The base64 hand-off is only a fallback for pages that predate the URL
     * route, and it costs roughly eight times the file in copies along the way,
     * so it is capped well below the limit above.
     */
    private static final int MAX_FALLBACK_BYTES = 16 * 1024 * 1024;

    /** A parked document nobody collected is rubbish after this long. */
    private static final long INBOX_KEEP_MS = 10 * 60 * 1000L;

    /**
     * Saving and the signature store share one thread so their writes stay in
     * order; a shared document gets its own, because reading it can mean a
     * download from Drive and the store must not queue behind that.
     */
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final ExecutorService inbound = Executors.newSingleThreadExecutor();

    private WebView web;
    private ValueCallback<Uri[]> filePicked;
    private ActivityResultLauncher<Intent> filePicker;

    // Written on a background thread, read on the UI thread.
    private volatile File lastSaved;
    private volatile String lastSavedName;
    private volatile List<File> lastBatch;
    private volatile String lastBatchMime = "application/pdf";

    // UI thread only.
    private Incoming pending;
    private Incoming handedOff;
    private boolean pageReady;

    /** A document shared into the app, already on disk. */
    private static final class Incoming {
        final File file;
        final String name;
        final String mime;

        Incoming(File file, String name, String mime) {
            this.file = file;
            this.name = name;
            this.mime = mime;
        }
    }

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
        // The app is one full-screen layout, not an article. A system font
        // scale of 130% would push the toolbar off the edge rather than help.
        s.setTextZoom(100);

        final File inbox = new File(getCacheDir(), "inbox");
        //noinspection ResultOfMethodCallIgnored
        inbox.mkdirs();

        WebViewAssetLoader.Builder loading = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this));
        try {
            loading.addPathHandler(INBOX_PATH,
                    new WebViewAssetLoader.InternalStoragePathHandler(this, inbox));
        } catch (IllegalArgumentException e) {
            // Without it a shared document can still arrive as base64 below.
        }
        final WebViewAssetLoader loader = loading.build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return loader.shouldInterceptRequest(req.getUrl());
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                pageReady = false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                // Builds of the page from before the ready() handshake never call
                // it. Treat "loaded, plus a breath" as ready for those rather than
                // dropping the document on the floor.
                view.postDelayed(() -> {
                    pageReady = true;
                    flushPending();
                }, 1200);
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

    @Override
    protected void onDestroy() {
        // Anything already queued still runs; only new work is refused.
        io.shutdown();
        inbound.shutdown();
        if (web != null) {
            ViewGroup parent = (ViewGroup) web.getParent();
            if (parent != null) parent.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /* ---------- a PDF or picture shared into the app from elsewhere ---------- */

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
        // Reading a shared file can be a download from Drive or Dropbox. On the
        // main thread that is an ANR waiting to happen, so the copy runs here and
        // the page is only told once the bytes are on disk.
        inbound.execute(() -> {
            final Incoming got = copyToInbox(source, type);
            if (got == null) return;
            runOnUiThread(() -> {
                pending = got;
                flushPending();
            });
        });
    }

    /** Streams the shared document into the cache. Null means the user was told why not. */
    private Incoming copyToInbox(Uri source, String type) {
        String name = null;
        long declared = -1;
        // Ask the provider first, so an oversized file is turned away before it
        // is copied rather than after forty megabytes of it are in memory.
        try (Cursor c = getContentResolver().query(source, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int iName = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int iSize = c.getColumnIndex(OpenableColumns.SIZE);
                if (iName >= 0 && !c.isNull(iName)) name = c.getString(iName);
                if (iSize >= 0 && !c.isNull(iSize)) declared = c.getLong(iSize);
            }
        } catch (Exception ignored) {
            // Not every provider answers a query; the copy below still works.
        }
        if (name == null || name.isEmpty()) name = lastSegment(source);
        if (declared > MAX_INBOUND_BYTES) {
            toast(tooBig());
            return null;
        }

        File dir = new File(getCacheDir(), "inbox");
        if (!dir.isDirectory() && !dir.mkdirs()) {
            toast(getString(R.string.open_failed));
            return null;
        }
        prune(dir);

        File out = new File(dir, inboxFileName(name, type));
        long total = 0;
        try (InputStream in = getContentResolver().openInputStream(source);
             FileOutputStream fos = new FileOutputStream(out)) {
            if (in == null) throw new IOException("no stream");
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                total += n;
                // A provider is free to report no size at all, or the wrong one.
                if (total > MAX_INBOUND_BYTES) throw new IOException("over the limit");
                fos.write(buf, 0, n);
            }
        } catch (Exception e) {
            //noinspection ResultOfMethodCallIgnored
            out.delete();
            toast(total > MAX_INBOUND_BYTES ? tooBig() : getString(R.string.open_failed));
            return null;
        }
        return new Incoming(out, name, type);
    }

    /**
     * Hands the parked document to the page, once the page says it is listening.
     *
     * The page is told a URL on its own origin and fetches it itself. The old
     * route pushed the whole file through evaluateJavascript as base64, which
     * for a large PDF meant the document existed six times over at once.
     */
    private void flushPending() {
        if (web == null || !pageReady || pending == null) return;
        final Incoming in = pending;
        pending = null;
        handedOff = in;

        String url = ORIGIN + INBOX_PATH + Uri.encode(in.file.getName());
        String js = "(window.inkSignOpenFileUrl ? (window.inkSignOpenFileUrl("
                + quote(in.name) + "," + quote(in.mime) + "," + quote(url) + "), 'url') : 'none')";
        web.evaluateJavascript(js, value -> {
            if (value == null || !value.contains("url")) openHandedOffAsBase64();
        });
    }

    /** The page cannot fetch the URL, so push the bytes at it the old way. */
    private void openHandedOffAsBase64() {
        final Incoming in = handedOff;
        if (in == null) return;
        handedOff = null;
        inbound.execute(() -> {
            try {
                long len = in.file.length();
                if (len <= 0) return;
                if (len > MAX_FALLBACK_BYTES) {
                    toast(getString(R.string.file_too_large, MAX_FALLBACK_BYTES / (1024 * 1024)));
                    return;
                }
                String b64 = Base64.encodeToString(readAll(in.file), Base64.NO_WRAP);
                runOnUiThread(() -> {
                    if (web == null) return;
                    web.evaluateJavascript("window.inkSignOpenFile && window.inkSignOpenFile("
                            + quote(in.name) + "," + quote(in.mime) + "," + quote(b64) + ")", null);
                });
            } catch (Exception e) {
                toast(getString(R.string.open_failed));
            }
        });
    }

    private static void prune(File dir) {
        File[] parked = dir.listFiles();
        if (parked == null) return;
        long cutoff = System.currentTimeMillis() - INBOX_KEEP_MS;
        for (File f : parked) {
            //noinspection ResultOfMethodCallIgnored
            if (f.lastModified() < cutoff) f.delete();
        }
    }

    private static String lastSegment(Uri uri) {
        String last = uri.getLastPathSegment();
        if (last == null) return "document";
        int slash = last.lastIndexOf('/');
        return slash >= 0 ? last.substring(slash + 1) : last;
    }

    /**
     * The inbox name becomes part of a URL and of a path the WebView resolves,
     * so it is stripped back to plain characters — the name the person sees
     * comes from the display name we pass alongside it.
     */
    private static String inboxFileName(String name, String mime) {
        String base = name == null ? "" : name;
        int slash = base.lastIndexOf('/');
        if (slash >= 0) base = base.substring(slash + 1);
        base = base.replaceAll("[^A-Za-z0-9._-]", "_");
        while (base.startsWith(".")) base = base.substring(1);
        if (base.isEmpty()) base = "document";
        if (base.length() > 80) base = base.substring(base.length() - 80);
        if (base.lastIndexOf('.') <= 0) {
            // The path handler works the content type out from the extension.
            String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
            base = base + "." + (ext == null || ext.isEmpty() ? "bin" : ext);
        }
        return base;
    }

    /** A name safe to write into the cache, keeping as much of the original as it can. */
    private static String cacheFileName(String name) {
        String base = name == null ? "" : name.replace('/', '_').replace('\\', '_').trim();
        while (base.startsWith(".")) base = base.substring(1);
        return base.isEmpty() ? "signed.pdf" : base;
    }

    private static byte[] readAll(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "").replace("\r", "")
                // Line separators that JavaScript ends a line on but Java does not.
                .replace("\u2028", "").replace("\u2029", "") + "\"";
    }

    private String tooBig() {
        return getString(R.string.file_too_large, MAX_INBOUND_BYTES / (1024 * 1024));
    }

    /** Where the signatures live on the device. */
    private File storeFile() {
        return new File(getFilesDir(), "inksign-store.json");
    }

    private void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_LONG).show());
    }

    /* ---------- saving and sharing, shared by the single and batch routes ---------- */

    /** Decodes one document into Downloads. Returns the copy the share sheet can reach. */
    private File saveOne(String filename, String mime, String base64) throws Exception {
        byte[] data = Base64.decode(base64, Base64.DEFAULT);
        String name = cacheFileName(filename);
        String type = mime == null || mime.isEmpty() ? "application/pdf" : mime;

        // Keep a copy the share sheet can reach without any permission.
        File dir = new File(getCacheDir(), "shared");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("no cache dir");
        File copy = new File(dir, name);
        try (FileOutputStream fos = new FileOutputStream(copy)) {
            fos.write(data);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
            cv.put(MediaStore.Downloads.MIME_TYPE, type);
            cv.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri item = getContentResolver()
                    .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (item == null) throw new IOException("no download slot");
            try (OutputStream out = getContentResolver().openOutputStream(item)) {
                if (out == null) throw new IOException("no stream");
                out.write(data);
            }
            cv.clear();
            cv.put(MediaStore.Downloads.IS_PENDING, 0);
            getContentResolver().update(item, cv, null, null);
        }
        return copy;
    }

    private void shareFiles(final List<File> files, final String mime, final String title) {
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed()) return;
            ArrayList<Uri> uris = new ArrayList<>();
            for (File f : files) {
                if (f == null || !f.exists()) continue;
                try {
                    uris.add(FileProvider.getUriForFile(
                            MainActivity.this, getPackageName() + ".files", f));
                } catch (Exception ignored) { }
            }
            if (uris.isEmpty()) {
                toast(getString(R.string.nothing_to_share));
                return;
            }
            boolean many = uris.size() > 1;
            Intent send = new Intent(many ? Intent.ACTION_SEND_MULTIPLE : Intent.ACTION_SEND);
            send.setType(mime == null || mime.isEmpty() ? "application/pdf" : mime);
            if (many) send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
            else send.putExtra(Intent.EXTRA_STREAM, uris.get(0));
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try {
                startActivity(Intent.createChooser(send, title));
            } catch (Exception e) {
                toast(getString(R.string.save_failed));
            }
        });
    }

    /* ---------- what the web app can ask the phone to do ---------- */

    private class Bridge {

        /**
         * The page has finished starting up and can take a shared document.
         *
         * Without this the shell guessed with a fixed delay, and on a cold start
         * on a slow phone the guess was wrong and the document vanished.
         */
        @JavascriptInterface
        public void ready() {
            runOnUiThread(() -> {
                pageReady = true;
                flushPending();
            });
        }

        /** The page could not fetch the shared document; fall back to the bytes. */
        @JavascriptInterface
        public void inboxFailed() {
            runOnUiThread(MainActivity.this::openHandedOffAsBase64);
        }

        /** Writes the finished PDF into the phone's Downloads folder. */
        @JavascriptInterface
        public void saveBase64(String filename, String mime, String base64) {
            // A @JavascriptInterface call holds the page still until it returns,
            // and this one decodes and writes the whole document twice, so it
            // hands the work on and lets the page carry on drawing.
            io.execute(() -> {
                try {
                    File copy = saveOne(filename, mime, base64);
                    lastSaved = copy;
                    lastSavedName = copy.getName();
                    List<File> one = new ArrayList<>(1);
                    one.add(copy);
                    lastBatch = one;
                    lastBatchMime = mime == null || mime.isEmpty() ? "application/pdf" : mime;

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        toast(getString(R.string.saved_to_downloads) + ": " + copy.getName());
                    } else {
                        // Older Androids cannot write to Downloads without a permission
                        // prompt, so hand the file straight to the share sheet instead.
                        shareFiles(one, "application/pdf", copy.getName());
                    }
                } catch (Exception e) {
                    toast(getString(R.string.save_failed));
                }
            });
        }

        /**
         * Saves a whole batch: a JSON array of
         * {"filename": "...", "mime": "...", "base64": "..."} objects.
         */
        @JavascriptInterface
        public void saveMany(String jsonArray) {
            if (jsonArray == null || jsonArray.isEmpty()) return;
            io.execute(() -> {
                List<File> batch = new ArrayList<>();
                String mime = null;
                boolean mixed = false;
                int wanted = 0;
                try {
                    JSONArray arr = new JSONArray(jsonArray);
                    wanted = arr.length();
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject o = arr.optJSONObject(i);
                        if (o == null) continue;
                        String m = o.optString("mime", "application/pdf");
                        try {
                            batch.add(saveOne(o.optString("filename", ""), m,
                                    o.optString("base64", "")));
                        } catch (Exception oneFailed) {
                            continue;   // one bad document must not sink the batch
                        }
                        if (mime == null) mime = m;
                        else if (!mime.equals(m)) mixed = true;
                    }
                } catch (Exception e) {
                    toast(getString(R.string.save_failed));
                    return;
                }
                if (batch.isEmpty()) {
                    toast(getString(R.string.save_failed));
                    return;
                }

                lastBatch = batch;
                lastBatchMime = mixed || mime == null ? "*/*" : mime;
                File last = batch.get(batch.size() - 1);
                lastSaved = last;
                lastSavedName = last.getName();

                // One message for the batch: a toast per file would queue up and
                // sit on top of the app for the best part of a minute.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    toast(batch.size() == wanted
                            ? getString(R.string.saved_many, batch.size())
                            : getString(R.string.saved_some, batch.size(), wanted));
                } else {
                    shareFiles(batch, lastBatchMime, getString(R.string.saved_many, batch.size()));
                }
            });
        }

        /** Offers the last saved PDF to another app — mail, WhatsApp, Drive. */
        @JavascriptInterface
        public void shareLast() {
            final File f = lastSaved;
            if (f == null || !f.exists()) return;
            List<File> one = new ArrayList<>(1);
            one.add(f);
            shareFiles(one, "application/pdf", lastSavedName);
        }

        /** Offers everything the last saveMany wrote, in one share sheet. */
        @JavascriptInterface
        public void shareMany() {
            final List<File> batch = lastBatch;
            if (batch == null || batch.isEmpty()) return;
            shareFiles(batch, lastBatchMime, getString(R.string.saved_many, batch.size()));
        }

        /** Lets the web app show a Share button only when there is something to share. */
        @JavascriptInterface
        public boolean canShare() {
            File f = lastSaved;
            return f != null && f.exists();
        }

        /** How many files the last save left ready to send — 0 when there is nothing. */
        @JavascriptInterface
        public int savedCount() {
            List<File> batch = lastBatch;
            if (batch == null) return 0;
            int n = 0;
            for (File f : batch) if (f != null && f.exists()) n++;
            return n;
        }

        /*
         * The saved signatures, kept in the app's own private storage rather
         * than in the WebView's. Anything the WebView stores can be wiped by
         * Android when it clears app browsing data; a file here lasts as long
         * as the app is installed, so a signature is drawn once and no more.
         */

        @JavascriptInterface
        public String readStore() {
            File f = storeFile();
            if (!f.exists()) return null;
            try {
                return new String(readAll(f), "UTF-8");
            } catch (Exception e) {
                return null;
            }
        }

        @JavascriptInterface
        public void writeStore(String json) {
            if (json == null) return;
            // The page calls this every time a document is opened, and a
            // @JavascriptInterface call blocks it until this returns, so the
            // page must never be made to wait on the disk.
            io.execute(() -> {
                // Write beside the real file and swap it in, so a crash midway
                // cannot leave a half-written file where the signatures were.
                File target = storeFile();
                File tmp = new File(target.getParentFile(), target.getName() + ".tmp");
                try (FileOutputStream out = new FileOutputStream(tmp)) {
                    out.write(json.getBytes("UTF-8"));
                    // No fsync: the rename is what makes the file all-old or
                    // all-new, and waiting on the flash costs far more here.
                } catch (Exception e) {
                    //noinspection ResultOfMethodCallIgnored
                    tmp.delete();
                    return;
                }
                //noinspection ResultOfMethodCallIgnored
                if (!tmp.renameTo(target)) tmp.delete();
            });
        }
    }
}
