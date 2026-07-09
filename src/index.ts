import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

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

const transport = new StdioServerTransport();
await server.connect(transport);
