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
  String _message = '点击检查更新，自动获取可用的新版本';
  String? _source;

  Future<void> _chooseSource() async {
    final service = widget.service ?? UpdateService();
    final source = await showDialog<UpdateSource>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('选择更新来源'),
        content: SizedBox(
          width: double.maxFinite,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              OutlinedButton.icon(
                onPressed: service.sourceRepositoryUrl.isEmpty
                    ? null
                    : () => Navigator.pop(context, UpdateSource.github),
                icon: const Icon(Icons.code_rounded),
                label: const Text('从 GitHub 获取更新'),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => Navigator.pop(context, UpdateSource.server),
                icon: const Icon(Icons.dns_outlined),
                label: const Text('从服务器获取更新'),
              ),
              const SizedBox(height: 16),
              TextButton.icon(
                onPressed: service.sourceRepositoryUrl.isEmpty
                    ? null
                    : () => _openSource(service),
                icon: const Icon(Icons.open_in_new_rounded),
                label: const Text('前往 GitHub 开源地址'),
              ),
              if (service.sourceRepositoryUrl.isEmpty)
                const Text('此构建未设置 GitHub 来源，可从本站服务器更新。'),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
        ],
      ),
    );
    if (!mounted || source == null) return;
    await _check(service, source);
  }

  Future<void> _openSource(UpdateService service) async {
    try {
      await service.openSourceRepository();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('无法打开 GitHub，请检查网络和浏览器设置')),
        );
      }
    }
  }

  Future<void> _check(UpdateService service, UpdateSource source) async {
    setState(() {
      _busy = true;
      _progress = null;
      _source = source == UpdateSource.github ? 'GitHub 正式发行' : '本站服务器';
      _message = '正在从$_source检查更新…';
    });
    try {
      final result = await service.check(source: source);
      if (!mounted) return;
      setState(() => _source = result.sourceName);
      final manifest = result.manifest;
      if (manifest == null) {
        throw const FormatException('没有读取到版本信息，请稍后重试。');
      }
      if (!result.hasUpdate) {
        setState(
          () => _message =
              '服务器版本 ${manifest.versionName}+${manifest.versionCode}。'
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
            '检查更新未完成：${error is FormatException ? error.message : '暂时无法连接更新服务器，请稍后重试。'}',
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
              _source != null
                  ? '更新来源：$_source'
                  : AppConfig.connection?.updateUrl.isNotEmpty == true
                  ? '更新来源：自定义本站地址'
                  : AppConfig.githubReleasesUrl.isNotEmpty
                  ? '可从 GitHub 或本站服务器获取更新'
                  : '更新来源：本站服务器（自动）',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (_progress != null) ...[
              const SizedBox(height: 10),
              LinearProgressIndicator(value: _progress),
            ],
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: _busy ? null : _chooseSource,
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
              label: const Text('站点与高级设置'),
            ),
            TextButton.icon(
              onPressed:
                  _busy ||
                      (widget.service ?? UpdateService())
                          .sourceRepositoryUrl
                          .isEmpty
                  ? null
                  : () => _openSource(widget.service ?? UpdateService()),
              icon: const Icon(Icons.open_in_new_rounded),
              label: const Text('前往 GitHub 开源地址'),
            ),
          ],
        ),
      ),
    );
  }
}
