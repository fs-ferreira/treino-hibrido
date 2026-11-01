import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const script = fileURLToPath(
  new URL("../scripts/migrate.mjs", import.meta.url),
);
function run(args, connection = "") {
  return spawnSync(process.execPath, args, {
    env: { ...process.env, DATABASE_URL_UNPOOLED: connection },
    encoding: "utf8",
    timeout: 15000,
  });
}
test("CLI executes on the current OS and reports missing configuration instead of silent success", () => {
  const result = run([script]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Defina DATABASE_URL_UNPOOLED/);
  assert.equal(result.stdout, "");
});
test("importing the migration function does not run the CLI", () => {
  const url = new URL("../scripts/migrate.mjs", import.meta.url).href;
  const result = run([
    "--input-type=module",
    "-e",
    `const { migrate } = await import(${JSON.stringify(url)}); console.log(typeof migrate);`,
  ]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "function");
  assert.equal(result.stderr, "");
});
test("connection failures return a nonzero code and never print credentials", () => {
  const marker = "DO_NOT_PRINT_MIGRATION_CREDENTIAL";
  const result = run(
    [script],
    `postgresql://test:${marker}@127.0.0.1:1/test?connect_timeout=1`,
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Aplicando migrações/);
  assert.match(result.stderr, /Falha na migração/);
  assert.ok(!(result.stdout + result.stderr).includes(marker));
});
