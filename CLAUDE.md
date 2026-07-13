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

1. **stdout es sagrado en el camino MCP.** El transporte stdio usa stdout
   como canal JSON-RPC del protocolo MCP. En el camino servidor
   (`src/server.ts` y todo lo que este cargue) cualquier escritura a
   stdout que no sea un mensaje JSON-RPC válido rompe la comunicación con
   el cliente (Claude Code, Cursor, etc.); todo logging de depuración va
   a **stderr**. Matiz desde la Fase 8: la regla aplica al CAMINO MCP; en
   el camino CLI/interactivo (`src/cli.ts`, `src/interactive.ts`) stdout
   es precisamente el producto y se imprime con libertad. El dispatcher
   (`src/index.ts`) usa imports dinámicos para que el proceso en modo MCP
   nunca llegue a cargar código CLI, y `src/mcp-regression.test.ts`
   verifica el handshake MCP contra el build real en cada `pnpm test`.

2. **Cada sesión de trabajo (~1h) termina en un commit que compila.** No se
   deja código a medias entre sesiones. Antes de cerrar una sesión: build
   limpio (`tsc` / `tsdown`) sin errores y commit hecho.

3. **Antes de implementar cualquier decisión arquitectónica, explicar
   brevemente el porqué antes de escribir código.** El usuario está
   aprendiendo MCP en profundidad y quiere entender el razonamiento, no solo
   recibir el resultado.

4. **Toda función `validate`/callback que se pase a librerías de UI
   (@clack/prompts, Commander...) debe ser una función nombrada, exportada
   desde un módulo testeable (`src/validators.ts`) y con tests propios —
   nunca una arrow inline imposible de testear.** Origen: en la Fase 9 un
   `validate` inline hizo `value.trim()` asumiendo string, pero
   @clack/prompts entrega `undefined` con el campo vacío → crash con stack
   trace en la cara del usuario. Los callbacks de UI son el punto ciego de
   los tests; cada uno debe cubrir explícitamente `undefined`/vacío.

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

- **Fase 5 — completada.** Publicación en GitHub como repo público de
  portfolio:
  - `LICENSE` (MIT, 2026, Carlos) y `README.md` (problema, cómo
    funciona, tools disponibles con ejemplo real de salida, stack,
    instalación, estado del proyecto).
  - Repo creado y publicado con
    `gh repo create branchpoint --public --source=. --remote=origin --push`.
  - Descripción y topics (`mcp`, `model-context-protocol`,
    `ai-agents`, `developer-tools`, `git`) añadidos vía `gh repo edit`.

- **Fase 6 — completada.** CI con GitHub Actions:
  - `.github/workflows/ci.yml`: job `test` en `ubuntu-latest`
    (checkout, `pnpm/action-setup`, `actions/setup-node` con Node 22
    y cache de pnpm, `pnpm install --frozen-lockfile`, `pnpm build`,
    `pnpm test`) en push y pull_request sobre cualquier rama.
  - Badges de CI, licencia y versión de Node añadidos al README.
  - El primer run falló: `git.test.ts` ejecuta un `git commit` real
    dentro del repo y el runner de GitHub Actions no tiene
    `user.name`/`user.email` configurados globalmente (a diferencia
    del entorno local). Arreglado pasando la identidad solo a ese
    comando (`git -c user.name=... -c user.email=... commit ...`) en
    vez de tocar configuración global de git.
  - Verificado con `gh run watch`: CI en verde, 13 tests pasan.

- **Fase 7 — completada.** Paquete preparado para publicación en npm:
  - `package.json`: `version` bajado a `0.1.0` (por debajo de 1.0
    porque la API de tools puede cambiar todavía), `description`,
    `keywords`, `license: "MIT"`, `author: "Caarlosgg"`,
    `repository`/`homepage`/`bugs` apuntando al repo de GitHub,
    `engines.node: ">=22"`, `bin.branchpoint` apuntando a
    `./dist/index.js` (permite ejecución vía `npx`), y `files:
    ["dist"]` para que el paquete publicado no incluya `src/`, tests,
    `.claude/` ni `CLAUDE.md`.
  - `tsdown.config.mjs` añade `banner: { js: "#!/usr/bin/env node" }`
    para inyectar el shebang automáticamente en cada build en vez de
    escribirlo a mano en el fuente. tsdown además concede permiso de
    ejecución a `dist/index.js` automáticamente al buildear.
  - README actualizado: instalación vía `npx` como método principal,
    clonar + compilar como alternativa para quien quiera tocar el
    código.
  - `npm publish` NO se ha ejecutado todavía — pendiente de que el
    usuario lo haga a mano (requiere 2FA interactivo).

