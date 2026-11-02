package org.wizardchat.android.ui

import android.annotation.SuppressLint
import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import java.util.concurrent.ConcurrentHashMap
import org.wizardchat.android.WizardApplication

/**
 * Translations by their shared key (`welcome.login`). The resources come from packages/i18n,
 * where `welcome.login` becomes `R.string.welcome_login`.
 */
object L10n {
    private val strings = ConcurrentHashMap<String, Int>()
    private val plurals = ConcurrentHashMap<String, Int>()

    private val context: Context get() = WizardApplication.instance

    @SuppressLint("DiscouragedApi")
    private fun id(cache: ConcurrentHashMap<String, Int>, type: String, key: String): Int =
        cache.getOrPut(key) {
            context.resources.getIdentifier(key.replace('.', '_').replace('-', '_'), type, context.packageName)
        }

    /** The text for `key`, with `{{placeholders}}` filled in order */
    fun format(key: String, vararg args: Any): String {
        val id = id(strings, "string", key)
        if (id == 0) return key
        return if (args.isEmpty()) context.getString(id) else context.getString(id, *args)
    }

    /** `key` in its singular or plural form; `count` is also the first argument when the text shows it */
    fun plural(key: String, count: Int, vararg args: Any): String {
        val id = id(plurals, "plurals", key)
        if (id == 0) {
            // Keys whose forms don't show the count are separate strings (`key_one`, `key_other`)
            return format("${key}_${if (count == 1) "one" else "other"}", *args)
        }
        return context.resources.getQuantityString(id, count, *args)
    }

    fun has(key: String) = id(strings, "string", key) != 0
}

/** [L10n.format] in a composable */
@Composable
fun tr(key: String, vararg args: Any): String {
    LocalContext.current
    return L10n.format(key, *args)
}

@Composable
fun trPlural(key: String, count: Int, vararg args: Any): String {
    LocalContext.current
    return L10n.plural(key, count, *args)
}
