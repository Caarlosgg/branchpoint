import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  getCommitCountSince,
  getCurrentBranch,
  getDefaultBranch,
  getMergeBase,
  getRepoRoot,
} from "./git.js";
import { getContextPath } from "./storage.js";

// Capa de datos de la CLI: funciones puras que recogen información y
// devuelven objetos planos tipados. Aquí no se imprime nada; la
// presentación (colores, cajas, tablas, --json) vive en cli.ts e
// interactive.ts, que consumen estos objetos.

export interface StatusData {
  branch: string;
  hasContext: boolean;
  /** Fecha ISO de última modificación del resumen, o null si no hay. */
  updatedAt: string | null;
  defaultBranch: string | null;
  /** Null si no hay rama principal, estamos en ella o no hay historia común. */
  divergence: { baseBranch: string; commitCount: number } | null;
}

export interface BranchEntry {
  branch: string;
  /** Fecha ISO de última modificación del resumen. */
  updatedAt: string;
  /** Primeras palabras del resumen, en una sola línea. */
  preview: string;
}

export interface ContextData {
  branch: string;
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

function getBranchpointDir(): string {
  return join(getRepoRoot(), ".git", "branchpoint");
}

export function getStatusData(): StatusData {
  const branch = getCurrentBranch();
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

  return { branch, hasContext, updatedAt, defaultBranch, divergence };
}

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
    // La ruta relativa al directorio base, sin ".md", es el nombre de la
    // rama: las subcarpetas reconstruyen ramas con "/" (feature/login-fix).
    const branch = relative(dir, fullPath).slice(0, -".md".length).split(sep).join("/");
    entries.push({
      branch,
      updatedAt: statSync(fullPath).mtime.toISOString(),
      preview: makePreview(readFileSync(fullPath, "utf8")),
    });
  }

  return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getContextData(branch?: string): ContextData {
  const resolvedBranch = branch ?? getCurrentBranch();
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
