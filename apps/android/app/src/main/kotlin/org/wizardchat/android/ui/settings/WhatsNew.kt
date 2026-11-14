package org.wizardchat.android.ui.settings

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

object WhatsNew {
    data class Entry(val version: String, val markdown: String, val date: LocalDate?)

    private data class Note(val meta: Map<String, String>, val markdown: String)

    private val fileName = Regex("""^(\d+\.\d+\.\d+)(?:\.([a-z]{2}))?\.md$""")
    private val frontmatter = Regex("""^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)""")
    private const val PREFS = "whats_new"
    private const val SEEN = "seen"

    fun latest(context: Context): Entry? {
        val notes = mutableMapOf<String, MutableMap<String, Note>>()
        for (name in context.assets.list("").orEmpty()) {
            val match = fileName.matchEntire(name) ?: continue
            val text = runCatching { context.assets.open(name).bufferedReader().use { it.readText() } }.getOrNull()?.trim()
            if (text.isNullOrEmpty()) continue
            notes.getOrPut(match.groupValues[1]) { mutableMapOf() }[match.groupValues[2]] = parse(text)
        }
        val newest = notes.keys.maxWithOrNull(compareBy<String> { it.split('.').map(String::toInt).let { (a, b, c) -> a * 1_000_000 + b * 1_000 + c } })
            ?: return null
        val byLanguage = notes.getValue(newest)
        val fallback = byLanguage[""]
        val note = byLanguage[Locale.getDefault().language] ?: fallback ?: return null
        if (note.markdown.isEmpty()) return null
        val date = (note.meta["date"] ?: fallback?.meta?.get("date"))?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        return Entry(newest, note.markdown, date)
    }

    private fun parse(text: String): Note {
        val match = frontmatter.find(text) ?: return Note(emptyMap(), text)
        val meta = match.groupValues[1].lines().mapNotNull { line ->
            val colon = line.indexOf(':')
            if (colon <= 0) return@mapNotNull null
            val value = line.substring(colon + 1).trim().trim('"', '\'')
            if (value.isEmpty()) null else line.substring(0, colon).trim() to value
        }.toMap()
        return Note(meta, text.substring(match.range.last + 1).trim())
    }

    fun unseen(context: Context): Entry? {
        val entry = latest(context) ?: return null
        val seen = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SEEN, null)
        return entry.takeIf { seen != it.version }
    }

    fun markSeen(context: Context, entry: WhatsNew.Entry) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(SEEN, entry.version).apply()
    }
}

private const val CHANGELOG_URL = "https://github.com/kapsikkum/mudrix/releases"

private data class Social(val icon: String, val label: String, val url: String)

@Composable
fun WhatsNewSheet(entry: WhatsNew.Entry, onDismiss: () -> Unit) {
    val uriHandler = LocalUriHandler.current
    val subtitle = entry.date?.let {
        L10n.format("whatsNew.dateVersion", it.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG)), entry.version)
    } ?: L10n.format("whatsNew.version", entry.version)
    val socials = listOf(
        Social("globe-simple", "GitHub", "https://github.com/kapsikkum/mudrix"),
    )
    WizardSheet(onDismiss) {
        Row(
            Modifier.fillMaxWidth().padding(start = WZ.Space.space7, end = WZ.Space.space5, bottom = WZ.Space.space6),
            verticalAlignment = Alignment.Top,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
                Text(tr("whatsNew.title"), style = wizardFont(WZ.FontSize.xl, FontWeight.Bold), color = theme.textPrimary)
                Text(subtitle, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            }
            IconLink("x", tr("common.close"), onDismiss)
        }
        Rule()
        Column(
            Modifier.weight(1f, fill = false).fillMaxWidth().verticalScroll(rememberScrollState()).padding(WZ.Space.space7),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
        ) {
            entry.markdown.lines().filter { it.isNotBlank() }.forEachIndexed { index, line ->
                when {
                    line.startsWith("#") -> Row(
                        Modifier.padding(top = if (index == 0) WZ.Space.space0 else WZ.Space.space6),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
                    ) {
                        Text(inline(line.trimStart('#').trim()), style = wizardFont(WZ.FontSize.md, FontWeight.Bold), color = theme.accent)
                        Rule(Modifier.weight(1f).widthIn(min = WZ.Space.space8))
                    }
                    line.startsWith("- ") || line.startsWith("* ") -> Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                        Text("•", style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
                        Text(inline(line.drop(2)), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                    }
                    else -> Text(inline(line), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                }
            }
        }
        Rule()
        Row(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
        ) {
            socials.forEach { social -> IconLink(social.icon, social.label, { uriHandler.openUri(social.url) }) }
            Spacer(Modifier.weight(1f))
            Row(
                Modifier.clip(CircleShape).clickable { uriHandler.openUri(CHANGELOG_URL) }.padding(WZ.Space.space3),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
            ) {
                Text(tr("whatsNew.fullChangelog"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                PhIcon("arrow-square-out", size = WZ.SizeIcon.sm, tint = theme.textMuted)
            }
        }
    }
}

@Composable
private fun IconLink(icon: String, label: String, onClick: () -> Unit) {
    Box(
        Modifier.size(WZ.Space.space9).clip(CircleShape).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        PhIcon(icon, tint = theme.textMuted, contentDescription = label)
    }
}

@Composable
private fun Rule(modifier: Modifier = Modifier.fillMaxWidth(), color: Color = theme.border) {
    Box(modifier.height(WZ.BorderWidth.thin).background(color))
}

@Composable
private fun inline(text: String): AnnotatedString {
    val linkStyle = TextLinkStyles(SpanStyle(color = theme.linkColor))
    return buildAnnotatedString {
        var last = 0
        for (match in Regex("""\*\*(.+?)\*\*|\[([^\]]+)]\(([^)\s]+)\)""").findAll(text)) {
            append(text.substring(last, match.range.first))
            val (bold, label, url) = match.destructured
            if (bold.isNotEmpty()) {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(bold) }
            } else {
                withLink(LinkAnnotation.Url(url, linkStyle)) { append(label) }
            }
            last = match.range.last + 1
        }
        append(text.substring(last))
    }
}
