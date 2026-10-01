import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';

final dashboardProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => ref.watch(apiClientProvider).getJson('/dashboard'),
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
                    '青春控制室',
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
                                mainAxisExtent: 142,
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
                        child: Row(
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
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'API 与数据库响应正常',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  SizedBox(height: 3),
                                  Text('下拉页面可重新获取实时状态'),
                                ],
                              ),
                            ),
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
