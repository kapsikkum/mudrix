package org.wizardchat.android.push

import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlin.coroutines.resume
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine

internal object PushProvider {
    suspend fun token(): String? = runCatching {
        suspendCancellableCoroutine { continuation ->
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                continuation.resume(if (task.isSuccessful) task.result else null)
            }
        }
    }.getOrNull()
}

class FcmService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        MainScope().launch { Push.register(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        runBlocking { Push.handle(message.data) }
    }
}
