import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';

final commentsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) async {
    final data = await ref
        .watch(apiClientProvider)
        .getJson('/comments', query: const {'status': 'all'});
    return (data['comments'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => item.cast<String, dynamic>())
        .toList();
  },
);

class CommentsScreen extends ConsumerWidget {
  const CommentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final comments = ref.watch(commentsProvider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(commentsProvider.future),
      child: comments.when(
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
                      '留言管理',
                      style: Theme.of(context).textTheme.headlineLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '共 ${items.length} 条留言',
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
                child: Center(child: Text('暂无留言')),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
                sliver: SliverList.separated(
                  itemCount: items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final item = items[index];
                    final visible = item['status'] == 'visible';
                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                CircleAvatar(
                                  child: Text(
                                    item['avatar']?.toString() ?? '访',
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        item['nickname']?.toString() ?? '访客',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                      Text(
                                        item['created_at']?.toString() ?? '',
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall,
                                      ),
                                    ],
                                  ),
                                ),
                                Switch.adaptive(
                                  value: visible,
                                  onChanged: (value) =>
                                      _setVisibility(context, ref, item, value),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Text(item['text']?.toString() ?? ''),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Icon(
                                  Icons.favorite_border_rounded,
                                  size: 18,
                                  color: AppTheme.ink.withValues(alpha: .55),
                                ),
                                const SizedBox(width: 5),
                                Text('${item['likes'] ?? 0}'),
                                const Spacer(),
                                TextButton.icon(
                                  onPressed: () => _delete(context, ref, item),
                                  icon: const Icon(
                                    Icons.delete_outline_rounded,
                                  ),
                                  label: const Text('删除'),
                                ),
                              ],
                            ),
                          ],
                        ),
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

  Future<void> _setVisibility(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> item,
    bool visible,
  ) async {
    try {
      await ref.read(apiClientProvider).patchJson('/comments/${item['id']}', {
        'status': visible ? 'visible' : 'hidden',
      });
      ref.invalidate(commentsProvider);
    } on ApiException catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Future<void> _delete(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> item,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('删除留言？'),
        content: const Text('该留言及其回复关系将无法恢复。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(apiClientProvider).deleteJson('/comments/${item['id']}');
    ref.invalidate(commentsProvider);
  }
}
