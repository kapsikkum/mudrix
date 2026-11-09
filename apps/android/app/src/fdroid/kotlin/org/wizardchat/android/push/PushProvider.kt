package org.wizardchat.android.push

/** No push service yet (UnifiedPush comes later); notifications arrive while the app syncs */
internal object PushProvider {
    suspend fun token(): String? = null
}
