package chat.mudrix.android.ui

import android.provider.Settings
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import chat.mudrix.android.LocalPrefs

/**
 * Whether motion is reduced: the Accessibility setting (system, on or off), where "system" means the device's
 * animation scale is 0 ("Remove animations"). Animations that move or loop check this and show the end state instead.
 */
@Composable
fun rememberReducedMotion(): Boolean {
    val prefs = LocalPrefs.current
    val context = LocalContext.current
    return remember(prefs.reducedMotion) {
        val animationsOff = runCatching {
            Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        }.getOrDefault(false)
        prefs.reducesMotion(animationsOff)
    }
}

/** The transition, or none when motion is reduced */
fun EnterTransition.unless(reduced: Boolean): EnterTransition = if (reduced) EnterTransition.None else this

fun ExitTransition.unless(reduced: Boolean): ExitTransition = if (reduced) ExitTransition.None else this

/** A tween of [millis], or an instant change when motion is reduced */
fun <T> motionTween(reduced: Boolean, millis: Int): FiniteAnimationSpec<T> = if (reduced) snap() else tween(millis)

/** The slide-and-fade the call bar and tab island use to rise from the bottom */
@Composable
fun riseIn(): EnterTransition = (slideInVertically { it } + fadeIn()).unless(rememberReducedMotion())

@Composable
fun riseOut(): ExitTransition = (slideOutVertically { it } + fadeOut()).unless(rememberReducedMotion())

/** The same from the top (an incoming call) */
@Composable
fun dropIn(): EnterTransition = (slideInVertically { -it } + fadeIn()).unless(rememberReducedMotion())

@Composable
fun dropOut(): ExitTransition = (slideOutVertically { -it } + fadeOut()).unless(rememberReducedMotion())

/** A toast banner sliding in at the top */
@Composable
fun toastIn(): EnterTransition = (slideInVertically() + fadeIn()).unless(rememberReducedMotion())

@Composable
fun toastOut(): ExitTransition = (slideOutVertically() + fadeOut()).unless(rememberReducedMotion())
