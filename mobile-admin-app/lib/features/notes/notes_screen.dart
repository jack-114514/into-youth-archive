import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';

final notesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((
  ref,
) async {
  final data = await ref.watch(apiClientProvider).getJson('/notes');
  return (data['notes'] as List? ?? const [])
      .whereType<Map>()
      .map((item) => item.cast<String, dynamic>())
      .toList();
});

class NotesScreen extends ConsumerWidget {
  const NotesScreen({super.key});

  Future<void> _edit(
    BuildContext context,
    WidgetRef ref, [
    Map<String, dynamic>? note,
  ]) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: AppTheme.mint,
      builder: (_) => _NoteEditor(note: note),
    );
    if (changed == true) ref.invalidate(notesProvider);
  }

  Future<void> _archive(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> note,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('归档这篇随手记？'),
        content: Text('“${note['title']}”将从访客页面隐藏，正文保留，可编辑后重新发布。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('确认归档'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    try {
      await ref.read(apiClientProvider).deleteJson('/notes/${note['id']}');
      ref.invalidate(notesProvider);
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notes = ref.watch(notesProvider);
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _edit(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('新增随手记'),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(notesProvider.future),
        child: notes.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ListView(
            children: [
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text('无法读取随手记：$error'),
              ),
              TextButton(
                onPressed: () => ref.invalidate(notesProvider),
                child: const Text('重新加载'),
              ),
            ],
          ),
          data: (items) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 100),
            children: [
              Text('随手记内容', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 8),
              const Text('草稿仅管理员可见；发布后访客可阅读。归档会隐藏记录并保留正文。'),
              const SizedBox(height: 20),
              if (items.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('还没有记录，点击新增随手记开始写。'),
                ),
              for (final note in items)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${note['recorded_on']} · ${switch (note['status']) {
                            'published' => '已发布',
                            'archived' => '已归档',
                            _ => '草稿',
                          }}',
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '${note['title']}',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '${note['body']}',
                          maxLines: 4,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Wrap(
                          spacing: 12,
                          children: [
                            TextButton(
                              onPressed: () => _edit(context, ref, note),
                              child: const Text('编辑'),
                            ),
                            if (note['status'] != 'archived')
                              TextButton(
                                onPressed: () => _archive(context, ref, note),
                                child: const Text('归档'),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NoteEditor extends ConsumerStatefulWidget {
  const _NoteEditor({this.note});
  final Map<String, dynamic>? note;
  @override
  ConsumerState<_NoteEditor> createState() => _NoteEditorState();
}

class _NoteEditorState extends ConsumerState<_NoteEditor> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _title;
  late final TextEditingController _body;
  late DateTime _date;
  bool _busy = false, _dirty = false, _allowPop = false;
  String? _error;
  String get _dateText =>
      '${_date.year.toString().padLeft(4, '0')}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}';

  @override
  void initState() {
    super.initState();
    _title = TextEditingController(
      text: widget.note?['title']?.toString() ?? '',
    );
    _body = TextEditingController(text: widget.note?['body']?.toString() ?? '');
    _date =
        DateTime.tryParse(widget.note?['recorded_on']?.toString() ?? '') ??
        DateTime.now();
  }

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _close() async {
    if (_busy) return;
    if (_dirty) {
      final discard = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('放弃未保存的随手记修改？'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('继续编辑'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('放弃修改'),
            ),
          ],
        ),
      );
      if (discard != true || !mounted) return;
    }
    setState(() => _allowPop = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.pop(context, false);
    });
  }

  Future<void> _save(String status) async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final payload = {
        'title': _title.text.trim(),
        'body': _body.text.trim(),
        'recorded_on': _dateText,
        'status': status,
      };
      final api = ref.read(apiClientProvider);
      if (widget.note == null) {
        await api.postJson('/notes', payload);
      } else {
        await api.patchJson('/notes/${widget.note!['id']}', payload);
      }
      if (!mounted) return;
      setState(() {
        _allowPop = true;
        _dirty = false;
        _busy = false;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.pop(context, true);
      });
    } catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = error.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: _allowPop || (!_busy && !_dirty),
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) _close();
    },
    child: SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        20,
        24,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.note == null ? '新增随手记' : '编辑随手记',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 20),
            TextFormField(
              controller: _title,
              enabled: !_busy,
              maxLength: 100,
              decoration: const InputDecoration(labelText: '标题'),
              onChanged: (_) => setState(() => _dirty = true),
              validator: (value) =>
                  (value ?? '').trim().isEmpty ? '请填写标题' : null,
            ),
            OutlinedButton.icon(
              onPressed: _busy
                  ? null
                  : () async {
                      final chosen = await showDatePicker(
                        context: context,
                        initialDate: _date,
                        firstDate: DateTime(1900),
                        lastDate: DateTime(2200),
                      );
                      if (chosen != null && mounted) {
                        setState(() {
                          _date = chosen;
                          _dirty = true;
                        });
                      }
                    },
              icon: const Icon(Icons.calendar_today),
              label: Text('记录日期：$_dateText'),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _body,
              enabled: !_busy,
              maxLength: 12000,
              minLines: 6,
              maxLines: 14,
              decoration: const InputDecoration(labelText: '正文'),
              onChanged: (_) => setState(() => _dirty = true),
              validator: (value) =>
                  (value ?? '').trim().isEmpty ? '请填写正文' : null,
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              children: [
                OutlinedButton(
                  onPressed: _busy ? null : () => _save('draft'),
                  child: const Text('保存草稿'),
                ),
                FilledButton(
                  onPressed: _busy ? null : () => _save('published'),
                  child: Text(_busy ? '正在保存…' : '发布随手记'),
                ),
                TextButton(
                  onPressed: _busy ? null : _close,
                  child: const Text('取消'),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}
