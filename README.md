# Branchpoint

**[English](README.md) | [Español](README.es.md)**

![CI](https://github.com/Caarlosgg/branchpoint/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)

Branchpoint gives your Git workflow persistent memory, per branch. AI coding
agents use it as an MCP server so they stop mixing up context between
branches; you use it as a CLI to see at a glance what was going on in each
branch. One binary, two faces: the same `.git/branchpoint/` store feeds
both.

```bash
# For your agent (Claude Code):
claude mcp add branchpoint -- npx -y branchpoint

# For you:
npx branchpoint status
```

## The problem

When an AI coding agent (Claude Code, Cursor, Cline...) works in a
repository with several active branches, it has no memory of what was
decided or done on each one. That causes two familiar symptoms:

- **Cross-branch hallucination**: the agent mixes code context or decisions
  from one branch into the current work on another.
- **Wasted tokens**: the agent has to re-explore and re-explain the state
  of the project every session, because nothing persisted was tied to the
  branch.

And you hit the same problem yourself coming back to a branch a week
later: what was this even about?

## How it works

Branchpoint detects the active Git branch and persists context summaries
per branch under `.git/branchpoint/<branch>.md`. When context is read, it's
automatically enriched with information pulled from Git itself (recent
commits, divergence from the default branch), so switching branches
automatically switches the relevant context.

The same executable picks its mode based on how it's launched:

- **No arguments, piped stdio** (how an MCP client launches it) → MCP
  server over stdio.
- **Arguments present** → CLI with subcommands (`status`, `list`,
  `context`).
- **No arguments, in a terminal** → interactive mode with a menu.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design: data flow,
file-by-file responsibilities, the stack and why each piece was chosen,
and the testing philosophy.

## For AI agents (MCP server)

### Claude Code

```bash
claude mcp add branchpoint -- npx -y branchpoint
```

### Claude Desktop

Add to `claude_desktop_config.json` (macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`, Windows:
`%APPDATA%\Claude\claude_desktop_config.json`):

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

Add to `.cursor/mcp.json` (project-level) or `~/.cursor/mcp.json` (global —
Cursor uses the same format as Claude Desktop):

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

Add to Cline's MCP settings file (VS Code global storage —
`.../globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`,
reachable from Cline's "Configure MCP Servers" menu):

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

### VS Code (agent mode)

Add to `.vscode/mcp.json` in your workspace. Note the top-level key is
`servers`, not `mcpServers` like the tools above:

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

MCP tools are only available in agent mode — they're invisible in Ask or
Edit mode.

> Any other MCP client not listed here should work the same way: it's a
> standard stdio server launched with `npx -y branchpoint` (or
> `node /absolute/path/to/branchpoint/dist/index.js` if you built from
> source). If a client needs a different setup, please open an issue.

### Tools exposed

#### `get_branch_context`

No parameters. Returns the manually saved summary for the active branch
(or a clear notice if there isn't one) combined with context enriched from
Git: divergence from the default branch (commits since the merge-base plus
`diff --stat`, omitted if no default branch is detected or you're already
on it) and the 10 most recent commits.

Real output on a branch with a saved summary and 2 commits of divergence:

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

Degraded repository states are reported as normal tool content, never as
protocol errors — a detached HEAD returns an explanatory message instead
of crashing, and a repository with no commits yet says so plainly.

#### `save_branch_context`

Parameter `summary: string`. Saves a manual context summary for the active
branch, persisted at `.git/branchpoint/<branch>.md` and combined with the
Git-derived enrichment on the next read. An empty or whitespace-only
summary is rejected with a clear message rather than saved as an empty
file; summaries are capped at 50,000 characters (about 12,000 tokens —
comfortably more than a real summary needs) to guard against accidental
dumps.

> `ping` exists as an internal diagnostic tool to verify the MCP server is
> responding correctly; it isn't a product feature.

## For humans (CLI)

The same data your agent sees, in your terminal. Every subcommand accepts
`--json` for raw, color-free output (scripts, CI).

### `branchpoint status`

Active branch, whether it has saved context, and divergence from the
default branch:

```
╭───────────────────────── branchpoint ──────────────────────────╮
│  Active branch:  feature/oauth-login                           │
│  Context:        saved (updated 2026-07-11 18:30)              │
│  Divergence:     2 commit(s) since the common point with main  │
╰────────────────────────────────────────────────────────────────╯
```

With `--json`:

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

Every branch with saved context, most recently updated first:

```
┌─────────────────────┬──────────────────┬──────────────────────────────────────────────────────────────┐
│ Branch              │ Updated          │ Summary                                                      │
├─────────────────────┼──────────────────┼──────────────────────────────────────────────────────────────┤
│ feature/oauth-login │ 2026-07-11 18:30 │ Implementing the OAuth login flow. Decided to use PKCE…      │
├─────────────────────┼──────────────────┼──────────────────────────────────────────────────────────────┤
│ main                │ 2026-07-10 09:14 │ Stable branch. Latest release: v1.2.0. Don't touch until QA… │
└─────────────────────┴──────────────────┴──────────────────────────────────────────────────────────────┘
```

### `branchpoint context [branch]`

The full saved context for a branch (defaults to the active one):

```
feature/oauth-login — updated 2026-07-11 18:30

Implementing the OAuth login flow. Decided to use PKCE instead of a client secret. Still need to handle refresh token expiration.
```

### Interactive mode

`branchpoint` with no arguments in a terminal opens a menu to view the
active branch's context, list every saved branch, or save a new summary,
without memorizing subcommands. `Ctrl+C` exits cleanly at any point.

## Troubleshooting

**Registering the server on Windows with a raw absolute path fails or
behaves oddly.** If you're pointing an MCP client's config directly at
`node C:\path\to\branchpoint\dist\index.js` instead of using `npx`,
remember the config file is JSON: backslashes need to be escaped
(`C:\\path\\to\\...`) or replaced with forward slashes
(`C:/path/to/...`), or a raw Windows path will fail to parse or get
silently mangled.

**`npm install` or `yarn install` fails or warns inside a cloned copy of
this repo.** The project pins pnpm via `devEngines.packageManager` in
`package.json`; install [pnpm](https://pnpm.io) and use `pnpm install`
instead.

**Everything returns "detached HEAD" / no active branch.** You're on a
bare commit checkout or mid-rebase, where Git itself has no current
branch name. This is a normal Git state, not a Branchpoint error: run
`git checkout <branch>` to return to a branch, and context tracking
resumes.

**Where is my data, and how do I delete it?** Context lives as one
markdown file per branch under `.git/branchpoint/`, rooted at the
repository's shared `.git` directory (so it's the same store across every
worktree of a repo, not duplicated per worktree). To wipe everything:
delete the `branchpoint` folder there. To remove a single branch's
context: delete its corresponding `.md` file (or its parent folder, for
branches with `/` in the name).

## Roadmap

- Publish to npm (the package is ready; `npm publish` is a manual step
  pending final review).
- Detect and optionally clean up orphaned context (branches that were
  deleted but still have a saved summary).
- Commercial version (teams, remote sync) built on top of this
  open-source core.

## License

[MIT](./LICENSE)
