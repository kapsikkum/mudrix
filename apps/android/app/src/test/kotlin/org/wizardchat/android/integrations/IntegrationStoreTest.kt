package org.wizardchat.android.integrations

import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.Signature
import java.util.Base64
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.wizardchat.android.integrations.IntegrationNetwork.WireResponse

/** Adding, refreshing, installing and updating a repository end to end, with a repository signed by a throwaway key */
class IntegrationStoreTest {
    private class MemoryStorage : IntegrationStore.Storage {
        val map = HashMap<String, String>()
        override fun get(key: String) = map[key]
        override fun put(key: String, value: String) {
            map[key] = value
        }
    }

    private fun newKey(): KeyPair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair()

    private fun rawKey(pair: KeyPair): String = pair.public.encoded.let { Base64.getEncoder().encodeToString(it.copyOfRange(it.size - 32, it.size)) }

    private fun sign(pair: KeyPair, bytes: ByteArray): String = Base64.getEncoder().encodeToString(
        Signature.getInstance("Ed25519").run {
            initSign(pair.private)
            update(bytes)
            sign()
        },
    )

    private fun repoJson(key: String, serial: Int, insertHost: String = "altersend.example", version: String = "1.0.0") = """{"schema":1,"key":"$key","serial":$serial,"name":"Sample","integrations":[
        {"id":"altersend","name":"AlterSend","description":"Sample","version":"$version","permissions":{
        "linkCards":[{"hosts":["altersend.example"],"pathPrefix":"/pay","title":"Pay"}],
        "composerActions":[{"id":"send","label":"Send","icon":"send","insert":"https://$insertHost/s?room={room}"}]}}]}"""

    /** A server for one repository: repo.json and repo.json.sig, whatever [state] holds right now */
    private class Server(var repo: String, var signature: (ByteArray) -> String) {
        val transport = IntegrationNetwork.Transport { req ->
            val bytes = repo.toByteArray()
            when {
                req.url.endsWith("/repo.json.sig") -> WireResponse(200, mapOf("content-type" to "text/plain"), signature(bytes).byteInputStream())
                req.url.endsWith("/repo.json") -> WireResponse(200, mapOf("content-type" to "text/plain"), bytes.inputStream())
                else -> WireResponse(404, emptyMap(), null)
            }
        }
    }

    private val url = "https://repo.example.com/repo.json"

    @Test fun aSignedRepositoryIsPreviewedPinnedInstalledAndUpdated() = runBlocking {
        val pair = newKey()
        val key = rawKey(pair)
        val server = Server(repoJson(key, 1)) { sign(pair, it) }
        val store = IntegrationStore(MemoryStorage())

        // Step 1 stores nothing
        val preview = (store.previewRepository(url, server.transport) as PreviewResult.Ok).preview
        assertEquals(1, preview.integrationCount)
        assertEquals(IntegrationSignature.fingerprintKey(key), preview.fingerprint)
        assertTrue(!preview.official)
        assertTrue(store.repositories.isEmpty())

        // Step 2 pins the key
        assertTrue(store.confirmRepository(preview) is ActionResult.Ok)
        assertTrue(store.confirmRepository(preview) is ActionResult.Error)
        val offered = store.repositories[0].integrations[0]
        assertTrue(store.install(offered, url, offered.permissions) is ActionResult.Ok)
        assertEquals(mapOf("linkCards" to true, "composerActions" to true), store.grants["altersend"])

        // A narrower approval installs only that
        assertTrue(store.install(offered, url, Permissions(linkCards = offered.permissions.linkCards)) is ActionResult.Ok)
        assertEquals(mapOf("linkCards" to true), store.grants["altersend"])
        assertTrue(store.install(offered.copy(permissions = Permissions(linkCards = offered.permissions.linkCards)), url, offered.permissions) is ActionResult.Error)
        store.install(offered, url, offered.permissions)

        // A refresh that changes where an action points waits for approval and keeps the old one in force
        server.repo = repoJson(key, 2, insertHost = "evil.example")
        assertTrue(store.refreshRepository(url, server.transport) is ActionResult.Ok)
        val pending = store.installed[0].pendingUpdate
        assertTrue(pending != null)
        assertEquals("https://altersend.example/s?room={room}", store.installed[0].permissions.composerActions!![0].insert)
        assertTrue(store.approveUpdate("altersend") is ActionResult.Ok)
        assertEquals("https://evil.example/s?room={room}", store.installed[0].permissions.composerActions!![0].insert)

        // A switched-off capability stays off through an update
        store.setGrant("altersend", Capability.composerActions, false)
        server.repo = repoJson(key, 3, insertHost = "evil.example", version = "1.1.0")
        store.refreshRepository(url, server.transport)
        assertEquals("1.1.0", store.installed[0].version)
        assertEquals(false, store.grants["altersend"]?.get("composerActions"))

        // An older release is refused, and so is a different key
        server.repo = repoJson(key, 2)
        val older = store.refreshRepository(url, server.transport)
        assertTrue(older is ActionResult.Error && older.error.contains("older"))
        val other = newKey()
        server.repo = repoJson(rawKey(other), 9)
        server.signature = { sign(other, it) }
        val changed = store.refreshRepository(url, server.transport)
        assertTrue(changed is ActionResult.Error && changed.error.contains("different signing key"))
        assertTrue(store.repositories[0].keyChanged)
        assertEquals(key, store.repositories[0].key)

        // Removing the repository cuts the integration off from updates but leaves it working
        store.removeRepository(url)
        assertTrue(store.installed[0].sourceGone)
        assertEquals(1, store.installed.size)
        store.uninstall("altersend")
        assertTrue(store.installed.isEmpty() && store.grants.isEmpty())
    }

    @Test fun aTamperedOrUnsignedRepositoryIsRefused() = runBlocking {
        val pair = newKey()
        val key = rawKey(pair)
        val store = IntegrationStore(MemoryStorage())
        val tampered = Server(repoJson(key, 1)) { sign(pair, "something else".toByteArray()) }
        val first = store.previewRepository(url, tampered.transport)
        assertTrue(first is PreviewResult.Error && first.error.contains("tampered"))
        val unsigned = IntegrationNetwork.Transport { req ->
            if (req.url.endsWith(".sig")) WireResponse(404, emptyMap(), null)
            else WireResponse(200, mapOf("content-type" to "application/json"), repoJson(key, 1).byteInputStream())
        }
        val second = store.previewRepository(url, unsigned)
        assertTrue(second is PreviewResult.Error && second.error.contains("not signed"))
        // The repository can only reach its own host
        val third = store.previewRepository("http://repo.example.com/repo.json", unsigned)
        assertTrue(third is PreviewResult.Error)
    }

    @Test fun everythingSurvivesARestart() {
        val storage = MemoryStorage()
        val pair = newKey()
        val key = rawKey(pair)
        val server = Server(repoJson(key, 1)) { sign(pair, it) }
        val first = IntegrationStore(storage)
        runBlocking {
            val preview = (first.previewRepository(url, server.transport) as PreviewResult.Ok).preview
            first.confirmRepository(preview)
        }
        val offered = first.repositories[0].integrations[0]
        first.install(offered, url, offered.permissions)
        first.setSetting("altersend", "none", JsonPrimitive("x"))
        val second = IntegrationStore(storage)
        assertEquals(first.repositories, second.repositories)
        assertEquals(first.installed, second.installed)
        assertEquals(first.grants, second.grants)
        // A damaged file is an empty store, never a crash
        storage.put("integrations.installed", "{not json")
        assertTrue(IntegrationStore(storage).installed.isEmpty())
    }
}
