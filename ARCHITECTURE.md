# Architecture

This document explains how Branchpoint is built and why, in about ten
minutes of reading. It's aimed at anyone extending the codebase — including
a future version of the people who wrote it.

## What problem this solves

AI coding agents (Claude Code, Cursor, Cline, and others) operate inside a
git repository but have no memory of what happened on a branch once the
session ends. When a repository has several branches in flight — a common
pattern for agents themselves, which increasingly use git worktrees to run
parallel sessions — this causes two concrete failures: the agent
**cross-contaminates context** between branches (mixing a decision made on
`feature/a` into work on `feature/b`), and it **wastes tokens**
re-exploring and re-explaining the state of the project at the start of
every session because nothing about the branch persisted. Branchpoint
solves this narrowly: it gives the agent two tools to read and write a
short text summary tied to whichever branch is currently checked out, so
switching branches automatically switches the relevant context.

## Data flow

```
                    ┌──────────────────────┐
                    │   process.argv /      │
                    │   process.stdin.isTTY │
                    └──────────┬───────────┘
                               │
                        src/index.ts
                      (mode dispatcher)
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
   args present            no args, TTY           no args, no TTY
        │                      │                      │
        ▼                      ▼                      ▼
  src/cli.ts           src/interactive.ts        src/server.ts
  (Commander +          (@clack/prompts           (MCP tools over
   presentation)          menu loop)                stdio)
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               ▼
                        src/queries.ts
                (pure data-gathering functions)
                               │
                ┌──────────────┴──────────────┐
                ▼                              ▼
          src/git.ts                    src/storage.ts
      (execFileSync wrappers      (branch name <-> filesystem
       around the git binary)      path, read/write .md files)
                                              │
                                              ▼
                          <git-common-dir>/branchpoint/<branch>.md
```

Every consumer (MCP tools, CLI subcommands, the interactive menu) reads
and writes through `queries.ts`, never touching `git.ts` or `storage.ts`
directly. That's what keeps the three presentation layers in sync without
duplicating logic — a bug fix or a new field in `queries.ts` is visible
everywhere at once.

## File responsibilities

| File | Responsibility |
|---|---|
| `src/index.ts` | Mode dispatcher. Decides CLI vs. interactive vs. MCP server based on `argv` and TTY state, using dynamic imports so the MCP path never loads CLI code. Final catch-all so no uncaught rejection ever reaches the user as a raw stack trace. |
| `src/server.ts` | MCP server: registers `ping`, `get_branch_context`, `save_branch_context` and connects the stdio transport. The only file where writing to stdout outside the SDK's own protocol messages is forbidden. |
| `src/cli.ts` | Commander program with the `status`, `list`, `context` subcommands, plus all terminal presentation (boxen panels, cli-table3 tables, picocolors). |
| `src/interactive.ts` | The `@clack/prompts` menu launched when a human runs `branchpoint` with no arguments in a terminal. Another presentation skin over `queries.ts`, nothing more. |
| `src/queries.ts` | Pure data layer. Gathers information from `git.ts` and `storage.ts` and returns plain typed objects (or, for the MCP report, a markdown string). Never prints anything — the single point every presentation surface shares. |
| `src/git.ts` | Thin, safe wrappers around the `git` binary (`execFileSync` with an argument array, never a shell string). The only module allowed to shell out to git. |
| `src/storage.ts` | Branch name ↔ filesystem path translation and the actual read/write of `.md` context files, rooted at the git common directory. |
| `src/validators.ts` | Named, exported, tested validation functions for anything fed into a UI library's `validate`/callback hooks — see [Testing philosophy](#testing-philosophy). |
| `src/version.ts` | Single source of truth for the package version, read from `package.json` at runtime and shared by the MCP handshake, `--version`, and the interactive banner. |

## Stack, and why each piece

