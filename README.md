# Branchpoint

![CI](https://github.com/Caarlosgg/branchpoint/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)

Branchpoint da memoria persistente por rama Git a tu flujo de trabajo: los
agentes de IA la usan como servidor MCP para no mezclar contexto entre ramas,
y tú la usas como CLI para ver de un vistazo qué se estaba haciendo en cada
rama. Un solo binario, dos caras: el mismo `.git/branchpoint/` alimenta a ambas.

```bash
# Para tu agente (Claude Code):
claude mcp add branchpoint -- npx -y branchpoint

# Para ti:
npx branchpoint status
```

## El problema

Cuando un agente IA (Claude Code, Cursor, Cline...) trabaja en un
repositorio con varias ramas activas, no tiene memoria de qué se decidió o
se hizo en cada rama. Esto provoca dos síntomas habituales:

- **Alucinación cruzada de ramas**: el agente mezcla contexto de código o
  decisiones de una rama con el trabajo actual en otra.
- **Desperdicio de tokens**: el agente tiene que re-explorar y re-explicar
  el estado del proyecto en cada sesión porque no hay memoria persistente
  ligada a la rama.

Y el mismo problema lo tienes tú al volver a una rama tras una semana:
¿en qué se había quedado esto?

## Cómo funciona

Branchpoint detecta la rama Git activa y persiste resúmenes de contexto por
rama en `.git/branchpoint/<rama>.md`. Al leer el contexto, lo enriquece
automáticamente con información derivada de Git (commits recientes,
divergencia respecto a la rama principal), de forma que cambiar de rama
cambia automáticamente el contexto relevante.

El mismo ejecutable decide su modo según cómo lo lances:

- **Sin argumentos, con pipes** (así lo lanza un cliente MCP) → servidor
  MCP por stdio.
- **Con argumentos** → CLI con subcomandos (`status`, `list`, `context`).
- **Sin argumentos, en una terminal** → modo interactivo con menú.

## Para agentes IA (servidor MCP)

Registra el servidor en Claude Code sin instalación previa:

```bash
claude mcp add branchpoint -- npx -y branchpoint
```

### Tools disponibles

#### `get_branch_context`

Sin parámetros. Devuelve el resumen manual guardado para la rama activa
(o un aviso claro si no hay ninguno) combinado con contexto enriquecido
derivado de Git: divergencia respecto a la rama principal (commits desde
el merge-base + `diff --stat`, omitida si no hay rama principal detectada
o si ya estás en ella) y los últimos 10 commits.

Ejemplo de salida real en una rama con contexto guardado y 2 commits de
divergencia:

```markdown
## Resumen guardado

Implementando el flujo de login con OAuth. Falta manejar el refresh token.

## Divergencia respecto a main

2 commits desde el punto común con `main`.

 src/auth.ts | 45 +++++++++++++++++++++++++++++++++++++++++++++
 src/login.ts | 12 ++++++------
 2 files changed, 51 insertions(+), 6 deletions(-)

## Últimos 10 commits

- a1b2c3d feat: añadir manejo de refresh token
- e4f5g6h feat: flujo inicial de login OAuth
...
```

#### `save_branch_context`

Parámetro `summary: string`. Guarda un resumen manual de contexto para la
rama activa, que persiste en `.git/branchpoint/<rama>.md` y se combina con
el enriquecimiento automático en la siguiente lectura.

> `ping` existe como tool de diagnóstico interno para verificar que el
> servidor MCP responde correctamente, no es una feature del producto.

## Para humanos (CLI)

Los mismos datos que ve tu agente, en tu terminal. Todos los subcomandos
aceptan `--json` para salida cruda sin colores ni cajas (scripts, CI).

### `branchpoint status`

Rama activa, si tiene contexto guardado y divergencia respecto a la rama
principal:

```
╭────────────────────── branchpoint ───────────────────────╮
│  Rama activa:  feature/oauth-login                       │
│  Contexto:    guardado (actualizado 2026-07-11 18:30)    │
│  Divergencia: 2 commit(s) desde el punto común con main  │
╰──────────────────────────────────────────────────────────╯
```

Con `--json`:

```json
{
  "branch": "feature/oauth-login",
  "hasContext": true,
  "updatedAt": "2026-07-11T16:30:00.000Z",
  "defaultBranch": "main",
  "divergence": {
    "baseBranch": "main",
    "commitCount": 2
  }
}
```

### `branchpoint list`

Todas las ramas con contexto guardado, la más reciente primero:

```
┌─────────────────────┬──────────────────┬──────────────────────────────────────────────────────────────┐
│ Rama                │ Actualizado      │ Resumen                                                      │
├─────────────────────┼──────────────────┼──────────────────────────────────────────────────────────────┤
│ feature/oauth-login │ 2026-07-11 18:30 │ Implementando el flujo de login con OAuth. Decidido usar…    │
├─────────────────────┼──────────────────┼──────────────────────────────────────────────────────────────┤
│ main                │ 2026-07-10 09:14 │ Rama estable. Ultima release: v1.2.0. No tocar hasta cerrar… │
└─────────────────────┴──────────────────┴──────────────────────────────────────────────────────────────┘
```

### `branchpoint context [rama]`

El contexto completo de una rama (por defecto, la activa):

```
feature/oauth-login — actualizado 2026-07-11 18:30

Implementando el flujo de login con OAuth. Decidido usar PKCE en vez de client secret. Falta manejar la expiracion del refresh token.
```

### Modo interactivo

`branchpoint` sin argumentos en una terminal abre un menú para ver el
contexto de la rama activa, listar todas las ramas guardadas o guardar un
resumen nuevo, sin memorizar subcomandos. `Ctrl+C` sale limpiamente en
cualquier momento.

## Stack

- Node 22 LTS
- TypeScript en modo strict, ESM puro
- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) v1, transporte stdio
- Zod v4 para validación de esquemas
- Commander, picocolors, cli-table3, boxen y @clack/prompts para la CLI
- tsdown como bundler
- Vitest para testing

## Instalación desde el código fuente

Para quien quiera tocar el código:

```bash
git clone https://github.com/Caarlosgg/branchpoint.git
cd branchpoint
pnpm install
pnpm build
```

Y registrar el servidor apuntando a la ruta absoluta del build:

```bash
claude mcp add branchpoint -- node /ruta/absoluta/a/branchpoint/dist/index.js
```

## Estado del proyecto

**Hecho:**

- Fase 0 — entorno, stack y contexto documentado.
- Fase 1 — walking skeleton MCP con tool `ping`.
- Fase 2 — detección de rama activa y persistencia de contexto por rama en
  `.git/branchpoint/`.
- Fase 3 — suite de tests con Vitest (aislamiento por rama incluido).
- Fase 4 — enriquecimiento automático de contexto vía `git log`/`diff`
  (divergencia respecto a la rama principal, commits recientes).
- Fase 5 — publicación del repositorio en GitHub.
- Fase 6 — CI con GitHub Actions.
- Fase 7 — paquete preparado para publicación en npm (`bin`, shebang,
  metadatos).
- Fase 8 — herramienta de doble cara: CLI con subcomandos (`status`,
  `list`, `context`, `--json`) y modo interactivo, con test de regresión
  que garantiza que el modo servidor MCP queda intacto.
- 25 tests cubriendo `git.ts`, `storage.ts`, `queries.ts` y la regresión
  del protocolo MCP contra el build real.

**Roadmap:**

- Publicación en npm (paquete ya preparado, pendiente de `npm publish`).
- Versión comercial (equipos, sync remoto) sobre el mismo núcleo open-source.

## Licencia

[MIT](./LICENSE)
