# GeckoView — keep all Mozilla classes
-keep class org.mozilla.geckoview.** { *; }
-dontwarn org.mozilla.geckoview.**

# Keep our application class
-keep class com.drift.browser.** { *; }

# Standard Android rules
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
