import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  getCommitCountSince,
  getCurrentBranch,
  getDefaultBranch,
  getDiffStat,
  getMergeBase,
  getRecentCommits,
  hasCommits,
} from "./git.js";
import {
  decodeBranchFromFs,
  getBranchpointDir,
  getContextPath,
  readContext,
} from "./storage.js";

/**
 * Data layer shared by every presentation surface (MCP tools, CLI,
 * interactive mode): pure functions that gather information from git.ts
 * and storage.ts and return plain typed objects (or, for the MCP report,
 * markdown text). Nothing in this file prints anything — presentation
 * lives in cli.ts, interactive.ts and server.ts, which all consume these
 * functions instead of duplicating the underlying logic.
 */

export interface StatusData {
  /** Active branch, or null if HEAD is detached. */
  branch: string | null;
  hasContext: boolean;
  /** ISO timestamp of the last context update, or null if none saved. */
  updatedAt: string | null;
  defaultBranch: string | null;
  /** False right after `git init`, before the first commit exists. */
  hasCommits: boolean;
  /** Null if there's no default branch, we're already on it, or the
   * branches share no history. */
  divergence: { baseBranch: string; commitCount: number } | null;
}

export interface BranchEntry {
  branch: string;
  /** ISO timestamp of the last context update. */
  updatedAt: string;
  /** First few words of the summary, collapsed to a single line. */
  preview: string;
}

export interface ContextData {
  /** Branch queried, or null when the active branch was requested and
   * HEAD is detached. */
  branch: string | null;
  content: string | null;
  updatedAt: string | null;
}

const PREVIEW_MAX_LENGTH = 60;

function makePreview(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= PREVIEW_MAX_LENGTH) {
    return normalized;
  }
  const cut = normalized.slice(0, PREVIEW_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Snapshot of the active branch's context state, used by `branchpoint
 * status` and the interactive menu header. */
export function getStatusData(): StatusData {
  const branch = getCurrentBranch();
  const repoHasCommits = hasCommits();

  if (branch === null) {
    return {
      branch: null,
      hasContext: false,
      updatedAt: null,
      defaultBranch: getDefaultBranch(),
      hasCommits: repoHasCommits,
      divergence: null,
    };
  }

  const contextPath = getContextPath(branch);
  const hasContext = existsSync(contextPath);
  const updatedAt = hasContext
    ? statSync(contextPath).mtime.toISOString()
    : null;

  const defaultBranch = getDefaultBranch();
  let divergence: StatusData["divergence"] = null;
  if (defaultBranch && defaultBranch !== branch) {
    const mergeBase = getMergeBase(defaultBranch, branch);
    if (mergeBase) {
      divergence = {
        baseBranch: defaultBranch,
        commitCount: getCommitCountSince(mergeBase),
      };
    }
  }

  return {
    branch,
    hasContext,
    updatedAt,
    defaultBranch,
    hasCommits: repoHasCommits,
    divergence,
  };
}

/** All saved contexts across every branch, newest first. */
export function getBranchList(): BranchEntry[] {
  const dir = getBranchpointDir();
  if (!existsSync(dir)) {
    return [];
  }

  const entries: BranchEntry[] = [];
  for (const dirent of readdirSync(dir, {
    withFileTypes: true,
    recursive: true,
  })) {
    if (!dirent.isFile() || !dirent.name.endsWith(".md")) {
      continue;
    }
    const fullPath = join(dirent.parentPath, dirent.name);
    // The path relative to the store, minus ".md", is the SANITIZED
    // branch name (see storage.ts): subfolders reconstruct "/" in branch
    // names, and decoding undoes the Windows-hostile-character escaping.
    const encoded = relative(dir, fullPath)
      .slice(0, -".md".length)
      .split(sep)
      .join("/");
    entries.push({
      branch: decodeBranchFromFs(encoded),
      updatedAt: statSync(fullPath).mtime.toISOString(),
      preview: makePreview(readFileSync(fullPath, "utf8")),
    });
  }

  return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Full saved context for a branch (defaults to the active one). */
export function getContextData(branch?: string): ContextData {
  const resolvedBranch = branch ?? getCurrentBranch();
  if (resolvedBranch === null) {
    return { branch: null, content: null, updatedAt: null };
  }
  const contextPath = getContextPath(resolvedBranch);
  if (!existsSync(contextPath)) {
    return { branch: resolvedBranch, content: null, updatedAt: null };
  }
  return {
    branch: resolvedBranch,
    content: readFileSync(contextPath, "utf8"),
    updatedAt: statSync(contextPath).mtime.toISOString(),
  };
}

/**
 * Combined markdown report returned by the `get_branch_context` MCP tool:
 * saved summary + divergence from the default branch (if applicable) +
 * recent commits. Lives here (not in server.ts) so it's testable without
 * spinning up an MCP server. Degraded states (detached HEAD, repository
 * with no commits) return explanatory text, never throw.
 */
export function getBranchContextReport(): string {
  const branch = getCurrentBranch();
  if (branch === null) {
    return "HEAD desacoplado (detached): no hay rama activa, así que no hay contexto de rama que leer. Haz checkout de una rama (`git checkout <rama>`) y vuelve a intentarlo.";
  }

  const manualSummary = readContext(branch) ?? "Sin resumen guardado todavía.";
  const sections = [`## Resumen guardado\n${manualSummary}`];

  if (!hasCommits()) {
    sections.push(
      "## Estado del repositorio\nEl repositorio no tiene commits todavía.",
    );
    return sections.join("\n\n");
  }

  const defaultBranch = getDefaultBranch();
  if (defaultBranch && defaultBranch !== branch) {
    const mergeBase = getMergeBase(defaultBranch, branch);
    if (mergeBase) {
      const commitCount = getCommitCountSince(mergeBase);
      const diffStat = getDiffStat(mergeBase);
      sections.push(
        `## Divergencia respecto a "${defaultBranch}"\n${commitCount} commit(s) desde el punto de divergencia.\n\n\`\`\`\n${diffStat}\n\`\`\``,
      );
    }
  }

  const recentCommits = getRecentCommits(10);
  if (recentCommits.length > 0) {
    sections.push(
      `## Últimos commits\n${recentCommits.map((line) => `- ${line}`).join("\n")}`,
    );
  }

  return sections.join("\n\n");
}
