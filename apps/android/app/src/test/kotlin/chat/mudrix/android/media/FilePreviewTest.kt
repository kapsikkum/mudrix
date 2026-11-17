package chat.mudrix.android.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** [FilePreview]: which attachments open in the app and how */
class FilePreviewTest {
    @Test
    fun pdfWinsOverTextRules() {
        assertEquals(FilePreviewKind.pdf, FilePreview.kind("a.pdf", null))
        assertEquals(FilePreviewKind.pdf, FilePreview.kind("scan", "application/pdf"))
        assertEquals(FilePreviewKind.pdf, FilePreview.kind("A.PDF", "text/plain"))
    }

    @Test
    fun textAndMarkdown() {
        assertEquals(FilePreviewKind.text, FilePreview.kind("notes.md", null))
        assertEquals(FilePreviewKind.text, FilePreview.kind("readme.markdown", "application/octet-stream"))
        assertEquals(FilePreviewKind.text, FilePreview.kind("data.csv", null))
        assertEquals(FilePreviewKind.text, FilePreview.kind("blob", "text/plain"))
    }

    @Test
    fun otherFilesAreNotPreviewed() {
        assertNull(FilePreview.kind("a.zip", "application/zip"))
        assertNull(FilePreview.kind("photo.png", "image/png"))
    }

    @Test
    fun textStopsAtTwoMegabytesWithoutHalfACharacter() {
        val bytes = ByteArray(FilePreview.MAX_TEXT_BYTES + 1) { 'a'.code.toByte() }
        assertEquals(FilePreview.MAX_TEXT_BYTES, FilePreview.decodeText(bytes).length)
        val euro = "€".toByteArray()
        val cut = ByteArray(FilePreview.MAX_TEXT_BYTES - 1) { 'a'.code.toByte() } + euro
        assertEquals(FilePreview.MAX_TEXT_BYTES - 1, FilePreview.decodeText(cut).length)
    }

    @Test
    fun pageHeightKeepsTheAspectRatio() {
        assertEquals(1415, FilePreview.pageHeight(1000, 595, 842))
        assertEquals(500, FilePreview.pageHeight(500, 0, 0))
        assertEquals(1, FilePreview.pageHeight(1, 1000, 1))
    }

    @Test
    fun zoomStepsCycle() {
        assertEquals(1.5f, FilePreview.nextZoom(1f), 0f)
        assertEquals(2f, FilePreview.nextZoom(1.5f), 0f)
        assertEquals(3f, FilePreview.nextZoom(2f), 0f)
        assertEquals(1f, FilePreview.nextZoom(3f), 0f)
    }
}
