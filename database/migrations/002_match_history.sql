-- Durable match history for online games (live game state stays in memory).
-- Player ids are client-generated guest ids, hence TEXT. Tables from 001 are
-- left untouched for safety; they are not used by the current backend.
CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,
  display_name  VARCHAR(20) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_records (
  id            UUID PRIMARY KEY,
  room_code     VARCHAR(8) NOT NULL,
  target_score  SMALLINT NOT NULL CHECK (target_score IN (50, 100, 150, 200)),
  rounds        SMALLINT NOT NULL CHECK (rounds >= 1),
  winner_id     TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL,
  ended_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_participants (
  match_id      UUID NOT NULL REFERENCES match_records(id) ON DELETE CASCADE,
  seat          SMALLINT NOT NULL CHECK (seat BETWEEN 0 AND 3),
  player_id     TEXT NOT NULL,
  display_name  VARCHAR(20) NOT NULL,
  kind          VARCHAR(8) NOT NULL CHECK (kind IN ('human', 'bot')),
  difficulty    VARCHAR(8) CHECK (difficulty IN ('easy', 'normal', 'hard', 'expert')),
  final_score   INTEGER NOT NULL CHECK (final_score >= 0),
  won           BOOLEAN NOT NULL,
  PRIMARY KEY (match_id, seat)
);

CREATE INDEX IF NOT EXISTS idx_match_participants_player ON match_participants (player_id);
CREATE INDEX IF NOT EXISTS idx_match_records_ended ON match_records (ended_at DESC);
