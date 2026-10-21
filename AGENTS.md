<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Tess app
- Tess model calls live in `src/lib/tess.server.ts` (prompts + gateway) and are reached only via server fns in `src/lib/tess.functions.ts`; keeps prompts, hidden-state logic and keys off the client.
- State math (delta clamping, difficulty scaling, stage derivation) lives in pure `src/lib/tess-logic.ts` with tests in `src/test/tess-logic.test.ts`; stages must emerge from state, never points.
- Delayed replies are stored with a future `visible_at`; the client hides messages until then. Unrevealed Tess replies are deleted and regenerated when the user sends more, so she responds to everything.
- Tess's photos are hybrid: curated library first (`src/lib/tess-photos.ts` rules, `tess-photo-images.ts` images), then optional generation via the provider abstraction in `src/lib/tess-image.server.ts`, always conditioned on the private canonical reference (`tess-reference/canonical.jpg`). Eligibility/cooldown is pure and tested; the server validates every model choice. Generated images live in private `tess-photos/<userId>/` with a `generated_images` row and are never regenerated; failures are silent (optional curated fallback).
- Photo policy separates technical capability, pure eligibility, and structured model willingness in `photo-policy.ts`; runTurn enforces all three, persistent conversation refusal scopes, and independent romantic intent so scores or opt-in never grant consent. Mature portraits use a separate category and conversation preference, never the ordinary-image prompt.
- The social world is deterministic and AI-free: `src/lib/social-logic.ts` (pure, seeded by stable event ids — re-planning a week must always produce identical output) plans NPC circles, links, shared events and knowledge; `src/lib/social.server.ts` persists via upserts inside the world tick. Knowledge isolation is enforced by querying only the character's own `character_knowledge` rows in runTurn — never widen that query.
