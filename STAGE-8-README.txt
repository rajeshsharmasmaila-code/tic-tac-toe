STAGE 8 - Atomic Rematch + Continuous Polling

Files:
- app.js             Root application JavaScript
- js/app.js          Duplicate application JavaScript
- STAGE-8-SQL.sql    Supabase trigger/function for atomic rematch creation

Installation:
1. Run STAGE-8-SQL.sql once in Supabase SQL Editor.
2. Replace BOTH app.js files with the supplied files.
3. Do NOT change config.js.
4. Hard refresh both devices/browsers.

Behavior:
- One continuous 1.5-second poller covers waiting, playing, finished and rematch.
- Realtime is an optimization only.
- On both rematch flags becoming true, PostgreSQL creates exactly one 9-cell rematch and writes rematch_game_id atomically.
- Both clients detect rematch_game_id and move to the new game automatically.
- Refreshing the page during rematch resumes from the database state.
