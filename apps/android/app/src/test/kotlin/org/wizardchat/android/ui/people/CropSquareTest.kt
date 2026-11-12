package org.wizardchat.android.ui.people

import org.junit.Assert.assertEquals
import org.junit.Test

class SquareCropTest {
    @Test
    fun aSquareImageKeepsItsSize() {
        assertEquals(SquareCrop(0, 0, 128), squareCrop(128, 128))
    }

    @Test
    fun aWideImageIsCroppedFromTheMiddle() {
        assertEquals(SquareCrop(150, 0, 100), squareCrop(400, 100))
    }

    @Test
    fun aTallImageIsCroppedFromTheMiddle() {
        assertEquals(SquareCrop(0, 105, 90), squareCrop(90, 300))
    }

    @Test
    fun aLargeImageIsCapped() {
        assertEquals(SquareCrop(0, 0, 256), squareCrop(1024, 1024))
    }

    @Test
    fun aSmallImageIsNotUpscaled() {
        assertEquals(SquareCrop(20, 0, 40), squareCrop(80, 40, 256))
    }
}
