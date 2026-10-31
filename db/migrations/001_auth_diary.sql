CREATE TABLE "user" (
 id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
 "emailVerified" boolean NOT NULL DEFAULT false, image text,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "session" (
 id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text NOT NULL UNIQUE,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
 "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX session_user_idx ON "session"("userId");
CREATE TABLE account (
 id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,
 "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 "accessToken" text, "refreshToken" text, "idToken" text,
 "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz,
 scope text, password text, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
 UNIQUE("providerId", "accountId")
);
CREATE INDEX account_user_idx ON account("userId");
CREATE TABLE verification (id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE INDEX verification_identifier_idx ON verification(identifier);
CREATE TABLE "rateLimit" (id text PRIMARY KEY, key text NOT NULL UNIQUE, count integer NOT NULL, "lastRequest" bigint NOT NULL);
CREATE TABLE diaries (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 active_session_id text NOT NULL, generation text NOT NULL DEFAULT gen_random_uuid()::text,
 revision integer NOT NULL DEFAULT 0, settings jsonb, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workout_sessions (
 user_id text NOT NULL REFERENCES diaries(user_id) ON DELETE CASCADE,
 date date NOT NULL, payload jsonb NOT NULL, PRIMARY KEY(user_id, date)
);
CREATE TABLE applied_operations (
 user_id text NOT NULL REFERENCES diaries(user_id) ON DELETE CASCADE,
 operation_id uuid NOT NULL, fingerprint text NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, operation_id)
);
CREATE TABLE diary_imports (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES diaries(user_id) ON DELETE CASCADE,
 generation text NOT NULL, total_bytes integer NOT NULL CHECK(total_bytes BETWEEN 1 AND 10000000),
 part_count integer NOT NULL CHECK(part_count BETWEEN 1 AND 10),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour'
);
CREATE TABLE import_parts (
 import_id uuid NOT NULL REFERENCES diary_imports(id) ON DELETE CASCADE,
 part_index integer NOT NULL, data text NOT NULL, PRIMARY KEY(import_id, part_index)
);
-- This trigger serializes activation on the user's diary row. No HTTP hook race.
CREATE FUNCTION activate_diary_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO diaries(user_id, active_session_id) VALUES(NEW."userId", NEW.id)
 ON CONFLICT(user_id) DO UPDATE SET active_session_id = EXCLUDED.active_session_id;
 RETURN NEW;
END $$;
CREATE TRIGGER diary_session_activation AFTER INSERT ON "session" FOR EACH ROW EXECUTE FUNCTION activate_diary_session();
