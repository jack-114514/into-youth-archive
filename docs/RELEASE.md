Self-hosted v3.3.1 · Universal Android admin 1.4.1+13

- The first two password attempts do not require or load Cloudflare. After two consecutive incorrect credentials, the third and subsequent attempts require inline verification before submitting the password.
- The selected server owns the persistent site-wide native login counter. Changing usernames, IPs or restarting the app does not reset it. Atomic reservation prevents concurrent free-attempt bypasses. Successful login clears the counter; it expires after 30 minutes without a new password attempt. Web login tracking is independent.
- Keep rate limits, strict Siteverify action/hostname validation, secret-bound sessions and one-use proofs. When verification is required, missing configuration or failed challenges never permit password checking.
- Update your own backend to v3.3.1 and configure your own Turnstile. Older backends continue requiring verification for every login.
- One universal APK, org.memoryarchive.admin.secure, same stable signature as 1.4.0. Website and GitHub provide identical bytes. Private keys stay local; CI debug APKs remain test artifacts only.
