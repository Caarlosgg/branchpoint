import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getCurrentBranch } from "./git.js";
import { readContext, saveContext } from "./storage.js";

const server = new McpServer({
  name: "branchpoint",
  version: "0.1.0",
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
      "Devuelve el resumen de contexto guardado para la rama Git activa del repositorio, si existe.",
    inputSchema: {},
  },
  async () => {
    const branch = getCurrentBranch();
    const context = readContext(branch);
    if (context === null) {
      return {
        content: [
          {
            type: "text",
            text: `Sin contexto aún para la rama "${branch}".`,
          },
        ],
      };
    }
    return {
      content: [{ type: "text", text: context }],
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
    const branch = getCurrentBranch();
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
