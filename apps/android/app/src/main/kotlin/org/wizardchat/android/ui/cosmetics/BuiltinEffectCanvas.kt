package org.wizardchat.android.ui.cosmetics

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.WizardApplication

/** Draws one built-in effect over its bounds, following the web app's canvas effects */
@Composable
fun BuiltinEffect(id: String, modifier: Modifier = Modifier, animate: Boolean = true) {
    if (!BuiltinEffects.draws(id)) return
    val reduceMotion = LocalPrefs.current.reducesMotion(false)
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    val resumed = lifecycleState == androidx.lifecycle.Lifecycle.State.RESUMED
    var size by remember { mutableStateOf(IntSize.Zero) }
    var particles by remember(id) { mutableStateOf(emptyList<BuiltinEffects.Particle>()) }
    var art by remember(id) { mutableStateOf<EeveeArt?>(null) }

    LaunchedEffect(id) {
        if (id == "eevee-stars" && art == null) art = EeveeArt.load()
    }

    LaunchedEffect(id, size, animate, reduceMotion, resumed) {
        if (size.width <= 0 || size.height <= 0) return@LaunchedEffect
        val field = BuiltinEffects.Field(
            id,
            size.width.toFloat(),
            size.height.toFloat(),
            seed = id.hashCode().toLong(),
        )
        particles = field.particles
        if (!animate || reduceMotion || !resumed) return@LaunchedEffect
        var last = withFrameNanos { it }
        while (true) {
            val now = withFrameNanos { it }
            field.step((now - last) / 1_000_000_000f, now / 1_000_000_000f)
            last = now
            particles = field.particles
        }
    }

    Canvas(modifier.onSizeChanged { size = it }) {
        val moving = animate && !reduceMotion
        for (particle in particles) drawParticle(id, particle, art, moving)
    }
}

private const val DEGREES = 180f / PI.toFloat()
private const val TAU = (PI * 2).toFloat()

private val STAR = Color(0xFFFCD34D)
private val STAR_STROKE = Color(0xFFB47800)
private val HEART = Color(0xFFF472B6)
private val HEART_STROKE = Color(0xFF9D174D)
private val SNOW_STROKE = Color(0xFF6482AA)
private val SPARKLE = Color(0xFFFEF08A)
private val SPARKLE_STROKE = Color(0xFFEAB308)
private val CLAUDE = Color(0xFFD97757)
private val CLAUDE_STROKE = Color(0xFF963C23)
private val BUBBLE_FILL = Color(0xFFBAE6FD)
private val BUBBLE_STROKE = Color(0xFF38BDF8)
private val FIREFLY = Color(0xFFECFCCB)
private val FIREFLY_GLOW = Color(0xFFBEF264)
private val LEAF_STROKE = Color(0xFF5A280A)
private val LEAF_MIDRIB = Color(0xFF3C1905)
private val MUD = Color(0xFF5B3A1E)
private val MUD_STROKE = Color(0xFF3E2611)
private val MUD_HIGHLIGHT = Color(0xFFAA7D50)
private val HAND = Color(0xFFC4BDAF)
private val HAND_STROKE = Color(0xFF282824)
private val MIST = Color(0xFFCDD6CC)
private val EYE_BLACK = Color(0xFF040006)
private val EYE_RED = Color(0xFFFF003C)
private val EYE_CYAN = Color(0xFF00F0FF)
private val SIGNAL_BLACK = Color(0xFF050108)
private val BROADCAST_BLACK = Color(0xFF020204)
private val BROADCAST_PALE = Color(0xFFF4F4F0)
private val BROADCAST_LINE = Color(0xFFD6D3CD)
private val EEVEE_OUTLINE = Color(0xFF140B06)
private val EEVEE_HEART = Color(0xFFFB7185)
private val EEVEE_HEART_LIGHT = Color(0xFFFFE4E6)
private val EEVEE_SPARKLE_STROKE = Color(0xFF5C3818)

private val COLOR_CACHE = HashMap<String, Color>()

private fun tint(tint: String?, fallback: Color): Color {
    if (tint == null) return fallback
    return COLOR_CACHE.getOrPut(tint) {
        runCatching { Color(android.graphics.Color.parseColor(tint)) }.getOrDefault(fallback)
    }
}

private fun DrawScope.drawParticle(
    id: String,
    p: BuiltinEffects.Particle,
    art: EeveeArt?,
    moving: Boolean,
) {
    val alpha = if (p.life.isFinite()) {
        sin(p.age / p.life * PI).toFloat().coerceIn(0f, 1f) * 0.95f
    } else {
        0.9f
    }
    withTransform({
        translate(p.x, p.y)
        rotate(p.rot * DEGREES, pivot = Offset.Zero)
    }) {
        drawEffect(id, p, alpha, art, moving)
    }
}

