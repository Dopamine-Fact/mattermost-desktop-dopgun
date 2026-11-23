package com.dopaminefact.app;

import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.CookieManager;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "DopaminePush";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    // Login happens inside the web app without a native callback, so re-check on every resume/pause.
    @Override
    public void onResume() {
        super.onResume();
        registerDevice();
    }

    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush(); // keep the login if Android kills the backgrounded app
        registerDevice();
    }

    private void registerDevice() {
        if (FirebaseApp.getApps(this).isEmpty()) {
            return; // built without google-services.json
        }
        FirebaseMessaging.getInstance().getToken()
            .addOnSuccessListener(token -> new Thread(() -> attachDevice(token)).start());
    }

    /** Attaches the FCM token to the web app's session so the server sends pushes to this phone. */
    private void attachDevice(String fcmToken) {
        String server = getBridge().getConfig().getServerUrl();
        String cookies = CookieManager.getInstance().getCookie(server);
        String authToken = cookie(cookies, "MMAUTHTOKEN");
        String csrf = cookie(cookies, "MMCSRF");
        if (authToken == null || csrf == null) {
            return; // not logged in yet
        }

        SharedPreferences prefs = getSharedPreferences("push", MODE_PRIVATE);
        String registered = Integer.toHexString((authToken + fcmToken).hashCode());
        if (registered.equals(prefs.getString("registered", null))) {
            return;
        }

        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(server + "/api/v4/users/sessions/device").openConnection();
            conn.setRequestMethod("PUT");
            conn.setRequestProperty("Authorization", "Bearer " + authToken);
            // Capacitor's CookieHandler also sends the WebView cookies, and the server prefers the cookie token:
            // without the CSRF header it rejects the request and expires the login cookies, logging the user out.
            conn.setRequestProperty("X-CSRF-Token", csrf);
            conn.setRequestProperty("X-Requested-With", "XMLHttpRequest");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            // Same device id format as the official mobile app, so the push proxy routes it to its android_rn (FCM) settings.
            String body = "{\"device_id\":\"android_rn-v2:" + fcmToken + "\"}";
            try (OutputStream out = conn.getOutputStream()) {
                out.write(body.getBytes(StandardCharsets.UTF_8));
            }
            int status = conn.getResponseCode();
            conn.disconnect();
            if (status == 200) {
                prefs.edit().putString("registered", registered).apply();
            } else {
                Log.w(TAG, "attach device failed: HTTP " + status);
            }
        } catch (Exception e) {
            Log.w(TAG, "attach device failed", e);
        }
    }

    private static String cookie(String cookies, String name) {
        if (cookies == null) {
            return null;
        }
        for (String part : cookies.split(";")) {
            String[] kv = part.trim().split("=", 2);
            if (kv.length == 2 && kv[0].equals(name)) {
                return kv[1];
            }
        }
        return null;
    }
}
