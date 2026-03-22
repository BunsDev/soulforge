# Third-Party Licenses

SoulForge includes and/or downloads the following third-party software.
This file satisfies attribution requirements for all included licenses.

---

## Bundled Dependencies (compiled into the SoulForge binary)

### Apache-2.0 Licensed

| Package | Version | Repository |
|---------|---------|------------|
| ai (Vercel AI SDK) | 6.x | https://github.com/vercel/ai |
| @ai-sdk/anthropic | 3.x | https://github.com/vercel/ai |
| @ai-sdk/google | 3.x | https://github.com/vercel/ai |
| @ai-sdk/openai | 3.x | https://github.com/vercel/ai |
| @ai-sdk/xai | 3.x | https://github.com/vercel/ai |
| @llmgateway/ai-sdk-provider | 3.x | https://github.com/theopenco/llmgateway-ai-sdk-provider |
| @mozilla/readability | 0.6.x | https://github.com/mozilla/readability |
| @openrouter/ai-sdk-provider | 2.x | https://github.com/OpenRouterTeam/ai-sdk-provider |
| @biomejs/biome | 2.x | https://github.com/biomejs/biome |
| typescript | 5.x | https://github.com/microsoft/TypeScript |

Copyright notice: Copyright (c) respective authors and contributors.

Licensed under the Apache License, Version 2.0. You may obtain a copy at:
https://www.apache.org/licenses/LICENSE-2.0

### MIT Licensed

| Package | Version | Repository |
|---------|---------|------------|
| @opentui/react | 0.1.x | https://github.com/anomalyco/opentui |
| chalk | 5.x | https://github.com/chalk/chalk |
| linkify-it | 5.x | https://github.com/markdown-it/linkify-it |
| marked | 17.x | https://github.com/markedjs/marked |
| neovim (node-client) | 5.x | https://github.com/neovim/node-client |
| react | 19.x | https://github.com/facebook/react |
| shiki | 4.x | https://github.com/shikijs/shiki |
| ts-morph | 27.x | https://github.com/dsherret/ts-morph |
| web-tree-sitter | 0.25.x | https://github.com/tree-sitter/tree-sitter |
| zod | 4.x | https://github.com/colinhacks/zod |
| zustand | 5.x | https://github.com/pmndrs/zustand |
| isbinaryfile | 5.x | https://github.com/gjtorikian/isBinaryFile |

### ISC Licensed

| Package | Version | Repository |
|---------|---------|------------|
| linkedom | 0.18.x | https://github.com/WebReflection/linkedom |

### Unlicense

| Package | Version | Repository |
|---------|---------|------------|
| tree-sitter-wasms | 0.1.x | https://github.com/AntV/tree-sitter-wasms |

---

## Auto-Installed Binaries (downloaded on first run, not bundled)

These tools are downloaded from their official GitHub releases to `~/.soulforge/bin/`
when not already present on the system. SoulForge does not modify or redistribute
their source code — it downloads official pre-built binaries at runtime.

| Tool | License | Source |
|------|---------|--------|
| Neovim | Apache-2.0 | https://github.com/neovim/neovim |
| ripgrep | MIT / Unlicense | https://github.com/BurntSushi/ripgrep |
| fd | Apache-2.0 / MIT | https://github.com/sharkdp/fd |
| lazygit | MIT | https://github.com/jesseduffield/lazygit |
| CLIProxyAPI | MIT | https://github.com/router-for-me/CLIProxyAPI |

### Nerd Fonts (bundled — Symbols Only variant)

| Font | License | Source |
|------|---------|--------|
| Symbols Nerd Font | SIL OFL 1.1 | https://github.com/ryanoasis/nerd-fonts |

### Nerd Fonts (optional, downloaded via /setup)

| Font | License | Source |
|------|---------|--------|
| JetBrains Mono Nerd Font | SIL OFL 1.1 | https://github.com/ryanoasis/nerd-fonts |
| Fira Code Nerd Font | SIL OFL 1.1 | https://github.com/ryanoasis/nerd-fonts |
| Cascadia Code Nerd Font | SIL OFL 1.1 | https://github.com/ryanoasis/nerd-fonts |
| Iosevka Nerd Font | SIL OFL 1.1 | https://github.com/ryanoasis/nerd-fonts |
| Hack Nerd Font | SIL OFL 1.1 | https://github.com/ryanoasis/nerd-fonts |

---

## Neovim Plugins (auto-installed via lazy.nvim on first editor launch)

These plugins are downloaded by lazy.nvim at runtime into `~/.local/share/soulforge/lazy/`.
SoulForge does not bundle or redistribute plugin source code — it references them
by name in `init.lua` and lazy.nvim clones them from GitHub on first use.

### Apache-2.0 Licensed

| Plugin | Repository |
|--------|------------|
| LazyVim | https://github.com/LazyVim/LazyVim |
| lazy.nvim | https://github.com/folke/lazy.nvim |
| snacks.nvim | https://github.com/folke/snacks.nvim |
| noice.nvim | https://github.com/folke/noice.nvim |
| flash.nvim | https://github.com/folke/flash.nvim |
| trouble.nvim | https://github.com/folke/trouble.nvim |
| todo-comments.nvim | https://github.com/folke/todo-comments.nvim |
| which-key.nvim | https://github.com/folke/which-key.nvim |
| ts-comments.nvim | https://github.com/folke/ts-comments.nvim |
| lazydev.nvim | https://github.com/folke/lazydev.nvim |
| nvim-treesitter | https://github.com/nvim-treesitter/nvim-treesitter |
| nvim-treesitter-textobjects | https://github.com/nvim-treesitter/nvim-treesitter-textobjects |
| nvim-lspconfig | https://github.com/neovim/nvim-lspconfig |
| mason.nvim | https://github.com/mason-org/mason.nvim |
| mason-lspconfig.nvim | https://github.com/mason-org/mason-lspconfig.nvim |

