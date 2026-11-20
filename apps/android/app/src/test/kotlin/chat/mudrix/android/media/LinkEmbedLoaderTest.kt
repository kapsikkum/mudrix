package chat.mudrix.android.media

import chat.mudrix.core.LinkEmbedBlock
import chat.mudrix.core.LinkEmbedButton
import chat.mudrix.core.LinkEmbedCard
import chat.mudrix.core.LinkEmbedMedia
import chat.mudrix.core.LinkEmbedMediaKind
import java.io.IOException
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class LinkEmbedLoaderTest {
    // Real data from embeds.now, as the core hands it over (the X sample)
    private val card = LinkEmbedCard(
        service = "X/Twitter",
        url = "https://x.com/JesseCohenInv/status/2120962452137431338",
        accent = 0x1D9BF0,
        blocks = listOf(
            LinkEmbedBlock.Text(
                "**[Jesse Cohen (@JesseCohenInv)](https://x.com/JesseCohenInv)**\nWhoever made this is a genius\n-# 12 November 2026",
                LinkEmbedMedia("https://pbs.twimg.com/profile_images/966634456911155201/vsMQLdlR_400x400.jpg", LinkEmbedMediaKind.image, "Jesse Cohen"),
            ),
            LinkEmbedBlock.Gallery(listOf(LinkEmbedMedia("https://video.twimg.com/amplify_video/1/vid/a.mp4", LinkEmbedMediaKind.video))),
            LinkEmbedBlock.Separator,
            LinkEmbedBlock.Buttons(listOf(LinkEmbedButton("Open on X", "https://x.com/JesseCohenInv/status/2120962452137431338"))),
        ),
    )

    private fun loader(fetch: suspend (String) -> LinkEmbedCard?) =
        LinkEmbedLoader(CoroutineScope(SupervisorJob() + Dispatchers.Default), 4, fetch)

    @Test
    fun cardTextParsesLikeTheWebCard() {
        val text = card.blocks.filterIsInstance<LinkEmbedBlock.Text>().single()
        val lines = EmbedMarkdown.parse(text.markdown)
        assertEquals(3, lines.size)
        assertTrue(lines[0].spans.single().bold)
        assertTrue(lines[2].small)
    }

    @Test
    fun successIsCachedPerUrl() = runBlocking {
        val calls = AtomicInteger()
        val loader = loader { calls.incrementAndGet(); card }
        assertSame(card, loader.load("https://x.com/a/status/1"))
        assertSame(card, loader.load("https://x.com/a/status/1"))
        assertEquals(1, calls.get())
        assertEquals(true to card, loader.cached("https://x.com/a/status/1"))
        loader.load("https://x.com/a/status/2")
        assertEquals(2, calls.get())
    }

    @Test
    fun noCardIsCachedAsNoCard() = runBlocking {
        val calls = AtomicInteger()
        val loader = loader { calls.incrementAndGet(); null }
        assertNull(loader.load("https://x.com/a/status/1"))
        assertNull(loader.load("https://x.com/a/status/1"))
        assertEquals(1, calls.get())
        assertEquals(true to null, loader.cached("https://x.com/a/status/1"))
    }

    @Test
    fun failureIsThrownAndNeverCached() = runBlocking {
        val calls = AtomicInteger()
        val loader = loader {
            if (calls.incrementAndGet() == 1) throw IOException("offline") else card
        }
        try {
            loader.load("https://x.com/a/status/1")
            fail("expected the failure to be thrown")
        } catch (e: IOException) {
            assertEquals("offline", e.message)
        }
        assertFalse(loader.cached("https://x.com/a/status/1").first)
        assertSame(card, loader.load("https://x.com/a/status/1"))
        assertEquals(2, calls.get())
    }

    @Test
    fun simultaneousLooksShareOneRequest() = runBlocking {
        val calls = AtomicInteger()
        val gate = CompletableDeferred<Unit>()
        val loader = loader { calls.incrementAndGet(); gate.await(); card }
        val looks = List(5) { async(Dispatchers.Default) { loader.load("https://x.com/a/status/1") } }
        gate.complete(Unit)
        assertTrue(looks.awaitAll().all { it === card })
        assertEquals(1, calls.get())
    }

    @Test
    fun theCacheIsBounded() = runBlocking {
        val calls = AtomicInteger()
        val loader = loader { calls.incrementAndGet(); card }
        for (i in 1..6) loader.load("https://x.com/a/status/$i")
        assertFalse(loader.cached("https://x.com/a/status/1").first)
        assertTrue(loader.cached("https://x.com/a/status/6").first)
    }
}
