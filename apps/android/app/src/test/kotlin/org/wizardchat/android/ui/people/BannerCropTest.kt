package org.wizardchat.android.ui.people

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BannerCropTest {
    @Test
    fun anImageAlreadyAtTheBannerAspectIsKeptWhole() {
        assertEquals(CropRect(0, 0, 1200, 400), BannerCrop.rect(1200, 400, 0.5f))
    }

    @Test
    fun aWideImageIsCroppedLeftAndRight() {
        assertEquals(CropRect(0, 0, 1500, 500), BannerCrop.rect(3000, 500, 0f))
        assertEquals(CropRect(750, 0, 1500, 500), BannerCrop.rect(3000, 500, 0.5f))
        assertEquals(CropRect(1500, 0, 1500, 500), BannerCrop.rect(3000, 500, 1f))
    }

    @Test
    fun aTallImageIsCroppedTopAndBottom() {
        assertEquals(CropRect(0, 0, 900, 300), BannerCrop.rect(900, 1800, 0f))
        assertEquals(CropRect(0, 750, 900, 300), BannerCrop.rect(900, 1800, 0.5f))
        assertEquals(CropRect(0, 1500, 900, 300), BannerCrop.rect(900, 1800, 1f))
    }

    @Test
    fun focusOutsideZeroToOneIsClampedToTheImageEdges() {
        assertEquals(0, BannerCrop.rect(3000, 500, -2f).x)
        assertEquals(1500, BannerCrop.rect(3000, 500, 4f).x)
        assertEquals(0, BannerCrop.rect(900, 1800, -2f).y)
        assertEquals(1500, BannerCrop.rect(900, 1800, 4f).y)
    }

    @Test
    fun theKeptRectangleNeverLeavesTheImage() {
        val sizes = listOf(3 to 1, 333 to 1000, 1000 to 333, 1920 to 1080, 1080 to 1920)
        for ((width, height) in sizes) {
            for (focus in listOf(0f, 0.25f, 0.5f, 0.75f, 1f)) {
                val rect = BannerCrop.rect(width, height, focus)
                assertTrue("negative offset for ${width}x$height at $focus", rect.x >= 0 && rect.y >= 0)
                assertTrue("overflowing width for ${width}x$height at $focus", rect.x + rect.width <= width)
                assertTrue("overflowing height for ${width}x$height at $focus", rect.y + rect.height <= height)
                assertTrue("empty rectangle for ${width}x$height at $focus", rect.width > 0 && rect.height > 0)
            }
        }
    }
}
