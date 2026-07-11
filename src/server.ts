import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getCurrentBranch } from "./git.js";
import { getBranchContextReport } from "./queries.js";
import { saveContext } from "./storage.js";
import { validateSummary } from "./validators.js";
import { getVersion } from "./version.js";

// Camino MCP: stdout es EXCLUSIVAMENTE el canal JSON-RPC del protocolo.
// Nada en este fichero (ni en lo que importa) puede escribir a stdout;
// cualquier log de depuración iría a stderr.

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
      // Estados degradados (HEAD desacoplado, repo sin commits) devuelven
      // texto explicativo como contenido normal, no un error de tool: el
      // agente puede leerlos y actuar en consecuencia.
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
