Map<String, String> loginVerificationFields(String proof) {
  if (!proof.startsWith('browser:')) return {'turnstile_token': proof};
  final parts = proof.split(':');
  if (parts.length != 3 ||
      !RegExp(r'^[0-9a-f]{48}$').hasMatch(parts[1]) ||
      !RegExp(r'^[0-9a-f]{64}$').hasMatch(parts[2])) {
    throw const FormatException('验证凭证无效，请重新验证');
  }
  return {'challenge_id': parts[1], 'challenge_secret': parts[2]};
}
