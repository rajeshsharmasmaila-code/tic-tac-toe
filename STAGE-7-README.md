# Stage 7 — Production Security

## Before running
1. Keep your existing `js/config.js`.
2. Make a backup of the current Supabase database/project if desired.
3. Run `STAGE-7-SQL.sql` once in Supabase SQL Editor.

## Test
1. Login as Player 1 and Player 2.
2. Create/join a new game.
3. Play X/O normally.
4. Confirm win/draw still works.
5. Confirm history/statistics/leaderboard still load.
6. Confirm profiles can only be edited by their owner.

## Important
This migration intentionally does not create a DELETE policy for games.
