import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../scripts/migrate.mjs";
import { createDiaryService } from "../server/service.js";
import { createApi } from "../server/http.js";
import {
  defaults,
  scheduledWorkouts,
  moveWorkout,
  addWorkout,
} from "../lib/core.js";
test("days: atomic moves, immutable receipts, recorded-workout protection and legacy replay", async () => {
  const db = new PGlite();
  let failSecond = false,
    inserts = 0;
  const query = async (sql, params) => {
    if (
      failSecond &&
      sql.startsWith("INSERT INTO workout_sessions") &&
      ++inserts === 2
    )
      throw Error("simulated transaction interruption");
    return params ? db.query(sql, params) : (await db.exec(sql)).at(-1);
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  try {
    await migrate(pool);
    await db.query(
      'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$1,$2,true)',
      ["u", "u@example.test"],
    );
    await db.query(
      'INSERT INTO "session"(id,token,"expiresAt","userId") VALUES($1,$1,now()+interval \'1 day\',$2)',
      ["s", "u"],
    );
    const actor = { userId: "u", sessionId: "s" },
      config = {
        origin: "http://localhost:4173",
        emails: new Set(["u@example.test"]),
      };
    const service = createDiaryService({ pool, config }),
      generation = (await service.me(actor)).generation;
    const data = defaults(),
      from = "2026-11-02",
      to = "2026-11-03",
      id = scheduledWorkouts(data, from)[0].id;
    moveWorkout(data, from, to, id);
    const operation = {
      operationId: randomUUID(),
      generation,
      value: data.sessions,
    };
    failSecond = true;
    await assert.rejects(
      service.save(actor, "/days", operation),
      /interruption/,
    );
    assert.deepEqual((await service.read(actor)).sessions, {});
    failSecond = false;
    const result = await service.save(actor, "/days", operation);
    assert.deepEqual(await service.save(actor, "/days", operation), result);
    assert.deepEqual((await service.read(actor)).sessions[from].workouts, []);
    assert.equal((await service.read(actor)).sessions[to].workouts.length, 2);
    assert.equal((await service.me(actor)).revision, 1);
    const day = structuredClone((await service.read(actor)).sessions[to]);
    day.workouts[1].sets["pec-deck"] = [
      { kg: 12.5, reps: 8, done: true },
      { kg: "", reps: "", done: false },
      { kg: "", reps: "", done: false },
    ];
    await service.save(actor, "/days", {
      generation,
      operationId: randomUUID(),
      value: { [to]: day },
    });
    await assert.rejects(
      service.save(actor, "/days", {
        generation,
        operationId: randomUUID(),
        value: {
          [to]: { workouts: [day.workouts[0]] },
          [from]: { workouts: [day.workouts[1]] },
        },
      }),
      (e) => e.code === "WORKOUT_STARTED",
    );
    assert.equal(
      (await service.read(actor)).sessions[to].workouts[1].sets["pec-deck"][0]
        .kg,
      12.5,
    );
    const legacy = {
      type: "easy",
      done: true,
      sets: {},
      run: { minutes: 30, km: 5, rpe: 4, notes: "legacy pending" },
    };
    const legacyOp = { generation, operationId: randomUUID(), value: legacy };
    await service.save(actor, `/sessions/${to}`, legacyOp);
    await service.save(actor, `/sessions/${to}`, legacyOp);
    const restored = (await service.read(actor)).sessions[to].workouts;
    assert.equal(restored.length, 3);
    assert.equal(
      restored.find((s) => s.id === `legacy-${to}`).run.notes,
      "legacy pending",
    );
    assert.equal(
      restored.find((s) => s.id === id).sets["pec-deck"][0].kg,
      12.5,
    );
    await assert.rejects(
      service.save(actor, "/days", {
        generation,
        operationId: randomUUID(),
        value: { [from]: { workouts: [restored[0]] } },
      }),
      (e) => e.status === 422,
    );
    const api = createApi({
      service,
      config,
      auth: {
        api: {
          getSession: async () => ({
            response: { user: { id: "u" }, session: { id: "s" } },
            headers: new Headers(),
          }),
        },
      },
    });
    const request = () =>
      new Request(config.origin + "/api/days", {
        method: "PUT",
        headers: { Origin: config.origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          generation,
          operationId: randomUUID(),
          value: { [from]: { workouts: [] } },
        }),
      });
    const oldClient = await api(request());
    assert.equal(oldClient.status, 426);
    assert.equal((await oldClient.json()).code, "CLIENT_UPGRADE_REQUIRED");
    const modern = request();
    modern.headers.set("X-Hibrido-Data-Version", "4");
    assert.equal((await api(modern)).status, 200);
  } finally {
    await db.close();
  }
});
