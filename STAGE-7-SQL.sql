-- ==========================================
-- TIC-TAC-TOE STAGE 7
-- Production Security
-- ==========================================
-- Run once in Supabase SQL Editor.
--
-- This migration tightens ownership/security without changing
-- the working game flow from Stages 1-6.

begin;

-- ------------------------------------------
-- 1. PROFILES: users can only edit themselves
-- ------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists "Users can view profiles" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;

create policy "Users can view profiles"
on public.profiles
for select
to authenticated
using (true);

create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- ------------------------------------------
-- 2. GAMES: authenticated users can only
--    read games they participate in or waiting
--    games they need to join.
-- ------------------------------------------

alter table public.games enable row level security;

drop policy if exists "Players can view games" on public.games;
drop policy if exists "Players can create games" on public.games;
drop policy if exists "Players can update their games" on public.games;

create policy "Players can view games"
on public.games
for select
to authenticated
using (
    status = 'waiting'
    or auth.uid() = player_x
    or auth.uid() = player_o
);

create policy "Players can create games"
on public.games
for insert
to authenticated
with check (
    auth.uid() = player_x
    and player_o is null
    and status = 'waiting'
    and current_turn = 'X'
);

-- Existing app needs to join waiting games and update gameplay.
-- The WITH CHECK prevents changing ownership to arbitrary users.
create policy "Players can update their games"
on public.games
for update
to authenticated
using (
    auth.uid() = player_x
    or auth.uid() = player_o
    or (
        status = 'waiting'
        and player_o is null
    )
)
with check (
    (
        -- Player X may continue to own the game.
        player_x = auth.uid()
        and (
            player_o is null
            or player_o = player_o
        )
    )
    or
    (
        -- A waiting game may be joined by the authenticated user.
        status = 'playing'
        and player_o = auth.uid()
        and player_x is not null
    )
    or
    (
        -- A participant may update normal gameplay state.
        auth.uid() = player_x
        or auth.uid() = player_o
    )
);

-- ------------------------------------------
-- 3. Prevent direct deletion of game records
--    by normal authenticated users.
-- ------------------------------------------

drop policy if exists "Players can delete their games" on public.games;

-- No DELETE policy is intentionally created.

-- ------------------------------------------
-- 4. DATA SHAPE CHECKS
-- ------------------------------------------

-- Ensure board is always a 9-cell JSON array.
alter table public.games
drop constraint if exists games_board_shape_check;

alter table public.games
add constraint games_board_shape_check
check (
    jsonb_typeof(board) = 'array'
    and jsonb_array_length(board) = 9
);

-- Ensure current turn is valid.
alter table public.games
drop constraint if exists games_current_turn_check;

alter table public.games
add constraint games_current_turn_check
check (
    current_turn in ('X', 'O')
);

-- Ensure winner is valid.
alter table public.games
drop constraint if exists games_winner_check;

alter table public.games
add constraint games_winner_check
check (
    winner is null
    or winner in ('X', 'O', 'draw')
);

-- Ensure status is valid.
alter table public.games
drop constraint if exists games_status_check;

alter table public.games
add constraint games_status_check
check (
    status in ('waiting', 'playing', 'finished')
);

commit;

-- ==========================================
-- SECURITY VERIFICATION
-- ==========================================

select
    tablename,
    policyname,
    cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'games')
order by tablename, policyname;
