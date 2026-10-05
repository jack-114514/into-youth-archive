const homeCardTitles = {
  'home_card_story_image': '青春故事集',
  'home_card_memory_image': '3D 粒子树',
  'home_card_timeline_image': '时间线',
  'home_card_campus_image': '校园碎片',
  'home_card_notes_image': '随手记',
  'home_card_about_image': '关于我们',
  'home_card_messages_image': '留言操场',
};

List<String> uniqueHomeCardOrder(List<dynamic> raw) => [
  ...raw.whereType<String>().where(homeCardTitles.containsKey).toSet(),
  ...homeCardTitles.keys.where((key) => !raw.contains(key)),
];

/// Each image owns its appearance/framing controls; never render those twice.
const imageRelatedFields = <String, List<String>>{
  'home_background_url': [
    'home_background_tone',
    'home_background_color',
    'home_accent_color',
    'home_background_overlay_opacity',
    'home_background_blur',
  ],
  'home_hero_image': ['home_hero_caption_kicker', 'home_hero_caption_title'],
  'intro_logo': [
    'intro_watermark_opacity',
    'intro_watermark_1',
    'intro_watermark_2',
  ],
  'intro_background_image': [
    'intro_background_blur',
    'intro_background_brightness',
    'intro_background_overlay',
  ],
  'intro_background_desktop_image': [
    'intro_background_desktop_x',
    'intro_background_desktop_y',
    'intro_background_desktop_zoom',
    'intro_background_desktop_crop_left',
    'intro_background_desktop_crop_top',
    'intro_background_desktop_crop_width',
    'intro_background_desktop_crop_height',
    'intro_background_desktop_ratio_locked',
  ],
  'intro_background_mobile_image': [
    'intro_background_mobile_x',
    'intro_background_mobile_y',
    'intro_background_mobile_zoom',
    'intro_background_mobile_crop_left',
    'intro_background_mobile_crop_top',
    'intro_background_mobile_crop_width',
    'intro_background_mobile_crop_height',
    'intro_background_mobile_ratio_locked',
  ],
};

String settingsPanelTitle(Map<String, dynamic> field) {
  final key = field['key'] as String;
  if (key.startsWith('intro_')) return '开场文字与流程';
  if (key.startsWith('home_card_') || key == 'home_item_limit') {
    return '栏目卡片整体外观';
  }
  if (key.startsWith('home_hero_') || key.startsWith('hero_')) return '首页文案与动效';
  if (field['group'] == '文字与排版') return '栏目文案与排版';
  if (field['group'] == '3D 与动效') return '3D 场景与动效';
  if (field['group'] == '音乐') return '音乐播放设置';
  if (field['group'] == '联系与应用') return '联系信息与应用';
  if (key.startsWith('notes_')) return '随手记内容';
  if (key == 'profile_text') return '个人介绍';
  return '网站品牌与显示';
}
