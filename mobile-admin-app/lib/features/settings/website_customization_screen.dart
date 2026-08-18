import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/config/app_config.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import 'website_text_screen.dart';

const _defaults = <String, String>{
  'site_title': 'INTO / 青春纪事',
  'browser_title': 'INTO / 青春纪事',
  'site_icon_url': '/favicon.svg',
  'nav_logo_url': '',
  'hero_primary_button': '开始翻阅',
  'hero_secondary_button': '进入 3D 记忆河',
  'primary_color': '#102d2d',
  'accent_color': '#d9ff80',
  'background_color': '#eff6ed',
  'color_mode': 'light',
  'home_background_url': '',
  'home_item_limit': '4',
  'show_stories': '1',
  'show_timeline': '1',
  'show_about': '1',
  'show_comments': '1',
  'corner_radius': '18',
  'glass_opacity': '0.68',
  'motion_intensity': 'normal',
  'particle_level': 'normal',
  'star_level': 'normal',
  'snow_level': 'normal',
  'quality_3d': 'balanced',
  'auto_rotate_speed': '0.22',
  'music_default_on': '0',
  'card_style': 'glass',
  'font_preset': 'modern',
  'github_url': 'https://github.com/jack-114514/into-youth-archive',
  'contact_email': 'hello@intovalabs.com',
  'mobile_effect_level': 'normal',
  'app_display_name': 'INTO 青春管理',
  'app_logo_url': '',
};

class WebsiteCustomizationScreen extends ConsumerWidget {
  const WebsiteCustomizationScreen({super.key});

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
      data: (data) => _CustomizationForm(initial: data),
    );
  }
}

class _CustomizationForm extends ConsumerStatefulWidget {
  const _CustomizationForm({required this.initial});

  final Map<String, dynamic> initial;

  @override
  ConsumerState<_CustomizationForm> createState() => _CustomizationFormState();
}

class _CustomizationFormState extends ConsumerState<_CustomizationForm> {
  final _formKey = GlobalKey<FormState>();
  final _picker = ImagePicker();
  late final Map<String, TextEditingController> _text;
  XFile? _siteIcon;
  XFile? _navLogo;
  XFile? _homeBackground;
  XFile? _appLogo;
  late String _colorMode;
  late String _motion;
  late String _particles;
  late String _stars;
  late String _snow;
  late String _quality3d;
  late String _cardStyle;
  late String _fontPreset;
  late String _mobileEffects;
  late double _homeLimit;
  late double _radius;
  late double _glass;
  late double _rotateSpeed;
  late bool _showStories;
  late bool _showTimeline;
  late bool _showAbout;
  late bool _showComments;
  late bool _musicDefault;
  bool _saving = false;
  double? _progress;

  String _value(String key) =>
      widget.initial[key]?.toString() ?? _defaults[key] ?? '';

  bool _bool(String key) => _value(key) == '1';

  @override
  void initState() {
    super.initState();
    _text = {
      for (final key in [
        'site_title',
        'browser_title',
        'site_icon_url',
        'nav_logo_url',
        'home_background_url',
        'hero_primary_button',
        'hero_secondary_button',
        'primary_color',
        'accent_color',
        'background_color',
        'github_url',
        'contact_email',
        'app_display_name',
        'app_logo_url',
      ])
        key: TextEditingController(text: _value(key)),
    };
    _colorMode = _value('color_mode');
    _motion = _value('motion_intensity');
    _particles = _value('particle_level');
    _stars = _value('star_level');
    _snow = _value('snow_level');
    _quality3d = _value('quality_3d');
    _cardStyle = _value('card_style');
    _fontPreset = _value('font_preset');
    _mobileEffects = _value('mobile_effect_level');
    _homeLimit = double.tryParse(_value('home_item_limit')) ?? 4;
    _radius = double.tryParse(_value('corner_radius')) ?? 18;
    _glass = double.tryParse(_value('glass_opacity')) ?? .68;
    _rotateSpeed = double.tryParse(_value('auto_rotate_speed')) ?? .22;
    _showStories = _bool('show_stories');
    _showTimeline = _bool('show_timeline');
    _showAbout = _bool('show_about');
    _showComments = _bool('show_comments');
    _musicDefault = _bool('music_default_on');
  }

