import test from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  normalizeStoredDay,
  moveWorkout,
  preserveDayMetadata,
  preserveSettingsMetadata,
} from "../lib/core.js";
import { createRemoteDiary, RemoteError } from "../lib/remote-diary.js";
const workout = (n) => ({
  workouts: [
    {
      id: "legacy-2026-10-31",
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
    },
  ],
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
        if (path === "/settings")
          data.settings = preserveSettingsMetadata(
            options.body.value,
            data.settings,
          );
        else if (path === "/days") {
          for (const [date, day] of Object.entries(options.body.value))
            data.sessions[date] = preserveDayMetadata(day, data.sessions[date]);
        } else {
          const date = path.split("/")[2],
            incoming = normalizeStoredDay(date, options.body.value),
            day = data.sessions[date] ?? { workouts: [] };
          for (const item of incoming.workouts) {
            const i = day.workouts.findIndex((s) => s.id === item.id);
            if (i < 0) day.workouts.push(item);
            else day.workouts[i] = item;
          }
          data.sessions[date] = day;
        }
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
test("v5 settings queue replays without erasing FC or changing the immutable operation", async () => {
  const f = setup();
  const data = f.data;
  data.settings.heartRate = { birthMonth: "1996-11", sex: "female" };
  f.data = data;
  const legacy = structuredClone(data);
  legacy.version = 5;
  delete legacy.settings.heartRate;
  legacy.settings.longMinutes = 75;
  const operation = {
    id: crypto.randomUUID(),
    path: "/settings",
    value: legacy.settings,
    sending: true,
  };
  await f.journal.put("u", {
    sessionId: "s",
    generation: "g",
    operations: [operation],
    snapshot: legacy,
    blocked: false,
  });
  f.broken = true;
  const remote = f.make();
  const opened = await remote.open();
  assert.deepEqual(opened.data.settings.heartRate, data.settings.heartRate);
  assert.equal(opened.data.settings.longMinutes, 75);
  await remote.resume();
  assert.deepEqual(f.entry.operations[0].value, operation.value);
  f.broken = false;
  await remote.resume();
  assert.deepEqual(f.data.settings.heartRate, data.settings.heartRate);
  assert.ok(f.attempts.every((id) => id === operation.id));
  remote.stop();
});

test("opening phases follow authentication and do not repeat in background checks", async () => {
  const events = [],
    f = setup(),
    remote = createRemoteDiary({
      journal: f.journal,
      request: async (path) => {
        events.push(path);
        return path === "/me"
          ? f.identity
          : { ...f.data, generation: "g", nextCursor: null };
      },
      onOpenPhase: (phase) => events.push(phase),
    });
  await remote.open();
  assert.deepEqual(events, ["checking", "/me", "loading", "/diary"]);
  events.length = 0;
  await remote.check();
  assert.deepEqual(events, ["/me", "/diary"]);
  remote.stop();
});

test("stopped opening ignores a late authentication response", async () => {
  let release;
  const pending = new Promise((resolve) => (release = resolve)),
    phases = [],
    requests = [],
    remote = createRemoteDiary({
      request: (path) => {
        requests.push(path);
        return pending;
      },
      onOpenPhase: (phase) => phases.push(phase),
    });
  const opening = remote.open();
  remote.stop();
  release({ user: { id: "u" }, sessionId: "s" });
  await assert.rejects(opening, { name: "AbortError" });
  assert.deepEqual(phases, ["checking"]);
  assert.deepEqual(requests, ["/me"]);
});

test("failed authentication never announces diary loading", async () => {
  const phases = [],
    remote = createRemoteDiary({
      request: async () => {
        throw new RemoteError(401, "AUTH_REQUIRED", "Entre novamente.");
      },
      onOpenPhase: (phase) => phases.push(phase),
    });
  await assert.rejects(remote.open(), { status: 401 });
  assert.deepEqual(phases, ["checking"]);
});

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
  assert.equal(f.data.sessions["2026-10-31"].workouts[0].sets.fly[0].kg, 11);
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
  assert.equal(
    f.updates.at(-1).sessions["2026-10-31"].workouts[0].sets.fly[0].kg,
    20,
  );
  assert.equal(f.entry, null);
});

