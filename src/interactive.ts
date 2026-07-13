import * as p from "@clack/prompts";
import pc from "picocolors";
import { formatDate } from "./cli.js";
import { getCurrentBranch } from "./git.js";
import { getBranchList, getContextData } from "./queries.js";
import { saveContext } from "./storage.js";
import { validateSummary } from "./validators.js";
import { getVersion } from "./version.js";

/**
 * The interactive menu launched when a human runs `branchpoint` with no
 * arguments in a terminal. stdout is the product here, same as cli.ts —
 * this is just another skin over the same logic: it consumes queries.ts
 * and storage.ts directly and duplicates none of their behavior.
 */

function renderContext(branch: string): string {
  const data = getContextData(branch);
  if (data.content === null) {
    return pc.dim(
      "Esta rama no tiene contexto guardado todavía. Puedes guardar el primero desde el menú.",
    );
  }
  const header = data.updatedAt
    ? pc.dim(`Actualizado ${formatDate(data.updatedAt)}\n\n`)
    : "";
  return (
    header +
    data.content
      .split("\n")
      .map((line) => (line.startsWith("#") ? pc.bold(line) : line))
      .join("\n")
  );
}

function renderBranchList(): string {
  const entries = getBranchList();
  if (entries.length === 0) {
    return pc.dim(
      "Aún no hay contextos guardados en este repositorio. Puedes guardar el primero desde el menú.",
    );
  }
  return entries
    .map(
      (entry) =>
        `${pc.cyan(entry.branch)} ${pc.dim(`(${formatDate(entry.updatedAt)})`)}\n  ${entry.preview}`,
    )
    .join("\n");
}

/**
 * Interactive mode entry point. Wraps the real loop in a try/catch:
 * whatever happens (git disappears mid-session, disk fills up...) the
 * user sees a clear message, never a raw Node stack trace.
 */
export async function runInteractive(): Promise<void> {
  try {
    await interactiveLoop();
  } catch (error) {
    p.cancel(
      `Algo ha fallado: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

async function interactiveLoop(): Promise<void> {
  p.intro(pc.cyan(`branchpoint v${getVersion()}`));

  let branch: string | null;
  try {
    branch = getCurrentBranch();
  } catch {
    p.cancel(
      "Branchpoint necesita un repositorio Git. Muévete a la carpeta de tu proyecto, o inicializa uno con: git init",
    );
    process.exitCode = 1;
    return;
  }

  if (branch === null) {
    // A valid git state, not an error: neutral message and clean exit.
    p.outro(
      "HEAD desacoplado: no hay rama activa. Haz checkout de una rama (git checkout <rama>) y vuelve a lanzar branchpoint.",
    );
    return;
  }

  while (true) {
    const action = await p.select({
      message: `Rama activa: ${pc.cyan(branch)} — ¿qué quieres hacer?`,
      options: [
        { value: "context", label: "Ver contexto de esta rama" },
        { value: "list", label: "Ver todas las ramas guardadas" },
        { value: "save", label: "Guardar un resumen ahora" },
        { value: "exit", label: "Salir" },
      ],
    });

    // Ctrl+C (or Esc) at any point: clean exit, no stack trace, exit
    // code 0 — canceling is not an error.
    if (p.isCancel(action) || action === "exit") {
      break;
    }

    if (action === "context") {
      p.note(renderContext(branch), pc.cyan(branch));
    } else if (action === "list") {
      p.note(renderBranchList(), "Ramas con contexto");
    } else if (action === "save") {
      const summary = await p.text({
        message: `Resumen para la rama ${pc.cyan(branch)}:`,
        placeholder: "Qué se está haciendo, decisiones tomadas, qué falta...",
        validate: validateSummary,
      });
      if (p.isCancel(summary)) {
        break;
      }
      saveContext(branch, summary);
      p.log.success(`Contexto guardado para la rama "${branch}".`);
    }
  }

  p.outro("¡Hasta luego! Tu contexto queda guardado en .git/branchpoint/");
}
