package com.dopaminefact.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * mattermost-push-proxy sends data-only FCM messages, so the app has to build the notification itself.
 * One notification per channel (tag = channel_id); a "clear" push removes it once the channel is read elsewhere.
 */
public class PushService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "messages";

    @Override
    public void onMessageReceived(RemoteMessage remote) {
        Map<String, String> data = remote.getData();
        String type = data.get("type");
        String channelId = data.get("channel_id");
        NotificationManagerCompat manager = NotificationManagerCompat.from(this);

        if ("clear".equals(type)) {
            manager.cancel(channelId, 0);
            return;
        }
        if (!"message".equals(type) && !"session".equals(type)) {
            return; // e.g. update_badge
        }
        if (!manager.areNotificationsEnabled()) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getSystemService(NotificationManager.class).createNotificationChannel(
                new NotificationChannel(CHANNEL_ID, getString(R.string.notification_channel_name), NotificationManager.IMPORTANCE_HIGH));
        }

        String title = data.get("channel_name");
        String body = data.get("message");
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(title == null || title.isEmpty() ? getString(R.string.app_name) : title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(tap);

        try {
            manager.notify(channelId, 0, notification.build());
        } catch (SecurityException e) {
            // POST_NOTIFICATIONS revoked between the check above and here
        }
    }
}
