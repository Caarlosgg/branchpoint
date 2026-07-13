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
      "This branch has no saved context yet. You can save the first one from the menu.",
    );
  }
  const header = data.updatedAt
    ? pc.dim(`Updated ${formatDate(data.updatedAt)}\n\n`)
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
      "No saved contexts in this repository yet. You can save the first one from the menu.",
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
      `Something went wrong: ${error instanceof Error ? error.message : String(error)}`,
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
      "Branchpoint needs a Git repository. Move to your project's folder, or initialize one with: git init",
    );
    process.exitCode = 1;
    return;
  }

  if (branch === null) {
    // A valid git state, not an error: neutral message and clean exit.
    p.outro(
      "Detached HEAD: there's no active branch. Check out a branch (git checkout <branch>) and launch branchpoint again.",
    );
    return;
  }

  while (true) {
    const action = await p.select({
      message: `Active branch: ${pc.cyan(branch)} — what would you like to do?`,
      options: [
        { value: "context", label: "View this branch's context" },
        { value: "list", label: "View every saved branch" },
        { value: "save", label: "Save a summary now" },
        { value: "exit", label: "Exit" },
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
      p.note(renderBranchList(), "Branches with context");
    } else if (action === "save") {
      const summary = await p.text({
        message: `Summary for branch ${pc.cyan(branch)}:`,
        placeholder: "What's being worked on, decisions made, what's left...",
        validate: validateSummary,
      });
      if (p.isCancel(summary)) {
        break;
      }
      saveContext(branch, summary);
      p.log.success(`Context saved for branch "${branch}".`);
    }
  }

  p.outro("See you later! Your context is saved under .git/branchpoint/");
}
