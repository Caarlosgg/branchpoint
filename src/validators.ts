// Validadores compartidos entre las superficies de entrada (modo
// interactivo, y en el futuro tools MCP / CLI). Regla del proyecto: todo
// callback de validación que se pase a una librería de UI debe vivir aquí
// como función nombrada, exportada y testeada — las arrows inline pasadas
// a librerías son puntos ciegos de los tests (ver crash de la Fase 9).

/**
 * Valida un resumen de contexto introducido por el usuario.
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
  return undefined;
}
