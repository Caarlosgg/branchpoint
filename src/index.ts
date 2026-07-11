// Dispatcher de modos. Los imports son dinámicos a propósito: en modo MCP
// el proceso no debe llegar a cargar código CLI (ni sus dependencias, que
// podrían escribir a stdout al importarse y romper el canal JSON-RPC).
//
// - Con argumentos           → CLI (Commander decide qué hacer con ellos).
// - Sin argumentos, con TTY  → un humano escribió "branchpoint": modo interactivo.
// - Sin argumentos, sin TTY  → un agente lanzó el proceso con pipes: servidor MCP.
//   Este es el camino por defecto y el que se protege: stdout es JSON-RPC puro.
if (process.argv.length > 2) {
  const { runCli } = await import("./cli.js");
  await runCli(process.argv);
} else if (process.stdin.isTTY) {
  // @clack/prompts elige símbolos Unicode vs ASCII UNA vez, al importarse,
  // olfateando variables de entorno (WT_SESSION, TERM_PROGRAM...) — y esa
  // lista no cubre todos los terminales modernos de Windows, así que el
  // menú salía con +---| mientras boxen/cli-table3 (que emiten Unicode
  // incondicionalmente) pintaban bordes bonitos en el MISMO terminal.
  // Clack no expone API para forzarlo, así que se planta aquí la pista de
  // entorno que su detección sí reconoce, ANTES del import dinámico.
  // Coherente con el resto del producto: asumimos terminal moderno.
  if (process.platform === "win32") {
    process.env.WT_SESSION ??= "branchpoint-forced-unicode";
  }
  const { runInteractive } = await import("./interactive.js");
  await runInteractive();
} else {
  const { runMcpServer } = await import("./server.js");
  await runMcpServer();
}
