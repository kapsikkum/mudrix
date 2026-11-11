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

// How messages reach the phone while the app is closed, chosen when building (-Pmudrix.push=...):
//   keepalive    a foreground service keeps the connection open and posts the notifications (default, needs no credentials)
//   unifiedpush  a UnifiedPush distributor delivers them through a Matrix push gateway (PUSH_GATEWAY_URL, or the public one)
//   fcm          Firebase Cloud Messaging through PUSH_GATEWAY_URL; the FIREBASE_* secrets below name the Firebase project
val pushMode: String = (providers.gradleProperty("mudrix.push").orNull ?: "keepalive").trim().lowercase().also {
    require(it in setOf("keepalive", "unifiedpush", "fcm")) { "mudrix.push must be keepalive, unifiedpush or fcm, not '$it'" }
}

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
        buildConfigField("String", "PUSH_MODE", pushMode.asBuildConfigString())
        if (pushMode == "fcm") {
            // The Firebase project's values (Project settings > Your apps); without them FCM stays off at run time
            resValue("string", "google_app_id", buildSecret("FIREBASE_APP_ID"))
            resValue("string", "gcm_defaultSenderId", buildSecret("FIREBASE_SENDER_ID"))
            resValue("string", "google_api_key", buildSecret("FIREBASE_API_KEY"))
            resValue("string", "project_id", buildSecret("FIREBASE_PROJECT_ID"))
        }
    }

    // The flavours only name the store; what delivers notifications is the push mode, whose code lives in
    // src/push-<mode> (nothing from Firebase or UnifiedPush is built into the other modes)
    flavorDimensions += "distribution"
    productFlavors {
        create("gplay") { dimension = "distribution" }
        create("fdroid") { dimension = "distribution" }
    }
    sourceSets {
        listOf("gplay", "fdroid").forEach { flavor ->
            getByName(flavor) {
                manifest.srcFile("src/push-$pushMode/AndroidManifest.xml")
                kotlin.srcDir("src/push-$pushMode/kotlin")
            }
        }
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
    // QR codes for signing in a device: drawing one and reading one from the camera (pure Java, 0.5 MB)
    implementation(libs.zxing.core)
    testImplementation(libs.junit)
    when (pushMode) {
        "fcm" -> implementation(libs.firebase.messaging)
        "unifiedpush" -> implementation(libs.unifiedpush.connector)
    }
}
