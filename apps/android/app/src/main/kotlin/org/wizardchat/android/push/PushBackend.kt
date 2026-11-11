package org.wizardchat.android.push

import android.content.Context
import org.wizardchat.android.BuildConfig

/** How notifications reach the phone while the app is closed; picked when building (`-Pmudrix.push`) */
enum class PushMode {
    keepalive,
    unifiedpush,
    fcm,
    ;

    companion object {
        val current: PushMode = entries.firstOrNull { it.name == BuildConfig.PUSH_MODE } ?: keepalive
    }
}

/** What a push mode provides; every `src/push-<mode>` source set has one `PushProvider` that implements it */
internal interface PushBackend {
    /** The Matrix push gateway's notify URL, or empty when this mode registers no pusher */
    val gateway: String

    /** The pusher key for this device (an FCM token, a UnifiedPush endpoint), or null while there is none */
    suspend fun token(): String? = null

    /** UnifiedPush apps on the phone that can deliver messages */
    fun distributors(context: Context): List<String> = emptyList()

    fun distributor(context: Context): String? = null

    /** Registers with the chosen distributor, which then hands back an endpoint */
    fun chooseDistributor(context: Context, id: String) {}

    /** Stops using the distributor */
    fun unregister(context: Context) {}

    /** Why the last registration failed, if it did */
    fun lastError(context: Context): String? = null

    /** Called once signed in: makes sure the mode's registration is current */
    fun apply(context: Context) {}
}
