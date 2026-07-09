# Branchpoint

![CI](https://github.com/Caarlosgg/branchpoint/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)

Servidor MCP local que da a los agentes de IA memoria persistente y
consciente de la rama Git activa.

## El problema

Cuando un agente IA (Claude Code, Cursor, Cline...) trabaja en un
repositorio con varias ramas activas, no tiene memoria de qué se decidió o
se hizo en cada rama. Esto provoca dos síntomas habituales:

- **Alucinación cruzada de ramas**: el agente mezcla contexto de código o
  decisiones de una rama con el trabajo actual en otra.
- **Desperdicio de tokens**: el agente tiene que re-explorar y re-explicar
  el estado del proyecto en cada sesión porque no hay memoria persistente
  ligada a la rama.

## Cómo funciona

Branchpoint es un servidor [MCP (Model Context Protocol)](https://modelcontextprotocol.io)
que corre localmente vía stdio. Detecta la rama Git activa del repositorio
del usuario y persiste resúmenes de contexto por rama en
`.git/branchpoint/<rama>.md`. Al leer el contexto, lo enriquece
automáticamente con información derivada de Git (commits recientes,
divergencia respecto a la rama principal), de forma que cambiar de rama
cambia automáticamente el contexto relevante que ve el agente.

## Tools disponibles

### `get_branch_context`

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

### `save_branch_context`

Parámetro `summary: string`. Guarda un resumen manual de contexto para la
rama activa, que persiste en `.git/branchpoint/<rama>.md` y se combina con
el enriquecimiento automático en la siguiente lectura.

> `ping` existe como tool de diagnóstico interno para verificar que el
> servidor MCP responde correctamente, no es una feature del producto.

## Stack

- Node 22 LTS
- TypeScript en modo strict, ESM puro
- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) v1, transporte stdio
- Zod v4 para validación de esquemas
- tsdown como bundler
- Vitest para testing

## Instalación

Branchpoint todavía no está publicado en npm. Para probarlo localmente:

```bash
git clone https://github.com/Caarlosgg/branchpoint.git
cd branchpoint
pnpm install
pnpm build
```

Después, registra el servidor en Claude Code apuntando a la ruta absoluta
del build:

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
- 13 tests cubriendo `git.ts` y `storage.ts`.

**Roadmap:**

- Publicación en npm.
- Versión comercial (equipos, sync remoto) sobre el mismo núcleo open-source.

## Licencia

[MIT](./LICENSE)