- **Node 22 LTS** — the runtime baseline; picked for long-term support and because it's what the target audience (developers running AI coding agents locally) already has installed.
- **TypeScript, strict mode, pure ESM** (`"type": "module"`, `module`/`moduleResolution`: `NodeNext`) — strict mode catches the `undefined`-vs-`""` class of bug this project has already been bitten by once (see [Testing philosophy](#testing-philosophy)); pure ESM avoids the dual-package hazard of shipping both CJS and ESM builds for a small CLI tool.
- **`@modelcontextprotocol/sdk` v1** (pinned exactly, no `^`), stdio transport — the MCP ecosystem was young enough during initial development that pinning avoided breaking changes from a v2 beta landing mid-project. stdio (not HTTP/SSE) matches how every mainstream MCP client (Claude Code, Claude Desktop, Cursor) launches local servers: as a child process, not a network service.
- **Zod v4** — schema validation for MCP tool inputs; the MCP SDK generates the JSON Schema clients see directly from Zod schemas, so there's one source of truth for a tool's input contract.
- **tsdown** as the bundler — not `tsup`, which is unmaintained. tsdown produces a single `dist/index.js` (see `tsdown.config.mjs` for the shebang banner and forced `.js` extension) that both `npx branchpoint` and a direct `node dist/index.js` invocation can run.
- **pnpm** as the package manager — enforced via `devEngines.packageManager` so `npm install`/`yarn` inside the repo fail loudly instead of producing a subtly different lockfile.
- **Biome** — lint and format in one tool, replacing the ESLint+Prettier pair; picked for install size and single-config simplicity in a project this size.
- **Vitest** — test runner; chosen for native ESM/TypeScript support without a separate ts-jest-style transform step.
- **`@modelcontextprotocol/inspector`** — used ad hoc via `npx` for manual MCP protocol testing, not a project dependency.
- **Commander, picocolors, cli-table3, boxen, @clack/prompts** — the CLI/interactive surface's presentation stack, isolated to `cli.ts` and `interactive.ts` so the MCP path never imports them (see the dynamic-import discussion in `index.ts`).

## Testing philosophy

Three deliberately different strategies, matched to what each layer is testing:

- **`git.ts` is tested against real git**, not mocked. It's a thin wrapper around a real binary; mocking `execFileSync` would only prove the mock was called correctly, not that the git invocation itself is right. Tests that need branch/commit state create real temporary repositories (`mkdtempSync` + real `git init`/`commit`/`worktree` calls) and clean them up afterward.
- **`storage.ts` and `queries.ts` are tested against a temporary directory**, with `git.getGitCommonDir` mocked via `vi.spyOn` to point at it. This isolates every test from the actual project repository's `.git/branchpoint/` — nothing in the test suite ever reads or writes the real developer's saved contexts.
- **`mcp-regression.test.ts` is a contract test against the compiled artifact**, not the source. It spawns `dist/index.js` as a child process with piped stdio and no TTY (exactly how every MCP client launches it), sends a raw `initialize` JSON-RPC message, and asserts on the handshake response. This is the test that enforces the project's one inviolable rule — the MCP path's behavior can never regress — which is why `pnpm test` runs `pnpm build` first: this test is meaningless against stale source.
- **Every `validate`/callback handed to a UI library (`@clack/prompts`, Commander) must be a named function exported from a testable module** (`validators.ts` today), never an inline arrow. This rule exists because of a real incident: an inline `validate` assumed its argument was always a `string` and called `.trim()` on it, but `@clack/prompts` delivers `undefined` for an empty field — the result was a raw stack trace shown to a user pressing Enter on an empty prompt. Presentation-layer callbacks are the project's blind spot for tests; extracting them is the fix.

## Notable decisions

- **No database.** Context is one markdown file per branch. The data is small (a paragraph or two per branch), read/write access is single-user and local, and a flat file is trivially inspectable, greppable, and git-ignorable — a database would add an operational dependency for zero benefit at this scale.
- **Files live under `.git/`, specifically the git common directory**, not a project-root dotfolder. This keeps context out of the working tree (nothing to accidentally commit or see in `git status`) and, since Phase 9, resolves correctly inside worktrees and submodules, where `.git` is a pointer file rather than a directory — see the doc comment on `getGitCommonDir` in `git.ts`.
- **CLI, not a GUI.** The target user already lives in a terminal (it's where they run their AI coding agent), and a CLI ships as a single Node process with no separate UI framework or windowing dependency.
- **stdout is sacred on the MCP path.** The stdio transport uses stdout as the JSON-RPC channel itself; any stray `console.log` there corrupts every message after it for the client. This is why `index.ts` uses dynamic imports to keep CLI/interactive code (and its printing dependencies) from ever loading when the process is about to become an MCP server — importing a module is enough to run its top-level side effects, so the isolation has to happen before the import, not after.
- **TTY detection decides interactive vs. server mode**, because it's the one signal that reliably distinguishes "a human typed `branchpoint` at a prompt" from "an MCP client spawned this process with pipes" without requiring either side to pass an explicit flag — matching how every existing MCP client already launches local servers.
- **Windows-hostile branch names are percent-encoded, not rejected.** Git allows branch names that are illegal or reserved as Windows filenames (`CON`, `NUL`, a trailing `.` or space, `<>:"|?*`); rather than refuse to save context for such a branch, `storage.ts` applies a deterministic, reversible percent-encoding scheme so the original name round-trips exactly through `sanitizeBranchForFs`/`decodeBranchFromFs`. A defensive path-containment check in `getContextPath` additionally guarantees no input — sanitized or not, ref-validated by git or an arbitrary CLI argument — can resolve outside the branchpoint directory.
