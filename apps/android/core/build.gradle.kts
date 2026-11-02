// The Rust core (scripts/build-core.sh puts it in src/main/jniLibs and its UniFFI bindings in
// build/generated/uniffi), the runtime and the generated API (src/main/kotlin)
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "org.wizardchat.core"
    compileSdk = 36
    defaultConfig {
        minSdk = 26
        consumerProguardFiles("consumer-rules.pro")
    }
    sourceSets["main"].kotlin.srcDir("build/generated/uniffi")
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
}

/** The native verifier component must be the version the core was built with */
abstract class RustlsVersion : ValueSource<String, RustlsVersion.Params> {
    interface Params : ValueSourceParameters {
        val lockFile: RegularFileProperty
    }

    override fun obtain(): String {
        val lines = parameters.lockFile.get().asFile.readLines()
        val index = lines.indexOfFirst { it.trim() == "name = \"rustls-platform-verifier-android\"" }
        return lines.drop(index + 1).first { it.trimStart().startsWith("version = ") }
            .substringAfter('"').substringBefore('"')
    }
}

val rustlsVersion = providers.of(RustlsVersion::class.java) {
    parameters.lockFile.set(rootProject.layout.projectDirectory.file("../../Cargo.lock"))
}

dependencies {
    api(libs.serialization.json)
    api(libs.coroutines.android)
    implementation("${libs.jna.get()}@aar")
    implementation("org.rustls:rustls-platform-verifier:${rustlsVersion.get()}")
}
