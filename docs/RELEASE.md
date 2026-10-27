# Release checklist (Google Play)

The CI builds a **debug** APK for testing. It is signed with the debug key and must not be published.
Before a public release:

1. **Application id** — CI generates the project with `--org com.daeef`, giving `com.daeef.daeef_jiddan`.
   Choose the final id before the first upload (it can never change afterwards) and set it in
   `mobile/android/app/build.gradle.kts` (`applicationId`).
2. **Signing key** — create an upload key:
   `keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`
   Store it outside the repository. Create `mobile/android/key.properties` (git-ignored) with
   `storePassword`, `keyPassword`, `keyAlias`, `storeFile`, and reference it from the `release`
   `signingConfig` in `build.gradle.kts` (see Flutter's "Build and release an Android app" guide).
   In CI, provide the keystore as a base64 secret and decode it in the workflow.
3. **Release build** — `flutter build appbundle --release --dart-define=SERVER_URL=https://<your-server>`.
   Test the release build on real devices (release builds do not allow plain-HTTP servers).
4. **Version** — bump `version:` in `mobile/pubspec.yaml` (`name+buildNumber`) for every upload.
5. **Permissions** — the app requests only `INTERNET` and `VIBRATE`.
6. **Privacy** — the app stores a random guest id, display name and preferences on the device; the server
   stores display names and match results when a database is configured. Publish a privacy policy and
   complete the Play Console *Data safety* form accordingly.
7. **Store listing** — icon (`mobile/assets/icon-512.png`), screenshots, Arabic/French/English
   descriptions, content rating questionnaire.
8. **Server** — deploy the backend (see README), set `CORS_ORIGIN` if a web client exists, configure
   `DATABASE_URL`, and monitor `/health`.

Until these steps are done and verified, the app is **not** Play-Store ready.
