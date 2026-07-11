import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Test de regresión del modo servidor MCP.
 *
 * Ejecuta el `dist/index.js` YA COMPILADO como proceso hijo con stdio en
 * modo pipe (sin TTY) y sin argumentos — exactamente como lo lanza un
 * cliente MCP real (Claude Code, Cursor...) — y verifica el handshake
 * `initialize` del protocolo JSON-RPC 2.0 por stdout.
 *
 * REQUIERE un build previo (`pnpm build`). El script `test` de package.json
 * encadena el build antes de vitest precisamente para que este test corra
 * siempre contra el artefacto real que se publica, no contra el fuente.
 *
 * Si este test falla, el modo agente está roto para todos los usuarios
 * existentes. Es la garantía de que la CLI/modo interactivo nunca
 * contaminan el canal stdio del protocolo.
 */

const distPath = join(import.meta.dirname, "..", "dist", "index.js");

function initializeRequest(): string {
  return `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "mcp-regression-test", version: "0.0.0" },
    },
  })}\n`;
}

describe("regresión del modo servidor MCP", () => {
  let child: ChildProcess | undefined;

  afterEach(() => {
    child?.kill();
    child = undefined;
  });

  it("dist/index.js sin argumentos y sin TTY responde el handshake initialize", async () => {
    expect(
      existsSync(distPath),
      `No existe ${distPath}. Ejecuta "pnpm build" antes de los tests.`,
    ).toBe(true);

    child = spawn(process.execPath, [distPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const proc = child;

    const response = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("El servidor MCP no respondió en 10s")),
          10_000,
        );
        let stdout = "";
        let stderr = "";

        proc.stdout?.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
          // El transporte stdio delimita mensajes JSON-RPC por línea.
          for (const line of stdout.split("\n")) {
            if (!line.trim()) continue;
            try {
              const message = JSON.parse(line);
              if (message.id === 1) {
                clearTimeout(timeout);
                resolve(message);
                return;
              }
            } catch {
              // Línea incompleta todavía; se espera más datos.
            }
          }
        });
        proc.stderr?.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
        });
        proc.on("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        proc.on("exit", (code) => {
          clearTimeout(timeout);
          reject(
            new Error(
              `El proceso terminó (code ${code}) antes de responder. stdout: ${JSON.stringify(stdout)} stderr: ${stderr}`,
            ),
          );
        });

        proc.stdin?.write(initializeRequest());
      },
    );

    expect(response.jsonrpc).toBe("2.0");
    expect(response).toHaveProperty("result");
    expect(response).not.toHaveProperty("error");

    const result = response.result as {
      protocolVersion: string;
      serverInfo: { name: string };
    };
    expect(result.serverInfo.name).toBe("branchpoint");
    expect(result.protocolVersion).toBeTruthy();
  });
});
