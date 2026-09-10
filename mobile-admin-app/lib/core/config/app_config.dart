class AppConfig {
  const AppConfig._();

  static const apiBaseUrl = String.fromEnvironment('API_BASE_URL');
  static const updateManifestUrl = String.fromEnvironment(
    'UPDATE_MANIFEST_URL',
  );
  static const githubReleasesUrl = String.fromEnvironment(
    'GITHUB_RELEASES_URL',
  );
  static const adminWebUrl = String.fromEnvironment('ADMIN_WEB_URL');
  static const publicBaseUrl = String.fromEnvironment('PUBLIC_BASE_URL');
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
  static const apiEnvironment = String.fromEnvironment(
    'API_ENVIRONMENT',
    defaultValue: 'development',
  );

  static Uri? get officialWebsiteUri => _httpsUri(publicBaseUrl);

  static Uri? get githubProjectUri {
    final releases = _httpsUri(githubReleasesUrl);
    if (releases == null) return null;
    final segments = [...releases.pathSegments];
    if (segments.isNotEmpty && segments.last == 'releases') {
      segments.removeLast();
    }
    return releases.replace(pathSegments: segments);
  }

  static bool get isConfigured =>
      Uri.tryParse(apiBaseUrl)?.scheme == 'https' &&
      Uri.tryParse(apiBaseUrl)?.host.isNotEmpty == true;

  static Uri? resolvePublicUrl(String value) {
    final direct = Uri.tryParse(value);
    if (direct != null && direct.hasScheme) return direct;
    final base = Uri.tryParse(publicBaseUrl);
    if (base == null || base.scheme != 'https' || base.host.isEmpty) {
      return null;
    }
    return base.resolve(value);
  }

  static Uri? _httpsUri(String value) {
    final uri = Uri.tryParse(value.trim());
    if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) return null;
    return uri;
  }
}
