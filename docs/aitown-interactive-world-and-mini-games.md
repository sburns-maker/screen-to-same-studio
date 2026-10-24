# AI Town interactive world & game direction

## Product north star (parked after mini-games)
AI Town is a persistent simulation, not primarily a romance/texting app. Preserve this direction:
- Same canonical character brain, memories, relationships, plans, calendar and location across all modalities.
- Text-only messaging remains available everywhere; user can switch seamlessly to voice or hybrid (user types while character speaks).
- Future immersive first-person experiences: visit a house, move between rooms, interact with furniture/objects, explore the town, attend dates, and play games in-world.
- In a visual date, characters react with expressions, gaze, gestures, and movement to typed dialogue; no voice requirement.
- The 3D renderer does **not** independently invent narrative facts. Scene state and canonical world events come from a shared server model.
- Friendship, hobbies, everyday routines, and play are equally important as romantic activity.

## Mini-games release plan
1. **Trivia first-class at launch** (Maya and Tess play trivia). Actual answer grading, 5/10/20 questions, categories, calibrated opponent knowledge and fallibility, character banter, asynchronous invitations and rematches.
2. **Four in a Row**: interactive touch board, legal move validation, real turn-by-turn AI, game resume.
3. **Word Hunt**: swipe grid, deterministic dictionary/scoring, fair opponents.
4. **8 Ball**: actual touch aiming, power and ball physics, collision/pocket rules, preferably landscape on mobile. Never simulate a pool match with prose-only LLM output.

### Shared rules
- Game engine authoritative: validates move legality, outcomes, scores, timeouts, and turn order.
- Character autonomy: may initiate, accept, postpone, decline or suggest rematches; schedules matter.
- Gameplay is never a forced romance incentive; shared events can influence memories/momentum contextually.
- Matches must be persisted per user, character, game and game state in the database; multi-device resume is a launch requirement.
- Character reactions derive from genuine moves and outcomes; no fictional retroactive victories.
- Never leak one character's private conversation history to another.
- Accessible responsive interactive screens with keyboard/touch controls. Mini-games are part of Messages, and game state should survive navigation.

## Implementation status
The first branch adds a standalone **local-device prototype** of interactive Trivia (10 fixed graded questions, reproducible fallible opponent score) and Four in a Row (legal drops, detection of four, baseline tactical opponent). Accessible from the chat gamepad icon. No server-created invitations, no cross-device synchronization, no model-generated dialogue, no persistent match memories yet. **Do not describe this as the multiplayer backend being completed.**

## Next engineering milestones
- Move rules and models to independently tested pure modules with rule/score property tests.
- Create protected game_match/game_turn DB schema, RLS scoped to authenticated user; server adjudicates turns atomically.
- Model AI skill and personalities server-side, with bounded randomness/consistent game sessions.
- Integrate game cards into messages, accept/decline/challenge actions, asynchronous turn notifications.
- Create durable shared-event/memory hooks after verified completed matches.
- Expand questions to moderated categorized packs with replay variation.
- Add Word Hunt and physics-based 8 Ball as further releases.
- Later display the same game in first-person immersive environments with the same state and history.
