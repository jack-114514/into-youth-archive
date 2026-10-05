import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/config/app_config.dart';
import '../../core/providers.dart';
import 'admin_fields.dart';
import 'image_crop.dart';
import 'settings_layout.dart';
import '../../core/widgets/admin_layout.dart';
import '../shell/admin_navigation.dart';

Map<String, dynamic> decodeObject(dynamic value) {
  final decoded = value is String
      ? jsonDecode(value.isEmpty ? '{}' : value)
      : value;
  return Map<String, dynamic>.from(decoded as Map);
}

List<Map<String, dynamic>> decodeRows(dynamic value) {
  final decoded = value is String
      ? jsonDecode(value.isEmpty ? '[]' : value)
      : value;
  return (decoded as List)
      .map((row) => Map<String, dynamic>.from(row as Map))
      .toList();
}

Future<bool> confirmRemoval(BuildContext context, String title) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: const Text('保存后将移除这项内容，请确认。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('确认移除'),
          ),
        ],
      ),
    ) ==
    true;

class FullSettingsScreen extends ConsumerStatefulWidget {
  const FullSettingsScreen({
    super.key,
    required this.group,
    this.section,
    this.embedded = false,
    this.footer,
    this.onDirtyChanged,
  });
  final String group;
  final String? section;
  final bool embedded;
  final Widget? footer;
  final ValueChanged<bool>? onDirtyChanged;
  @override
  ConsumerState<FullSettingsScreen> createState() => _FullSettingsScreenState();
}

class _FullSettingsScreenState extends ConsumerState<FullSettingsScreen> {
  Map<String, dynamic>? _values;
  Map<String, dynamic> _initial = {};
  List<Map<String, dynamic>> _nodes = [];
  final Map<String, TextEditingController> _text = {};
  bool _busy = false, _dirty = false;
  String? _error;
  int _revision = 0;
  bool get _intro => widget.section == 'intro' || widget.group == '首页开场';
  final _form = GlobalKey<FormState>();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in _text.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final result = await ref
          .read(apiClientProvider)
          .getJson(_intro ? '/homepage-intro' : '/settings');
      if (!mounted) return;
      _initial = Map<String, dynamic>.from(result['settings'] as Map);
      _values = {..._initial};
      _nodes = ((result['nodes'] as List?) ?? [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      setState(() => _error = null);
    } catch (e) {
      if (mounted) setState(() => _error = '读取失败：$e');
    }
  }

  void _change(String key, dynamic value) {
    setState(() {
      _values![key] = value;
      _markDirty();
    });
  }

  void _markDirty() {
    _dirty = true;
    widget.onDirtyChanged?.call(true);
  }

