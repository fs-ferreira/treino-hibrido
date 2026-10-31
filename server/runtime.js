import pg from "pg";
import { readConfig } from "./config.js";
import { createAuth } from "./auth.js";
import { createDiaryService } from "./service.js";
import { createApi, nodeHandler } from "./http.js";
let runtime;
export const handler = nodeHandler(async (request) => {
  if (!runtime) {
    const config = readConfig();
    const pool = new pg.Pool({
      connectionString: config.databaseURL,
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
    pool.on("error", () => {});
    runtime = createApi({
      config,
      auth: createAuth(pool, config),
      service: createDiaryService({ pool, config }),
    });
  }
  return runtime(request);
});
