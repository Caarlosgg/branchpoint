import { execSync } from "node:child_process";
import { existsSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getCommitCountSince,
  getCurrentBranch,
  getDefaultBranch,
  getDiffStat,
  getMergeBase,
  getRecentCommits,
  getRepoRoot,
} from "./git.js";

describe("getRepoRoot", () => {
  it("devuelve una ruta existente que contiene una carpeta .git", () => {
    const root = getRepoRoot();
    expect(existsSync(root)).toBe(true);
    expect(statSync(join(root, ".git")).isDirectory()).toBe(true);
  });
});

describe("getCurrentBranch", () => {
  it("devuelve un string no vacío al ejecutarse dentro de este repo", () => {
    const branch = getCurrentBranch();
    expect(typeof branch).toBe("string");
    expect(branch.length).toBeGreaterThan(0);
  });
});

describe("getDefaultBranch", () => {
  it("detecta 'master' como rama principal de este repo", () => {
    expect(getDefaultBranch()).toBe("master");
  });
});

describe("getRecentCommits", () => {
  it("devuelve como máximo 'limit' líneas no vacías", () => {
    const commits = getRecentCommits(5);
    expect(commits.length).toBeGreaterThan(0);
    expect(commits.length).toBeLessThanOrEqual(5);
    for (const line of commits) {
      expect(line.length).toBeGreaterThan(0);
    }
  });
});

describe("divergencia de ramas (getMergeBase, getCommitCountSince, getDiffStat)", () => {
  const testBranch = "test/git-phase4";
  const scratchFile = "phase4-scratch.tmp";
  let repoRoot: string;
  let originalBranch: string;

  beforeAll(() => {
    repoRoot = getRepoRoot();
    originalBranch = getCurrentBranch();
    execSync(`git checkout -b ${testBranch}`, { cwd: repoRoot, stdio: "ignore" });
    writeFileSync(join(repoRoot, scratchFile), "contenido de prueba fase 4\n");
    execSync(`git add ${scratchFile}`, { cwd: repoRoot, stdio: "ignore" });
    execSync(`git commit -m "test: commit trivial para fase 4"`, {
      cwd: repoRoot,
      stdio: "ignore",
    });
  });

  afterAll(() => {
    execSync(`git checkout ${originalBranch}`, { cwd: repoRoot, stdio: "ignore" });
    execSync(`git branch -D ${testBranch}`, { cwd: repoRoot, stdio: "ignore" });
    rmSync(join(repoRoot, scratchFile), { force: true });
  });

  it("getMergeBase devuelve el hash de commit común con master", () => {
    const base = getMergeBase("master", testBranch);
    expect(base).toMatch(/^[0-9a-f]{40}$/);
  });

  it("getCommitCountSince cuenta el commit trivial creado en la rama de prueba", () => {
    const base = getMergeBase("master", testBranch) as string;
    expect(getCommitCountSince(base, testBranch)).toBe(1);
  });

  it("getDiffStat refleja el archivo de prueba modificado", () => {
    const base = getMergeBase("master", testBranch) as string;
    const stat = getDiffStat(base, testBranch);
    expect(stat).toContain(scratchFile);
  });

  it("getMergeBase devuelve null para ramas sin historia común", () => {
    expect(getMergeBase("master", "refs/does-not-exist")).toBeNull();
  });
});
