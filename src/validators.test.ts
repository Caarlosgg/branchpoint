import { describe, expect, it } from "vitest";
import { validateSummary } from "./validators.js";

describe("validateSummary", () => {
  // Reproduce el crash de la prueba manual de la Fase 9: @clack/prompts
  // entrega undefined (no "") cuando se pulsa Enter con el campo vacío.
  it("rechaza undefined con mensaje, sin crashear", () => {
    expect(validateSummary(undefined)).toMatch(/no puede estar vacío/i);
  });

  it("rechaza la cadena vacía con mensaje", () => {
    expect(validateSummary("")).toMatch(/no puede estar vacío/i);
  });

  it("rechaza una cadena de solo espacios con mensaje", () => {
    expect(validateSummary("   ")).toMatch(/no puede estar vacío/i);
  });

  it("acepta un resumen normal (devuelve undefined)", () => {
    expect(validateSummary("Trabajando en el flujo de OAuth")).toBeUndefined();
  });
});
