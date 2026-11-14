package org.wizardchat.android.matrix

import java.util.Random
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class QrLoginTest {
    /** The modules as a camera would see them: dark on light, scaled up, with a quiet zone */
    private fun picture(modules: Array<BooleanArray>, scale: Int = 6, quiet: Int = 4): Triple<ByteArray, Int, Int> {
        val size = modules.size + quiet * 2
        val width = size * scale
        val luma = ByteArray(width * width) { 255.toByte() }
        for (y in modules.indices) for (x in modules.indices) {
            if (!modules[y][x]) continue
            for (dy in 0 until scale) for (dx in 0 until scale) {
                luma[((y + quiet) * scale + dy) * width + (x + quiet) * scale + dx] = 0
            }
        }
        return Triple(luma, width, width)
    }

    @Test
    fun writesAndReadsBinaryData() {
        // The code of a sign-in starts with MATRIX and a version, then raw bytes
        val data = "MATRIX".toByteArray() + byteArrayOf(3, 2) + ByteArray(96).also { Random(7).nextBytes(it) }
        val modules = QrLogin.modules(data)
        assertNotNull(modules)
        val (luma, width, height) = picture(modules!!)
        assertArrayEquals(data, QrLogin.scan(luma, width, height))
    }

    @Test
    fun readsPaddedRows() {
        val data = ByteArray(40) { (it * 7).toByte() }
        val (luma, width, height) = picture(QrLogin.modules(data)!!)
        val padded = ByteArray((width + 12) * height)
        for (y in 0 until height) System.arraycopy(luma, y * width, padded, y * (width + 12), width)
        assertArrayEquals(data, QrLogin.scan(padded, width, height, rowStride = width + 12))
    }

    @Test
    fun noCodeNoBytes() {
        assertNull(QrLogin.scan(ByteArray(64 * 64) { 200.toByte() }, 64, 64))
    }

    @Test
    fun explainsFailures() {
        assertEquals("auth.qr.codeMismatch", QrLogin.failureKey("wrong check code"))
        assertEquals("auth.qr.failCancelled", QrLogin.failureKey("The other device declined"))
        assertEquals("auth.qr.failExpired", QrLogin.failureKey("request timed out"))
        assertEquals("auth.qr.failInsecure", QrLogin.failureKey("could not establish a secure channel"))
        assertEquals("auth.qr.failUnsupported", QrLogin.failureKey("rendezvous 404"))
        assertEquals("auth.qr.failAlreadySignedIn", QrLogin.failureKey("device already exists"))
        assertEquals("auth.qr.failGeneric", QrLogin.failureKey("boom"))
    }

    @Test
    fun checkCodesHaveTwoDigits() {
        assertEquals("07", QrLogin.checkCodeText(7))
        assertEquals("42", QrLogin.checkCodeText(42))
    }
}
