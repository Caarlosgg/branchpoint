import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as git from "./git.js";
import { getContextPath, readContext, saveContext } from "./storage.js";

describe("storage", () => {
  let fakeRepoRoot: string;

  beforeEach(() => {
    fakeRepoRoot = mkdtempSync(join(tmpdir(), "branchpoint-test-"));
    vi.spyOn(git, "getRepoRoot").mockReturnValue(fakeRepoRoot);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(fakeRepoRoot, { recursive: true, force: true });
  });

  it("getContextPath construye la ruta para una rama simple", () => {
    expect(getContextPath("main")).toBe(
      join(fakeRepoRoot, ".git", "branchpoint", "main.md"),
    );
  });

  it("getContextPath respeta subcarpetas para ramas con '/'", () => {
    expect(getContextPath("feature/x")).toBe(
      join(fakeRepoRoot, ".git", "branchpoint", "feature", "x.md"),
    );
  });

  it("saveContext + readContext devuelve el mismo contenido", () => {
    saveContext("main", "contenido de prueba");
    expect(readContext("main")).toBe("contenido de prueba");
  });

  it("readContext devuelve null si no hay contexto guardado", () => {
    expect(readContext("main")).toBeNull();
  });

  it("aisla el contexto entre ramas distintas", () => {
    saveContext("main", "contexto de main");
    saveContext("feature/x", "contexto de feature/x");

    expect(readContext("main")).toBe("contexto de main");
    expect(readContext("feature/x")).toBe("contexto de feature/x");
  });
});
