import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../settings/full_settings_screen.dart';

class PetAdvanced extends ConsumerStatefulWidget {
  const PetAdvanced({
    super.key,
    required this.settings,
    required this.onChange,
    required this.onApply,
    required this.current,
    required this.busy,
  });
  final Map<String, dynamic> settings;
  final ValueChanged<Map<String, dynamic>> onChange, onApply;
  final Map<String, dynamic> Function() current;
  final bool busy;
  @override
  ConsumerState<PetAdvanced> createState() => _PetAdvancedState();
}

class _PetAdvancedState extends ConsumerState<PetAdvanced> {
  final Map<String, TextEditingController> _text = {};
  List<Map<String, dynamic>>? _presets;
  String? _error;
  bool _loading = false;
  static const numbers = {
    'size': ('助手高度', 150.0, 450.0),
    'scale': ('角色缩放', 0.5, 1.5),
    'right': ('距离侧边', 0.0, 1600.0),
    'bottom': ('距离底部', 0.0, 900.0),
    'moveRange': ('最大移动范围', 0.0, 120.0),
    'moveSpeed': ('移动速度', 1.0, 40.0),
    'zIndex': ('显示层级', 1.0, 900.0),
    'opacity': ('整体透明度', 0.2, 1.0),
    'followStrength': ('鼠标跟随强度', 0.0, 1.0),
    'randomInterval': ('随机动作间隔（秒）', 10.0, 300.0),
    'bubbleDuration': ('气泡停留（秒）', 2.0, 30.0),
    'autoBubbleInterval': ('自动气泡间隔（秒）', 10.0, 3600.0),
  };
  static const lines = {
    'named': '昵称用户欢迎语',
    'guest': '游客欢迎语',
    'auto': '自动气泡台词',
    'morning': '早上台词',
    'afternoon': '下午台词',
    'evening': '晚上台词',
    'hover': '悬停台词',
    'click': '点击台词',
    'head': '头部点击台词',
    'body': '身体点击台词',
    'idle': '待机台词',
    'linger': '长时间停留台词',
    'opening': 'AI 开场白',
  };
  @override
  void dispose() {
    for (final c in _text.values) {
      c.dispose();
    }
    super.dispose();
  }

