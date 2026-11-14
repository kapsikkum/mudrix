package org.wizardchat.android.ui.settings

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.wizardchat.android.LocalSession
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.people.BANNER_RATIO
import org.wizardchat.android.ui.people.ProfileBanner
import org.wizardchat.android.ui.people.cropBanner
import org.wizardchat.android.ui.people.rememberImagePicker
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** The own profile banner: shows it, positions a new one in a 3:1 frame, or removes it */
@Composable
internal fun BannerSettingsItem(onError: (String) -> Unit) {
    val session = LocalSession.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val me = session.userId ?: return
    var reload by remember { mutableIntStateOf(0) }
    var hasBanner by remember { mutableStateOf<Boolean?>(null) }
    var busy by remember { mutableStateOf(false) }
    var pending by remember { mutableStateOf<Bitmap?>(null) }
    var focus by remember { mutableFloatStateOf(0.5f) }

    val pick = rememberImagePicker { uri ->
        scope.launch {
            busy = true
            try {
                val data = readBytes(context, uri) ?: return@launch
                val image = withContext(Dispatchers.Default) { decodeBanner(data) } ?: return@launch
                focus = 0.5f
                pending = image
            } finally {
                busy = false
            }
        }
    }

    fun upload() {
        val image = pending ?: return
        scope.launch {
            busy = true
            try {
                val jpeg = withContext(Dispatchers.Default) {
                    ByteArrayOutputStream().use { out ->
                        cropBanner(image, focus).compress(Bitmap.CompressFormat.JPEG, 85, out)
                        out.toByteArray()
                    }
                }
                session.requireClient.setBanner(jpeg, "image/jpeg")
                hasBanner = true
                reload++
                pending = null
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

    pending?.let { image ->
        BannerCropSheet(
            image = image,
            focus = focus,
            onFocusChange = { focus = it },
            busy = busy,
            onApply = ::upload,
            onCancel = { pending = null },
        )
    }
}

@Composable
private fun BannerCropSheet(
    image: Bitmap,
    focus: Float,
    onFocusChange: (Float) -> Unit,
    busy: Boolean,
    onApply: () -> Unit,
    onCancel: () -> Unit,
) {
    val imageAspect = image.width.toFloat() / image.height
    val bias = focus * 2f - 1f
    WizardSheet(onDismiss = onCancel) {
        SheetTopBar(tr("settings.account.banner"))
        Column(
            Modifier.fillMaxWidth().padding(WZ.Space.space6),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space5),
        ) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(BANNER_RATIO)
                    .clip(RoundedCornerShape(WZ.Radius.lg))
                    .background(theme.fill),
            ) {
                Image(
                    image.asImageBitmap(),
                    null,
                    Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                    alignment = if (imageAspect > BANNER_RATIO) BiasAlignment(bias, 0f) else BiasAlignment(0f, bias),
                )
            }
            if (imageAspect != BANNER_RATIO) {
                Text(tr("settings.account.bannerPosition"), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                Slider(
                    value = focus,
                    onValueChange = onFocusChange,
                    valueRange = 0f..1f,
                    colors = SliderDefaults.colors(thumbColor = theme.accent, activeTrackColor = theme.accent, inactiveTrackColor = theme.fill),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                LabelButton(tr("common.apply"), null, onApply, Modifier.weight(1f), primary = true, enabled = !busy)
                LabelButton(tr("common.cancel"), null, onCancel, Modifier.weight(1f), enabled = !busy)
            }
        }
    }
}

private const val BANNER_PREVIEW_MAX = 2048

private fun decodeBanner(data: ByteArray): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= BANNER_PREVIEW_MAX) sample *= 2
    return BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample })
}
