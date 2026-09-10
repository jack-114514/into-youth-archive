import 'package:package_info_plus/package_info_plus.dart';

import 'app_config.dart';

class AppDiagnostics {
  const AppDiagnostics({
    required this.appName,
    required this.version,
    required this.versionCode,
    required this.packageName,
  });

  factory AppDiagnostics.fromPackage(PackageInfo package) => AppDiagnostics(
    appName: package.appName,
    version: package.version,
    versionCode: package.buildNumber,
    packageName: package.packageName,
  );

  final String appName;
  final String version;
  final String versionCode;
  final String packageName;

  String get gitCommit => AppConfig.buildCommit;
  String get buildTime => AppConfig.buildTime;
  String get buildType => AppConfig.buildType;
  String get apiEnvironment => AppConfig.apiEnvironment;

  String toClipboardText() => [
    'App: $appName',
    'Version: $version',
    'Version Code: $versionCode',
    'Package: $packageName',
    'Git Commit: $gitCommit',
    'Build Time: $buildTime',
    'Build Type: $buildType',
    'API Environment: $apiEnvironment',
  ].join('\n');
}
