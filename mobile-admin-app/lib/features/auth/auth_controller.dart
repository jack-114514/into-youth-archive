import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
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
  @override
  AuthState build() {
    Future<void>.microtask(_restore);
    return const AuthState(status: AuthStatus.checking);
  }

  Future<void> _restore() async {
    try {
      final active = await ref.read(apiClientProvider).restoreSession();
      state = AuthState(
        status: active ? AuthStatus.signedIn : AuthStatus.signedOut,
      );
    } catch (_) {
      state = const AuthState(status: AuthStatus.signedOut);
    }
  }

  Future<bool> login(String username, String password) async {
    state = state.copyWith(busy: true);
    try {
      await ref.read(apiClientProvider).login(username, password);
      state = const AuthState(status: AuthStatus.signedIn);
      return true;
    } on ApiException catch (error) {
      state = AuthState(status: AuthStatus.signedOut, message: error.message);
      return false;
    } catch (_) {
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