- **Fase 8 — completada.** Herramienta de doble cara (servidor MCP +
  CLI para humanos), versión 0.2.0:
  - `src/index.ts` es ahora un dispatcher mínimo: con argumentos →
    CLI (Commander); sin argumentos con TTY → modo interactivo; sin
    argumentos sin TTY → servidor MCP (camino por defecto, el que usan
    los clientes MCP existentes). Imports dinámicos a propósito: el
    modo MCP nunca carga código CLI ni sus dependencias.
  - `src/server.ts`: toda la lógica MCP anterior movida a
    `runMcpServer()`, sin cambios de comportamiento salvo que la
    versión del handshake se lee ahora de `package.json` vía
    `src/version.ts` en vez de estar hardcodeada.
  - `src/mcp-regression.test.ts`: ejecuta `dist/index.js` compilado
    como proceso hijo con pipes (sin TTY) y sin argumentos, envía un
    `initialize` JSON-RPC crudo y verifica el handshake por stdout.
    Requiere build previo: el script `test` es ahora
    `pnpm build && vitest run` para correr siempre contra el
    artefacto real.
  - CLI en dos capas: `src/queries.ts` (funciones puras que devuelven
    objetos planos tipados: `getStatusData()`, `getBranchList()`,
    `getContextData(branch?)`; testeadas con el patrón de directorio
    temporal + `vi.spyOn`) y `src/cli.ts` (Commander + presentación
    con picocolors/boxen/cli-table3; sin tests de asserts). Tres
    subcomandos — `status`, `list`, `context [branch]` — todos con
    `--json`. Sin contexto guardado NO es error (gris neutro +
    invitación); rojo solo para errores reales con mensaje accionable.
    Nota: cli-table3 no respeta `NO_COLOR` por sí solo; el color del
    borde de la tabla se apaga a mano con `pc.isColorSupported`.
  - `src/interactive.ts`: menú con `@clack/prompts` (ver contexto,
    listar ramas, guardar resumen, salir), en bucle hasta salir.
    Cancelación con Ctrl+C/`isCancel()` → salida limpia, exit code 0.
    Reutiliza `queries.ts`/`storage.ts`.
  - Release 0.2.0: README reestructurado con secciones separadas para
    agentes (MCP) y humanos (CLI, con salidas reales capturadas),
    `CHANGELOG.md` (Keep a Changelog) incluido también en el tarball
    de npm (npm no lo auto-incluye y pesa ~2 kB), `version: 0.2.0`.
    Verificado con `pnpm pack --dry-run`: el tarball contiene solo
    `dist/`, `CHANGELOG.md`, `LICENSE`, `README.md`, `package.json`.
  - Dependencias nuevas de producción: `commander`, `picocolors`,
    `cli-table3`, `boxen`, `@clack/prompts`.
  - `npm publish` de 0.2.0 NO ejecutado — lo hace el usuario a mano.

