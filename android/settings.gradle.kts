// The Android live wallpaper (SPEC §6): the web app in a WebView, drawn onto
// the wallpaper's surface. Build it from the repo root with make android-build.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "wallpapers"
include(":app")
