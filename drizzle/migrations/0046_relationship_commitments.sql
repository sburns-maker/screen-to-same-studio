-- Relationship commitments: independent mutual decision journal.
-- Migration only creates dormant tables. No relationship state is inferred or seeded.
-- Housing membership and residence permissions remain solely in migration 0045.
CREATE TABLE relationship_commitment_events (
  user_id uuid NOT NULL,
  id uuid NOT NULL,
  character_key text NOT NULL CHECK(length(character_key) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK(kind IN ('exclusive','partnership','engagement','marriage','separation','divorce')),
  proposed_by text NOT NULL CHECK(proposed_by IN ('user','character')),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
  user_response text NOT NULL DEFAULT 'pending' CHECK(user_response IN ('pending','accepted','declined')),
  character_response text NOT NULL DEFAULT 'pending' CHECK(character_response IN ('pending','accepted','declined')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source_type text NOT NULL CHECK(source_type IN ('message','call','outing','manual')),
  source_id text NOT NULL CHECK(length(source_id) BETWEEN 1 AND 150),
  note text CHECK(note IS NULL OR length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, character_key, source_type, source_id, kind),
  CHECK (status <> 'accepted' OR (user_response = 'accepted' AND character_response = 'accepted')),
  CHECK (status <> 'declined' OR (user_response = 'declined' OR character_response = 'declined'))
);
CREATE INDEX relationship_commitment_timeline ON relationship_commitment_events(user_id, character_key, occurred_at DESC);
REVOKE ALL ON relationship_commitment_events FROM PUBLIC;
-- Dedicated service-only access and transactional RPCs belong to the activation phase.
