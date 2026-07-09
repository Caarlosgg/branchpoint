# Branchpoint

## Concepto

Branchpoint es un servidor MCP (Model Context Protocol) local que audita la
rama Git activa del repositorio del usuario y persiste resúmenes de contexto
por rama en `.git/branchpoint/`.

El problema que resuelve: cuando un agente IA (Claude Code, Cursor, Cline)
trabaja en un repo con varias ramas activas, no tiene memoria de qué se
decidió o se hizo en cada rama. Esto provoca dos síntomas:

- **Alucinación cruzada de ramas**: el agente mezcla contexto de código o
  decisiones de una rama con el trabajo actual en otra.
- **Desperdicio de tokens**: el agente tiene que re-explorar y re-explicar
  el estado del proyecto en cada sesión porque no hay memoria persistente
  ligada a la rama.

Branchpoint expone herramientas MCP que permiten al agente leer y escribir
un resumen de contexto asociado a la rama Git activa en el momento, de forma
que cambiar de rama cambia automáticamente el contexto relevante.

Modelo de negocio: **open-core**. El núcleo vive en GitHub como pieza de
portfolio técnico. Funcionalidades avanzadas (equipos, sync remoto, etc.)
se venderán como versión comercial en Gumroad. Esta decisión de negocio no
debe condicionar decisiones técnicas del núcleo open-source salvo que se
discuta explícitamente.

## Stack decidido

**No cambiar estas decisiones sin discutirlo primero.**

- **Node 22 LTS** — runtime.
- **TypeScript en modo strict, ESM puro** (`"type": "module"`, `module` /
  `moduleResolution`: `NodeNext`).
- **`@modelcontextprotocol/sdk` v1** (actualmente `1.29.0`, fijada sin `^`
  en `package.json`) — transporte **stdio**. Explícitamente NO la v2 beta.
- **Zod v4** — validación de esquemas de las tools MCP.
- **tsdown** como bundler — NO `tsup`, que está sin mantener.
- **pnpm** como gestor de paquetes.
- **Biome** — lint + format (sustituye a ESLint + Prettier).
- **Vitest** — testing.
- **`@modelcontextprotocol/inspector`** — herramienta de testing manual del
  servidor MCP (se instalará/usará vía `npx` cuando toque probar, no es
  dependencia del proyecto).

Nota de instalación: `tsdown` fija como peer dependency `typescript ^5 ||
^6`. TypeScript 7 (el nuevo compilador nativo) ya es la versión `latest` en
npm pero rompe esa peer dependency, así que el proyecto fija
`typescript@^6.0.3` explícitamente hasta que tsdown soporte TS 7.

Nota de build: por defecto `tsdown` emite `dist/index.mjs`. Se añadió
`tsdown.config.mjs` con `outExtensions` para forzar `dist/index.js` (más
cómodo para invocar el servidor, y ya es ESM real gracias a `"type":
"module"` en `package.json`). El loader de config por defecto de tsdown
0.22.4 depende de un paquete `unrun` que no está instalado y rompe al
cargar cualquier config file (`.ts` o `.mjs` por igual); el script `build`
usa `--config-loader native` para evitarlo.

## Reglas críticas

1. **NUNCA usar `console.log`.** El transporte stdio usa stdout como canal
   JSON-RPC del protocolo MCP. Cualquier escritura a stdout que no sea un
   mensaje JSON-RPC válido rompe la comunicación con el cliente (Claude
   Code, Cursor, etc.). Todo logging de depuración va a **stderr**
   (`console.error`, o un logger configurado explícitamente hacia stderr).

2. **Cada sesión de trabajo (~1h) termina en un commit que compila.** No se
   deja código a medias entre sesiones. Antes de cerrar una sesión: build
   limpio (`tsc` / `tsdown`) sin errores y commit hecho.

3. **Antes de implementar cualquier decisión arquitectónica, explicar
   brevemente el porqué antes de escribir código.** El usuario está
   aprendiendo MCP en profundidad y quiere entender el razonamiento, no solo
   recibir el resultado.

## Estado del proyecto

- **Fase 0 — completada.** Entorno, stack y contexto documentado:
  - Git y Node 22 verificados, pnpm instalado.
  - Proyecto inicializado (`pnpm init`), ESM configurado.
  - Dependencias de producción: `@modelcontextprotocol/sdk@1.29.0`, `zod`.
  - Dependencias de desarrollo: `typescript@^6.0.3`, `@types/node`,
    `tsdown`, `vitest`, `@biomejs/biome`.
  - `tsconfig.json` en modo strict ESM (NodeNext).
  - `.gitignore` (`node_modules`, `dist`, `.env`).
  - Carpeta `src/` creada, vacía.

- **Fase 1 — completada.** Walking skeleton funcionando:
  - `src/index.ts`: `McpServer` con tool `ping` (input `message: string`
    validado con Zod), transporte `StdioServerTransport`.
  - Script `build` (`tsdown --config-loader native`) genera `dist/index.js`.
  - Verificado end-to-end con `@modelcontextprotocol/inspector --cli`:
    `tools/list` anuncia `ping` con el JSON Schema generado desde Zod, y
    `tools/call` devuelve `Pong: <mensaje>` correctamente.
  - Auditado: `src/index.ts` no contiene ningún `console.log` ni escritura
    directa a stdout.

- **Siguiente — Fase 2.** Por definir con el usuario: probablemente
  detección de la rama Git activa y primera lectura/escritura en
  `.git/branchpoint/`.
