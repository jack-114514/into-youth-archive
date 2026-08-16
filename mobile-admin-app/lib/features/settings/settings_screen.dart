import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config/app_config.dart';
import '../../core/network/api_exception.dart';
import '../../core/platform/system_settings.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/update/update_service.dart';
import 'about_app_card.dart';
import 'permissions_screen.dart';

final settingsProvider = FutureProvider.autoDispose<Map<String, dynamic>>((
  ref,
) async {
  final data = await ref.watch(apiClientProvider).getJson('/settings');
  return (data['settings'] as Map?)?.cast<String, dynamic>() ?? const {};
});

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key, this.onVersionTap});

  final VoidCallback? onVersionTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);
    return settings.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text(error.toString())),
      data: (data) => _SettingsForm(initial: data, onVersionTap: onVersionTap),
    );
  }
}

class _SettingsForm extends ConsumerStatefulWidget {
  const _SettingsForm({required this.initial, this.onVersionTap});

  final Map<String, dynamic> initial;
  final VoidCallback? onVersionTap;

  @override
  ConsumerState<_SettingsForm> createState() => _SettingsFormState();
}

class _SettingsFormState extends ConsumerState<_SettingsForm> {
  late final TextEditingController _siteTitle;
  late final TextEditingController _heroTitle;
  late final TextEditingController _profile;
  late final TextEditingController _timeline;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _siteTitle = TextEditingController(
      text: widget.initial['site_title']?.toString() ?? '',
    );
    _heroTitle = TextEditingController(
      text: widget.initial['hero_title']?.toString() ?? '',
    );
    _profile = TextEditingController(
      text: widget.initial['profile_text']?.toString() ?? '',
    );
    _timeline = TextEditingController(
      text: widget.initial['timeline_items']?.toString() ?? '[]',
    );
  }

  @override
  void dispose() {
    _siteTitle.dispose();
    _heroTitle.dispose();
    _profile.dispose();
    _timeline.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await ref.read(apiClientProvider).patchJson('/settings', {
        'site_title': _siteTitle.text,
        'hero_title': _heroTitle.text,
        'profile_text': _profile.text,
        'timeline_items': _timeline.text,
      });
      ref.invalidate(settingsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('网站设置已保存')));
      }
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _openAccountSecurity() async {
    final uri = Uri.tryParse(AppConfig.adminWebUrl);
    if (uri == null || uri.scheme != 'https') return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _openPermissions() {
    Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => const PermissionsScreen()));
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 40),
      children: [
        Text('系统设置', style: Theme.of(context).textTheme.headlineLarge),
        const SizedBox(height: 8),
        Text(
          '这里只允许修改服务端白名单中的展示内容。',
          style: TextStyle(color: AppTheme.ink.withValues(alpha: .58)),
        ),
        const SizedBox(height: 22),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('网站文字', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 16),
                TextField(
                  controller: _siteTitle,
                  decoration: const InputDecoration(labelText: '网站名称'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _heroTitle,
                  decoration: const InputDecoration(labelText: '首页标题'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _profile,
                  minLines: 4,
                  maxLines: 8,
                  decoration: const InputDecoration(labelText: '个人简介'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _timeline,
                  minLines: 5,
                  maxLines: 10,
                  decoration: const InputDecoration(
                    labelText: '青春时间线 JSON',
                    helperText: '保留现有字段结构；后续补丁将升级为逐条编辑器',
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_outlined),
                  label: Text(_saving ? '正在保存…' : '保存网站设置'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Card(
          child: ListTile(
            contentPadding: const EdgeInsets.all(18),
            leading: const Icon(Icons.verified_user_outlined),
            title: const Text(
              '账号安全',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            subtitle: const Text('通过 Cloudflare 人机验证与邮箱验证码修改密码'),
            trailing: const Icon(Icons.open_in_new_rounded),
            onTap: _openAccountSecurity,
          ),
        ),
        const SizedBox(height: 14),
        Card(
          child: ListTile(
            contentPadding: const EdgeInsets.all(18),
            leading: const Icon(Icons.admin_panel_settings_outlined),
            title: const Text(
              '权限管理',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            subtitle: const Text('查看网络、图片、视频和文件存储用途'),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: _openPermissions,
          ),
        ),
        const SizedBox(height: 14),
        const _UpdateCard(),
        const SizedBox(height: 14),
        AboutAppCard(onVersionTap: widget.onVersionTap),
      ],
    );
  }
}

class _UpdateCard extends StatefulWidget {
  const _UpdateCard();

  @override
  State<_UpdateCard> createState() => _UpdateCardState();
}

class _UpdateCardState extends State<_UpdateCard> {
  bool _busy = false;
  double? _progress;
  String _message = '检查服务器 version.json，并校验 APK SHA-256';

  Future<bool> _ensureInstallPermission() async {
    final allowed = await SystemSettings.canRequestPackageInstalls();
    if (allowed) return true;
    if (!mounted) return false;

    final openSettings = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('允许安装更新包'),
        content: const Text(
          'Android 需要先允许本应用安装已校验的 APK 更新包。打开系统设置后，请开启“允许来自此来源的应用”。',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('稍后'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('打开设置'),
          ),
        ],
      ),
    );

    if (openSettings == true) {
      await SystemSettings.openInstallPermissionSettings();
      if (mounted) {
        setState(() => _message = '请在系统设置中允许安装更新包，返回后再次点击即可继续安装。');
      }
    }
    return false;
  }

  Future<void> _check() async {
    setState(() {
      _busy = true;
      _progress = null;
      _message = '正在检查更新…';
    });
    try {
      final service = UpdateService();
      final result = await service.check();
      if (!result.hasUpdate || result.manifest == null) {
        setState(
          () => _message =
              '当前已是最新版本 ${result.currentVersion}+${result.currentBuild}',
        );
        return;
      }
      if (!mounted) return;
      final manifest = result.manifest!;
      setState(() => _message = '发现新版本 ${manifest.versionName}，准备安装更新…');
      if (!await _ensureInstallPermission()) return;
      setState(() => _message = '正在下载并校验更新包…');
      final file = await service.downloadAndVerify(
        manifest,
        onProgress: (received, total) {
          if (mounted && total > 0) {
            setState(() => _progress = received / total);
          }
        },
      );
      await service.openInstaller(file);
      setState(() => _message = 'APK 校验通过，已打开系统安装界面');
    } catch (error) {
      setState(() => _message = '更新失败：$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.system_update_alt_rounded),
                const SizedBox(width: 12),
                Text('App 更新', style: Theme.of(context).textTheme.titleLarge),
              ],
            ),
            const SizedBox(height: 8),
            Text(_message),
            if (_progress != null) ...[
              const SizedBox(height: 10),
              LinearProgressIndicator(value: _progress),
            ],
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: _busy ? null : _check,
              icon: const Icon(Icons.refresh_rounded),
              label: Text(_busy ? '正在处理…' : '检查并安装更新'),
            ),
          ],
        ),
      ),
    );
  }
}
