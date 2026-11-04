import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../scripts/migrate.mjs";
import { createDiaryService } from "../server/service.js";
import {
  defaults,
  materializeDay,
  cancelWorkout,
  reactivateWorkout,
} from "../lib/core.js";

test("API preserves cancellation metadata on legacy replay and protects recorded/canceled sessions", async () => {
  const db = new PGlite();
  const query = async (sql, params) =>
    params ? db.query(sql, params) : (await db.exec(sql)).at(-1);
  const pool = { query, connect: async () => ({ query, release() {} }) };
  try {
    await migrate(pool);
    await db.query(
      'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$1,$2,true)',
      ["lifecycle", "lifecycle@example.test"],
    );
    await db.query(
      'INSERT INTO "session"(id,token,"expiresAt","userId") VALUES($1,$1,now()+interval \'1 day\',$2)',
      ["session-lifecycle", "lifecycle"],
    );
    const actor = { userId: "lifecycle", sessionId: "session-lifecycle" };
    const service = createDiaryService({
      pool,
      config: {
        origin: "http://localhost:4173",
        emails: new Set(["lifecycle@example.test"]),
      },
    });
    const generation = (await service.me(actor)).generation;
    const operation = (value) => ({
      generation,
      operationId: randomUUID(),
      value,
    });
    const date = "2026-11-02",
      data = defaults(),
      item = materializeDay(data, date).workouts[0];
    cancelWorkout(data, date, item.id, "2026-11-04T15:30:00.000Z");
    const cancel = operation(data.sessions);
    const receipt = await service.save(actor, "/days", cancel);
    assert.deepEqual(await service.save(actor, "/days", cancel), receipt);
    let stored = (await service.read(actor)).sessions[date].workouts[0];
    assert.equal(stored.canceledAt, item.canceledAt);
    const legacy = structuredClone(data.sessions);
    delete legacy[date].workouts[0].canceledAt;
    delete legacy[date].workouts[0].completedAt;
    await service.save(actor, "/days", operation(legacy));
    assert.equal(
      (await service.read(actor)).sessions[date].workouts[0].canceledAt,
      item.canceledAt,
    );
    await assert.rejects(
      service.save(actor, "/days", operation({ [date]: { workouts: [] } })),
      (e) => e.status === 409,
    );
    const moved = {
      [date]: { workouts: [] },
      "2026-11-05": { workouts: [item] },
    };
    await assert.rejects(
      service.save(actor, "/days", operation(moved)),
      (e) => e.status === 409,
    );
    reactivateWorkout(data, date, item.id);
    await service.save(actor, "/days", operation(data.sessions));
    item.sets["pec-deck"] = [0, 1, 2].map((i) => ({
      kg: i === 0 ? 10 : "",
      reps: "",
      done: false,
    }));
    await service.save(actor, "/days", operation(data.sessions));
    const malicious = structuredClone(data.sessions);
    malicious[date].workouts[0].sets = {};
    malicious[date].workouts[0].canceledAt = "2026-11-04T15:35:00.000Z";
    await assert.rejects(
      service.save(actor, "/days", operation(malicious)),
      (e) => e.status === 409,
    );
    stored = (await service.read(actor)).sessions[date].workouts[0];
    assert.equal(stored.canceledAt, null);
    assert.equal(stored.sets["pec-deck"][0].kg, 10);
  } finally {
    await db.close();
  }
});
