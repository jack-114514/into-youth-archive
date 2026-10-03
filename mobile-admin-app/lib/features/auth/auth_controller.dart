import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/network/api_client.dart';
import '../../core/providers.dart';

enum AuthStatus { checking, signedOut, signedIn }

class AuthState {
  const AuthState({
    required this.status,
    this.busy = false,
    this.message,
    this.captchaRequired,
  });

  final AuthStatus status;
  final bool busy;
  final String? message;
  final bool? captchaRequired;

  AuthState copyWith({
    AuthStatus? status,
    bool? busy,
    String? message,
    bool? captchaRequired,
  }) {
    return AuthState(
      status: status ?? this.status,
      busy: busy ?? this.busy,
      message: message,
      captchaRequired: captchaRequired ?? this.captchaRequired,
    );
  }
}

class AuthController extends Notifier<AuthState> {
  int _generation = 0;
  @override
  AuthState build() {
    final client = ref.watch(apiClientProvider);
    final generation = ++_generation;
    Future<void>.microtask(() => _restore(client, generation));
    return const AuthState(status: AuthStatus.checking);
  }

  Future<void> _restore(ApiClient client, int generation) async {
    try {
      final active = await client.restoreSession();
      if (generation != _generation) return;
      if (active) {
        state = const AuthState(status: AuthStatus.signedIn);
      } else {
        final required = await client.loginSecurity();
        if (generation != _generation) return;
        state = AuthState(
          status: AuthStatus.signedOut,
          captchaRequired: required,
        );
      }
    } catch (_) {
      if (generation != _generation) return;
      state = const AuthState(
        status: AuthStatus.signedOut,
        message: '无法读取登录安全要求，请检查网络后重试',
      );
    }
  }

  Future<bool> login(
    String username,
    String password,
    String turnstileToken,
  ) async {
    if (state.busy ||
        state.captchaRequired == null ||
        (state.captchaRequired == true && turnstileToken.isEmpty)) {
      return false;
    }
    final generation = _generation;
    state = state.copyWith(busy: true);
    try {
      await ref
          .read(apiClientProvider)
          .login(username, password, turnstileToken);
      if (generation != _generation) return false;
      state = const AuthState(status: AuthStatus.signedIn);
      return true;
    } on ApiException catch (error) {
      if (generation != _generation) return false;
      state = AuthState(
        status: AuthStatus.signedOut,
        message: error.message,
        captchaRequired:
            error.captchaRequired ??
            (error.code == 'verification_required' ||
                    error.code == 'verification_unavailable'
                ? true
                : state.captchaRequired),
      );
      return false;
    } catch (_) {
      if (generation != _generation) return false;
      state = const AuthState(
        status: AuthStatus.signedOut,
        message: '登录失败，请稍后重试',
      );
      await refreshLoginSecurity();
      return false;
    }
  }

  Future<void> refreshLoginSecurity() async {
    if (state.busy) return;
    final generation = _generation;
    state = state.copyWith(busy: true);
    try {
      final required = await ref.read(apiClientProvider).loginSecurity();
      if (generation != _generation) return;
      state = AuthState(
        status: AuthStatus.signedOut,
        captchaRequired: required,
      );
    } catch (_) {
      if (generation != _generation) return;
      state = const AuthState(
        status: AuthStatus.signedOut,
        message: '无法读取登录安全要求，请检查网络后重试',
      );
    }
  }

  Future<void> logout() async {
    state = state.copyWith(busy: true);
    await ref.read(apiClientProvider).logout();
    state = const AuthState(status: AuthStatus.signedOut);
    await refreshLoginSecurity();
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);
