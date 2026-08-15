# Release and rollback

## Reproducible Android release

1. Install the versions recorded in `mobile-admin-app/build_environment.md`.
2. Generate a private Android release keystore outside the repository.
3. Create ignored `mobile-admin-app/android/key.properties` with
   `storeFile`, `storePassword`, `keyAlias`, and `keyPassword`.
4. Commit the sanitized source and record the full commit SHA.
5. Build with production HTTPS values supplied through `--dart-define`, plus
   the exact `GIT_COMMIT`, UTC `BUILD_TIME`, and `BUILD_TYPE=release`.
6. Calculate the APK SHA-256. Generate `version.json` from that value.
7. Tag the same commit. Upload the APK and `.sha256` file to that release.
8. Archive `mapping.txt` privately; do not upload it to a public release.

Never rebuild an existing tag with different inputs. Publish a new version and
version code instead.

## Server deployment

Before deployment, back up:

- `server/app.py` and `server/admin_app_api.py`
- SQLite database, including WAL/SHM files when present
- uploads directory
- systemd, Nginx, and private environment configuration

Deploy the two Python modules together, compile-check them, restart the service,
then test local health before exposing traffic. If health or authenticated API
checks fail, restore both Python modules and the database from the same backup,
restart the service, and keep the failed release offline.

## Android rollback

Android only permits an in-place downgrade when version/signing rules allow it.
The safe rollback is to publish the last known-good source as a new, higher
version code, signed by the same private keystore. Never replace or rotate the
keystore without a documented migration plan.
