# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/)
y el proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

## [0.2.0] - 2026-07-11

### Added

- CLI para humanos con subcomandos: `branchpoint status` (panel con rama
  activa, contexto guardado y divergencia), `branchpoint list` (tabla de
  ramas con contexto, la más reciente primero) y `branchpoint context
  [rama]` (contenido completo del contexto).
- Flag `--json` en los tres subcomandos: salida cruda sin colores ni
  cajas, pensada para scripts y CI.
- Modo interactivo con menú (`branchpoint` sin argumentos en una
  terminal): ver contexto de la rama activa, listar ramas guardadas y
  guardar un resumen. `Ctrl+C` sale limpiamente con exit code 0.
- Dispatcher de modos en el entry point: sin argumentos y sin TTY sigue
  arrancando el servidor MCP exactamente igual que antes (es como lo
  lanzan Claude Code, Cursor, etc.).
- Test de regresión del protocolo MCP: ejecuta el `dist/index.js`
  compilado como proceso hijo sin TTY y verifica el handshake
  `initialize` JSON-RPC por stdout.

- Documentación completa en inglés: `README.md` (documento principal,
  con configuración MCP verificada para Claude Code, Claude Desktop,
  Cursor, Cline y VS Code), `ARCHITECTURE.md` (diagrama de flujo de
  datos, responsabilidad por fichero, stack y decisiones no obvias).
  `README.es.md` con la versión española completa, enlazado desde
  `README.md`.
- Sanitización determinista de nombres de rama hostiles para Windows
  (`CON`, `NUL`, ramas terminadas en punto o espacio) al persistir
  contexto, con codificación reversible y guardia de contención de
  rutas.
- Soporte para git worktrees y submódulos: el almacén de contextos
  ahora vive en el directorio `.git` COMPARTIDO (`git
  rev-parse --git-common-dir`), no en uno construido a mano que
  fallaba cuando `.git` es un fichero puntero.
- Límite de tamaño (50.000 caracteres) y rechazo de resúmenes vacíos en
  `save_branch_context`, con mensaje accionable en vez de guardar un
  fichero vacío o un volcado accidental.
- Integración de Biome como linter/formateador (`biome.json`, scripts
  `lint`/`format`, paso de lint en CI antes del build).

### Fixed

- **Crash del modo interactivo** al pulsar Enter con el campo de
  resumen vacío: `@clack/prompts` entrega `undefined` (no `""`) para un
  campo vacío, y el `validate` inline hacía `.trim()` sobre ello sin
  comprobarlo, mostrando un stack trace de Node al usuario. La
  validación ahora vive en `validators.ts`, con tests explícitos para
  `undefined`, `""` y cadenas de solo espacios.
- Estética Unicode inconsistente del modo interactivo en terminales
  modernas de Windows (paneles con bordes ASCII `+---|` mientras
  `status` mostraba bordes Unicode `╭─╮` en la misma terminal): causado
  por la detección conservadora de soporte Unicode de `@clack/prompts`.
- `get_branch_context`, `save_branch_context`, `status`, `list`,
  `context` y el modo interactivo ya no fallan con HEAD desacoplado
  (checkout de un commit suelto, rebase a medias): reportan el estado
  con un mensaje claro en vez de intentar escribir un fichero de
  contexto sin nombre de rama.
- Los mismos comandos degradan con elegancia en un repositorio recién
  creado sin commits todavía, en vez de propagar el fallo de `git log`.
- `git.ts` migrado de `execSync` con comandos interpolados a
  `execFileSync` con argumentos en array, cerrando un vector de
  inyección de comandos vía nombres de rama con `` `$(...)` `` o
  backticks (refs válidas en git).

### Changed

- La versión que anuncia el servidor MCP en el handshake ahora se lee de
  `package.json` en vez de estar hardcodeada.
- El script `test` compila antes de ejecutar los tests, para que el test
  de regresión corra siempre contra el artefacto real.
- Las descripciones de las tools MCP, la ayuda de la CLI (`--help`) y
  los mensajes del modo interactivo están ahora en inglés (audiencia
  global: npm, GitHub, y las tools MCP las leen LLMs de todo el mundo).

## [0.1.0] - 2026-07-09

### Added

- Servidor MCP local por stdio con las tools `get_branch_context`,
  `save_branch_context` y `ping` (diagnóstico).
- Persistencia de resúmenes de contexto por rama Git en
  `.git/branchpoint/<rama>.md`, respetando subcarpetas para ramas con
  `/` en el nombre.
- Enriquecimiento automático del contexto vía Git: divergencia respecto
  a la rama principal (commits desde el merge-base + `diff --stat`) y
  últimos 10 commits.
- Suite de tests con Vitest, CI con GitHub Actions y paquete preparado
  para npm (`bin`, shebang, `files`).

[Unreleased]: https://github.com/Caarlosgg/branchpoint/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Caarlosgg/branchpoint/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Caarlosgg/branchpoint/releases/tag/v0.1.0
