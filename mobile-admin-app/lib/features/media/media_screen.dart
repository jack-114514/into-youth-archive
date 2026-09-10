import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:video_compress/video_compress.dart';

import '../../core/config/app_config.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';

final mediaProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((
  ref,
) async {
  final data = await ref.watch(apiClientProvider).getJson('/media');
  return (data['media'] as List? ?? const [])
      .whereType<Map>()
      .map((item) => item.cast<String, dynamic>())
      .toList();
});

class MediaScreen extends ConsumerWidget {
  const MediaScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final media = ref.watch(mediaProvider);
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(context, ref),
        icon: const Icon(Icons.add_rounded),
        label: const Text('新增内容'),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(mediaProvider.future),
        child: media.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              const SizedBox(height: 180),
              Center(child: Text(error.toString())),
            ],
          ),
          data: (items) => CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
                sliver: SliverToBoxAdapter(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '图片与内容',
                        style: Theme.of(context).textTheme.headlineLarge,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '共 ${items.length} 条 · 下拉刷新',
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
                  child: Center(child: Text('还没有内容，点击右下角开始添加')),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 100),
                  sliver: SliverList.separated(
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final item = items[index];
                      return _MediaCard(
                        item: item,
                        onEdit: () => _openEditor(context, ref, item: item),
                        onDelete: () => _delete(context, ref, item),
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openEditor(
    BuildContext context,
    WidgetRef ref, {
    Map<String, dynamic>? item,
  }) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: AppTheme.mint,
      builder: (_) => _MediaEditor(item: item),
    );
    if (changed == true) ref.invalidate(mediaProvider);
  }

  Future<void> _delete(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> item,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('删除这条内容？'),
        content: Text('“${item['title'] ?? '未命名内容'}”将从网站内容列表中移除。'),
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
    if (confirmed != true || !context.mounted) return;
    try {
      await ref.read(apiClientProvider).deleteJson('/media/${item['id']}');
      ref.invalidate(mediaProvider);
    } on ApiException catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }
}

class _MediaCard extends StatelessWidget {
  const _MediaCard({
    required this.item,
    required this.onEdit,
    required this.onDelete,
  });

  final Map<String, dynamic> item;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final imageUri = AppConfig.resolvePublicUrl(item['url']?.toString() ?? '');
    final hasVideo = (item['video_url']?.toString() ?? '').isNotEmpty;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Container(
                width: 86,
                height: 86,
                color: AppTheme.ink.withValues(alpha: .08),
                child: imageUri == null
                    ? Icon(
                        hasVideo
                            ? Icons.videocam_outlined
                            : Icons.image_outlined,
                      )
                    : Image.network(
                        imageUri.toString(),
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) =>
                            const Icon(Icons.broken_image_outlined),
                      ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          item['title']?.toString() ?? '未命名内容',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                      ),
                      Text('#${item['sort_order'] ?? '-'}'),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Text(
                    [item['taken_at'], item['meta']]
                        .where(
                          (value) =>
                              value != null && value.toString().isNotEmpty,
                        )
                        .join(' · '),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 9),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      _Flag(label: '首页', enabled: item['show_on_home'] == 1),
                      _Flag(label: '3D', enabled: item['show_in_3d'] == 1),
                      if (hasVideo) const _Flag(label: '视频', enabled: true),
                    ],
                  ),
                ],
              ),
            ),
            PopupMenuButton<String>(
              onSelected: (value) => value == 'edit' ? onEdit() : onDelete(),
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'edit', child: Text('编辑')),
                PopupMenuItem(value: 'delete', child: Text('删除')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Flag extends StatelessWidget {
  const _Flag({required this.label, required this.enabled});

  final String label;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: enabled
            ? AppTheme.acid.withValues(alpha: .48)
            : AppTheme.ink.withValues(alpha: .06),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(label, style: const TextStyle(fontSize: 12)),
    );
  }
}

class _MediaEditor extends ConsumerStatefulWidget {
  const _MediaEditor({this.item});

  final Map<String, dynamic>? item;

  @override
  ConsumerState<_MediaEditor> createState() => _MediaEditorState();
}

