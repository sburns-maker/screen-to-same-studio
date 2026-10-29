# Mini-game relationship integration: deployment checklist

This work is **not live** until the database script is applied to the same Supabase project serving this app.

1. In the connected Supabase SQL editor, apply `docs/sql/20261024_game_matches.sql` using a database owner.
2. Verify the server has `SUPABASE_SERVICE_ROLE_KEY` and that the browser receives only the publishable key.
3. Run `npm test -- src/test/game-match-validation.test.ts` and `npm run build` in a trusted checked-out branch.
4. Test Trivia and Four in a Row: resume on another device, finish, share once, replay reload, and verify exactly one `shared_game` memory. Verify a small +1 playfulness / momentum nudge only for the first two finished matches per character in a rolling 24-hour window, with no romantic score changes.
5. Test two separate users/characters and confirm RLS rejects cross-user reads.

Current limits:
- Trivia and Four in a Row synchronize match progress to the database and replay the result to verify legal scoring, but client-provided progress is not a cryptographically trustworthy move log. A stronger authoritative-turn protocol is required before competitive rewards.
- Word Hunt and 8 Ball remain playable browser prototypes. Their results cannot change relationship points or be shared as verified match results until their move/physics engines support deterministic server replay.
- Gameplay chat uses the canonical character conversation; ordinary dialogue may change relationship state using the existing character engine.
- This branch has no observed GitHub Actions checks; the new tests have not been executed in CI.

**Important for the merge:** PR code alone does not create the `game_matches` database table or the `finalize_game_match` function. Apply the SQL migration before enabling game completion. Chat can use the existing Messages relationship engine independently, while verified match effects and durable game memories require the migration. Word Hunt and 8 Ball are excluded from automatic scoring until deterministic server-side validation exists.