private fun DrawScope.drawEffect(
    id: String,
    p: BuiltinEffects.Particle,
    alpha: Float,
    art: EeveeArt?,
    moving: Boolean,
) {
    when (id) {
        "falling-stars" -> {
            val path = starPath(p.size)
            drawPath(path, STAR.copy(alpha = alpha))
            drawPath(path, STAR_STROKE.copy(alpha = 0.55f * alpha), style = Stroke(1f))
        }
        "hearts" -> {
            val path = heartPath(p.size)
            drawPath(path, HEART.copy(alpha = alpha))
            drawPath(path, HEART_STROKE.copy(alpha = 0.45f * alpha), style = Stroke(1f))
        }
        "snow" -> {
            drawCircle(Color.White.copy(alpha = alpha), p.size)
            drawCircle(SNOW_STROKE.copy(alpha = 0.5f * alpha), p.size, style = Stroke(1f))
        }
        "sparkles" -> {
            val path = sparklePath(p.size)
            drawPath(path, SPARKLE.copy(alpha = alpha))
            drawPath(path, SPARKLE_STROKE.copy(alpha = 0.6f * alpha), style = Stroke(1f))
        }
        "claude-sparks" -> drawClaudeSparks(p, alpha)
        "bubbles" -> {
            drawCircle(BUBBLE_FILL.copy(alpha = 0.28f * alpha), p.size)
            drawCircle(BUBBLE_STROKE.copy(alpha = 0.55f * alpha), p.size, style = Stroke(1f))
            drawCircle(Color.White.copy(alpha = 0.85f * alpha), p.size * 0.28f, Offset(-p.size * 0.35f, -p.size * 0.35f))
        }
        "confetti" -> {
            val flip = cos(p.age * 4 + p.phase)
            scale(1f, max(0.15f, abs(flip)), pivot = Offset.Zero) {
                drawRect(tint(p.tint, Color(0xFFFBBF24)).copy(alpha = alpha), Offset(-p.size, -p.size * 0.5f), Size(p.size * 2, p.size))
            }
        }
        "fireflies" -> {
            val pulse = 0.8f + 0.2f * sin(p.age * 5 + p.phase)
            drawCircle(FIREFLY_GLOW.copy(alpha = 0.22f * alpha), p.size * 3.2f * pulse)
            drawCircle(FIREFLY.copy(alpha = alpha), p.size * pulse)
        }
        "autumn-leaves" -> {
            val path = leafPath(p.size)
            drawPath(path, tint(p.tint, Color(0xFFC2410C)).copy(alpha = alpha))
            drawPath(path, LEAF_STROKE.copy(alpha = 0.45f * alpha), style = Stroke(1f))
            drawLine(
                LEAF_MIDRIB.copy(alpha = 0.45f * alpha),
                Offset(0f, -p.size * 0.85f),
                Offset(0f, p.size * 0.85f),
                1f,
            )
        }
        "mud-splatter" -> drawMud(p, alpha)
        "creeping-hands" -> drawHand(p, alpha)
        "signal-intrusion" -> drawSignal(p, alpha)
        "broadcast-hijack" -> drawBroadcast(p, alpha)
        "eevee-stars" -> drawEevee(p, alpha, art, moving)
    }
}

private fun DrawScope.drawClaudeSparks(p: BuiltinEffects.Particle, alpha: Float) {
    if (p.shape == 0) {
        val u = p.size * 0.4f
        val body = CLAUDE.copy(alpha = alpha)
        drawRect(body, Offset(-2 * u, -2 * u), Size(4 * u, 3 * u))
        drawRect(body, Offset(-2 * u, -3 * u), Size(u, u))
        drawRect(body, Offset(u, -3 * u), Size(u, u))
        drawRect(body, Offset(-2 * u, u), Size(u, 2 * u))
        drawRect(body, Offset(u, u), Size(u, 2 * u))
        val eye = Color(0xFF5A2314).copy(alpha = 0.9f * alpha)
        drawRect(eye, Offset(-1.2f * u, -1.2f * u), Size(0.5f * u, 0.8f * u))
        drawRect(eye, Offset(0.7f * u, -1.2f * u), Size(0.5f * u, 0.8f * u))
        return
    }
    val twinkle = 0.75f + 0.25f * sin(p.age * 3 + p.phase)
    val path = asteriskPath(p.size * twinkle, p.shape ?: 4)
    drawPath(path, CLAUDE.copy(alpha = alpha))
    drawPath(path, CLAUDE_STROKE.copy(alpha = 0.5f * alpha), style = Stroke(1f))
}

