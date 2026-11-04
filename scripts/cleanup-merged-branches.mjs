import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function cleanupMergedBranches({
  cwd = process.cwd(),
  dryRun = false,
} = {}) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const origin = git("config", "--get", "remote.origin.url");
  if (
    !/^(?:https:\/\/github\.com\/|git@github\.com:)fs-ferreira\/treino-hibrido(?:\.git)?$/.test(
      origin,
    )
  )
    throw new Error(
      "Limpeza restrita ao repositório pessoal fs-ferreira/treino-hibrido.",
    );
  if (git("branch", "--show-current") !== "main") return [];
  const occupied = new Set(
    git("worktree", "list", "--porcelain")
      .split("\n")
      .filter((line) => line.startsWith("branch refs/heads/"))
      .map((line) => line.slice("branch refs/heads/".length)),
  );
  const candidates = git(
    "for-each-ref",
    "--merged=refs/heads/main",
    "--format=%(refname:short)",
    "refs/heads",
  )
    .split("\n")
    .filter((name) => name && name !== "main" && !occupied.has(name));
  const removed = [];
  for (const name of candidates) {
    if (!dryRun) git("branch", "-d", "--", name);
    removed.push(name);
  }
  return removed;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const dryRun = process.argv.includes("--dry-run");
    for (const name of cleanupMergedBranches({ dryRun }))
      console.log(`${dryRun ? "Integrada" : "Removida"}: ${name}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
