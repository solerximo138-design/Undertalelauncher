package com.soullink.undertalelauncher;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * SOUL LINK Android shell.
 *
 * The web app is served from a synthetic HTTPS origin so that localStorage,
 * IndexedDB and same-origin fetches behave exactly like on the web. GameBanana
 * file downloads are executed natively (no CORS) and exposed back to JS through
 * a local /__cache__/ URL.
 */
public class MainActivity extends Activity {

    private static final String TAG = "SoulLink";
    private static final String ORIGIN = "https://app.soullink.local";
    private static final String START_URL = ORIGIN + "/index.html";
    private static final int FILE_CHOOSER_REQUEST = 0x501;
    private static final long MAX_DOWNLOAD = 240L * 1024L * 1024L;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(Color.TRANSPARENT);
            getWindow().setNavigationBarColor(Color.TRANSPARENT);
        }
        applyImmersiveMode();

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF08060F);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        String ua = settings.getUserAgentString();
        if (ua == null) ua = "";
        if (!ua.contains("SoulLinkAndroid")) {
            settings.setUserAgentString(ua + " SoulLinkAndroid/1.0");
        }

        webView.addJavascriptInterface(new AndroidBridge(), "SLAndroid");
        webView.setWebViewClient(new SoulWebClient());
        webView.setWebChromeClient(new SoulChromeClient());

        setContentView(webView);
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(START_URL);
        }
    }

    private void applyImmersiveMode() {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersiveMode();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
        }
        applyImmersiveMode();
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("SLAndroid");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript(
                "(function(){try{return window.SLAndroidBack?SLAndroidBack():'exit'}catch(e){return 'exit'}})()",
                value -> {
                    if (value == null || !value.contains("handled")) {
                        finish();
                    }
                });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
            if (fileCallback != null) {
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /* ── WebView client: virtual origin + native cache ───────── */

    private class SoulWebClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri == null || !"app.soullink.local".equals(uri.getHost())) return null;

            String path = uri.getPath();
            if (path == null || path.isEmpty()) path = "/index.html";

            if (path.startsWith("/__cache__/")) {
                String name = path.substring("/__cache__/".length());
                WebResourceResponse cached = serveCache(name);
                if (cached != null) return cached;
                return textResponse(404, "Not Found");
            }

            if ("/favicon.ico".equals(path)) {
                return textResponse(204, "");
            }
            return serveAsset(path);
        }

        private WebResourceResponse serveCache(String rawName) {
            try {
                String name = Uri.decode(rawName);
                if (name.contains("/") || name.contains("\\") || name.contains("..")) return null;
                File file = new File(new File(getCacheDir(), "mods"), name);
                if (!file.isFile()) return null;
                InputStream stream = new BufferedInputStream(new java.io.FileInputStream(file));
                return new WebResourceResponse(mimeFor(name), null, 200, "OK",
                        noCacheHeaders(), stream);
            } catch (Exception err) {
                Log.w(TAG, "cache read failed", err);
                return null;
            }
        }

        private WebResourceResponse serveAsset(String path) {
            String clean = path;
            while (clean.contains("..")) clean = clean.replace("..", "");
            if (!clean.startsWith("/")) clean = "/" + clean;
            try {
                InputStream stream = getAssets().open("www" + clean);
                String mime = mimeFor(clean);
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-cache");
                return new WebResourceResponse(mime, mime.startsWith("text/") || mime.contains("javascript")
                        || mime.contains("json") || mime.contains("svg") ? "utf-8" : null,
                        200, "OK", headers, stream);
            } catch (IOException err) {
                return textResponse(404, "Not Found: " + clean);
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri == null) return true;
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.US);
            if ("https".equals(scheme) && "app.soullink.local".equals(uri.getHost())) return false;
            if ("blob".equals(scheme) || "data".equals(scheme) || "about".equals(scheme)
                    || "javascript".equals(scheme)) {
                return false;
            }
            openExternalUrl(uri.toString());
            return true;
        }
    }

    private void openExternalUrl(String url) {
        if (url == null || url.isEmpty()) return;
        Uri uri;
        try {
            uri = Uri.parse(url);
        } catch (Exception err) {
            return;
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.US);
        if (!"http".equals(scheme) && !"https".equals(scheme) && !"mailto".equals(scheme)) return;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception err) {
            Toast.makeText(MainActivity.this, "No app can open this link", Toast.LENGTH_SHORT).show();
        }
    }

    private class SoulChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(null);
                fileCallback = null;
            }
            fileCallback = callback;
            try {
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                startActivityForResult(Intent.createChooser(intent, "SOUL LINK"), FILE_CHOOSER_REQUEST);
                return true;
            } catch (Exception err) {
                fileCallback = null;
                Toast.makeText(MainActivity.this, "File picker unavailable", Toast.LENGTH_SHORT).show();
                return false;
            }
        }

        @Override
        public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
            Log.d(TAG, message.message() + " @" + message.sourceId() + ":" + message.lineNumber());
            return true;
        }
    }

    private Map<String, String> noCacheHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        return headers;
    }

    private WebResourceResponse textResponse(int status, String text) {
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        return new WebResourceResponse("text/plain", "utf-8", status, status == 204 ? "No Content" : "Not Found",
                noCacheHeaders(), new ByteArrayInputStream(bytes));
    }

    private static String mimeFor(String name) {
        String lower = name.toLowerCase(Locale.US);
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
        if (lower.endsWith(".webmanifest")) return "application/manifest+json";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        if (lower.endsWith(".otf")) return "font/otf";
        if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
        if (lower.endsWith(".zip")) return "application/zip";
        if (lower.endsWith(".apk")) return "application/vnd.android.package-archive";
        return "application/octet-stream";
    }

    /* ── JS bridge ───────────────────────────────────────────── */

    private class AndroidBridge {
        @JavascriptInterface
        public String platform() {
            return "android";
        }

        @JavascriptInterface
        public void openExternal(String url) {
            openExternalUrl(url);
        }

        @JavascriptInterface
        public void exitApp() {
            mainHandler.post(MainActivity.this::finish);
        }

        @JavascriptInterface
        public void downloadFile(final String url, final String fileName, final String requestId) {
            if (url == null || url.isEmpty()) {
                emitDownloadError(requestId, "Empty URL");
                return;
            }
            final String jobId = sanitizeId(requestId);
            final String safeName = sanitizeFileName(fileName);
            Thread worker = new Thread(() -> runDownload(url, safeName, jobId, requestId),
                    "soul-link-download");
            worker.setDaemon(true);
            worker.start();
        }
    }

    private void runDownload(String url, String safeName, String jobId, String requestId) {
        File dir = new File(getCacheDir(), "mods");
        if (!dir.exists() && !dir.mkdirs()) {
            emitDownloadError(requestId, "Cache directory unavailable");
            return;
        }
        String storedName = jobId + "-" + safeName;
        File target = new File(dir, storedName);
        File partial = new File(dir, storedName + ".part");
        HttpURLConnection connection = null;
        InputStream input = null;
        OutputStream output = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(30000);
            connection.setReadTimeout(90000);
            connection.setRequestProperty("User-Agent",
                    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
                            + "(KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 SoulLinkAndroid/1.0");
            connection.setRequestProperty("Accept", "*/*");
            connection.setRequestProperty("Accept-Encoding", "identity");
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IOException("HTTP " + status);
            }
            long total = connection.getContentLengthLong();
            if (total > MAX_DOWNLOAD) {
                throw new IOException("File is larger than 240 MB");
            }
            input = new BufferedInputStream(connection.getInputStream(), 64 * 1024);
            output = new FileOutputStream(partial);
            byte[] buffer = new byte[64 * 1024];
            long received = 0;
            long lastReport = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
                received += read;
                if (received > MAX_DOWNLOAD) {
                    throw new IOException("File is larger than 240 MB");
                }
                if (received - lastReport >= 256 * 1024) {
                    lastReport = received;
                    emitDownloadProgress(requestId, received, total);
                }
            }
            output.flush();
            output.close();
            output = null;
            input.close();
            input = null;
            if (!partial.renameTo(target)) {
                throw new IOException("Could not finalise download");
            }
            emitDownloadProgress(requestId, received, received);
            String localUrl = ORIGIN + "/__cache__/" + Uri.encode(storedName);
            emitDownloadDone(requestId, localUrl);
        } catch (Exception err) {
            Log.w(TAG, "download failed: " + url, err);
            if (partial.exists()) //noinspection ResultOfMethodCallIgnored
                partial.delete();
            emitDownloadError(requestId, err.getMessage() == null ? err.toString() : err.getMessage());
        } finally {
            if (output != null) {
                try { output.close(); } catch (IOException ignored) { }
            }
            if (input != null) {
                try { input.close(); } catch (IOException ignored) { }
            }
            if (connection != null) connection.disconnect();
        }
    }

    private static String sanitizeId(String value) {
        if (value == null || value.isEmpty()) return "dl" + System.currentTimeMillis();
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < value.length() && out.length() < 64; i++) {
            char c = value.charAt(i);
            if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
                    || (c >= '0' && c <= '9') || c == '-' || c == '_') {
                out.append(c);
            }
        }
        return out.length() == 0 ? "dl" + System.currentTimeMillis() : out.toString();
    }

    private static String sanitizeFileName(String value) {
        if (value == null || value.isEmpty()) return "mod.bin";
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < value.length() && out.length() < 96; i++) {
            char c = value.charAt(i);
            if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
                    || (c >= '0' && c <= '9') || c == '.' || c == '-' || c == '_') {
                out.append(c);
            } else {
                out.append('_');
            }
        }
        String name = out.toString();
        if (name.isEmpty() || ".".equals(name) || "..".equals(name)) return "mod.bin";
        return name;
    }

    private void emitDownloadProgress(String id, long received, long total) {
        callBridge("onDownloadProgress", id, String.valueOf(received), String.valueOf(total));
    }

    private void emitDownloadDone(String id, String localUrl) {
        callBridge("onDownloadDone", id, localUrl);
    }

    private void emitDownloadError(String id, String message) {
        callBridge("onDownloadError", id, message == null ? "Download failed" : message);
    }

    private void callBridge(String method, String... args) {
        if (webView == null) return;
        final String script;
        StringBuilder sb = new StringBuilder();
        sb.append("window.SLAndroidBridge&&window.SLAndroidBridge.").append(method).append('(');
        for (int i = 0; i < args.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(JSONObject.quote(args[i] == null ? "" : args[i]));
        }
        sb.append(");");
        script = sb.toString();
        mainHandler.post(() -> {
            if (webView != null) webView.evaluateJavascript(script, null);
        });
    }
}
