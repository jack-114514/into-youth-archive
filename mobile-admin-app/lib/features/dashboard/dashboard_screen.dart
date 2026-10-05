import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';

final dashboardProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => ref.watch(apiClientProvider).getJson('/status'),
);

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboard = ref.watch(dashboardProvider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(dashboardProvider.future),
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
            sliver: SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '服务器状态',
                    style: Theme.of(context).textTheme.headlineLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '内容、互动和服务器状态都在这里汇合。',
                    style: TextStyle(
                      color: AppTheme.ink.withValues(alpha: .58),
                    ),
                  ),
                ],
              ),
            ),
          ),
          dashboard.when(
            loading: () => const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (error, _) => SliverFillRemaining(
              hasScrollBody: false,
              child: _ErrorState(
                message: error.toString(),
                onRetry: () => ref.invalidate(dashboardProvider),
              ),
            ),
            data: (data) {
              final counts =
                  (data['counts'] as Map?)?.cast<String, dynamic>() ??
                  const <String, dynamic>{};
              final storage = (data['storage'] as Map?) ?? {};
              final memory = (data['memory'] as Map?) ?? {};
              final service = (data['service'] as Map?) ?? {};
              String bytes(dynamic value) => value is num
                  ? '${(value / 1024 / 1024).toStringAsFixed(1)} MiB'
                  : '暂无数据';
              final items = [
                ('媒体内容', counts['media'] ?? 0, Icons.photo_library_outlined),
                ('全部评论', counts['comments'] ?? 0, Icons.forum_outlined),
                (
                  '公开评论',
                  counts['visible_comments'] ?? 0,
                  Icons.visibility_outlined,
                ),
                (
                  '待处理投稿',
                  counts['pending_submissions'] ?? 0,
                  Icons.inbox_outlined,
                ),
                ('页面访问', counts['page_views'] ?? 0, Icons.insights_outlined),
                (
                  '服务运行（秒）',
                  service['uptime_seconds'] ?? '暂无数据',
                  Icons.timer_outlined,
                ),
                (
                  '磁盘占用',
                  storage['disk_used_percent'] == null
                      ? '暂无数据'
                      : '${storage['disk_used_percent']}%',
                  Icons.storage_outlined,
                ),
                (
                  '上传总大小',
                  bytes(storage['uploads_bytes']),
                  Icons.cloud_upload_outlined,
                ),
                (
                  '数据库大小',
                  bytes((data['database'] as Map?)?['size_bytes']),
                  Icons.data_object,
                ),
                (
                  '内存使用',
                  memory['used_percent'] == null
                      ? '暂无数据'
                      : '${memory['used_percent']}%',
                  Icons.memory_outlined,
                ),
                (
                  '可用磁盘',
                  bytes(storage['disk_free_bytes']),
                  Icons.disc_full_outlined,
                ),
                ('系统负载', service['load_1m'] ?? '暂无数据', Icons.speed),
              ];
              return SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    LayoutBuilder(
                      builder: (context, constraints) {
                        final width = constraints.maxWidth;
                        final columns = width >= 900
                            ? 3
                            : width >= 540
                            ? 2
                            : 1;
                        return GridView.builder(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          gridDelegate:
                              SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: columns,
                                mainAxisExtent:
                                    142 *
                                    MediaQuery.textScalerOf(context).scale(14) /
                                    14,
                                crossAxisSpacing: 14,
                                mainAxisSpacing: 14,
                              ),
                          itemCount: items.length,
                          itemBuilder: (context, index) {
                            final item = items[index];
                            return _MetricCard(
                              label: item.$1,
                              value: item.$2.toString(),
                              icon: item.$3,
                              accent: index == 3,
                            );
                          },
                        );
                      },
                    ),
                    const SizedBox(height: 16),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  width: 12,
                                  height: 12,
                                  decoration: const BoxDecoration(
                                    color: Color(0xFF61C48D),
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                const Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '已读取服务器实时状态',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      SizedBox(height: 3),
                                      Text('下拉页面可重新获取实时状态'),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Text(
                              data['server_time']?.toString() ?? '',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ]),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
    this.accent = false,
  });

  final String label;
  final String value;
  final IconData icon;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: accent ? AppTheme.ink : null,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: accent ? AppTheme.acid : AppTheme.ink),
            const Spacer(),
            Text(
              value,
              style: TextStyle(
                fontSize: 30,
                fontWeight: FontWeight.w900,
                color: accent ? Colors.white : AppTheme.ink,
              ),
            ),
            Text(
              label,
              style: TextStyle(
                color: accent
                    ? Colors.white.withValues(alpha: .68)
                    : AppTheme.ink.withValues(alpha: .58),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_rounded, size: 40),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('重新加载'),
            ),
          ],
        ),
      ),
    );
  }
}