  @override
  void dispose() {
    for (final controller in _text.values) {
      controller.dispose();
    }
    super.dispose();
  }

  String _absolute(String value) {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    if (value.isEmpty) return '';
    return '${AppConfig.publicBaseUrl}${value.startsWith('/') ? '' : '/'}$value';
  }

  Color _previewColor(String key, Color fallback) {
    final value = _text[key]!.text.trim();
    if (!RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(value)) return fallback;
    return Color(int.parse('FF${value.substring(1)}', radix: 16));
  }

  String? _colorValidator(String? value) {
    if (value == null || !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(value)) {
      return '请输入类似 #102d2d 的六位颜色值';
    }
    return null;
  }

  String _contentType(String path) {
    final lower = path.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
  }

  Future<void> _pick(String target) async {
    final file = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: target == 'background' ? 2560 : 1024,
      imageQuality: 88,
    );
    if (file == null || !mounted) return;
    setState(() {
      switch (target) {
        case 'favicon':
          _siteIcon = file;
          break;
        case 'nav':
          _navLogo = file;
          break;
        case 'background':
          _homeBackground = file;
          break;
        case 'app':
          _appLogo = file;
          break;
      }
    });
  }

  Future<String> _upload(XFile file) async {
    final response = await ref
        .read(apiClientProvider)
        .uploadFile(
          File(file.path),
          contentType: _contentType(file.path),
          onProgress: (sent, total) {
            if (mounted && total > 0) setState(() => _progress = sent / total);
          },
        );
    final url = response['url']?.toString() ?? '';
    if (url.isEmpty) throw const ApiException('服务器没有返回图片地址');
    return url;
  }

  void _resetDraft() {
    setState(() {
      for (final entry in _text.entries) {
        entry.value.text = _defaults[entry.key] ?? '';
      }
      _siteIcon = null;
      _navLogo = null;
      _homeBackground = null;
      _appLogo = null;
      _colorMode = 'light';
      _motion = 'normal';
      _particles = 'normal';
      _stars = 'normal';
      _snow = 'normal';
      _quality3d = 'balanced';
      _cardStyle = 'glass';
      _fontPreset = 'modern';
      _mobileEffects = 'normal';
      _homeLimit = 4;
      _radius = 18;
      _glass = .68;
      _rotateSpeed = .22;
      _showStories = true;
      _showTimeline = true;
      _showAbout = true;
      _showComments = true;
      _musicDefault = false;
    });
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('已恢复默认预览，点击保存后才会应用到网站')));
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      _saving = true;
      _progress = null;
    });
    try {
      if (_siteIcon != null) {
        _text['site_icon_url']!.text = await _upload(_siteIcon!);
      }
      if (_navLogo != null) {
        _text['nav_logo_url']!.text = await _upload(_navLogo!);
      }
      if (_homeBackground != null) {
        _text['home_background_url']!.text = await _upload(_homeBackground!);
      }
      if (_appLogo != null) {
        _text['app_logo_url']!.text = await _upload(_appLogo!);
      }
      final payload = <String, dynamic>{
        for (final entry in _text.entries) entry.key: entry.value.text.trim(),
        'color_mode': _colorMode,
        'home_item_limit': _homeLimit.round().toString(),
        'show_stories': _showStories ? '1' : '0',
        'show_timeline': _showTimeline ? '1' : '0',
        'show_about': _showAbout ? '1' : '0',
        'show_comments': _showComments ? '1' : '0',
        'corner_radius': _radius.round().toString(),
        'glass_opacity': _glass.toStringAsFixed(2),
        'motion_intensity': _motion,
        'particle_level': _particles,
        'star_level': _stars,
        'snow_level': _snow,
        'quality_3d': _quality3d,
        'auto_rotate_speed': _rotateSpeed.toStringAsFixed(2),
        'music_default_on': _musicDefault ? '1' : '0',
        'card_style': _cardStyle,
        'font_preset': _fontPreset,
        'mobile_effect_level': _mobileEffects,
      };
      await ref.read(apiClientProvider).patchJson('/settings', payload);
      ref.invalidate(websiteSettingsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('网站标识与个性化设置已保存')));
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

  Widget _imageSetting({
    required String title,
    required String keyName,
    required String target,
    required XFile? selected,
    required IconData fallback,
    String? help,
  }) {
    final saved = _text[keyName]!.text.trim();
    final image = selected != null
        ? FileImage(File(selected.path)) as ImageProvider
        : saved.isNotEmpty
        ? NetworkImage(_absolute(saved))
        : null;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: CircleAvatar(
        radius: 25,
        backgroundColor: AppTheme.mint,
        backgroundImage: image,
        child: image == null ? Icon(fallback) : null,
      ),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
      subtitle: Text(help ?? (saved.isEmpty ? '当前使用默认图标' : saved)),
      trailing: OutlinedButton(
        onPressed: _saving ? null : () => _pick(target),
        child: const Text('选择图片'),
      ),
    );
  }

  Widget _levelDropdown(
    String label,
    String value,
    ValueChanged<String?> onChanged,
  ) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      decoration: InputDecoration(labelText: label),
      items: const [
        DropdownMenuItem(value: 'off', child: Text('关闭')),
        DropdownMenuItem(value: 'low', child: Text('较低')),
        DropdownMenuItem(value: 'normal', child: Text('标准')),
        DropdownMenuItem(value: 'high', child: Text('较高')),
      ],
      onChanged: onChanged,
    );
  }

  @override
  Widget build(BuildContext context) {
    final primary = _previewColor('primary_color', AppTheme.ink);
    final accent = _previewColor('accent_color', AppTheme.acid);
    final background = _previewColor('background_color', AppTheme.mint);
    final savedPreviewLogo = _text['nav_logo_url']!.text.trim();
    final ImageProvider? previewLogo = _navLogo != null
        ? FileImage(File(_navLogo!.path))
        : savedPreviewLogo.isNotEmpty
        ? NetworkImage(_absolute(savedPreviewLogo))
        : null;
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 40),
        children: [
          Text('网站个性化', style: Theme.of(context).textTheme.headlineLarge),
          const SizedBox(height: 8),
          Text(
            '修改前先预览；保存后网站与 App 内品牌会同步读取。桌面应用名称和启动图标仍需重新构建 APK。',
            style: TextStyle(color: AppTheme.ink.withValues(alpha: .62)),
          ),
          const SizedBox(height: 20),
          Card(
            color: background,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: primary,
                    foregroundColor: accent,
                    backgroundImage: previewLogo,
                    child: previewLogo == null
                        ? const Text(
                            'IN',
                            style: TextStyle(fontWeight: FontWeight.w900),
                          )
                        : null,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _text['site_title']!.text.isEmpty
                              ? _defaults['site_title']!
                              : _text['site_title']!.text,
                          style: TextStyle(
                            color: primary,
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          _text['browser_title']!.text,
                          style: TextStyle(
                            color: primary.withValues(alpha: .62),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    width: 54,
                    height: 38,
                    decoration: BoxDecoration(
                      color: accent,
                      borderRadius: BorderRadius.circular(_radius / 2),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          _SectionCard(
            title: '网站标识',
            children: [
              TextFormField(
                controller: _text['site_title'],
                decoration: const InputDecoration(labelText: '网站显示名称'),
                maxLength: 80,
                onChanged: (_) => setState(() {}),
              ),
              TextFormField(
                controller: _text['browser_title'],
                decoration: const InputDecoration(labelText: '浏览器标签页名称'),
                maxLength: 100,
                onChanged: (_) => setState(() {}),
              ),
              _imageSetting(
                title: '网站 favicon',
                keyName: 'site_icon_url',
                target: 'favicon',
                selected: _siteIcon,
                fallback: Icons.language_rounded,
                help: '建议使用正方形 PNG/WebP，浏览器可能短暂保留旧缓存',
              ),
              _imageSetting(
                title: '网页导航栏 Logo',
                keyName: 'nav_logo_url',
                target: 'nav',
                selected: _navLogo,
                fallback: Icons.web_asset_rounded,
              ),
            ],
          ),
          const SizedBox(height: 14),
          _SectionCard(
            title: '颜色与页面风格',
            children: [
              DropdownButtonFormField<String>(
                initialValue: _colorMode,
                decoration: const InputDecoration(labelText: '明暗主题'),
                items: const [
                  DropdownMenuItem(value: 'light', child: Text('浅色')),
                  DropdownMenuItem(value: 'dark', child: Text('深色')),
                ],
                onChanged: (value) =>
                    setState(() => _colorMode = value ?? 'light'),
              ),
              for (final entry in const [
                ('primary_color', '主色'),
                ('accent_color', '辅助色'),
                ('background_color', '背景色'),
              ])
                TextFormField(
                  controller: _text[entry.$1],
                  decoration: InputDecoration(labelText: entry.$2),
                  validator: _colorValidator,
                  onChanged: (_) => setState(() {}),
                ),
              DropdownButtonFormField<String>(
                initialValue: _cardStyle,
                decoration: const InputDecoration(labelText: '首页卡片样式'),
                items: const [
                  DropdownMenuItem(value: 'glass', child: Text('玻璃拟态')),
                  DropdownMenuItem(value: 'paper', child: Text('青春相纸')),
                  DropdownMenuItem(value: 'solid', child: Text('简约实色')),
                ],
                onChanged: (value) =>
                    setState(() => _cardStyle = value ?? 'glass'),
              ),
              DropdownButtonFormField<String>(
                initialValue: _fontPreset,
                decoration: const InputDecoration(labelText: '字体预设'),
                items: const [
                  DropdownMenuItem(value: 'modern', child: Text('现代简约')),
                  DropdownMenuItem(value: 'serif', child: Text('人文宋体')),
                  DropdownMenuItem(value: 'rounded', child: Text('青春圆体')),
                ],
                onChanged: (value) =>
                    setState(() => _fontPreset = value ?? 'modern'),
              ),
              _LabeledSlider(
                label: '圆角大小',
                valueLabel: '${_radius.round()} px',
                value: _radius,
                min: 10,
                max: 32,
                divisions: 22,
                onChanged: (value) => setState(() => _radius = value),
              ),
              _LabeledSlider(
                label: '玻璃透明度',
                valueLabel: '${(_glass * 100).round()}%',
                value: _glass,
                min: .35,
                max: .9,
                divisions: 11,
                onChanged: (value) => setState(() => _glass = value),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _SectionCard(
            title: '首页内容与联系信息',
            children: [
              _imageSetting(
                title: '首页背景图片',
                keyName: 'home_background_url',
                target: 'background',
                selected: _homeBackground,
                fallback: Icons.wallpaper_rounded,
                help: '留空时继续使用当前渐变背景',
              ),
              TextFormField(
                controller: _text['hero_primary_button'],
                decoration: const InputDecoration(labelText: '首页主按钮文字'),
                maxLength: 30,
              ),
              TextFormField(
                controller: _text['hero_secondary_button'],
                decoration: const InputDecoration(labelText: '3D入口按钮文字'),
                maxLength: 30,
              ),
              _LabeledSlider(
                label: '首页默认展示图片数量',
                valueLabel: '${_homeLimit.round()} 张',
                value: _homeLimit,
                min: 1,
                max: 12,
                divisions: 11,
                onChanged: (value) => setState(() => _homeLimit = value),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('显示校园片段'),
                value: _showStories,
                onChanged: (value) => setState(() => _showStories = value),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('显示青春时间线'),
                value: _showTimeline,
                onChanged: (value) => setState(() => _showTimeline = value),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('显示关于我'),
                value: _showAbout,
                onChanged: (value) => setState(() => _showAbout = value),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('显示留言区'),
                value: _showComments,
                onChanged: (value) => setState(() => _showComments = value),
              ),
              TextFormField(
                controller: _text['github_url'],
                decoration: const InputDecoration(labelText: 'GitHub 开源地址'),
                keyboardType: TextInputType.url,
              ),
              TextFormField(
                controller: _text['contact_email'],
                decoration: const InputDecoration(labelText: '联系邮箱'),
                keyboardType: TextInputType.emailAddress,
              ),
            ],
          ),
          const SizedBox(height: 14),
          _SectionCard(
            title: '动效与3D质量',
            children: [
              _levelDropdown('动画速度和动效强度', _motion, (value) {
                setState(() => _motion = value ?? 'normal');
              }),
              _levelDropdown('首页粒子数量', _particles, (value) {
                setState(() => _particles = value ?? 'normal');
              }),
              _levelDropdown('3D星光数量', _stars, (value) {
                setState(() => _stars = value ?? 'normal');
              }),
              _levelDropdown('3D雪花数量', _snow, (value) {
                setState(() => _snow = value ?? 'normal');
              }),
              DropdownButtonFormField<String>(
                initialValue: _quality3d,
                decoration: const InputDecoration(labelText: '3D质量'),
                items: const [
                  DropdownMenuItem(value: 'smooth', child: Text('流畅')),
                  DropdownMenuItem(value: 'balanced', child: Text('均衡')),
                  DropdownMenuItem(value: 'high', child: Text('高质量')),
                ],
                onChanged: (value) =>
                    setState(() => _quality3d = value ?? 'balanced'),
              ),
              _LabeledSlider(
                label: '3D自动旋转速度',
                valueLabel: _rotateSpeed.toStringAsFixed(2),
                value: _rotateSpeed,
                min: 0,
                max: .6,
                divisions: 12,
                onChanged: (value) => setState(() => _rotateSpeed = value),
              ),
              _levelDropdown('手机端特效强度', _mobileEffects, (value) {
                setState(() => _mobileEffects = value ?? 'normal');
              }),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('进入首页时默认准备环境音乐'),
                subtitle: const Text('浏览器要求用户首次点击后才能开始播放'),
                value: _musicDefault,
                onChanged: (value) => setState(() => _musicDefault = value),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _SectionCard(
            title: 'App 内部品牌',
            children: [
              TextFormField(
                controller: _text['app_display_name'],
                decoration: const InputDecoration(labelText: 'App 页面内部显示名称'),
                maxLength: 50,
              ),
              _imageSetting(
                title: 'App 页面内部 Logo',
                keyName: 'app_logo_url',
                target: 'app',
                selected: _appLogo,
                fallback: Icons.admin_panel_settings_rounded,
                help: '只改变 App 页面内部；Android 桌面图标需重新构建 APK',
              ),
            ],
          ),
          if (_progress != null) ...[
            const SizedBox(height: 14),
            LinearProgressIndicator(value: _progress),
          ],
          const SizedBox(height: 18),
          OutlinedButton.icon(
            onPressed: _saving ? null : _resetDraft,
            icon: const Icon(Icons.restart_alt_rounded),
            label: const Text('恢复默认名称、图标与设计预览'),
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            key: const Key('save-website-customization'),
            onPressed: _saving ? null : _save,
            icon: _saving
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save_outlined),
            label: Text(_saving ? '正在保存与上传…' : '保存个性化设置'),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 14),
            for (var index = 0; index < children.length; index++) ...[
              children[index],
              if (index != children.length - 1) const SizedBox(height: 12),
            ],
          ],
        ),
      ),
    );
  }
}

class _LabeledSlider extends StatelessWidget {
  const _LabeledSlider({
    required this.label,
    required this.valueLabel,
    required this.value,
    required this.min,
    required this.max,
    required this.divisions,
    required this.onChanged,
  });

  final String label;
  final String valueLabel;
  final double value;
  final double min;
  final double max;
  final int divisions;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text(label)),
            Text(
              valueLabel,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ],
        ),
        Slider(
          value: value.clamp(min, max).toDouble(),
          min: min,
          max: max,
          divisions: divisions,
          onChanged: onChanged,
        ),
      ],
    );
  }
}
