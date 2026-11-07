package org.wizardchat.android.integrations

import java.io.IOException
import java.net.SocketTimeoutException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.wizardchat.android.integrations.IntegrationNetwork.Expect
import org.wizardchat.android.integrations.IntegrationNetwork.Reason
import org.wizardchat.android.integrations.IntegrationNetwork.WireRequest
import org.wizardchat.android.integrations.IntegrationNetwork.WireResponse

/** The one network class, against the web app's `integrationFetch.test.ts` */
class IntegrationNetworkTest {
    @After fun clearBlocker() = IntegrationNetwork.setPassiveBlocker(null)

    private sealed interface Answer {
        class Response(val make: () -> WireResponse) : Answer
        class Fails(val error: IOException) : Answer
    }

    /** A transport that answers from a script and remembers what it was asked; the last answer repeats */
    private class Scripted(private vararg val answers: Answer) {
        val calls = mutableListOf<WireRequest>()
        val transport = IntegrationNetwork.Transport { req ->
            calls += req
            when (val next = answers[minOf(calls.size - 1, answers.size - 1)]) {
                is Answer.Response -> next.make()
                is Answer.Fails -> throw next.error
            }
        }
    }

    private fun answer(status: Int = 200, type: String? = "application/json", body: ByteArray = ByteArray(0), vararg headers: Pair<String, String>): Answer =
        Answer.Response {
            WireResponse(status, (if (type != null) mapOf("content-type" to type) else emptyMap()) + headers, body.inputStream())
        }

    private fun json(body: String, type: String? = "application/json", vararg headers: Pair<String, String>) = answer(200, type, body.toByteArray(), *headers)

    private fun redirect(location: String?, status: Int = 302) = answer(status, null, ByteArray(0), *(location?.let { arrayOf("location" to it) } ?: emptyArray()))

    private fun req(
        url: String = "https://api.example.com/v1/things",
        allow: List<String> = listOf("api.example.com"),
        expect: Expect = Expect.json,
        maxBytes: Int = IntegrationNetwork.MAX_RESPONSE_BYTES,
        post: Boolean = false,
        jsonBody: String? = null,
        ifNoneMatch: String? = null,
        passive: Boolean = false,
        timeoutMs: Int = 10_000,
    ) = IntegrationNetwork.Request(url, allow, expect, maxBytes, timeoutMs, post, jsonBody, ifNoneMatch, passive)

    private fun fetch(request: IntegrationNetwork.Request, scripted: Scripted) = runBlocking { IntegrationNetwork.fetch(request, scripted.transport) }

    private fun failure(r: IntegrationNetwork.Result) = r as IntegrationNetwork.Failure

    @Test fun onlyHttpsOnAnAllowedHostAndTheDefaultPortIsRequested() {
        val allow = listOf("api.example.com")
        assertTrue(IntegrationNetwork.checkRequestUrl("https://api.example.com/x", allow) is IntegrationNetwork.UrlCheck.Ok)
        assertTrue(IntegrationNetwork.checkRequestUrl("https://API.Example.com/x", allow) is IntegrationNetwork.UrlCheck.Ok)
        val bad = listOf(
            "http://api.example.com/x", "ftp://api.example.com/x", "javascript:alert(1)", "data:application/json,{}",
            "blob:https://api.example.com/1", "wss://api.example.com/x", "//api.example.com/x", "api.example.com/x",
            "https://user@api.example.com/x", "https://user:pw@api.example.com/x", "https://api.example.com:8443/x",
            "https://api.example.com:444/x", "https://other.example.com/x", "https://api.example.com.evil.test/x",
            "https://evil.test/https://api.example.com/x", "https://api.example.com./x", "https://127.0.0.1/x",
            "https://[::1]/x", "https://localhost/x", "https://2130706433/x",
        )
        val accepted = bad.filter { IntegrationNetwork.checkRequestUrl(it, allow) is IntegrationNetwork.UrlCheck.Ok }
        assertTrue("accepted: $accepted", accepted.isEmpty())
        assertTrue(IntegrationNetwork.checkRequestUrl("https://api.example.com/x", emptyList()) is IntegrationNetwork.UrlCheck.Refused)
        assertTrue(IntegrationNetwork.checkRequestUrl("x".repeat(3000), allow) is IntegrationNetwork.UrlCheck.Refused)
    }

    @Test fun localAndPrivateLookingHostsAreNeverAllowedEvenWhenListed() {
        listOf("localhost", "nas.local", "router.lan", "intranet", "10.0.0.1", "192.168.1.1", "169.254.1.1", "[::1]", "1.2.3.4", "a.b.internal", "").forEach {
            assertTrue(it, IntegrationNetwork.isForbiddenHost(it))
        }
        assertTrue(!IntegrationNetwork.isForbiddenHost("api.example.com"))
        assertTrue(IntegrationNetwork.checkRequestUrl("https://10.0.0.1/x", listOf("10.0.0.1")) is IntegrationNetwork.UrlCheck.Refused)
        assertTrue(IntegrationNetwork.checkRequestUrl("https://nas.local/x", listOf("nas.local")) is IntegrationNetwork.UrlCheck.Refused)
    }

