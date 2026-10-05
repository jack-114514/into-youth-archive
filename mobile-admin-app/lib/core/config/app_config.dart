class SiteConnection {
  const SiteConnection(this.origin, {this.updateUrl = ''});
  final String origin;
  final String updateUrl;

  factory SiteConnection.parse(String address, {String updateUrl = ''}) {
    final raw = address.trim();
    final uri = Uri.tryParse(raw);
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        (uri.path.isNotEmpty && uri.path != '/') ||
        raw.contains('\\') ||
        RegExp(r'\s').hasMatch(raw) ||
        uri.port < 1 ||
        uri.port > 65535) {
      throw const FormatException(
        '请输入完整 HTTPS 域名，如 https://your-domain.com，不包含路径、账号或参数',
      );
    }
    final origin = uri.origin;
    final update = updateUrl.trim();
    if (update.isNotEmpty) {
      final manifest = Uri.tryParse(update);
      if (manifest == null ||
          manifest.scheme != 'https' ||
          manifest.origin != origin ||
          manifest.userInfo.isNotEmpty ||
          manifest.hasFragment ||
          manifest.hasQuery) {
        throw const FormatException('自定义更新地址须为同一站点的 HTTPS 地址；留空使用自动更新');
      }
    }
    return SiteConnection(origin, updateUrl: update);
  }
  String get apiBaseUrl => '$origin/api/v1/admin-app';
}

class AppConfig {
  const AppConfig._();
  static SiteConnection? connection;
  static String get apiBaseUrl => connection?.apiBaseUrl ?? '';
  static String get publicBaseUrl => connection?.origin ?? '';
  static String get adminWebUrl =>
      connection == null ? '' : '${connection!.origin}/admin';
  static String get updateManifestUrl {
    final site = connection;
    if (site == null) return '';
    return site.updateUrl.isEmpty
        ? '${site.origin}/downloads/admin-app/version.json'
        : site.updateUrl;
  }

  static const githubUpdateRepository = String.fromEnvironment(
    'APP_UPDATE_REPOSITORY',
  );
  static String get githubReleasesUrl =>
      RegExp(r'^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')
          .hasMatch(githubUpdateRepository)
      ? 'https://github.com/$githubUpdateRepository/releases/latest'
      : '';
  static bool get isConfigured => connection != null;
  static const buildCommit = String.fromEnvironment(
    'GIT_COMMIT',
    defaultValue: 'development',
  );
  static const buildTime = String.fromEnvironment(
    'BUILD_TIME',
    defaultValue: 'development',
  );
  static const buildType = String.fromEnvironment(
    'BUILD_TYPE',
    defaultValue: 'debug',
  );
  static Uri? resolvePublicUrl(String value) {
    final direct = Uri.tryParse(value);
    if (direct == null) return null;
    if (direct.hasScheme) return direct.scheme == 'https' ? direct : null;
    if (connection == null || value.startsWith('//')) return null;
    return Uri.parse(connection!.origin).resolve(value);
  }
}
