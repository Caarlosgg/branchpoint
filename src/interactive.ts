import * as p from "@clack/prompts";
import pc from "picocolors";
import { formatDate } from "./cli.js";
import { getCurrentBranch } from "./git.js";
import { getBranchList, getContextData } from "./queries.js";
import { saveContext } from "./storage.js";
import { getVersion } from "./version.js";

// Camino interactivo: aquí stdout es el producto, se imprime con libertad.
// Es otra piel sobre la misma lógica: consume queries.ts y storage.ts,
// no duplica nada.

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

export async function runInteractive(): Promise<void> {
  p.intro(pc.cyan(`branchpoint v${getVersion()}`));

  let branch: string;
  try {
    branch = getCurrentBranch();
  } catch {
    p.cancel(
      "Branchpoint necesita un repositorio Git. Muévete a la carpeta de tu proyecto, o inicializa uno con: git init",
    );
    process.exitCode = 1;
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

    // Ctrl+C (o Esc) en cualquier punto: salida limpia, sin stack trace,
    // exit code 0 — cancelar no es un error.
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
        validate: (value) =>
          value.trim().length === 0
            ? "El resumen no puede estar vacío."
            : undefined,
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
