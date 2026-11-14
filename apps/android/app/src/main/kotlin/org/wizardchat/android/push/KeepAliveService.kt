package org.wizardchat.android.push

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.wizardchat.android.MainActivity
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.matrix.ListeningSharing
import org.wizardchat.android.matrix.MatrixSession
import org.wizardchat.android.matrix.MessageNotifier
import org.wizardchat.android.matrix.SessionStore
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcons
import org.wizardchat.android.ui.PhWeight

/**
 * "Stay connected": a foreground service whose quiet ongoing notification keeps the process alive while the app
 * is in the background. Sync keeps running and the message notifier posts the notifications, as it does with the
 * app on screen. Useful without a push service, or next to one.
 */
class KeepAliveService : Service() {
    private val scope = MainScope()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val app = WizardApplication.instance
        if (!app.prefs.keepAlive || SessionStore.active() == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, L10n.format("mobile.keepAlive.channel"), NotificationManager.IMPORTANCE_MIN),
        )
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(PhIcons.id("plugs-connected", PhWeight.regular).takeIf { it != 0 } ?: applicationInfo.icon)
            .setContentTitle(L10n.format("app.name"))
            .setContentText(L10n.format("mobile.keepAlive.text"))
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setContentIntent(open)
            .build()
        val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
        ServiceCompat.startForeground(this, ID, notification, type)
        scope.launch { connect(app) }
        return START_STICKY
    }

    /** After the system restarted the process there is no screen to sign in and sync, so the service does it */
    private suspend fun connect(app: WizardApplication) {
        val session = app.session
        if (session.state == MatrixSession.State.Restoring) session.restore()
        val roomList = session.roomList ?: return
        MessageNotifier.shared.start(roomList, app.prefs)
        session.resumeSync()
        if (app.prefs.shareListening) ListeningSharing.start(session)
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "keepalive"
        private const val ID = 4712

        /** Starts or stops the service as the setting and the accounts say; call it from the foreground */
        fun apply(context: Context) {
            val intent = Intent(context, KeepAliveService::class.java)
            if (WizardApplication.instance.prefs.keepAlive && SessionStore.active() != null) {
                runCatching { ContextCompat.startForegroundService(context, intent) }
            } else {
                context.stopService(intent)
            }
        }
    }
}

/** Brings the service back after the phone restarted */
class KeepAliveBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            KeepAliveService.apply(context)
        }
    }
}
