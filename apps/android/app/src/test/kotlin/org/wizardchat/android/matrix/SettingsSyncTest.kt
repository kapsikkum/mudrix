package org.wizardchat.android.matrix

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsSyncTest {
    private fun obj(builder: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit) = buildJsonObject(builder)

    @Test
    fun namesMatchTheWeb() {
        assertEquals("io.github.kapsikkum.mudrix.settings", SettingsSync.SETTINGS_TYPE)
        assertEquals("chat.mudrix.settings", SettingsSync.PREVIOUS_SETTINGS_TYPE)
        assertEquals("org.wizardchat.settings", SettingsSync.WIZARDCHAT_SETTINGS_TYPE)
        assertEquals("io.github.kapsikkum.mudrix.home_order", Namespace.mudrixKey("home_order"))
        assertEquals("org.wizardchat.watch", Namespace.wizardchatKey("watch"))
    }

    @Test
    fun readsTheEarlierMudrixEventFirstThenFallsBack() {
        val previous = obj { put("language", "de") }
        val current = obj { put("language", "fr") }
        val wizardchat = obj { put("language", "en") }
        assertEquals(previous, SettingsSync.pick(mapOf(SettingsSync.PREVIOUS_SETTINGS_TYPE to previous, SettingsSync.SETTINGS_TYPE to current)))
        assertEquals(current, SettingsSync.pick(mapOf(SettingsSync.SETTINGS_TYPE to current, SettingsSync.WIZARDCHAT_SETTINGS_TYPE to wizardchat)))
        assertEquals(wizardchat, SettingsSync.pick(mapOf(SettingsSync.WIZARDCHAT_SETTINGS_TYPE to wizardchat)))
        assertNull(SettingsSync.pick(mapOf(SettingsSync.SETTINGS_TYPE to JsonPrimitive("nope"))))
    }

    @Test
    fun onlyWizardchatSettingsDoNotCountAsSaved() {
        assertFalse(SettingsSync.hasMudrixSettings(mapOf(SettingsSync.WIZARDCHAT_SETTINGS_TYPE to obj { put("language", "en") })))
        assertTrue(SettingsSync.hasMudrixSettings(mapOf(SettingsSync.SETTINGS_TYPE to obj {})))
    }

    @Test
    fun stableIgnoresKeyOrder() {
        val a = obj { put("a", 1); put("b", obj { put("x", true); put("y", "z") }) }
        val b = obj { put("b", obj { put("y", "z"); put("x", true) }); put("a", 1) }
        assertEquals(SettingsSync.stable(a), SettingsSync.stable(b))
    }

    @Test
    fun writesOnlyChangedKeysAndKeepsUnknownOnes() {
        val stored = obj {
            put("theme", "Nord")
            put("keybinds", obj { put("toggleMute", "Ctrl+M") })
            put("preferences", obj { put("uiZoom", 110); put("chatDensity", "default"); put("sendReadReceipts", true) })
        }
        val contents = mapOf(SettingsSync.SETTINGS_TYPE to stored)
        val current = obj {
            put("theme", "Nord")
            put("preferences", obj { put("chatDensity", "default"); put("sendReadReceipts", true) })
        }
        val next = obj {
            put("theme", "Nord")
            put("language", "ja")
            put("preferences", obj { put("chatDensity", "compact"); put("sendReadReceipts", true) })
        }
        val merged = SettingsSync.mergeForWrite(contents, SettingsSync.SETTINGS_TYPE, next, current, writeAll = false)
        assertEquals(JsonPrimitive("Nord"), merged["theme"])
        assertEquals(JsonPrimitive("ja"), merged["language"])
        assertEquals(stored["keybinds"], merged["keybinds"])
        val prefs = merged["preferences"] as JsonObject
        assertEquals(JsonPrimitive(110), prefs["uiZoom"])
        assertEquals(JsonPrimitive("compact"), prefs["chatDensity"])
        assertEquals(JsonPrimitive(true), prefs["sendReadReceipts"])
    }

    @Test
    fun firstSaveWritesEverything() {
        val next = obj { put("theme", "Carbon"); put("preferences", obj { put("showPresence", false) }) }
        val merged = SettingsSync.mergeForWrite(emptyMap(), SettingsSync.SETTINGS_TYPE, next, next, writeAll = true)
        assertEquals(next, merged)
    }

    @Test
    fun aNameNothingIsSavedUnderStartsFromTheOtherOne() {
        val stored = obj { put("theme", "Nord"); put("language", "de") }
        val contents = mapOf(SettingsSync.PREVIOUS_SETTINGS_TYPE to stored)
        val next = obj { put("theme", "Nord"); put("language", "de") }
        val merged = SettingsSync.mergeForWrite(contents, SettingsSync.SETTINGS_TYPE, next, next, writeAll = false)
        assertEquals(stored, merged)
    }
}
