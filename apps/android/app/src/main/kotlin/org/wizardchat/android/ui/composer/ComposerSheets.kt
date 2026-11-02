package org.wizardchat.android.ui.composer

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.location.Location
import android.location.LocationManager
import android.os.CancellationSignal
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.tan
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.WizardMenu
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** A sheet's bar: Cancel, the title, and the confirming action */
@Composable
private fun SheetBar(title: String, onCancel: () -> Unit, confirm: String, enabled: Boolean, onConfirm: () -> Unit) =
    SheetTopBar(
        title,
        leading = { BarTextButton(tr("common.cancel"), onCancel) },
        trailing = { BarTextButton(confirm, onConfirm, enabled = enabled, bold = true) },
    )

/** A text field row inside a grouped section */
@Composable
private fun FormField(
    value: String,
    onChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    Box(modifier.heightIn(min = WZ.Space.space11).padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4), contentAlignment = Alignment.CenterStart) {
        if (value.isEmpty()) Text(placeholder, style = wizardFont(WZ.FontSize.lg), color = theme.textMuted)
        BasicTextField(
            value,
            onChange,
            Modifier.fillMaxWidth(),
            textStyle = wizardFont(WZ.FontSize.lg).copy(color = theme.textPrimary),
            singleLine = singleLine,
            cursorBrush = SolidColor(theme.accent),
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        )
    }
}

/** Creates a poll */
@Composable
fun PollCreatorSheet(onSend: suspend (String, List<String>, Boolean) -> Unit, onDismiss: () -> Unit) {
    var question by remember { mutableStateOf("") }
    val options = remember { mutableStateListOf("", "") }
    var disclosed by remember { mutableStateOf(true) }
    var sending by remember { mutableStateOf(false) }
    var kindMenu by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val canSend = question.isNotBlank() && options.count { it.isNotBlank() } >= 2

    WizardSheet(onDismiss) {
        Column(Modifier.fillMaxWidth().background(theme.groupedBackground).imePadding()) {
            SheetBar(tr("composer.poll.create"), onDismiss, tr("composer.poll.send"), canSend && !sending) {
                scope.launch {
                    sending = true
                    onSend(question.trim(), options.map { it.trim() }.filter { it.isNotEmpty() }, disclosed)
                    onDismiss()
                }
            }
            Column(Modifier.verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = WZ.Space.space8)) {
                GroupedSection(header = tr("composer.poll.questionLabel")) {
                    FormField(question, { question = it }, tr("composer.poll.questionPlaceholder"), singleLine = false)
                }
                GroupedSection(header = tr("composer.poll.optionsLabel")) {
                    options.forEachIndexed { index, option ->
                        if (index > 0) RowDivider()
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            FormField(option, { options[index] = it }, L10n.format("composer.option", "${index + 1}"), Modifier.weight(1f))
                            if (options.size > 2) {
                                Box(
                                    Modifier.padding(end = WZ.Space.space4).clickable { options.removeAt(index) },
                                ) {
                                    PhIcon("minus-circle", tint = theme.error, contentDescription = tr("composer.poll.removeOption"))
                                }
                            }
                        }
                    }
                    if (options.size < 20) {
                        RowDivider()
                        GroupedRow(
                            tr("composer.poll.addOption"),
                            icon = "plus-circle",
                            iconTint = theme.accent,
                            titleColor = theme.accent,
                            onClick = { options.add("") },
                        )
                    }
                }
                GroupedSection(
                    footer = if (disclosed) tr("composer.poll.kindDisclosedDesc") else tr("composer.poll.kindUndisclosedDesc"),
                ) {
                    Box {
                        GroupedRow(tr("composer.poll.kindLabel"), onClick = { kindMenu = true }) {
                            Text(
                                if (disclosed) tr("composer.poll.kindDisclosed") else tr("composer.poll.kindUndisclosed"),
                                style = wizardFont(WZ.FontSize.lg),
                                color = theme.textMuted,
                            )
                            PhIcon("caret-down", size = WZ.SizeIcon.sm, tint = theme.textMuted)
                        }
                        WizardMenu(
                            kindMenu,
                            { kindMenu = false },
                            listOf(
                                MenuItem(tr("composer.poll.kindDisclosed"), icon = if (disclosed) "check" else null) { disclosed = true },
                                MenuItem(tr("composer.poll.kindUndisclosed"), icon = if (!disclosed) "check" else null) { disclosed = false },
                            ),
                        )
                    }
                }
            }
        }
    }
}

