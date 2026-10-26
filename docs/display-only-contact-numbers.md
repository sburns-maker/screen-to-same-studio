# Display-only contact numbers

Ordinary-looking 814 numbers replace the visible 555 numbers in chat headers, profiles, incoming banners, Recents and both call screens. `contact-numbers.ts` allocates immutable, unique aliases explicitly, including Riley and existing directory NPCs. These are fictional-service display labels, not verified unassigned real numbers; they may coincide with real subscribers. No telephone ownership, carrier provisioning or reservation is claimed.

Existing legacy `FICTIONAL_NUMBERS`/`fictionalNumber` service allocations remain untouched for database compatibility and availability checks. No database identifiers, call records, memories or calling permissions change. Actual in-app calls still use authenticated, owner-scoped conversation IDs. Future real-number/carrier work requires a separately verified routing field and explicit configuration; display aliases must never be promoted to carrier destinations.

There are no tel/sms links. Global telephone auto-detection is disabled for supporting browsers; devices may still offer their own actions for selected/copied text. Settings retains a concise fictional-service disclosure. No migration, provider secret or paid request is needed. After reviewed merge, Lovable must sync/build before the changed labels appear. Do not deploy automatically.

Validation: 31 focused phone/number/contact UI and SQL-backed call tests passed; TypeScript, production build, focused ESLint (existing legacy formatting rule disabled where applicable) and diff checks passed. No live provider requests or production database access.
