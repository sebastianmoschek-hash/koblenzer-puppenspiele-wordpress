plugins {
    id("com.android.application")
}

if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "de.koblenzerpuppenspiele.techniker"
    compileSdk = 36

    defaultConfig {
        applicationId = "de.koblenzerpuppenspiele.techniker"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
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
    implementation(platform("com.google.firebase:firebase-bom:34.18.0"))
    implementation("com.google.firebase:firebase-ai")
    implementation("com.google.firebase:firebase-appcheck-playintegrity")
    debugImplementation("com.google.firebase:firebase-appcheck-debug")

    implementation("androidx.core:core-ktx:1.17.0")
    implementation("com.google.ai.edge.litertlm:litertlm-android:0.16.0")
    implementation("com.squareup.okhttp3:okhttp:5.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
}
