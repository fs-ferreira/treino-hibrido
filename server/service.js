import { randomUUID, createHash } from "node:crypto";
import { defaults, validateBackup, validDate } from "../lib/core.js";
import { allowedEmail } from "./config.js";
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, code, message) => {
  throw new ApiError(status, code, message);
};
export const PART_SIZE = 1024 * 1024;
const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const fingerprint = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function clean(value) {
  try {
    return validateBackup(value);
  } catch {
    fail(
      422,
      "INVALID_DATA",
      "Dados inválidos. Confira os campos ou o backup.",
    );
  }
}
export function createDiaryService({ pool, config }) {
  async function transaction(actor, work) {
    if (!actor?.userId || !actor?.sessionId)
      fail(401, "AUTH_REQUIRED", "Entre novamente.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const diary = (
        await client.query(
          "SELECT * FROM diaries WHERE user_id = $1 FOR UPDATE",
          [actor.userId],
        )
      ).rows[0];
      const session = (
        await client.query(
          'SELECT s.id, s."expiresAt", u.email, u."emailVerified", u.name FROM "session" s JOIN "user" u ON u.id = s."userId" WHERE s.id = $1 AND s."userId" = $2 AND s."expiresAt" > now()',
          [actor.sessionId, actor.userId],
        )
      ).rows[0];
      if (!diary || !session || diary.active_session_id !== actor.sessionId)
        fail(401, "SESSION_REVOKED", "Sua sessão terminou. Entre novamente.");
      if (!session.emailVerified || !allowedEmail(config, session.email))
        fail(403, "ACCESS_DENIED", "Esta conta não tem acesso.");
      const result = await work(client, diary, session);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  const meta = (d) => ({ generation: d.generation, revision: d.revision });
  async function mutation(actor, path, body, work) {
    if (!uuid(body?.operationId) || typeof body.generation !== "string")
      fail(400, "INVALID_OPERATION", "Operação inválida.");
    return transaction(actor, async (c, d) => {
      const hash = fingerprint({ path, body });
      const previous = (
        await c.query(
          "SELECT * FROM applied_operations WHERE user_id=$1 AND operation_id=$2",
          [actor.userId, body.operationId],
        )
      ).rows[0];
      if (previous) {
        if (previous.fingerprint !== hash)
          fail(
            409,
            "OPERATION_REUSED",
            "Identificador de operação já utilizado.",
          );
        return previous.result;
      }
      if (body.generation !== d.generation)
        fail(
          409,
          "GENERATION_CHANGED",
          "O diário foi restaurado ou limpo. Exporte as alterações pendentes antes de continuar.",
        );
      const extra = await work(c, d);
      const next = (
        await c.query(
          "UPDATE diaries SET revision=revision+1, updated_at=now() WHERE user_id=$1 RETURNING *",
          [actor.userId],
        )
      ).rows[0];
      const result = { ...meta(next), ...extra };
      await c.query(
        "INSERT INTO applied_operations(user_id,operation_id,fingerprint,result) VALUES($1,$2,$3,$4)",
        [actor.userId, body.operationId, hash, JSON.stringify(result)],
      );
      return result;
    });
  }
  async function read(actor, params = new URLSearchParams()) {
    return transaction(actor, async (c, d) => {
      if (
        params.has("revision") &&
        (String(d.revision) !== params.get("revision") ||
          d.generation !== params.get("generation"))
      )
        fail(409, "SNAPSHOT_CHANGED", "Atualize o diário.");
      const cursor = params.get("cursor") || "0001-01-01";
      if (cursor !== "0001-01-01" && !validDate(cursor))
        fail(400, "INVALID_CURSOR", "Página inválida.");
      const rows = (
        await c.query(
          "SELECT date::text, payload FROM workout_sessions WHERE user_id=$1 AND date > $2 ORDER BY date LIMIT 101",
          [actor.userId, cursor],
        )
      ).rows;
      // Keep every response well below Vercel's response limit.
      let bytes = 0;
      const selected = [];
      for (const row of rows.slice(0, 100)) {
        const size = Buffer.byteLength(JSON.stringify(row));
        if (bytes + size > 2 * PART_SIZE && selected.length) break;
        selected.push(row);
        bytes += size;
      }
      return {
        ...meta(d),
        version: 3,
        settings: d.settings ?? defaults().settings,
        sessions: Object.fromEntries(selected.map((r) => [r.date, r.payload])),
        nextCursor:
          selected.length < rows.length ? selected.at(-1)?.date : null,
      };
    });
  }
  const checkSessionSizes = (data) => {
    for (const value of Object.values(data.sessions))
      if (Buffer.byteLength(JSON.stringify(value)) > PART_SIZE)
        fail(413, "SESSION_TOO_LARGE", "Um treino excede o limite de 1 MiB.");
  };
  return {
    me: (actor) =>
      transaction(actor, async (_c, d, s) => ({
        user: { id: actor.userId, name: s.name, email: s.email },
        sessionId: actor.sessionId,
        expiresAt: s.expiresAt,
        ...meta(d),
      })),
    read,
    save: (actor, path, body) =>
      mutation(actor, path, body, async (c) => {
        if (path === "/settings") {
          const settings = clean({
            ...defaults(),
            settings: body.value,
          }).settings;
          await c.query("UPDATE diaries SET settings=$2 WHERE user_id=$1", [
            actor.userId,
            JSON.stringify(settings),
          ]);
        } else {
          const date = path.split("/")[2];
          if (!validDate(date)) fail(400, "INVALID_DATE", "Data inválida.");
          const data = clean({
            ...defaults(),
            sessions: { [date]: body.value },
          });
          checkSessionSizes(data);
          await c.query(
            "INSERT INTO workout_sessions(user_id,date,payload) VALUES($1,$2,$3) ON CONFLICT(user_id,date) DO UPDATE SET payload=EXCLUDED.payload",
            [actor.userId, date, JSON.stringify(data.sessions[date])],
          );
        }
        return {};
      }),
    clear: (actor, body) =>
      mutation(actor, "/clear", body, async (c) => {
        await c.query("DELETE FROM workout_sessions WHERE user_id=$1", [
          actor.userId,
        ]);
        await c.query(
          "UPDATE diaries SET settings=$2,generation=$3 WHERE user_id=$1",
          [actor.userId, JSON.stringify(defaults().settings), randomUUID()],
        );
        await c.query("DELETE FROM diary_imports WHERE user_id=$1", [
          actor.userId,
        ]);
        return {};
      }),
    beginImport: (actor, body) =>
      transaction(actor, async (c, d) => {
        const { totalBytes, partCount } = body ?? {};
        if (
          !Number.isInteger(totalBytes) ||
          totalBytes < 1 ||
          totalBytes > 10_000_000 ||
          partCount !== Math.ceil(totalBytes / PART_SIZE)
        )
          fail(400, "INVALID_IMPORT", "Backup deve ter até 10 MB.");
        if (body.generation !== d.generation)
          fail(
            409,
            "GENERATION_CHANGED",
            "Atualize o diário antes de importar.",
          );
        await c.query("DELETE FROM diary_imports WHERE expires_at < now()");
        if (
          Number(
            (
              await c.query(
                "SELECT count(*) FROM diary_imports WHERE user_id=$1",
                [actor.userId],
              )
            ).rows[0].count,
          ) >= 4
        )
          fail(
            429,
            "IMPORT_LIMIT",
            "Há importações pendentes. Tente mais tarde.",
          );
        const id = randomUUID();
        await c.query(
          "INSERT INTO diary_imports(id,user_id,generation,total_bytes,part_count) VALUES($1,$2,$3,$4,$5)",
          [id, actor.userId, d.generation, totalBytes, partCount],
        );
        return { id };
      }),
    uploadPart: (actor, id, index, body) =>
      transaction(actor, async (c, d) => {
        if (!uuid(id) || !Number.isInteger(index))
          fail(400, "INVALID_PART", "Parte inválida.");
        const entry = (
          await c.query(
            "SELECT * FROM diary_imports WHERE id=$1 AND user_id=$2 AND expires_at > now()",
            [id, actor.userId],
          )
        ).rows[0];
        if (!entry)
          fail(
            404,
            "IMPORT_NOT_FOUND",
            "Importação não encontrada ou expirada.",
          );
        if (entry.generation !== d.generation)
          fail(409, "GENERATION_CHANGED", "O diário foi substituído.");
        if (
          index < 0 ||
          index >= entry.part_count ||
          typeof body?.data !== "string"
        )
          fail(400, "INVALID_PART", "Parte inválida.");
        const buffer = Buffer.from(body.data, "base64");
        const expected =
          index === entry.part_count - 1
            ? entry.total_bytes - index * PART_SIZE
            : PART_SIZE;
        if (
          buffer.length !== expected ||
          buffer.toString("base64") !== body.data
        )
          fail(400, "INVALID_PART", "Tamanho de parte inválido.");
        await c.query(
          "INSERT INTO import_parts(import_id,part_index,data) VALUES($1,$2,$3) ON CONFLICT(import_id,part_index) DO UPDATE SET data=EXCLUDED.data",
          [id, index, body.data],
        );
        return { saved: true };
      }),
    commitImport: (actor, id, body) =>
      mutation(actor, `/imports/${id}/commit`, body, async (c, d) => {
        if (!uuid(id)) fail(400, "INVALID_IMPORT", "Importação inválida.");
        const entry = (
          await c.query(
            "SELECT * FROM diary_imports WHERE id=$1 AND user_id=$2 AND expires_at > now()",
            [id, actor.userId],
          )
        ).rows[0];
        if (!entry)
          fail(
            404,
            "IMPORT_NOT_FOUND",
            "Importação não encontrada ou expirada.",
          );
        if (entry.generation !== d.generation)
          fail(409, "GENERATION_CHANGED", "O diário foi substituído.");
        const parts = (
          await c.query(
            "SELECT part_index,data FROM import_parts WHERE import_id=$1 ORDER BY part_index",
            [id],
          )
        ).rows;
        if (parts.length !== entry.part_count)
          fail(
            422,
            "IMPORT_INCOMPLETE",
            "Envio incompleto. O diário anterior foi preservado.",
          );
        let value;
        try {
          value = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              Buffer.concat(parts.map((p) => Buffer.from(p.data, "base64"))),
            ),
          );
        } catch {
          fail(422, "INVALID_JSON", "Arquivo JSON inválido.");
        }
        const data = clean(value);
        checkSessionSizes(data);
        await c.query("DELETE FROM workout_sessions WHERE user_id=$1", [
          actor.userId,
        ]);
        await c.query(
          "INSERT INTO workout_sessions(user_id,date,payload) SELECT $1, entry.key::date, entry.value FROM jsonb_each($2::jsonb) AS entry",
          [actor.userId, JSON.stringify(data.sessions)],
        );
        await c.query(
          "UPDATE diaries SET settings=$2,generation=$3 WHERE user_id=$1",
          [actor.userId, JSON.stringify(data.settings), randomUUID()],
        );
        await c.query("DELETE FROM diary_imports WHERE user_id=$1", [
          actor.userId,
        ]);
        return {};
      }),
  };
}
