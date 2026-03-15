# SoulForge Documentation

## Core Architecture

- **[Architecture](architecture.md)** — System overview, data flow, component lifecycle
- **[Repo Map](repo-map.md)** — Graph-powered code intelligence (PageRank, cochange, blast radius, clone detection)
- **[Agent Bus](agent-bus.md)** — Multi-agent coordination (shared cache, edit mutex, findings board)
- **[Compound Tools](compound-tools.md)** — rename_symbol, move_symbol, refactor internals
- **[Compaction](compaction.md)** — V1/V2 context management strategies

## Feature Reference

- **[Project Tool](project-tool.md)** — Toolchain detection, pre-commit checks, monorepo discovery
- **[Steering](steering.md)** — Mid-stream user input injection
- **[Provider Options](provider-options.md)** — Thinking modes, context management, model capabilities

## Design Principles

SoulForge follows **ECC (Everything Claude Code) patterns** — enforce behavior with code, not prompt instructions:

- **Schema-level enforcement** — `targetFiles` required on dispatch tasks, Zod validation rejects bad input before any agent runs
- **Confident output** — tool results say "content is already below" not "do NOT re-read"
- **Auto-enrichment** — dispatch tasks get symbol line ranges from repo map automatically
- **Pre-commit gates** — lint + typecheck runs before `git commit`, blocks on failure
- **Shell interceptors** — co-author injection, project tool redirect hints, read-command redirect
- **Result richness** — richer tool output = fewer re-read cycles = fewer tokens
