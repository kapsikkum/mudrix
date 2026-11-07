package org.wizardchat.android.ui.room

import androidx.compose.animation.core.animate
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.isSpecified
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.unit.IntSize
import kotlin.math.abs
import kotlinx.coroutines.launch

private const val MAX_ZOOM = 6f
private const val DOUBLE_TAP_ZOOM = 2.5f

/**
 * Pinch to zoom, pan while zoomed, double-tap to zoom in on the spot (or back out), and with [onDismiss] a vertical
 * drag at 1x that follows the finger and closes the viewer past a fifth of the height or on a flick. At 1x a
 * sideways drag is left to the pager around it; [onZoomedChange] tells it to stop paging while zoomed.
 *
 * The transform lives in plain state that is only read in the `graphicsLayer` block, so gestures never recompose.
 */
@Composable
internal fun ZoomableBox(
    modifier: Modifier = Modifier,
    onZoomedChange: (Boolean) -> Unit = {},
    onDismissDrag: (Float) -> Unit = {},
    onDismiss: (() -> Unit)? = null,
    onTap: (() -> Unit)? = null,
    onLongPress: (() -> Unit)? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    var dismissY by remember { mutableFloatStateOf(0f) }
    var size by remember { mutableStateOf(IntSize.Zero) }
    val scope = rememberCoroutineScope()
    val slop = LocalViewConfiguration.current.touchSlop
    val currentOnDismiss by rememberUpdatedState(onDismiss)
    val currentOnDismissDrag by rememberUpdatedState(onDismissDrag)
    val currentOnTap by rememberUpdatedState(onTap)
    val currentOnLongPress by rememberUpdatedState(onLongPress)
    val zoomed by remember { derivedStateOf { scale > 1.001f } }
    LaunchedEffect(Unit) { snapshotFlow { zoomed }.collect { onZoomedChange(it) } }

    fun clamp(value: Offset, atScale: Float): Offset {
        val maxX = (size.width * (atScale - 1f) / 2f).coerceAtLeast(0f)
        val maxY = (size.height * (atScale - 1f) / 2f).coerceAtLeast(0f)
        return Offset(value.x.coerceIn(-maxX, maxX), value.y.coerceIn(-maxY, maxY))
    }

    /** The offset that keeps the point under [focus] (from the centre) where it is while scaling to [target] */
    fun zoomAround(focus: Offset, from: Float, to: Float, start: Offset): Offset =
        clamp(focus - (focus - start) * (to / from), to)

    Box(
        modifier
            .clipToBounds()
            .onSizeChanged { size = it }
            .pointerInput(Unit) {
                detectTapGestures(
                    onTap = { currentOnTap?.invoke() },
                    onLongPress = { currentOnLongPress?.invoke() },
                    onDoubleTap = { point ->
                        scope.launch {
                            val from = scale
                            val to = if (from > 1.05f) 1f else DOUBLE_TAP_ZOOM
                            val start = offset
                            val focus = point - Offset(size.width / 2f, size.height / 2f)
                            val end = if (to == 1f) Offset.Zero else zoomAround(focus, from, to, start)
                            animate(0f, 1f, animationSpec = tween(220)) { t, _ ->
                                scale = from + (to - from) * t
                                offset = start + (end - start) * t
                            }
                        }
                    },
                )
            }
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    var dragged = Offset.Zero
                    var decided = false
                    var dismissing = false
                    var velocityY = 0f
                    do {
                        val event = awaitPointerEvent()
                        val pressed = event.changes.count { it.pressed }
                        if (pressed >= 2 || scale > 1.001f) {
                            val zoom = event.calculateZoom()
                            val pan = event.calculatePan()
                            val centroid = event.calculateCentroid(useCurrent = false)
                            if (centroid.isSpecified) {
                                val next = (scale * zoom).coerceIn(1f, MAX_ZOOM)
                                val focus = centroid - Offset(size.width / 2f, size.height / 2f)
                                offset = clamp(focus - (focus - offset) * (next / scale) + pan, next)
                                scale = next
                            }
                            event.changes.forEach { if (it.positionChanged()) it.consume() }
                        } else if (pressed == 1 && currentOnDismiss != null) {
                            val change = event.changes.first { it.pressed }
                            val delta = change.positionChange()
                            dragged += delta
                            if (!decided && dragged.getDistance() > slop) {
                                decided = true
                                dismissing = abs(dragged.y) > abs(dragged.x)
                            }
                            if (dismissing) {
                                dismissY += delta.y
                                velocityY = delta.y
                                currentOnDismissDrag((abs(dismissY) / (size.height * 0.5f).coerceAtLeast(1f)).coerceIn(0f, 1f))
                                change.consume()
                            }
                        }
                    } while (event.changes.any { it.pressed })
                    if (dismissing) {
                        val far = abs(dismissY) > size.height * 0.2f || abs(velocityY) > 40f
                        if (far) {
                            currentOnDismiss?.invoke()
                        } else {
                            val from = dismissY
                            scope.launch {
                                animate(from, 0f, animationSpec = spring()) { value, _ ->
                                    dismissY = value
                                    currentOnDismissDrag((abs(value) / (size.height * 0.5f).coerceAtLeast(1f)).coerceIn(0f, 1f))
                                }
                            }
                        }
                    } else if (scale < 1.02f && scale != 1f) {
                        val from = scale
                        val start = offset
                        scope.launch {
                            animate(from, 1f, animationSpec = spring()) { value, _ ->
                                scale = value
                                offset = clamp(start, value)
                            }
                        }
                    }
                }
            }
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                translationX = offset.x
                translationY = offset.y + dismissY
            },
        contentAlignment = Alignment.Center,
        content = content,
    )
}
