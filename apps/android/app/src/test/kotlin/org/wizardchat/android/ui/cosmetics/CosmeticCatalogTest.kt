package org.wizardchat.android.ui.cosmetics

import org.junit.Assert.assertEquals
import org.junit.Test

class CosmeticCatalogTest {
    @Test
    fun readsNameplates() {
        val plates = CosmeticCatalog.parseNameplates(
            """[{"id":"aurora","name":"Aurora","palette":"teal","file":"assets/nameplates/aurora.svg"},{"id":"../bad","file":"x"},{"name":"no id"}]""",
        )
        assertEquals(listOf(CosmeticCatalog.Nameplate("aurora", "Aurora", "teal", "assets/nameplates/aurora.svg")), plates)
    }

    @Test
    fun readsFramesAndSkipsEmptyOnes() {
        val frames = CosmeticCatalog.parseFrames(
            """[{"id":"vines","name":"Vines","pieces":[{"pos":"top","layer":"front","file":"assets/frames/vines/top-front.svg"}]},{"id":"empty","pieces":[]}]""",
        )
        assertEquals(listOf("vines"), frames.map { it.id })
        assertEquals("cosmetics/frames/vines/top-front.svg", CosmeticCatalog.assetPath(frames[0].pieces[0].file))
    }

    @Test
    fun garbageIsNoCatalog() {
        assertEquals(emptyList<CosmeticCatalog.Nameplate>(), CosmeticCatalog.parseNameplates("nope"))
    }
}
