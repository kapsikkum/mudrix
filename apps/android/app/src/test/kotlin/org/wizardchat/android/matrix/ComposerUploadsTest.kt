package org.wizardchat.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.wizardchat.android.media.CompressTarget

/** [ComposerUploads]: adding, progress, finish, fail, retry, removing while in flight and sending while in flight */
class ComposerUploadsTest {
    private val uploads = ComposerUploads()

    @Test
    fun startsInFlight() {
        val token = uploads.start(1)
        assertEquals(UploadState(UploadStatus.Uploading, 0f), uploads.state(1))
        assertEquals(ComposerUploads.SendPlan.Wait, uploads.plan(1))
        assertTrue(uploads.isCurrent(1, token))
        assertNull(uploads.state(2))
        assertEquals(ComposerUploads.SendPlan.Upload, uploads.plan(2))
    }

    @Test
    fun progressIsRecordedAndClamped() {
        val token = uploads.start(1)
        uploads.progress(1, token, 0.4f)
        assertEquals(UploadState(UploadStatus.Uploading, 0.4f), uploads.state(1))
        uploads.progress(1, token, 2f)
        assertEquals(1f, uploads.state(1)?.progress)
        uploads.progress(1, token, -1f)
        assertEquals(0f, uploads.state(1)?.progress)
    }

    @Test
    fun finishingLetsTheSendReuseIt() {
        val token = uploads.start(1)
        uploads.progress(1, token, 0.7f)
        uploads.finish(1, token)
        assertEquals(UploadState(UploadStatus.Done, 1f), uploads.state(1))
        assertEquals(ComposerUploads.SendPlan.Reuse, uploads.plan(1))
    }

    @Test
    fun failureIsUploadedAtSendOrRetried() {
        val token = uploads.start(1)
        uploads.fail(1, token)
        assertEquals(UploadState(UploadStatus.Failed, 0f), uploads.state(1))
        assertEquals(ComposerUploads.SendPlan.Upload, uploads.plan(1))

        val again = uploads.retry(1)
        assertNotNull(again)
        assertEquals(UploadState(UploadStatus.Uploading, 0f), uploads.state(1))
        assertEquals(ComposerUploads.SendPlan.Wait, uploads.plan(1))
        assertTrue(uploads.isCurrent(1, again!!))
        assertFalse(uploads.isCurrent(1, token))
    }

    @Test
    fun retryOnlyAfterAFailure() {
        val token = uploads.start(1)
        assertNull(uploads.retry(1))
        uploads.finish(1, token)
        assertNull(uploads.retry(1))
        assertNull(uploads.retry(2))
    }

    @Test
    fun lateResultsOfAnOlderAttemptAreIgnored() {
        val first = uploads.start(1)
        uploads.fail(1, first)
        uploads.retry(1)
        uploads.progress(1, first, 0.9f)
        uploads.finish(1, first)
        uploads.fail(1, first)
        assertEquals(UploadState(UploadStatus.Uploading, 0f), uploads.state(1))
        assertEquals(ComposerUploads.SendPlan.Wait, uploads.plan(1))
    }

    @Test
    fun removingWhileInFlightDropsTheUpload() {
        val token = uploads.start(1)
        uploads.progress(1, token, 0.5f)
        uploads.forget(1)
        assertNull(uploads.state(1))
        assertFalse(uploads.isCurrent(1, token))
        assertEquals(ComposerUploads.SendPlan.Upload, uploads.plan(1))
        uploads.finish(1, token)
        assertNull(uploads.state(1))
        assertFalse(uploads.snapshot().containsKey(1))
    }

    @Test
    fun sendingWhileInFlightWaitsAndThenReuses() {
        val token = uploads.start(1)
        uploads.progress(1, token, 0.25f)
        assertEquals(ComposerUploads.SendPlan.Wait, uploads.plan(1))
        uploads.finish(1, token)
        assertEquals(ComposerUploads.SendPlan.Reuse, uploads.plan(1))
    }

    @Test
    fun severalAttachmentsAreTrackedApart() {
        val one = uploads.start(1)
        val two = uploads.start(2)
        uploads.finish(1, one)
        uploads.progress(2, two, 0.5f)
        assertEquals(ComposerUploads.SendPlan.Reuse, uploads.plan(1))
        assertEquals(ComposerUploads.SendPlan.Wait, uploads.plan(2))
        assertEquals(2, uploads.snapshot().size)
    }

    @Test
    fun preuploadRulesMatchTheWeb() {
        val limit = 100L
        // An untouched video or photo goes up as soon as it is added
        assertTrue(canPreupload(50, limit, null, imageWillProcess = false))
        // A video to re-encode or a photo to clean must upload what comes out, at send time
        assertFalse(canPreupload(50, limit, CompressTarget.Fixed(720), imageWillProcess = false))
        assertFalse(canPreupload(50, limit, null, imageWillProcess = true))
        // Something the server would refuse is never uploaded in the background
        assertFalse(canPreupload(150, limit, null, imageWillProcess = false))
        // Exactly at the limit is fine, like the web's `size > maxUploadBytes`
        assertTrue(canPreupload(limit, limit, null, imageWillProcess = false))
    }
}
