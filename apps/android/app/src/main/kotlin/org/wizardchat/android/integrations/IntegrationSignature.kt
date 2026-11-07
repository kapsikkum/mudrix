package org.wizardchat.android.integrations

import java.math.BigInteger
import java.security.MessageDigest

/** The official integrations repository, offered by default */
const val OFFICIAL_REPO_URL = "https://github.com/kapsikkum/mudrix-integrations"

/**
 * Ed25519 public keys (standard base64 of the raw 32 bytes) that count as "official". A list so a key can be rotated
 * later; the same keys as the web app's `officialKeys.ts`.
 */
val OFFICIAL_REPO_KEYS: List<String> = listOf("AcV0kn9xQsh7H9G76k7cDoJWRAeAjhhqUTnc2hHw85A=")

/**
 * Repository signatures. repo.json is signed (Ed25519, detached, over its exact bytes) with the key it carries in its
 * own `key` field; that key is pinned per repository by the user on first use, except the official key, which is built
 * in. Nothing here falls back to accepting: any failure is a rejection, and nothing throws.
 *
 * Android only has Ed25519 from API 33 and minSdk is 26, so the check is written out here (RFC 8032, verification only).
 */
object IntegrationSignature {
    const val KEY_BYTES = 32
    const val SIGNATURE_BYTES = 64
    const val MAX_SERIAL = 2147483647L

    sealed interface Check {
        data object Ok : Check
        class Failed(val error: String, val keyChanged: Boolean = false) : Check
    }

    private val B64 = Regex("^[A-Za-z0-9+/]*={0,2}$")

