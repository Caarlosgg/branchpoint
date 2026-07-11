import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getCommitCountSince,
  getCurrentBranch,
  getDefaultBranch,
  getDiffStat,
  getMergeBase,
  getRecentCommits,
} from "./git.js";
import { readContext, saveContext } from "./storage.js";
import { getVersion } from "./version.js";

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
      const branch = getCurrentBranch();
      const manualSummary =
        readContext(branch) ?? "Sin resumen guardado todavía.";
      const sections = [`## Resumen guardado\n${manualSummary}`];

      const defaultBranch = getDefaultBranch();
      if (defaultBranch && defaultBranch !== branch) {
        const mergeBase = getMergeBase(defaultBranch, branch);
        if (mergeBase) {
          const commitCount = getCommitCountSince(mergeBase);
          const diffStat = getDiffStat(mergeBase);
          sections.push(
            `## Divergencia respecto a "${defaultBranch}"\n${commitCount} commit(s) desde el punto de divergencia.\n\n\`\`\`\n${diffStat}\n\`\`\``,
          );
        }
      }

      const recentCommits = getRecentCommits(10);
      if (recentCommits.length > 0) {
        sections.push(
          `## Últimos commits\n${recentCommits.map((line) => `- ${line}`).join("\n")}`,
        );
      }

      return {
        content: [{ type: "text", text: sections.join("\n\n") }],
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
}
