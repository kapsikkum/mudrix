package org.wizardchat.android.ui.people

import org.junit.Assert.assertEquals
import org.junit.Test

class ProfileBannerTest {
    @Test
    fun widePictureIsCroppedToThreeToOneFromTheMiddle() {
        assertEquals(CropRect(0, 100, 1500, 500), bannerCropRect(1500, 700))
    }

    @Test
    fun tallPictureKeepsTheFullWidth() {
        assertEquals(CropRect(0, 450, 900, 300), bannerCropRect(900, 1200))
    }

    @Test
    fun alreadyThreeToOneIsKept() {
        assertEquals(CropRect(0, 0, 600, 200), bannerCropRect(600, 200))
    }

    @Test
    fun veryNarrowPictureStillGivesAPixel() {
        val rect = bannerCropRect(1, 1)
        assertEquals(1, rect.width)
        assertEquals(1, rect.height)
    }
}
