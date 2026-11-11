package org.wizardchat.android.ui.settings

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.wizardchat.android.LocalSession
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.people.ProfileBanner
import org.wizardchat.android.ui.people.cropBanner
import org.wizardchat.android.ui.people.rememberImagePicker
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** The own profile banner: shows it, picks a new one (cropped to 3:1 from the middle) or removes it */
@Composable
internal fun BannerSettingsItem(onError: (String) -> Unit) {
    val session = LocalSession.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val me = session.userId ?: return
    var reload by remember { mutableIntStateOf(0) }
    var hasBanner by remember { mutableStateOf<Boolean?>(null) }
    var busy by remember { mutableStateOf(false) }

    val pick = rememberImagePicker { uri ->
        scope.launch {
            busy = true
            try {
                val data = readBytes(context, uri) ?: return@launch
                val jpeg = withContext(Dispatchers.Default) {
                    val image = BitmapFactory.decodeByteArray(data, 0, data.size) ?: return@withContext null
                    ByteArrayOutputStream().use { out ->
                        cropBanner(image).compress(Bitmap.CompressFormat.JPEG, 85, out)
                        out.toByteArray()
                    }
                } ?: return@launch
                session.requireClient.setBanner(jpeg, "image/jpeg")
                hasBanner = true
                reload++
            } catch (e: Exception) {
                onError(L10n.format("profile.bannerSaveFailed", e.message ?: ""))
            } finally {
                busy = false
            }
        }
    }

    SettingsItem {
        Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
            Text(tr("settings.account.banner"), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
            ProfileBanner(me, reload) { has -> hasBanner = has }
            if (hasBanner == false) {
                Text(tr("settings.account.noBanner"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
            }
            Text(tr("settings.account.bannerHint"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5)) {
                Text(
                    tr(if (hasBanner == true) "settings.account.changeBanner" else "settings.account.uploadBanner"),
                    Modifier.clickable(enabled = !busy) { pick() },
                    style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                    color = theme.accent,
                )
                if (hasBanner == true) {
                    Text(
                        tr("profile.removeBanner"),
                        Modifier.clickable(enabled = !busy) {
                            scope.launch {
                                busy = true
                                try {
                                    session.requireClient.setBanner(null, null)
                                    hasBanner = false
                                    reload++
                                } catch (e: Exception) {
                                    onError(L10n.format("profile.bannerRemoveFailed", e.message ?: ""))
                                } finally {
                                    busy = false
                                }
                            }
                        },
                        style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                        color = theme.error,
                    )
                }
            }
        }
    }
}
