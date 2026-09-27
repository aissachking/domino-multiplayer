# ضعيف جدا (Daeef Jiddan)

A mobile-first real-time dominoes MVP with Arabic RTL Flutter UI, an authoritative Socket.IO backend, a deterministic TypeScript game engine, and four bot difficulty levels.

## Packages
- game-engine: double-six rules, dealing, orientation, legal play, draw/pass, blocked rounds and scoring.
- ai: Easy, Normal, Hard and Expert legal-move selection.
- backend: Socket.IO rooms, authoritative actions, reconnect handling and GET /health.
- mobile: Flutter Arabic-first UI and Socket.IO network boundary.
- database/migrations: PostgreSQL persistence foundation.

## Node commands
npm install
npm run typecheck
npm test
npm run build
npm start

The backend listens on PORT (default 3000) and binds to 0.0.0.0. Set optional comma-separated CORS_ORIGIN.

## Flutter
The repository contains the Dart application sources and pubspec.yaml. The Android platform directory can be generated with:
cd mobile
flutter create --platforms=android .
flutter pub get
flutter analyze
flutter test
flutter build apk --debug

CI performs Android platform generation when needed before building the debug APK.

## Render
render.yaml defines a Node web service with buildCommand, startCommand and healthCheckPath. Render documents these Blueprint fields for web services.

## Security and persistence boundaries
The current MVP accepts an anonymous reconnectable playerId in Socket.IO auth. This is development-only; production accounts must replace it with JWT/Firebase verification. Active rooms are currently in memory, so matches do not survive a deploy. PostgreSQL schemas are foundations for the next persistence milestone.

## Production verification
CI configuration is not proof that a test passed. A test is considered passed only when its command actually completes successfully in the target environment.
