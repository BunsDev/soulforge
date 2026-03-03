# SoulForge

An AI-powered terminal IDE. Chat with LLMs, edit code in an embedded Neovim instance, run multi-step tool loops — all without leaving the terminal.

Built with Bun, TypeScript, Ink, and the Vercel AI SDK.

## Why

Most AI coding tools are either chat-only (no editor) or editor-only (no autonomy). SoulForge puts a real Neovim session and an agentic AI side by side in one terminal window. The AI can read files, edit code, run shell commands, search your codebase, and spawn subagents — while you watch, steer, or work alongside it in the editor.

## Install

```bash
git clone https://github.com/proxysoul/soulforge
cd soulforge
bun install
```

You need [Bun](https://bun.sh) and [Neovim](https://neovim.io) (>= 0.9).

## API Keys

Set at least one:

```bash
export ANTHROPIC_API_KEY=sk-...    # Claude
export OPENAI_API_KEY=sk-...       # GPT
export XAI_API_KEY=...             # Grok
export GOOGLE_GENERATIVE_AI_API_KEY=...  # Gemini
```

Or use a single key for all providers via [Vercel AI Gateway](https://sdk.vercel.ai/docs/ai-sdk-core/provider-management):

```bash
export AI_GATEWAY_API_KEY=...
```

Ollama works too — no key needed, just have it running locally.

## Run

```bash
bun run dev
```

Or install globally:

```bash
bun link
soulforge     # or: sf
```

## What It Does

**Chat + Tools.** Ask Forge (the AI) anything. It can read and edit files, run shell commands, search with grep/glob, and manage git — all as tool calls you can watch in real time.

**Embedded Editor.** `Ctrl+E` opens a full Neovim instance inside the TUI. Your config, plugins, and LSP all work. Click or `Ctrl+E` to switch focus between editor and chat.

**Multi-Agent.** Forge delegates to subagents — an Explore agent for read-only research and a Code agent for implementation — each with their own context window and tool set.

**Multi-Provider.** Switch LLMs mid-conversation with `Ctrl+L`. Anthropic, OpenAI, xAI, Google, Ollama, or any provider through the Vercel AI Gateway.

**Task Router.** Assign different models to different task types (planning, coding, exploration) via `/router`. Use Opus for architecture, Haiku for grep.

**Plan Mode.** `/plan` switches Forge to read-only research mode. It investigates, writes a plan, then asks for approval before executing.

**Modes.** `Ctrl+D` cycles through personas — default, architect (design only), socratic (asks before doing), challenge (devil's advocate), and plan.

**Sessions.** Conversations auto-save. `Ctrl+P` to browse and restore past sessions.

**Skills.** Extend Forge with markdown skill files. `Ctrl+S` to browse and install from the registry.

**Git.** `Ctrl+G` opens the git menu (commit, push, pull, stash, log). `/commit` generates an AI commit message. `/lazygit` launches lazygit fullscreen.

## Keybindings

| Key | Action |
|-----|--------|
| `Ctrl+E` | Toggle editor / switch focus |
| `Ctrl+L` | Switch LLM model |
| `Ctrl+D` | Cycle forge mode |
| `Ctrl+G` | Git menu |
| `Ctrl+S` | Browse skills |
| `Ctrl+P` | Browse sessions |
| `Ctrl+K` | Clear chat |
| `Ctrl+X` | Stop generation |
| `Ctrl+T` | Toggle plan sidebar |
| `Ctrl+R` | Error log |
| `Ctrl+H` | Help |
| `Ctrl+C` | Quit |

Type `/help` in chat for the full command reference.

## Commands

A few highlights — `/help` shows the complete list.

```
/open <path>       open file in editor
/commit            AI-assisted git commit
/plan [task]       enter plan mode
/mode <name>       switch forge persona
/router            assign models per task type
/context           show context budget
/privacy add <pat> block files from AI access
/setup             check prerequisites
```

## License

[AGPL-3.0-only](LICENSE). You can use, modify, and distribute SoulForge freely — but if you run a modified version as a service, you must release your source code under the same license.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
