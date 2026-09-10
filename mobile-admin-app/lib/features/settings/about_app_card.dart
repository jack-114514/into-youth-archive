import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config/app_config.dart';
import '../../core/config/app_diagnostics.dart';

class AboutAppCard extends StatefulWidget {
  const AboutAppCard({super.key, this.onVersionTap, this.packageInfo});

  final VoidCallback? onVersionTap;
  final Future<PackageInfo>? packageInfo;

  @override
  State<AboutAppCard> createState() => _AboutAppCardState();
}

class _AboutAppCardState extends State<AboutAppCard> {
  late final Future<PackageInfo> _packageInfo =
      widget.packageInfo ?? PackageInfo.fromPlatform();

  Future<void> _open(Uri? uri, String name) async {
    if (uri == null ||
        !await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('$name地址未配置或无法打开')));
    }
  }

  Future<void> _copy(AppDiagnostics diagnostics) async {
    await Clipboard.setData(ClipboardData(text: diagnostics.toClipboardText()));
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('诊断信息已复制，内容不包含 Token 或密钥')));
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: FutureBuilder<PackageInfo>(
          future: _packageInfo,
          builder: (context, snapshot) {
            final package = snapshot.data;
            final diagnostics = package == null
                ? null
                : AppDiagnostics.fromPackage(package);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('关于 App', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 12),
                _InfoRow(
                  icon: Icons.apps_rounded,
                  label: 'App 名称',
                  value: diagnostics?.appName ?? '读取中…',
                ),
                Semantics(
                  button: true,
                  label: 'App 版本，连续点击七次开启开发者模式',
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: widget.onVersionTap,
                    child: _InfoRow(
                      icon: Icons.tag_rounded,
                      label: 'Version',
                      value: diagnostics?.version ?? '…',
                    ),
                  ),
                ),
                _InfoRow(
                  icon: Icons.numbers_rounded,
                  label: 'Version Code',
                  value: diagnostics?.versionCode ?? '…',
                ),
                _InfoRow(
                  icon: Icons.commit_rounded,
                  label: 'Git Commit',
                  value: diagnostics?.gitCommit ?? '…',
                ),
                _InfoRow(
                  icon: Icons.schedule_rounded,
                  label: 'Build Time',
                  value: diagnostics?.buildTime ?? '…',
                ),
                _InfoRow(
                  icon: Icons.build_circle_outlined,
                  label: 'Build Type',
                  value: diagnostics?.buildType ?? '…',
                ),
                _InfoRow(
                  icon: Icons.cloud_outlined,
                  label: 'API Environment',
                  value: diagnostics?.apiEnvironment ?? '…',
                ),
                const Divider(height: 28),
                _LinkTile(
                  icon: Icons.code_rounded,
                  label: 'GitHub 项目地址',
                  value: AppConfig.githubProjectUri?.toString() ?? '构建时未配置',
                  onTap: () => _open(AppConfig.githubProjectUri, 'GitHub'),
                ),
                _LinkTile(
                  icon: Icons.language_rounded,
                  label: '官方网站地址',
                  value: AppConfig.officialWebsiteUri?.toString() ?? '构建时未配置',
                  onTap: () => _open(AppConfig.officialWebsiteUri, '官网'),
                ),
                const _InfoRow(
                  icon: Icons.balance_rounded,
                  label: '开源许可证',
                  value: 'MIT License',
                ),
                const SizedBox(height: 14),
                OutlinedButton.icon(
                  onPressed: diagnostics == null
                      ? null
                      : () => _copy(diagnostics),
                  icon: const Icon(Icons.copy_all_rounded),
                  label: const Text('复制诊断信息'),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20),
          const SizedBox(width: 12),
          Expanded(child: Text(label)),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }
}

class _LinkTile extends StatelessWidget {
  const _LinkTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon),
      title: Text(label),
      subtitle: Text(value, maxLines: 2, overflow: TextOverflow.ellipsis),
      trailing: const Icon(Icons.open_in_new_rounded),
      onTap: onTap,
    );
  }
}
