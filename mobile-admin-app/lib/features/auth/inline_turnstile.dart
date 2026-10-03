import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import '../../core/config/app_config.dart';
import '../../core/network/api_exception.dart';
import 'browser_challenge.dart';

typedef InlineVerificationBuilder =
    Widget Function(BuildContext context, ValueChanged<String?> onVerified);

final inlineVerificationBuilderProvider = Provider<InlineVerificationBuilder>(
  (ref) => (context, onVerified) => InlineTurnstile(onVerified: onVerified),
);

/// Allows Cloudflare's internal documents while restricting top-level pages.
bool allowVerificationNavigation(Uri url, Uri challenge, bool mainFrame) {
  if (url.toString() == 'about:blank' || url.toString() == 'about:srcdoc') {
    return true;
  }
  if (url.scheme != 'https' || url.userInfo.isNotEmpty) return false;
  if (!mainFrame && url.host == 'challenges.cloudflare.com') return true;
  return url.origin == challenge.origin &&
      url.path == challenge.path &&
      url.queryParameters['flow'] == challenge.queryParameters['flow'] &&
      url.queryParameters['inline'] == '1';
}

class InlineTurnstile extends StatefulWidget {
  const InlineTurnstile({super.key, required this.onVerified});
  final ValueChanged<String?> onVerified;
  @override
  State<InlineTurnstile> createState() => _InlineTurnstileState();
}

class _InlineTurnstileState extends State<InlineTurnstile> {
  late final BrowserChallengeClient _client;
  WebViewController? _controller;
  BrowserChallenge? _flow;
  Timer? _expiry;
  Timer? _loadingDeadline;
  int _generation = 0;
  bool _checking = false, _verified = false;
  String? _error;
  double _height = 124;

  @override
  void initState() {
    super.initState();
    _client = BrowserChallengeClient(AppConfig.apiBaseUrl);
    unawaited(_start());
  }

  Future<void> _start() async {
    final generation = ++_generation;
    _expiry?.cancel();
    _loadingDeadline?.cancel();
    setState(() {
      _flow = null;
      _controller = null;
      _verified = false;
      _error = null;
      _height = 124;
    });
    try {
      final flow = await _client.start();
      if (!mounted || generation != _generation) return;
      final url = flow.url.replace(
        queryParameters: {...flow.url.queryParameters, 'inline': '1'},
      );
      final controller = WebViewController();
      await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
      await controller.setBackgroundColor(const Color(0xfff7faf7));
      await controller.addJavaScriptChannel(
        'IntoTurnstile',
        onMessageReceived: (message) => _message(message.message, generation),
      );
      await controller.setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            final target = Uri.tryParse(request.url);
            return target != null &&
                    allowVerificationNavigation(target, url, request.isMainFrame)
                ? NavigationDecision.navigate
                : NavigationDecision.prevent;
          },
          onWebResourceError: (error) {
            if (error.isForMainFrame == true && generation == _generation) {
              _fail('验证框加载失败，请检查网络后重试');
            }
          },
        ),
      );
      // The Android plugin enables DOM storage. Keep the default user agent and
      // persistent cookie store; Cloudflare needs its own third-party cookies.
      if (controller.platform is AndroidWebViewController) {
        final cookies = WebViewCookieManager();
        if (cookies.platform is AndroidWebViewCookieManager) {
          await (cookies.platform as AndroidWebViewCookieManager)
              .setAcceptThirdPartyCookies(
                controller.platform as AndroidWebViewController,
                true,
              );
        }
      }
      if (!mounted || generation != _generation) return;
      setState(() {
        _flow = flow;
        _controller = controller;
      });
      await controller.loadRequest(url);
      _loadingDeadline = Timer(const Duration(seconds: 90), () {
        if (mounted && generation == _generation && !_verified) {
          _fail('人机验证尚未完成，请在下方重试；若持续失败，请更新 Android System WebView');
        }
      });
    } catch (error) {
      if (mounted && generation == _generation) {
        _fail(error is ApiException ? error.message : '无法加载人机验证，请重试');
      }
    }
  }

  void _message(String raw, int generation) {
    if (!mounted || generation != _generation || raw.length > 4096) return;
    try {
      final data = jsonDecode(raw);
      if (data is! Map || data['flow'] != _flow?.id) return;
      if (data['type'] == 'resize' && data['height'] is num) {
        final height = (data['height'] as num).toDouble().clamp(110.0, 420.0);
        if ((_height - height).abs() > 1) setState(() => _height = height);
      } else if (data['type'] == 'success') {
        unawaited(_confirm(generation));
      } else if (data['type'] == 'expired') {
        _fail('人机验证已过期，请重新验证');
      } else if (data['type'] == 'error') {
        final code = data['code']?.toString() ?? '';
        _fail('Cloudflare 验证未完成${code.isEmpty ? '' : '（$code）'}，请重试');
      }
    } on FormatException {
      // Malformed messages cannot enable password submission.
    }
  }

  Future<void> _confirm(int generation) async {
    final flow = _flow;
    if (flow == null || _checking || _verified) return;
    _checking = true;
    try {
      // A JavaScript callback alone cannot unlock login: the server must have
      // completed Siteverify for the App's secret-bound session.
      final state = await _client.status(flow);
      if (!mounted || generation != _generation) return;
      if (state != 'verified') {
        _fail('验证尚未通过或已失效，请重新验证');
        return;
      }
      _loadingDeadline?.cancel();
      setState(() {
        _verified = true;
        _error = null;
      });
      widget.onVerified(flow.proof);
      _expiry = Timer(const Duration(minutes: 4), () {
        if (mounted && generation == _generation) {
          _fail('人机验证已过期，请重新验证');
        }
      });
    } catch (_) {
      if (mounted && generation == _generation) {
        _fail('无法确认验证结果，请重新验证');
      }
    } finally {
      _checking = false;
    }
  }

  void _fail(String message) {
    if (!mounted) return;
    _expiry?.cancel();
    _loadingDeadline?.cancel();
    setState(() {
      _verified = false;
      _error = message;
    });
    widget.onVerified(null);
  }

  @override
  void dispose() {
    ++_generation;
    _expiry?.cancel();
    _loadingDeadline?.cancel();
    _client.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Text('Cloudflare 人机验证'),
      const SizedBox(height: 8),
      if (_controller != null)
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: SizedBox(
            height: _height,
            child: WebViewWidget(controller: _controller!),
          ),
        )
      else if (_error == null)
        const SizedBox(
          height: 90,
          child: Center(child: CircularProgressIndicator()),
        ),
      if (_error != null)
        Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
      if (_error != null)
        TextButton(
          onPressed: () {
            widget.onVerified(null);
            unawaited(_start());
          },
          child: const Text('重新加载验证'),
        ),
    ],
  );
}
