package org.wizardchat.android.ui

import android.provider.Settings
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.ui.theme.theme

/**
 * A soft highlight sweeping over placeholder shapes. The sweep position is read while drawing, so it never recomposes
 * the placeholder; with reduced motion the shapes are a still tint.
 */
@Composable
fun Modifier.shimmer(): Modifier {
    val prefs = LocalPrefs.current
    val context = LocalContext.current
    val still = remember(prefs.reducedMotion) {
        val animationsOff = runCatching {
            Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        }.getOrDefault(false)
        prefs.reducesMotion(animationsOff)
    }
    if (still) return alpha(0.75f)
    val sweep by rememberInfiniteTransition(label = "shimmer").animateFloat(
        0f,
        1f,
        infiniteRepeatable(tween(1400, easing = LinearEasing)),
        label = "sweep",
    )
    val tint = theme.textPrimary
    return graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }.drawWithContent {
        drawContent()
        val band = size.width * 0.6f
        val start = -band + (size.width + band * 2) * sweep
        drawRect(
            Brush.horizontalGradient(
                listOf(Color.Transparent, tint.copy(alpha = 0.16f), Color.Transparent),
                startX = start,
                endX = start + band,
            ),
            blendMode = BlendMode.SrcAtop,
        )
    }
}