    @Test fun aRefusedAddressNeverReachesTheNetwork() {
        val s = Scripted(json("{}"))
        assertEquals(Reason.forbidden, failure(fetch(req(url = "http://api.example.com/x"), s)).reason)
        assertEquals(Reason.forbidden, failure(fetch(req(url = "https://evil.example.net/x"), s)).reason)
        assertEquals(0, s.calls.size)
    }

    @Test fun theRequestCarriesNoCookiesReferrerOrExtraHeaders() {
        val s = Scripted(json("""{"a":1}"""))
        assertTrue(fetch(req(), s) is IntegrationNetwork.Success)
        assertEquals("GET", s.calls[0].method)
        assertNull(s.calls[0].body)
        assertEquals(listOf("Accept"), s.calls[0].headers.keys.toList())
    }

    @Test fun aConfirmedPostSendsExactlyItsJsonBodyAndNothingElse() {
        val s = Scripted(json("""{"url":"https://x.example.com/"}"""))
        assertTrue(fetch(req(post = true, jsonBody = "{\"room\":\"!r:hs\"}"), s) is IntegrationNetwork.Success)
        assertEquals("POST", s.calls[0].method)
        assertEquals("{\"room\":\"!r:hs\"}", s.calls[0].body!!.decodeToString())
        assertEquals(setOf("Accept", "Content-Type"), s.calls[0].headers.keys)
        val bare = Scripted(json("{}"))
        fetch(req(post = true), bare)
        assertEquals("POST", bare.calls[0].method)
        assertNull(bare.calls[0].body)
        assertEquals(listOf("Accept"), bare.calls[0].headers.keys.toList())
        assertTrue(fetch(req(post = true, jsonBody = "x".repeat(70_000)), Scripted(json("{}"))) is IntegrationNetwork.Failure)
    }

    @Test fun onlyAWellFormedEntityTagIsSentAndOnlyOnAGet() {
        assertEquals("\"abc\"", IntegrationNetwork.validEtag("\"abc\""))
        assertEquals("W/\"abc\"", IntegrationNetwork.validEtag("W/\"abc\""))
        assertNull(IntegrationNetwork.validEtag("abc"))
        assertNull(IntegrationNetwork.validEtag("\"a\r\nX: y\""))
        val get = Scripted(json("{}"))
        fetch(req(ifNoneMatch = "\"v1\""), get)
        assertEquals("\"v1\"", get.calls[0].headers["If-None-Match"])
        val bad = Scripted(json("{}"))
        fetch(req(ifNoneMatch = "v1\r\nX: y"), bad)
        assertTrue("If-None-Match" !in bad.calls[0].headers)
        val post = Scripted(json("{}"))
        fetch(req(post = true, ifNoneMatch = "\"v1\""), post)
        assertTrue("If-None-Match" !in post.calls[0].headers)
    }

    @Test fun aRedirectInsideTheAllowListIsFollowedOneOutsideItIsRefused() {
        val ok = Scripted(redirect("/v2/things"), json("""{"moved":true}"""))
        val followed = fetch(req(), ok) as IntegrationNetwork.Success
        assertEquals("https://api.example.com/v2/things", ok.calls[1].url)
        assertEquals("https://api.example.com/v2/things", followed.url)

        val two = Scripted(redirect("https://cdn.example.com/x"), json("""{"cdn":true}"""))
        assertTrue(fetch(req(allow = listOf("api.example.com", "cdn.example.com")), two) is IntegrationNetwork.Success)

        val away = Scripted(redirect("https://evil.example.net/steal"), json("{}"))
        assertEquals(Reason.redirect, failure(fetch(req(), away)).reason)
        assertEquals(1, away.calls.size)
    }

    @Test fun aRedirectToHttpAnotherPortCredentialsOrAnAddressIsRefused() {
        listOf(
            "http://api.example.com/x", "https://api.example.com:8443/x", "https://user:pw@api.example.com/x",
            "https://127.0.0.1/x", "javascript:alert(1)", "data:application/json,{}",
        ).forEach { target ->
            val s = Scripted(redirect(target), json("{}"))
            assertEquals(target, Reason.redirect, failure(fetch(req(), s)).reason)
            assertEquals(target, 1, s.calls.size)
        }
    }

    @Test fun aMissingLocationAPostRedirectAndARedirectLoopAreRefused() {
        assertEquals(Reason.redirect, failure(fetch(req(), Scripted(redirect(null)))).reason)
        val post = Scripted(redirect("/elsewhere", 307), json("{}"))
        assertEquals(Reason.redirect, failure(fetch(req(post = true, jsonBody = "{}"), post)).reason)
        assertEquals(1, post.calls.size)
        val loop = Scripted(redirect("/again"))
        assertEquals(Reason.redirect, failure(fetch(req(), loop)).reason)
        assertEquals(IntegrationNetwork.MAX_REDIRECTS + 1, loop.calls.size)
    }

