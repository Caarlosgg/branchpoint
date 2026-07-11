import boxen from "boxen";
import Table from "cli-table3";
import { Command } from "commander";
import pc from "picocolors";
import { getBranchList, getContextData, getStatusData } from "./queries.js";
import { getVersion } from "./version.js";

// Camino CLI: aquí stdout es el producto, se imprime con libertad.
// Esta capa solo presenta; los datos vienen de queries.ts.

export function formatDate(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Ejecuta una acción que necesita un repositorio Git. Si falla porque no
 * estamos en uno, imprime a stderr un error accionable (qué hacer, no solo
 * qué falló) y termina con exit code 1.
 */
function withRepo(action: () => void): void {
  try {
    action();
  } catch (error) {
    console.error(pc.red("✖ Branchpoint necesita un repositorio Git."));
    console.error(
      "  Muévete a la carpeta de tu proyecto, o inicializa uno con: git init",
    );
    console.error(
      pc.dim(`  Detalle: ${error instanceof Error ? error.message : String(error)}`),
    );
    process.exitCode = 1;
  }
}

function printStatus(json: boolean): void {
  const data = getStatusData();
  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const lines = [`${pc.bold("Rama activa:")}  ${pc.cyan(data.branch)}`];
  if (data.hasContext && data.updatedAt) {
    lines.push(
      `${pc.bold("Contexto:")}    ${pc.green("guardado")} ${pc.dim(`(actualizado ${formatDate(data.updatedAt)})`)}`,
    );
  } else {
    // Sin contexto NO es un error: es el estado inicial normal. Gris
    // neutro e invitación a guardar, nunca rojo.
    lines.push(
      `${pc.bold("Contexto:")}    ${pc.dim("aún no hay resumen guardado para esta rama")}`,
    );
    lines.push(
      pc.dim(
        `Guarda el primero ejecutando ${pc.bold("branchpoint")} sin argumentos (modo interactivo).`,
      ),
    );
  }
  if (data.divergence) {
    lines.push(
      `${pc.bold("Divergencia:")} ${data.divergence.commitCount} commit(s) desde el punto común con ${pc.cyan(data.divergence.baseBranch)}`,
    );
  }

  console.log(
    boxen(lines.join("\n"), {
      title: "branchpoint",
      titleAlignment: "center",
      padding: { top: 0, bottom: 0, left: 2, right: 2 },
      margin: { top: 1, bottom: 1, left: 0, right: 0 },
      borderColor: "cyan",
      borderStyle: "round",
    }),
  );
}

function printList(json: boolean): void {
  const entries = getBranchList();
  if (json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (entries.length === 0) {
    console.log(
      `\nAún no hay contextos guardados. Guarda el primero ejecutando ${pc.bold("branchpoint")} sin argumentos (modo interactivo), o pide a tu agente que use la tool ${pc.bold("save_branch_context")}.\n`,
    );
    return;
  }

  const table = new Table({
    head: [pc.cyan("Rama"), pc.cyan("Actualizado"), pc.cyan("Resumen")],
    wordWrap: true,
    // cli-table3 no respeta NO_COLOR por sí solo: se apaga el color del
    // borde a mano cuando el entorno no soporta color (pipes, CI).
    style: { head: [], border: pc.isColorSupported ? ["grey"] : [] },
  });
  for (const entry of entries) {
    table.push([entry.branch, formatDate(entry.updatedAt), entry.preview]);
  }
  console.log(table.toString());
}

function printContext(branch: string | undefined, json: boolean): void {
  const data = getContextData(branch);
  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (data.content === null) {
    console.log(
      `La rama ${pc.cyan(data.branch)} no tiene contexto guardado todavía. Guarda el primero ejecutando ${pc.bold("branchpoint")} sin argumentos (modo interactivo).`,
    );
    return;
  }

  console.log(
    `${pc.bold(pc.cyan(data.branch))}${data.updatedAt ? pc.dim(` — actualizado ${formatDate(data.updatedAt)}`) : ""}\n`,
  );
  for (const line of data.content.split("\n")) {
    console.log(line.startsWith("#") ? pc.bold(line) : line);
  }
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("branchpoint")
    .description(
      "Contexto persistente por rama Git: servidor MCP para agentes IA y CLI para humanos.\nSin argumentos y con terminal: modo interactivo. Sin argumentos y con pipes: servidor MCP.",
    )
    .version(getVersion(), "-V, --version", "muestra la versión")
    .helpOption("-h, --help", "muestra esta ayuda")
    .helpCommand(false);

  program
    .command("status")
    .description("muestra la rama activa, si tiene contexto guardado y su divergencia")
    .option("--json", "salida JSON cruda, sin colores ni cajas")
    .action((options: { json?: boolean }) => {
      withRepo(() => printStatus(options.json ?? false));
    });

  program
    .command("list")
    .description("lista todas las ramas con contexto guardado, la más reciente primero")
    .option("--json", "salida JSON cruda, sin colores ni tabla")
    .action((options: { json?: boolean }) => {
      withRepo(() => printList(options.json ?? false));
    });

  program
    .command("context")
    .argument("[branch]", "rama a consultar (por defecto, la activa)")
    .description("muestra el contexto completo guardado para una rama")
    .option("--json", "salida JSON cruda, sin colores")
    .action((branch: string | undefined, options: { json?: boolean }) => {
      withRepo(() => printContext(branch, options.json ?? false));
    });

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  await buildProgram().parseAsync(argv);
}
