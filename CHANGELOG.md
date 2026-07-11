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

### Changed

- La versión que anuncia el servidor MCP en el handshake ahora se lee de
  `package.json` en vez de estar hardcodeada.
- El script `test` compila antes de ejecutar los tests, para que el test
  de regresión corra siempre contra el artefacto real.

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