private fun DrawScope.drawMud(p: BuiltinEffects.Particle, alpha: Float) {
    if (p.shape == 2) {
        drawCircle(MUD.copy(alpha = alpha), p.size)
        return
    }
    if (p.shape == 1) {
        scale(0.85f, 1f + min(p.age * 0.9f, 1.4f), pivot = Offset.Zero) {
            drawMudBlob(p, alpha)
        }
    } else {
        drawMudBlob(p, alpha)
    }
}

private fun DrawScope.drawMudBlob(p: BuiltinEffects.Particle, alpha: Float) {
    val path = mudBlobPath(p.size, p.phase)
    drawPath(path, MUD.copy(alpha = alpha))
    drawPath(path, MUD_STROKE.copy(alpha = alpha), style = Stroke(1f))
    drawCircle(MUD_HIGHLIGHT.copy(alpha = 0.6f * alpha), p.size * 0.18f, Offset(-p.size * 0.3f, -p.size * 0.3f))
}

private fun DrawScope.drawHand(p: BuiltinEffects.Particle, alpha: Float) {
    if (p.shape == BuiltinEffects.MIST_SHAPE) {
        drawOval(MIST.copy(alpha = 0.1f * alpha), Offset(-p.size * 1.9f, -p.size * 0.5f), Size(p.size * 3.8f, p.size))
        drawOval(MIST.copy(alpha = 0.1f * alpha), Offset(p.size * 0.5f - p.size * 1.1f, -p.size * 0.2f - p.size * 0.34f), Size(p.size * 2.2f, p.size * 0.68f))
        return
    }
    val t = min(1f, p.age / p.life)
    if (t <= 0f || t > 0.72f) return
    val up = easeOutCubic(min(1f, t / 0.3f))
    val down = max(0f, (t - 0.5f) / 0.22f)
    val k = p.size / 4.5f
    val offset = (1f - up + min(1f, down)) * 40f * k
    val grip = 0.5f - 0.5f * cos(p.age * 1.3f + p.phase)
    val path = handPath()
    withTransform({
        translate(0f, offset)
        scale(k, k * (1f - 0.14f * grip), pivot = Offset.Zero)
    }) {
        drawPath(path, HAND.copy(alpha = alpha))
        drawPath(path, HAND_STROKE.copy(alpha = 0.8f * alpha), style = Stroke(0.5f))
    }
}

private fun DrawScope.drawSignal(p: BuiltinEffects.Particle, alpha: Float) {
    when (p.shape) {
        0 -> drawSignalEye(p, alpha)
        1 -> {
            val gate = sin(p.age * 22 + p.phase * 2.3f)
            if (gate < 0.15f) return
            val tearWidth = p.size
            val tearHeight = max(2.5f, p.size * 0.055f)
            val shift = ((floor(p.age * 45 + p.phase * 10).toInt() % 5) - 2) * 5f
            translate(shift, 0f) {
                drawRect(EYE_CYAN.copy(alpha = 0.68f * alpha), Offset(-tearWidth * 0.5f - 5f, -tearHeight * 0.6f), Size(tearWidth * 0.85f, tearHeight * 0.65f))
                drawRect(EYE_RED.copy(alpha = 0.84f * alpha), Offset(-tearWidth * 0.5f + 4f, -tearHeight * 0.3f), Size(tearWidth, tearHeight * 0.75f))
                drawRect(SIGNAL_BLACK.copy(alpha = 0.92f * alpha), Offset(-tearWidth * 0.35f, -tearHeight * 0.5f), Size(tearWidth * 0.7f, tearHeight))
                for (i in 0 until 4) {
                    val dx = (((i * 37 + floor(p.age * 70).toInt()) % 100) / 100f - 0.5f) * tearWidth * 0.65f
                    drawRect(
                        Color(0xFFF8FAFC).copy(alpha = 0.88f * alpha),
                        Offset(dx, -tearHeight * 0.25f),
                        Size(4f + (i % 3) * 3f, max(1.2f, tearHeight * 0.45f)),
                    )
                }
            }
        }
        else -> {
            val flicker = sin(p.age * 26 + p.phase * 4.1f)
            if (flicker < 0.1f) return
            drawRect(EYE_RED.copy(alpha = 0.82f * alpha), Offset(-p.size * 0.6f, -1.5f), Size(p.size * 1.2f, 3f))
            drawRect(EYE_CYAN.copy(alpha = 0.72f * alpha), Offset(-p.size * 0.4f + 3f, 1.5f), Size(p.size * 0.8f, 2f))
            drawRect(SIGNAL_BLACK.copy(alpha = 0.88f * alpha), Offset(-1.5f, -p.size * 0.5f), Size(3f, p.size))
        }
    }
}

