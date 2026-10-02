import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/network/api_client.dart';

abstract class PetSettingsRepository {
  Future<Map<String, dynamic>> load();
  Future<Map<String, dynamic>> save(Map<String, dynamic> settings, String key);
}

class _ApiPetSettingsRepository implements PetSettingsRepository {
  _ApiPetSettingsRepository(this.client);
  final ApiClient client;
  @override
  Future<Map<String, dynamic>> load() => client.getJson('/pet');
  @override
  Future<Map<String, dynamic>> save(
    Map<String, dynamic> settings,
    String key,
  ) => client.patchJson('/pet', {
    'settings': settings,
    if (key.isNotEmpty) 'apiKey': key,
  });
}

final petSettingsRepositoryProvider = Provider<PetSettingsRepository>(
  (ref) => _ApiPetSettingsRepository(ref.watch(apiClientProvider)),
);
final petSettingsProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => ref.watch(petSettingsRepositoryProvider).load(),
);

class PetSettingsScreen extends ConsumerWidget {
  const PetSettingsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(title: const Text('AI 助手设置')),
    body: ref
        .watch(petSettingsProvider)
        .when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('无法读取助手设置：$error\n请确认站点已更新，并重新登录。'),
                  TextButton(
                    onPressed: () => ref.invalidate(petSettingsProvider),
                    child: const Text('重试'),
                  ),
                ],
              ),
            ),
          ),
          data: (data) => _PetForm(initial: data),
        ),
  );
}

class _PetForm extends ConsumerStatefulWidget {
  const _PetForm({required this.initial});
  final Map<String, dynamic> initial;
  @override
  ConsumerState<_PetForm> createState() => _PetFormState();
}

class _PetFormState extends ConsumerState<_PetForm> {
  late Map<String, dynamic> _settings;
  final _form = GlobalKey<FormState>();
  final _key = TextEditingController();
  final Map<String, TextEditingController> _text = {};
  String _mask = '';
  bool _busy = false;
  String _message = '';
  static const _characters = {
    'moling': '墨灵 · 原创图片角色',
    'miku': '初音未来',
    'haru': 'Haru',
    'haru-soft': 'Haru 柔和色调',
    'custom': '自定义 Live2D',
  };
  static const _toggles = {
    'enabled': '开启助手',
    'aiEnabled': '开启 AI 对话',
    'draggable': '允许拖动',
    'mouseFollow': '眼睛跟随鼠标',
    'randomAction': '随机动作',
    'bubbleEnabled': '对话气泡',
    'welcomeEnabled': '欢迎气泡',
    'autoBubbleEnabled': '定时气泡',
  };
  @override
  void initState() {
    super.initState();
    _settings = Map<String, dynamic>.from(widget.initial['settings'] as Map);
    _mask = widget.initial['keyMask']?.toString() ?? '';
    for (final field in [
      'name',
      'systemPrompt',
      'model',
      'modelUrl',
      'maxTokens',
    ]) {
      _text[field] = TextEditingController(
        text: (_settings[field] ?? (field == 'maxTokens' ? 5000 : ''))
            .toString(),
      );
    }
    final tones = (_settings['tones'] as Map?) ?? {};
    _text['tone'] = TextEditingController(
      text: tones[_toneCharacter]?.toString() ?? '',
    );
  }

  String get _toneCharacter => _settings['character'] == 'haru-soft'
      ? 'haru'
      : _settings['character'].toString();
  void _storeTone() {
    _settings['tones'] = {
      ...?_settings['tones'] as Map?,
      _toneCharacter: _text['tone']!.text,
    };
  }

