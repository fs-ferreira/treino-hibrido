import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
export async function build(target = "dist") {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const entry of [
    "index.html",
    "app.js",
    "bootstrap.js",
    "styles.css",
    "assets",
    "lib",
  ])
    await cp(entry, `${target}/${entry}`, { recursive: true });
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  await build();