private fun DrawScope.drawSignalEye(p: BuiltinEffects.Particle, alpha: Float) {
    val blinkStep = sin(p.age * 7.5f + p.phase * 3.1f)
    val openY = if (blinkStep > 0.9f) 0.08f else 1f
    val burst = sin(p.age * 19 + p.phase * 5.7f) > 0.78f
    val jitterX = if (burst) ((floor(p.age * 60).toInt() % 3) - 1) * 4.5f else 0f
    translate(jitterX, 0f) {
        val r = p.size
        val eyeHeight = r * 0.64f * openY
        if (burst) {
            val left = Path().apply {
                moveTo(-r - 3f, 0f)
                quadraticTo(-3f, -eyeHeight * 1.3f, r - 3f, 0f)
                quadraticTo(-3f, eyeHeight * 1.3f, -r - 3f, 0f)
            }
            drawPath(left, EYE_CYAN.copy(alpha = 0.78f * alpha), style = Stroke(1.5f))
            val right = Path().apply {
                moveTo(-r + 3f, 0f)
                quadraticTo(3f, -eyeHeight * 1.3f, r + 3f, 0f)
                quadraticTo(3f, eyeHeight * 1.3f, -r + 3f, 0f)
            }
            drawPath(right, EYE_RED.copy(alpha = 0.88f * alpha), style = Stroke(1f))
        }
        val almond = Path().apply {
            moveTo(-r * 1.12f, 0f)
            quadraticTo(0f, -eyeHeight * 1.45f, r * 1.12f, 0f)
            quadraticTo(0f, eyeHeight * 1.45f, -r * 1.12f, 0f)
            close()
        }
        drawPath(almond, EYE_BLACK.copy(alpha = alpha))
        val lens = Path().apply {
            moveTo(-r, 0f)
            quadraticTo(0f, -eyeHeight * 1.25f, r, 0f)
            quadraticTo(0f, eyeHeight * 1.25f, -r, 0f)
            close()
        }
        clipPath(lens) {
            drawRect(
                Brush.radialGradient(
                    0f to Color(0xFFFFF1F2),
                    0.58f to Color(0xFFFECDD3),
                    0.88f to Color(0xFFE11D48),
                    1f to Color(0xFF4C0519),
                    center = Offset.Zero,
                    radius = r,
                ),
                Offset(-r, -r),
                Size(r * 2, r * 2),
            )
            val veins = Path().apply {
                moveTo(-r * 0.88f, -eyeHeight * 0.2f)
                lineTo(-r * 0.46f, -eyeHeight * 0.05f)
                moveTo(-r * 0.82f, eyeHeight * 0.25f)
                lineTo(-r * 0.42f, eyeHeight * 0.08f)
                moveTo(r * 0.88f, -eyeHeight * 0.18f)
                lineTo(r * 0.45f, -eyeHeight * 0.04f)
                moveTo(r * 0.8f, eyeHeight * 0.22f)
                lineTo(r * 0.44f, eyeHeight * 0.07f)
            }
            drawPath(veins, Color(0xFFBE123C).copy(alpha = 0.78f * alpha), style = Stroke(max(0.7f, r * 0.045f)))
        }
        val stepTick = floor(p.age * 4.2f + p.phase * 4.3f)
        val gx = sin(stepTick * 2.7f) * r * 0.22f
        val gy = cos(stepTick * 3.9f) * eyeHeight * 0.2f
        val irisRadius = r * 0.42f
        drawCircle(EYE_CYAN.copy(alpha = 0.55f * alpha), irisRadius, Offset(gx - (if (burst) 2.6f else 1.1f), gy))
        drawCircle(EYE_RED.copy(alpha = 0.6f * alpha), irisRadius, Offset(gx + (if (burst) 2.6f else 1.1f), gy))
        val cyan = p.tint == "cyan"
        val irisBrush = if (cyan) {
            Brush.radialGradient(
                0f to Color(0xFFECFEFF),
                0.45f to EYE_CYAN,
                0.85f to Color(0xFF0E7490),
                1f to Color(0xFF020C10),
                center = Offset(gx, gy),
                radius = irisRadius,
            )
        } else {
            Brush.radialGradient(
                0f to EYE_RED,
                0.55f to Color(0xFFBE123C),
                0.88f to Color(0xFF3B0414),
                1f to EYE_BLACK,
                center = Offset(gx, gy),
                radius = irisRadius,
            )
        }
        drawCircle(irisBrush, irisRadius, Offset(gx, gy))
        val pupilRadius = irisRadius * (if (burst) 0.34f else 0.48f)
        if (cyan) {
            drawOval(
                Color(0xFF030005).copy(alpha = alpha),
                Offset(gx - pupilRadius * 0.45f, gy - pupilRadius * 1.25f),
                Size(pupilRadius * 0.9f, pupilRadius * 2.5f),
            )
        } else {
            drawCircle(Color(0xFF030005).copy(alpha = alpha), pupilRadius, Offset(gx, gy))
        }
        drawCircle(Color.White.copy(alpha = 0.92f * alpha), max(1f, r * 0.09f), Offset(gx - irisRadius * 0.32f, gy - irisRadius * 0.3f))
        val outline = Path().apply {
            moveTo(-r, 0f)
            quadraticTo(0f, -eyeHeight * 1.25f, r, 0f)
            quadraticTo(0f, eyeHeight * 1.25f, -r, 0f)
            close()
        }
        drawPath(
            outline,
            if (burst) EYE_RED.copy(alpha = alpha) else Color(0xFF09010D).copy(alpha = alpha),
            style = Stroke(max(1.2f, r * 0.09f)),
        )
    }
}

