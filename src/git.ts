import { execFileSync } from "node:child_process";

// Wrappers finos sobre el binario git. Todo pasa por execFileSync con
// array de argumentos — NUNCA execSync con string interpolado: un nombre
// de rama git puede contener `$(...)` o backticks (son refs válidas) y
// con shell sería inyección de comandos.

/** Error tipado para fallos de git; permite a la capa CLI distinguir
 * "no estás en un repo" de errores internos y dar el consejo correcto. */
export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

function runGit(args: string[]): string {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stderr =
      typeof (error as { stderr?: unknown }).stderr === "string"
        ? ((error as { stderr: string }).stderr ?? "").trim()
        : "";
    throw new GitError(
      `Fallo al ejecutar "git ${args.join(" ")}"${stderr ? `: ${stderr}` : ""}`,
    );
  }
}

/** Devuelve true si el comando git termina con exit code 0 (sin capturar
 * salida). Para comprobaciones booleanas tipo show-ref/rev-parse. */
function gitSucceeds(args: string[]): boolean {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function getRepoRoot(): string {
  return runGit(["rev-parse", "--show-toplevel"]);
}

/**
 * Directorio .git COMPARTIDO del repositorio, en ruta absoluta.
 *
 * No se construye `<repoRoot>/.git` a mano: en worktrees y submódulos
 * `.git` es un FICHERO puntero, no un directorio. `--git-common-dir`
 * devuelve el almacén real y común a todos los worktrees, que es lo
 * coherente para un contexto por-rama (cada worktree tiene su propia
 * rama activa, pero el almacén de contextos es uno solo).
 * `--path-format=absolute` requiere git >= 2.31 (marzo 2021).
 */
export function getGitCommonDir(): string {
  return runGit(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
}

/**
 * Rama activa, o `null` si HEAD está desacoplado (checkout de un commit
 * suelto, mitad de un rebase...): en ese estado `git branch
 * --show-current` devuelve cadena vacía con exit 0. Lanza GitError si no
 * estamos en un repositorio git.
 */
export function getCurrentBranch(): string | null {
  const branch = runGit(["branch", "--show-current"]);
  return branch.length > 0 ? branch : null;
}

/** Devuelve true si el repositorio tiene al menos un commit (HEAD
 * resoluble). Un repo recién creado con `git init` devuelve false. */
export function hasCommits(): boolean {
  return gitSucceeds(["rev-parse", "--verify", "--quiet", "HEAD"]);
}

const DEFAULT_BRANCH_CANDIDATES = ["main", "master"];

export function getDefaultBranch(): string | null {
  for (const candidate of DEFAULT_BRANCH_CANDIDATES) {
    if (
      gitSucceeds([
        "show-ref",
        "--verify",
        "--quiet",
        `refs/heads/${candidate}`,
      ])
    ) {
      return candidate;
    }
  }
  return null;
}

export function getMergeBase(branchA: string, branchB: string): string | null {
  try {
    return execFileSync("git", ["merge-base", branchA, branchB], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Últimos commits en formato --oneline. En un repo sin commits todavía
 * (`git log` falla sobre HEAD unborn) devuelve `[]` en vez de lanzar;
 * cualquier otro fallo de git se relanza.
 */
export function getRecentCommits(limit = 10): string[] {
  try {
    const output = runGit(["log", "--oneline", "-n", String(limit)]);
    return output.length > 0 ? output.split("\n") : [];
  } catch (error) {
    if (!hasCommits()) {
      return [];
    }
    throw error;
  }
}

export function getDiffStat(fromRef: string, toRef = "HEAD"): string {
  return runGit(["diff", "--stat", fromRef, toRef]);
}

export function getCommitCountSince(fromRef: string, toRef = "HEAD"): number {
  const output = runGit(["rev-list", "--count", `${fromRef}..${toRef}`]);
  return Number.parseInt(output, 10);
}
