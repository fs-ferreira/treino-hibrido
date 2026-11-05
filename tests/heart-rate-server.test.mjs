import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../scripts/migrate.mjs";
import { createDiaryService } from "../server/service.js";
import { defaults, materializeDay, VERSION } from "../lib/core.js";
import { getRunPlan } from "../lib/progression.js";

test("API: FC persiste configurações e metas, preserva omissões antigas e recibos imutáveis", async () => {
  const db = new PGlite();
  const query = async (sql, params) =>
    params ? db.query(sql, params) : (await db.exec(sql)).at(-1);
  const pool = { query, connect: async () => ({ query, release() {} }) };
  try {
    await migrate(pool);
    await db.query(
      'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$1,$2,true)',
      ["hr", "hr@example.test"],
    );
    await db.query(
      'INSERT INTO "session"(id,token,"expiresAt","userId") VALUES($1,$1,now()+interval \'1 day\',$2)',
      ["hr-session", "hr"],
    );
    const actor = { userId: "hr", sessionId: "hr-session" };
    const service = createDiaryService({
      pool,
      config: {
        origin: "http://localhost:4173",
        emails: new Set(["hr@example.test"]),
      },
    });
    const generation = (await service.me(actor)).generation;
    const operation = (value) => ({
      generation,
      operationId: randomUUID(),
      value,
    });
    const data = defaults(),
      date = "2026-11-03";
    data.settings.heartRate = { birthMonth: "1996-11", sex: "male" };
    const setProfile = operation(data.settings);
    const receipt = await service.save(actor, "/settings", setProfile);
    assert.equal((await service.read(actor)).version, VERSION);
    assert.deepEqual(
      (await service.read(actor)).settings.heartRate,
      data.settings.heartRate,
    );
    assert.deepEqual(
      await service.save(actor, "/settings", setProfile),
      receipt,
    );
    const legacySettings = structuredClone(data.settings);
    delete legacySettings.heartRate;
    legacySettings.longMinutes = 75;
    const oldOperation = operation(legacySettings);
    const oldPayload = JSON.stringify(oldOperation);
    await service.save(actor, "/settings", oldOperation);
    assert.equal(JSON.stringify(oldOperation), oldPayload);
    assert.deepEqual(
      (await service.read(actor)).settings.heartRate,
      data.settings.heartRate,
    );
    assert.equal((await service.read(actor)).settings.longMinutes, 75);
    const item = materializeDay(data, date).workouts[0];
    const snapshot = getRunPlan(
      "interval",
      data.settings,
      data.sessions,
      date,
      item.id,
    ).snapshot;
    item.run = { minutes: 40, km: 6, rpe: 8, notes: "", plan: snapshot };
    await service.save(actor, "/days", operation(data.sessions));
    const oldDay = structuredClone(data.sessions);
    delete oldDay[date].workouts[0].run.plan.heartRate;
    oldDay[date].workouts[0].run.notes = "pending v5";
    const oldDayOperation = operation(oldDay),
      dayPayload = JSON.stringify(oldDayOperation);
    const oldReceipt = await service.save(actor, "/days", oldDayOperation);
    assert.deepEqual(
      await service.save(actor, "/days", oldDayOperation),
      oldReceipt,
    );
    assert.equal(JSON.stringify(oldDayOperation), dayPayload);
    const stored = (await service.read(actor)).sessions[date].workouts[0].run;
    assert.deepEqual(stored.plan.heartRate, snapshot.heartRate);
    assert.equal(stored.notes, "pending v5");
    const invalid = structuredClone(data.settings);
    invalid.heartRate.birthMonth = "1996-13";
    await assert.rejects(
      service.save(actor, "/settings", operation(invalid)),
      (e) => e.status === 422,
    );
    const badDay = structuredClone(data.sessions);
    badDay[date].workouts[0].run.plan.heartRate.targets[1].minBpm++;
    await assert.rejects(
      service.save(actor, "/days", operation(badDay)),
      (e) => e.status === 422,
    );
    const reset = {
      ...data.settings,
      heartRate: { birthMonth: null, sex: null },
    };
    await service.save(actor, "/settings", operation(reset));
    assert.deepEqual(
      (await service.read(actor)).settings.heartRate,
      reset.heartRate,
    );
    assert.deepEqual(
      (await service.read(actor)).sessions[date].workouts[0].run.plan.heartRate,
      snapshot.heartRate,
    );
  } finally {
    await db.close();
  }
});
