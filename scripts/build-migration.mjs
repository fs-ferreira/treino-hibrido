import { cp, mkdir, rm, writeFile } from "node:fs/promises";
const url = new URL(process.env.APP_URL || "");
if (
  url.protocol !== "https:" ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  url.pathname !== "/"
)
  throw Error("APP_URL deve ser a origem HTTPS pública do app.");
await rm("_site", { recursive: true, force: true });
await mkdir("_site", { recursive: true });
await cp("migration/index.html", "_site/index.html");
await cp("migration/migration.js", "_site/migration.js");
await cp("migration/migration.css", "_site/migration.css");
await cp("lib", "_site/lib", { recursive: true });
await mkdir("_site/assets", { recursive: true });
await cp("assets/brand-mark.svg", "_site/assets/brand-mark.svg", {
  recursive: false,
});
await writeFile(
  "_site/migration-target.json",
  JSON.stringify({ url: url.origin }),
);
