# Tic-Tac-Toe - Stage 2

Stage 2 adds:

- Create Game
- 6-digit numerical game code
- Join Game
- Player X / Player O assignment
- Supabase Realtime game updates
- Automatic profile creation for authenticated users

## Important

The Supabase SQL migration is intentionally NOT included in this ZIP because it was requested separately.

## Configuration

Put your existing working Supabase Project URL and Publishable Key into:

`js/config.js`

Do not put a Supabase secret/service-role key in frontend code.

## Files

- `index.html` - updated Stage 2 UI
- `css/style.css` - updated styling
- `js/app.js` - authentication + create/join game logic
- `js/config.js` - Supabase frontend configuration placeholder
