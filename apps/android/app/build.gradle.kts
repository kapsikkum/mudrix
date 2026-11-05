plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

val packages = rootProject.layout.projectDirectory.dir("../../packages")

android {
    namespace = "org.wizardchat.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "org.wizardchat.android"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Until there's a release key: installable release builds for testing
            signingConfig = signingConfigs.getByName("debug")
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
}