  TextEditingController _controller(String key, String fallback) =>
      _text.putIfAbsent(
        key,
        () =>
            TextEditingController(text: (_values![key] ?? fallback).toString()),
      );

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final changes = {
        for (final e in _values!.entries)
          if (e.value != _initial[e.key]) e.key: e.value,
      };
      if (_intro) {
        await ref.read(apiClientProvider).patchJson('/homepage-intro', {
          'settings': _values,
          'nodes': _nodes,
        });
      } else if (changes.isNotEmpty) {
        final result = await ref
            .read(apiClientProvider)
            .patchJson('/settings', changes);
        final changed = (result['changed'] as List?) ?? [];
        if (changes.keys.any((key) => !changed.contains(key))) {
          throw const FormatException('站点版本不支持部分设置，请更新站点后重试');
        }
      }
      if (!mounted) return;
      setState(() {
        _initial = {..._values!};
        _dirty = false;
      });
      widget.onDirtyChanged?.call(false);
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('已保存，网站同步生效')));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存失败：$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<String?> _upload({bool audio = false, String imageKey = ''}) async {
    File? temporary;
    setState(() => _busy = true);
    try {
      File file;
      String type;
      if (audio) {
        final path = await const MethodChannel('memory_archive/files')
            .invokeMethod<String>('pickMp3');
        if (path == null) return null;
        file = File(path);
        temporary = file;
        type = 'audio/mpeg';
      } else {
        final selected = await ImagePicker().pickImage(
          source: ImageSource.gallery,
        );
        if (selected == null) return null;
        file = File(selected.path);
        final ext = selected.path.split('.').last.toLowerCase();
        type =
            {
              'jpg': 'image/jpeg',
              'jpeg': 'image/jpeg',
              'png': 'image/png',
              'gif': 'image/gif',
              'webp': 'image/webp',
            }[ext] ??
            '';
        if (type.isEmpty) {
          throw const FormatException('请选择 JPG、PNG、WebP 或 GIF 图片');
        }
        if (imageKey.isNotEmpty && type != 'image/gif') {
          if (!mounted) return null;
          final crop = await showDialog<Map<String, dynamic>>(
            context: context,
            builder: (_) => CropDialog(url: '', file: file, initial: const {}),
          );
          if (crop == null) return null;
          final bytes = await cropImageCopy(
            await file.readAsBytes(),
            crop,
            circle:
                imageKey == 'intro_logo' || imageKey == 'home_profile_avatar',
          );
          final folder = await getTemporaryDirectory();
          temporary = File(
            '${folder.path}/cropped-${DateTime.now().microsecondsSinceEpoch}.png',
          );
          await temporary.writeAsBytes(bytes);
          file = temporary;
          type = 'image/png';
        }
      }
      if (await file.length() > (audio ? 12 : 5) * 1024 * 1024) {
        throw FormatException(audio ? 'MP3 不能超过 12 MiB' : '图片不能超过 5 MiB');
      }
      final result = await ref
          .read(apiClientProvider)
          .uploadFile(file, contentType: type);
      return result['url'] as String;
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('上传失败：$e')));
      }
      return null;
    } finally {
      if (temporary != null && await temporary.exists()) {
        await temporary.delete();
      }
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _field(Map<String, dynamic> spec) {
    final key = spec['key'] as String, label = spec['label'] as String;
    final value = (_values![key] ?? spec['value']).toString();
    if (spec['kind'] == 'bool') {
      return SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(label),
        value: !['0', 'false', 'off', ''].contains(value),
        onChanged: _busy ? null : (v) => _change(key, v ? '1' : '0'),
      );
    }
    final options = Map<String, dynamic>.from(spec['choices'] as Map);
    if (spec['kind'] == 'choice') {
      return Padding(
        padding: const EdgeInsets.only(bottom: 18),
        child: DropdownButtonFormField<String>(
          initialValue: value,
          isExpanded: true,
          decoration: InputDecoration(labelText: label),
          items:
              {
                    ...options,
                    if (!options.containsKey(value))
                      value: value.isEmpty ? '未设置' : '当前设置：$value',
                  }.entries
                  .map(
                    (e) => DropdownMenuItem(
                      value: e.key,
                      child: Text(e.value.toString()),
                    ),
                  )
                  .toList(),
          onChanged: _busy
              ? null
              : (v) {
                  _change(key, v);
                  if (key == 'home_background_tone') {
                    final colors = {
                      'archive': ['#071f24', '#baff67'],
                      'midnight': ['#081a2b', '#8fd8ff'],
                      'lake': ['#06343a', '#8fffd0'],
                      'sunset': ['#30211f', '#ffc86a'],
                    }[v]!;
                    _change('home_background_color', colors[0]);
                    _change('home_accent_color', colors[1]);
                    _text['home_background_color']?.text = colors[0];
                    _text['home_accent_color']?.text = colors[1];
                  }
                  if (key == 'home_card_tone') {
                    final color = {
                      'youth': '#123b3b',
                      'sky': '#17364a',
                      'peach': '#4a302f',
                      'lavender': '#34324f',
                    }[v]!;
                    _change('home_card_tone_color', color);
                    _text['home_card_tone_color']?.text = color;
                  }
                },
        ),
      );
    }
    final number = spec['kind'] == 'number';
    final multiline =
        key.endsWith('_body') ||
        key.endsWith('_subtitle') ||
        key == 'profile_text' ||
        key.endsWith('_extra_text');
    final controller = _controller(key, spec['value'].toString());
    final text = TextFormField(
      key: ValueKey('field-$key'),
      controller: controller,
      enabled: !_busy,
      minLines: multiline ? 3 : 1,
      maxLines: multiline ? 10 : 1,
      keyboardType: number
          ? const TextInputType.numberWithOptions(decimal: true)
          : null,
      decoration: InputDecoration(labelText: label),
      onChanged: (v) => _change(key, v),
      validator: (v) {
        if (number && (v ?? '').isNotEmpty) {
          final n = double.tryParse(v!);
          final range = spec['range'] as List;
          if (n == null || !n.isFinite || n < range[0] || n > range[1]) {
            return '请输入 ${range[0]}–${range[1]}';
          }
        }
        if (spec['kind'] == 'color' &&
            !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(v ?? '')) {
          return '请输入颜色，如 #123b3b';
        }
        return null;
      },
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (spec['kind'] != 'image') text,
          if (spec['kind'] == 'image') ...[
            if (value.isNotEmpty && AppConfig.resolvePublicUrl(value) != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: SizedBox(
                  height: 190,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.network(
                      AppConfig.resolvePublicUrl(value).toString(),
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => const Text('图片暂时无法预览'),
                    ),
                  ),
                ),
              ),
            if (value.isEmpty)
              Container(
                height: 120,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text('尚未设置图片，请上传或填写地址'),
              ),
            const SizedBox(height: 12),
            text,
            Wrap(
              spacing: 12,
              children: [
                TextButton.icon(
                  icon: const Icon(Icons.photo_library_outlined),
                  label: const Text('从相册上传'),
                  onPressed: _busy
                      ? null
                      : () async {
                          final url = await _upload(imageKey: key);
                          if (url != null && mounted) {
                            controller.text = url;
                            _change(key, url);
                          }
                        },
                ),
                TextButton(
                  onPressed: _busy
                      ? null
                      : () {
                          controller.clear();
                          _change(key, '');
                        },
                  child: const Text('清除图片'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _list(
    String key,
    String title,
    Map<String, String> fields, {
    int limit = 20,
    bool intro = false,
    bool music = false,
  }) {
    List<Map<String, dynamic>> rows;
    try {
      rows = intro ? _nodes : decodeRows(_values![key] ?? '[]');
    } catch (_) {
      return Text('$title数据格式有误，请先通过网站后台修复；原内容会保留。');
    }
    void update(List<Map<String, dynamic>> next) {
      _revision++;
      if (intro) {
        setState(() {
          _nodes = next;
          _markDirty();
        });
      } else {
        _change(key, jsonEncode(next));
      }
    }

    return ExpansionTile(
      title: Text(title),
      initiallyExpanded: true,
      children: [
        for (var i = 0; i < rows.length; i++)
          Card(
            key: ValueKey('$key:$_revision:$i'),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                children: [
                  for (final f in fields.entries)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: TextFormField(
                        key: ValueKey('$key:$_revision:$i:${f.key}'),
                        initialValue: rows[i][f.key]?.toString() ?? '',
                        enabled: !_busy,
                        maxLines: f.key == 'text' ? 4 : 1,
                        decoration: InputDecoration(labelText: f.value),
                        onChanged: (v) {
                          rows[i][f.key] = v;
                          if (intro) {
                            _nodes = rows;
                            _markDirty();
                          } else {
                            _values![key] = jsonEncode(rows);
                            _markDirty();
                          }
                          setState(() {});
                        },
                      ),
                    ),
                  if (intro)
                    SwitchListTile(
                      title: const Text('显示节点'),
                      value: rows[i]['enabled'] != 0,
                      onChanged: _busy
                          ? null
                          : (v) {
                              rows[i]['enabled'] = v ? 1 : 0;
                              update(rows);
                            },
                    ),
                  Wrap(
                    children: [
                      IconButton(
                        tooltip: '上移',
                        icon: const Icon(Icons.arrow_upward),
                        onPressed: _busy || i == 0
                            ? null
                            : () {
                                final row = rows.removeAt(i);
                                rows.insert(i - 1, row);
                                update(rows);
                              },
                      ),
                      IconButton(
                        tooltip: '下移',
                        icon: const Icon(Icons.arrow_downward),
                        onPressed: _busy || i == rows.length - 1
                            ? null
                            : () {
                                final row = rows.removeAt(i);
                                rows.insert(i + 1, row);
                                update(rows);
                              },
                      ),
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () async {
                                if (await confirmRemoval(context, '移除这项内容？') &&
                                    mounted) {
                                  rows.removeAt(i);
                                  update(rows);
                                }
                              },
                        child: const Text('移除'),
                      ),
                      if (music)
                        TextButton(
                          onPressed: _busy
                              ? null
                              : () async {
                                  final url = await _upload(audio: true);
                                  if (url != null && mounted) {
                                    rows[i]['url'] = url;
                                    update(rows);
                                  }
                                },
                          child: const Text('更换 MP3'),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        TextButton.icon(
          icon: const Icon(Icons.add),
          label: Text('添加$title'),
          onPressed: _busy || rows.length >= limit
              ? null
              : () async {
                  String? url;
                  if (music) {
                    url = await _upload(audio: true);
                    if (url == null || !mounted) return;
                  }
                  rows.add({
                    for (final field in fields.keys) field: '',
                    if (intro) 'enabled': 1,
                    if (music) ...{
                      'id': 'track-${DateTime.now().microsecondsSinceEpoch}',
                      'name': '新歌曲',
                      'url': url,
                    },
                  });
                  update(rows);
                },
        ),
      ],
    );
  }

  Widget _cards({String? onlyKey}) {
    const titles = homeCardTitles;
    Map<String, dynamic> visibility, aspects, crops;
    List<String> order;
    try {
      visibility = decodeObject(_values!['home_card_visibility'] ?? '{}');
      aspects = decodeObject(_values!['home_card_aspects'] ?? '{}');
      crops = decodeObject(_values!['home_card_crops'] ?? '{}');
      final raw =
          jsonDecode((_values!['home_card_order'] ?? '[]').toString()) as List;
      order = uniqueHomeCardOrder(raw);
    } catch (_) {
      return const Text('栏目配置格式有误，原内容会保留。');
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (onlyKey == null)
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 8, 4, 16),
            child: Text(
              '栏目图片与调整',
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
        for (var i = 0; i < order.length; i++)
          if (onlyKey == null || order[i] == onlyKey)
            Card(
              key: ValueKey('card-${order[i]}'),
              margin: const EdgeInsets.only(bottom: 16),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      titles[order[i]]!,
                      style: Theme.of(context).textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 12),
                    _field(
                      adminFields.firstWhere(
                        (field) => field['key'] == order[i],
                      ),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('在首页显示此栏目'),
                      value: ![false, 0, '0'].contains(visibility[order[i]]),
                      onChanged: _busy
                          ? null
                          : (v) {
                              if (!v &&
                                  titles.keys
                                          .where(
                                            (k) => ![
                                              false,
                                              0,
                                              '0',
                                            ].contains(visibility[k]),
                                          )
                                          .length <=
                                      4) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('首页至少保留四个栏目')),
                                );
                                return;
                              }
                              visibility[order[i]] = v ? 1 : 0;
                              _change(
                                'home_card_visibility',
                                jsonEncode(visibility),
                              );
                            },
                    ),
                    Wrap(
                      children: [
                        IconButton(
                          tooltip: '栏目上移',
                          icon: const Icon(Icons.arrow_upward),
                          onPressed: _busy || i == 0
                              ? null
                              : () {
                                  final k = order.removeAt(i);
                                  order.insert(i - 1, k);
                                  _change('home_card_order', jsonEncode(order));
                                },
                        ),
                        IconButton(
                          tooltip: '栏目下移',
                          icon: const Icon(Icons.arrow_downward),
                          onPressed: _busy || i == order.length - 1
                              ? null
                              : () {
                                  final k = order.removeAt(i);
                                  order.insert(i + 1, k);
                                  _change('home_card_order', jsonEncode(order));
                                },
                        ),
                        TextButton(
                          onPressed:
                              _busy ||
                                  (_values![order[i]] ?? '').toString().isEmpty
                              ? null
                              : () async {
                                  final crop =
                                      await showDialog<Map<String, dynamic>>(
                                        context: context,
                                        builder: (_) => CropDialog(
                                          url: (_values![order[i]] ?? '')
                                              .toString(),
                                          initial: Map<String, dynamic>.from(
                                            (crops[order[i]] as Map?) ?? {},
                                          ),
                                        ),
                                      );
                                  if (crop != null && mounted) {
                                    crops[order[i]] = crop;
                                    _change(
                                      'home_card_crops',
                                      jsonEncode(crops),
                                    );
                                  }
                                },
                          child: const Text('调整图片取景'),
                        ),
                      ],
                    ),
                    DropdownButtonFormField<String>(
                      key: ValueKey(
                        'aspect-${order[i]}-${aspects[order[i]] ?? _values!['home_card_aspect_ratio']}',
                      ),
                      isExpanded: true,
                      initialValue:
                          (aspects[order[i]] ??
                                  _values!['home_card_aspect_ratio'] ??
                                  '14:9')
                              .toString(),
                      decoration: const InputDecoration(labelText: '栏目图片比例'),
                      items: ['14:9', '3:2', '4:3']
                          .map(
                            (v) => DropdownMenuItem(value: v, child: Text(v)),
                          )
                          .toList(),
                      onChanged: _busy
                          ? null
                          : (v) {
                              aspects[order[i]] = v;
                              _change('home_card_aspects', jsonEncode(aspects));
                            },
                    ),
                  ],
                ),
              ),
            ),
      ],
    );
  }

  List<Widget> _groupedFields() {
    final fields = adminFields
        .where(
          (field) => widget.section == null
              ? field['group'] == widget.group
              : fieldInSection(field, widget.section!),
        )
        .toList();
    final handled = <String>{};
    final panels = <String, List<Widget>>{};
    final images = <Widget>[];
    // Related settings stay directly beneath their own image preview.
    for (final field in fields.where((field) => field['kind'] == 'image')) {
      final key = field['key'] as String;
      handled.add(key);
      if (homeCardTitles.containsKey(key)) continue;
      final children = <Widget>[_field(field)];
      for (final related in imageRelatedFields[key] ?? <String>[]) {
        final matches = fields.where((field) => field['key'] == related);
        if (matches.isNotEmpty) {
          handled.add(related);
          children.add(_field(matches.first));
        }
      }
      images.add(
        AdminFormSection(
          key: ValueKey('image-$key'),
          title: field['label'] as String,
          children: children,
        ),
      );
    }
    for (final field in fields) {
      if (handled.contains(field['key'])) continue;
      panels
          .putIfAbsent(settingsPanelTitle(field), () => [])
          .add(_field(field));
    }
    return [
      for (final panel in panels.entries)
        AdminFormSection(title: panel.key, children: panel.value),
      ...images,
    ];
  }

  @override
  Widget build(BuildContext context) => _frame(_page(context));

  Widget _frame(Widget page) => widget.embedded
      ? page
      : PopScope(
          canPop: !_dirty && !_busy,
          onPopInvokedWithResult: (didPop, result) async {
            if (didPop || _busy) return;
            final discard = await confirmRemoval(context, '放弃尚未保存的修改？');
            if (discard && mounted) {
              setState(() => _dirty = false);
              Navigator.pop(context);
            }
          },
          child: page,
        );

  Widget _page(BuildContext context) => AdminPageWidth(
    child: Scaffold(
      appBar: widget.embedded ? null : AppBar(title: Text(widget.group)),
      bottomNavigationBar: _values == null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: FilledButton.icon(
                  onPressed: _busy ? null : _save,
                  icon: const Icon(Icons.save_outlined),
                  label: Text(_busy ? '正在处理…' : '保存${widget.group}'),
                ),
              ),
            ),
      body: _values == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator()
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!),
                        TextButton(onPressed: _load, child: const Text('重试')),
                      ],
                    ),
            )
          : Form(
              key: _form,
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  ..._groupedFields(),
                  if (widget.section == 'images' ||
                      (widget.section == null && widget.group == '首页与栏目图片'))
                    _cards(),
                  if (sectionCards.containsKey(widget.section))
                    _cards(onlyKey: sectionCards[widget.section]),
                  if (widget.section == 'timeline' ||
                      (widget.section == null && widget.group == '网站基础'))
                    _list('timeline_items', '时间线节点', {
                      'date': '时间',
                      'title': '标题',
                      'text': '正文',
                    }, limit: 8),
                  if (['settings', 'about'].contains(widget.section) ||
                      (widget.section == null && widget.group == '联系与应用'))
                    _list('contact_custom_links', '联系链接', {
                      'label': '链接名称',
                      'url': 'HTTPS 地址',
                    }, limit: 12),
                  if (widget.section == 'settings' ||
                      (widget.section == null && widget.group == '音乐'))
                    _list('music_playlist', '歌曲', {
                      'name': '歌曲名称',
                      'url': '本站 MP3 地址',
                    }, music: true),
                  if (_intro)
                    _list(
                      'intro_nodes',
                      '路线节点',
                      {'title': '节点标题', 'subtitle': '副标题'},
                      intro: true,
                      limit: 12,
                    ),
                  if (widget.footer != null) widget.footer!,
                ],
              ),
            ),
    ),
  );
}

