import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';

final submissionsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
      final data = await ref
          .watch(apiClientProvider)
          .getJson('/submissions', query: const {'status': 'all'});
      return (data['submissions'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => item.cast<String, dynamic>())
          .toList();
    });

class SubmissionsScreen extends ConsumerWidget {
  const SubmissionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final submissions = ref.watch(submissionsProvider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(submissionsProvider.future),
      child: submissions.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ListView(
          children: [
            const SizedBox(height: 180),
            Center(child: Text(error.toString())),
          ],
        ),
        data: (items) => CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 18),
              sliver: SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '投稿信箱',
                      style: Theme.of(context).textTheme.headlineLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '待处理 ${items.where((item) => item['status'] == 'pending').length} 条',
                      style: TextStyle(
                        color: AppTheme.ink.withValues(alpha: .58),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (items.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: Center(child: Text('暂无投稿')),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
                sliver: SliverList.separated(
                  itemCount: items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final item = items[index];
                    return Card(
                      child: ExpansionTile(
                        tilePadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 8,
                        ),
                        childrenPadding: const EdgeInsets.fromLTRB(
                          16,
                          0,
                          16,
                          16,
                        ),
                        title: Text(
                          item['title']?.toString() ?? '无标题',
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                        subtitle: Text(
                          '${item['nickname'] ?? '访客'} · ${item['created_at'] ?? ''}',
                        ),
                        trailing: _StatusChip(
                          status: item['status']?.toString() ?? 'pending',
                        ),
                        children: [
                          Align(
                            alignment: Alignment.centerLeft,
                            child: Text(item['body']?.toString() ?? ''),
                          ),
                          const SizedBox(height: 14),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              if ((item['email']?.toString() ?? '').isNotEmpty)
                                OutlinedButton.icon(
                                  onPressed: () => launchUrl(
                                    Uri(
                                      scheme: 'mailto',
                                      path: item['email'].toString(),
                                      queryParameters: {
                                        'subject':
                                            '回复投稿：${item['title'] ?? ''}',
                                      },
                                    ),
                                  ),
                                  icon: const Icon(Icons.mail_outline_rounded),
                                  label: const Text('邮件回复'),
                                ),
                              FilledButton.tonal(
                                onPressed: () => _status(ref, item, 'accepted'),
                                child: const Text('标记采纳'),
                              ),
                              FilledButton.tonal(
                                onPressed: () => _status(ref, item, 'rejected'),
                                child: const Text('标记拒绝'),
                              ),
                              TextButton.icon(
                                onPressed: () => _delete(ref, item),
                                icon: const Icon(Icons.delete_outline_rounded),
                                label: const Text('删除'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _status(
    WidgetRef ref,
    Map<String, dynamic> item,
    String status,
  ) async {
    await ref.read(apiClientProvider).patchJson('/submissions/${item['id']}', {
      'status': status,
    });
    ref.invalidate(submissionsProvider);
  }

  Future<void> _delete(WidgetRef ref, Map<String, dynamic> item) async {
    await ref.read(apiClientProvider).deleteJson('/submissions/${item['id']}');
    ref.invalidate(submissionsProvider);
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final label = switch (status) {
      'accepted' => '已采纳',
      'rejected' => '已拒绝',
      _ => '待处理',
    };
    return Chip(label: Text(label));
  }
}
