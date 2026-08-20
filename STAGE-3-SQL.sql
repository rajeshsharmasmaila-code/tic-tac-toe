-- Stage 3: allow authenticated players in a game to update gameplay state.
-- Run this once in Supabase SQL Editor.

drop policy if exists "Players can update their games" on public.games;

create policy "Players can update their games"
on public.games
for update
to authenticated
using (
    auth.uid() = player_x
    or auth.uid() = player_o
)
with check (
    auth.uid() = player_x
    or auth.uid() = player_o
);
