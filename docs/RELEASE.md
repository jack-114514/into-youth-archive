Self-hosted v3.3.0 · Android admin 1.4.0+12

- One maintained universal Android app: org.memoryarchive.admin.secure. The same release APK is distributed on GitHub and the website; no dedicated site flavor or public debug preview.
- Cloudflare verification appears directly under the password field. Secure login and keyboard submission remain disabled until the selected server confirms Siteverify. Wrong passwords, expiry and site changes require renewed verification.
- Preserve default WebView identity, DOM storage and cookies; allow Cloudflare internal about:blank/about:srcdoc frames, and show error codes with inline retry. Passwords never enter the verification page.
- Server verification is secret-bound, expires, permits one atomic password attempt, checks Cloudflare action/hostname, and rejects pending, forged, expired or replayed proofs.
- Update your backend and configure your own Turnstile keys and allowed hostname before native login. Existing site data and Moling/chat functions remain unchanged.
- The stable release signature covers local secure generic versions 1.3.2/1.3.3. Old GitHub preview and dedicated packages have different identities: install the universal app and reconnect your site; do not delete server data. Old releases remain historical rollback artifacts.
- CI debug builds are test artifacts only. Release APKs are built with the stable local key; no private key is uploaded to GitHub.
