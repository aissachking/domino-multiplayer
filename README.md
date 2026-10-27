# ضعيف جدا — Daeef Jiddan (Dominoes)

لعبة دومينو (دبل سِكس) لـ 2 إلى 4 لاعبين، كل لاعب يلعب لنفسه:
- **بدون إنترنت** ضد 1–3 بوتات، مع حفظ المباراة تلقائيًا ومتابعتها بعد إعادة فتح التطبيق.
- **عبر الإنترنت** في غرف خاصة برمز دعوة، مع خلط لاعبين وبوتات وإعادة اتصال تلقائية.
- 4 مستويات بوتات مختلفة فعلًا: سهل (عشوائي)، عادي (جشع)، صعب (استدلالي يتتبع ما ينقص الخصوم)، خبير (محاكاة مونت كارلو دون رؤية أحجار الخصوم).
- واجهة عربية افتراضية بتخطيط RTL وخط Tajawal، مع الفرنسية والإنجليزية من الإعدادات.
- 7 أشكال لأحجار الدومينو مع معاينة، تُحفظ على جهازك ولا تؤثر على قواعد اللعب ولا على بقية اللاعبين.

A double-six domino game for Android (Flutter) with an authoritative Node.js/Socket.IO server.

## Repository layout
| Path | What it is |
|---|---|
| `game-engine/` | Deterministic TypeScript rules engine (single source of truth). See [docs/RULES.md](docs/RULES.md). |
| `ai/` | Bot levels `easy` / `normal` / `hard` / `expert`; bots only receive public information. |
| `shared/` | Socket.IO protocol names, payload types, validators, cross-platform engine test vectors. |
| `backend/` | Express + Socket.IO server: rooms, guest auth, reconnection, autopilot, match history. |
| `database/migrations/` | PostgreSQL schema (applied by `npm run migrate`). |
| `mobile/` | Flutter app: Dart port of the engine and bots (offline), online client, UI, tests. |
| `docs/` | Rules, protocol, release checklist. |

## Run the backend locally
Requires Node.js 20+.
```bash
npm install
npm run typecheck
npm test          # engine, shared, AI, backend unit + Socket.IO integration tests
npm run build
npm start         # http://localhost:3000/health
```
Configuration is read from environment variables; see [.env.example](.env.example). Without
`DATABASE_URL`, match history is kept in memory (the game itself never needs the database).

With PostgreSQL:
```bash
export DATABASE_URL=postgres://user:pass@host:5432/db
npm run migrate   # applies database/migrations/*.sql once each
npm start
```

## Run the app
Requires Flutter (stable) and the Android SDK.
```bash
cd mobile
flutter create --platforms=android --org com.daeef --project-name daeef_jiddan .   # completes the Android project; keeps committed files
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=SERVER_URL=http://10.0.2.2:3000    # emulator → local backend
```
The server address can also be changed in the app: **الإعدادات ← عنوان الخادم**.
Offline play needs no server and no account.

## Download the APK
Every push runs GitHub Actions (**CI** workflow). The **Flutter** job uploads the artifact
**`daeef-jiddan-debug-apk`** (`app-debug.apk`). Open the run on GitHub → *Artifacts* → download the zip,
extract it, copy `app-debug.apk` to the phone and install it (allow "install unknown apps" for your file
manager/browser). Debug APKs are for testing only — see [docs/RELEASE.md](docs/RELEASE.md) for Play Store
release steps.

## Deploy the server (Render)
`render.yaml` defines the web service: build `npm install --include=dev && npm run build`, start
`npm run start`, health check `/health`. Set `DATABASE_URL` (optional) and `CORS_ORIGIN` (only needed for
browser clients) in the Render dashboard. `RUN_MIGRATIONS=true` applies migrations on start when a
database is configured. Then point the app at `https://<your-service>.onrender.com`.
Troubleshooting: check `/health` (`db: unavailable` means the database URL or SSL setting is wrong —
set `DATABASE_SSL=false` for databases without TLS); Render free instances sleep, so the first connection
can take ~1 minute.

## Architecture notes
- **Server authoritative:** clients send intentions (`game:play` with the state `version`); the server
  validates identity, room membership, turn, legality and staleness, applies the engine, and sends each
  player a sanitized view containing only their own hand.
- **Same rules everywhere:** the Dart engine is a line-by-line port; `mobile/test/engine_test.dart` replays
  the TypeScript-generated vectors and must match every step. Regenerate after rule changes with
  `npm run vectors`.
- **Bots** are scheduled server-side with a natural delay; invalid bot decisions fall back to a safe legal
  move and are logged. Offline, the expert bot runs in a background isolate.
- **Live state** is in memory (a server restart ends running matches); **finished matches** are stored
  (PostgreSQL when configured). Player stats: `GET /api/players/:id/stats`.

## Known limits / next steps
- Guest identities only (no accounts yet); the schema and repository are ready for profiles, friends and
  leaderboards.
- Running matches do not survive a server restart or multiple server instances (single-instance design).
