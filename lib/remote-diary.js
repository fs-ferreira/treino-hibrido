import { defaults, validateBackup } from "./core.js";
export class RemoteError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export async function apiRequest(path, { method = "GET", body, signal } = {}) {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(12000)])
      : AbortSignal.timeout(12000),
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  let value;
  try {
    value = await response.json();
  } catch {
    throw new RemoteError(
      response.status || 503,
      "INVALID_RESPONSE",
      "O servidor não respondeu.",
    );
  }
  if (!response.ok)
    throw new RemoteError(
      response.status,
      value.code,
      value.message || "Não foi possível salvar.",
    );
  return value;
}
export function createJournal(indexedDB = globalThis.indexedDB) {
  let database;
  async function db() {
    if (!database)
      database = new Promise((resolve, reject) => {
        if (!indexedDB) {
          reject(Error("STORAGE_UNAVAILABLE"));
          return;
        }
        const open = indexedDB.open("hibrido-cloud-journal", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("accounts");
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(Error("STORAGE_UNAVAILABLE"));
      });
    return database;
  }
  async function run(mode, action) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction("accounts", mode),
        request = action(tx.objectStore("accounts"));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(Error("STORAGE_UNAVAILABLE"));
    });
  }
  return {
    get: (id) => run("readonly", (s) => s.get(id)),
    put: (id, value) => run("readwrite", (s) => s.put(value, id)),
    remove: (id) => run("readwrite", (s) => s.delete(id)),
  };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const copy = (value) => structuredClone(value);
