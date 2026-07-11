// Validadores compartidos entre las superficies de entrada (modo
// interactivo, y en el futuro tools MCP / CLI). Regla del proyecto: todo
// callback de validación que se pase a una librería de UI debe vivir aquí
// como función nombrada, exportada y testeada — las arrows inline pasadas
// a librerías son puntos ciegos de los tests (ver crash de la Fase 9).

/**
 * Límite de tamaño de un resumen de contexto, en caracteres.
 *
 * 50 000 caracteres ≈ 12 000 tokens: más que de sobra para un resumen de
 * rama, y una salvaguarda contra volcados accidentales (un agente pegando
 * un diff entero). El objetivo del producto es AHORRAR tokens; un
 * "resumen" de ese tamaño trabajaría en contra y suele ser un error.
 */
export const MAX_SUMMARY_CHARS = 50_000;

/**
 * Valida un resumen de contexto introducido por el usuario o por un agente.
 *
 * @clack/prompts entrega `undefined` (no `""`) cuando el campo está vacío,
 * así que el parámetro debe aceptar `undefined` sin crashear.
 *
 * @returns un mensaje de error si el resumen no es válido, o `undefined`
 *   si es aceptable (contrato de `validate` de @clack/prompts).
 */
export function validateSummary(value: string | undefined): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return "El resumen no puede estar vacío. Escribe qué se está haciendo en esta rama.";
  }
  if (value.length > MAX_SUMMARY_CHARS) {
    return `El resumen supera el límite de ${MAX_SUMMARY_CHARS} caracteres (tiene ${value.length}). Guarda un resumen, no un volcado: condensa lo esencial.`;
  }
  return undefined;
}
