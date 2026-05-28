-- migrations/0001_init.sql
-- MatchNote D1 初期スキーマ

CREATE TABLE IF NOT EXISTS teams (
  team_id          TEXT PRIMARY KEY,
  team_name        TEXT NOT NULL,
  season           TEXT NOT NULL DEFAULT '2026',
  match_format     TEXT NOT NULL DEFAULT '8aside',
  default_half_minutes INTEGER NOT NULL DEFAULT 15,
  edit_pin_hash    TEXT NOT NULL,
  created_at       INTEGER NOT NULL  -- UNIX タイムスタンプ (ms)
);

CREATE TABLE IF NOT EXISTS players (
  player_id        TEXT PRIMARY KEY,
  team_id          TEXT NOT NULL,
  jersey_number    INTEGER NOT NULL,
  display_name     TEXT NOT NULL,
  preferred_position TEXT,
  active           INTEGER NOT NULL DEFAULT 1,  -- 1=有効, 0=非活動
  created_at       INTEGER NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(team_id)
);

CREATE TABLE IF NOT EXISTS matches (
  match_id         TEXT PRIMARY KEY,
  team_id          TEXT NOT NULL,
  date             TEXT NOT NULL,              -- YYYY-MM-DD
  opponent         TEXT NOT NULL,
  venue            TEXT,
  competition      TEXT,
  half_minutes     INTEGER NOT NULL DEFAULT 15,
  status           TEXT NOT NULL DEFAULT 'scheduled',
  -- status: scheduled | first_half | halftime | second_half | finished
  first_half_home  INTEGER NOT NULL DEFAULT 0,
  first_half_away  INTEGER NOT NULL DEFAULT 0,
  second_half_home INTEGER NOT NULL DEFAULT 0,
  second_half_away INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(team_id)
);

CREATE TABLE IF NOT EXISTS events (
  event_id         TEXT PRIMARY KEY,
  match_id         TEXT NOT NULL,
  type             TEXT NOT NULL,  -- goal | concede | substitution
  half             TEXT NOT NULL,  -- first | second
  minute           INTEGER,
  scorer_player_id TEXT,
  assist_player_id TEXT,
  out_player_id    TEXT,
  in_player_id     TEXT,
  created_at       INTEGER NOT NULL,
  FOREIGN KEY (match_id) REFERENCES matches(match_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_players_team  ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_matches_team  ON matches(team_id, date);
CREATE INDEX IF NOT EXISTS idx_events_match  ON events(match_id, created_at);
