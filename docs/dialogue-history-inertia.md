# History-aware text delivery

## Why earlier prompt edits may be hard to notice

The merged shared dialogue profiles and everyday-texting rules are already reached by both Tess and contact generation. They do not guarantee live output quality. The same input includes the character's earlier dialogue, and long-running polished/teasing history remains an imitation target. Earlier guidance was in system rules; the end of the request returned to a generic “write next text” task. There was also no active server revision or output-pattern observation to distinguish old deployments from persistent model habits.

## Change

`dialogue-turn.ts` builds a final, character-specific next-turn instruction after the conversation/task. It explicitly treats earlier wording as historical evidence rather than a writing sample. Existing legal/bureaucracy comic-loop detection and serious/closing cues are repeated there; aggregate recent-message cues identify frequent dash asides, final-question hooks and uniformly long replies. These are guidance, never hard quotas or bans on actual factual topics.

The single generation must answer the real message, use that character's delivery, preserve meaningful grammar and stop when finished instead of attaching a comic or flirty coda. No canned responses, deletion of factual dialogue, intentional misspellings, forced slang/lowercase or another paid style-rewrite pass. Canonical identity, user choices, consent/refusal, state evaluation, schedule actions, photo decisions and shared memories remain under the same engine. Histories and saved records are not rewritten. Routine words alone are not a quality verdict; real legal/work questions remain valid.

This addition applies to text replies and autonomous texts for all six contacts. An explicit `deliveryChannel` excludes legacy speech-chain voice; in-person experiences and GPT-Live keep their existing delivery paths. This change does not claim to humanize live voice or in-person scenes.

Developer-authorized Simulation Debug → Messages → Dialogue delivery shows the active server rule revision and detected patterns from only that conversation's visible character texts. Current code revision is not proof older messages used it. Server `[dialogue-delivery]` logs report revision, character key, aggregate counts and continued routine labels, never transcripts, raw user content, private memories or provider secrets. Diagnostics observe failures rather than falsely calling them repaired.

## Verification and release

Mocked model adapter tests cover all six text routes, final instruction placement, preserved original history, one model call, unchanged plan payloads and voice/experience exclusions. Pure tests cover pattern persistence diagnostics, protected boundaries, endings, raw-text isolation and ordinary replies. These do not prove natural live prose.

No database migration, data reset, new provider configuration, model switch or deployment. Added bounded prompt text slightly increases input tokens; generation count/retry/budgets are unchanged. After reviewed merge, sync/build through Lovable. Verify the active server revision in debug, then assess fresh (not already-prepared) replies to an ordinary question, a sincere comment, a practical plan and a goodbye. Compare several turns per character; inspect continued routine labels if the loop persists. Do not erase past memories to change tone. No live paid provider call or production transcript was accessed during development.

Results: **1,042 tests passed / 55 opt-in skipped** in the default suite; **67 focused tests passed**. TypeScript, production build, focused lint (legacy formatting rule disabled on existing files) and diff checks passed. External model responses were mocked.
