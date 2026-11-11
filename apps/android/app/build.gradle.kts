import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

val packages = rootProject.layout.projectDirectory.dir("../../packages")

// 26.12.2-next.1 -> 26120201, 26.12.2 -> 26120299
val appVersion: String = Regex("\"version\"\\s*:\\s*\"([^\"]+)\"")
    .find(rootProject.file("../../package.json").readText())!!.groupValues[1]
val appVersionCode: Int = Regex("^(\\d+)\\.(\\d+)\\.(\\d+)(?:-next\\.(\\d+))?").find(appVersion)!!
    .destructured.let { (major, minor, patch, next) ->
        major.toInt() * 1_000_000 + minor.toInt() * 10_000 + patch.toInt() * 100 +
            (next.toIntOrNull() ?: 99)
    }

val keystoreProperties = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

// Build-time keys (docs/SECRETS.md): a Gradle property, then an environment variable, then
// apps/android/local.properties (git-ignored). Empty when none is set, which turns the feature off.
fun buildSecret(name: String): String =
    (providers.gradleProperty(name).orNull
        ?: providers.environmentVariable(name).orNull
        ?: localProperties.getProperty(name)
        ?: "").trim()

fun String.asBuildConfigString(): String = "\"" + replace("\\", "\\\\").replace("\"", "\\\"") + "\""

android {
    namespace = "org.wizardchat.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "chat.mudrix.mobile"
        minSdk = 26
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersion

        buildConfigField("String", "GIPHY_API_KEY", buildSecret("GIPHY_API_KEY").asBuildConfigString())
        // Empty means push notifications are not registered (docs/SECRETS.md)
        buildConfigField("String", "PUSH_GATEWAY_URL", buildSecret("PUSH_GATEWAY_URL").asBuildConfigString())
    }

    // gplay pushes through Firebase; fdroid has no Google code (UnifiedPush comes later)
    flavorDimensions += "distribution"
    productFlavors {
        create("gplay") { dimension = "distribution" }
        create("fdroid") { dimension = "distribution" }
    }

    signingConfigs {
        if (!keystoreProperties.isEmpty) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            // Debug builds install next to a release or an older Mudrix instead of replacing it.
            applicationIdSuffix = ".test"
        }
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Without apps/android/keystore.properties: debug-signed, installable but not uploadable
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    // Shared with the other apps: colours (npm run tokens), translations (npm run i18n), icons
    // (npm run icons), sounds (packages/sounds/raw), emoji (npm run emoji) and the release notes (whatsnew/)
    sourceSets["main"].apply {
        kotlin.srcDir(packages.dir("design-tokens/dist/kotlin"))
        res.srcDirs(packages.dir("i18n/dist/android"), packages.dir("icons/dist/android"), packages.dir("sounds"))
        assets.srcDirs(packages.dir("emoji/dist"), packages.dir("../whatsnew"))
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        jniLibs.useLegacyPackaging = false
    }
}

kotlin {
    compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
}

dependencies {
    implementation(project(":core"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.process)
    implementation(libs.navigation.compose)
    implementation(libs.core.ktx)
    implementation(libs.browser)
    implementation(libs.appcompat)
    implementation(libs.livekit.android)
    implementation(libs.media3.exoplayer)
    implementation(libs.media3.ui)
    implementation(libs.media3.transformer)
    implementation(libs.media3.effect)
    testImplementation(libs.junit)
    "gplayImplementation"(libs.firebase.messaging)
}
