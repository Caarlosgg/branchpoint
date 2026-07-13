import { execFileSync } from "node:child_process";

/**
 * Thin wrappers around the `git` binary. This is the ONLY module allowed
 * to shell out to git; everything else in the codebase goes through these
 * functions so that error handling and argument safety live in one place.
 *
 * Every call uses execFileSync with an argument ARRAY, never execSync with
 * an interpolated string: a git ref name can legally contain `$(...)` or
 * backticks, so building a shell command string would be a command
 * injection vector.
 */

/**
 * Typed error for git failures. Lets the CLI layer distinguish "you're not
 * inside a git repository" from other internal errors and print the right
 * advice for each (see `GitError` handling in cli.ts).
 */
export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

/**
 * Runs a git subcommand and returns its trimmed stdout.
 * @throws {GitError} if the process exits non-zero, including its stderr
 *   (when captured) in the message.
 */
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
      `Failed to run "git ${args.join(" ")}"${stderr ? `: ${stderr}` : ""}`,
    );
  }
}

/**
 * Runs a git subcommand for its exit code only, discarding all output.
 * Used for boolean checks like `show-ref` / `rev-parse --verify`.
 */
function gitSucceeds(args: string[]): boolean {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Absolute path to the root of the working tree.
 * @throws {GitError} if not inside a git repository.
 */
export function getRepoRoot(): string {
  return runGit(["rev-parse", "--show-toplevel"]);
}

/**
 * Absolute path to the repository's SHARED `.git` directory.
 *
 * This is deliberately NOT `<repoRoot>/.git` built by string concatenation:
 * in a git worktree or submodule, `.git` is a POINTER FILE, not a
 * directory. `--git-common-dir` resolves to the one real store shared by
 * every worktree, which is the correct place for per-branch context (each
 * worktree has its own active branch, but the context store should be one
 * shared collection so context follows the branch, not the worktree).
 *
 * `--path-format=absolute` requires git >= 2.31 (March 2021), already
 * covered by the project's baseline.
 *
 * @throws {GitError} if not inside a git repository.
 */
export function getGitCommonDir(): string {
  return runGit(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
}

/**
 * Currently checked-out branch name, or `null` if HEAD is detached
 * (checkout of a bare commit, mid-rebase, etc.).
 *
 * In that state `git branch --show-current` exits 0 with empty output, so
 * the empty-string case is translated to `null` here rather than leaking
 * as a falsy-but-truthy string to callers.
 *
 * @throws {GitError} if not inside a git repository.
 */
export function getCurrentBranch(): string | null {
  const branch = runGit(["branch", "--show-current"]);
  return branch.length > 0 ? branch : null;
}

/**
 * Whether the repository has at least one commit (HEAD resolves).
 * `false` right after `git init`, before the first commit exists.
 */
export function hasCommits(): boolean {
  return gitSucceeds(["rev-parse", "--verify", "--quiet", "HEAD"]);
}

const DEFAULT_BRANCH_CANDIDATES = ["main", "master"];

/**
 * Best-effort guess at the repository's main branch, checking local refs
 * for `main` then `master`. Returns `null` if neither exists locally —
 * callers must treat that as "no divergence info available", not an error.
 */
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

/**
 * Common ancestor commit of two branches, or `null` if they share no
 * history (e.g. one of them doesn't exist, or they're unrelated roots).
 */
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
 * Most recent commits in `--oneline` format, newest first.
 *
 * On a repository with no commits yet (`git log` fails against an unborn
 * HEAD), returns `[]` instead of throwing — that's a normal, expected
 * state for a fresh `git init`, not an error. Any other git failure is
 * re-thrown as-is.
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

/** `git diff --stat` output between two refs, as raw text. */
export function getDiffStat(fromRef: string, toRef = "HEAD"): string {
  return runGit(["diff", "--stat", fromRef, toRef]);
}

/** Number of commits reachable from `toRef` but not from `fromRef`. */
export function getCommitCountSince(fromRef: string, toRef = "HEAD"): number {
  const output = runGit(["rev-list", "--count", `${fromRef}..${toRef}`]);
  return Number.parseInt(output, 10);
}