    @Test fun anAnswerOverTheCapIsRefusedByItsDeclaredLengthAndWhileStreaming() {
        val declared = fetch(req(maxBytes = 100), Scripted(json("""{"a":"x"}""", "application/json", "content-length" to "5000")))
        assertEquals(Reason.tooLarge, failure(declared).reason)
        val streamed = fetch(req(maxBytes = 100), Scripted(json("{\"pad\":\"${"x".repeat(2000)}\"}")))
        assertEquals(Reason.tooLarge, failure(streamed).reason)
        assertTrue(fetch(req(maxBytes = 100), Scripted(json("""{"a":1}"""))) is IntegrationNetwork.Success)
    }

    @Test fun nothingAbove1MBIsAcceptedWhateverTheCallerAsksFor() {
        val body = "{\"pad\":\"${"x".repeat(IntegrationNetwork.MAX_RESPONSE_BYTES + 10)}\"}"
        assertEquals(Reason.tooLarge, failure(fetch(req(maxBytes = IntegrationNetwork.MAX_RESPONSE_BYTES * 10), Scripted(json(body)))).reason)
    }

    @Test fun theAnswerMustBeJsonUnlessARepositoryFileOrASignatureWasAskedFor() {
        val ok = fetch(req(), Scripted(json("""{"a":1}""")))
        assertEquals(JsonObject(mapOf("a" to JsonPrimitive(1))), (ok as IntegrationNetwork.Success).json)
        assertTrue(fetch(req(), Scripted(json("""{"a":1}""", "application/vnd.api+json; charset=utf-8"))) is IntegrationNetwork.Success)
        listOf("text/html", "text/plain", "application/javascript", "image/png", null).forEach { type ->
            assertEquals(type ?: "(none)", Reason.type, failure(fetch(req(), Scripted(json("""{"a":1}""", type)))).reason)
        }
        val file = fetch(req(expect = Expect.jsonFile), Scripted(json("""{"a":1}""", "text/plain; charset=utf-8")))
        assertEquals(JsonObject(mapOf("a" to JsonPrimitive(1))), (file as IntegrationNetwork.Success).json)
        assertEquals(Reason.type, failure(fetch(req(expect = Expect.jsonFile), Scripted(json("""{"a":1}""", "text/html")))).reason)
        val sig = fetch(req(expect = Expect.signature), Scripted(json("c2ln", "text/plain")))
        assertEquals("c2ln", (sig as IntegrationNetwork.Success).text)
        assertEquals(Reason.type, failure(fetch(req(expect = Expect.signature), Scripted(json("""{"a":1}""")))).reason)
    }

    @Test fun aJsonAnswerThatDoesNotParseOrIsNotUtf8IsRefused() {
        assertEquals(Reason.invalid, failure(fetch(req(), Scripted(json("{\"a\":")))).reason)
        assertEquals(Reason.invalid, failure(fetch(req(), Scripted(json("<script>alert(1)</script>")))).reason)
        val latin1 = answer(200, "application/json", byteArrayOf(0x7b, 0x22, 0xe9.toByte(), 0x22, 0x3a, 0x31, 0x7d))
        assertEquals(Reason.invalid, failure(fetch(req(), Scripted(latin1))).reason)
    }

    @Test fun anHttpErrorReportsItsStatusAndA304IsPassedOn() {
        val missing = failure(fetch(req(), Scripted(answer(404, "text/plain", "nope".toByteArray()))))
        assertEquals(404, missing.status)
        assertTrue(missing.error, Regex("api\\.example\\.com answered 404").containsMatchIn(missing.error))
        assertEquals(304, failure(fetch(req(ifNoneMatch = "\"v1\""), Scripted(answer(304, null)))).status)
    }

    @Test fun aRequestThatNeverAnswersTimesOutANetworkErrorSaysSo() {
        assertEquals(Reason.timeout, failure(fetch(req(timeoutMs = 20), Scripted(Answer.Fails(SocketTimeoutException())))).reason)
        val down = failure(fetch(req(), Scripted(Answer.Fails(IOException("Failed to fetch")))))
        assertTrue(down.network)
        assertEquals(Reason.network, down.reason)
    }

    @Test fun requestsNobodyAskedForAreRefusedWhileTheBlockerIsOnAskedOnesAreNot() {
        val s = Scripted(json("""{"a":1}"""))
        IntegrationNetwork.setPassiveBlocker { true }
        assertEquals(Reason.blocked, failure(fetch(req(passive = true), s)).reason)
        assertEquals(0, s.calls.size)
        assertTrue(fetch(req(), s) is IntegrationNetwork.Success)
        IntegrationNetwork.setPassiveBlocker { throw IllegalStateException("boom") }
        assertEquals(Reason.blocked, failure(fetch(req(passive = true), s)).reason)
        IntegrationNetwork.setPassiveBlocker { false }
        assertTrue(fetch(req(passive = true), s) is IntegrationNetwork.Success)
    }
}
