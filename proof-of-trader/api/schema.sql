-- Apply only after authenticated proof verification is implemented.
CREATE TABLE IF NOT EXISTS event_capacity (
 event_id text PRIMARY KEY,
 capacity integer NOT NULL CHECK(capacity>0),
 admitted integer NOT NULL DEFAULT 0 CHECK(admitted>=0),
 CHECK(admitted<=capacity)
);
CREATE TABLE IF NOT EXISTS applications (
 id uuid PRIMARY KEY,
 event_id text NOT NULL REFERENCES event_capacity(event_id),
 nullifier text NOT NULL,
 status text NOT NULL CHECK(status IN ('approved','waitlisted','checked_in','revoked')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_id,nullifier)
);
CREATE TABLE IF NOT EXISTS checkins (
 application_id uuid PRIMARY KEY REFERENCES applications(id),
 checked_in_at timestamptz NOT NULL DEFAULT now()
);
-- Within a single DB transaction after verifying a genuine proof:
-- UPDATE event_capacity SET admitted=admitted+1 WHERE event_id=$1 AND admitted<capacity RETURNING admitted;
-- If no row is returned, create a waitlisted application instead.
-- Do not insert approvals outside that transaction.
