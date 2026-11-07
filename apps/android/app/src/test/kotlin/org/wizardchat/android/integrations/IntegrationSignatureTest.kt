package org.wizardchat.android.integrations

import java.security.KeyPairGenerator
import java.security.Signature
import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The signature rules, against the web app's `integrationSignatureFixtures.ts` and the RFC 8032 test vectors */
class IntegrationSignatureTest {
    private fun hex(text: String) = text.chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    private fun b64(bytes: ByteArray) = Base64.getEncoder().encodeToString(bytes)

    private fun flip(bytes: ByteArray, at: Int) = bytes.copyOf().also { it[at] = (it[at].toInt() xor 1).toByte() }

    private fun ok(message: ByteArray, sig: String, key: String) = IntegrationSignature.verifyRepoSignature(message, sig, key) is IntegrationSignature.Check.Ok

    @Test fun rfc8032Vectors() {
        // Test 1: empty message
        assertTrue(Ed25519.verify(
            hex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"),
            ByteArray(0),
            hex("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"),
        ))
        // Test 2: one byte
        assertTrue(Ed25519.verify(
            hex("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c"),
            hex("72"),
            hex("92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00"),
        ))
        // The same signature over another message is refused
        assertTrue(!Ed25519.verify(
            hex("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c"),
            hex("73"),
            hex("92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00"),
        ))
    }

    @Test fun signaturesMadeByTheJdkAreChecked() {
        val message = "{\"schema\":1,\"name\":\"Sample\"}".toByteArray()
        fun pair() = KeyPairGenerator.getInstance("Ed25519").generateKeyPair()
        fun rawPublic(p: java.security.KeyPair): ByteArray {
            // The X.509 encoding ends with the 32 raw bytes
            val encoded = p.public.encoded
            return encoded.copyOfRange(encoded.size - 32, encoded.size)
        }
        val pair = pair()
        val key = b64(rawPublic(pair))
        val sig = Signature.getInstance("Ed25519").run {
            initSign(pair.private)
            update(message)
            sign()
        }
        val sigB64 = b64(sig)
        val c = Checks()
        c.check("sig:good", ok(message, sigB64, key))
        c.check("sig:goodWhitespace", ok(message, "\n $sigB64  \n", key))
        c.check("sig:flippedMessage", !ok(flip(message, 3), sigB64, key))
        c.check("sig:flippedSignature", !ok(message, b64(flip(sig, 10)), key))
        c.check("sig:wrongKey", !ok(message, sigB64, b64(rawPublic(pair()))))
        c.check("sig:truncated", !ok(message, b64(sig.copyOf(63)), key))
        c.check("sig:garbage", !ok(message, "!!not base64!!", key))
        c.check("sig:empty", !ok(message, "", key))
        c.check("key:short", !ok(message, sigB64, b64(ByteArray(31))))
        c.check("key:long", !ok(message, sigB64, b64(ByteArray(33))))
        c.check("key:garbage", !ok(message, sigB64, "garbage"))
        c.done()
    }

    @Test fun fingerprintsAndKeys() {
        val official = OFFICIAL_REPO_KEYS[0]
        val c = Checks()
        c.check("fingerprint:official", IntegrationSignature.fingerprintKey(official) == "080e ffe6 20f6 a24d fdaf de75 dd9b 8e71")
        c.check("fingerprint:format", Regex("^([0-9a-f]{4} ){7}[0-9a-f]{4}$").matches(IntegrationSignature.fingerprintKey(official)))
        c.check("fingerprint:badKey", IntegrationSignature.fingerprintKey("AAAA") == "")
        c.check("base64:strict", IntegrationSignature.base64ToBytes("AAA") == null && IntegrationSignature.base64ToBytes("AA=A") == null)
        c.check("base64:ok", IntegrationSignature.base64ToBytes("AAAA")?.size == 3)
        c.done()
    }

    @Test fun updatesNeedTheSameKeyAndANonDecreasingSerial() {
        val k1 = "AcV0kn9xQsh7H9G76k7cDoJWRAeAjhhqUTnc2hHw85A="
        val k2 = "BBCkDWX+I1E0LatjaZwEUWCdjQG+roO4/udFi4AhyvM="
        val c = Checks()
        c.check("update:higher", IntegrationSignature.checkRepoUpdate(k1, 1, k1, 2) is IntegrationSignature.Check.Ok)
        c.check("update:equal", IntegrationSignature.checkRepoUpdate(k1, 2, k1, 2) is IntegrationSignature.Check.Ok)
        c.check("update:lower", IntegrationSignature.checkRepoUpdate(k1, 3, k1, 2) is IntegrationSignature.Check.Failed)
        val changed = IntegrationSignature.checkRepoUpdate(k1, 1, k2, 9)
        c.check("update:differentKey", changed is IntegrationSignature.Check.Failed && changed.keyChanged)
        c.check("serial:first", IntegrationSignature.checkSerial(null, 1) is IntegrationSignature.Check.Ok)
        c.check("serial:lower", IntegrationSignature.checkSerial(5, 4) is IntegrationSignature.Check.Failed)
        c.check("official:yes", IntegrationSignature.isOfficialKey(OFFICIAL_REPO_KEYS[0]))
        c.check("official:no", !IntegrationSignature.isOfficialKey(k2))
        assertEquals(44, OFFICIAL_REPO_KEYS[0].length)
        c.done()
    }
}
