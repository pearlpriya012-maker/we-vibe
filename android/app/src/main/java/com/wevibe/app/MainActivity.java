package com.wevibe.app;

import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private final Handler handler = new Handler(Looper.getMainLooper());

    /**
     * Native-side YouTube resume: posts a YT iframe API "playVideo" command via
     * postMessage into every YouTube iframe on the page.
     * Used as a backup to our JS watchdog — the native handler fires even when
     * JS timers are temporarily throttled between onPause and our WebView fix.
     * Stored as a field so removeCallbacks() can cancel it reliably.
     */
    private final Runnable resumeYouTubeRunnable = () -> {
        try {
            getBridge().getWebView().evaluateJavascript(
                "(function(){" +
                "  try {" +
                "    document.querySelectorAll('iframe[src*=\"youtube\"]')" +
                "      .forEach(function(f){" +
                "        try {" +
                "          f.contentWindow.postMessage(" +
                "            JSON.stringify({event:'command',func:'playVideo',args:[]}),'*'" +
                "          );" +
                "        } catch(e){}" +
                "      });" +
                "  } catch(e){}" +
                "})()",
                null
            );
        } catch (Exception ignored) {}
    };

    // ── Foreground service lifecycle ─────────────────────────────────────────

    @Override
    protected void onStart() {
        super.onStart();
        // A foreground-service process cannot be killed by Android, so the
        // YouTube iframe in the WebView keeps running when the user switches apps.
        Intent svc = new Intent(this, AudioForegroundService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(svc);
        } else {
            startService(svc);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        handler.removeCallbacksAndMessages(null);
        stopService(new Intent(this, AudioForegroundService.class));
    }

    // ── WebView background fix ───────────────────────────────────────────────

    @Override
    protected void onPause() {
        super.onPause();
        // super.onPause() → Capacitor → webView.onPause():
        //   • sets document.hidden = true  → YouTube iframe auto-pauses
        //   • throttles JS timers          → our JS watchdog can't fire
        // Reversing it immediately keeps the WebView in "foreground" mode.
        keepWebViewAlive();

        // Schedule native-side retries at 500 ms and 1500 ms.
        // These fire from the main thread Handler — independent of JS timers —
        // so they work even in the brief window before keepWebViewAlive takes effect.
        handler.postDelayed(resumeYouTubeRunnable, 500);
        handler.postDelayed(resumeYouTubeRunnable, 1500);
    }

    @Override
    protected void onStop() {
        super.onStop();
        // onStop is called right after onPause when pressing Home.
        // super.onStop() can re-throttle the WebView, so we un-pause it again.
        keepWebViewAlive();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // App came back to foreground — cancel any pending background retries.
        handler.removeCallbacks(resumeYouTubeRunnable);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private void keepWebViewAlive() {
        try {
            WebView wv = getBridge().getWebView();
            wv.resumeTimers();
            wv.onResume();
        } catch (Exception ignored) {}
    }
}
