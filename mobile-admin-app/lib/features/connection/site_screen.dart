import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_config.dart';
import '../../core/config/site_store.dart';
import '../../core/providers.dart';

class SiteScreen extends ConsumerStatefulWidget {
  const SiteScreen({super.key, this.editing = false});
  final bool editing;
  @override
  ConsumerState<SiteScreen> createState() => _SiteScreenState();
}

class _SiteScreenState extends ConsumerState<SiteScreen> {
  final _form = GlobalKey<FormState>();
  late final _address = TextEditingController(
    text: AppConfig.connection?.origin ?? '',
  );
  late final _update = TextEditingController(
    text: AppConfig.connection?.updateUrl ?? '',
  );
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    _address.dispose();
    _update.dispose();
    super.dispose();
  }

  Future<void> _connect() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final probe = Dio(
      BaseOptions(
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
        followRedirects: false,
      ),
    );
    try {
      final site = SiteConnection.parse(_address.text, updateUrl: _update.text);
      final health = await probe.get<Map<String, dynamic>>(
        '${site.origin}/api/health',
      );
      if (health.data?['ok'] != true) {
        throw const FormatException('该地址没有可用的本站 API');
      }
      // Persistence succeeds before dismantling the active connection.
      await const SiteStore().write(site);
      if (!mounted) return;
      final old = ref.read(apiClientProvider);
      await old.forgetSession();
      if (!mounted) return;
      AppConfig.connection = site;
      if (widget.editing) Navigator.of(context).pop();
      ref.read(siteConnectionProvider.notifier).state = site;
    } catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = error is FormatException
              ? error.message.toString()
              : '连接失败，请检查域名、HTTPS 证书和服务器运行状态';
        });
      }
    } finally {
      probe.close(force: true);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.editing ? '站点设置' : '连接你的站点')),
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Form(
              key: _form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.dns_outlined, size: 52),
                  const SizedBox(height: 20),
                  const Text('填写自己部署的网站域名。管理员账号和内容均由该站点管理。'),
                  const SizedBox(height: 24),
                  TextFormField(
                    controller: _address,
                    keyboardType: TextInputType.url,
                    autocorrect: false,
                    decoration: const InputDecoration(
                      labelText: '网站地址',
                      hintText: 'https://your-domain.com',
                    ),
                    validator: (_) {
                      try {
                        SiteConnection.parse(
                          _address.text,
                          updateUrl: _update.text,
                        );
                        return null;
                      } on FormatException catch (e) {
                        return e.message.toString();
                      }
                    },
                  ),
                  const SizedBox(height: 16),
                  const Text('连接后可直接检查 App 更新，无需填写更新地址。'),
                  ExpansionTile(
                    title: const Text('高级更新设置（通常不用修改）'),
                    initiallyExpanded: _update.text.isNotEmpty,
                    childrenPadding: const EdgeInsets.only(bottom: 16),
                    children: [
                      TextFormField(
                        controller: _update,
                        keyboardType: TextInputType.url,
                        autocorrect: false,
                        decoration: const InputDecoration(
                          labelText: '自定义更新地址（可选）',
                          hintText: '留空使用自动更新',
                          helperText: '仅自建更新服务需要填写；使用本站的 HTTPS 地址。',
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (widget.editing) const Text('保存后会退出当前账号，请重新登录所选站点。'),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text(
                        _error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: _busy ? null : _connect,
                    icon: const Icon(Icons.link),
                    label: Text(_busy ? '正在验证站点…' : '连接并保存'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class SiteSettingsButton extends StatelessWidget {
  const SiteSettingsButton({super.key});
  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: '站点设置',
    icon: const Icon(Icons.dns_outlined),
    onPressed: () => Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const SiteScreen(editing: true)),
    ),
  );
}