    /** Strict standard base64 (padding required). Null when malformed. */
    fun base64ToBytes(text: String): ByteArray? {
        if (text.length % 4 != 0 || !B64.matches(text)) return null
        return try {
            java.util.Base64.getDecoder().decode(text)
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    /** True when the text is base64 of exactly 32 bytes */
    fun isValidKey(keyB64: String): Boolean = keyB64.length == 44 && base64ToBytes(keyB64)?.size == KEY_BYTES

    /** SHA-256 of the raw key, first 16 bytes as 8 groups of 4 lowercase hex digits; "" if unusable */
    fun fingerprintKey(keyB64: String): String {
        val raw = base64ToBytes(keyB64)?.takeIf { it.size == KEY_BYTES } ?: return ""
        val digest = MessageDigest.getInstance("SHA-256").digest(raw)
        return digest.take(16).joinToString("") { "%02x".format(it) }.chunked(4).joinToString(" ")
    }

    fun verifyRepoSignature(bytes: ByteArray, sigText: String, keyB64: String): Check {
        val key = base64ToBytes(keyB64)
        if (key == null || key.size != KEY_BYTES || keyB64.length != 44) return Check.Failed("The repository carries a malformed signing key.")
        val signature = base64ToBytes(sigText.trim())
        if (signature == null || signature.size != SIGNATURE_BYTES) return Check.Failed("The signature file is malformed.")
        return if (Ed25519.verify(key, bytes, signature)) {
            Check.Ok
        } else {
            Check.Failed("The signature does not match this repository. It may have been tampered with.")
        }
    }

    /** A serial lower than the one already seen is refused (rollback protection) */
    fun checkSerial(prev: Long?, next: Long): Check =
        if (prev != null && next < prev) Check.Failed("This repository is older than the version already seen.") else Check.Ok

    const val KEY_CHANGED_ERROR =
        "This repository now uses a different signing key. Remove it and add it again only if you expected that."

    /** Decides whether a freshly fetched, verified repository may replace the pinned one */
    fun checkRepoUpdate(prevKey: String, prevSerial: Long, nextKey: String, nextSerial: Long): Check {
        if (prevKey != nextKey) return Check.Failed(KEY_CHANGED_ERROR, keyChanged = true)
        return checkSerial(prevSerial, nextSerial)
    }

    fun isOfficialKey(keyB64: String): Boolean = keyB64 in OFFICIAL_REPO_KEYS
}

/** Ed25519 signature verification (RFC 8032, section 5.1.7) with extended coordinates */
internal object Ed25519 {
    private val P = BigInteger.ONE.shiftLeft(255) - BigInteger.valueOf(19)
    private val L = BigInteger.ONE.shiftLeft(252) + BigInteger("27742317777372353535851937790883648493")
    private val D = BigInteger.valueOf(-121665).mod(P) * BigInteger.valueOf(121666).modInverse(P) % P
    private val D2 = D.shiftLeft(1).mod(P)
    private val SQRT_M1 = BigInteger.valueOf(2).modPow((P - BigInteger.ONE).shiftRight(2), P)

    private class Point(val x: BigInteger, val y: BigInteger, val z: BigInteger, val t: BigInteger)

    private val IDENTITY = Point(BigInteger.ZERO, BigInteger.ONE, BigInteger.ONE, BigInteger.ZERO)

    private fun add(a: Point, b: Point): Point {
        val aa = (a.y - a.x).mod(P) * (b.y - b.x).mod(P) % P
        val bb = (a.y + a.x) * (b.y + b.x) % P
        val cc = a.t * D2 % P * b.t % P
        val dd = a.z * b.z % P * BigInteger.valueOf(2) % P
        val e = (bb - aa).mod(P)
        val f = (dd - cc).mod(P)
        val g = (dd + cc) % P
        val h = (bb + aa) % P
        return Point(e * f % P, g * h % P, f * g % P, e * h % P)
    }

    private fun multiply(point: Point, scalar: BigInteger): Point {
        var result = IDENTITY
        var addend = point
        var k = scalar
        while (k.signum() > 0) {
            if (k.testBit(0)) result = add(result, addend)
            addend = add(addend, addend)
            k = k.shiftRight(1)
        }
        return result
    }

    private fun littleEndian(bytes: ByteArray, from: Int, to: Int): BigInteger =
        BigInteger(1, bytes.copyOfRange(from, to).reversedArray())

    private fun decode(bytes: ByteArray): Point? {
        val top = bytes[31].toInt() and 0x80 != 0
        val clear = bytes.copyOf()
        clear[31] = (clear[31].toInt() and 0x7f).toByte()
        val y = littleEndian(clear, 0, 32)
        if (y >= P) return null
        val y2 = y * y % P
        val numerator = (y2 - BigInteger.ONE).mod(P)
        val denominator = (D * y2 + BigInteger.ONE).mod(P)
        val x2 = numerator * denominator.modInverse(P) % P
        var x = x2.modPow((P + BigInteger.valueOf(3)).shiftRight(3), P)
        if ((x * x - x2).mod(P).signum() != 0) x = x * SQRT_M1 % P
        if ((x * x - x2).mod(P).signum() != 0) return null
        if (x.signum() == 0 && top) return null
        if (x.testBit(0) != top) x = P - x
        return Point(x, y, BigInteger.ONE, x * y % P)
    }

    private val BASE: Point by lazy {
        // y = 4/5, x even
        val y = BigInteger.valueOf(4) * BigInteger.valueOf(5).modInverse(P) % P
        val encoded = y.toByteArray().reversedArray().copyOf(32)
        decode(encoded)!!
    }

    private fun sameAs(a: Point, b: Point): Boolean =
        (a.x * b.z - b.x * a.z).mod(P).signum() == 0 && (a.y * b.z - b.y * a.z).mod(P).signum() == 0

    /** True when [signature] (64 bytes) is a valid signature of [message] by [publicKey] (32 bytes) */
    fun verify(publicKey: ByteArray, message: ByteArray, signature: ByteArray): Boolean {
        return try {
            if (publicKey.size != 32 || signature.size != 64) return false
            val a = decode(publicKey) ?: return false
            val r = decode(signature.copyOfRange(0, 32)) ?: return false
            val s = littleEndian(signature, 32, 64)
            if (s >= L) return false
            val sha = MessageDigest.getInstance("SHA-512")
            sha.update(signature, 0, 32)
            sha.update(publicKey)
            sha.update(message)
            val k = BigInteger(1, sha.digest().reversedArray()).mod(L)
            sameAs(multiply(BASE, s), add(r, multiply(a, k)))
        } catch (_: Exception) {
            false
        }
    }
}
