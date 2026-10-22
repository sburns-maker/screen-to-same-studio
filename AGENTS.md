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
- Tess model prompts live in `src/lib/tess.server.ts`, with direct OpenAI configuration in `src/lib/text-ai.server.ts`. They are reached only via server fns in `src/lib/tess.functions.ts`, keeping prompts, hidden-state logic and keys off the client.
- State math (delta clamping, difficulty scaling, stage derivation) lives in pure `src/lib/tess-logic.ts` with tests in `src/test/tess-logic.test.ts`; stages must emerge from state, never points.
- Delayed replies are stored with a future `visible_at`; the client hides messages until then. Unrevealed text replies are replaced when the user sends more; already-generated pending photo attachments are retained so their images are not charged again.
- Tess's photos are hybrid: curated library first (`src/lib/tess-photos.ts` rules, `tess-photo-images.ts` images), then optional generation via the provider abstraction in `src/lib/tess-image.server.ts`, always conditioned on the private canonical reference (`tess-reference/canonical.jpg`). Eligibility/cooldown is pure and tested; the server validates every model choice. Generated images live in private `tess-photos/<userId>/` with a `generated_images` row and are never regenerated; failed image actions send no misleading caption and are never automatically regenerated.
- Photo policy separates technical capability, pure eligibility, and structured model willingness in `photo-policy.ts`; runTurn enforces all three, persistent conversation refusal scopes, and independent romantic intent so scores or opt-in never grant consent. Mature portraits use a separate category and conversation preference, never the ordinary-image prompt.
- The social world is deterministic and AI-free: `src/lib/social-logic.ts` (pure, seeded by stable event ids — re-planning a week must always produce identical output) plans NPC circles, links, shared events and knowledge; `src/lib/social.server.ts` persists via upserts inside the world tick. Knowledge isolation is enforced by querying only the character's own `character_knowledge` rows in runTurn — never widen that query.
- Multi-week situations use `storyline-logic.ts` for bounded deterministic branching and `storyline.server.ts` for shared-event root checkpoints, immutable milestone events, participant-only current knowledge and idempotent personal outcome memories; advance only inside the managed world tick, independently of its AI budget, to keep closed-app continuity cheap and recoverable.
- Web Push uses a dedicated push-only worker served by `src/routes/api/public/push-worker.ts` (scope `/api/public/push/`), separate from the offline `/sw.js`; static files are blocked by the private-publish sign-in wall, `/api/public/*` is not.
- Tess voice is enforced deterministically by `src/lib/tess-voice.ts` on her output and on her past lines in the transcript; prompts alone drift because the model imitates its own history.

- Spontaneous photos use the pure `photo-opportunities.ts` rules and the existing turn pipeline. `photo-delivery.server.ts` reserves stable actions in the service-only job ledger; migration `0008_atomic_photo_delivery.sql` commits delivered messages, attachment metadata, state and memories atomically. Never automatically retry an uncertain image request. Developer photo actions require both an explicit flag and a user-ID allowlist.

- Media/profile expansion: `currentCanonical` in `profile-media.server.ts` resolves the owner/character's explicitly approved private reference, otherwise the original bundled portrait. All production character-image paths must pass that resolved reference to `generateTessImage`; never derive identity from the active avatar or promote generated output automatically. Avatar-only changes preserve the anchor. Canonical changes require explicit visual approval, immutable private bytes, integrity hash and an audit record (migration 0016). Do not expose signed storage URLs through sharing/copy actions. User-uploaded video remains separate from optional, unimplemented paid AI video generation.
