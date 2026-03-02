# Proguard 混淆规则 - 保持应用所需的类不被混淆

# Capacitor
-keep class com.getcapacitor.** { *; }
-keep public class com.getcapacitor.plugin.** { *; }
-keep class com.getcapacitor.JSObject { *; }
-keep class com.getcapacitor.PluginCall { *; }
-keep class com.getcapacitor.JSArray { *; }
-keep class com.getcapacitor.JSValue { *; }

# Android Core
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keep public class * extends android.app.Activity
-keep public class * extends android.app.Service
-keep public class * extends android.app.BroadcastReceiver
-keep public class * extends android.content.ContentProvider
-keep public class * extends android.view.View
-keep public class * extends android.app.Fragment
-keep public class * extends androidx.fragment.app.Fragment

# WebView
-keep class android.webkit.** { *; }
-keepclassmembers class android.webkit.WebView {
    public *;
}

# Bluetooth
-keep class android.bluetooth.** { *; }
-keep class androidx.bluetooth.** { *; }

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep enums
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Keep Parcelable implementations
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Keep Serializable classes
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# 应用特定类（保持自定义实现）
-keepclassmembers class com.abmate.** { *; }

# BuildConfig
-keep class **.BuildConfig { *; }
-keep class **.R$* { *; }

# Verbose output
-verbose