export function createRemoteDiary({
  request: transport = apiRequest,
  journal = createJournal(),
  onStatus = () => {},
  onBlocked = () => {},
  onData = () => {},
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = clearTimeout,
} = {}) {
  const controller = new AbortController();
  const request = (path, options = {}) =>
    transport(path, { ...options, signal: controller.signal });
  let identity,
    generation,
    desired,
    cloud,
    operations = [],
    recovery = null,
    blocked = false,
    diskFailed = false,
    running = null,
    retry,
    delay = 1000,
    serial = Promise.resolve(),
    diskSerial = Promise.resolve(),
    exclusive = false,
    stopped = false,
    changeSequence = 0,
    needsReconcile = false;
  const status = (state, message) =>
    onStatus({ state, message, pending: operations.length });
  function enqueue(work) {
    const next = serial.then(work);
    serial = next.catch(() => {});
    return next;
  }
  function record() {
    return {
      sessionId: identity.sessionId,
      generation,
      operations: copy(operations),
      snapshot: copy(desired),
      blocked,
    };
  }
  async function store(remove = false) {
    const owner = identity.user.id,
      value = remove ? null : record();
    const task = diskSerial.then(() =>
      remove ? journal.remove(owner) : journal.put(owner, value),
    );
    diskSerial = task.catch(() => {});
    try {
      await task;
      diskFailed = false;
    } catch {
      diskFailed = true;
    }
  }
  async function lock(error) {
    blocked = true;
    cancel(retry);
    if (operations.length) await store();
    status("blocked", error.message || "Entre novamente.");
    onBlocked(error);
  }
  async function load() {
    for (let attempt = 0; attempt < 3; attempt++) {
      let params = "",
        data,
        meta;
      try {
        do {
          const page = await request("/diary" + params);
          if (!data) {
            data = { version: 3, settings: page.settings, sessions: {} };
            meta = page;
          }
          Object.assign(data.sessions, page.sessions);
          params = page.nextCursor
            ? "?" +
              new URLSearchParams({
                cursor: page.nextCursor,
                revision: page.revision,
                generation: page.generation,
              })
            : "";
        } while (params);
        return { data: validateBackup(data), generation: meta.generation };
      } catch (error) {
        if (error.code !== "SNAPSHOT_CHANGED" || attempt === 2) throw error;
      }
    }
  }
  async function verify() {
    if (
      identity?.expiresAt &&
      Date.now() >= new Date(identity.expiresAt).getTime()
    )
      throw new RemoteError(
        401,
        "SESSION_EXPIRED",
        "Sua sessão expirou. Entre novamente.",
      );
    const me = await request("/me");
    if (
      !identity ||
      me.user.id !== identity.user.id ||
      me.sessionId !== identity.sessionId
    )
      throw new RemoteError(
        401,
        "SESSION_REVOKED",
        "Sua sessão terminou. Entre novamente.",
      );
    if (generation && me.generation !== generation)
      throw new RemoteError(
        409,
        "GENERATION_CHANGED",
        "O diário foi restaurado ou limpo. Exporte suas alterações pendentes.",
      );
    identity = me;
  }
  function transient(error) {
    return (
      !error.status || error.status >= 500 || [408, 429].includes(error.status)
    );
  }
  async function flush() {
    if (running) return running;
    if (blocked || exclusive || stopped) return { saved: "blocked" };
    cancel(retry);
    running = (async () => {
      while ((operations.length || needsReconcile) && !blocked && !stopped) {
        if (!operations.length) {
          const sequence = changeSequence;
          try {
            const loaded = await load();
            if (stopped || blocked) return { saved: "blocked" };
            if (sequence !== changeSequence || operations.length) continue;
            if (loaded.generation !== generation)
              throw new RemoteError(
                409,
                "GENERATION_CHANGED",
                "O diário foi substituído. Reconecte para continuar.",
              );
            cloud = copy(loaded.data);
            desired = copy(cloud);
            needsReconcile = false;
            await store(true);
            if (sequence !== changeSequence || operations.length) continue;
            onData(copy(cloud));
            continue;
          } catch (error) {
            if (stopped) return { saved: "blocked" };
            if (!transient(error)) {
              await lock(error);
              return { saved: "blocked" };
            }
            status(
              "unavailable",
              "Gravação confirmada · aguardando atualização",
            );
            retry = schedule(() => {
              void resume();
            }, delay);
            delay = Math.min(delay * 2, 30000);
            return { saved: "cloud" };
          }
        }
        const operation = operations[0];
        operation.sending = true;
        status("saving", "Salvando…");
        await store();
        try {
          await request(operation.path, {
            method: "PUT",
            body: {
              operationId: operation.id,
              generation,
              value: operation.value,
            },
          });
          if (blocked || stopped) return { saved: "blocked" };
          operations = operations.filter((op) => op.id !== operation.id);
          if (operation.path === "/settings")
            cloud.settings = copy(operation.value);
          else
            cloud.sessions[operation.path.split("/")[2]] = copy(
              operation.value,
            );
          needsReconcile = true;
          await store();
          delay = 1000;
        } catch (error) {
          if (stopped) return { saved: "blocked" };
          if (!transient(error)) {
            await lock(error);
            return { saved: "blocked" };
          }
          // Keep sending=true: an unknown commit must be retried with the same id/value.
          await store();
          status(
            diskFailed ? "memory" : "local",
            diskFailed
              ? "Alterações apenas nesta aba · exporte um backup"
              : "Salvo neste dispositivo · sincronização pendente",
          );
          retry = schedule(() => {
            void resume();
          }, delay);
          delay = Math.min(delay * 2, 30000);
          return { saved: diskFailed ? "memory" : "local" };
        }
      }
      if (!blocked && !stopped) status("cloud", "Salvo na nuvem");
      return { saved: blocked ? "blocked" : "cloud" };
    })().finally(() => {
      running = null;
    });
    return running;
  }
  async function resume() {
    if (blocked || stopped || exclusive || running) return;
    try {
      await verify();
      return await flush();
    } catch (error) {
      if (stopped) return;
      if (!transient(error)) await lock(error);
      else if (operations.length || needsReconcile) {
        retry = schedule(() => {
          void resume();
        }, delay);
        delay = Math.min(delay * 2, 30000);
      }
    }
  }
  return {
    async open() {
      identity = await request("/me");
      const loaded = await load();
      generation = loaded.generation;
      identity.generation = generation;
      cloud = copy(loaded.data);
      desired = copy(cloud);
      let saved;
      try {
        saved = await journal.get(identity.user.id);
      } catch {
        diskFailed = true;
      }
      if (saved?.operations?.length) {
        if (
          saved.generation === generation &&
          saved.sessionId === identity.sessionId &&
          !saved.blocked
        ) {
          operations = saved.operations;
          for (const op of operations) {
            if (op.path === "/settings") desired.settings = copy(op.value);
            else desired.sessions[op.path.split("/")[2]] = copy(op.value);
          }
          desired = validateBackup(desired);
          void flush();
        } else {
          recovery = saved;
          blocked = true;
          status("recovery", "Há alterações locais para revisar.");
        }
      } else status("cloud", "Salvo na nuvem");
      return {
        identity: copy(identity),
        data: copy(desired),
        recovery: recovery ? copy(recovery) : null,
      };
    },
    async save(data) {
      changeSequence++;
      const snapshot = validateBackup(copy(data));
      await enqueue(async () => {
        if (blocked || stopped || exclusive)
          throw new RemoteError(
            401,
            "EDITING_BLOCKED",
            "Entre novamente ou conclua a operação atual.",
          );
        const changes = [];
        if (!same(snapshot.settings, desired.settings))
          changes.push(["/settings", snapshot.settings]);
        for (const [date, session] of Object.entries(snapshot.sessions))
          if (!same(session, desired.sessions[date]))
            changes.push(["/sessions/" + date, session]);
        for (const [path, value] of changes) {
          operations = operations.filter(
            (op) => op.path !== path || op.sending,
          );
          operations.push({
            id: crypto.randomUUID(),
            path,
            value: copy(value),
            sending: false,
          });
        }
        desired = snapshot;
        if (operations.length) {
          status("saving", "Salvando…");
          await store();
        }
      });
      return flush();
    },
    async check() {
      const sequence = changeSequence;
      if (blocked || stopped || exclusive) return;
      try {
        await verify();
        if (operations.length) return resume();
        if (running) return;
        const loaded = await load();
        if (
          operations.length ||
          exclusive ||
          blocked ||
          stopped ||
          sequence !== changeSequence
        )
          return;
        if (loaded.generation !== generation) {
          await lock(
            new RemoteError(
              409,
              "GENERATION_CHANGED",
              "O diário foi substituído. Recarregue para continuar.",
            ),
          );
          return;
        }
        cloud = copy(loaded.data);
        desired = copy(cloud);
        needsReconcile = false;
        await store(true);
        if (
          sequence !== changeSequence ||
          operations.length ||
          stopped ||
          blocked
        )
          return;
        onData(copy(cloud));
        status("cloud", "Salvo na nuvem");
      } catch (error) {
        if (stopped) return;
        if (!transient(error)) await lock(error);
        else
          status(
            operations.length
              ? diskFailed
                ? "memory"
                : "local"
              : "unavailable",
            operations.length
              ? diskFailed
                ? "Alterações apenas nesta aba · exporte um backup"
                : "Salvo neste dispositivo · sincronização pendente"
              : "Sem conexão · aguardando servidor",
          );
      }
    },
    resume,
    async recover(keep) {
      if (!recovery) return;
      await verify();
      if (keep && recovery.generation !== generation)
        throw Error(
          "O diário foi substituído. Exporte as pendências e importe o backup para recuperá-las.",
        );
      if (keep) {
        operations = recovery.operations;
        for (const op of operations) {
          if (op.path === "/settings") desired.settings = copy(op.value);
          else desired.sessions[op.path.split("/")[2]] = copy(op.value);
        }
        desired = validateBackup(desired);
      } else {
        operations = [];
        desired = copy(cloud);
      }
      recovery = null;
      blocked = false;
      await store(!keep);
      onData(copy(desired));
      return flush();
    },
    recoveryData: () => copy(recovery?.snapshot ?? desired ?? defaults()),
    pending: () => operations.length || Boolean(recovery),
    async replace(value) {
      if (blocked || stopped || exclusive)
        throw Error("Entre novamente antes de continuar.");
      exclusive = true;
      let commitStarted = false;
      try {
        await serial;
        if (running) await running;
        if (operations.length)
          throw new RemoteError(
            422,
            "PENDING_CHANGES",
            "Sincronize ou exporte as alterações pendentes antes de substituir o diário.",
          );
        await verify();
        let result;
        const sendCommit = async (path, options) => {
          commitStarted = true;
          try {
            return await request(path, options);
          } catch (error) {
            if (!transient(error)) throw error;
            return request(path, options);
          }
        };
        const operationId = crypto.randomUUID();
        if (value === null)
          result = await sendCommit("/diary", {
            method: "DELETE",
            body: { operationId, generation },
          });
        else {
          const clean = validateBackup(value),
            bytes = new TextEncoder().encode(JSON.stringify(clean));
          if (bytes.length > 10_000_000)
            throw Error("O backup deve ter até 10 MB.");
          const begin = await request("/imports", {
            method: "POST",
            body: {
              generation,
              totalBytes: bytes.length,
              partCount: Math.ceil(bytes.length / (1024 * 1024)),
            },
          });
          for (
            let offset = 0, index = 0;
            offset < bytes.length;
            offset += 1024 * 1024, index++
          ) {
            let binary = "";
            for (const byte of bytes.subarray(offset, offset + 1024 * 1024))
              binary += String.fromCharCode(byte);
            await request(`/imports/${begin.id}/parts/${index}`, {
              method: "PUT",
              body: { data: btoa(binary) },
            });
          }
          result = await sendCommit(`/imports/${begin.id}/commit`, {
            method: "POST",
            body: { generation, operationId },
          });
        }
        generation = result.generation;
        const loaded = await load();
        generation = loaded.generation;
        cloud = copy(loaded.data);
        desired = copy(cloud);
        await store(true);
        onData(copy(cloud));
        status("cloud", "Salvo na nuvem");
        return copy(cloud);
      } catch (error) {
        if ([401, 403, 409].includes(error.status)) await lock(error);
        else if (commitStarted && transient(error))
          await lock(
            new RemoteError(
              503,
              "OUTCOME_UNKNOWN",
              "Não foi possível confirmar a operação. Reconecte para conferir o diário na nuvem.",
            ),
          );
        throw error;
      } finally {
        exclusive = false;
      }
    },
    async logout({ discard = false } = {}) {
      if (!discard && (operations.length || recovery))
        throw Error(
          "Sincronize ou exporte e descarte as pendências antes de sair.",
        );
      await request("/auth/sign-out", { method: "POST", body: {} });
      stopped = true;
      cancel(retry);
      await store(true);
      cloud = desired = null;
    },
    stop() {
      stopped = true;
      controller.abort();
      cancel(retry);
    },
  };
}
