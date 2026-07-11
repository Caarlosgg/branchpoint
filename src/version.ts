import { readFileSync } from "node:fs";

/**
 * Versión real leída de package.json — única fuente de verdad, compartida
 * por el servidor MCP, la CLI y el modo interactivo.
 *
 * dist/ y src/ están ambos un nivel por debajo de package.json, así que la
 * misma ruta relativa funciona compilado y en desarrollo/tests.
 */
export function getVersion(): string {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  return pkg.version;
}
