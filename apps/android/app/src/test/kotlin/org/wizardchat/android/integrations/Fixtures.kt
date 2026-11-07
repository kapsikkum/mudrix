package org.wizardchat.android.integrations

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertTrue

/** Collects named checks, like the web fixtures' `check(name, ok)`, and fails once with every name that did not hold */
class Checks {
    private val failures = mutableListOf<String>()

    fun check(name: String, ok: Boolean) {
        if (!ok) failures += name
    }

    fun done() = assertTrue("failed: $failures", failures.isEmpty())
}

fun json(text: String): JsonElement = Json.parseToJsonElement(text)

fun resource(name: String): String =
    checkNotNull(Checks::class.java.classLoader.getResource(name)) { "missing test resource $name" }.readText()

/** The manifest fixtures dumped from the web app's `tests/integrationManifestFixtures.ts` (`good`, `bad`, `widgets`) */
val manifestFixtures: JsonObject by lazy { json(resource("integration-manifests.json")).jsonObject }

const val KEY = "BBCkDWX+I1E0LatjaZwEUWCdjQG+roO4/udFi4AhyvM="

fun JsonObject.with(vararg pairs: Pair<String, JsonElement>) = JsonObject(this + pairs)

fun str(text: String) = JsonPrimitive(text)

fun arr(vararg items: JsonElement) = JsonArray(items.toList())

/** The same default entry as the web fixtures' `integration()` */
val baseIntegration: JsonObject = json(
    """{"id":"altersend","name":"AlterSend","description":"Sample","version":"1.0.0","permissions":{
    "linkCards":[{"hosts":["altersend.example"],"pathPrefix":"/pay","title":"Pay"}],
    "composerActions":[{"id":"send","label":"Send","icon":"send","insert":"https://altersend.example/s?room={room}"}]}}""",
).jsonObject

fun repoOf(vararg integrations: JsonElement, serial: Int = 1): JsonElement =
    JsonObject(
        mapOf(
            "schema" to JsonPrimitive(1),
            "key" to str(KEY),
            "serial" to JsonPrimitive(serial),
            "name" to str("Sample"),
            "integrations" to JsonArray(integrations.toList()),
        ),
    )

fun manifestWith(permissions: String): RepoManifest {
    val result = IntegrationManifest.validate(repoOf(baseIntegration.with("permissions" to json(permissions))))
    return (result as ValidationResult.Valid).value
}
