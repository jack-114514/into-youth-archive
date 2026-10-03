import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/network/api_client.dart';
import '../../core/providers.dart';

enum AuthStatus { checking, signedOut, signedIn }

class AuthState {
  const AuthState({required this.status, this.busy = false, this.message});

  final AuthStatus status;
  final bool busy;
  final String? message;

  AuthState copyWith({AuthStatus? status, bool? busy, String? message}) {
    return AuthState(
      status: status ?? this.status,
      busy: busy ?? this.busy,
      message: message,
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
      state = AuthState(
        status: active ? AuthStatus.signedIn : AuthStatus.signedOut,
      );
    } catch (_) {
      if (generation != _generation) return;
      state = const AuthState(status: AuthStatus.signedOut);
    }
  }

  Future<bool> login(
    String username,
    String password,
    String turnstileToken,
  ) async {
    if (state.busy) return false;
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
      state = AuthState(status: AuthStatus.signedOut, message: error.message);
      return false;
    } catch (_) {
      if (generation != _generation) return false;
      state = const AuthState(
        status: AuthStatus.signedOut,
        message: '登录失败，请稍后重试',
      );
      return false;
    }
  }

  Future<void> logout() async {
    state = state.copyWith(busy: true);
    await ref.read(apiClientProvider).logout();
    state = const AuthState(status: AuthStatus.signedOut);
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);
