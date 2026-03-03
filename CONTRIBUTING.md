# Contributing

Thanks for your interest in SoulForge. This document tells you everything you need to know.

## Setup

```bash
git clone https://github.com/proxysoul/soulforge
cd soulforge
bun install
bun run dev
```

**Requirements:** [Bun](https://bun.sh) >= 1.0, [Neovim](https://neovim.io) >= 0.9, at least one LLM API key (see [README](README.md#api-keys)).

**Scripts:**

```bash
bun run dev          # start soulforge
bun run typecheck    # tsc --noEmit
bun run lint         # biome check
bun run lint:fix     # biome auto-fix
bun run format       # biome format
```

Run all three checks before submitting a PR:

```bash
bun run lint:fix && bun run format && bun run typecheck
```

## Project Structure

```
src/
├── index.tsx                 # entry point
├── types/index.ts            # shared types
├── config/index.ts           # ~/.soulforge/config.json
│
├── components/               # UI (Ink / React)
│   ├── App.tsx               # root — state, keybindings, layout
│   ├── commands.ts           # slash command dispatch
│   ├── shared.tsx            # Spinner, PopupRow, color constants
│   ├── EditorPanel.tsx       # neovim display
│   ├── InputBox.tsx          # chat input
│   ├── MessageList.tsx       # chat history
│   ├── ToolCallDisplay.tsx   # tool call progress
│   ├── LlmSelector.tsx      # Ctrl+L model picker
│   ├── SkillSearch.tsx       # Ctrl+S skills browser
│   ├── GitMenu.tsx           # Ctrl+G git operations
│   ├── GitCommitModal.tsx    # AI commit message
│   └── ...                   # other popups and views
│
├── core/
│   ├── agents/               # forge + subagent definitions
│   │   ├── forge.ts          # main agent (factory — new per turn)
│   │   ├── explore.ts        # read-only subagent
│   │   ├── code.ts           # full-access subagent
│   │   └── subagent-tools.ts # exposes subagents as tool calls
│   ├── context/              # system prompt builder
│   ├── editor/               # neovim spawn, screen, RPC
│   ├── llm/
│   │   ├── provider.ts       # resolveModel(), checkProviders()
│   │   ├── models.ts         # model fetching, context windows
│   │   └── providers/        # one file per provider
│   │       ├── types.ts      # ProviderDefinition interface
│   │       ├── anthropic.ts
│   │       ├── openai.ts
│   │       ├── google.ts
│   │       ├── xai.ts
│   │       ├── ollama.ts
│   │       └── gateway.ts    # Vercel AI Gateway
│   ├── tools/                # tool definitions
│   └── ...                   # security, sessions, setup, etc.
│
└── hooks/                    # React hooks
```

## Rules

These are non-negotiable. PRs that break them will be asked to fix before merge.

- **Bun only.** Never `node`, `npm`, or `npx`.
- **No `any`.** TypeScript strict mode. Use proper types or Zod inference.
- **No unused variables.** The compiler catches these.
- **No `import React`.** JSX transform handles it.
- **Biome, not ESLint/Prettier.** One toolchain for linting and formatting.
- **The AI is named Forge.** Never "AI", "assistant", or "bot" in UI strings or prompts.

## Architecture

### How the Agent Works

SoulForge uses the Vercel AI SDK's `ToolLoopAgent`. Each chat turn creates a **new agent instance** (not a singleton) so the user can switch models mid-session with `Ctrl+L`.

The main agent (Forge) has direct tools — `read_file`, `edit_file`, `shell`, `grep`, `glob`, plus git and editor tools — and two subagent tools:

- **Explore** — read-only tools, fresh context window, for researching a codebase
- **Code** — full tool access, fresh context window, for implementing changes

Subagents are exposed to Forge as regular tool calls via `buildSubagentTools()`. Each invocation gets its own context window, so they don't pollute the main conversation.

### How Neovim Works

Neovim runs with `--embed -i NONE` and talks over msgpack-RPC pipes. The `NvimScreen` class processes `redraw` events into renderable screen lines. When the editor panel is focused, raw keystrokes are intercepted and forwarded via `nvim.api.input()`.

### How Providers Work

Each LLM provider is a self-contained file in `src/core/llm/providers/` that implements the `ProviderDefinition` interface. The provider registry handles everything else — model resolution, icon display, API fetching, context window lookup.

## Adding a New LLM Provider

One file, two lines in the registry.

**1. Create the provider file.** Copy any existing one as a template:

```bash
cp src/core/llm/providers/anthropic.ts src/core/llm/providers/mistral.ts
```

Implement the `ProviderDefinition` interface:

```typescript
export const mistral: ProviderDefinition = {
  id: "mistral",
  name: "Mistral",
  envVar: "MISTRAL_API_KEY",
  icon: "▲",
  createModel(modelId) { /* ... */ },
  fetchModels() { /* ... */ },
  fallbackModels: [ /* ... */ ],
  contextWindows: [ ["mistral-large", 128_000] ],
};
```

**2. Register it.** In `src/core/llm/providers/index.ts`:

```typescript
import { mistral } from "./mistral.js";

const ALL_PROVIDERS: ProviderDefinition[] = [
  gatewayProvider, anthropic, openai, xai, google, ollama,
  mistral,  // add here
];
```

**3. Verify.** `bun run typecheck` will catch any missing fields.

That's it. The model picker, provider status checks, context window lookup, and icon display all work automatically.

## Submitting a PR

1. Fork and branch off `main`
2. Make your changes
3. Run `bun run lint:fix && bun run format && bun run typecheck`
4. Open a PR with a clear description of what and why
5. One feature or fix per PR

If you're unsure whether something is in scope, open an issue first.

## License

AGPL-3.0-only. By contributing, you agree your code is licensed under the same terms.
