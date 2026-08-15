import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../core/config/app_diagnostics.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';

final developerInfoProvider = FutureProvider.autoDispose<Map<String, dynamic>>((
  ref,
) async {
  final package = await PackageInfo.fromPlatform();
  final diagnostics = AppDiagnostics.fromPackage(package);
  final session = await ref.watch(apiClientProvider).getJson('/session');
  final stopwatch = Stopwatch()..start();
  final dashboard = await ref.watch(apiClientProvider).getJson('/dashboard');
  stopwatch.stop();
  final logs = await ref
      .watch(apiClientProvider)
      .getJson('/operation-logs', query: const {'limit': 40});
  return {
    'app_name': diagnostics.appName,
    'version': diagnostics.version,
    'version_code': diagnostics.versionCode,
    'package': diagnostics.packageName,
    'commit': diagnostics.gitCommit,
    'build_time': diagnostics.buildTime,
    'build_type': diagnostics.buildType,
    'api_environment': diagnostics.apiEnvironment,
    'api_latency_ms': stopwatch.elapsedMilliseconds,
    'session': session,
    'dashboard': dashboard,
    'logs': logs['logs'] ?? const [],
  };
});

class DeveloperScreen extends ConsumerWidget {
  const DeveloperScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final info = ref.watch(developerInfoProvider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(developerInfoProvider.future),
      child: info.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ListView(
          children: [
            const SizedBox(height: 180),
            Center(child: Text(error.toString())),
          ],
        ),
        data: (data) {
          final logs = data['logs'] as List? ?? const [];
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 40),
            children: [
              Text('开发者模式', style: Theme.of(context).textTheme.headlineLarge),
              const SizedBox(height: 8),
              Text(
                '仅展示脱敏后的构建和操作信息。',
                style: TextStyle(color: AppTheme.ink.withValues(alpha: .58)),
              ),
              const SizedBox(height: 20),
              _InfoTile(label: 'App 名称', value: data['app_name'].toString()),
              _InfoTile(label: 'App 版本', value: data['version'].toString()),
              _InfoTile(
                label: 'Version Code',
                value: data['version_code'].toString(),
              ),
              _InfoTile(label: 'Package', value: data['package'].toString()),
              _InfoTile(label: 'Git Commit', value: data['commit'].toString()),
              _InfoTile(
                label: 'Build 时间',
                value: data['build_time'].toString(),
              ),
              _InfoTile(
                label: 'Build 类型',
                value: data['build_type'].toString(),
              ),
              _InfoTile(
                label: 'API Environment',
                value: data['api_environment'].toString(),
              ),
              _InfoTile(label: 'API', value: '在线'),
              _InfoTile(label: 'API 延迟', value: '${data['api_latency_ms']} ms'),
              _InfoTile(
                label: '服务器时间',
                value: ((data['dashboard'] as Map?)?['server_time'] ?? '')
                    .toString(),
              ),
              _InfoTile(
                label: '数据库状态',
                value:
                    (((data['dashboard'] as Map?)?['database']
                                as Map?)?['status'] ??
                            '')
                        .toString(),
              ),
              _InfoTile(
                label: '存储状态',
                value: _storageSummary(
                  ((data['dashboard'] as Map?)?['storage'] as Map?)
                      ?.cast<String, dynamic>(),
                ),
              ),
              _InfoTile(
                label: '管理员模式',
                value: ((data['session'] as Map?)?['mode'] ?? '').toString(),
              ),
              const SizedBox(height: 20),
              Text('最近操作', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 10),
              for (final raw in logs.whereType<Map>())
                Card(
                  child: ListTile(
                    title: Text(raw['action']?.toString() ?? ''),
                    subtitle: Text(
                      '${raw['entity_type'] ?? ''} ${raw['entity_id'] ?? ''}\n${raw['created_at'] ?? ''}',
                    ),
                    trailing: Text(raw['request_id']?.toString() ?? ''),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

String _storageSummary(Map<String, dynamic>? storage) {
  if (storage == null) return 'unknown';
  final free = int.tryParse(storage['disk_free_bytes']?.toString() ?? '') ?? 0;
  final total =
      int.tryParse(storage['disk_total_bytes']?.toString() ?? '') ?? 0;
  if (total <= 0) return storage['status']?.toString() ?? 'unknown';
  String gb(int bytes) => (bytes / 1024 / 1024 / 1024).toStringAsFixed(1);
  return '${storage['status'] ?? 'unknown'} / ${gb(free)} GB free of ${gb(total)} GB';
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        title: Text(label),
        trailing: SizedBox(
          width: 180,
          child: Text(
            value,
            textAlign: TextAlign.end,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
      ),
    );
  }
}
