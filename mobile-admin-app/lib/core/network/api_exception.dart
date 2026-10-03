class ApiException implements Exception {
  const ApiException(
    this.message, {
    this.code,
    this.statusCode,
    this.captchaRequired,
  });

  final String message;
  final String? code;
  final int? statusCode;
  final bool? captchaRequired;

  @override
  String toString() => message;
}
