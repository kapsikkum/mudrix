package org.wizardchat.android.ui.settings

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import java.util.Locale
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

object WhatsNew {
    data class Entry(val version: String, val markdown: String)

    private val fileName = Regex("""^(\d+\.\d+\.\d+)(?:\.([a-z]{2}))?\.md$""")
    private const val PREFS = "whats_new"
    private const val SEEN = "seen"

    fun latest(context: Context): Entry? {
        val notes = mutableMapOf<String, MutableMap<String, String>>()
        for (name in context.assets.list("").orEmpty()) {
            val match = fileName.matchEntire(name) ?: continue
            val text = runCatching { context.assets.open(name).bufferedReader().use { it.readText() } }.getOrNull()?.trim()
            if (text.isNullOrEmpty()) continue
            notes.getOrPut(match.groupValues[1]) { mutableMapOf() }[match.groupValues[2]] = text
        }
        val newest = notes.keys.maxWithOrNull(compareBy<String> { it.split('.').map(String::toInt).let { (a, b, c) -> a * 1_000_000 + b * 1_000 + c } })
            ?: return null
        val byLanguage = notes.getValue(newest)
        val markdown = byLanguage[Locale.getDefault().language] ?: byLanguage[""] ?: return null
        return Entry(newest, markdown)
    }

    fun unseen(context: Context): Entry? {
        val entry = latest(context) ?: return null
        val seen = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SEEN, null)
        return entry.takeIf { seen != it.version }
    }

    fun markSeen(context: Context, entry: Entry) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(SEEN, entry.version).apply()
    }
}

@Composable
fun WhatsNewSheet(entry: WhatsNew.Entry, onDismiss: () -> Unit) {
    val uriHandler = LocalUriHandler.current
    WizardSheet(onDismiss) {
        SheetTopBar(L10n.format("whatsNew.titleVersion", entry.version))
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(WZ.Space.space7).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
        ) {
            entry.markdown.lines().filter { it.isNotBlank() }.forEach { line ->
                when {
                    line.startsWith("#") -> Text(
                        inline(line.trimStart('#').trim()),
                        Modifier.padding(top = WZ.Space.space4),
                        style = wizardFont(WZ.FontSize.lg, FontWeight.Bold),
                        color = theme.textPrimary,
                    )
                    line.startsWith("- ") || line.startsWith("* ") -> Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                        Text("•", style = wizardFont(WZ.FontSize.md), color = theme.accent)
                        Text(inline(line.drop(2)), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                    }
                    else -> Text(inline(line), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                }
            }
            LabelButton(tr("whatsNew.fullChangelog"), "arrow-square-out", { uriHandler.openUri("https://github.com/kapsikkum/mudrix/releases") })
            PrimaryButton(tr("whatsNew.gotIt"), onDismiss)
        }
    }
}

private fun inline(text: String): AnnotatedString = buildAnnotatedString {
    text.split("**").forEachIndexed { index, part ->
        if (index % 2 == 1) withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(part) } else append(part)
    }
}
