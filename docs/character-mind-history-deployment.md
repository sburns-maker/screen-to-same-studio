# Character Mind history: implementation and limitations

## Deploy
1. Apply `docs/sql/20261024_relationship_evaluations.sql` to the connected Supabase project before expecting evaluation history.
2. Ensure `SUPABASE_SERVICE_ROLE_KEY` is available only in the trusted server runtime; never expose it to the browser.
3. Execute `npm test -- src/test/character-mind-insights.test.ts`, `npm run build`, and manually inspect Character Mind on narrow Android screens.
4. Check character/user isolation and that each new interaction writes at most one evaluation per message.

## What is recorded
- Text-message and autonomous text turns record state **before and after**, the actual applied changes, event tags, stage, tone, timestamp, and a short contextual user message.
- Events and social plans appear beside the timeline and can be reviewed on their planned date.
- Evaluations are shown for a planned outing window when the timestamp overlaps; this is not proof that an outing caused any relationship change.
- "Fictional inner perspective" is an optional, deterministic in-character interpretation from persisted numerical changes. It is NOT the model's private hidden reasoning and is not a new secret source of facts.
- The database starts building history only after deployment: older turns cannot be reconstructed from the current state. The existing memory timeline may still show prior memories.

## Further integration needed
- Image/photo-turn delivery uses a separate transactional pipeline. Add its evaluation logging in the final delivery commit path, not when a photo was merely requested or generation started.
- Voice/call turn evaluation logging must be confirmed against the voice completion transaction.
- The model does not currently emit an independent private diary entry. If that feature is later added, save it as explicitly generated fictional prose with provenance, not a factual transcript of hidden thought.
- No live application build or migration was run through this GitHub-only connection.
