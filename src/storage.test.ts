import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as git from "./git.js";
import {
  decodeBranchFromFs,
  getContextPath,
  readContext,
  sanitizeBranchForFs,
  saveContext,
} from "./storage.js";

describe("storage", () => {
  let fakeRepoRoot: string;
  let branchpointDir: string;

  beforeEach(() => {
    fakeRepoRoot = mkdtempSync(join(tmpdir(), "branchpoint-test-"));
    branchpointDir = join(fakeRepoRoot, ".git", "branchpoint");
    // storage construye rutas desde el git-common-dir (no desde repoRoot):
    // así funciona igual en worktrees y submódulos.
    vi.spyOn(git, "getGitCommonDir").mockReturnValue(
      join(fakeRepoRoot, ".git"),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(fakeRepoRoot, { recursive: true, force: true });
  });

  it("getContextPath construye la ruta para una rama simple", () => {
    expect(getContextPath("main")).toBe(join(branchpointDir, "main.md"));
  });

  it("getContextPath respeta subcarpetas para ramas con '/'", () => {
    expect(getContextPath("feature/x")).toBe(
      join(branchpointDir, "feature", "x.md"),
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

  describe("sanitización de nombres de rama hostiles para Windows", () => {
    it("codifica nombres de dispositivo reservados (CON, NUL, COM1...)", () => {
      expect(sanitizeBranchForFs("CON")).toBe("%43ON");
      expect(sanitizeBranchForFs("nul")).toBe("%6Eul");
      expect(sanitizeBranchForFs("feature/COM1")).toBe("feature/%43OM1");
      // Con "extensión" también está reservado en Windows: CON.algo
      expect(sanitizeBranchForFs("CON.backup")).toBe("%43ON.backup");
    });

    it("codifica segmentos terminados en punto o espacio", () => {
      expect(sanitizeBranchForFs("release.")).toBe("release%2E");
      expect(sanitizeBranchForFs("v1./hotfix")).toBe("v1%2E/hotfix");
    });

    it("codifica caracteres inválidos en Windows y el propio %", () => {
      expect(sanitizeBranchForFs("a:b")).toBe("a%3Ab");
      expect(sanitizeBranchForFs("50%off")).toBe("50%25off");
    });

    it("no toca nombres normales (legibilidad del almacén)", () => {
      expect(sanitizeBranchForFs("feature/login-fix")).toBe(
        "feature/login-fix",
      );
      expect(sanitizeBranchForFs("release-1.2.0")).toBe("release-1.2.0");
    });

    it("decode es la inversa exacta de sanitize (roundtrip)", () => {
      const hostiles = [
        "CON",
        "feature/NUL",
        "release.",
        "a:b|c",
        "50%off",
        "feature/login-fix",
        "ramita con eñes/año-2026",
      ];
      for (const branch of hostiles) {
        expect(decodeBranchFromFs(sanitizeBranchForFs(branch))).toBe(branch);
      }
    });

    it("las ramas hostiles se guardan y se leen con su nombre original", () => {
      saveContext("CON", "contexto de la rama CON");
      saveContext("release.", "contexto de release.");

      expect(readContext("CON")).toBe("contexto de la rama CON");
      expect(readContext("release.")).toBe("contexto de release.");
    });
  });

  describe("contención de rutas (cinturón y tirantes)", () => {
    it("una 'rama' que empieza por / no puede escapar del almacén", () => {
      // getContextPath también recibe argumentos CLI arbitrarios
      // (branchpoint context <lo-que-sea>), no solo refs validadas por git.
      expect(() => getContextPath("/etc/passwd")).toThrow(
        /Invalid branch name/,
      );
    });

    it("los intentos de traversal con .. quedan neutralizados dentro del almacén", () => {
      for (const hostile of ["../../secreto", "a/../../../b"]) {
        const path = getContextPath(hostile);
        expect(path.startsWith(branchpointDir)).toBe(true);
      }
    });
  });
});
