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
- Tess's photos are a fixed library (`src/lib/tess-photos.ts` rules, `tess-photo-images.ts` images); the model may only pick an eligible id, validated server-side, so her face stays consistent.
