# Conversation focus

An active storyline can last days. Its unchanged summary used to be passed as
the reason for each autonomous text, even after the character had already told
the player. Maya's Becca visit was one such loop.

The shared text pipeline now supplies participant-scoped storyline milestones
and up to 120 visible character messages from that owned conversation in the
past 24 hours. A pure focus planner detects prior discussion of the current
milestone, including common planning paraphrases. Shared everyday motifs also
group coffee, espresso and related drink names across all six characters.
These use distinct reply/photo notification groups, so two bubbles from one
photo do not count as two separate opportunities. Text captions and photos
participate in the same topic guidance, even without an active storyline. It demotes that topic to
background and removes it as the suggested initiation reason. The history is
not added wholesale to the model prompt.

Direct player questions, recorded milestone changes and explicit pending
follow-through stay available. Ordinary replies answer the player first.
Autonomous turns can choose a grounded interest, observation or opinion, or no
message; they do not have to invent an incident or rotate through canned topics.
Existing story progression, messages, memories, scores, budgets, photo decisions
and call rules are preserved. No migration or new secrets are needed.

`[conversation-focus]` revision `2026-10-27-topic-salience-2` logs only revision
and repetition counts, including continued everyday-topic recurrence. It never logs
names, topic IDs or conversation text. Matching is conservative and lexical;
it is not a semantic guarantee that the model will never repeat itself. A missing
history lookup falls back to the existing visible transcript.

## Verification after review and publication

1. After Maya mentions the unchanged Becca planning situation, observe later
   autonomous texts and replies to unrelated questions. They should not attach
   another scheduling update. Check the count-only diagnostic for recurrence.
2. Ask directly about Becca. Maya should retain and answer the actual situation.
3. A recorded new milestone may be discussed; elapsed time alone must not invent
   a visit, cancellation or new message from Becca.
4. Check another character's ongoing situation as well. Never reset history or
   increase relationship scores to force a conversational test.

Maya is already provisioned for incoming calls, with an 18% stable hourly
selection chance when otherwise eligible and a six-hour per-contact cooldown.
Existing integration tests cover her persisted incoming offers in Practice mode.
Production voice configuration and user permissions still need the existing
read-only Calls readiness checks; local tests do not prove the device rang.