class _MediaEditorState extends ConsumerState<_MediaEditor> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _title;
  late final TextEditingController _meta;
  late final TextEditingController _body;
  late final TextEditingController _takenAt;
  late final TextEditingController _order;
  late bool _showOnHome;
  late bool _showIn3d;
  XFile? _image;
  XFile? _video;
  bool _saving = false;
  double? _progress;

  @override
  void initState() {
    super.initState();
    final item = widget.item ?? const <String, dynamic>{};
    _title = TextEditingController(text: item['title']?.toString() ?? '');
    _meta = TextEditingController(text: item['meta']?.toString() ?? '');
    _body = TextEditingController(text: item['body']?.toString() ?? '');
    _takenAt = TextEditingController(text: item['taken_at']?.toString() ?? '');
    _order = TextEditingController(text: item['sort_order']?.toString() ?? '');
    _showOnHome = item['show_on_home'] != 0;
    _showIn3d = item['show_in_3d'] != 0;
  }

  @override
  void dispose() {
    _title.dispose();
    _meta.dispose();
    _body.dispose();
    _takenAt.dispose();
    _order.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (file != null) setState(() => _image = file);
  }

  Future<void> _pickVideo() async {
    final file = await ImagePicker().pickVideo(source: ImageSource.gallery);
    if (file != null) setState(() => _video = file);
  }

  Future<String> _upload(XFile file, String contentType) async {
    final response = await ref
        .read(apiClientProvider)
        .uploadFile(
          File(file.path),
          contentType: contentType,
          onProgress: (sent, total) {
            if (mounted && total > 0) setState(() => _progress = sent / total);
          },
        );
    return response['url']?.toString() ?? '';
  }

  Future<XFile> _prepareImage(XFile source) async {
    final directory = await getTemporaryDirectory();
    final target =
        '${directory.path}${Platform.pathSeparator}image-${DateTime.now().microsecondsSinceEpoch}.jpg';
    final compressed = await FlutterImageCompress.compressAndGetFile(
      source.path,
      target,
      minWidth: 1920,
      minHeight: 1920,
      quality: 86,
      format: CompressFormat.jpeg,
      keepExif: true,
    );
    return compressed ?? source;
  }

  Future<XFile> _prepareVideo(XFile source) async {
    final info = await VideoCompress.compressVideo(
      source.path,
      quality: VideoQuality.Res1280x720Quality,
      deleteOrigin: false,
      includeAudio: true,
    );
    final file = info?.file;
    if (file == null) throw const ApiException('视频压缩失败，请重新选择');
    if (await file.length() > 18 * 1024 * 1024) {
      throw const ApiException('720P 视频仍超过 18MB，请裁剪到 10 秒以内');
    }
    return XFile(file.path);
  }

  String _imageContentType(String path) {
    final lower = path.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _progress = null;
    });
    try {
      final existing = widget.item ?? const <String, dynamic>{};
      var imageUrl = existing['url']?.toString() ?? '';
      var videoUrl = existing['video_url']?.toString() ?? '';
      if (_image != null) {
        final preparedImage = await _prepareImage(_image!);
        imageUrl = await _upload(
          preparedImage,
          _imageContentType(preparedImage.path),
        );
      }
      if (_video != null) {
        final preparedVideo = await _prepareVideo(_video!);
        videoUrl = await _upload(preparedVideo, 'video/mp4');
      }
      final payload = <String, dynamic>{
        'url': imageUrl,
        'video_url': videoUrl,
        'title': _title.text,
        'meta': _meta.text,
        'body': _body.text,
        'taken_at': _takenAt.text,
        'sort_order': _order.text,
        'show_on_home': _showOnHome,
        'show_in_3d': _showIn3d,
      };
      if (widget.item == null) {
        await ref.read(apiClientProvider).postJson('/media', payload);
      } else {
        await ref
            .read(apiClientProvider)
            .patchJson('/media/${widget.item!['id']}', payload);
      }
      if (mounted) Navigator.pop(context, true);
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
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .92,
      minChildSize: .65,
      maxChildSize: .96,
      builder: (context, controller) => Form(
        key: _formKey,
        child: ListView(
          controller: controller,
          padding: EdgeInsets.fromLTRB(
            20,
            14,
            20,
            24 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          children: [
            Center(
              child: Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: AppTheme.ink.withValues(alpha: .18),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              widget.item == null ? '加入一段记忆' : '编辑内容',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _saving ? null : _pickImage,
                    icon: const Icon(Icons.image_outlined),
                    label: Text(_image == null ? '选择图片' : '已选择图片'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _saving ? null : _pickVideo,
                    icon: const Icon(Icons.videocam_outlined),
                    label: Text(_video == null ? '选择视频' : '已选择视频'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _title,
              decoration: const InputDecoration(labelText: '标题'),
              validator: (value) =>
                  value == null || value.trim().isEmpty ? '请输入标题' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _meta,
              decoration: const InputDecoration(labelText: '地点 / 说明'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _body,
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(labelText: '正文'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _takenAt,
              decoration: const InputDecoration(
                labelText: '拍摄时间',
                hintText: '2026-08-14 18:30',
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _order,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: '展示顺序（可选）',
                helperText: '留空时按拍摄时间自动排序',
              ),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('在首页展示'),
              value: _showOnHome,
              onChanged: _saving
                  ? null
                  : (value) => setState(() => _showOnHome = value),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('放入 3D 记忆树'),
              value: _showIn3d,
              onChanged: _saving
                  ? null
                  : (value) => setState(() => _showIn3d = value),
            ),
            if (_progress != null) ...[
              const SizedBox(height: 8),
              LinearProgressIndicator(value: _progress),
            ],
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _saving ? null : _save,
              icon: _saving
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(_saving ? '正在保存…' : '保存内容'),
            ),
          ],
        ),
      ),
    );
  }
}
