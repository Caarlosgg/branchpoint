import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getCurrentBranch } from "./git.js";
import { getBranchContextReport } from "./queries.js";
import { saveContext } from "./storage.js";
import { validateSummary } from "./validators.js";
import { getVersion } from "./version.js";

/**
 * MCP server entry point, one tool registration per feature. stdout is
 * EXCLUSIVELY the protocol's JSON-RPC channel here: nothing in this file
 * (or anything it imports) may write to stdout outside the SDK's own
 * transport — any debug logging would have to go to stderr instead.
 */

/** Builds and connects the MCP server over stdio. Resolves once the
 * transport handshake completes; the process then blocks on stdin. */
export async function runMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "branchpoint",
    version: getVersion(),
  });

  server.registerTool(
    "ping",
    {
      description: "Replies with Pong followed by the received message.",
      inputSchema: {
        message: z.string().describe("Message to echo back in the response"),
      },
    },
    async ({ message }) => {
      return {
        content: [{ type: "text", text: `Pong: ${message}` }],
      };
    },
  );

  server.registerTool(
    "get_branch_context",
    {
      description:
        "Returns the combined context for the active Git branch: manually saved summary, divergence from the default branch (if applicable), and recent commits.",
      inputSchema: {},
    },
    async () => {
      // Degraded states (detached HEAD, repo with no commits) come back
      // as explanatory text in normal content, not a tool error: the
      // agent can read them and decide what to do next.
      return {
        content: [{ type: "text", text: getBranchContextReport() }],
      };
    },
  );

  server.registerTool(
    "save_branch_context",
    {
      description:
        "Saves a summary of the current development context for the active Git branch. Use it when the user asks to remember or record the state, decisions, or progress of the branch being worked on.",
      inputSchema: {
        summary: z
          .string()
          .describe(
            "Summary of the current development context to save for this branch",
          ),
      },
    },
    async ({ summary }) => {
      const validationError = validateSummary(summary);
      if (validationError) {
        return {
          isError: true,
          content: [{ type: "text", text: validationError }],
        };
      }

      const branch = getCurrentBranch();
      if (branch === null) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Detached HEAD: there's no active branch to attach the summary to. Check out a branch and try again.",
            },
          ],
        };
      }

      saveContext(branch, summary);
      return {
        content: [
          { type: "text", text: `Context saved for branch "${branch}".` },
        ],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