class CropDialog extends StatefulWidget {
  const CropDialog({
    super.key,
    required this.url,
    required this.initial,
    this.file,
  });
  final String url;
  final File? file;
  final Map<String, dynamic> initial;
  @override
  State<CropDialog> createState() => _CropDialogState();
}

class _CropDialogState extends State<CropDialog> {
  late double left, top, width, height;
  double _aspect = 14 / 9;
  ImageStream? _stream;
  ImageStreamListener? _listener;
  @override
  void initState() {
    super.initState();
    left = (widget.initial['left'] as num?)?.toDouble() ?? 0;
    top = (widget.initial['top'] as num?)?.toDouble() ?? 0;
    width = (widget.initial['width'] as num?)?.toDouble() ?? 100;
    height = (widget.initial['height'] as num?)?.toDouble() ?? 100;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_stream != null) return;
    final uri = AppConfig.resolvePublicUrl(widget.url);
    final ImageProvider? provider = widget.file != null
        ? FileImage(widget.file!)
        : uri != null
        ? NetworkImage(uri.toString())
        : null;
    if (provider == null) return;
    _stream = provider.resolve(createLocalImageConfiguration(context));
    _listener = ImageStreamListener((info, _) {
      if (mounted) {
        setState(() => _aspect = info.image.width / info.image.height);
      }
    }, onError: (_, _) {});
    _stream!.addListener(_listener!);
  }

  @override
  void dispose() {
    if (_listener != null) _stream?.removeListener(_listener!);
    super.dispose();
  }

  Widget _slider(String label, double value, ValueChanged<double> onChanged) =>
      Column(
        children: [
          Text('$label ${value.round()}%'),
          Slider(
            value: value.clamp(0, 100),
            min: 0,
            max: 100,
            onChanged: onChanged,
          ),
        ],
      );
  @override
  Widget build(BuildContext context) {
    final uri = AppConfig.resolvePublicUrl(widget.url);
    return AlertDialog(
      title: const Text('图片取景'),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (uri != null || widget.file != null)
                AspectRatio(
                  aspectRatio: _aspect,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (widget.file != null)
                        Image.file(widget.file!, fit: BoxFit.fill)
                      else
                        Image.network(
                          uri.toString(),
                          fit: BoxFit.fill,
                          errorBuilder: (_, _, _) =>
                              const Icon(Icons.broken_image_outlined),
                        ),
                      LayoutBuilder(
                        builder: (_, box) => Stack(
                          children: [
                            Positioned(
                              left: box.maxWidth * left / 100,
                              top: box.maxHeight * top / 100,
                              width: box.maxWidth * width / 100,
                              height: box.maxHeight * height / 100,
                              child: Container(
                                decoration: BoxDecoration(
                                  border: Border.all(
                                    color: Colors.lime,
                                    width: 3,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              _slider(
                '左侧',
                left,
                (v) => setState(() {
                  left = v.clamp(0, 99);
                  width = width.clamp(1, 100 - left);
                }),
              ),
              _slider(
                '顶部',
                top,
                (v) => setState(() {
                  top = v.clamp(0, 99);
                  height = height.clamp(1, 100 - top);
                }),
              ),
              _slider(
                '宽度',
                width,
                (v) => setState(() => width = v.clamp(1, 100 - left)),
              ),
              _slider(
                '高度',
                height,
                (v) => setState(() => height = v.clamp(1, 100 - top)),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('取消'),
        ),
        TextButton(
          onPressed: () => setState(() {
            left = 0;
            top = 0;
            width = 100;
            height = 100;
          }),
          child: const Text('重置'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, {
            'left': left,
            'top': top,
            'width': width,
            'height': height,
          }),
          child: const Text('使用取景'),
        ),
      ],
    );
  }
}
