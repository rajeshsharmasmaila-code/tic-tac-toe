-- Stage 5: Game History + Rematch
-- Run once in Supabase SQL Editor.

ALTER TABLE public.games
    ADD COLUMN IF NOT EXISTS rematch_x boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS rematch_o boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS rematch_game_id uuid;

-- Optional integrity check: only a game participant can have a rematch flag.
-- The existing Stage 4 participant UPDATE policy protects the row update.

CREATE INDEX IF NOT EXISTS games_player_x_created_at_idx
    ON public.games (player_x, created_at DESC);

CREATE INDEX IF NOT EXISTS games_player_o_created_at_idx
    ON public.games (player_o, created_at DESC);

CREATE INDEX IF NOT EXISTS games_rematch_game_id_idx
    ON public.games (rematch_game_id);
