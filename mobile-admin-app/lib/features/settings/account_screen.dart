import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/network/login_verification.dart';
import '../auth/auth_controller.dart';
import '../auth/inline_turnstile.dart';

class AccountScreen extends ConsumerStatefulWidget {
  const AccountScreen({super.key, this.embedded = false});
  final bool embedded;
  @override
  ConsumerState<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends ConsumerState<AccountScreen> {
  final _code = TextEditingController(),
      _password = TextEditingController(),
      _confirmation = TextEditingController();
  final _form = GlobalKey<FormState>();
  String? _verification;
  String _message = '通过人机验证后，向本站管理员邮箱发送验证码。';
  bool _busy = false;
  int _generation = 0;
  @override
  void dispose() {
    _code.dispose();
    _password.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_verification == null) return;
    setState(() => _busy = true);
    try {
      final result = await ref
          .read(apiClientProvider)
          .postJson(
            '/account/recovery/code',
            loginVerificationFields(_verification!),
          );
      if (mounted) {
        setState(() => _message = '验证码已发送至 ${result['email']}，10分钟内有效。');
      }
    } catch (e) {
      if (mounted) setState(() => _message = '发送失败：$e');
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _verification = null;
          _generation++;
        });
      }
    }
  }

  Future<void> _complete() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      await ref.read(apiClientProvider).postJson('/account/recovery/complete', {
        'code': _code.text.trim(),
        'password': _password.text,
      });
      if (!mounted) return;
      _code.clear();
      _password.clear();
      _confirmation.clear();
      await ref.read(authControllerProvider.notifier).passwordChanged();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('密码已更新，请重新登录。所有旧会话已撤销。')));
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) setState(() => _message = '修改失败：$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: widget.embedded ? null : AppBar(title: const Text('账号管理')),
    body: Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(_message),
          const SizedBox(height: 16),
          Text('1. 验证身份并获取验证码', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          KeyedSubtree(
            key: ValueKey(_generation),
            child: ref.watch(inlineVerificationBuilderProvider)(
              context,
              (v) => setState(() => _verification = v),
            ),
          ),
          FilledButton(
            onPressed: _busy || _verification == null ? null : _send,
            child: const Text('发送邮箱验证码'),
          ),
          const SizedBox(height: 20),
          Text('2. 设置新的登录密码', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          TextFormField(
            controller: _code,
            enabled: !_busy,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: '6位邮箱验证码'),
            validator: (v) =>
                RegExp(r'^\d{6}$').hasMatch(v ?? '') ? null : '请输入6位验证码',
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _password,
            enabled: !_busy,
            obscureText: true,
            autocorrect: false,
            enableSuggestions: false,
            decoration: const InputDecoration(labelText: '新密码'),
            validator: (v) => v != null && v.length >= 12 && v.length <= 256
                ? null
                : '新密码须为12到256位',
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _confirmation,
            enabled: !_busy,
            obscureText: true,
            autocorrect: false,
            enableSuggestions: false,
            decoration: const InputDecoration(labelText: '再次输入新密码'),
            validator: (v) => v == _password.text ? null : '两次密码不一致',
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy ? null : _complete,
            child: Text(_busy ? '正在处理…' : '更新密码并撤销旧会话'),
          ),
        ],
      ),
    ),
  );
}
