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
      console.error(pc.red("✖ Branchpoint needs a Git repository."));
      console.error(
        "  Move to your project's folder, or initialize one with: git init",
      );
      console.error(pc.dim(`  Detail: ${detail}`));
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
        `${pc.bold("Active branch:")}  ${pc.dim("(none — detached HEAD)")}\n${pc.dim("Check out a branch (git checkout <branch>) to use per-branch context.")}`,
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

  const lines = [`${pc.bold("Active branch:")}  ${pc.cyan(data.branch)}`];
  if (!data.hasCommits) {
    lines.push(pc.dim("The repository has no commits yet."));
  }
  if (data.hasContext && data.updatedAt) {
    lines.push(
      `${pc.bold("Context:")}        ${pc.green("saved")} ${pc.dim(`(updated ${formatDate(data.updatedAt)})`)}`,
    );
  } else {
    // No saved context is NOT an error: it's the normal initial state
    // for any new user. Neutral gray with an invitation, never red.
    lines.push(
      `${pc.bold("Context:")}        ${pc.dim("no summary saved for this branch yet")}`,
    );
    lines.push(
      pc.dim(
        `Save the first one by running ${pc.bold("branchpoint")} with no arguments (interactive mode).`,
      ),
    );
  }
  if (data.divergence) {
    lines.push(
      `${pc.bold("Divergence:")}     ${data.divergence.commitCount} commit(s) since the common point with ${pc.cyan(data.divergence.baseBranch)}`,
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
      `\nNo saved contexts yet. Save the first one by running ${pc.bold("branchpoint")} with no arguments (interactive mode), or have your agent use the ${pc.bold("save_branch_context")} tool.\n`,
    );
    return;
  }

  const table = new Table({
    head: [pc.cyan("Branch"), pc.cyan("Updated"), pc.cyan("Summary")],
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
      `Detached HEAD: there's no active branch. Check out a branch (${pc.bold("git checkout <branch>")}) or name one: ${pc.bold("branchpoint context <branch>")}.`,
    );
    return;
  }

  if (data.content === null) {
    console.log(
      `Branch ${pc.cyan(data.branch)} has no saved context yet. Save the first one by running ${pc.bold("branchpoint")} with no arguments (interactive mode).`,
    );
    return;
  }

  console.log(
    `${pc.bold(pc.cyan(data.branch))}${data.updatedAt ? pc.dim(` — updated ${formatDate(data.updatedAt)}`) : ""}\n`,
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
      "Persistent per-branch Git context: an MCP server for AI agents and a CLI for humans.\nNo arguments in a terminal: interactive mode. No arguments over pipes: MCP server.",
    )
    .version(getVersion(), "-V, --version", "show the version number")
    .helpOption("-h, --help", "show this help")
    .helpCommand(false);

  program
    .command("status")
    .description(
      "show the active branch, whether it has saved context, and its divergence",
    )
    .option("--json", "raw JSON output, no colors or boxes")
    .action((options: { json?: boolean }) => {
      withRepo(() => printStatus(options.json ?? false));
    });

  program
    .command("list")
    .description(
      "list every branch with saved context, most recently updated first",
    )
    .option("--json", "raw JSON output, no colors or table")
    .action((options: { json?: boolean }) => {
      withRepo(() => printList(options.json ?? false));
    });

  program
    .command("context")
    .argument("[branch]", "branch to inspect (defaults to the active one)")
    .description("show the full saved context for a branch")
    .option("--json", "raw JSON output, no colors")
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
