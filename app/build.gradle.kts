plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.windowsfx.launcher"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.windowsfx.launcher"
        minSdk = 26
        targetSdk = 34
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "0.4." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
        // libVLC (video player) ships native code: ARM tablets and phones, plus x86_64 (emulators, Chromebooks)
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64") }
    }

    packaging {
        jniLibs { useLegacyPackaging = true }
    }

    // Fixed key so every new build installs over the previous one without uninstalling.
    signingConfigs {
        create("wfx") {
            storeFile = file("wfx-release.keystore")
            storePassword = "windowsfx2026"
            keyAlias = "windowsfx"
            keyPassword = "windowsfx2026"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("wfx")
        }
        debug {
            signingConfig = signingConfigs.getByName("wfx")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    // Lets the launcher use Android's hidden "launch in freeform window" option (Android 9+).
    implementation("org.lsposed.hiddenapibypass:hiddenapibypass:6.1")
    // Video player engine (LGPL-2.1): plays MKV, AVI, WMV, FLV, TS, MP4, MOV, WebM, AC-3/DTS, subtitles
    implementation("org.videolan.android:libvlc-all:3.6.5")
}
