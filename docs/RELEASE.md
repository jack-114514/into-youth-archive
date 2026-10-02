Self-hosted v3.1.1 · Android admin 1.2.1+4

- Original Moling artwork and continuous facial/part animation: 14 faces, 12 gestures, 3 drag-only reactions and a farewell wave before sleep.
- Eye-only mouse tracking; improved input focus appearance and larger persona editor.
- AI output budget defaults to 5000, adjustable to 10000. Invalid/empty JSON retries once with plain output.
- Independent signed visitor sessions: 20 requests/minute and 60/10 minutes; five-minute rest makes zero upstream calls. Shared-IP visitors remain independent. Clearing cookies creates a new anonymous session.
- Native Android assistant settings, input validation, unchanged-setting preservation and new-Key field clearing after successful save.
- Existing self-hosted site configuration and private data stay in persistent volumes. New installations default to Moling.
- Preview APK uses a test signing key; it may require uninstalling an older preview. Use your own stable release key for long-term distribution.
- Moling assets are original AI-assisted artwork released with this project under MIT. Bundled Live2D models and Cubism Core retain their separate terms.
