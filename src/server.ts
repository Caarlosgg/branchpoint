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
      description: "Responde con Pong seguido del mensaje recibido.",
      inputSchema: {
        message: z.string().describe("Mensaje a devolver en la respuesta"),
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
        "Devuelve el contexto combinado de la rama Git activa: resumen guardado manualmente, divergencia respecto a la rama principal (si aplica) y últimos commits.",
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
        "Guarda un resumen del contexto de desarrollo actual para la rama Git activa. Úsala cuando el usuario pida recordar o dejar constancia del estado, decisiones o progreso de la rama en la que se está trabajando.",
      inputSchema: {
        summary: z
          .string()
          .describe(
            "Resumen del contexto de desarrollo actual para guardar en esta rama",
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
              text: "HEAD desacoplado (detached): no hay rama activa a la que asociar el resumen. Haz checkout de una rama y vuelve a intentarlo.",
            },
          ],
        };
      }

      saveContext(branch, summary);
      return {
        content: [
          { type: "text", text: `Contexto guardado para la rama "${branch}".` },
        ],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
