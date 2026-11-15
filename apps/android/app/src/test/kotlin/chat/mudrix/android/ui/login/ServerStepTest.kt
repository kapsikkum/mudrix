package chat.mudrix.android.ui.login

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The compact server step's rules, like the web's `ServerPicker`/`useHomeserver` */
class ServerStepTest {
    @Test
    fun anAddressWithoutASchemeGetsHttps() {
        assertEquals("https://matrix.org", ServerStep.address("matrix.org"))
        assertEquals("https://matrix.org", ServerStep.address("  matrix.org  "))
        assertEquals("http://10.0.2.2:6167", ServerStep.address("http://10.0.2.2:6167"))
        assertEquals("", ServerStep.address("   "))
    }

    @Test
    fun theHostIsWhatIsShownOnTheFoldedLine() {
        assertEquals("matrix.org", ServerStep.host("matrix.org"))
        assertEquals("matrix.org", ServerStep.host("https://matrix.org"))
        assertEquals("matrix.org", ServerStep.host("https://Matrix.ORG/"))
        assertEquals("10.0.2.2", ServerStep.host("http://10.0.2.2:6167"))
        assertEquals("mozilla.org", ServerStep.host("mozilla.org/some/path"))
        assertEquals("", ServerStep.host(""))
    }

    @Test
    fun thePopularServersAreRecognisedHoweverTheyAreTyped() {
        assertTrue(ServerStep.isPopular("matrix.org"))
        assertTrue(ServerStep.isPopular("https://matrix.org/"))
        assertTrue(ServerStep.isPopular("mozilla.org"))
        assertFalse(ServerStep.isPopular("example.org"))
        assertFalse(ServerStep.isPopular(""))
    }

    @Test
    fun theStatusLineFollowsWhatDiscoveryFound() {
        assertEquals(ServerStep.State.empty, ServerStep.state(" ", checking = true, found = true, notMatrix = true, unreachable = true))
        assertEquals(ServerStep.State.checking, ServerStep.state("matrix.org", checking = true, found = false, notMatrix = false, unreachable = false))
        assertEquals(ServerStep.State.ok, ServerStep.state("matrix.org", checking = false, found = true, notMatrix = false, unreachable = false))
        assertEquals(ServerStep.State.notMatrix, ServerStep.state("example.org", checking = false, found = false, notMatrix = true, unreachable = false))
        assertEquals(ServerStep.State.unreachable, ServerStep.state("nope.invalid", checking = false, found = false, notMatrix = false, unreachable = true))
    }

    @Test
    fun thePopularListIsTheWebs() {
        assertEquals(listOf("https://matrix.org", "https://mozilla.org", "https://unredacted.org"), ServerStep.POPULAR)
    }
}
