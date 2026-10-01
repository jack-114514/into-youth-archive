import type { CSSProperties } from "react";
import { defaultHomeVisualSettings, homeCardAspectRatioNumber, homeCardToneOptions, homeVisualCardDefinitions, homeVisualOverlay, normalizeHomeBackgroundBlur, normalizeHomeBackgroundOverlayOpacity, normalizeHomeBackgroundTone, normalizeHomeCardAspects, normalizeHomeCardCrops, normalizeHomeCardOpacity, normalizeHomeCardOrder, normalizeHomeCardTone, normalizeHomeCardVisibility, normalizeHomeVisualAsset, normalizeHomeVisualColor } from "./homeVisuals";

type Props = { settings: Record<string, string>; viewport?: "desktop" | "mobile" };

export default function HomeVisualPreview({ settings, viewport = "desktop" }: Props) {
  const tone = normalizeHomeBackgroundTone(settings.home_background_tone);
  const base = normalizeHomeVisualColor(settings.home_background_color, defaultHomeVisualSettings.home_background_color);
  const accent = normalizeHomeVisualColor(settings.home_accent_color, defaultHomeVisualSettings.home_accent_color);
  const cardTone = normalizeHomeCardTone(settings.home_card_tone);
  const cardColor = normalizeHomeVisualColor(settings.home_card_tone_color, homeCardToneOptions.find((item) => item.value === cardTone)?.color || defaultHomeVisualSettings.home_card_tone_color);
  const cardOpacity = normalizeHomeCardOpacity(settings.home_card_surface_opacity, 62);
  const shade = normalizeHomeCardOpacity(settings.home_card_image_overlay_opacity, 42);
  const background = normalizeHomeVisualAsset(settings.home_background_url, "/assets/demo-5.svg");
  const hero = normalizeHomeVisualAsset(settings.home_hero_image, "/assets/demo-5.svg");
  const avatar = normalizeHomeVisualAsset(settings.home_profile_avatar, "/assets/demo-intro.svg");
  const crops = normalizeHomeCardCrops(settings.home_card_crops);
  const aspects = normalizeHomeCardAspects(settings.home_card_aspects);
  const visibility = normalizeHomeCardVisibility(settings.home_card_visibility);
  const visibleCards = normalizeHomeCardOrder(settings.home_card_order).filter((key) => visibility[key]).map((key) => homeVisualCardDefinitions.find((card) => card.key === key)!);
  const style = {
    "--visual-preview-base": base,
    "--visual-preview-accent": accent,
    "--visual-preview-card": homeVisualOverlay(cardColor, cardOpacity / 100),
    "--visual-preview-shade": homeVisualOverlay(cardColor, shade / 100),
  } as CSSProperties;

  return <div className={`home-visual-live is-${viewport} is-${tone}`} style={style} aria-label="网站页面图片实时预览">
    <div className="home-visual-live-background" style={{ backgroundImage: background ? `url("${background.replace(/["\\\r\n]/g, "")}")` : "none", filter: `blur(${normalizeHomeBackgroundBlur(settings.home_background_blur)}px)` }} />
    <div className="home-visual-live-overlay" style={{ background: homeVisualOverlay(base, normalizeHomeBackgroundOverlayOpacity(settings.home_background_overlay_opacity) / 100) }} />
    <div className="home-visual-live-layout">
      <aside><img src={avatar} alt="侧栏头像预览" /><small>MY MEMORY ARCHIVE</small><strong>{settings.site_title || "我的记忆档案"}</strong><p>记录平凡的日子，也收藏闪光的青春。</p></aside>
      <main>
        <div className="home-visual-live-header"><b>{settings.site_title || "我的记忆档案"}</b><span>故事集　3D 粒子树　校园碎片</span></div>
        <section className="home-visual-live-hero" style={{ backgroundImage: hero ? `url("${hero.replace(/["\\\r\n]/g, "")}")` : "none" }}><div><small>MEMORIES WE SHARE</small><strong>把青春留在<br />风经过的地方</strong><span>开始翻阅　↗</span></div></section>
        <div className="home-visual-live-cards">{visibleCards.map((card) => {
          const source = normalizeHomeVisualAsset(settings[card.key], card.fallback);
          const crop = crops[card.key];
          const position = crop ? `${crop.left + crop.width / 2}% ${crop.top + crop.height / 2}%` : "center";
          return <div className="home-visual-live-card" key={card.key} style={{ aspectRatio: String(homeCardAspectRatioNumber(aspects[card.key] || settings.home_card_aspect_ratio)) }}>
            {source && <img src={source} alt="" style={{ objectPosition: position }} />}
            <span className="home-visual-live-card-shade" /><strong>{card.label}</strong>
          </div>;
        })}</div>
      </main>
    </div>
  </div>;
}
