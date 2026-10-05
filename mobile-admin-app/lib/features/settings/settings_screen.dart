import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../core/providers.dart';
import '../../core/update/update_service.dart';
import '../../core/config/app_config.dart';
import '../connection/site_screen.dart';
import 'full_settings_screen.dart';

final settingsProvider = FutureProvider.autoDispose<Map<String, dynamic>>((
  ref,
) async {
  final data = await ref.watch(apiClientProvider).getJson('/settings');
  return (data['settings'] as Map?)?.cast<String, dynamic>() ?? const {};
});

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key, this.onVersionTap});
  final VoidCallback? onVersionTap;
  @override
  Widget build(BuildContext context) =>
      const FullSettingsScreen(group: '网站设置', section: 'settings');
}

class AppToolsScreen extends StatelessWidget {
  const AppToolsScreen({super.key, this.onVersionTap});
  final VoidCallback? onVersionTap;
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      const AppUpdateCard(),
      const SizedBox(height: 16),
      _AboutCard(onVersionTap: onVersionTap),
    ],
  );
}

class _AboutCard extends StatefulWidget {
  const _AboutCard({this.onVersionTap});

  final VoidCallback? onVersionTap;

  @override
  State<_AboutCard> createState() => _AboutCardState();
}

class _AboutCardState extends State<_AboutCard> {
  late final Future<PackageInfo> _packageInfo = PackageInfo.fromPlatform();

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: FutureBuilder<PackageInfo>(
          future: _packageInfo,
          builder: (context, snapshot) {
            final package = snapshot.data;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('关于 App', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 12),
                Semantics(
                  button: true,
                  label: 'App 版本，连续点击七次开启开发者模式',
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: widget.onVersionTap,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Row(
                        children: [
                          const Icon(Icons.info_outline_rounded),
                          const SizedBox(width: 12),
                          const Expanded(child: Text('版本')),
                          Text(
                            package == null
                                ? '…'
                                : '${package.version}+${package.buildNumber}',
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class AppUpdateCard extends StatefulWidget {
  const AppUpdateCard({super.key, this.service});
  final UpdateService? service;

  @override
  State<AppUpdateCard> createState() => _UpdateCardState();
}

class _UpdateCardState extends State<AppUpdateCard> {
  bool _busy = false;
  double? _progress;
  String _message = '点击检查更新，查询本站 APK 更新清单';

  Future<void> _check() async {
    setState(() {
      _busy = true;
      _progress = null;
      _message = '正在检查更新…';
    });
    try {
      final service = widget.service ?? UpdateService();
      final result = await service.check();
      if (!mounted) return;
      final manifest = result.manifest;
      if (manifest == null) {
        throw const FormatException('没有读取到更新清单，无法确认最新版本。');
      }
      if (!result.hasUpdate) {
        setState(
          () => _message =
              '已查询更新清单：${manifest.versionName}+${manifest.versionCode}。'
              '本机 ${result.currentVersion}+${result.currentBuild}，暂无可用更新。',
        );
        return;
      }
      final download = await showDialog<bool>(
        context: context,
        barrierDismissible: !manifest.mandatory,
        builder: (context) => AlertDialog(
          title: Text('发现新版本 ${manifest.versionName}'),
          content: Text(
            manifest.notes.isEmpty ? '是否下载并校验安装包？' : manifest.notes,
          ),
          actions: [
            if (manifest.githubReleaseUrl.isNotEmpty ||
                AppConfig.githubReleasesUrl.isNotEmpty)
              TextButton(
                onPressed: () async {
                  Navigator.pop(context, false);
                  await service.openGithubFallback(manifest);
                },
                child: const Text('GitHub Release'),
              ),
            if (!manifest.mandatory)
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('稍后'),
              ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('下载更新'),
            ),
          ],
        ),
      );
      if (download != true) return;
      final file = await service.downloadAndVerify(
        manifest,
        onProgress: (received, total) {
          if (mounted && total > 0) {
            setState(() => _progress = received / total);
          }
        },
      );
      await service.openInstaller(file);
      if (!mounted) return;
      setState(() => _message = 'APK 校验通过，已打开系统安装界面');
    } catch (error) {
      if (!mounted) return;
      setState(
        () => _message =
            '未完成更新检查：${error is FormatException ? error.message : error}',
      );
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
            const SizedBox(height: 8),
            Text(
              AppConfig.updateManifestUrl.isEmpty
                  ? '更新来源：未配置'
                  : '更新来源：${AppConfig.updateManifestUrl}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (_progress != null) ...[
              const SizedBox(height: 10),
              LinearProgressIndicator(value: _progress),
            ],
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: _busy ? null : _check,
              icon: const Icon(Icons.refresh_rounded),
              label: Text(_busy ? '正在处理…' : '检查更新'),
            ),
            TextButton.icon(
              onPressed: _busy
                  ? null
                  : () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const SiteScreen(editing: true),
                      ),
                    ),
              icon: const Icon(Icons.settings_outlined),
              label: const Text('更新地址设置'),
            ),
          ],
        ),
      ),
    );
  }
}
