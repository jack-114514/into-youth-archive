import 'package:dio/dio.dart';

import '../../core/network/api_exception.dart';

class BrowserChallenge {
  const BrowserChallenge({
    required this.id,
    required this.secret,
    required this.url,
  });
  final String id;
  final String secret;
  final Uri url;
  String get proof => 'browser:$id:$secret';

  factory BrowserChallenge.fromJson(Map<String, dynamic> data, Uri apiBase) {
    final id = data['id'], secret = data['secret'], rawUrl = data['url'];
    if (id is! String ||
        !RegExp(r'^[0-9a-f]{48}$').hasMatch(id) ||
        secret is! String ||
        !RegExp(r'^[0-9a-f]{64}$').hasMatch(secret) ||
        rawUrl is! String) {
      throw const FormatException('验证服务响应无效，请重新验证');
    }
    final url = apiBase.resolve(rawUrl);
    if (url.scheme != 'https' ||
        url.origin != apiBase.origin ||
        url.userInfo.isNotEmpty ||
        url.hasFragment ||
        url.path !=
            '${apiBase.path.replaceAll(RegExp(r'/+$'), '')}/auth/challenge' ||
        url.queryParameters.length != 1 ||
        url.queryParameters['flow'] != id) {
      throw const FormatException('验证地址不安全，已拒绝打开');
    }
    return BrowserChallenge(id: id, secret: secret, url: url);
  }
}

class BrowserChallengeClient {
  BrowserChallengeClient(String baseUrl)
    : apiBase = Uri.parse(baseUrl),
      _dio = Dio(
        BaseOptions(
          baseUrl: baseUrl,
          followRedirects: false,
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 20),
          sendTimeout: const Duration(seconds: 20),
          headers: const {'Accept': 'application/json'},
        ),
      );
  final Uri apiBase;
  final Dio _dio;
  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, String> data,
  ) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(path, data: data);
      return response.data ?? const {};
    } on DioException catch (error) {
      final data = error.response?.data;
      final body = data is Map ? data['error'] : null;
      throw ApiException(
        body is Map
            ? body['message']?.toString() ?? '验证服务暂时不可用'
            : '无法连接验证服务，请检查网络后重试',
      );
    }
  }

  Future<BrowserChallenge> start() async {
    if (apiBase.scheme != 'https' || apiBase.host.isEmpty) {
      throw const FormatException('未配置安全的验证服务');
    }
    return BrowserChallenge.fromJson(
      await _post('/auth/challenge/start', {}),
      apiBase,
    );
  }

  Future<String> status(BrowserChallenge flow) async {
    final result = await _post('/auth/challenge/status', {
      'challenge_id': flow.id,
      'challenge_secret': flow.secret,
    });
    final status = result['status'];
    if (status is! String ||
        !{'pending', 'verified', 'used', 'expired'}.contains(status)) {
      throw const FormatException('验证状态无效，请重新验证');
    }
    return status;
  }

  void close() => _dio.close(force: true);
}
