import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';

final websiteSettingsProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
      final data = await ref.watch(apiClientProvider).getJson('/settings');
      return (data['settings'] as Map?)?.cast<String, dynamic>() ?? const {};
    });

class WebsiteTextScreen extends ConsumerWidget {
  const WebsiteTextScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(websiteSettingsProvider);
    return settings.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(error.toString(), textAlign: TextAlign.center),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => ref.invalidate(websiteSettingsProvider),
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('重新加载'),
              ),
            ],
          ),
        ),
      ),
      data: (data) => _WebsiteTextForm(initial: data),
    );
  }
}

class _WebsiteTextForm extends ConsumerStatefulWidget {
  const _WebsiteTextForm({required this.initial});

  final Map<String, dynamic> initial;

  @override
  ConsumerState<_WebsiteTextForm> createState() => _WebsiteTextFormState();
}

class _WebsiteTextFormState extends ConsumerState<_WebsiteTextForm> {
  late final TextEditingController _siteTitle;
  late final TextEditingController _heroTitle;
  late final TextEditingController _profile;
  final List<_TimelineDraft> _timeline = [];
  String? _timelineError;
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
    _loadTimeline(widget.initial['timeline_items']);
  }

  void _loadTimeline(Object? raw) {
    try {
      final decoded = raw is String ? jsonDecode(raw) : raw;
      if (decoded == null) return;
      if (decoded is! List) throw const FormatException('时间线不是列表');
      for (final item in decoded) {
        if (item is! Map) throw const FormatException('时间线条目格式不正确');
        _timeline.add(
          _TimelineDraft(
            date: item['date']?.toString() ?? '',
            title: item['title']?.toString() ?? '',
            text: item['text']?.toString() ?? '',
          ),
        );
      }
    } on FormatException catch (error) {
      _timelineError = '服务器中的时间线格式无法读取：${error.message}。为防止误清空，当前不可保存。';
    }
  }

  @override
  void dispose() {
    _siteTitle.dispose();
    _heroTitle.dispose();
    _profile.dispose();
    for (final item in _timeline) {
      item.dispose();
    }
    super.dispose();
  }

  void _addTimelineItem() {
    setState(() => _timeline.add(_TimelineDraft()));
  }

  void _removeTimelineItem(int index) {
    setState(() {
      final item = _timeline.removeAt(index);
      item.dispose();
    });
  }

  Future<void> _clearTimeline() async {
    if (_timeline.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('清空整条时间线？'),
        content: const Text('这会移除编辑器中的所有时间线条目。只有再次点击“保存网站文字”后，服务器内容才会更新。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('确认清空'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() {
      for (final item in _timeline) {
        item.dispose();
      }
      _timeline.clear();
    });
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('时间线已在编辑器中清空，点击保存后生效')));
  }

  Future<void> _save() async {
    if (_timelineError != null) return;
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() => _saving = true);
    try {
      final timelinePayload = _timeline
          .map(
            (item) => {
              'date': item.date.text.trim(),
              'title': item.title.text.trim(),
              'text': item.text.text.trim(),
            },
          )
          .toList(growable: false);
      await ref.read(apiClientProvider).patchJson('/settings', {
        'site_title': _siteTitle.text.trim(),
        'hero_title': _heroTitle.text.trim(),
        'profile_text': _profile.text.trim(),
        'timeline_items': jsonEncode(timelinePayload),
      });
      ref.invalidate(websiteSettingsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              timelinePayload.isEmpty ? '网站文字已保存，时间线现在为空' : '网站文字和时间线已保存',
            ),
          ),
        );
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

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 40),
      children: [
        Text('网站文字', style: Theme.of(context).textTheme.headlineLarge),
        const SizedBox(height: 8),
        Text(
          '单独管理首页文字和青春时间线。时间线不再需要手动编辑 JSON。',
          style: TextStyle(color: AppTheme.ink.withValues(alpha: .62)),
        ),
        const SizedBox(height: 22),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('首页与简介', style: Theme.of(context).textTheme.titleLarge),
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
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '青春时间线',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    Text('${_timeline.length} 条'),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  '每一条都可以单独编辑或删除；清空后仍需点击页面底部的保存按钮。',
                  style: TextStyle(color: AppTheme.ink.withValues(alpha: .58)),
                ),
                if (_timelineError != null) ...[
                  const SizedBox(height: 12),
                  MaterialBanner(
                    content: Text(_timelineError!),
                    leading: const Icon(Icons.warning_amber_rounded),
                    actions: const [SizedBox.shrink()],
                  ),
                ],
                const SizedBox(height: 12),
                for (var index = 0; index < _timeline.length; index++) ...[
                  _TimelineEditor(
                    key: ValueKey(_timeline[index].id),
                    index: index,
                    draft: _timeline[index],
                    onRemove: () => _removeTimelineItem(index),
                  ),
                  if (index != _timeline.length - 1) const SizedBox(height: 12),
                ],
                if (_timeline.isEmpty && _timelineError == null)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 18),
                    child: Text(
                      '当前没有时间线内容。你可以添加新条目，或直接保存为空时间线。',
                      textAlign: TextAlign.center,
                    ),
                  ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    OutlinedButton.icon(
                      key: const Key('add-timeline-item'),
                      onPressed: _timelineError == null
                          ? _addTimelineItem
                          : null,
                      icon: const Icon(Icons.add_rounded),
                      label: const Text('添加一段时间线'),
                    ),
                    TextButton.icon(
                      key: const Key('clear-timeline'),
                      onPressed: _timeline.isEmpty ? null : _clearTimeline,
                      icon: const Icon(Icons.delete_sweep_outlined),
                      label: const Text('清空时间线'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          key: const Key('save-website-text'),
          onPressed: _saving || _timelineError != null ? null : _save,
          icon: _saving
              ? const SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.save_outlined),
          label: Text(_saving ? '正在保存…' : '保存网站文字'),
        ),
      ],
    );
  }
}

class _TimelineEditor extends StatelessWidget {
  const _TimelineEditor({
    super.key,
    required this.index,
    required this.draft,
    required this.onRemove,
  });

  final int index;
  final _TimelineDraft draft;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: .58),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.ink.withValues(alpha: .1)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '第 ${index + 1} 段',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
                IconButton(
                  tooltip: '删除第 ${index + 1} 段',
                  onPressed: onRemove,
                  icon: const Icon(Icons.delete_outline_rounded),
                ),
              ],
            ),
            TextField(
              controller: draft.date,
              decoration: const InputDecoration(labelText: '时间，例如 2025.06'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: draft.title,
              decoration: const InputDecoration(labelText: '标题'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: draft.text,
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(labelText: '正文'),
            ),
          ],
        ),
      ),
    );
  }
}

class _TimelineDraft {
  _TimelineDraft({String date = '', String title = '', String text = ''})
    : id = _nextId++,
      date = TextEditingController(text: date),
      title = TextEditingController(text: title),
      text = TextEditingController(text: text);

  static int _nextId = 0;
  final int id;
  final TextEditingController date;
  final TextEditingController title;
  final TextEditingController text;

  void dispose() {
    date.dispose();
    title.dispose();
    text.dispose();
  }
}