private fun DrawScope.drawBroadcast(p: BuiltinEffects.Particle, alpha: Float) {
    when (p.shape) {
        0 -> drawBroadcastHead(p, alpha)
        1 -> {
            val gate = sin(p.age * 24 + p.phase * 3.1f)
            if (gate < 0.05f) return
            val lineWidth = p.size
            val lineHeight = max(1.8f, p.size * 0.025f)
            val shift = ((floor(p.age * 50 + p.phase * 9).toInt() % 5) - 2) * 6f
            translate(shift, 0f) {
                drawRect(Color(0xFF020306).copy(alpha = 0.9f * alpha), Offset(-lineWidth * 0.5f + 4f, lineHeight * 0.6f), Size(lineWidth * 0.92f, lineHeight))
                drawRect(BROADCAST_PALE.copy(alpha = 0.88f * alpha), Offset(-lineWidth * 0.5f, -lineHeight * 0.5f), Size(lineWidth, lineHeight))
                for (i in 0 until 5) {
                    val dx = (((i * 29 + floor(p.age * 80).toInt()) % 100) / 100f - 0.5f) * lineWidth * 0.85f
                    drawRect(Color(0xFF020306).copy(alpha = alpha), Offset(dx, -lineHeight * 0.5f), Size(3f + (i % 3) * 4f, lineHeight))
                }
            }
        }
        else -> {
            val blink = sin(p.age * 18 + p.phase * 3.7f)
            if (blink < 0.2f) return
            val boxWidth = p.size * 1.8f
            val boxHeight = p.size * 0.52f
            drawRect(Color(0xFF020306).copy(alpha = 0.92f * alpha), Offset(-boxWidth * 0.5f, -boxHeight * 0.5f), Size(boxWidth, boxHeight))
            drawRect(
                BROADCAST_LINE.copy(alpha = 0.85f * alpha),
                Offset(-boxWidth * 0.5f, -boxHeight * 0.5f),
                Size(boxWidth, boxHeight),
                style = Stroke(1f),
            )
            val play = Path().apply {
                moveTo(-boxWidth * 0.38f, -boxHeight * 0.26f)
                lineTo(-boxWidth * 0.38f, boxHeight * 0.26f)
                lineTo(-boxWidth * 0.22f, 0f)
                close()
            }
            drawPath(play, BROADCAST_PALE.copy(alpha = alpha))
            drawRect(BROADCAST_PALE.copy(alpha = alpha), Offset(-boxWidth * 0.14f, -boxHeight * 0.18f), Size(boxWidth * 0.24f, boxHeight * 0.36f))
            drawRect(BROADCAST_PALE.copy(alpha = alpha), Offset(boxWidth * 0.16f, -boxHeight * 0.18f), Size(boxWidth * 0.22f, boxHeight * 0.36f))
        }
    }
}

