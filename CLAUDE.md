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

- **Fase 2 — completada.** Detección de rama activa y persistencia de
  contexto por rama:
  - `src/git.ts`: `getRepoRoot()` (`git rev-parse --show-toplevel`) y
    `getCurrentBranch()` (`git branch --show-current`), ambas vía
    `execSync` de `node:child_process` (sin `simple-git` ni otras
    dependencias), lanzando errores descriptivos si el comando falla.
  - `src/storage.ts`: `getContextPath(branch)`, `saveContext(branch,
    content)` y `readContext(branch)`, todo bajo
    `<repoRoot>/.git/branchpoint/<branch>.md`. Las ramas con `/` (ej.
    `feature/login-fix`) se guardan respetando la subcarpeta, igual que
    `refs/heads/`, no aplanadas.
  - `src/index.ts` registra dos tools nuevas además de `ping`:
    `get_branch_context` (sin parámetros; si no hay contexto guardado
    responde con un mensaje claro, no un error) y
    `save_branch_context` (parámetro `summary: string` con descripción
    orientada a que un LLM sepa cuándo usarla).
  - Verificado con `@modelcontextprotocol/inspector --cli` (instalado
    temporalmente como devDependency para evitar el conflicto de
    `devEngines` de npx con pnpm, y desinstalado después de probar):
    ciclo `save_branch_context` → `get_branch_context` devuelve el
    mismo contenido.
  - Verificado aislamiento por rama: se creó la rama `test/aislamiento`,
    se guardó un contexto distinto ahí, se volvió a `master` y
    `get_branch_context` devolvió el contexto de `master`, no el de la
    rama de prueba. Rama de prueba borrada tras la verificación.

- **Fase 3 — completada.** Suite de tests con Vitest:
  - `src/git.test.ts`: `getRepoRoot()` y `getCurrentBranch()` probadas
    contra el repo real (son wrappers finos sobre Git, mockear
    `execSync` sería menos honesto que verificar el comando real).
  - `src/storage.test.ts`: aislado por completo del `.git/branchpoint/`
    real del proyecto, usando un directorio temporal por test
    (`mkdtempSync` + `os.tmpdir()`, limpiado en `afterEach`) y
    `vi.spyOn` sobre `getRepoRoot()` para que `storage.ts` opere
    sobre ese directorio falso. Incluye test de aislamiento entre
    ramas (versión automatizada de lo verificado a mano en Fase 2).
  - Script `"test": "vitest run"` añadido a `package.json`.

- **Fase 4 — completada.** Enriquecimiento automático de contexto vía
  Git:
  - `src/git.ts` añade `getDefaultBranch()` (detecta `main`/`master`
    local vía `git show-ref --verify --quiet`, devuelve `null` si
    ninguna existe — no debe romper en repos sin convención),
    `getMergeBase(branchA, branchB)` (devuelve el hash común o `null`
    si no hay historia compartida), `getRecentCommits(limit = 10)` y
    `getDiffStat(fromRef, toRef = "HEAD")`. Se añadió también
    `getCommitCountSince(fromRef, toRef = "HEAD")` (vía
    `git rev-list --count`), no pedida explícitamente pero necesaria
    para contar commits desde el merge-base sin sobrecargar
    `getRecentCommits`.
  - `get_branch_context` ahora devuelve una respuesta combinada en
    markdown compacto: resumen manual guardado (o mensaje claro si no
    hay), sección de divergencia respecto a la rama principal (commits
    desde el merge-base + `diff --stat`) solo si hay rama principal
    detectada y no es la rama activa, y los últimos 10 commits. La
    sección de divergencia se omite sin error si no hay rama principal
    o si estamos parados en ella.
  - Tests en `git.test.ts` para las cuatro funciones nuevas contra el
    repo real, incluyendo un caso con rama temporal y commit trivial
    para verificar `getMergeBase`/`getCommitCountSince`/`getDiffStat`
    con divergencia real (rama borrada tras el test).
  - Verificado a mano con Inspector: `get_branch_context` en `master`
    omite la sección de divergencia; en una rama de prueba con 2
    commits muestra la sección completa con el diff-stat correcto.

- **Siguiente — Fase 5.** Por definir con el usuario.
