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

- **Siguiente — Fase 1: walking skeleton.** Implementar un servidor MCP
  mínimo con una única tool `ping` expuesta vía transporte stdio, y
  verificar la conexión end-to-end con Claude Code. Objetivo de esta fase:
  validar que el esqueleto del servidor arranca, responde correctamente al
  handshake MCP y que no hay ninguna escritura accidental a stdout que
  rompa el protocolo.