  TextEditingController controller(String key, String initial) =>
      _text.putIfAbsent(key, () => TextEditingController(text: initial));
  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final result = await ref.read(apiClientProvider).getJson('/pet/presets');
      if (mounted) {
        setState(
          () => _presets = (result['presets'] as List)
              .map((v) => Map<String, dynamic>.from(v as Map))
              .toList(),
        );
      }
    } catch (e) {
      if (mounted) setState(() => _error = '预设读取失败：$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _add() async {
    final name = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('保存当前参数为预设'),
        content: TextField(
          controller: name,
          maxLength: 60,
          decoration: const InputDecoration(labelText: '预设名称'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, name.text.trim()),
            child: const Text('保存预设'),
          ),
        ],
      ),
    );
    // Dispose after the dialog route finishes its closing animation.
    Future<void>.delayed(const Duration(seconds: 1), name.dispose);
    if (value == null || value.isEmpty || !mounted) return;
    setState(() => _loading = true);
    try {
      final result = await ref.read(apiClientProvider).postJson(
        '/pet/presets',
        {'name': value, 'settings': widget.current()},
      );
      if (mounted) {
        setState(
          () => _presets = (result['presets'] as List)
              .map((v) => Map<String, dynamic>.from(v as Map))
              .toList(),
        );
      }
    } catch (e) {
      if (mounted) setState(() => _error = '预设保存失败：$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      ExpansionTile(
        title: const Text('布局与互动参数'),
        children: [
          DropdownButtonFormField<String>(
            initialValue: widget.settings['position']?.toString() ?? 'right',
            decoration: const InputDecoration(labelText: '助手位置'),
            items: const [
              DropdownMenuItem(value: 'left', child: Text('左侧')),
              DropdownMenuItem(value: 'right', child: Text('右侧')),
            ],
            onChanged: widget.busy
                ? null
                : (v) => widget.onChange({'position': v}),
          ),
          for (final e in numbers.entries)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: TextFormField(
                controller: controller(
                  e.key,
                  (widget.settings[e.key] ?? e.value.$2).toString(),
                ),
                enabled: !widget.busy,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: InputDecoration(labelText: e.value.$1),
                validator: (v) {
                  final n = double.tryParse(v ?? '');
                  return n == null ||
                          !n.isFinite ||
                          n < e.value.$2 ||
                          n > e.value.$3
                      ? '请输入 ${e.value.$2}–${e.value.$3}'
                      : null;
                },
                onChanged: (v) {
                  final n = double.tryParse(v);
                  if (n != null) widget.onChange({e.key: n});
                },
              ),
            ),
          for (final e in {
            'randomMove': '允许随机移动',
            'hoverEnabled': '悬停打招呼',
            'clickEnabled': '点击互动',
            'idleEnabled': '待机动画',
          }.entries)
            SwitchListTile(
              title: Text(e.value),
              value: widget.settings[e.key] == true,
              onChanged: widget.busy
                  ? null
                  : (v) => widget.onChange({e.key: v}),
            ),
          DropdownButtonFormField<String>(
            initialValue:
                widget.settings['apiUrl']?.toString() ??
                'https://api.deepseek.com',
            decoration: const InputDecoration(labelText: 'DeepSeek 接口地址'),
            items: const [
              DropdownMenuItem(
                value: 'https://api.deepseek.com',
                child: Text('官方接口'),
              ),
              DropdownMenuItem(
                value: 'https://api.deepseek.com/v1',
                child: Text('官方 v1 接口'),
              ),
            ],
            onChanged: widget.busy
                ? null
                : (v) => widget.onChange({'apiUrl': v}),
          ),
        ],
      ),
      ExpansionTile(
        title: const Text('所有互动台词'),
        children: [
          const Text('每行一条。可使用 {name}、{time}、{page}；游客欢迎语不使用 {name}。'),
          for (final e in lines.entries)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: TextFormField(
                controller: controller(
                  'lines.${e.key}',
                  ((widget.settings['lines'] as Map?)?[e.key] as List? ?? [])
                      .join('\n'),
                ),
                enabled: !widget.busy,
                minLines: 2,
                maxLines: 10,
                decoration: InputDecoration(labelText: e.value),
                validator: (v) {
                  final rows = (v ?? '').split('\n');
                  if (rows.length > 30 || rows.any((s) => s.length > 300)) {
                    return '每类最多30条，每条最多300字';
                  }
                  if (e.key == 'guest' && (v ?? '').contains('{name}')) {
                    return '游客欢迎语不能包含 {name}';
                  }
                  return null;
                },
                onChanged: (v) => widget.onChange({
                  'lines': {
                    ...?(widget.settings['lines'] as Map?),
                    e.key: v
                        .split('\n')
                        .where((s) => s.trim().isNotEmpty)
                        .toList(),
                  },
                }),
              ),
            ),
        ],
      ),
      ExpansionTile(
        title: const Text('助手预设'),
        onExpansionChanged: (open) {
          if (open && _presets == null && !_loading) _load();
        },
        children: [
          if (_loading) const LinearProgressIndicator(),
          if (_error != null) Text(_error!),
          for (final preset in _presets ?? [])
            ListTile(
              title: Text(preset['name'].toString()),
              trailing: Wrap(
                children: [
                  TextButton(
                    onPressed: widget.busy || _loading
                        ? null
                        : () {
                            widget.onApply(
                              Map<String, dynamic>.from(
                                preset['settings'] as Map,
                              ),
                            );
                          },
                    child: const Text('应用'),
                  ),
                  IconButton(
                    tooltip: '删除预设',
                    icon: const Icon(Icons.delete_outline),
                    onPressed: widget.busy || _loading
                        ? null
                        : () async {
                            if (!await confirmRemoval(context, '删除该预设？') ||
                                !mounted) {
                              return;
                            }
                            setState(() => _loading = true);
                            try {
                              final result = await ref
                                  .read(apiClientProvider)
                                  .postJson('/pet/presets/delete', {
                                    'id': preset['id'],
                                  });
                              if (mounted) {
                                setState(
                                  () => _presets = (result['presets'] as List)
                                      .map(
                                        (v) =>
                                            Map<String, dynamic>.from(v as Map),
                                      )
                                      .toList(),
                                );
                              }
                            } catch (e) {
                              if (mounted) setState(() => _error = '删除失败：$e');
                            } finally {
                              if (mounted) setState(() => _loading = false);
                            }
                          },
                  ),
                ],
              ),
            ),
          Wrap(
            children: [
              TextButton(
                onPressed: widget.busy || _loading ? null : _add,
                child: const Text('保存为预设'),
              ),
              TextButton(
                onPressed: _loading ? null : _load,
                child: const Text('刷新预设'),
              ),
            ],
          ),
        ],
      ),
    ],
  );
}
