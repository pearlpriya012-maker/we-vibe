package com.wevibe.app;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // ── Foreground service lifecycle ─────────────────────────────────────────

    @Override
    protected void onStart() {
        super.onStart();
        // Start the foreground service as soon as the app becomes visible.
        // Android will NOT kill a process that owns a running foreground service,
        // so the YouTube iframe in the WebView keeps playing even after the user
        // switches to another app or locks the screen.
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
        // Only stop the service when the app is fully closed (not on background).
        stopService(new Intent(this, AudioForegroundService.class));
    }

    // ── WebView background fix ───────────────────────────────────────────────

    @Override
    protected void onPause() {
        super.onPause();
        // When the user presses Home, Android calls WebView.onPause() which:
        //  - sets document.hidden = true  (YouTube iframe auto-pauses)
        //  - throttles JS timers          (our fight-back code can't run)
        // Calling resumeTimers() + onResume() immediately reverses that,
        // keeping JS execution and the YouTube iframe active in background.
        getBridge().getWebView().resumeTimers();
        getBridge().getWebView().onResume();
    }
}
