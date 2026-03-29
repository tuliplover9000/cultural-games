-- =============================================================================
-- Cultural Games — Tournament System · Part 1: Tables & RLS (Migration 007)
-- Run this FIRST, then run 008_tournaments_functions.sql
-- Safe to run multiple times (IF NOT EXISTS / DROP IF EXISTS guards throughout).
-- =============================================================================

-- ── Add tournament link column to rooms ──────────────────────────────────────
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS tournament_match_id uuid;

-- ── tournaments ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournaments (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  code              text        NOT NULL UNIQUE,
  name              text        NOT NULL,
  game_id           text        NOT NULL,
  host_id           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  status            text        NOT NULL DEFAULT 'registration'
                                CHECK (status IN ('registration','active','completed','cancelled')),
  registration_open boolean     NOT NULL DEFAULT true,

  max_players       int         NOT NULL CHECK (max_players BETWEEN 4 AND 32),
  current_players   int         NOT NULL DEFAULT 0,
  total_rounds      int,

  entry_fee         int         NOT NULL DEFAULT 0 CHECK (entry_fee  >= 0),
  host_seed         int         NOT NULL DEFAULT 0 CHECK (host_seed  >= 0),
  prize_pool        int         NOT NULL DEFAULT 0,
  match_limit       int         NOT NULL DEFAULT 30,

  winner_1st        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  winner_2nd        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  winner_3rd        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  expires_at        timestamptz NOT NULL,
  is_public         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tournaments: public read"           ON tournaments;
DROP POLICY IF EXISTS "tournaments: host update"           ON tournaments;
DROP POLICY IF EXISTS "tournaments: no direct insert"      ON tournaments;
DROP POLICY IF EXISTS "tournaments: no direct delete"      ON tournaments;

-- Public / host read
CREATE POLICY "tournaments: public read" ON tournaments
  FOR SELECT USING (is_public = true OR host_id = auth.uid());

-- Host can toggle registration_open only (SECURITY DEFINER funcs bypass this for other changes)
CREATE POLICY "tournaments: host update" ON tournaments
  FOR UPDATE USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

-- All inserts / deletes go through SECURITY DEFINER functions
CREATE POLICY "tournaments: no direct insert" ON tournaments
  FOR INSERT WITH CHECK (false);

CREATE POLICY "tournaments: no direct delete" ON tournaments
  FOR DELETE USING (false);

CREATE INDEX IF NOT EXISTS idx_tournaments_status_expires
  ON tournaments (status, expires_at DESC)
  WHERE status IN ('registration','active');

-- ── tournament_players ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_players (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id    uuid        NOT NULL REFERENCES tournaments(id)  ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  username         text        NOT NULL,
  seed             int,
  entry_fee_paid   int         NOT NULL DEFAULT 0,
  eliminated_round int,
  registered_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id)
);

ALTER TABLE tournament_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tournament_players: public read"  ON tournament_players;
DROP POLICY IF EXISTS "tournament_players: no writes"    ON tournament_players;

CREATE POLICY "tournament_players: public read" ON tournament_players
  FOR SELECT USING (true);

CREATE POLICY "tournament_players: no writes" ON tournament_players
  FOR ALL USING (false);

CREATE INDEX IF NOT EXISTS idx_tp_tournament_registered
  ON tournament_players (tournament_id, registered_at);

-- ── tournament_matches ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_matches (
  id            uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id uuid  NOT NULL REFERENCES tournaments(id)  ON DELETE CASCADE,
  round         int   NOT NULL,
  match_number  int   NOT NULL,
  player1_id    uuid  REFERENCES auth.users(id) ON DELETE SET NULL,
  player2_id    uuid  REFERENCES auth.users(id) ON DELETE SET NULL,
  winner_id     uuid  REFERENCES auth.users(id) ON DELETE SET NULL,
  status        text  NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','ready','completed')),
  room_id       uuid  REFERENCES rooms(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round, match_number)
);

ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tournament_matches: public read"  ON tournament_matches;
DROP POLICY IF EXISTS "tournament_matches: no writes"    ON tournament_matches;

CREATE POLICY "tournament_matches: public read" ON tournament_matches
  FOR SELECT USING (true);

CREATE POLICY "tournament_matches: no writes" ON tournament_matches
  FOR ALL USING (false);

CREATE INDEX IF NOT EXISTS idx_tm_tournament_round
  ON tournament_matches (tournament_id, round, match_number);

CREATE INDEX IF NOT EXISTS idx_tm_players
  ON tournament_matches (player1_id, player2_id, status)
  WHERE status = 'ready';
