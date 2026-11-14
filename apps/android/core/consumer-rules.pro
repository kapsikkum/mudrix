# Called from Rust through JNA and JNI
-keep class com.sun.jna.** { *; }
-keep class * implements com.sun.jna.** { *; }
-keep class uniffi.** { *; }
-keep class chat.mudrix.core.CoreInit { *; }
-keep, includedescriptorclasses class org.rustls.platformverifier.** { *; }
