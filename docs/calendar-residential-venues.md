# Calendar homes and saved invitations

The calendar directory lists all homes returned by the authenticated player's
server-redacted housing snapshot, alongside public venues. It returns only
home key, label, planning status and known resident keys; no address or map
coordinates. Unknown/unrelated residences remain excluded by housing visibility.
Known but unauthorized homes show Invitation required instead of disappearing.
The selected contact's home and the player's home are relevant to that plan;
other residents' homes cannot be selected as an unrelated contact's venue.

Existing home visit permission remains valid. A clear recent invitation from
the current resident's visible conversation can also make their home available
in Add agreed plan. Recognition is conservative: explicit home/movie/game/dinner
or visit wording, at most the latest 80 character messages within seven days,
and no text predating the resident's current primary membership. User claims,
other characters, other users, hidden messages, hypotheticals/refusals and
terminal/expired invitations are not treated as fresh permission. Not all
natural-language phrasing is recognized; ambiguous invitations stay unavailable.

Listing is read-only. Saving an agreed new home visit revalidates the actual
owned invitation and its activity and explicit date/time, then registers the
host's source through calendar_event_action and confirms it through the existing
calendar_manual_action. The player must explicitly confirm the agreed details.
No new chat message or model call is made. The host source receipt and manual
request ID reuse the same plan across retries. A partially failed save can leave
the actual host invitation pending; retrying does not invent a second invitation
or confirmation. Existing-plan editing continues to require saved home access;
the editor does not offer an unregistered home invitation as a permission bypass.

Public calendar sweeps remain off. Existing terminal plans and active outing
protections remain enforced. Plans retain canonical home keys and use the normal
experience seed and calendar checks. Visit permissions remain plan-scoped under
the existing housing trigger; address disclosure, primary residence, household
membership, romance and physical travel are not inferred. The two-step save
uses existing idempotent transactions rather than introducing a second scheduler.

No migration or new secret is needed. After review and Lovable publication,
choose the contact, an activity such as Movie night, their invited home, and the
agreed date/time, then confirm We both agreed. Verify one accepted event and the
correct home in its outing. Tests use disposable PostgreSQL and mocks, not live
production records or paid generation. Local checks cannot verify the wording
or saved state of Claire's actual invitation.
