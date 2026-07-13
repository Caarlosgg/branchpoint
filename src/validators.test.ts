import { describe, expect, it } from "vitest";
import { MAX_SUMMARY_CHARS, validateSummary } from "./validators.js";

describe("validateSummary", () => {
  // Reproduce el crash de la prueba manual de la Fase 9: @clack/prompts
  // entrega undefined (no "") cuando se pulsa Enter con el campo vacío.
  it("rechaza undefined con mensaje, sin crashear", () => {
    expect(validateSummary(undefined)).toMatch(/can't be empty/i);
  });

  it("rechaza la cadena vacía con mensaje", () => {
    expect(validateSummary("")).toMatch(/can't be empty/i);
  });

  it("rechaza una cadena de solo espacios con mensaje", () => {
    expect(validateSummary("   ")).toMatch(/can't be empty/i);
  });

  it("acepta un resumen normal (devuelve undefined)", () => {
    expect(validateSummary("Trabajando en el flujo de OAuth")).toBeUndefined();
  });

  it("acepta un resumen justo en el límite de tamaño", () => {
    expect(validateSummary("a".repeat(MAX_SUMMARY_CHARS))).toBeUndefined();
  });

  it("rechaza un resumen que supera el límite de tamaño", () => {
    expect(validateSummary("a".repeat(MAX_SUMMARY_CHARS + 1))).toMatch(
      /exceeds the.*character limit/i,
    );
  });
});
