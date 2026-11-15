package chat.mudrix.android.ui.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The About page's update check, like iOS's `AppUpdates` */
class AppUpdatesTest {
    @Test
    fun aVersionLosesItsPrefix() {
        assertEquals("26.12.2", AppUpdates.tidy("v26.12.2"))
        assertEquals("26.12.2", AppUpdates.tidy("V26.12.2"))
        assertEquals("26.12.2", AppUpdates.tidy("  26.12.2  "))
        assertEquals("26.12.3-next.1", AppUpdates.tidy("v26.12.3-next.1"))
    }

    @Test
    fun anyDifferenceIsANewVersion() {
        assertTrue(AppUpdates.isNewer(current = "26.12.2", latest = "26.12.3"))
        assertTrue(AppUpdates.isNewer(current = "26.12.2-next.1", latest = "26.12.2"))
        assertFalse(AppUpdates.isNewer(current = "26.12.2", latest = "v26.12.2"))
    }

    @Test
    fun aReleaseNamesItsVersionInTheTagOrTheName() {
        assertEquals("26.12.2", AppUpdates.latestVersion("""{"tag_name":"v26.12.2","name":"Mudrix 26.12.2"}"""))
        assertEquals("26.12.2", AppUpdates.latestVersion("""{"tag_name":"","name":"v26.12.2"}"""))
        assertEquals("26.12.2", AppUpdates.latestVersion("""{"name":"26.12.2"}"""))
    }

    @Test
    fun anAnswerWithoutAVersionIsNoAnswer() {
        assertNull(AppUpdates.latestVersion("not json"))
        assertNull(AppUpdates.latestVersion("""{"tag_name":""}"""))
        assertNull(AppUpdates.latestVersion("""{"tag_name":null,"name":5}"""))
        assertNull(AppUpdates.latestVersion("[]"))
    }

    @Test
    fun theCheckLinksTheLatestRelease() {
        assertEquals("https://github.com/kapsikkum/mudrix/releases/latest", AppUpdates.RELEASES_URL)
        assertEquals("https://api.github.com/repos/kapsikkum/mudrix/releases/latest", AppUpdates.LATEST_RELEASE_API)
    }

    @Test
    fun theStatesCarryTheNewVersion() {
        assertEquals(AppUpdateState.Available("26.12.3"), AppUpdateState.Available("26.12.3"))
        assertEquals(AppUpdateState.UpToDate, AppUpdateState.UpToDate)
        assertEquals(AppUpdateState.Idle, AppUpdateState.Idle)
    }
}