/** Gets the current position once */
private class OneShotLocation(private val context: Context) {
    var latitude by mutableStateOf<Double?>(null)
    var longitude by mutableStateOf<Double?>(null)
    var error by mutableStateOf<String?>(null)
    var requesting by mutableStateOf(false)

    val hasPermission: Boolean
        get() = listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION).any {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }

    fun denied() {
        requesting = false
        error = L10n.format("composer.location.permissionDenied")
    }

    @SuppressLint("MissingPermission")
    fun locate() {
        error = null
        requesting = true
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val provider = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
            .firstOrNull { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }
        if (provider == null || !hasPermission) {
            requesting = false
            error = L10n.format("composer.location.unavailable")
            return
        }
        LocationManagerCompat.getCurrentLocation(manager, provider, CancellationSignal(), ContextCompat.getMainExecutor(context)) { location: Location? ->
            val found = location ?: runCatching { manager.getLastKnownLocation(provider) }.getOrNull()
            requesting = false
            if (found == null) {
                error = L10n.format("composer.location.unavailable")
            } else {
                latitude = found.latitude
                longitude = found.longitude
            }
        }
    }
}

/** Shares a location (current or typed in) */
@Composable
fun LocationShareSheet(onSend: suspend (Double, Double, String?) -> Unit, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val location = remember { OneShotLocation(context) }
    var latitude by remember { mutableStateOf("") }
    var longitude by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    val lat = latitude.toDoubleOrNull()?.takeIf { it in -90.0..90.0 }
    val lon = longitude.toDoubleOrNull()?.takeIf { it in -180.0..180.0 }
    val hasCoordinate = lat != null && lon != null

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        if (result.values.any { it }) location.locate() else location.denied()
    }

    fun request() {
        if (location.hasPermission) {
            location.locate()
        } else {
            location.requesting = true
            permission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    }

    LaunchedEffect(Unit) { request() }
    LaunchedEffect(location.latitude, location.longitude) {
        val foundLat = location.latitude ?: return@LaunchedEffect
        val foundLon = location.longitude ?: return@LaunchedEffect
        latitude = String.format(Locale.US, "%.6f", foundLat)
        longitude = String.format(Locale.US, "%.6f", foundLon)
    }

    WizardSheet(onDismiss) {
        Column(Modifier.fillMaxWidth().background(theme.groupedBackground).imePadding()) {
            SheetBar(tr("composer.location.share"), onDismiss, tr("composer.location.send"), hasCoordinate) {
                if (lat == null || lon == null) return@SheetBar
                scope.launch {
                    onSend(lat, lon, note.takeIf { it.isNotBlank() })
                    onDismiss()
                }
            }
            Column(Modifier.verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = WZ.Space.space8)) {
                GroupedSection {
                    TileMap(lat, lon, Modifier.fillMaxWidth().height(WZ.Size.callTile))
                    GroupedRow(
                        if (location.requesting) tr("composer.location.requesting") else tr("composer.location.useCurrent"),
                        icon = "navigation-arrow",
                        iconTint = theme.accent,
                        titleColor = theme.accent,
                        onClick = { request() },
                    )
                }
                GroupedSection(footer = location.error) {
                    FormField(latitude, { latitude = it }, tr("composer.location.latitude"), keyboardType = KeyboardType.Number)
                    RowDivider()
                    FormField(longitude, { longitude = it }, tr("composer.location.longitude"), keyboardType = KeyboardType.Number)
                    RowDivider()
                    FormField(note, { note = it }, tr("composer.location.descriptionPlaceholder"))
                }
            }
        }
    }
}

