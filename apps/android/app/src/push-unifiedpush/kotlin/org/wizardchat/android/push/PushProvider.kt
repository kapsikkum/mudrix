package org.wizardchat.android.push

import android.content.Context
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.PushService
import org.unifiedpush.android.connector.UnifiedPush
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage
import org.wizardchat.android.BuildConfig
import org.wizardchat.android.WizardApplication

/** UnifiedPush: the user's distributor app (ntfy, ...) receives the push and hands it to this app */
internal object PushProvider : PushBackend {
    /** The public Matrix push gateway for UnifiedPush, used unless PUSH_GATEWAY_URL names another */
    const val DEFAULT_GATEWAY = "https://matrix.gateway.unifiedpush.org/_matrix/push/v1/notify"

    override val gateway: String = BuildConfig.PUSH_GATEWAY_URL.ifBlank { DEFAULT_GATEWAY }

    private const val ENDPOINT = "endpoint"
    private const val ERROR = "error"

    private fun prefs(context: Context) = context.getSharedPreferences("unifiedpush", Context.MODE_PRIVATE)

    override suspend fun token(): String? = prefs(WizardApplication.instance).getString(ENDPOINT, null)

    override fun distributors(context: Context): List<String> = UnifiedPush.getDistributors(context)

    override fun distributor(context: Context): String? = UnifiedPush.getSavedDistributor(context)

    override fun chooseDistributor(context: Context, id: String) {
        prefs(context).edit().remove(ERROR).apply()
        UnifiedPush.saveDistributor(context, id)
        UnifiedPush.register(context)
    }

    override fun unregister(context: Context) {
        UnifiedPush.unregister(context)
        prefs(context).edit().remove(ENDPOINT).apply()
    }

    override fun lastError(context: Context): String? = prefs(context).getString(ERROR, null)

    override fun apply(context: Context) {
        if (UnifiedPush.getSavedDistributor(context) != null) UnifiedPush.register(context)
    }

    internal fun storeEndpoint(context: Context, url: String?) {
        prefs(context).edit().apply { if (url == null) remove(ENDPOINT) else putString(ENDPOINT, url) }.apply()
    }

    internal fun storeError(context: Context, reason: String?) {
        prefs(context).edit().apply { if (reason == null) remove(ERROR) else putString(ERROR, reason) }.apply()
    }
}

/** Receives what the distributor delivers: the endpoint to register as the pusher key, and the notifications */
class MudrixPushService : PushService() {
    override fun onNewEndpoint(endpoint: PushEndpoint, instance: String) {
        PushProvider.storeEndpoint(this, endpoint.url)
        PushProvider.storeError(this, null)
        MainScope().launch { Push.register(endpoint.url) }
    }

    override fun onMessage(message: PushMessage, instance: String) {
        val data = Push.parsePayload(message.content) ?: return
        runBlocking { Push.handle(data) }
    }

    override fun onRegistrationFailed(reason: FailedReason, instance: String) {
        PushProvider.storeError(this, reason.name)
    }

    override fun onUnregistered(instance: String) {
        PushProvider.storeEndpoint(this, null)
    }
}