- **Fase 9 — completada.** Auditoría externa de robustez, código
  autodocumentado y release comercial de la 0.2.0 (versión NO subida,
  todo se pliega en la 0.2.0 aún no publicada):
  - **Bloque 0 (bug crítico):** el modo interactivo crasheaba con stack
    trace al guardar un resumen vacío — `@clack/prompts` entrega
    `undefined` (no `""`) y el `validate` inline hacía `.trim()` sin
    comprobarlo. Arreglado extrayendo la validación a
    `src/validators.ts` (`validateSummary`, con `MAX_SUMMARY_CHARS =
    50_000`), testeado explícitamente para `undefined`/`""`/espacios.
    Regla 4 añadida (ver arriba). También arreglada la estética Unicode
    inconsistente del modo interactivo en Windows Terminal (`@clack`
    detecta soporte Unicode vía variables de entorno de forma
    conservadora; `index.ts` planta `WT_SESSION` antes del import
    dinámico de `interactive.js` cuando hace falta).
  - **Bloque 1 (auditoría de robustez):** `git.ts` migrado de
    `execSync` con strings interpolados a `execFileSync` con arrays
    (cierra inyección de comandos vía nombres de rama con backticks o
    `$(...)`). `getCurrentBranch()` devuelve `string | null` (HEAD
    desacoplado ya no se confunde con cadena vacía); `hasCommits()`
    nueva para repos recién `git init`. Todos los caminos (MCP, CLI,
    interactivo) degradan con mensaje claro en detached HEAD y repo sin
    commits, nunca crashean. `storage.ts` usa `git rev-parse
    --git-common-dir` (no `<repoRoot>/.git` a mano) para funcionar en
    worktrees/submódulos, donde `.git` es un fichero puntero. Nombres
    de rama hostiles a Windows (`CON`, `NUL`, terminados en punto o
    espacio) se sanitizan con percent-encoding determinista y
    reversible (`sanitizeBranchForFs`/`decodeBranchFromFs`), más una
    comprobación defensiva de contención de rutas en
    `getContextPath()`. `save_branch_context` valida resumen vacío y
    límite de tamaño reusando `validators.ts`. Biome integrado de
    verdad (`biome.json`, scripts `lint`/`format`, paso `Lint` en CI
    antes del build).
  - **Bloque 2 (código autodocumentado):** todo `src/` documentado en
    inglés (cabeceras de fichero, JSDoc en funciones exportadas,
    comentarios inline solo donde el porqué no es obvio). Creado
    `ARCHITECTURE.md` en inglés: diagrama de flujo, tabla de
    responsabilidad por fichero, stack con el porqué de cada pieza,
    filosofía de testing, registro de decisiones no obvias.
  - **Bloque 3 (README global):** `README.md` reescrito en inglés como
    documento principal (audiencia global de npm/GitHub);
    `README.es.md` con la versión española completa, enlazados entre
    sí. Configuración MCP documentada por cliente (Claude Code, Claude
    Desktop, Cursor, Cline, VS Code — investigada y verificada, con
    nota honesta para clientes no listados). Traducidas a inglés las
    descripciones de las tools MCP, el `--help` de Commander y los
    mensajes del modo interactivo (las tools las leen LLMs de todo el
    mundo). `CLAUDE.md` se queda en español (documento interno).
  - **Bloque 4 (limpieza):** borrado el contexto residual local de la
    rama `test/aislamiento` (Fase 2, rama ya no existe) del almacén de
    este repo — cambio de estado local, no committeado. Detección de
    contextos huérfanos NO implementada esta fase; queda anotada en el
    roadmap de ambos README como mejora futura.
  - **Bloque 5 (verificación final):** `pnpm lint && pnpm build &&
    pnpm test` en verde (51 tests). `pnpm pack --dry-run` confirma
    tarball con `dist/`, `README.md`, `README.es.md`, `CHANGELOG.md`,
    `LICENSE`, `package.json` — `ARCHITECTURE.md` deliberadamente
    fuera (documento para quien toca el código, no para quien solo
    instala el paquete; ya es público en GitHub). Simulación de
    usuario nuevo desde directorio temporal fuera del repo: los tres
    modos (subcomandos, `--json`, handshake MCP crudo por pipes) y los
    casos límite auditados (detached HEAD, repo sin commits) verificados
    contra el binario compilado real, no solo contra tests unitarios.
  - Reglas nuevas adoptadas de forma permanente: validators testeables
    (regla 4), sanitización determinista de nombres de rama, uso de
    `git-common-dir` en vez de `<repoRoot>/.git` a mano.
  - `npm publish` de 0.2.0 sigue SIN ejecutar — pendiente de prueba
    manual del usuario.

- **Siguiente — Fase 10.** Por definir con el usuario.
