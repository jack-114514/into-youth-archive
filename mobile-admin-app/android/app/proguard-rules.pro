# Flutter's Dart application code is compiled ahead-of-time. These rules keep
# only the Android entry points that are discovered through reflection or JNI.
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault
-keep class io.flutter.plugins.GeneratedPluginRegistrant { *; }
-keepclasseswithmembers,includedescriptorclasses class * {
    native <methods>;
}

# Plugin-specific consumer rules remain authoritative. Do not suppress all R8
# warnings here: a new missing dependency must fail the release build visibly.
