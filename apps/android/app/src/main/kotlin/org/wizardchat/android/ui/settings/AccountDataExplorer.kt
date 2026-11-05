package org.wizardchat.android.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.wizardchat.android.LocalSession
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

private val prettyJson = Json { prettyPrint = true }

@Composable
internal fun AccountDataSheet(onDismiss: () -> Unit) {
    val session = LocalSession.current
    var types by remember { mutableStateOf<List<String>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        types = runCatching { session.client?.accountDataTypes() }.getOrNull().orEmpty().sorted()
        loaded = true
    }
    LaunchedEffect(Unit) { load() }

    WizardSheet(onDismiss) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.92f).background(theme.bgSecondary)) {
            val type = editing
            if (type != null) {
                AccountDataEditor(type.ifEmpty { null }, onBack = { editing = null }, onSaved = { load() })
            } else {
                SheetTopBar(
                    tr("settings.developer.accountData"),
                    leading = { BarTextButton(tr("common.done"), onDismiss) },
                    trailing = { BarTextButton(tr("settings.developer.accountDataAdd"), { editing = "" }, bold = true) },
                )
                LazyColumn(Modifier.fillMaxWidth().weight(1f).navigationBarsPadding()) {
                    if (loaded) {
                        item {
                            Text(
                                L10n.plural("settings.developer.accountDataCount", types.size, types.size),
                                Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3),
                                style = wizardFont(WZ.FontSize.sm),
                                color = theme.textMuted,
                            )
                        }
                    }
                    if (loaded && types.isEmpty()) {
                        item { Text(tr("settings.developer.accountDataEmpty"), Modifier.padding(WZ.Space.space6), color = theme.textMuted) }
                    }
                    items(types, key = { it }) { item ->
                        Text(
                            item,
                            Modifier
                                .fillMaxWidth()
                                .clickable { editing = item }
                                .heightIn(min = WZ.Space.space11)
                                .padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
                            style = wizardFont(WZ.FontSize.sm).copy(fontFamily = FontFamily.Monospace),
                            color = theme.textPrimary,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AccountDataEditor(type: String?, onBack: () -> Unit, onSaved: suspend () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var newType by remember { mutableStateOf("") }
    var text by remember { mutableStateOf("{\n}") }
    var status by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    var saving by remember { mutableStateOf(false) }
    LaunchedEffect(type) {
        if (type == null) return@LaunchedEffect
        val value = runCatching { session.client?.accountData(type) }.getOrNull()
        if (value != null) text = prettyJson.encodeToString(JsonElement.serializer(), value)
    }

    fun save() {
        val eventType = type ?: newType.trim()
        val value = runCatching { Json.parseToJsonElement(text) }.getOrNull()
        if (value !is JsonObject) {
            status = L10n.format("settings.developer.accountDataNotObject") to true
            return
        }
        saving = true
        scope.launch {
            runCatching { session.requireClient.setAccountData(eventType, value) }
                .onSuccess {
                    status = L10n.format("settings.developer.accountDataSaved") to false
                    onSaved()
                    if (type == null) onBack()
                }
                .onFailure { status = L10n.format("settings.developer.accountDataSaveFailed", it.message ?: "") to true }
            saving = false
        }
    }

    SheetTopBar(
        type ?: tr("settings.developer.accountDataNew"),
        leading = { BarTextButton(tr("common.back"), onBack) },
        trailing = {
            BarTextButton(tr("common.save"), ::save, enabled = !saving && (type != null || newType.isNotBlank()), bold = true)
        },
    )
    Column(
        Modifier.fillMaxWidth().padding(WZ.Space.space6).imePadding().navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        if (type == null) {
            Text(tr("settings.developer.accountDataType"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            WizardTextField(newType, { newType = it }, "m.example")
        }
        Text(tr("settings.developer.accountDataContent"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
        TextField(
            text,
            { text = it },
            Modifier.fillMaxWidth().heightIn(min = WZ.Size.panel),
            textStyle = wizardFont(WZ.FontSize.sm).copy(fontFamily = FontFamily.Monospace, color = theme.textPrimary),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = theme.bgTertiary,
                unfocusedContainerColor = theme.bgTertiary,
            ),
        )
        status?.let { (message, isError) -> Text(message, style = wizardFont(WZ.FontSize.sm), color = if (isError) theme.danger else theme.success) }
    }
}
