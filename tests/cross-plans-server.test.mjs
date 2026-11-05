import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../scripts/migrate.mjs";
import { createDiaryService } from "../server/service.js";
import {
  defaults,
  materializeDay,
  chooseOptionalWorkout,
  createWorkout,
  completeWorkout,
} from "../lib/core.js";
import { changePlan, CROSS_PLAN_ID } from "../lib/plans.js";
test("API persists dated plans and Cross, rejects Saturday conflicts and protects legacy metadata", async () => {
  const db = new PGlite();
  const query = async (sql, params) =>
    params ? db.query(sql, params) : (await db.exec(sql)).at(-1);
  const pool = { query, connect: async () => ({ query, release() {} }) };
  try {
    await migrate(pool);
    await db.query(
      'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$1,$2,true)',
      ["plans", "plans@example.test"],
    );
    await db.query(
      'INSERT INTO "session"(id,token,"expiresAt","userId") VALUES($1,$1,now()+interval \'1 day\',$2)',
      ["plans-session", "plans"],
    );
    const actor = { userId: "plans", sessionId: "plans-session" },
      service = createDiaryService({
        pool,
        config: {
          origin: "http://localhost:4173",
          emails: new Set(["plans@example.test"]),
        },
      });
    const generation = (await service.me(actor)).generation,
      op = (value) => ({ generation, operationId: randomUUID(), value });
    const d = defaults();
    d.settings = changePlan(
      d.settings,
      CROSS_PLAN_ID,
      "2026-11-02",
      "2026-11-02",
    );
    const before = defaults();
    materializeDay(before, "2026-11-05").workouts[0].type = "interval";
    await service.save(actor, "/days", op(before.sessions));
    const settingsOp = op(d.settings),
      body = JSON.stringify(settingsOp),
      receipt = await service.save(actor, "/settings", settingsOp);
    assert.deepEqual(
      await service.save(actor, "/settings", settingsOp),
      receipt,
    );
    assert.equal(JSON.stringify(settingsOp), body);
    assert.deepEqual(
      (await service.read(actor)).settings.planHistory,
      d.settings.planHistory,
    );
    const old = { ...d.settings };
    delete old.planHistory;
    old.longMinutes = 75;
    await service.save(actor, "/settings", op(old));
    assert.deepEqual(
      (await service.read(actor)).settings.planHistory,
      d.settings.planHistory,
    );
    materializeDay(d, "2026-11-05");
    assert.equal(d.sessions["2026-11-05"].workouts[0].type, "cross");
    await service.save(
      actor,
      "/days",
      op({ "2026-11-05": d.sessions["2026-11-05"] }),
    );
    assert.equal(
      (await service.read(actor)).sessions["2026-11-05"].workouts[0].type,
      "cross",
    );
    const item = chooseOptionalWorkout(d, "2026-11-07", "cross");
    await service.save(actor, "/days", op(d.sessions));
    const tooMany = structuredClone(d.sessions);
    tooMany["2026-11-07"].workouts.push({
      ...createWorkout("long"),
      optional: true,
    });
    await assert.rejects(
      service.save(actor, "/days", op(tooMany)),
      (e) => e.status === 422,
    );
    const wrongType = structuredClone(d.sessions);
    wrongType["2026-11-07"].workouts[0].type = "easy";
    await assert.rejects(
      service.save(actor, "/days", op(wrongType)),
      (e) => e.status === 422,
    );
    item.cross = { minutes: 50, rpe: 8, notes: "Aula" };
    completeWorkout(item, "2026-11-07T18:00:00.000Z");
    await service.save(actor, "/days", op(d.sessions));
    const legacy = structuredClone(d.sessions);
    delete legacy["2026-11-07"].workouts[0].optional;
    delete legacy["2026-11-07"].workouts[0].sourcePlanId;
    delete legacy["2026-11-07"].workouts[0].cross;
    const legacyOp = op(legacy),
      immutable = JSON.stringify(legacyOp);
    const result = await service.save(actor, "/days", legacyOp);
    assert.deepEqual(await service.save(actor, "/days", legacyOp), result);
    assert.equal(JSON.stringify(legacyOp), immutable);
    const stored = (await service.read(actor)).sessions["2026-11-07"]
      .workouts[0];
    assert.equal(stored.optional, true);
    assert.equal(stored.cross.minutes, 50);
    assert.equal(stored.sourcePlanId, CROSS_PLAN_ID);
    const downgrade = structuredClone(d.sessions);
    downgrade["2026-11-07"].workouts[0].optional = false;
    await assert.rejects(
      service.save(actor, "/days", op(downgrade)),
      (e) => e.status === 422,
    );
    await assert.rejects(
      service.save(
        actor,
        "/days",
        op({
          "2026-11-07": { workouts: [] },
          "2026-11-08": { workouts: [stored] },
        }),
      ),
      (e) => e.code === "WORKOUT_STARTED",
    );
    const bad = structuredClone(d.sessions);
    bad["2026-11-07"].workouts[0].cross.minutes = 0;
    await assert.rejects(
      service.save(actor, "/days", op(bad)),
      (e) => e.status === 422,
    );
    assert.equal(
      (await service.read(actor)).sessions["2026-11-07"].workouts[0].cross
        .minutes,
      50,
    );
  } finally {
    await db.close();
  }
});
