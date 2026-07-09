import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getRepoRoot } from "./git.js";

export function getContextPath(branch: string): string {
  const repoRoot = getRepoRoot();
  return join(repoRoot, ".git", "branchpoint", `${branch}.md`);
}

export function saveContext(branch: string, content: string): void {
  const path = getContextPath(branch);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

export function readContext(branch: string): string | null {
  const path = getContextPath(branch);
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, "utf8");
}
