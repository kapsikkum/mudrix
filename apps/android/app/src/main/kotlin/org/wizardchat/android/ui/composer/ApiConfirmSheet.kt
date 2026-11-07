package org.wizardchat.android.ui.composer

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import org.wizardchat.android.integrations.Capability
import org.wizardchat.android.integrations.IntegrationApi
import org.wizardchat.android.integrations.IntegrationMatching
import org.wizardchat.android.integrations.IntegrationStore
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.SecondaryButton
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** An integration API action the person started (from the "+" menu or a slash command); nothing is sent until they confirm */
class ApiRequest(val integrationId: String, val actionId: String, val roomId: String, val text: String, val args: String)

private val PRETTY = Json { prettyPrint = true }

/** The body exactly as sent, indented for reading. Shown as text, never as markup. */
private fun prettyBody(body: String): String = try {
    PRETTY.encodeToString(JsonElement.serializer(), Json.parseToJsonElement(body))
} catch (_: Exception) {
    body
}

/**
 * Always shown before an integration API action is called: names the host and path and shows the exact request body. There is
 * deliberately no "don't ask again", and Cancel is the first button.
 */
@Composable
fun ApiConfirmSheet(request: ApiRequest, onDismiss: () -> Unit, onInsertLink: (String) -> Unit) {
    val context = LocalContext.current
    val store = IntegrationStore.get(context)
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    val installed = store.installed
    val grants = store.grants
    val integration = installed.firstOrNull { it.id == request.integrationId }
    // Only an enabled integration whose api grant is on can be called (the same gate as the menu)
    val action = IntegrationMatching.apiActions(installed, grants, store.settings).firstOrNull { it.integrationId == request.integrationId && it.action.id == request.actionId }
    val ctx = action?.let { IntegrationApi.Context(request.roomId, request.text, request.args, it.settings) }
    val preview = if (integration != null && action != null && ctx != null) IntegrationApi.preview(integration.permissions, action.action, ctx) else null
    val ok = preview as? IntegrationApi.Preview.Ok
    val host = ok?.host ?: integration?.permissions?.api?.host ?: "?"

    val sent = tr("integrations.api.sent", host)
    val sentLink = tr("integrations.api.sentLink", host)
    val failedText = tr("integrations.api.failed", "%s")
    val failed = { error: String -> failedText.replace("%s", error) }

    fun send() {
        if (integration == null || action == null || ctx == null || ok == null || busy) return
        busy = true
        scope.launch {
            val res = IntegrationApi.call(integration.permissions, action.action, ctx, IntegrationMatching.allowedHosts(integration, grants, Capability.api))
            busy = false
            when (res) {
                is IntegrationApi.CallResult.Ok -> {
                    Toast.makeText(context, if (res.link != null) sentLink else sent, Toast.LENGTH_SHORT).show()
                    res.link?.let(onInsertLink)
                }
                is IntegrationApi.CallResult.Error -> Toast.makeText(context, failed(res.error), Toast.LENGTH_LONG).show()
            }
            onDismiss()
        }
    }

    WizardSheet(onDismiss = { if (!busy) onDismiss() }) {
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
        ) {
            Text(tr("integrations.api.title", host), style = wizardFont(WZ.FontSize.xl, FontWeight.SemiBold), color = theme.textPrimary)
            if (ok == null || action == null) {
                Text(
                    if (preview is IntegrationApi.Preview.Error) preview.error else tr("integrations.api.unavailable"),
                    style = wizardFont(WZ.FontSize.md),
                    color = theme.textMuted,
                )
            } else {
                Text(tr("integrations.api.intro", action.integrationName, action.action.label), style = wizardFont(WZ.FontSize.md), color = theme.textSecondary)
                Label(tr("integrations.api.host"))
                Code(host)
                Label(tr("integrations.api.path"))
                Code("POST ${ok.path}")
                Label(tr("integrations.api.body"))
                if (ok.body != null) Code(prettyBody(ok.body)) else Text(tr("integrations.api.noBody"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                Text(tr("integrations.api.onlyThis", host), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            }
            SecondaryButton(tr("common.cancel"), onDismiss, enabled = !busy)
            if (ok != null) PrimaryButton(tr("integrations.api.send"), ::send, enabled = !busy)
        }
    }
}

@Composable
private fun Label(text: String) = Text(text, style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)

@Composable
private fun Code(text: String) =
    Text(text, style = wizardFont(WZ.FontSize.sm).copy(fontFamily = FontFamily.Monospace), color = theme.textPrimary)
