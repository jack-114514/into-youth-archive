import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../security/token_store.dart';
import 'api_exception.dart';

class ApiClient {
  ApiClient(this._tokenStore)
    : _dio = Dio(
        BaseOptions(
          baseUrl: AppConfig.apiBaseUrl,
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 30),
          sendTimeout: const Duration(seconds: 45),
          headers: const {'Accept': 'application/json'},
        ),
      );

  final TokenStore _tokenStore;
  final Dio _dio;
  SessionTokens? _tokens;
  Future<bool>? _refreshing;

  Future<bool> restoreSession() async {
    _tokens = await _tokenStore.read();
    if (_tokens == null) return false;
    try {
      await getJson('/session', retry: false);
      return true;
    } on ApiException catch (error) {
      if (error.statusCode != 401) rethrow;
      return _refresh();
    }
  }

  Future<void> login(String username, String password) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/login',
        data: {'username': username.trim(), 'password': password},
      );
      await _acceptTokens(response.data ?? const {});
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  Future<void> logout() async {
    try {
      if (_tokens != null) {
        await _dio.post<void>(
          '/auth/logout',
          data: const <String, dynamic>{},
          options: Options(headers: _authorizationHeader()),
        );
      }
    } finally {
      _tokens = null;
      await _tokenStore.clear();
    }
  }

  Future<Map<String, dynamic>> getJson(
    String path, {
    Map<String, dynamic>? query,
    bool retry = true,
  }) => _jsonRequest('GET', path, query: query, retry: retry);

  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body,
  ) => _jsonRequest('POST', path, body: body);

  Future<Map<String, dynamic>> patchJson(
    String path,
    Map<String, dynamic> body,
  ) => _jsonRequest('PATCH', path, body: body);

  Future<Map<String, dynamic>> deleteJson(String path) =>
      _jsonRequest('DELETE', path);

  Future<Map<String, dynamic>> uploadFile(
    File file, {
    required String contentType,
    void Function(int sent, int total)? onProgress,
  }) async {
    final bytes = await file.readAsBytes();
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/uploads',
        data: Stream.fromIterable([bytes]),
        options: Options(
          headers: {
            ..._authorizationHeader(),
            Headers.contentTypeHeader: contentType,
            Headers.contentLengthHeader: bytes.length,
            'X-File-Name': file.uri.pathSegments.last,
          },
        ),
        onSendProgress: onProgress,
      );
      return response.data ?? const {};
    } on DioException catch (error) {
      if (error.response?.statusCode == 401 && await _refresh()) {
        return uploadFile(
          file,
          contentType: contentType,
          onProgress: onProgress,
        );
      }
      throw _mapError(error);
    }
  }

  Future<Map<String, dynamic>> _jsonRequest(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, dynamic>? query,
    bool retry = true,
  }) async {
    try {
      final response = await _dio.request<Map<String, dynamic>>(
        path,
        data: body,
        queryParameters: query,
        options: Options(method: method, headers: _authorizationHeader()),
      );
      return response.data ?? const {};
    } on DioException catch (error) {
      if (retry && error.response?.statusCode == 401 && await _refresh()) {
        return _jsonRequest(
          method,
          path,
          body: body,
          query: query,
          retry: false,
        );
      }
      throw _mapError(error);
    }
  }

  Map<String, String> _authorizationHeader() {
    final token = _tokens?.accessToken;
    return token == null ? const {} : {'Authorization': 'Bearer $token'};
  }

  Future<bool> _refresh() {
    return _refreshing ??= _performRefresh().whenComplete(
      () => _refreshing = null,
    );
  }

  Future<bool> _performRefresh() async {
    final refreshToken = _tokens?.refreshToken;
    if (refreshToken == null) return false;
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refresh_token': refreshToken},
      );
      await _acceptTokens(response.data ?? const {});
      return true;
    } on DioException {
      _tokens = null;
      await _tokenStore.clear();
      return false;
    }
  }

  Future<void> _acceptTokens(Map<String, dynamic> data) async {
    final access = data['access_token'] as String?;
    final refresh = data['refresh_token'] as String?;
    if (access == null ||
        refresh == null ||
        access.isEmpty ||
        refresh.isEmpty) {
      throw const ApiException('服务器没有返回有效的登录令牌');
    }
    _tokens = SessionTokens(accessToken: access, refreshToken: refresh);
    await _tokenStore.write(_tokens!);
  }

  ApiException _mapError(DioException error) {
    final data = error.response?.data;
    if (data is Map) {
      final errorBody = data['error'];
      if (errorBody is Map) {
        return ApiException(
          errorBody['message']?.toString() ?? '请求失败',
          code: errorBody['code']?.toString(),
          statusCode: error.response?.statusCode,
        );
      }
      if (errorBody is String) {
        return ApiException(errorBody, statusCode: error.response?.statusCode);
      }
    }
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.sendTimeout) {
      return const ApiException('连接服务器超时，请稍后重试');
    }
    return ApiException(
      error.response == null ? '无法连接服务器' : '服务器请求失败',
      statusCode: error.response?.statusCode,
    );
  }
}
