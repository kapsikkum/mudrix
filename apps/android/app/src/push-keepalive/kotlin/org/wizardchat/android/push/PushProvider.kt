package org.wizardchat.android.push

/** No push service: the keep-alive foreground service holds the connection open and posts the notifications */
internal object PushProvider : PushBackend {
    override val gateway: String = ""
}