private fun DrawScope.drawBroadcastHead(p: BuiltinEffects.Particle, alpha: Float) {
    val slip = sin(p.age * 16 + p.phase * 4.7f) > 0.8f
    val jitterX = if (slip) ((floor(p.age * 50).toInt() % 3) - 1) * 4f else 0f
    translate(jitterX, 0f) {
        val r = p.size
        drawOval(BROADCAST_BLACK.copy(alpha = alpha), Offset(-r * 0.76f, -r * 1.12f), Size(r * 1.52f, r * 2.24f))
        drawOval(
            BROADCAST_LINE.copy(alpha = 0.78f * alpha),
            Offset(-r * 0.76f, -r * 1.12f),
            Size(r * 1.52f, r * 2.24f),
            style = Stroke(1.1f),
        )
        val eyeX = r * 0.32f
        val eyeY = -r * 0.22f
        val eyeRadiusX = r * 0.24f
        val eyeRadiusY = r * 0.17f
        drawOval(BROADCAST_PALE.copy(alpha = alpha), Offset(-eyeX - eyeRadiusX, eyeY - eyeRadiusY), Size(eyeRadiusX * 2, eyeRadiusY * 2))
        drawOval(BROADCAST_PALE.copy(alpha = alpha), Offset(eyeX - eyeRadiusX, eyeY - eyeRadiusY), Size(eyeRadiusX * 2, eyeRadiusY * 2))
        val gazeStep = floor(p.age * 3.2f + p.phase * 5)
        val px = sin(gazeStep * 2.1f) * eyeRadiusX * 0.25f
        val py = cos(gazeStep * 3.3f) * eyeRadiusY * 0.25f
        val pupil = max(1.1f, r * 0.065f)
        drawCircle(BROADCAST_BLACK.copy(alpha = alpha), pupil, Offset(-eyeX + px, eyeY + py))
        drawCircle(BROADCAST_BLACK.copy(alpha = alpha), pupil, Offset(eyeX + px, eyeY + py))
        val jawStretch = if (slip) 1.32f else 1f
        val grin = Path().apply {
            moveTo(-r * 0.44f, r * 0.28f)
            quadraticTo(0f, r * 0.16f, r * 0.44f, r * 0.28f)
            quadraticTo(r * 0.32f, r * 0.72f * jawStretch, 0f, r * 0.72f * jawStretch)
            quadraticTo(-r * 0.32f, r * 0.72f * jawStretch, -r * 0.44f, r * 0.28f)
            close()
        }
        drawPath(grin, BROADCAST_PALE.copy(alpha = alpha))
        val teeth = Path().apply {
            moveTo(-r * 0.38f, r * 0.46f * jawStretch)
            lineTo(r * 0.38f, r * 0.46f * jawStretch)
            for (k in -2..2) {
                val tx = k * r * 0.14f
                moveTo(tx, r * 0.25f)
                lineTo(tx, r * 0.68f * jawStretch)
            }
        }
        drawPath(teeth, BROADCAST_BLACK.copy(alpha = alpha), style = Stroke(max(0.9f, r * 0.06f)))
        val censorOn = sin(p.age * 3.8f + p.phase * 2.1f) > -0.15f
        if (censorOn) {
            val slipY = if (slip) r * 0.26f else 0f
            val top = eyeY - eyeRadiusY * 1.2f + slipY
            drawRect(BROADCAST_BLACK.copy(alpha = alpha), Offset(-r * 0.72f, top), Size(r * 1.44f, eyeRadiusY * 2.4f))
            drawRect(BROADCAST_PALE.copy(alpha = alpha), Offset(-r * 0.72f, top), Size(r * 1.44f, eyeRadiusY * 2.4f), style = Stroke(0.8f))
            drawRect(BROADCAST_LINE.copy(alpha = 0.82f * alpha), Offset(-r * 0.5f, eyeY - 1f + slipY), Size(r, 2f))
        }
    }
}

private fun DrawScope.drawEevee(p: BuiltinEffects.Particle, alpha: Float, art: EeveeArt?, moving: Boolean) {
    when (p.shape) {
        0, 1 -> drawEeveeSprite(p, alpha, art, moving)
        2 -> drawEeveeHeart(p, alpha)
        else -> {
            val twinkle = 0.78f + 0.22f * sin(p.age * 4.5f + p.phase)
            val path = sparklePath(p.size * twinkle)
            drawPath(path, tint(p.tint, Color(0xFFFEF08A)).copy(alpha = alpha))
            drawPath(path, EEVEE_SPARKLE_STROKE.copy(alpha = 0.65f * alpha), style = Stroke(1f))
        }
    }
}

