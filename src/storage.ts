import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { getGitCommonDir } from "./git.js";

/**
 * Persistence layer for per-branch context files, stored under
 * `<git-common-dir>/branchpoint/<branch>.md`.
 *
 * Uses the git common directory (see `getGitCommonDir` in git.ts) rather
 * than a hand-built `<repoRoot>/.git` path, so the store works correctly
 * inside worktrees and submodules, where `.git` is a pointer file rather
 * than a directory. This module owns branch-name-to-filesystem-path
 * translation and nothing else — it doesn't know about git plumbing
 * beyond that one lookup, and it doesn't format or print anything.
 */

/**
 * Deterministic sanitization of branch names into filesystem-safe paths,
 * primarily to survive Windows' reserved names and trailing-character
 * restrictions (git itself is far more permissive than NTFS).
 *
 * Escape scheme (selective, reversible percent-encoding):
 * - "%" is ALWAYS encoded as %25 — it is the escape character itself, so
 *   decoding is unambiguous (no literal "%XX" survives unencoded).
 * - Characters invalid in Windows filenames (< > : " | ? * \) and control
 *   characters are percent-encoded (uppercase hex).
 * - Segments that are Windows reserved device names (CON, PRN, AUX, NUL,
 *   COM1-9, LPT1-9 — reserved even WITH an extension, e.g. "CON.md") have
 *   their first character encoded ("CON" -> "%43ON").
 * - Segments ending in "." or " " (Windows silently strips or rejects
 *   these) have their last character encoded.
 *
 * "/" in the branch name is left untouched: it creates real subfolders
 * (feature/login-fix -> feature/login-fix.md), mirroring how git itself
 * lays out refs/heads/.
 */
const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
// biome-ignore lint/suspicious/noControlCharactersInRegex: escaping control characters is exactly this regex's job
const WINDOWS_INVALID_CHARS = /[%<>:"|?*\\\u0000-\u001F]/g;

function encodeChar(char: string): string {
  return `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;
}

/** Encodes a branch name into a filesystem-safe relative path segment
 * (see module-level doc comment for the exact escape scheme). */
export function sanitizeBranchForFs(branch: string): string {
  return branch
    .split("/")
    .map((segment) => {
      let out = segment.replace(WINDOWS_INVALID_CHARS, encodeChar);
      if (WINDOWS_RESERVED_NAMES.test(out)) {
        out = encodeChar(out[0]) + out.slice(1);
      }
      if (out.endsWith(".") || out.endsWith(" ")) {
        out = out.slice(0, -1) + encodeChar(out[out.length - 1]);
      }
      return out;
    })
    .join("/");
}

/**
 * Exact inverse of `sanitizeBranchForFs`. Safe to apply unconditionally:
 * any "%XX" sequence on disk can only have come from the encoder, since a
 * literal "%" is always encoded as %25.
 */
export function decodeBranchFromFs(encoded: string): string {
  return encoded.replace(/%([0-9A-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

/** Root directory of the context store, shared across all worktrees. */
export function getBranchpointDir(): string {
  return resolve(join(getGitCommonDir(), "branchpoint"));
}

/**
 * Resolves the `.md` file path for a branch's saved context.
 *
 * @throws {Error} if the resolved path would escape the branchpoint
 *   directory. Belt-and-suspenders: git already forbids ".." in ref
 *   names, and sanitizeBranchForFs neutralizes odd separators/suffixes,
 *   but `branch` here can also come from an arbitrary CLI argument
 *   (`branchpoint context <anything>`) that git never validated — e.g. a
 *   value starting with "/" would resolve to an absolute path outside the
 *   store. No input should ever be able to read or write outside it.
 */
export function getContextPath(branch: string): string {
  const dir = getBranchpointDir();
  const path = resolve(dir, `${sanitizeBranchForFs(branch)}.md`);
  if (!path.startsWith(dir + sep)) {
    throw new Error(`Invalid branch name for a context path: "${branch}"`);
  }
  return path;
}

/** Writes (creating parent folders as needed) the context for a branch. */
export function saveContext(branch: string, content: string): void {
  const path = getContextPath(branch);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

/** Reads the saved context for a branch, or `null` if none exists. */
export function readContext(branch: string): string | null {
  const path = getContextPath(branch);
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, "utf8");
}
