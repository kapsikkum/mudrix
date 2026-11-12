package org.wizardchat.android.ui.people

internal object BannerCrop {
    /** The part of a [width] x [height] picture kept for the 3:1 banner, [focus] (0..1, clamped) picking the slice of the axis that overflows */
    fun rect(width: Int, height: Int, focus: Float): CropRect {
        val clamped = focus.coerceIn(0f, 1f)
        val aspect = BANNER_RATIO.toDouble()
        val srcAspect = width.toDouble() / height
        var x = 0
        var y = 0
        var w = width
        var h = height
        if (srcAspect > aspect) {
            w = Math.round(height * aspect).toInt().coerceAtLeast(1)
            x = Math.round((width - w) * clamped)
        } else if (srcAspect < aspect) {
            h = Math.round(width / aspect).toInt().coerceAtLeast(1)
            y = Math.round((height - h) * clamped)
        }
        return CropRect(x, y, w, h)
    }
}
