import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getCurrentBranch, getRepoRoot } from "./git.js";

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
