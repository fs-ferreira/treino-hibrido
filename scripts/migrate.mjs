import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
export async function migrate(pool) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    await c.query("LOCK TABLE schema_migrations IN EXCLUSIVE MODE");
    for (const name of (
      await readdir(new URL("../db/migrations/", import.meta.url))
    )
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        (
          await c.query("SELECT name FROM schema_migrations WHERE name=$1", [
            name,
          ])
        ).rows.length
      )
        continue;
      await c.query(
        await readFile(
          new URL("../db/migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
      await c.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
    }
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}
if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href
) {
  if (!process.env.DATABASE_URL_UNPOOLED) {
    console.error("Defina DATABASE_URL_UNPOOLED no ambiente seguro.");
    process.exit(1);
  }
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED,
  });
  try {
    await migrate(pool);
    console.log("Migrações aplicadas.");
  } catch {
    console.error(
      "Falha na migração. Confira conexão e permissões no ambiente seguro.",
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
