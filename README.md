# Tic-Tac-Toe — Stage 4

Stage 4 adds client-side game-rule enforcement on top of Stage 3:

- Only the player whose turn it is can click a cell.
- Occupied cells cannot be clicked again.
- A player who is not part of the game cannot make a move.
- No moves are allowed after X wins, O wins, or a draw.
- The board is disabled while a move is being saved.
- The database update uses both `status = playing` and `current_turn = player symbol`, preventing stale/simultaneous moves from being accepted.
- Realtime updates and 1-second polling continue to keep both devices synchronized.
- Polling/realtime updates are paused while the local move is being committed so an older state cannot overwrite the move visually.

No Supabase SQL change is included for Stage 4.