private const val MAP_ZOOM = 16
private val tileCache = android.util.LruCache<String, Bitmap>(48)

private suspend fun loadTile(x: Int, y: Int): Bitmap? {
    val key = "$MAP_ZOOM/$x/$y"
    tileCache.get(key)?.let { return it }
    return withContext(Dispatchers.IO) {
        runCatching {
            val connection = URL("https://tile.openstreetmap.org/$key.png").openConnection() as HttpURLConnection
            connection.setRequestProperty("User-Agent", "WizardChat Android (https://wizardchat.org)")
            try {
                connection.inputStream.use { BitmapFactory.decodeStream(it) }
            } finally {
                connection.disconnect()
            }
        }.getOrNull()
    }?.also { tileCache.put(key, it) }
}

/** A small OpenStreetMap map centred on the coordinate with a pin (Android has no built-in map view) */
@Composable
private fun TileMap(latitude: Double?, longitude: Double?, modifier: Modifier = Modifier) {
    val tiles = remember { mutableStateMapOf<Pair<Int, Int>, Bitmap>() }
    val accent = theme.accent
    val ring = theme.textOnAccent
    BoxWithConstraints(modifier.background(theme.fill).clipToBounds(), contentAlignment = Alignment.Center) {
        if (latitude == null || longitude == null) {
            PhIcon("map-pin", size = WZ.SizeIcon.xl, tint = theme.textMuted)
            return@BoxWithConstraints
        }
        val tileSize = with(LocalDensity.current) { 256.dp.toPx() } / 1.5f
        val widthPx = constraints.maxWidth.toFloat()
        val heightPx = constraints.maxHeight.toFloat()
        val n = 1 shl MAP_ZOOM
        val latRad = latitude * PI / 180
        val tileX = (longitude + 180) / 360 * n
        val tileY = (1 - ln(tan(latRad) + 1 / cos(latRad)) / PI) / 2 * n
        val originX = tileX * tileSize - widthPx / 2
        val originY = tileY * tileSize - heightPx / 2
        val firstX = floor(originX / tileSize).toInt()
        val firstY = floor(originY / tileSize).toInt()
        val lastX = floor((originX + widthPx) / tileSize).toInt()
        val lastY = floor((originY + heightPx) / tileSize).toInt()
        val needed = (firstX..lastX).flatMap { x -> (firstY..lastY).map { y -> x to y } }.filter { (x, y) -> y in 0 until n }
        LaunchedEffect(needed) {
            needed.forEach { (x, y) ->
                if (tiles[x to y] == null) launch { loadTile(((x % n) + n) % n, y)?.let { tiles[x to y] = it } }
            }
        }
        Canvas(Modifier.fillMaxSize()) {
            needed.forEach { (x, y) ->
                val bitmap = tiles[x to y] ?: return@forEach
                drawImage(
                    bitmap.asImageBitmap(),
                    dstOffset = IntOffset((x * tileSize - originX).toInt(), (y * tileSize - originY).toInt()),
                    dstSize = IntSize(tileSize.toInt() + 1, tileSize.toInt() + 1),
                )
            }
            val center = Offset(size.width / 2, size.height / 2)
            val radius = WZ.Space.space5.toPx()
            drawCircle(accent, radius, center)
            drawCircle(ring, radius, center, style = Stroke(WZ.Space.space1.toPx()))
        }
        Text(
            "© OpenStreetMap",
            Modifier.align(Alignment.BottomEnd).background(theme.bgPrimary.copy(alpha = 0.7f), CircleShape).padding(horizontal = WZ.Space.space2),
            style = wizardFont(WZ.FontSize.xs),
            color = theme.textMuted,
            textAlign = TextAlign.End,
        )
    }
}
