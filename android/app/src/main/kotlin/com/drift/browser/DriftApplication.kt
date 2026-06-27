package com.drift.browser

import android.app.Application
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings

class DriftApplication : Application() {

    companion object {
        lateinit var geckoRuntime: GeckoRuntime
            private set
    }

    override fun onCreate() {
        super.onCreate()
        val settings = GeckoRuntimeSettings.Builder()
            .aboutConfigEnabled(false)
            .remoteDebuggingEnabled(BuildConfig.DEBUG)
            .consoleOutput(BuildConfig.DEBUG)
            .build()
        geckoRuntime = GeckoRuntime.create(this, settings)
    }
}
