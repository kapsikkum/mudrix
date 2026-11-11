package org.wizardchat.android.matrix

import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.EncodeHintType
import com.google.zxing.LuminanceSource
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.ResultMetadataType
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import java.io.ByteArrayOutputStream

/** QR codes for signing in a device (MSC4108): the codes are binary, so they are written and read as bytes */
object QrLogin {
    /** The dark modules of the QR code holding `data`, row by row, without a quiet zone */
    fun modules(data: ByteArray): Array<BooleanArray>? = runCatching {
        val hints = mapOf(
            EncodeHintType.CHARACTER_SET to "ISO-8859-1",
            EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.L,
            EncodeHintType.MARGIN to 0,
        )
        val matrix = QRCodeWriter().encode(String(data, Charsets.ISO_8859_1), BarcodeFormat.QR_CODE, 0, 0, hints)
        Array(matrix.height) { y -> BooleanArray(matrix.width) { x -> matrix.get(x, y) } }
    }.getOrNull()

    fun modulesOfBase64(base64: String): Array<BooleanArray>? =
        runCatching { java.util.Base64.getMimeDecoder().decode(base64) }.getOrNull()?.let { modules(it) }

    /** The bytes of a QR code in a camera frame (`luma` is its brightness plane), or null when there is none */
    fun scan(luma: ByteArray, width: Int, height: Int, rowStride: Int = width): ByteArray? {
        // The camera's rows can be longer than the picture; the source takes the full rows and crops
        val source = PlanarYUVLuminanceSource(luma, rowStride, height, 0, 0, width, height, false)
        return read(source)
    }

    fun read(source: LuminanceSource): ByteArray? {
        val hints = mapOf(DecodeHintType.TRY_HARDER to true, DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE))
        val result = try {
            QRCodeReader().decode(BinaryBitmap(HybridBinarizer(source)), hints)
        } catch (_: Exception) {
            return null
        }
        @Suppress("UNCHECKED_CAST")
        val segments = result.resultMetadata?.get(ResultMetadataType.BYTE_SEGMENTS) as? Iterable<ByteArray>
        if (segments != null) {
            val out = ByteArrayOutputStream()
            segments.forEach(out::write)
            if (out.size() > 0) return out.toByteArray()
        }
        return result.text?.toByteArray(Charsets.ISO_8859_1)
    }

    /** The translation key for why a QR sign-in failed, read from the core's message */
    fun failureKey(message: String): String {
        val text = message.lowercase()
        return when {
            Regex("check.?code").containsMatchIn(text) -> "auth.qr.codeMismatch"
            Regex("cancel|declin|denied").containsMatchIn(text) -> "auth.qr.failCancelled"
            Regex("expire|timeout|timed out").containsMatchIn(text) -> "auth.qr.failExpired"
            Regex("insecure|secure channel").containsMatchIn(text) -> "auth.qr.failInsecure"
            Regex("unsupported|not supported|rendezvous|oauth|404").containsMatchIn(text) -> "auth.qr.failUnsupported"
            "already" in text -> "auth.qr.failAlreadySignedIn"
            else -> "auth.qr.failGeneric"
        }
    }

    /** Two digits as the other device shows them */
    fun checkCodeText(code: Long): String = "%02d".format(code)
}
