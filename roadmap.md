# Tess roadmap

## Done (this pass)
- Initiation: 5h gap is eligibility-only; decideInitiation weighs curiosity, momentum, comfort, attraction, playfulness, trust, pressure, irritation, stage, schedule, life event, weather, plausible reason, recency; non-deterministic, not reverse-engineerable.
- Fictional weekly schedule (Eastern): weekday vet-practice ops shifts, Thu trivia, Sun family dinner, Mabel walks, errands; rotating temporary life events via `tess_life` table.
- Weather: server-side Open-Meteo for ZIP 16602 (Altoona PA), 30-min cache + 3h stale fallback, failure → omit silently; no GPS/permissions.
- Real-Time Mode (default OFF, per-conversation `real_time_mode`): schedule/work/sleep/events shape latency; practice mode keeps 3–240s delays.
- Debrief expanded: initiation, reciprocity, question balance, branches, exits, tone read, baseline change, friendly-vs-flirty, interest direction, momentum, who carried, tess_invested, missed openings, pressure — candid, no auto-praise.
- Simulation Debug rewritten: state deltas, stage, schedule/availability, life event/weather, initiation reasoning, photo eligibility, latency, recent memories.
- Offline: PWA service worker (NetworkFirst navigations, CacheFirst assets/images), localStorage outbox with "Queued" bubbles, auto-flush on reconnect; no fake offline replies.
- Push: Settings opt-in only; foreground notifications for newly visible Tess messages.
- Memory layers: relationship vs personal memory guidance in prompt; memory_type default `relationship`.
- Tests: 68 passing (initiation, schedule, events, latency, weather, photos, logic, canon, debrief schema, routing).

## Open / partial
- Push is foreground-only; background delivery needs VAPID + subscription storage (not built).
- Offline queue is localStorage, flushes while app is open; closed-app flush not verified.
- Email confirmation: auto-confirm enabled for development; RLS unchanged.
- Real-Time sleep path: Tess replies when she wakes rather than queuing a morning message.
- Photo system untouched this pass (preserved per instructions); consumes schedule/weather as prompt context only.
