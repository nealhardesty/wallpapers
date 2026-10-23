import groovy.json.JsonSlurper
import javax.inject.Inject

plugins {
    id("com.android.application")
}

// One version for everything: the extension's manifest.json. 0.6.0 → 600.
val webVersion = (JsonSlurper().parse(rootProject.file("../web/manifest.json")) as Map<*, *>)["version"] as String
val (major, minor, patch) = webVersion.split(".").map { it.toInt() }

android {
    namespace = "com.roadwaffle.wallpapers"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.roadwaffle.wallpapers"   // permanent after the first release
        minSdk = 26
        targetSdk = 37
        versionCode = major * 10000 + minor * 100 + patch
        versionName = webVersion
    }

    // The release key lives outside the repo (SPEC §6.6). Without these
    // variables the release build is unsigned and make android-release says so.
    val keystore = System.getenv("WALLPAPERS_KEYSTORE")
    signingConfigs {
        if (keystore != null) create("release") {
            storeFile = file(keystore)
            storePassword = System.getenv("WALLPAPERS_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("WALLPAPERS_KEY_ALIAS")
            keyPassword = System.getenv("WALLPAPERS_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (keystore != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.18.0")
}

// web/ becomes the app's assets at build time, never copied into the repo.
// Only what the app needs: no extension or web-app manifest, and no
// developer's local bing.json (the app makes its own, see Web.kt).
abstract class SyncWeb : DefaultTask() {
    @get:InputDirectory abstract val web: DirectoryProperty
    @get:OutputDirectory abstract val out: DirectoryProperty
    @get:Inject abstract val files: FileSystemOperations

    @TaskAction fun sync() {
        files.sync {
            from(web) { exclude("bing.json", "manifest.json", "app.webmanifest") }
            into(out)
        }
    }
}

val syncWeb = tasks.register<SyncWeb>("syncWeb") {
    web.set(rootProject.layout.projectDirectory.dir("../web"))
    out.set(layout.buildDirectory.dir("generated/web"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(syncWeb, SyncWeb::out)
    }
}
