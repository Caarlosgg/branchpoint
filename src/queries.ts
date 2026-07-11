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

// Capa de datos: funciones puras que recogen información y devuelven
// objetos planos tipados (o markdown, en el caso del informe MCP). Aquí
// no se imprime nada; la presentación vive en cli.ts / interactive.ts /
// server.ts, que consumen estas funciones.

export interface StatusData {
  /** Rama activa, o null si HEAD está desacoplado (detached). */
  branch: string | null;
  hasContext: boolean;
  /** Fecha ISO de última modificación del resumen, o null si no hay. */
  updatedAt: string | null;
  defaultBranch: string | null;
  /** True si el repo tiene al menos un commit (false recién hecho git init). */
  hasCommits: boolean;
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
  /** Rama consultada, o null si se pidió la activa y HEAD está desacoplado. */
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
    // La ruta relativa al almacén, sin ".md", es el nombre de rama
    // SANITIZADO (ver storage.ts): las subcarpetas reconstruyen ramas con
    // "/" y el decode deshace el escape de caracteres hostiles a Windows.
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
 * Informe markdown combinado que devuelve la tool MCP get_branch_context:
 * resumen guardado + divergencia respecto a la rama principal (si aplica)
 * + últimos commits. Vive aquí (y no en server.ts) para ser testeable sin
 * levantar un servidor MCP. Los estados degradados (HEAD desacoplado,
 * repo sin commits) devuelven texto explicativo, nunca lanzan.
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
