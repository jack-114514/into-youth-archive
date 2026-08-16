import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config/app_config.dart';
import '../../core/platform/system_settings.dart';
import '../../core/theme/app_theme.dart';
import '../../core/update/update_service.dart';
import 'about_app_card.dart';
import 'permissions_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key, this.onVersionTap});

  final VoidCallback? onVersionTap;

  Future<void> _openAccountSecurity() async {
    final uri = Uri.tryParse(AppConfig.adminWebUrl);
    if (uri == null || uri.scheme != 'https') return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _openPermissions(BuildContext context) {
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
          '账号、权限、更新和版本信息集中在这里。网站展示文字请使用独立的“网站文字”菜单。',
          style: TextStyle(color: AppTheme.ink.withValues(alpha: .58)),
        ),
        const SizedBox(height: 22),
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
            onTap: () => _openPermissions(context),
          ),
        ),
        const SizedBox(height: 14),
        const _UpdateCard(),
        const SizedBox(height: 14),
        AboutAppCard(onVersionTap: onVersionTap),
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
