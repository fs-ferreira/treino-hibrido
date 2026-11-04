import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cleanupMergedBranches } from "../scripts/cleanup-merged-branches.mjs";

test("cleanup removes only integrated, unoccupied branches in this personal repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "hibrido-branches-"));
  const cwd = join(root, "repo"),
    worktree = join(root, "occupied");
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  try {
    execFileSync("git", ["init", "-b", "main", cwd], { stdio: "pipe" });
    git("config", "user.name", "Branch test");
    git("config", "user.email", "test@example.test");
    git(
      "remote",
      "add",
      "origin",
      "https://github.com/fs-ferreira/treino-hibrido.git",
    );
    git("commit", "--allow-empty", "-m", "base");
    git("branch", "integrated");
    git("branch", "occupied");
    git("worktree", "add", worktree, "occupied");
    git("switch", "-c", "pending");
    git("commit", "--allow-empty", "-m", "unmerged");
    assert.deepEqual(cleanupMergedBranches({ cwd }), []);
    git("switch", "main");
    assert.deepEqual(cleanupMergedBranches({ cwd, dryRun: true }), [
      "integrated",
    ]);
    assert.match(git("branch", "--list", "integrated"), /integrated/);
    assert.deepEqual(cleanupMergedBranches({ cwd }), ["integrated"]);
    assert.equal(git("branch", "--list", "integrated"), "");
    for (const name of ["main", "occupied", "pending"])
      assert.match(git("branch", "--list", name), new RegExp(name));
    git(
      "remote",
      "set-url",
      "origin",
      "https://example.test/unapproved/repository.git",
    );
    assert.throws(() => cleanupMergedBranches({ cwd }), /restrita/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
