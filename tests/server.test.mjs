import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { defaults } from "../lib/core.js";
import { createDiaryService, PART_SIZE } from "../server/service.js";
import { createAuth } from "../server/auth.js";
import { createApi } from "../server/http.js";
import { migrate } from "../scripts/migrate.mjs";
import { readConfig } from "../server/config.js";
const config = {
  origin: "http://localhost:4173",
  secret: "test-secret-only-not-a-real-credential-123456789",
  googleId: "test-id",
  googleSecret: "test-secret",
  emails: new Set(["a@example.test", "b@example.test"]),
  production: false,
};
const data = () => ({ type: "upper", done: true, sets: {}, run: null });
test("PostgreSQL: isolation, session activation, receipts, generation and atomic imports", async () => {
  const db = new PGlite();

  let serial = Promise.resolve();
  const query = async (sql, params) =>
    params ? db.query(sql, params) : (await db.exec(sql)).at(-1);
  const pool = {
    query: (...args) => query(...args),
    async connect() {
      let unlock;
      const prev = serial;
      serial = new Promise((r) => (unlock = r));
      await prev;
      return { query: (...args) => query(...args), release: () => unlock() };
    },
  };
  await migrate(pool);
  await migrate(pool);
  assert.equal(
    (await db.query("SELECT count(*) FROM schema_migrations")).rows[0].count,
    1,
  );
  const service = createDiaryService({ pool, config });
  async function login(userId, sessionId) {
    await db.query(
      'INSERT INTO "session"(id,token,"expiresAt","userId") VALUES($1,$2,now()+interval \'7 days\',$3)',
      [sessionId, sessionId + "-token", userId],
    );
    return { userId, sessionId };
  }
  for (const id of ["a", "b"])
    await db.query(
      'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$1,$2,true)',
      [id, id + "@example.test"],
    );
  let a = await login("a", "s1"),
    b = await login("b", "b1");
  const gen = (await service.me(a)).generation;
  const body = { operationId: randomUUID(), generation: gen, value: data() };
  await service.save(a, "/sessions/2026-10-31", body);
  assert.equal(Object.keys((await service.read(b)).sessions).length, 0);
  const first = await service.save(a, "/sessions/2026-10-31", body);
  assert.equal(first.revision, 1);
  await assert.rejects(
    service.save(a, "/sessions/2026-10-31", {
      ...body,
      value: { ...data(), done: false },
    }),
    (e) => e.code === "OPERATION_REUSED",
  );
  const old = a;
  a = await login("a", "s2");
  await assert.rejects(service.read(old), (e) => e.status === 401);
  await assert.rejects(
    service.save(old, "/sessions/2026-10-30", {
      ...body,
      operationId: randomUUID(),
    }),
    (e) => e.status === 401,
  );
  assert.equal((await service.me(a)).sessionId, "s2");
  await db.query('UPDATE "user" SET "emailVerified"=false WHERE id=$1', ["a"]);
  await assert.rejects(service.me(a), (e) => e.status === 403);
  await db.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', ["a"]);
  // Restore is atomic and parts cannot be accessed by another account.
  const bytes = Buffer.from(JSON.stringify(defaults()));
  const begin = await service.beginImport(a, {
    generation: gen,
    totalBytes: bytes.length,
    partCount: 1,
  });
  const commit = { generation: gen, operationId: randomUUID() };
  await assert.rejects(
    service.commitImport(a, begin.id, commit),
    (e) => e.code === "IMPORT_INCOMPLETE",
  );
  assert.ok((await service.read(a)).sessions["2026-10-31"]);
  await assert.rejects(
    service.uploadPart(b, begin.id, 0, { data: bytes.toString("base64") }),
    (e) => e.status === 404,
  );
  await service.uploadPart(a, begin.id, 0, { data: bytes.toString("base64") });
  const restored = await service.commitImport(a, begin.id, commit);
  assert.notEqual(restored.generation, gen);
  assert.deepEqual(await service.commitImport(a, begin.id, commit), restored);
  await assert.rejects(
    service.save(a, "/sessions/2026-10-31", {
      ...body,
      operationId: randomUUID(),
    }),
    (e) => e.code === "GENERATION_CHANGED",
  );
  assert.equal(Object.keys((await service.read(a)).sessions).length, 0);
  // A full 10 MB transfer is chunked; a failed final validation rolls back.
  const base = JSON.stringify({ ...defaults(), padding: "" });
  const large = Buffer.from(
    JSON.stringify({
      ...defaults(),
      padding: "x".repeat(10_000_000 - Buffer.byteLength(base)),
    }),
  );
  assert.equal(large.length, 10_000_000);
  const upload = await service.beginImport(a, {
    generation: restored.generation,
    totalBytes: large.length,
    partCount: Math.ceil(large.length / PART_SIZE),
  });
  for (
    let offset = 0, index = 0;
    offset < large.length;
    offset += PART_SIZE, index++
  )
    await service.uploadPart(a, upload.id, index, {
      data: large.subarray(offset, offset + PART_SIZE).toString("base64"),
    });
  const largeResult = await service.commitImport(a, upload.id, {
    generation: restored.generation,
    operationId: randomUUID(),
  });
  await service.save(a, "/sessions/2026-10-31", {
    ...body,
    generation: largeResult.generation,
    operationId: randomUUID(),
  });
  const invalid = Buffer.from(JSON.stringify({ ...defaults(), settings: {} }));
  const badUpload = await service.beginImport(a, {
    generation: largeResult.generation,
    totalBytes: invalid.length,
    partCount: 1,
  });
  await service.uploadPart(a, badUpload.id, 0, {
    data: invalid.toString("base64"),
  });
  await assert.rejects(
    service.commitImport(a, badUpload.id, {
      generation: largeResult.generation,
      operationId: randomUUID(),
    }),
    (e) => e.status === 422,
  );
  assert.ok((await service.read(a)).sessions["2026-10-31"]);
  const beforeClear = (await service.me(a)).generation;
  await service.clear(a, {
    generation: beforeClear,
    operationId: randomUUID(),
  });
  await assert.rejects(
    service.save(a, "/sessions/2026-10-31", {
      ...body,
      generation: beforeClear,
      operationId: randomUUID(),
    }),
    (e) => e.code === "GENERATION_CHANGED",
  );
  // Exercise Better Auth's real adapter and signed-cookie session lookup.
  const auth = createAuth(pool, config);
  const cookie =
    "better-auth.session_token=" +
    encodeURIComponent(
      "s2-token." +
        createHmac("sha256", config.secret).update("s2-token").digest("base64"),
    );
  const api = createApi({ auth, service, config });
  const response = await api(
    new Request(config.origin + "/api/me", { headers: { cookie } }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, "a");
  const csrf = await api(
    new Request(config.origin + "/api/settings", {
      method: "PUT",
      headers: {
        cookie,
        origin: "https://evil.test",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
  );
  assert.equal(csrf.status, 403);
  const denied = await api(
    new Request(config.origin + "/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin: config.origin, "Content-Type": "application/json" },
      body: "{}",
    }),
  );
  assert.equal(denied.status, 404);
  const signedIn = await api(
    new Request(config.origin + "/api/auth/sign-in/social", {
      method: "POST",
      headers: { origin: config.origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "google",
        callbackURL: "https://evil.test",
      }),
    }),
  );
  assert.equal(signedIn.status, 200);
  const redirect = await signedIn.json();
  assert.equal(new URL(redirect.url).hostname, "accounts.google.com");
  assert.equal(
    new URL(redirect.url).searchParams.get("redirect_uri"),
    config.origin + "/api/auth/callback/google",
  );
  const cookies = signedIn.headers.getSetCookie().join(";");
  assert.match(cookies, /HttpOnly/i);
  assert.match(cookies, /SameSite=Lax/i);
  const context = await auth.$context;
  await assert.rejects(
    context.internalAdapter.createUser({
      name: "Intruso",
      email: "evil@example.test",
      emailVerified: true,
    }),
  );
  // Simultaneous activations leave exactly one current session.
  const actors = await Promise.all([login("a", "s3"), login("a", "s4")]);
  const checks = await Promise.allSettled(
    actors.map((actor) => service.me(actor)),
  );
  assert.equal(checks.filter((v) => v.status === "fulfilled").length, 1);
  await db.close();
});
test("configuration fails closed without leaking secret values", () => {
  assert.throws(() => readConfig({}), /SERVER_NOT_CONFIGURED/);
  assert.throws(
    () =>
      readConfig({
        DATABASE_URL: "password-must-never-be-printed",
        BETTER_AUTH_SECRET: "short",
      }),
    (error) => !error.message.includes("password"),
  );
});
