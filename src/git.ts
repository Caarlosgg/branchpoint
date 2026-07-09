import { execSync } from "node:child_process";

function runGit(args: string, cwd?: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    throw new Error(
      `Fallo al ejecutar "git ${args}". ¿Estás dentro de un repositorio git? Detalle: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function getRepoRoot(): string {
  return runGit("rev-parse --show-toplevel");
}

export function getCurrentBranch(): string {
  const branch = runGit("branch --show-current");
  if (!branch) {
    throw new Error(
      "No se pudo determinar la rama activa (¿estás en un estado de HEAD detached?).",
    );
  }
  return branch;
}

const DEFAULT_BRANCH_CANDIDATES = ["main", "master"];

export function getDefaultBranch(): string | null {
  for (const candidate of DEFAULT_BRANCH_CANDIDATES) {
    try {
      execSync(`git show-ref --verify --quiet refs/heads/${candidate}`, {
        stdio: "ignore",
      });
      return candidate;
    } catch {
      // Esta rama candidata no existe localmente; se prueba la siguiente.
    }
  }
  return null;
}

export function getMergeBase(branchA: string, branchB: string): string | null {
  try {
    return execSync(`git merge-base ${branchA} ${branchB}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

export function getRecentCommits(limit = 10): string[] {
  const output = runGit(`log --oneline -n ${limit}`);
  return output.length > 0 ? output.split("\n") : [];
}

export function getDiffStat(fromRef: string, toRef = "HEAD"): string {
  return runGit(`diff --stat ${fromRef} ${toRef}`);
}

export function getCommitCountSince(fromRef: string, toRef = "HEAD"): number {
  const output = runGit(`rev-list --count ${fromRef}..${toRef}`);
  return Number.parseInt(output, 10);
}
