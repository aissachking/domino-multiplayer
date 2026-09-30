CREATE TABLE users (id UUID PRIMARY KEY, display_name VARCHAR(24) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE rooms (code CHAR(4) PRIMARY KEY, host_id UUID REFERENCES users(id), status VARCHAR(20) NOT NULL, target_score SMALLINT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE games (id UUID PRIMARY KEY, room_code CHAR(4) REFERENCES rooms(code), winner_id UUID REFERENCES users(id), state JSONB NOT NULL, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), ended_at TIMESTAMPTZ);
CREATE TABLE game_players (game_id UUID REFERENCES games(id), user_id UUID REFERENCES users(id), seat SMALLINT NOT NULL, score INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(game_id,user_id));
CREATE TABLE matches (id UUID PRIMARY KEY, game_id UUID REFERENCES games(id), summary JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
