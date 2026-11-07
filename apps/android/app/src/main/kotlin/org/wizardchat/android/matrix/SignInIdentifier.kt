package org.wizardchat.android.matrix

import org.wizardchat.core.LoginIdentifier

/** What someone typed into the sign-in box; `signInIdentifier.ts` in Kotlin */
sealed interface SignInIdentifier {
    data class User(val user: String) : SignInIdentifier
    data class Mxid(val user: String) : SignInIdentifier
    data class Email(val address: String) : SignInIdentifier
    data class Phone(val number: String) : SignInIdentifier

    val isEmailOrPhone get() = this is Email || this is Phone

    fun toCore(): LoginIdentifier = when (this) {
        is Email -> LoginIdentifier.Email(address)
        is Phone -> LoginIdentifier.Phone(number)
        is User -> LoginIdentifier.User(user)
        is Mxid -> LoginIdentifier.User(user)
    }

    companion object {
        private val EMAIL = Regex("^[^\\s@:]+@[^\\s@:]+\\.[^\\s@:]{2,}$")
        private val MXID = Regex("^@([^:\\s]+):([^\\s]+)$")
        private val PHONE_CHARS = Regex("^\\+?[\\d\\s().-]{7,24}$")

        /**
         * Only input that clearly looks like a phone number counts as one: a leading `+`, or
         * formatting around plenty of digits. A bare run of digits is a valid username.
         */
        private fun looksLikePhone(value: String): Boolean {
            if (!PHONE_CHARS.matches(value)) return false
            val digits = value.count { it in '0'..'9' }
            if (value.startsWith("+")) return digits in 7..15
            return value.any { it.isWhitespace() || it == '(' || it == ')' || it == '-' } && digits in 9..15
        }

        fun parse(raw: String): SignInIdentifier? {
            val value = raw.trim()
            if (value.isEmpty()) return null
            if (MXID.matches(value)) return Mxid(value)
            if (EMAIL.matches(value)) return Email(value)
            if (looksLikePhone(value)) return Phone(value.filter { it in '0'..'9' })
            return User(value.removePrefix("@"))
        }

        /** An email on the selected server's own name is a user id written email-style */
        fun interpret(raw: String, serverName: String): SignInIdentifier? {
            val id = parse(raw)
            if (id is Email && serverName.isNotEmpty()) {
                val at = id.address.lastIndexOf('@')
                if (id.address.substring(at + 1).equals(serverName, ignoreCase = true)) return User(id.address.substring(0, at))
            }
            return id
        }
    }
}
