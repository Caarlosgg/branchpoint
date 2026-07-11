import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  getCommitCountSince,
  getCurrentBranch,
  getDefaultBranch,
  getDiffStat,
  getGitCommonDir,
  getMergeBase,
  getRecentCommits,
  getRepoRoot,
  hasCommits,
} from "./git.js";

/** Ejecuta git con identidad fija (los runners de CI no tienen user.name). */
function git(args: string[], cwd: string): string {
  return execFileSync(
    "git",
    [
      "-c",
      "user.name=Branchpoint Test",
      "-c",
      "user.email=test@branchpoint.local",
      ...args,
    ],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

describe("getRepoRoot", () => {
  it("devuelve una ruta existente que contiene una carpeta .git", () => {
    const root = getRepoRoot();
    expect(existsSync(root)).toBe(true);
    expect(statSync(join(root, ".git")).isDirectory()).toBe(true);
  });
});

describe("getGitCommonDir", () => {
  it("en el worktree principal apunta a <repoRoot>/.git en absoluto", () => {
    expect(resolve(getGitCommonDir())).toBe(
      resolve(join(getRepoRoot(), ".git")),
    );
  });
});

describe("getCurrentBranch", () => {
  it("devuelve un string no vacío al ejecutarse dentro de este repo", () => {
    const branch = getCurrentBranch();
    expect(branch).not.toBeNull();
    expect((branch as string).length).toBeGreaterThan(0);
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
    const branch = getCurrentBranch();
    if (branch === null) {
      throw new Error(
        "Este test necesita ejecutarse desde una rama, no en detached HEAD",
      );
    }
    originalBranch = branch;
    git(["checkout", "-b", testBranch], repoRoot);
    writeFileSync(join(repoRoot, scratchFile), "contenido de prueba fase 4\n");
    git(["add", scratchFile], repoRoot);
    git(["commit", "-m", "test: commit trivial para fase 4"], repoRoot);
  });

  afterAll(() => {
    git(["checkout", originalBranch], repoRoot);
    git(["branch", "-D", testBranch], repoRoot);
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

// Casos límite auditados en la Fase 9. Cada describe crea su propio repo
// temporal y hace chdir dentro (vitest usa el pool "forks", así que
// process.chdir es seguro y no afecta a otros ficheros de test).
describe("casos límite de estado del repo", () => {
  const originalCwd = process.cwd();
  let tempRoot: string;

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("HEAD desacoplado: getCurrentBranch devuelve null, no lanza ni devuelve vacío", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "branchpoint-detached-"));
    git(["init", "-q", "-b", "main"], tempRoot);
    git(["commit", "-q", "--allow-empty", "-m", "c1"], tempRoot);
    git(["checkout", "-q", "--detach"], tempRoot);
    process.chdir(tempRoot);

    expect(getCurrentBranch()).toBeNull();
  });

  it("repo sin commits (unborn HEAD): la rama existe, hasCommits false, getRecentCommits []", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "branchpoint-unborn-"));
    git(["init", "-q", "-b", "main"], tempRoot);
    process.chdir(tempRoot);

    expect(getCurrentBranch()).toBe("main");
    expect(hasCommits()).toBe(false);
    expect(getRecentCommits()).toEqual([]);
  });

  it("worktree: getGitCommonDir apunta al .git COMPARTIDO del repo principal", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "branchpoint-worktree-"));
    const mainRepo = join(tempRoot, "main-repo");
    const worktree = join(tempRoot, "wt");
    git(["init", "-q", "-b", "main", mainRepo], tempRoot);
    git(["commit", "-q", "--allow-empty", "-m", "c1"], mainRepo);
    git(["worktree", "add", "-q", worktree, "-b", "feature/wt"], mainRepo);
    process.chdir(worktree);

    // En un worktree, <worktree>/.git es un FICHERO puntero; construir la
    // ruta a mano daría un almacén distinto por worktree. El common-dir
    // es el del repo principal, compartido por todos.
    expect(statSync(join(worktree, ".git")).isFile()).toBe(true);
    expect(resolve(getGitCommonDir())).toBe(resolve(join(mainRepo, ".git")));
  });
});
