# Project Tool

Auto-detected project commands with pre-commit enforcement and monorepo discovery.

## Actions

| Action | Description | Example |
|--------|-------------|---------|
| `lint` | Run project linter | `project(action: "lint")` |
| `typecheck` | Run type checker | `project(action: "typecheck")` |
| `test` | Run test suite | `project(action: "test", file: "src/foo.test.ts")` |
| `build` | Build project | `project(action: "build")` |
| `run` | Run dev server or script | `project(action: "run", script: "dev")` |
| `list` | Discover monorepo packages | `project(action: "list")` |

## Parameters

| Param | Type | Description |
|-------|------|-------------|
| `action` | required | `lint`, `typecheck`, `test`, `build`, `run`, `list` |
| `file` | optional | Target specific file (test, lint) |
| `fix` | optional | Auto-fix lint issues (biome --write, eslint --fix, ruff --fix) |
| `flags` | optional | Extra CLI flags |
| `env` | optional | Environment variables |
| `cwd` | optional | Working directory (for monorepos) |
| `timeout` | optional | Timeout in ms (default 120000) |

## Toolchain Detection

`detectProfile(cwd)` scans for config files and lockfiles to determine the right commands:

```
bun.lock         → bun test, bun run lint, bunx tsc --noEmit
Cargo.toml       → cargo test, cargo clippy, cargo check
go.mod           → go test, golangci-lint run, go build
pyproject.toml   → pytest, ruff check, mypy/pyright
composer.json    → phpunit, phpstan/psalm
Gemfile          → rspec, rubocop
build.gradle     → gradle test, gradle check
```

### JS/TS Linter Detection (from config files)

Priority order:
1. `biome.json` / `biome.jsonc` → `biome check .`
2. `oxlintrc.json` / `.oxlintrc.json` → `oxlint .`
3. `eslint.config.js` / `.ts` / `.mjs` / `.eslintrc*` → `eslint .`

### Python Type Checker Detection

- `pyrightconfig.json` exists → `pyright`
- Otherwise → `mypy .`

## Pre-Commit Checks

When the agent runs `git commit` via the shell tool, SoulForge auto-runs `detectNativeChecks(cwd)` before allowing the commit:

- **JS/TS:** `biome check . && tsc --noEmit`
- **Rust:** `cargo clippy && cargo check`
- **Go:** `golangci-lint run && go build ./...`
- **Python:** `ruff check && pyright`

If checks fail, the commit is blocked and errors are returned to the agent. This is code-enforced — no prompt instruction needed.

The pre-commit check uses `detectNativeChecks()` which identifies tools from config files directly, never from `package.json` scripts. This ensures we always run a known, safe tool.

## Monorepo Discovery

`project(action: "list")` discovers workspace packages:

### Supported Workspace Formats

- **pnpm:** `pnpm-workspace.yaml`
- **npm/yarn:** `workspaces` field in `package.json`
- **Cargo:** `[workspace] members` in `Cargo.toml`
- **Go:** `use` directives in `go.work`

### Example Output

```
5 packages:
  @myapp/web — packages/web (biome) [lint, typecheck, test]
  @myapp/api — packages/api (biome) [lint, typecheck, test]
  @myapp/shared — packages/shared (biome) [lint, typecheck]
  @myapp/cli — packages/cli (biome) [lint]
  @myapp/docs — packages/docs [test]

Use project(action: "lint", cwd: "<path>") to target a specific package.
```

Each package gets its own `detectProfile()` call, so capabilities are accurate per-package.

## System Prompt Integration

The detected toolchain is injected into the system prompt automatically:

```
Toolchain: bun
Project commands: lint: `bun run lint` · typecheck: `bun run typecheck` · test: `bun test` · build: `bun run build`
```

The agent sees available actions without guessing. ECC pattern: code enforcement, not prompt instruction.

## Shell Redirect Hints

When the agent runs `bun run lint`, `cargo clippy`, `npm test`, etc. via shell instead of the project tool, the result includes:

```
Command succeeded. Next time use project(action: "lint") — it auto-detects
the toolchain, results are structured, and output is visible in the UI.
```

This educates the agent to prefer the project tool without blocking the command.
