# Getting Started

This guide walks you through setting up SoulForge for the first time. For a quick overview of what SoulForge does, see the [README](README.md).

## Prerequisites

### Bun

SoulForge runs on [Bun](https://bun.sh), not Node.js.

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# macOS via Homebrew
brew install bun
```

Verify: `bun --version` (need >= 1.0)

### Neovim

SoulForge embeds a real Neovim instance — your config, plugins, and LSP all work inside it.

```bash
# macOS
brew install neovim

# Ubuntu / Debian
sudo apt install neovim

# Arch
sudo pacman -S neovim
```

Verify: `nvim --version` (need >= 0.9)

### A Nerd Font

SoulForge uses [Nerd Font](https://www.nerdfonts.com/) icons throughout the UI. Without one, you'll see blank squares instead of icons. Any Nerd Font works — popular choices:

- [JetBrains Mono Nerd Font](https://github.com/ryanoasis/nerd-fonts/releases)
- [FiraCode Nerd Font](https://github.com/ryanoasis/nerd-fonts/releases)

After installing, set it as your terminal's font. Or run `/setup` inside SoulForge to check and install fonts automatically.

### An API Key

You need at least one LLM provider key:

| Provider | Env Variable | Models |
|----------|-------------|--------|
| Anthropic | `ANTHROPIC_API_KEY` | Claude Opus, Sonnet, Haiku |
| OpenAI | `OPENAI_API_KEY` | GPT-4o, o3, o4-mini |
| xAI | `XAI_API_KEY` | Grok |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini |
| Ollama | *(none — runs locally)* | Llama, Mistral, etc. |

Add to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Alternatively, a single [Vercel AI Gateway](https://sdk.vercel.ai/docs/ai-sdk-core/provider-management) key gives you access to all providers:

```bash
export AI_GATEWAY_API_KEY=...
```

## Install & Run

```bash
git clone https://github.com/proxysoul/soulforge
cd soulforge
bun install
bun run dev
```

On first run, SoulForge creates a config at `~/.soulforge/config.json` with sensible defaults.

To install globally so you can run `soulforge` or `sf` from anywhere:

```bash
bun link
```

## The Interface

When SoulForge starts you'll see:

```
┌─────────────────────────────────────────────────┐
│  󰊠 SoulForge │ tokens │ context │ git │ model   │  ← header
│                                                 │
│  Chat messages appear here                      │  ← chat area
│  Tool calls show in real time                   │
│                                                 │
│  > type here...                                 │  ← input
│  ^X Stop  ^D Mode  ^E Editor  ^G Git  ^L LLM   │  ← footer
└─────────────────────────────────────────────────┘
```

**Header** shows token usage, context budget, git branch, and active model.

**Chat area** renders messages with markdown, syntax-highlighted code blocks, and live tool call progress.

**Input box** accepts natural language or slash commands (type `/` to see them).

**Footer** shows keybinding shortcuts.

## Editor Panel

Press `Ctrl+E` to open the embedded Neovim editor. The screen splits — editor on the left, chat on the right.

Focus cycles with `Ctrl+E`:

1. **Editor closed** → `Ctrl+E` → editor opens, Neovim focused
2. **Neovim focused** → `Ctrl+E` → chat focused (editor stays open)
3. **Chat focused** → `Ctrl+E` → editor closes

When Neovim is focused, all keystrokes go directly to it — use it exactly like normal Neovim. Click the chat side or press `Ctrl+E` to switch back.

Open a specific file: `/open src/index.tsx`

## Switching Models

Press `Ctrl+L` to open the model picker. Pick a provider, then a model. The switch takes effect on the next message — you can change models mid-conversation.

Use `/router` to assign different models to different task types. For example, Opus for planning, Haiku for code search.

## Modes

`Ctrl+D` cycles through Forge's personas:

| Mode | Behavior |
|------|----------|
| **default** | Standard — investigates then implements |
| **architect** | Design only — outlines and tradeoffs, no code |
| **socratic** | Asks probing questions before doing anything |
| **challenge** | Devil's advocate — challenges every assumption |
| **plan** | Research only — reads and plans, no file edits |

Or switch directly: `/mode architect`

## Plan Mode

`/plan refactor the auth system` enters plan mode. Forge researches the codebase, writes a plan to `.soulforge/plan.md`, then asks you to approve, revise, or cancel before executing anything.

The plan sidebar (`Ctrl+T` to toggle) shows step-by-step progress during execution.

## Skills

Skills are markdown files that extend what Forge knows. Press `Ctrl+S` to browse.

Three tabs:

- **Search** — find and install from the [skills.sh](https://skills.sh) community registry
- **Installed** — skills on your machine (`~/.agents/skills/`, `~/.claude/skills/`)
- **Active** — skills loaded in the current session

## Git

`Ctrl+G` opens the git menu with shortcuts for common operations:

| Key | Action |
|-----|--------|
| `c` | Commit (AI-generated message) |
| `p` | Push |
| `u` | Pull |
| `s` | Stash |
| `o` | Stash pop |
| `l` | Log |
| `g` | Launch lazygit |

Or use slash commands: `/commit`, `/push`, `/pull`, `/status`, `/diff`, `/log`, `/branch`.

## Privacy

Block files from AI access with `/privacy add <pattern>`:

```
/privacy add .env
/privacy add secrets/**
```

Forge will refuse to read, display, or access files matching these patterns — even via shell commands.

## Config

Config lives at `~/.soulforge/config.json`. Created automatically on first run. You can edit it directly or use slash commands:

```
/nvim-config user       use your own neovim config
/nvim-config default    use soulforge's minimal config
/editor-settings        toggle LSP integrations
/chat-style bubble      switch chat layout
```

## Troubleshooting

**"Neovim not found"**
Make sure `nvim` is on your `PATH`. You can set an explicit path in `~/.soulforge/config.json` under `nvimPath`.

**No models in `Ctrl+L`**
Your API key isn't set or isn't exported. Add `export ANTHROPIC_API_KEY=...` to your shell profile and restart your terminal.

**Icons show as boxes or question marks**
Install a [Nerd Font](https://www.nerdfonts.com/) and set it as your terminal font. Run `/font` inside SoulForge to check, or `/setup` to install one.

**Editor panel looks garbled**
Make sure your terminal supports true color. Most modern terminals do, but you may need `export COLORTERM=truecolor` in your shell profile.

**Forge seems slow**
Switch to a faster model with `Ctrl+L` (e.g. Haiku or GPT-4o-mini). Shell commands have a 30-second timeout.

**Context getting large**
SoulForge auto-summarizes when context exceeds 80% of the model's window. You can also manually run `/summarize` or `/clear` to reset.

## What's Next

- Type `/help` for the full command reference
- Press `Ctrl+S` to browse community skills
- Read [CONTRIBUTING.md](CONTRIBUTING.md) to hack on SoulForge itself
