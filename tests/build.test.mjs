import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "../scripts/build.mjs";
test("public build is an allowlist and does not interpolate environment secrets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hibrido-public-"));
  const keys = [
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_SECRET",
    "ALLOWED_GOOGLE_EMAILS",
  ];
  const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    for (const key of keys) process.env[key] = "PRIVATE_BUILD_SENTINEL_" + key;
    await build(directory);
    const roots = await readdir(directory);
    assert.deepEqual(roots.sort(), [
      "app.js",
      "assets",
      "bootstrap.js",
      "index.html",
      "lib",
      "styles.css",
    ]);
    async function check(path) {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const next = join(path, entry.name);
        if (entry.isDirectory()) await check(next);
        else
          assert.ok(
            !(await readFile(next, "utf8")).includes("PRIVATE_BUILD_SENTINEL"),
          );
      }
    }
    await check(directory);
  } finally {
    for (const key of keys)
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    await rm(directory, { recursive: true, force: true });
  }
});

test("build CLI creates its public output on the current OS", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hibrido-cli-build-"));
  try {
    for (const name of ["index.html", "app.js", "bootstrap.js", "styles.css"])
      await writeFile(join(directory, name), "public fixture");
    for (const name of ["assets", "lib"]) await mkdir(join(directory, name));
    await writeFile(join(directory, ".env.local"), "PRIVATE_CLI_SENTINEL");
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL("../scripts/build.mjs", import.meta.url))],
      { cwd: directory, stdio: "pipe" },
    );
    assert.deepEqual((await readdir(join(directory, "dist"))).sort(), [
      "app.js",
      "assets",
      "bootstrap.js",
      "index.html",
      "lib",
      "styles.css",
    ]);
    assert.equal(
      await readFile(join(directory, "dist", "app.js"), "utf8"),
      "public fixture",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
