/**
 * Mode dispatcher — the single entry point for the `branchpoint` binary.
 * Every import below is dynamic on purpose: in MCP mode the process must
 * never load CLI code (or its dependencies), because importing them could
 * write to stdout and corrupt the JSON-RPC channel before a single tool
 * call happens.
 *
 * - Arguments present         -> CLI (Commander decides what to do with them).
 * - No arguments, TTY stdin   -> a human ran "branchpoint" by hand: interactive mode.
 * - No arguments, no TTY      -> an agent launched the process over pipes: MCP server.
 *   This is the default path and the one under the golden rule: stdout
 *   carries nothing but JSON-RPC.
 */
try {
  if (process.argv.length > 2) {
    const { runCli } = await import("./cli.js");
    await runCli(process.argv);
  } else if (process.stdin.isTTY) {
    // @clack/prompts picks Unicode vs ASCII glyphs ONCE, at import time,
    // by sniffing environment variables (WT_SESSION, TERM_PROGRAM...) —
    // and that list doesn't cover every modern Windows terminal, so the
    // menu was rendering with +---| while boxen/cli-table3 (which emit
    // Unicode unconditionally) drew nice borders in the SAME terminal.
    // Clack exposes no API to force it, so the environment hint its own
    // detection already recognizes is planted here, BEFORE the dynamic
    // import triggers that detection. Consistent with the rest of the
    // product: a modern terminal is assumed.
    if (process.platform === "win32") {
      process.env.WT_SESSION ??= "branchpoint-forced-unicode";
    }
    const { runInteractive } = await import("./interactive.js");
    await runInteractive();
  } else {
    const { runMcpServer } = await import("./server.js");
    await runMcpServer();
  }
} catch (error) {
  // Last-resort safety net: any rejection reaching this point would
  // otherwise surface as a raw Node stack trace. The user (or the MCP
  // client's log) always gets one concise line on stderr — stdout is
  // never touched, even here.
  console.error(
    `branchpoint: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