  @override
  void dispose() {
    _key.dispose();
    for (final controller in _text.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    _storeTone();
    final value = {..._settings};
    for (final field in ['name', 'systemPrompt', 'model', 'modelUrl']) {
      value[field] = _text[field]!.text.trim();
    }
    value['maxTokens'] = int.parse(_text['maxTokens']!.text.trim());
    setState(() {
      _busy = true;
      _message = '';
    });
    try {
      final result = await ref
          .read(petSettingsRepositoryProvider)
          .save(value, _key.text.trim());
      if (!mounted) return;
      setState(() {
        _settings = Map<String, dynamic>.from(result['settings'] as Map);
        _mask = result['keyMask']?.toString() ?? '';
        _key.clear();
        _message = '助手设置已保存';
      });
    } catch (error) {
      if (mounted) setState(() => _message = '保存失败：$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _field(
    String field,
    String label, {
    int lines = 1,
    int? limit,
    String? hint,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: TextFormField(
      controller: _text[field],
      enabled: !_busy,
      minLines: lines,
      maxLines: lines + (lines > 1 ? 8 : 0),
      maxLength: limit,
      decoration: InputDecoration(labelText: label, helperText: hint),
      validator: (value) {
        if (['name', 'model'].contains(field) && (value ?? '').trim().isEmpty)
          return '请填写$label';
        if (field == 'maxTokens') {
          final tokens = int.tryParse((value ?? '').trim());
          if (tokens == null || tokens < 500 || tokens > 10000)
            return '请输入 500–10000 的整数';
        }
        if (field == 'modelUrl' &&
            _settings['character'] == 'custom' &&
            (value ?? '').trim().isEmpty)
          return '请填写自定义模型地址';
        return null;
      },
      keyboardType: field == 'maxTokens' ? TextInputType.number : null,
    ),
  );
  @override
  Widget build(BuildContext context) => Form(
    key: _form,
    child: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text('网页上的墨灵支持 14 种表情、12 种动作、3 组拖拽反应与挥手告别。助手在电脑网页显示；这里管理站点配置。'),
        const SizedBox(height: 20),
        _field('name', '助手名称', limit: 40),
        DropdownButtonFormField<String>(
          initialValue: _settings['character'].toString(),
          isExpanded: true,
          decoration: const InputDecoration(labelText: '助手形象'),
          items:
              {
                    ..._characters,
                    if (!_characters.containsKey(_settings['character']))
                      _settings['character'].toString(): '已有自定义角色',
                  }.entries
                  .map(
                    (e) => DropdownMenuItem(value: e.key, child: Text(e.value)),
                  )
                  .toList(),
          onChanged: _busy
              ? null
              : (value) {
                  _storeTone();
                  setState(() {
                    _settings['character'] = value;
                    _text['tone']!.text =
                        (_settings['tones'] as Map)[_toneCharacter]
                            ?.toString() ??
                        '';
                  });
                },
        ),
        const SizedBox(height: 20),
        if (_settings['character'] == 'custom')
          _field('modelUrl', '模型地址', limit: 1000),
        _field('tone', '说话风格', lines: 3, limit: 600),
        _field('systemPrompt', 'AI 助手人设', lines: 8, limit: 6000),
        _field('maxTokens', '输出上限', hint: '默认 5000，最高 10000。'),
        _field('model', 'AI 模型', limit: 80),
        TextFormField(
          controller: _key,
          enabled: !_busy,
          obscureText: true,
          enableSuggestions: false,
          autocorrect: false,
          decoration: InputDecoration(
            labelText: '新的 DeepSeek API Key',
            helperText: _mask.isEmpty ? '尚未配置；保存后清空输入。' : '已配置 $_mask；留空保留。',
          ),
        ),
        const SizedBox(height: 16),
        DropdownButtonFormField<int>(
          initialValue: (_settings['maxFPS'] as num?)?.toInt() ?? 30,
          decoration: const InputDecoration(labelText: '动画帧率上限'),
          items: [30, 24, 20, 15, 10, 5]
              .map(
                (fps) => DropdownMenuItem(value: fps, child: Text('$fps FPS')),
              )
              .toList(),
          onChanged: _busy
              ? null
              : (value) => setState(() => _settings['maxFPS'] = value),
        ),
        const SizedBox(height: 16),
        for (final e in _toggles.entries)
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(
              e.key == 'mouseFollow' && _settings['character'] != 'moling'
                  ? '鼠标跟随'
                  : e.value,
            ),
            value: _settings[e.key] == true,
            onChanged: _busy
                ? null
                : (value) => setState(() => _settings[e.key] = value),
          ),
        const Text(
          '每位访客最多 20 次/分钟、60 次/10分钟，超额休息 5 分钟。休息期间不调用 AI API；同一 IP 的独立访客分别计数。',
        ),
        const SizedBox(height: 16),
        if (_message.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(_message),
          ),
        FilledButton.icon(
          onPressed: _busy ? null : _save,
          icon: const Icon(Icons.save_outlined),
          label: Text(_busy ? '正在保存…' : '保存助手设置'),
        ),
      ],
    ),
  );
}