test("a queued two-day move survives a lost commit response and later edits", async () => {
  const f = setup();
  const initial = defaults();
  initial.sessions["2026-10-31"] = {
    workouts: [
      { id: "move-fixture", type: "upper", done: false, sets: {}, run: null },
    ],
  };
  f.data = initial;
  const remote = f.make(),
    opened = await remote.open();
  f.broken = true;
  moveWorkout(opened.data, "2026-10-31", "2026-11-01", "move-fixture");
  assert.equal((await remote.save(opened.data)).saved, "local");
  const first = structuredClone(f.entry.operations[0]);
  assert.equal(first.path, "/days");
  assert.equal(Object.keys(first.value).length, 2);
  opened.data.sessions["2026-11-01"].workouts[0].sets.fly = [
    { kg: 12, reps: 8, done: true },
    { kg: "", reps: "", done: false },
    { kg: "", reps: "", done: false },
  ];
  await remote.save(opened.data);
  assert.deepEqual(f.entry.operations[0], first);
  assert.equal(f.entry.operations.length, 2);
  f.broken = false;
  await remote.check();
  assert.deepEqual(f.data.sessions["2026-10-31"].workouts, []);
  assert.equal(f.data.sessions["2026-11-01"].workouts[0].sets.fly[0].kg, 12);
  assert.equal(f.applied.size, 2);
  assert.equal(f.entry, null);
  remote.stop();
});

test("legacy pending operations keep their receipts and merge without replacing sibling workouts", async () => {
  const f = setup(),
    date = "2026-10-31",
    legacy = workout(10).workouts[0];
  const { id, ...raw } = legacy;
  const data = defaults();
  data.sessions[date] = {
    workouts: [
      { ...legacy, sets: {} },
      {
        id: "sibling",
        type: "easy",
        done: true,
        sets: {},
        run: { minutes: 30, km: 5, rpe: 4, notes: "preserve" },
      },
    ],
  };
  f.data = data;
  const operation = {
    id: crypto.randomUUID(),
    path: "/sessions/" + date,
    value: raw,
    sending: true,
  };
  await f.journal.put("u", {
    sessionId: "s",
    generation: "g",
    snapshot: { ...defaults(), version: 3, sessions: { [date]: raw } },
    operations: [operation],
    blocked: false,
  });
  f.broken = true;
  const remote = f.make(),
    opened = await remote.open();
  await remote.save(opened.data);
  assert.deepEqual(f.entry.operations[0], operation);
  assert.equal(opened.data.sessions[date].workouts.length, 2);
  f.broken = false;
  await remote.check();
  assert.equal(f.data.sessions[date].workouts.length, 2);
  assert.equal(
    f.data.sessions[date].workouts.find((s) => s.id === "sibling").run.notes,
    "preserve",
  );
  assert.equal(
    f.data.sessions[date].workouts.find((s) => s.id === id).sets.fly[0].kg,
    10,
  );
  assert.equal(f.applied.size, 1);
  remote.stop();
});

test("v4 pending payloads preserve v5 timestamps without changing their receipt or body", async () => {
  const f = setup(),
    date = "2026-10-31",
    initial = defaults();
  initial.sessions[date] = workout("");
  for (const set of initial.sessions[date].workouts[0].sets.fly)
    Object.assign(set, { done: false, reps: "", kg: "" });
  initial.sessions[date].workouts[0].canceledAt = "2026-11-04T15:30:00.000Z";
  f.data = initial;
  const legacy = structuredClone(initial.sessions[date]);
  delete legacy.workouts[0].canceledAt;
  const operation = {
    id: crypto.randomUUID(),
    path: "/days",
    value: { [date]: legacy },
    sending: true,
  };
  await f.journal.put("u", {
    sessionId: "s",
    generation: "g",
    snapshot: initial,
    operations: [operation],
    blocked: false,
  });
  f.broken = true;
  const remote = f.make(),
    opened = await remote.open();
  assert.equal(
    opened.data.sessions[date].workouts[0].canceledAt,
    initial.sessions[date].workouts[0].canceledAt,
  );
  await remote.save(opened.data);
  assert.deepEqual(f.entry.operations[0], operation);
  f.broken = false;
  await remote.check();
  assert.equal(
    f.data.sessions[date].workouts[0].canceledAt,
    initial.sessions[date].workouts[0].canceledAt,
  );
  assert.equal(f.applied.size, 1);
  remote.stop();
});

test("conflicting legacy metadata enters recovery and preserves the original pending payload", async () => {
  const f = setup(),
    date = "2026-10-31",
    initial = defaults();
  initial.sessions[date] = workout(10);
  initial.sessions[date].workouts[0].done = true;
  initial.sessions[date].workouts[0].completedAt = "2026-11-04T15:30:00.000Z";
  f.data = initial;
  const legacy = structuredClone(initial.sessions[date]);
  legacy.workouts[0].done = false;
  delete legacy.workouts[0].completedAt;
  const operation = {
    id: crypto.randomUUID(),
    path: "/days",
    value: { [date]: legacy },
    sending: true,
  };
  await f.journal.put("u", {
    sessionId: "s",
    generation: "g",
    snapshot: initial,
    operations: [operation],
    blocked: false,
  });
  const remote = f.make(),
    opened = await remote.open();
  assert.ok(opened.recovery);
  assert.equal(opened.data.sessions[date].workouts[0].done, true);
  await assert.rejects(remote.recover(true), /Estado/);
  assert.deepEqual(f.entry.operations[0], operation);
  assert.equal(f.attempts.length, 0);
  remote.stop();
});
