# ضعيف جدا (Daeef Jiddan)

A mobile-first real-time dominoes MVP: Arabic RTL Flutter UI, an authoritative Socket.IO server, reusable deterministic TypeScript engine, and bots.

## Layout
- `game-engine`: standard double-six rules, dealing, legal play, draw/pass, blocked rounds and scoring.
- `ai`: legal Easy, Normal, Hard and Expert choices.
- `backend`: Socket.IO rooms and server-authoritative actions; `GET /health` is deployment health check.
- `mobile`: Flutter Arabic-first UI shell for menu, lobby, bot seats and table.
- `database/migrations`: PostgreSQL-ready persistence foundations.

## Local development
```bash
npm install
npm test
npm run build
npm run start -w @daeef/backend
```
Set `PORT` and optional comma-separated `CORS_ORIGIN` in an uncommitted `.env`. The server currently uses anonymous reconnectable `playerId` supplied in Socket.IO auth; replace its middleware with a JWT/Firebase verifier before enabling accounts.

## Render
Push this repository, create a Blueprint from `render.yaml`, then add `CORS_ORIGIN` in Render environment settings. Render uses `npm install && npm run build`, starts `@daeef/backend`, and polls `/health`.

## Known MVP boundaries
The backend keeps rooms in memory (so active matches reset on a deploy), and mobile currently presents the product flow/UI without its Socket.IO client wiring. Database/auth schemas are foundations for the next persistence/auth milestone.
