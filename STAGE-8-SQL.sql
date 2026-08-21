-- ==========================================
-- TIC-TAC-TOE STAGE 8
-- Atomic server-side rematch creation
-- ==========================================
-- Run once in the Supabase SQL Editor.
-- Requires the Stage 5 rematch columns and the Stage 7 games table checks.
-- No client is responsible for creating the rematch game.

begin;

-- Ensure the rematch columns exist.
alter table public.games
    add column if not exists rematch_x boolean not null default false,
    add column if not exists rematch_o boolean not null default false,
    add column if not exists rematch_game_id uuid;

create index if not exists games_rematch_game_id_idx
    on public.games (rematch_game_id);

-- ----------------------------------------------------------
-- Trigger function: when BOTH players request a rematch,
-- create exactly one new playing game and link it to the
-- finished game. The row lock on the source game plus the
-- single transaction makes this atomic.
-- ----------------------------------------------------------

create or replace function public.create_rematch_game()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    new_game_id uuid;
    new_game_code text;
    code_exists boolean;
begin
    -- Only the transition to both flags=true needs work.
    if new.status <> 'finished'
       or not new.rematch_x
       or not new.rematch_o
       or new.rematch_game_id is not null then
        return new;
    end if;

    -- Serialize game-code generation for concurrent rematches.
    perform pg_advisory_xact_lock(hashtextextended('tic-tac-toe-rematch-code', 0));

    loop
        new_game_code := floor(100000 + random() * 900000)::text;

        select exists(
            select 1
            from public.games
            where game_code = new_game_code
        ) into code_exists;

        exit when not code_exists;
    end loop;

    -- Create the rematch in the same transaction as the flag update.
    insert into public.games (
        game_code,
        player_x,
        player_o,
        board,
        current_turn,
        status,
        winner,
        rematch_x,
        rematch_o,
        rematch_game_id
    )
    values (
        new_game_code,
        new.player_x,
        new.player_o,
        '["","","","","","","","",""]'::jsonb,
        'X',
        'playing',
        null,
        false,
        false,
        null
    )
    returning id into new_game_id;

    -- The games_board_shape_check requires exactly 9 cells.
    update public.games
    set rematch_game_id = new_game_id
    where id = new.id
      and rematch_game_id is null;

    return new;
end;
$$;

-- Replace any earlier client-side/partial rematch trigger.
drop trigger if exists games_create_rematch_trigger on public.games;

create trigger games_create_rematch_trigger
after update of rematch_x, rematch_o on public.games
for each row
when (
    new.status = 'finished'
    and new.rematch_x = true
    and new.rematch_o = true
    and new.rematch_game_id is null
)
execute function public.create_rematch_game();

-- Trigger functions are not meant to be called directly by clients.
revoke all on function public.create_rematch_game() from public;
revoke all on function public.create_rematch_game() from authenticated;
revoke all on function public.create_rematch_game() from anon;


commit;

-- ==========================================
-- VERIFICATION
-- ==========================================

select
    trigger_name,
    event_manipulation,
    action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'games'
  and trigger_name = 'games_create_rematch_trigger';
