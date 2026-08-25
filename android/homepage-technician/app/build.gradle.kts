plugins {
    id("com.android.application")
}

android {
    namespace = "de.koblenzerpuppenspiele.techniker"
    compileSdk = 36

    defaultConfig {
        applicationId = "de.koblenzerpuppenspiele.techniker"
        minSdk = 24
        targetSdk = 36
        versionCode = 3
        versionName = "0.3.0-local-live"
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            buildConfigField("String", "HOMEPAGE_URL", "\"https://neu.koblenzer-puppenspiele.de/?kp_edit=1\"")
        }
        release {
            isMinifyEnabled = false
            buildConfigField("String", "HOMEPAGE_URL", "\"https://koblenzer-puppenspiele.de/?kp_edit=1\"")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("com.google.ai.edge.litertlm:litertlm-android:0.16.0")
    implementation("com.microsoft.onnxruntime:onnxruntime-android:1.29.0")
    implementation("com.squareup.okhttp3:okhttp:5.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
}
