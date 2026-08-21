-- Stage 6: Profiles + Statistics + Leaderboard
-- Run once in Supabase SQL Editor.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS avatar text NOT NULL DEFAULT '🙂';

-- Players can edit only their own profile.
drop policy if exists "Stage 6 users can update own profile" on public.profiles;
create policy "Stage 6 users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Keep profile reads available to logged-in players.
drop policy if exists "Stage 6 authenticated users can view profiles" on public.profiles;
create policy "Stage 6 authenticated users can view profiles"
on public.profiles
for select
to authenticated
using (true);

-- Return one player's completed-game statistics.
create or replace function public.get_player_stats(p_user_id uuid)
returns table (
    games_played bigint,
    wins bigint,
    losses bigint,
    draws bigint,
    win_rate numeric
)
language sql
security definer
set search_path = public
as $$
    with completed as (
        select
            case when player_x = p_user_id then 'X' else 'O' end as my_symbol,
            winner
        from public.games
        where status = 'finished'
          and (player_x = p_user_id or player_o = p_user_id)
    )
    select
        count(*)::bigint as games_played,
        count(*) filter (where winner = my_symbol)::bigint as wins,
        count(*) filter (where winner is not null and winner <> 'draw' and winner <> my_symbol)::bigint as losses,
        count(*) filter (where winner = 'draw')::bigint as draws,
        case when count(*) = 0 then 0::numeric
             else round((count(*) filter (where winner = my_symbol)) * 100.0 / count(*), 1)
        end as win_rate
    from completed;
$$;

-- Global leaderboard for authenticated users.
create or replace function public.get_leaderboard(p_limit integer default 20)
returns table (
    user_id uuid,
    username text,
    avatar text,
    games_played bigint,
    wins bigint,
    losses bigint,
    draws bigint,
    win_rate numeric
)
language sql
security definer
set search_path = public
as $$
    with completed as (
        select player_x as user_id, 'X'::text as my_symbol, winner
        from public.games
        where status = 'finished' and player_x is not null
        union all
        select player_o as user_id, 'O'::text as my_symbol, winner
        from public.games
        where status = 'finished' and player_o is not null
    ),
    stats as (
        select
            user_id,
            count(*)::bigint as games_played,
            count(*) filter (where winner = my_symbol)::bigint as wins,
            count(*) filter (where winner is not null and winner <> 'draw' and winner <> my_symbol)::bigint as losses,
            count(*) filter (where winner = 'draw')::bigint as draws
        from completed
        group by user_id
    )
    select
        p.id,
        coalesce(p.username, 'Player')::text,
        coalesce(p.avatar, '🙂')::text,
        s.games_played,
        s.wins,
        s.losses,
        s.draws,
        round(s.wins * 100.0 / nullif(s.games_played, 0), 1) as win_rate
    from stats s
    join public.profiles p on p.id = s.user_id
    order by s.wins desc,
             (s.wins * 100.0 / nullif(s.games_played, 0)) desc,
             s.games_played desc,
             p.username asc
    limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke all on function public.get_player_stats(uuid) from public;
revoke all on function public.get_leaderboard(integer) from public;
grant execute on function public.get_player_stats(uuid) to authenticated;
grant execute on function public.get_leaderboard(integer) to authenticated;
