# Memory Archive / 我的记忆档案

**Language / 语言: [简体中文](README.md) · English**

A self-hosted memory website for photos, videos and writing, with a **3D particle tree, floating frames, snow, music and an AI companion**. Includes a web dashboard and a native Android admin app, running independently on your own VPS.

## 🚀 Install the website on your own VPS

> **Prepare your own VPS and domain.** Point the domain to the VPS and open ports 80/443. The installer supports Debian / Ubuntu; 2 CPU cores and 2 GB RAM are recommended. Connect over SSH as root and run the complete command below. For a regular account, replace the final `bash` with `sudo bash`.

```bash
curl -fsSL https://raw.githubusercontent.com/jack-114514/into-youth-archive/main/install.sh -o /tmp/memory-archive-install.sh && bash /tmp/memory-archive-install.sh
```

**Enter your domain, email and admin password → wait for the build → open `https://your-domain`. Dashboard: `https://your-domain/admin`.** Turnstile and email recovery can be configured later.

**[📖 Step-by-step installation guide (Chinese)](docs/QUICK_START.md)** · **[View/download the installation script](https://raw.githubusercontent.com/jack-114514/into-youth-archive/main/install.sh)**

Run the installation command in the Linux terminal on your VPS. For missing curl/sudo, see the [FAQ (Chinese)](docs/QUICK_START.md#常见问题). Existing Docker installations must support Compose v2.

## 📱 Download the Android admin app

### [⬇ Download Android APK · 1.8.0 (versionCode 20)](https://github.com/jack-114514/into-youth-archive/releases/download/v3.6.0/memory-archive-admin-v1.8.0.apk)

**Android 7.0 or later. Enter your own HTTPS domain after installation, then sign in with your website admin account. No source changes or APK rebuild are required.**

[Releases and checksums](https://github.com/jack-114514/into-youth-archive/releases/latest) · [Android features, architecture and build guide (Chinese)](mobile-admin-app/README.md) · **[Android privacy policy (Chinese)](mobile-admin-app/PRIVACY.md)**

The release APK uses a stable signing certificate and can upgrade earlier secure universal builds with the same package ID and signature. Its filename includes the version: `memory-archive-admin-v1.8.0.apk`. Website release v3.6.0 and Android version 1.8.0 are identified separately. Older preview/site-specific packages use different IDs or signatures; install the universal app and reconnect to your site. Server content remains available. CI debug APKs are test artifacts.

---

Android 1.8.0 offers GitHub or the current server after Check for updates, plus a link to the open-source repository. No manual update-manifest URL is required. Retains the image/control and layout fixes from 1.7.0.

## Documentation

The linked detailed guides are currently in Chinese. This English README covers installation, downloads, versions, features, architecture and routine maintenance.

| Task | Guide |
| --- | --- |
| First installation, domain changes, your own Cloudflare configuration | [Quick start](docs/QUICK_START.md) |
| Full visitor/admin feature list in plain text | **[Website feature details](docs/网站功能详情.txt)** · [Raw text](https://raw.githubusercontent.com/jack-114514/into-youth-archive/main/docs/网站功能详情.txt) |
| Architecture, folders, APIs, data and development | [Technical guide](docs/TECHNICAL.md) |
| Backups, updates, rollback and deployment without Docker | [Self-hosting guide](docs/SELF_HOSTING.md) |
| Manage your site from your phone | [Android guide](mobile-admin-app/README.md) · [Privacy policy](mobile-admin-app/PRIVACY.md) |

## Current versions and independent hosting

| Component | Current version |
| --- | --- |
| Self-hosted website | v3.6.0: visitor site, web dashboard, Python API and installation/maintenance scripts |
| Universal Android admin app | 1.8.0, versionCode 20; package ID `org.memoryarchive.admin.secure` |
| Default deployment | Docker Compose, Caddy HTTPS and SQLite; one site and one administrator |

A fresh installation includes the complete interface, animations and features, with neutral text and generated demo illustrations. Configure your own database, accounts, photos, domain, Cloudflare, email and AI credentials. The source excludes the original author's real photos, database, uploads, server address, passwords, cloud credentials and Android signing key. The running site does not connect to the original author's website.

Installation and updates access the selected GitHub repository, dependency registries and image services. Third-party services run according to your configuration. Retain the open-source licenses and third-party attribution.

<details>
<summary>View the self-hosted 3D particle tree demo (generated illustrations)</summary>

![Self-hosted 3D particle tree with floating demo frames and snow](docs/images/3d-demo.png)

</details>

## Visitor features

| Page / feature | Display and interaction |
| --- | --- |
| Welcome screen | Separate opening image, loading/entrance animations; locally saved visitor nickname and avatar |
| Home | Title, introduction, photo/video cards, section links, personal introduction and footer; desktop/mobile layouts |
| 3D particle tree `/memory` | Particle tree, floating photos and continuous snow/star animations; drag to rotate, wheel/pinch to zoom, hover to enlarge, click for details, immersive viewing |
| Photo and video viewer | Original aspect ratios, captions, fullscreen photos and video playback; decode preloading and bounded caching while scene animations continue |
| Stories `/stories` | Photo/video memories with titles, descriptions and dates; click photos to view the original |
| Timeline `/timeline` | Configured dates and events documenting your experiences |
| Campus `/campus`, Notes `/notes`, About `/about` | Separate content sections with photos and text edited by the site owner |
| Message board `/messages` | Nicknames, avatars, text/image messages, replies and likes; owner moderation |
| Submissions | Title, body, images and contact email, submitted for owner review |
| Music | Your playlist, play/pause, volume, playback order and volume fades; autoplay depends on browser policy |
| Moling AI companion | Original default character, custom image/Live2D support; Chinese default persona, 14 expressions, 12 actions, drag interactions and farewell |

## Web dashboard

Open `/admin` and sign in with the email and password configured during installation.

| Management area | Editable content |
| --- | --- |
| Site branding | Name, logo/icon, main title, introduction, text, font sizes/weights, colors, footer and your GitHub/email links |
| Home layout | Card order, section visibility, images/videos, framing/aspect ratios, display size, background blur and color tone |
| Welcome screen | Desktop/mobile opening images, framing, brightness/blur, watermark, loading duration, route nodes and entrance button |
| Media and stories | Upload photos/videos; titles, descriptions, dates and ordering; separate home/3D/stories visibility; edit/delete entries |
| 3D scene | Snow-ring, snowfall and universe presets; density, brightness, tree growth, photo sizes/distribution/borders |
| Text sections | Timeline events, personal introduction, About photos and section text |
| Music | Audio uploads, playlists, default playback, volume, shuffle/sequential/single-track repeat |
| Companion | Model, size/position, movement/interactions, moods/dialogue and your DeepSeek configuration; AI is disabled by default |
| Messages / submissions | View content; show/hide/delete messages; accept/reject submissions and delete submission records |
| Account and statistics | Visit/content counts; email-based password recovery/change requires your own Turnstile and SMTP configuration |

The native Android dashboard follows the same menu groups as the website: Server status, Website content, Messages and submissions, Welcome screen, Website settings, AI companion settings, and Account management. It supports section photos/framing, text/layout, timeline nodes, opening routes, 3D parameters, MP3 uploads/playlist ordering, contact links, companion dialogue/layout/presets and email-code password changes. Both dashboards save to the same data. Animations and the companion are displayed by the website. [Android coverage table (Chinese)](mobile-admin-app/README.md#功能覆盖).

Android 1.7.0 pairs each section image with its framing, aspect ratio, visibility and ordering controls in one card. Opening-image parameters stay beneath their own image. Forms are grouped by purpose; companion save/status controls stay at the bottom, and media cards and diagnostic text adapt to narrow screens.

## Technology

| Layer | Technology and purpose |
| --- | --- |
| Web interface | React 19.2.6, TypeScript 5.9.3, Vite 8.0.13; static SPA on the VPS |
| 3D | Three.js 0.185.x, React Three Fiber 9.x, Drei 10.x; WebGL scenes |
| Animation and styling | Framer Motion 13.x, Tailwind CSS 4.2.1, custom CSS and Lucide icons |
| Framing / companion | react-advanced-cropper; original six-part Moling character with continuously animated SVG facial features |
| Backend | Python standard-library HTTP server, JSON API and SQLite; no additional Python web framework or database service |
| Website deployment | Docker Compose v2; Node 22 build, Python 3.12 container, Caddy 2 HTTPS/reverse proxy |
| Android | Flutter 3.47.0 / Dart 3.13, Material 3, Riverpod, Dio, secure storage and on-device media compression |
| Optional services | Your own Cloudflare DNS/Turnstile, SMTP and DeepSeek |
| Continuous verification | GitHub Actions: web/backend checks, fresh container installation/backups, Flutter analysis/tests/APK build |

See the [technical guide (Chinese)](docs/TECHNICAL.md) for versions, APIs and data flow. Some historical development tools remain in dependency files; the default VPS runtime does not depend on Next SSR, Cloudflare Workers/D1 or Drizzle ORM.

## Routine maintenance

Back up your site:

```bash
cd /opt/memory-archive
sudo bash scripts/backup.sh
```

Update your site:

```bash
cd /opt/memory-archive
sudo bash scripts/update.sh
```

Updates first create a backup, then pull `origin/main` from your repository and build. Failed updates roll back code and images while preserving current data. Backups contain the database, uploads and private configuration; keep a copy off the server. [Maintenance and recovery guide (Chinese)](docs/SELF_HOSTING.md).

## License

The main program uses the [MIT License](LICENSE). The [login component license](components/opensource-login/LICENSE), [third-party notices](public/THIRD_PARTY_NOTICES.txt) and [Moling asset notice](public/assets/desktop-pet/NOTICE.txt) apply separately. Original Moling assets are released under MIT with the project. Old bundled character models have been removed. Cubism Core is used under its own license for custom Live2D characters.

## v3.2.1 update history

Original Moling character: six-part transparent atlas, 14 expressions, 12 actions, three drag interactions, eye-only pointer tracking and farewell/rest. Default AI output limit is 5,000, configurable up to 10,000; malformed JSON replies trigger one retry. Each signed visitor session has independent limits of 20 requests/minute and 60 requests/10 minutes. Exceeding them pauses AI requests for five minutes. Shared IP addresses do not combine visitor quotas. Clearing cookies or using another device creates a new session; the system cannot identify the same person across sessions.

Universal Android app 1.3.1+6 introduced native assistant settings: name, appearance, speaking style, a large persona editor, output limit, model, new key, frame rate and interaction switches. Saving changes only these fields and preserves other dialogue/layout settings. Moling animations run in the website; Android manages their settings. Fresh installations use Moling; old bundled characters migrate to Moling while custom personas and keys are retained.

The default character, name, persona and Chinese speaking style are Moling and remain editable. AI calls require your own AI key and enabled chat.

Administrators may use custom images (PNG/JPEG/WebP/GIF/AVIF/SVG) or licensed Cubism 3/4 Live2D models. Enter site asset paths or HTTPS URLs in either dashboard. Live2D uses a `.model3.json` entry point with intact relative paths to textures and motions. Fresh installations do not load the Live2D runtime by default. Custom characters can have separate styles, personas and names.

### Android login security

The current universal app is 1.8.0+20. The first two password attempts do not require a challenge. After two consecutive failures, Cloudflare verification appears below the password field from the third attempt onward; login remains disabled until verification succeeds. Update your backend and configure your own three Turnstile parameters. Web and native dashboards share the same account; the password is never sent to the verification page. The old site-specific package is no longer maintained; historical releases remain available for rollback.

### Verification after consecutive failures (introduced in 1.4.1)

The server persists native administrator login attempts. Changing usernames/networks, restarting or reinstalling the app does not reset the count. Successful login clears it; it expires after 30 minutes without a new password attempt. Concurrent attempts atomically reserve the first two opportunities. The web dashboard uses a separate counter and retains its rate limits. Verification stays below the password field, and each permit allows one password attempt. Upgrade your backend to v3.3.1 or later; older backends retain their previous challenge behavior.

## New in v3.6.0 / Android 1.8.0+20

Photo records automatically receive an uncropped WebP preview (longest edge 720px) when saved from the website or Android app. Existing custom previews and uploaded originals are retained; missing historical previews are filled on server startup. Both admin interfaces can create drafts, publish, edit, archive and restore journal entries. Visitors read published entries only. Other route sections are no longer mounted behind the campus grid.
