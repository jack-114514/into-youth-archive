# Android Release build environment

This file records the pinned and verified environment for the first stable
Android release candidate. Runtime URLs and secrets are provided at build time
and are intentionally not recorded here.

## Host

- Operating system: Microsoft Windows 10, build 10.0.19045.6466, x64
- Shell: Windows PowerShell
- Project: `mobile-admin-app`

## Flutter and Dart

- Flutter: 3.47.0 (stable), revision `4cf2416426`
- Dart: 3.13.0
- DevTools: 2.60.0
- Flutter SDK: `<flutter-sdk>`
- Flutter SDK archive SHA-256: `9f96d393cdfad05bea0b4b42c603ffda027af11adadc8e4cf3ac87e49110c1ca`

## Java and Gradle

- JDK: Microsoft OpenJDK 17.0.20+8 LTS, x64
- Java language and bytecode target: 17
- Gradle Wrapper: 9.3.1
- Gradle distribution: `gradle-9.3.1-all.zip`
- Gradle distribution SHA-256: `17f277867f6914d61b1aa02efab1ba7bb439ad652ca485cd8ca6842fccec6e43`
- Android Gradle Plugin: 9.1.0
- Kotlin Gradle Plugin: 2.4.0

## Android SDK

- Android SDK root: `<android-sdk>`
- Compile SDK: Android API 36
- Target SDK: Android API 36
- Minimum SDK: Android API 24
- Android SDK platforms installed: 34, 35, 36, 37
- Android Build Tools used: 36.0.0
- Android NDK: 28.2.13676358
- Android command-line tools channel: latest

## Reproducible build inputs

- App version: 1.0.0
- Version code: 1
- Release runtime values are injected with `--dart-define`.
- Required definitions: `API_BASE_URL`, `UPDATE_MANIFEST_URL`,
  `GITHUB_RELEASES_URL`, `ADMIN_WEB_URL`, `PUBLIC_BASE_URL`, `GIT_COMMIT`,
  `BUILD_TIME`, and `BUILD_TYPE`.
- Release signing is loaded from ignored `android/key.properties`.
- The keystore is stored outside the Git working tree.
- R8 minification and Android resource shrinking are enabled for release builds.
- Gradle verifies its distribution using `distributionSha256Sum` in
  `android/gradle/wrapper/gradle-wrapper.properties`.

## Verification baseline

- Gradle 9.3.1 distribution checksum: verified.
- Initial Android debug APK build: passed on 2026-08-15.
- Initial debug APK SHA-256:
  `b0eaac580fe30b8e829c4f3a69dbe20cce7ccd6a5af3d3bab7424ef0bf9b12c8`.
- Release APK, signing certificate, R8 mapping, and final SHA-256 are generated
  by the release procedure and recorded in the release manifest.

## Build command template

```powershell
flutter build apk --release `
  --build-name=1.0.0 `
  --build-number=1 `
  --dart-define=API_BASE_URL=https://example.invalid/api/v1/admin-app `
  --dart-define=UPDATE_MANIFEST_URL=https://example.invalid/downloads/admin-app/version.json `
  --dart-define=GITHUB_RELEASES_URL=https://github.com/example/example/releases `
  --dart-define=ADMIN_WEB_URL=https://example.invalid/admin `
  --dart-define=PUBLIC_BASE_URL=https://example.invalid `
  --dart-define=GIT_COMMIT=<full-commit-sha> `
  --dart-define=BUILD_TIME=<UTC-ISO-8601> `
  --dart-define=BUILD_TYPE=release
```

The example domains above are placeholders. Production values are supplied by
the private release pipeline and must not be committed to the public repository.
