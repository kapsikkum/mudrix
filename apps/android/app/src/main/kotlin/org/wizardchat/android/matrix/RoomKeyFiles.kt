package org.wizardchat.android.matrix

/** The rules of the room key export and import: passphrase checks and which notice a failure gets */
object RoomKeyFiles {
    /** Why a passphrase can't be used for an export, as a locale key; null when it is fine */
    fun exportProblem(passphrase: String, confirm: String): String? = when {
        passphrase.isEmpty() -> "settings.roomKeys.passphrase"
        passphrase != confirm -> "settings.roomKeys.passphraseMismatch"
        else -> null
    }

    /** The notice for an import that failed, from what the core says about the file; null when unknown */
    fun importErrorKey(message: String?): String? {
        val text = message?.lowercase() ?: return null
        return when {
            "version" in text -> "settings.roomKeys.error_version"
            "rounds" in text -> "settings.roomKeys.error_rounds"
            "mac" in text || "decrypt" in text || "password" in text || "passphrase" in text -> "settings.roomKeys.error_password"
            "format" in text || "header" in text || "base64" in text || "json" in text -> "settings.roomKeys.error_format"
            else -> null
        }
    }
}
