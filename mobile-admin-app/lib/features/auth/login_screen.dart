import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config/app_config.dart';
import '../../core/theme/app_theme.dart';
import 'auth_controller.dart';
import '../connection/site_screen.dart';
import 'inline_turnstile.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  String? _proof;
  String? _proofOrigin;
  int _verificationAttempt = 0;

  bool get _canLogin {
    final auth = ref.read(authControllerProvider);
    return !auth.busy &&
        auth.captchaRequired != null &&
        (auth.captchaRequired == false ||
            (_proof != null && _proofOrigin == AppConfig.publicBaseUrl));
  }

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    // Keyboard submission follows exactly the same verification gate.
    if (!_canLogin) return;
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    final proof = ref.read(authControllerProvider).captchaRequired == true
        ? _proof!
        : '';
    setState(() => _proof = null);
    await ref
        .read(authControllerProvider.notifier)
        .login(_username.text, _password.text, proof);
    if (mounted) setState(() => _verificationAttempt++);
  }

  Future<void> _openRecovery() async {
    final uri = Uri.tryParse(AppConfig.adminWebUrl);
    if (uri == null || uri.scheme != 'https') {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('尚未配置安全密码恢复页面')));
      return;
    }
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final verificationOrigin = AppConfig.publicBaseUrl;
    final verificationAttempt = _verificationAttempt;
    return Scaffold(
      appBar: AppBar(
        title: Text(AppConfig.publicBaseUrl),
        actions: [if (!auth.busy) const SiteSettingsButton()],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 470),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(26, 30, 26, 26),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Row(
                          children: [
                            _BrandMark(),
                            SizedBox(width: 12),
                            Text(
                              '我的站点管理',
                              style: TextStyle(
                                color: AppTheme.ink,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 38),
                        Text(
                          '回到你的\n青春控制室',
                          style: Theme.of(context).textTheme.headlineLarge,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          '单管理员模式 · 全程 HTTPS · 安全令牌保存在系统密钥库',
                          style: TextStyle(
                            color: AppTheme.ink.withValues(alpha: .58),
                          ),
                        ),
                        const SizedBox(height: 30),
                        TextFormField(
                          controller: _username,
                          keyboardType: TextInputType.emailAddress,
                          autofillHints: const [AutofillHints.username],
                          decoration: const InputDecoration(
                            labelText: '管理员账号',
                            prefixIcon: Icon(Icons.alternate_email_rounded),
                          ),
                          validator: (value) =>
                              value == null || value.trim().isEmpty
                              ? '请输入管理员账号'
                              : null,
                        ),
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: _password,
                          obscureText: _obscure,
                          autofillHints: const [AutofillHints.password],
                          onFieldSubmitted: (_) => _submit(),
                          decoration: InputDecoration(
                            labelText: '密码',
                            prefixIcon: const Icon(Icons.lock_outline_rounded),
                            suffixIcon: IconButton(
                              onPressed: () =>
                                  setState(() => _obscure = !_obscure),
                              icon: Icon(
                                _obscure
                                    ? Icons.visibility_outlined
                                    : Icons.visibility_off_outlined,
                              ),
                            ),
                          ),
                          validator: (value) => value == null || value.isEmpty
                              ? '请输入管理员密码'
                              : null,
                        ),
                        const SizedBox(height: 18),
                        if (auth.captchaRequired == true)
                          KeyedSubtree(
                            key: ValueKey(
                              '${AppConfig.publicBaseUrl}:$_verificationAttempt',
                            ),
                            child: ref.read(inlineVerificationBuilderProvider)(
                              context,
                              (proof) {
                                if (!mounted ||
                                    verificationOrigin !=
                                        AppConfig.publicBaseUrl ||
                                    verificationAttempt !=
                                        _verificationAttempt ||
                                    ref.read(authControllerProvider).busy) {
                                  return;
                                }
                                setState(() {
                                  _proof = proof;
                                  _proofOrigin = proof == null
                                      ? null
                                      : AppConfig.publicBaseUrl;
                                });
                              },
                            ),
                          ),
                        if (auth.captchaRequired == false)
                          const Text('连续两次密码错误后，将要求 Cloudflare 人机验证'),
                        if (auth.captchaRequired == null)
                          TextButton(
                            onPressed: auth.busy
                                ? null
                                : () => ref
                                      .read(authControllerProvider.notifier)
                                      .refreshLoginSecurity(),
                            child: Text(auth.busy ? '正在检查登录要求…' : '重新检查登录要求'),
                          ),
                        if (auth.message != null) ...[
                          const SizedBox(height: 12),
                          Text(
                            auth.message!,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                            ),
                          ),
                        ],
                        const SizedBox(height: 20),
                        FilledButton.icon(
                          onPressed: _canLogin ? _submit : null,
                          icon: auth.busy
                              ? const SizedBox.square(
                                  dimension: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.arrow_forward_rounded),
                          label: Text(auth.busy ? '正在验证…' : '安全登录'),
                        ),
                        const SizedBox(height: 8),
                        TextButton(
                          onPressed: _openRecovery,
                          child: const Text('忘记密码？在浏览器完成人机验证'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 42,
      height: 42,
      decoration: const BoxDecoration(
        color: AppTheme.ink,
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: const Text(
        'MA',
        style: TextStyle(
          color: AppTheme.acid,
          fontWeight: FontWeight.w900,
          fontSize: 12,
        ),
      ),
    );
  }
}