private fun DrawScope.drawEeveeSprite(p: BuiltinEffects.Particle, alpha: Float, art: EeveeArt?, moving: Boolean) {
    val strip = art?.strip(p.shape == 1) ?: return
    val hop = -abs(sin(p.age * 5.2f + p.phase)) * 7f
    val tilt = sin(p.age * 5.2f + p.phase) * 0.08f
    val frame = BuiltinEffects.eeveeFrame(p.age, p.phase, moving)
    val k = p.size * 2.3f / BuiltinEffects.EEVEE_FRAME_H
    withTransform({
        translate(0f, hop)
        rotate(tilt * DEGREES, pivot = Offset.Zero)
        if (p.vx > 0f) scale(-1f, 1f, pivot = Offset.Zero)
    }) {
        scale(k, k, pivot = Offset.Zero) {
            drawImage(
                strip.tile(frame),
                srcOffset = IntOffset(strip.offset(frame), 0),
                srcSize = IntSize(BuiltinEffects.EEVEE_FRAME_W, BuiltinEffects.EEVEE_FRAME_H),
                dstOffset = IntOffset(-BuiltinEffects.EEVEE_FRAME_W / 2, -BuiltinEffects.EEVEE_FRAME_H / 2),
                dstSize = IntSize(BuiltinEffects.EEVEE_FRAME_W, BuiltinEffects.EEVEE_FRAME_H),
                alpha = alpha,
                filterQuality = FilterQuality.None,
            )
        }
    }
}

private fun DrawScope.drawEeveeHeart(p: BuiltinEffects.Particle, alpha: Float) {
    val u = max(1.2f, p.size * 0.22f)
    val bob = sin(p.age * 4 + p.phase) * 2f
    translate(-3.5f * u, -3.5f * u + bob) {
        val outline = EEVEE_OUTLINE.copy(alpha = alpha)
        drawRect(outline, Offset(u, 0f), Size(2 * u, u))
        drawRect(outline, Offset(4 * u, 0f), Size(2 * u, u))
        drawRect(outline, Offset(0f, u), Size(7 * u, 2 * u))
        drawRect(outline, Offset(u, 3 * u), Size(5 * u, u))
        drawRect(outline, Offset(2 * u, 4 * u), Size(3 * u, u))
        drawRect(outline, Offset(3 * u, 5 * u), Size(u, u))
        val fill = EEVEE_HEART.copy(alpha = alpha)
        drawRect(fill, Offset(u, u), Size(2 * u, 2 * u))
        drawRect(fill, Offset(4 * u, u), Size(2 * u, 2 * u))
        drawRect(fill, Offset(2 * u, 2 * u), Size(3 * u, 2 * u))
        drawRect(fill, Offset(3 * u, 4 * u), Size(u, u))
        drawRect(EEVEE_HEART_LIGHT.copy(alpha = alpha), Offset(u, u), Size(u, u))
    }
}

/** One Eevee sprite strip, cut into tiles of a few frames each so no bitmap is wider than a GPU texture */
private class EeveeStrip(private val tiles: List<ImageBitmap>) {
    /** The tile holding a frame index */
    fun tile(frame: Int): ImageBitmap = tiles[frame / EEVEE_TILE_FRAMES]

    /** The frame's left edge inside that tile, in pixels */
    fun offset(frame: Int): Int = (frame % EEVEE_TILE_FRAMES) * BuiltinEffects.EEVEE_FRAME_W
}

private const val EEVEE_TILE_FRAMES = 32

/** The Eevee strips, decoded from the APK's assets once and kept: 49x47 frames, 125 to a strip */
private class EeveeArt(private val normal: EeveeStrip?, private val shiny: EeveeStrip?) {
    /** The strip for the shiny Eevee or the normal one; null when that art is missing */
    fun strip(shiny: Boolean): EeveeStrip? = if (shiny) this.shiny else normal

    companion object {
        @Volatile private var cached: EeveeArt? = null

        /** Both strips, decoded on the first call and then reused */
        suspend fun load(): EeveeArt = cached ?: withContext(Dispatchers.IO) {
            cached ?: EeveeArt(decode("cosmetics/effects/eevee-anim.png"), decode("cosmetics/effects/eevee-anim-shiny.png"))
                .also { cached = it }
        }

        private fun decode(path: String): EeveeStrip? = runCatching {
            val strip = BitmapFactory.decodeStream(WizardApplication.instance.assets.open(path))
            strip?.let { EeveeStrip(tiles(it)) }
        }.getOrNull()

        private fun tiles(strip: Bitmap): List<ImageBitmap> {
            val frames = strip.width / BuiltinEffects.EEVEE_FRAME_W
            val tiles = ArrayList<ImageBitmap>()
            var first = 0
            while (first < frames) {
                val count = min(first + EEVEE_TILE_FRAMES, frames) - first
                val tile = Bitmap.createBitmap(
                    strip,
                    first * BuiltinEffects.EEVEE_FRAME_W,
                    0,
                    count * BuiltinEffects.EEVEE_FRAME_W,
                    strip.height,
                )
                tiles += tile.asImageBitmap()
                first += count
            }
            strip.recycle()
            return tiles
        }
    }
}

