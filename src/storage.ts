import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { getGitCommonDir } from "./git.js";

// Persistencia de contextos por rama en <git-common-dir>/branchpoint/.
// Se usa el git-common-dir (no <repoRoot>/.git construido a mano) porque
// en worktrees y submódulos .git es un fichero puntero — ver git.ts.

/**
 * Sanitización determinista de nombres de rama para usarlos como rutas de
 * fichero seguras en Windows (y coherentes en todos los SO).
 *
 * Esquema de escape (percent-encoding selectivo, reversible):
 * - "%" se codifica SIEMPRE como %25 — es el carácter de escape, así el
 *   decodificado es inequívoco (ningún "%XX" literal sobrevive sin codificar).
 * - Caracteres inválidos en nombres de fichero Windows (< > : " | ? * \)
 *   y caracteres de control → %XX (hex mayúscula).
 * - Segmentos que son nombres de dispositivo reservados de Windows (CON,
 *   PRN, AUX, NUL, COM1-9, LPT1-9, con o sin extensión: "CON.md" también
 *   está reservado) → se codifica su primer carácter ("CON" → "%43ON").
 * - Segmentos terminados en "." o " " (Windows los recorta o falla) → se
 *   codifica el último carácter.
 *
 * Los "/" del nombre de rama NO se tocan: crean subcarpetas reales
 * (feature/login-fix → feature/login-fix.md), igual que refs/heads/.
 */
const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
// biome-ignore lint/suspicious/noControlCharactersInRegex: escapar caracteres de control es exactamente el proposito de esta regex
const WINDOWS_INVALID_CHARS = /[%<>:"|?*\\\u0000-\u001F]/g;

function encodeChar(char: string): string {
  return `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;
}

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

/** Inversa exacta de sanitizeBranchForFs (los %XX solo pueden venir de
 * ella, porque "%" literal siempre se codifica). */
export function decodeBranchFromFs(encoded: string): string {
  return encoded.replace(/%([0-9A-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

/** Directorio raíz del almacén de contextos (compartido entre worktrees). */
export function getBranchpointDir(): string {
  return resolve(join(getGitCommonDir(), "branchpoint"));
}

export function getContextPath(branch: string): string {
  const dir = getBranchpointDir();
  const path = resolve(dir, `${sanitizeBranchForFs(branch)}.md`);
  // Cinturón y tirantes: git ya prohíbe ".." en nombres de ref y la
  // sanitización neutraliza separadores y sufijos raros, PERO `branch`
  // también puede llegar de un argumento CLI arbitrario
  // (`branchpoint context <lo-que-sea>`), que git nunca validó. Ninguna
  // entrada debe resolver una ruta fuera del almacén (p. ej. una "rama"
  // que empiece por "/" se volvería absoluta al resolver).
  if (!path.startsWith(dir + sep)) {
    throw new Error(
      `Nombre de rama no válido como ruta de contexto: "${branch}"`,
    );
  }
  return path;
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
