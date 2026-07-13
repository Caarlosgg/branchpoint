import boxen from "boxen";
import Table from "cli-table3";
import { Command } from "commander";
import pc from "picocolors";
import { GitError } from "./git.js";
import { getBranchList, getContextData, getStatusData } from "./queries.js";
import { getVersion } from "./version.js";

/**
 * The human-facing CLI: Commander wiring plus presentation (boxen,
 * cli-table3, picocolors). stdout is the product here — it's printed to
 * freely, unlike the MCP path. This layer only formats; all data comes
 * from queries.ts, never computed here.
 */

/** Formats an ISO timestamp as `YYYY-MM-DD HH:mm` in local time. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Runs an action that needs a git repository. Errors ALWAYS surface as an
 * actionable stderr message (what to do, not just what failed) with exit
 * code 1 — never a raw stack trace. stdout stays clean so `--json | jq`
 * never receives garbage mixed into the pipeline.
 */
function withRepo(action: () => void): void {
  try {
    action();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (error instanceof GitError) {
      console.error(pc.red("✖ Branchpoint necesita un repositorio Git."));
      console.error(
        "  Muévete a la carpeta de tu proyecto, o inicializa uno con: git init",
      );
      console.error(pc.dim(`  Detalle: ${detail}`));
    } else {
      console.error(pc.red(`✖ ${detail}`));
    }
    process.exitCode = 1;
  }
}

function printStatus(json: boolean): void {
  const data = getStatusData();
  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Detached HEAD (checkout of a bare commit, mid-rebase) is not an
  // error: report the state and how to get out of it.
  if (data.branch === null) {
    console.log(
      boxen(
        `${pc.bold("Rama activa:")}  ${pc.dim("(ninguna — HEAD desacoplado)")}\n${pc.dim("Haz checkout de una rama (git checkout <rama>) para usar el contexto por rama.")}`,
        {
          title: "branchpoint",
          titleAlignment: "center",
          padding: { top: 0, bottom: 0, left: 2, right: 2 },
          margin: { top: 1, bottom: 1, left: 0, right: 0 },
          borderColor: "cyan",
          borderStyle: "round",
        },
      ),
    );
    return;
  }

  const lines = [`${pc.bold("Rama activa:")}  ${pc.cyan(data.branch)}`];
  if (!data.hasCommits) {
    lines.push(pc.dim("El repositorio no tiene commits todavía."));
  }
  if (data.hasContext && data.updatedAt) {
    lines.push(
      `${pc.bold("Contexto:")}    ${pc.green("guardado")} ${pc.dim(`(actualizado ${formatDate(data.updatedAt)})`)}`,
    );
  } else {
    // No saved context is NOT an error: it's the normal initial state
    // for any new user. Neutral gray with an invitation, never red.
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
    // cli-table3 doesn't honor NO_COLOR on its own: the border color is
    // switched off by hand whenever the environment doesn't support
    // color (pipes, CI), so `branchpoint list | ...` stays ANSI-free.
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

  if (data.branch === null) {
    console.log(
      `HEAD desacoplado: no hay rama activa. Haz checkout de una rama (${pc.bold("git checkout <rama>")}) o indica una: ${pc.bold("branchpoint context <rama>")}.`,
    );
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

/** Builds the Commander program with all subcommands wired up. Exported
 * separately from `runCli` so tests can inspect it without parsing argv. */
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
    .description(
      "muestra la rama activa, si tiene contexto guardado y su divergencia",
    )
    .option("--json", "salida JSON cruda, sin colores ni cajas")
    .action((options: { json?: boolean }) => {
      withRepo(() => printStatus(options.json ?? false));
    });

  program
    .command("list")
    .description(
      "lista todas las ramas con contexto guardado, la más reciente primero",
    )
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

/** Parses `argv` and runs the matching subcommand. Entry point used by
 * the dispatcher whenever the process is invoked with arguments. */
export async function runCli(argv: string[]): Promise<void> {
  await buildProgram().parseAsync(argv);
}
