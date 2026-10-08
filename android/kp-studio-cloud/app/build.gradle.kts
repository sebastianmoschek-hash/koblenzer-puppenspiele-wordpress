plugins { id("com.android.application") }
android {
    namespace = "de.koblenzerpuppenspiele.studiocloud"
    compileSdk = 36
    defaultConfig { applicationId = "de.koblenzerpuppenspiele.studiocloud"; minSdk = 26; targetSdk = 36; versionCode = 1; versionName = "1.0.0-preview" }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