### MIT Licensed

| Plugin | Repository |
|--------|------------|
| catppuccin/nvim | https://github.com/catppuccin/nvim |
| lualine.nvim | https://github.com/nvim-lualine/lualine.nvim |
| gitsigns.nvim | https://github.com/lewis6991/gitsigns.nvim |
| nui.nvim | https://github.com/MunifTanjim/nui.nvim |
| mini.nvim (mini.ai, mini.icons, mini.pairs) | https://github.com/echasnovski/mini.nvim |
| conform.nvim | https://github.com/stevearc/conform.nvim |
| grug-far.nvim | https://github.com/MagicDuck/grug-far.nvim |
| nvim-ts-autotag | https://github.com/windwp/nvim-ts-autotag |
| mason-tool-installer.nvim | https://github.com/WhoIsSethDaniel/mason-tool-installer.nvim |
| blink.cmp | https://github.com/Saghen/blink.cmp |
| friendly-snippets | https://github.com/rafamadriz/friendly-snippets |
| persistence.nvim | https://github.com/folke/persistence.nvim |
| nvim-lint | https://github.com/mfussenegger/nvim-lint |

### Disabled (license incompatible)

| Plugin | License | Reason |
|--------|---------|--------|
| bufferline.nvim | GPL-3.0 | Incompatible with BUSL-1.1; disabled in init.lua |

---

## LSP Servers & Tools (auto-installed via Mason on first editor launch)

These are downloaded by Mason at runtime into `~/.local/share/soulforge/mason/`.
SoulForge does not bundle or redistribute these — Mason downloads official releases.

| Tool | License | Source |
|------|---------|--------|
| typescript-language-server | MIT | https://github.com/typescript-language-server/typescript-language-server |
| pyright | MIT | https://github.com/microsoft/pyright |
| ruff | MIT | https://github.com/astral-sh/ruff |
| eslint-lsp | MIT | https://github.com/microsoft/vscode-eslint |
| biome | MIT | https://github.com/biomejs/biome |
| lua-language-server | MIT | https://github.com/LuaLS/lua-language-server |
| rust-analyzer | Apache-2.0 / MIT | https://github.com/rust-lang/rust-analyzer |
| gopls | BSD-3-Clause | https://github.com/golang/tools |
| clangd | Apache-2.0 (LLVM) | https://github.com/clangd/clangd |
| json-lsp | MIT | https://github.com/microsoft/vscode |
| yaml-language-server | MIT | https://github.com/redhat-developer/yaml-language-server |
| html-lsp | MIT | https://github.com/microsoft/vscode |
| css-lsp | MIT | https://github.com/microsoft/vscode |
| tailwindcss-language-server | MIT | https://github.com/tailwindlabs/tailwindcss-intellisense |
| bash-language-server | MIT | https://github.com/bash-lsp/bash-language-server |
| emmet-language-server | MIT | https://github.com/olrtg/emmet-language-server |
| svelte-language-server | MIT | https://github.com/sveltejs/language-tools |
| vue-language-server | MIT | https://github.com/vuejs/language-tools |
| graphql-language-service-cli | MIT | https://github.com/graphql/graphiql |
| astro-language-server | MIT | https://github.com/withastro/language-tools |
| dockerfile-language-server | MIT | https://github.com/rcjsuen/dockerfile-language-server |
| docker-compose-language-service | MIT | https://github.com/microsoft/compose-language-service |
| marksman | MIT | https://github.com/artempyanykh/marksman |
| sqlls | MIT | https://github.com/joe-re/sql-language-server |
| taplo | MIT | https://github.com/tamasfe/taplo |
| prettier | MIT | https://github.com/prettier/prettier |
| shfmt | BSD-3-Clause | https://github.com/mvdan/sh |
| stylua | MPL-2.0 | https://github.com/JohnnyMorganz/StyLua |
| black | MIT | https://github.com/psf/black |
| isort | MIT | https://github.com/PyCQA/isort |
| shellcheck | GPL-3.0 | https://github.com/koalaman/shellcheck |

**Note on shellcheck**: GPL-3.0 licensed but downloaded and executed as a standalone binary
at runtime — not linked into or distributed with SoulForge. This is standard usage
(same as running any GPL CLI tool from a non-GPL editor).

---

## License Texts

### Apache License 2.0

Full text: https://www.apache.org/licenses/LICENSE-2.0

### MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

### ISC License

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES.

### SIL Open Font License 1.1

Full text: https://openfontlicense.org/open-font-license-official-text/

### Unlicense

This is free and unencumbered software released into the public domain.
Full text: https://unlicense.org/

### BSD-3-Clause License

Full text: https://opensource.org/licenses/BSD-3-Clause

### Mozilla Public License 2.0

Full text: https://www.mozilla.org/en-US/MPL/2.0/