private fun starPath(r: Float): Path = Path().apply {
    for (i in 0 until 10) {
        val rad = if (i % 2 == 0) r else r * 0.45f
        val angle = (-90f + i * 36f) * PI.toFloat() / 180f
        val x = rad * cos(angle)
        val y = rad * sin(angle)
        if (i == 0) moveTo(x, y) else lineTo(x, y)
    }
    close()
}

private fun heartPath(r: Float): Path = Path().apply {
    moveTo(0f, r * 0.9f)
    cubicTo(-r * 1.4f, -r * 0.1f, -r * 0.7f, -r * 1.1f, 0f, -r * 0.35f)
    cubicTo(r * 0.7f, -r * 1.1f, r * 1.4f, -r * 0.1f, 0f, r * 0.9f)
    close()
}

private fun sparklePath(r: Float): Path = Path().apply {
    val k = r * 0.14f
    moveTo(0f, -r)
    quadraticTo(k, -k, r, 0f)
    quadraticTo(k, k, 0f, r)
    quadraticTo(-k, k, -r, 0f)
    quadraticTo(-k, -k, 0f, -r)
    close()
}

private fun asteriskPath(r: Float, points: Int): Path = Path().apply {
    val inner = r * 0.32f
    val step = TAU / points
    for (k in 0 until points) {
        val angle = -PI.toFloat() / 2 + k * step
        if (k == 0) moveTo(r * cos(angle), r * sin(angle))
        val mid = angle + step / 2
        val next = angle + step
        quadraticTo(inner * cos(mid), inner * sin(mid), r * cos(next), r * sin(next))
    }
    close()
}

private fun leafPath(r: Float): Path = Path().apply {
    moveTo(0f, -r)
    cubicTo(r * 0.8f, -r * 0.6f, r * 0.8f, r * 0.5f, 0f, r)
    cubicTo(-r * 0.8f, r * 0.5f, -r * 0.8f, -r * 0.6f, 0f, -r)
    close()
}

private fun mudBlobPath(r: Float, phase: Float): Path {
    val count = 9
    val points = List(count) { i ->
        val t = i.toFloat() / count * TAU
        val radius = r * (1 + 0.18f * sin(3 * t + phase) + 0.1f * sin(5 * t + phase * 1.7f))
        Offset(radius * cos(t), radius * sin(t))
    }
    fun midpoint(a: Offset, b: Offset) = Offset((a.x + b.x) / 2, (a.y + b.y) / 2)
    return Path().apply {
        val start = midpoint(points[count - 1], points[0])
        moveTo(start.x, start.y)
        for (i in 0 until count) {
            val m = midpoint(points[i], points[(i + 1) % count])
            quadraticTo(points[i].x, points[i].y, m.x, m.y)
        }
        close()
    }
}

private fun handPath(): Path = Path().apply {
    moveTo(-9f, 0f)
    lineTo(-9f, 16f)
    quadraticTo(-9f, 22f, -4f, 22f)
    lineTo(4f, 22f)
    quadraticTo(9f, 22f, 9f, 16f)
    lineTo(9f, 0f)
    close()
    moveTo(-8.6f, 0f)
    lineTo(-8.6f, -11.4f)
    quadraticTo(-7f, -13f, -5.4f, -11.4f)
    lineTo(-5.4f, 0f)
    close()
    moveTo(-4.1f, 0f)
    lineTo(-4.1f, -14.3f)
    quadraticTo(-2.4f, -16f, -0.7f, -14.3f)
    lineTo(-0.7f, 0f)
    close()
    moveTo(0.75f, 0f)
    lineTo(0.75f, -13.35f)
    quadraticTo(2.4f, -15f, 4.05f, -13.35f)
    lineTo(4.05f, 0f)
    close()
    moveTo(4.95f, 0f)
    lineTo(4.95f, -9.55f)
    quadraticTo(6.4f, -11f, 7.85f, -9.55f)
    lineTo(7.85f, 0f)
    close()
    moveTo(-8f, 12f)
    lineTo(-13.2f, 4.5f)
    quadraticTo(-14.2f, 2.8f, -10.6f, 1.5f)
    lineTo(-6f, 8f)
    close()
}

private fun easeOutCubic(x: Float): Float {
    val inv = 1f - x
    return 1f - inv * inv * inv
}
