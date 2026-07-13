/**
 * Validators shared across every input surface (interactive mode today;
 * MCP tools and CLI flags reuse the same functions where it makes sense).
 * Project rule: any validate/callback passed to a UI library must live
 * here as a named, exported, tested function — inline arrows passed
 * straight into a library are untestable blind spots (see the Phase 9
 * crash this rule was written in response to).
 */

/**
 * Maximum length of a context summary, in characters.
 *
 * 50,000 characters is roughly 12,000 tokens: comfortably more than any
 * reasonable branch summary needs, and a safeguard against accidental
 * dumps (an agent pasting an entire diff). The product's whole point is
 * SAVING tokens; a "summary" that size would work against that and is
 * almost always a mistake rather than intentional.
 */
export const MAX_SUMMARY_CHARS = 50_000;

/**
 * Validates a context summary entered by a human or an agent.
 *
 * @clack/prompts delivers `undefined` (not `""`) when the field is left
 * empty, so this must accept `undefined` without throwing.
 *
 * @returns an error message if the summary is invalid, or `undefined` if
 *   it's acceptable (the `validate` contract expected by @clack/prompts).
 */
export function validateSummary(value: string | undefined): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return "The summary can't be empty. Write what's being worked on in this branch.";
  }
  if (value.length > MAX_SUMMARY_CHARS) {
    return `The summary exceeds the ${MAX_SUMMARY_CHARS}-character limit (it has ${value.length}). Save a summary, not a dump: condense the essentials.`;
  }
  return undefined;
}
