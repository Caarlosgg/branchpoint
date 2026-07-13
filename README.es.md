# Branchpoint

**[English](README.md) | [Español](README.es.md)**

![CI](https://github.com/Caarlosgg/branchpoint/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)

Branchpoint da memoria persistente por rama a tu flujo de trabajo con Git.
Los agentes de IA lo usan como servidor MCP para dejar de mezclar contexto
entre ramas; tú lo usas como CLI para ver de un vistazo qué se estaba
haciendo en cada rama. Un solo binario, dos caras: el mismo almacén
`.git/branchpoint/` alimenta a ambas.

```bash
# Para tu agente (Claude Code):
claude mcp add branchpoint -- npx -y branchpoint

# Para ti:
npx branchpoint status
```

> Nota: la interfaz del producto (descripciones de las tools MCP, ayuda de
> la CLI, mensajes del modo interactivo) está en inglés — npm y GitHub son
> audiencias globales y las tools MCP las leen LLMs de todo el mundo. Este
> README explica todo en español, pero los bloques de código muestran la
> salida REAL del programa, que es en inglés.

## El problema

Cuando un agente de IA (Claude Code, Cursor, Cline...) trabaja en un
repositorio con varias ramas activas, no tiene memoria de qué se decidió o
se hizo en cada una. Esto provoca dos síntomas habituales:

- **Alucinación cruzada de ramas**: el agente mezcla contexto de código o
  decisiones de una rama con el trabajo actual en otra.
- **Desperdicio de tokens**: el agente tiene que re-explorar y
  re-explicar el estado del proyecto en cada sesión, porque nada
  persistente quedó ligado a la rama.

Y el mismo problema lo sufres tú al volver a una rama una semana después:
¿en qué se había quedado esto?

## Cómo funciona

Branchpoint detecta la rama Git activa y persiste resúmenes de contexto
por rama en `.git/branchpoint/<rama>.md`. Al leer el contexto, se enriquece
automáticamente con información extraída de Git (commits recientes,
divergencia respecto a la rama principal), de forma que cambiar de rama
cambia automáticamente el contexto relevante.

El mismo ejecutable elige su modo según cómo se lance:

- **Sin argumentos, con stdio en pipe** (así lo lanza un cliente MCP) →
  servidor MCP por stdio.
- **Con argumentos** → CLI con subcomandos (`status`, `list`, `context`).
- **Sin argumentos, en una terminal** → modo interactivo con menú.

Consulta [ARCHITECTURE.md](ARCHITECTURE.md) (en inglés) para el diseño
completo: flujo de datos, responsabilidad de cada fichero, el stack y por
qué se eligió cada pieza, y la filosofía de testing.

## Para agentes IA (servidor MCP)

### Claude Code

```bash
claude mcp add branchpoint -- npx -y branchpoint
```

### Claude Desktop

Añade esto a `claude_desktop_config.json` (macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`,
Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "branchpoint": {
      "command": "npx",
      "args": ["-y", "branchpoint"]
    }
  }
}
```

### Cursor

Añade esto a `.cursor/mcp.json` (a nivel de proyecto) o a
`~/.cursor/mcp.json` (global — Cursor usa el mismo formato que Claude
Desktop):

```json
{
  "mcpServers": {
    "branchpoint": {
      "command": "npx",
      "args": ["-y", "branchpoint"]
    }
  }
}
```

### Cline

Añade esto al fichero de configuración MCP de Cline (almacenamiento
global de VS Code —
`.../globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`,
accesible desde el menú "Configure MCP Servers" de Cline):

```json
{
  "mcpServers": {
    "branchpoint": {
      "command": "npx",
      "args": ["-y", "branchpoint"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### VS Code (modo agente)

Añade esto a `.vscode/mcp.json` en tu workspace. Ojo: la clave de nivel
superior es `servers`, no `mcpServers` como en los clientes anteriores:

```json
{
  "servers": {
    "branchpoint": {
      "command": "npx",
      "args": ["-y", "branchpoint"]
    }
  }
}
```

Las tools MCP solo están disponibles en modo agente — son invisibles en
modo Ask o Edit.

> Cualquier otro cliente MCP no listado aquí debería funcionar igual: es
> un servidor stdio estándar lanzado con `npx -y branchpoint` (o
> `node /ruta/absoluta/a/branchpoint/dist/index.js` si compilaste desde el
> código fuente). Si un cliente necesita una configuración distinta, abre
> un issue.

### Tools expuestas

#### `get_branch_context`

Sin parámetros. Devuelve el resumen manual guardado para la rama activa
(o un aviso claro si no hay ninguno) combinado con contexto enriquecido
desde Git: divergencia respecto a la rama principal (commits desde el
merge-base más `diff --stat`, omitida si no se detecta rama principal o
si ya estás en ella) y los 10 commits más recientes.

Salida real en una rama con resumen guardado y 2 commits de divergencia:

```markdown
## Saved summary

Implementing the OAuth login flow. Still need to handle the refresh token.

## Divergence from "main"

2 commit(s) since the divergence point.

 src/auth.ts | 45 +++++++++++++++++++++++++++++++++++++++++++++
 src/login.ts | 12 ++++++------
 2 files changed, 51 insertions(+), 6 deletions(-)

## Recent commits

- a1b2c3d feat: add refresh token handling
- e4f5g6h feat: initial OAuth login flow
...
```

Los estados degradados del repositorio se reportan como contenido normal
de la tool, nunca como error de protocolo: un HEAD desacoplado devuelve un
mensaje explicativo en vez de fallar, y un repositorio sin commits todavía
lo dice sin rodeos.

#### `save_branch_context`

Parámetro `summary: string`. Guarda un resumen manual de contexto para la
rama activa, persistido en `.git/branchpoint/<rama>.md` y combinado con el
enriquecimiento de Git en la siguiente lectura. Un resumen vacío o de solo
espacios se rechaza con un mensaje claro en vez de guardarse como fichero
vacío; los resúmenes tienen un límite de 50.000 caracteres (unos 12.000
tokens — de sobra para un resumen real) como salvaguarda contra volcados
accidentales.

> `ping` existe como herramienta de diagnóstico interno para verificar que
> el servidor MCP responde correctamente; no es una funcionalidad del
> producto.

## Para humanos (CLI)

Los mismos datos que ve tu agente, en tu terminal. Todos los subcomandos
aceptan `--json` para salida cruda sin colores (scripts, CI).

### `branchpoint status`

Rama activa, si tiene contexto guardado y su divergencia respecto a la
rama principal:

```
╭───────────────────────── branchpoint ──────────────────────────╮
│  Active branch:  feature/oauth-login                           │
│  Context:        saved (updated 2026-07-11 18:30)              │
│  Divergence:     2 commit(s) since the common point with main  │
╰────────────────────────────────────────────────────────────────╯
```

Con `--json`:

```json
{
  "branch": "feature/oauth-login",
  "hasContext": true,
  "updatedAt": "2026-07-11T16:30:00.000Z",
  "defaultBranch": "main",
  "hasCommits": true,
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
│ Branch              │ Updated          │ Summary                                                      │
├─────────────────────┼──────────────────┼──────────────────────────────────────────────────────────────┤
│ feature/oauth-login │ 2026-07-11 18:30 │ Implementing the OAuth login flow. Decided to use PKCE…      │
├─────────────────────┼──────────────────┼──────────────────────────────────────────────────────────────┤
│ main                │ 2026-07-10 09:14 │ Stable branch. Latest release: v1.2.0. Don't touch until QA… │
└─────────────────────┴──────────────────┴──────────────────────────────────────────────────────────────┘
```

### `branchpoint context [rama]`

El contexto completo guardado para una rama (por defecto, la activa):

```
feature/oauth-login — updated 2026-07-11 18:30

Implementing the OAuth login flow. Decided to use PKCE instead of a client secret. Still need to handle refresh token expiration.
```

### Modo interactivo

`branchpoint` sin argumentos en una terminal abre un menú para ver el
contexto de la rama activa, listar todas las ramas guardadas o guardar un
resumen nuevo, sin necesidad de memorizar subcomandos. `Ctrl+C` sale
limpiamente en cualquier momento.

## Solución de problemas

**Registrar el servidor en Windows con una ruta absoluta a mano falla o
se comporta raro.** Si apuntas la configuración de un cliente MCP
directamente a `node C:\ruta\a\branchpoint\dist\index.js` en vez de usar
`npx`, recuerda que el fichero de configuración es JSON: las barras
invertidas hay que escaparlas (`C:\\ruta\\a\\...`) o sustituirlas por
barras normales (`C:/ruta/a/...`), o una ruta Windows sin escapar fallará
al parsear o se corromperá en silencio.

**`npm install` o `yarn install` falla o avisa dentro de una copia clonada
de este repo.** El proyecto fija pnpm vía `devEngines.packageManager` en
`package.json`; instala [pnpm](https://pnpm.io) y usa `pnpm install` en su
lugar.

**Todo devuelve "detached HEAD" / sin rama activa.** Estás en un checkout
de un commit suelto o a mitad de un rebase, un estado donde el propio Git
no tiene nombre de rama actual. Es un estado normal de Git, no un error de
Branchpoint: ejecuta `git checkout <rama>` para volver a una rama y el
seguimiento de contexto se reanuda.

**¿Dónde están mis datos y cómo los borro?** El contexto vive como un
fichero markdown por rama bajo `.git/branchpoint/`, en la raíz del
directorio `.git` COMPARTIDO del repositorio (así que es el mismo almacén
en todos los worktrees de un repo, no se duplica por worktree). Para
borrarlo todo: elimina la carpeta `branchpoint` de ahí. Para borrar el
contexto de una sola rama: elimina su fichero `.md` correspondiente (o su
carpeta padre, para ramas con `/` en el nombre).

## Roadmap

- Publicación en npm (el paquete está listo; `npm publish` es un paso
  manual pendiente de revisión final).
- Detectar y opcionalmente limpiar contextos huérfanos (ramas borradas
  que aún tienen un resumen guardado).
- Versión comercial (equipos, sincronización remota) sobre este núcleo
  open-source.

## Licencia

[MIT](./LICENSE)
