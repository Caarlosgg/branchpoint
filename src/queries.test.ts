import { mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as git from "./git.js";
import {
  getBranchContextReport,
  getBranchList,
  getContextData,
  getStatusData,
} from "./queries.js";
import { getContextPath, saveContext } from "./storage.js";

describe("queries", () => {
  let fakeRepoRoot: string;

  beforeEach(() => {
    fakeRepoRoot = mkdtempSync(join(tmpdir(), "branchpoint-test-"));
    vi.spyOn(git, "getGitCommonDir").mockReturnValue(
      join(fakeRepoRoot, ".git"),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(fakeRepoRoot, { recursive: true, force: true });
  });

  describe("getBranchList", () => {
    it("devuelve [] si nunca se ha guardado nada", () => {
      expect(getBranchList()).toEqual([]);
    });

    it("reconstruye nombres de rama con '/' desde las subcarpetas", () => {
      saveContext("master", "contexto de master");
      saveContext("feature/login-fix", "arreglando el login");

      const branches = getBranchList().map((entry) => entry.branch);
      expect(branches).toHaveLength(2);
      expect(branches).toContain("master");
      expect(branches).toContain("feature/login-fix");
    });

    it("muestra los nombres ORIGINALES de ramas sanitizadas en disco", () => {
      saveContext("CON", "rama con nombre reservado en Windows");
      saveContext("release.", "rama terminada en punto");

      const branches = getBranchList().map((entry) => entry.branch);
      expect(branches).toContain("CON");
      expect(branches).toContain("release.");
    });

    it("ordena por fecha de modificación descendente", () => {
      saveContext("vieja", "contexto antiguo");
      saveContext("nueva", "contexto reciente");
      const past = new Date("2026-01-01T00:00:00Z");
      utimesSync(getContextPath("vieja"), past, past);

      expect(getBranchList().map((entry) => entry.branch)).toEqual([
        "nueva",
        "vieja",
      ]);
    });

    it("genera un preview de una sola línea, truncado en palabra completa", () => {
      saveContext(
        "master",
        "Primera línea del resumen\ncon salto de línea y un texto lo bastante largo como para superar el límite del preview",
      );

      const [entry] = getBranchList();
      expect(entry.preview).not.toContain("\n");
      expect(entry.preview.endsWith("…")).toBe(true);
      expect(entry.preview.length).toBeLessThanOrEqual(61);
      // No corta a mitad de palabra: lo anterior al "…" es una palabra entera.
      expect(entry.preview).toMatch(/^Primera línea del resumen con salto/);
    });
  });

  describe("getContextData", () => {
    it("devuelve el contenido completo y la fecha para una rama con contexto", () => {
      saveContext("feature/x", "# Título\n\nDetalle del trabajo");

      const data = getContextData("feature/x");
      expect(data.branch).toBe("feature/x");
      expect(data.content).toBe("# Título\n\nDetalle del trabajo");
      expect(data.updatedAt).not.toBeNull();
    });

    it("devuelve content null (no un error) si la rama no tiene contexto", () => {
      expect(getContextData("sin-contexto")).toEqual({
        branch: "sin-contexto",
        content: null,
        updatedAt: null,
      });
    });

    it("usa la rama activa si no se pasa rama", () => {
      vi.spyOn(git, "getCurrentBranch").mockReturnValue("master");
      saveContext("master", "contexto de la rama activa");

      expect(getContextData().content).toBe("contexto de la rama activa");
    });

    it("HEAD desacoplado sin rama explícita: branch null, sin crash", () => {
      vi.spyOn(git, "getCurrentBranch").mockReturnValue(null);

      expect(getContextData()).toEqual({
        branch: null,
        content: null,
        updatedAt: null,
      });
    });
  });

  describe("getStatusData", () => {
    it("reporta contexto guardado y divergencia respecto a la rama principal", () => {
      vi.spyOn(git, "getCurrentBranch").mockReturnValue("feature/x");
      vi.spyOn(git, "getDefaultBranch").mockReturnValue("master");
      vi.spyOn(git, "getMergeBase").mockReturnValue("abc123");
      vi.spyOn(git, "getCommitCountSince").mockReturnValue(3);
      vi.spyOn(git, "hasCommits").mockReturnValue(true);
      saveContext("feature/x", "trabajo en curso");

      const data = getStatusData();
      expect(data.branch).toBe("feature/x");
      expect(data.hasContext).toBe(true);
      expect(data.updatedAt).not.toBeNull();
      expect(data.hasCommits).toBe(true);
      expect(data.divergence).toEqual({ baseBranch: "master", commitCount: 3 });
    });

    it("sin contexto guardado: hasContext false, sin fecha", () => {
      vi.spyOn(git, "getCurrentBranch").mockReturnValue("feature/x");
      vi.spyOn(git, "getDefaultBranch").mockReturnValue(null);
      vi.spyOn(git, "hasCommits").mockReturnValue(true);

      const data = getStatusData();
      expect(data.hasContext).toBe(false);
      expect(data.updatedAt).toBeNull();
      expect(data.divergence).toBeNull();
    });

    it("HEAD desacoplado: branch null y el resto degradado, sin crash", () => {
      vi.spyOn(git, "getCurrentBranch").mockReturnValue(null);
      vi.spyOn(git, "getDefaultBranch").mockReturnValue("master");
      vi.spyOn(git, "hasCommits").mockReturnValue(true);

      const data = getStatusData();
      expect(data.branch).toBeNull();
      expect(data.hasContext).toBe(false);
      expect(data.divergence).toBeNull();
    });

    it("repo sin commits: hasCommits false y sin divergencia", () => {
      vi.spyOn(git, "getCurrentBranch").mockReturnValue("main");
      vi.spyOn(git, "getDefaultBranch").mockReturnValue(null);
      vi.spyOn(git, "hasCommits").mockReturnValue(false);

      const data = getStatusData();
      expect(data.hasCommits).toBe(false);
      expect(data.divergence).toBeNull();
    });

    it("omite la divergencia cuando la rama activa es la principal", () => {
      vi.spyOn(git, "getCurrentBranch").mockReturnValue("master");
      vi.spyOn(git, "getDefaultBranch").mockReturnValue("master");
      vi.spyOn(git, "hasCommits").mockReturnValue(true);

      expect(getStatusData().divergence).toBeNull();
    });

    it("omite la divergencia si no hay merge-base (sin historia común)", () => {
      vi.spyOn(git, "getCurrentBranch").mockReturnValue("huerfana");
      vi.spyOn(git, "getDefaultBranch").mockReturnValue("master");
      vi.spyOn(git, "getMergeBase").mockReturnValue(null);
      vi.spyOn(git, "hasCommits").mockReturnValue(true);

      expect(getStatusData().divergence).toBeNull();
    });
  });

  describe("getBranchContextReport (informe de la tool MCP)", () => {
    it("HEAD desacoplado: mensaje explicativo, nunca un error", () => {
      vi.spyOn(git, "getCurrentBranch").mockReturnValue(null);

      const report = getBranchContextReport();
      expect(report).toContain("Detached HEAD");
      expect(report).toContain("git checkout");
    });

    it("repo sin commits: lo dice claramente y no intenta leer el log", () => {
      vi.spyOn(git, "getCurrentBranch").mockReturnValue("main");
      vi.spyOn(git, "hasCommits").mockReturnValue(false);

      const report = getBranchContextReport();
      expect(report).toContain("Saved summary");
      expect(report).toContain("no commits yet");
    });

    it("caso normal: resumen + divergencia + commits recientes", () => {
      vi.spyOn(git, "getCurrentBranch").mockReturnValue("feature/x");
      vi.spyOn(git, "hasCommits").mockReturnValue(true);
      vi.spyOn(git, "getDefaultBranch").mockReturnValue("master");
      vi.spyOn(git, "getMergeBase").mockReturnValue("abc123");
      vi.spyOn(git, "getCommitCountSince").mockReturnValue(2);
      vi.spyOn(git, "getDiffStat").mockReturnValue(" 1 file changed");
      vi.spyOn(git, "getRecentCommits").mockReturnValue([
        "abc123 feat: algo",
        "def456 fix: otra cosa",
      ]);
      saveContext("feature/x", "Resumen manual de la rama");

      const report = getBranchContextReport();
      expect(report).toContain("Resumen manual de la rama");
      expect(report).toContain('Divergence from "master"');
      expect(report).toContain("2 commit(s)");
      expect(report).toContain("- abc123 feat: algo");
    });

    it("sin resumen guardado: aviso claro en lugar de sección vacía", () => {
      vi.spyOn(git, "getCurrentBranch").mockReturnValue("master");
      vi.spyOn(git, "hasCommits").mockReturnValue(true);
      vi.spyOn(git, "getDefaultBranch").mockReturnValue("master");
      vi.spyOn(git, "getRecentCommits").mockReturnValue([]);

      expect(getBranchContextReport()).toContain("No summary saved yet");
    });
  });
});
