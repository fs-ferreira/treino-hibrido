import test from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../lib/core.js";
import { createRemoteDiary, RemoteError } from "../lib/remote-diary.js";
const workout = (n) => ({
  type: "upper",
  done: false,
  sets: {
    fly: [
      { kg: n, reps: 8, done: true },
      { kg: "", reps: "", done: false },
      { kg: "", reps: "", done: false },
    ],
  },
  run: null,
});
function setup() {
  let data = defaults(),
    entry,
    broken = false,
    revoked = false,
    diskBroken = false;
  const applied = new Set(),
    attempts = [],
    statuses = [],
    updates = [],
    tasks = [];
  const identity = { user: { id: "u" }, sessionId: "s", generation: "g" };
  const journal = {
    get: async () => entry && structuredClone(entry),
    put: async (_id, value) => {
      if (diskBroken) throw Error("disk");
      entry = structuredClone(value);
    },
    remove: async () => {
      entry = null;
    },
  };
  let intercept;
  const request = async (path, options) => {
    if (revoked)
      throw new RemoteError(401, "SESSION_REVOKED", "Entre novamente.");
    if (path === "/me") return structuredClone(identity);
    if (path === "/diary")
      return { ...structuredClone(data), generation: "g", nextCursor: null };
    if (options?.method === "PUT") {
      attempts.push(options.body.operationId);
      if (intercept) await intercept();
      if (!applied.has(options.body.operationId)) {
        if (path === "/settings") data.settings = options.body.value;
        else data.sessions[path.split("/")[2]] = options.body.value;
        applied.add(options.body.operationId);
      }
      if (broken) throw Error("lost response");
      return { generation: "g" };
    }
    return {};
  };
  const make = () =>
    createRemoteDiary({
      request,
      journal,
      onStatus: (s) => statuses.push(s),
      onData: (value) => updates.push(value),
      schedule: (fn) => {
        tasks.push(fn);
        return tasks.length;
      },
      cancel: () => {},
    });
  return {
    make,
    identity,
    journal,
    statuses,
    updates,
    attempts,
    applied,
    tasks,
    get entry() {
      return entry;
    },
    get data() {
      return structuredClone(data);
    },
    set data(value) {
      data = structuredClone(value);
    },
    set broken(v) {
      broken = v;
    },
    set revoked(v) {
      revoked = v;
    },
    set diskBroken(v) {
      diskBroken = v;
    },
    set intercept(v) {
      intercept = v;
    },
  };
}
test("server confirmation, immediate send and unknown-commit retry are idempotent", async () => {
  const f = setup(),
    sync = f.make(),
    opened = await sync.open();
  f.broken = true;
  opened.data.sessions["2026-10-31"] = workout(10);
  assert.equal((await sync.save(opened.data)).saved, "local");
  assert.equal(f.entry.operations.length, 1);
  assert.equal(f.applied.size, 1);
  assert.equal(f.statuses.at(-1).state, "local");
  f.broken = false;
  await sync.resume();
  assert.equal(f.applied.size, 1);
  assert.equal(f.attempts[0], f.attempts[1]);
  assert.equal(f.entry, null);
  assert.equal(f.statuses.at(-1).state, "cloud");
});
test("new edits during a write are not acknowledged by the earlier response", async () => {
  const f = setup(),
    sync = f.make(),
    { data } = await sync.open();
  let release;
  const wait = new Promise((r) => (release = r));
  f.intercept = () => wait;
  data.sessions["2026-10-31"] = workout(10);
  const first = sync.save(data);
  await new Promise((r) => setTimeout(r, 5));
  data.sessions["2026-10-31"] = workout(11);
  const second = sync.save(data);
  await new Promise((r) => setTimeout(r, 5));
  release();
  await Promise.all([first, second]);
  assert.equal(f.attempts.length, 2);
  assert.equal(f.data.sessions["2026-10-31"].sets.fly[0].kg, 11);
  assert.equal(f.entry, null);
});
test("reload replays owned journal and a new session requires explicit recovery", async () => {
  const f = setup(),
    sync = f.make(),
    { data } = await sync.open();
  f.broken = true;
  data.sessions["2026-10-31"] = workout(10);
  await sync.save(data);
  sync.stop();
  f.identity.sessionId = "new-session";
  f.broken = false;
  const next = f.make(),
    opened = await next.open();
  assert.ok(opened.recovery);
  const count = f.attempts.length;
  await next.resume();
  assert.equal(f.attempts.length, count);
  await next.recover(true);
  assert.equal(f.entry, null);
});
test("authorization errors block uploads and combined network/storage failure is never saved", async () => {
  const f = setup(),
    sync = f.make(),
    { data } = await sync.open();
  f.diskBroken = true;
  f.broken = true;
  data.sessions["2026-10-31"] = workout(10);
  assert.equal((await sync.save(data)).saved, "memory");
  f.revoked = true;
  await sync.check();
  assert.equal(f.statuses.at(-1).state, "blocked");
  const attempts = f.attempts.length;
  await sync.resume();
  assert.equal(f.attempts.length, attempts);
});
test("generation changes quarantine old pending writes instead of restoring deleted data", async () => {
  const f = setup(),
    sync = f.make(),
    { data } = await sync.open();
  f.broken = true;
  data.sessions["2026-10-31"] = workout(10);
  await sync.save(data);
  sync.stop();
  f.identity.generation = "reset";
  // Startup metadata and snapshot must refer to the same generation in production.
  const request = async (path) =>
    path === "/me"
      ? f.identity
      : { ...defaults(), generation: "reset", nextCursor: null };
  const next = createRemoteDiary({ request, journal: f.journal });
  const opened = await next.open();
  assert.ok(opened.recovery);
  await assert.rejects(next.recover(true), /substituído/);
  await next.recover(false);
});

test("receipt replay reconciles actual cloud data instead of restoring an old confirmed value", async () => {
  const f = setup(),
    sync = f.make(),
    { data } = await sync.open();
  f.broken = true;
  data.sessions["2026-10-31"] = workout(10);
  await sync.save(data);
  const newer = f.data;
  newer.sessions["2026-10-31"] = workout(20);
  f.data = newer;
  f.broken = false;
  await sync.resume();
  assert.equal(f.applied.size, 1);
  assert.equal(f.updates.at(-1).sessions["2026-10-31"].sets.fly[0].kg, 20);
  assert.equal(f.entry, null);
});
