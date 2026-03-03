-- SoulForge default neovim config
-- Only loaded when user has no ~/.config/nvim/init.{lua,vim}

local o = vim.o
local opt = vim.opt

-- ─── SoulForge data dir for plugins ───
local data_dir = vim.fn.stdpath("data") .. "/soulforge"
local plugins_dir = data_dir .. "/plugins"

-- ─── Display (IDE-like defaults) ───
o.number = true
o.relativenumber = true
o.cursorline = true
o.signcolumn = "yes"
o.termguicolors = true
o.showmode = false
o.laststatus = 0
o.scrolloff = 8
o.sidescrolloff = 8
o.wrap = true
o.linebreak = true        -- wrap at word boundaries, not mid-word
o.breakindent = true       -- wrapped lines preserve indentation
opt.breakindentopt = { "shift:2" } -- indent wrapped continuation by 2
o.showbreak = "↪ "        -- visual indicator for wrapped lines
o.conceallevel = 0         -- show all text as-is (no hiding markup)
o.pumheight = 12           -- max completion popup height
o.cmdheight = 1
o.fillchars = "eob: "     -- hide ~ on empty lines

-- ─── Indentation ───
o.tabstop = 2
o.shiftwidth = 2
o.expandtab = true
o.smartindent = true
o.autoindent = true
o.shiftround = true        -- round indent to multiple of shiftwidth

-- ─── Behavior ───
o.autoread = true
o.clipboard = "unnamedplus"
o.updatetime = 300
o.swapfile = false
o.undofile = true
o.mouse = "a"
o.splitright = true
o.splitbelow = true
o.confirm = true           -- ask to save instead of erroring
o.virtualedit = "block"    -- allow cursor past end in visual block
o.inccommand = "split"     -- live preview for :s substitutions
o.completeopt = "menuone,noselect,popup"
o.wildmode = "longest:full,full"
opt.shortmess:append("sI") -- reduce startup messages

-- ─── Search ───
o.ignorecase = true
o.smartcase = true
o.hlsearch = true
o.incsearch = true

-- ─── Auto-reload files changed on disk ───
vim.api.nvim_create_autocmd({ "FocusGained", "BufEnter", "CursorHold" }, {
  pattern = "*",
  command = "checktime",
})

-- ─── Diagnostic display ───
vim.diagnostic.config({
  virtual_text = { prefix = "●" },
  signs = true,
  underline = true,
  update_in_insert = false,
  severity_sort = true,
})

-- ─── Bootstrap plugin: clone if missing ───
local function ensure_plugin(name, url)
  local path = plugins_dir .. "/" .. name
  if not vim.uv.fs_stat(path) then
    vim.fn.mkdir(plugins_dir, "p")
    vim.fn.system({ "git", "clone", "--filter=blob:none", "--depth=1", url, path })
  end
  vim.opt.runtimepath:prepend(path)
  return path
end

-- ─── Catppuccin theme ───
pcall(function()
  ensure_plugin("catppuccin", "https://github.com/catppuccin/nvim")
  require("catppuccin").setup({
    flavour = "mocha",
    integrations = {
      nvimtree = true,
      treesitter = true,
      mason = true,
      native_lsp = {
        enabled = true,
        underlines = {
          errors = { "undercurl" },
          hints = { "undercurl" },
          warnings = { "undercurl" },
          information = { "undercurl" },
        },
      },
    },
  })
  vim.cmd.colorscheme("catppuccin")
end)

-- ─── Tree-sitter ───
pcall(function()
  local ts_path = ensure_plugin("nvim-treesitter", "https://github.com/nvim-treesitter/nvim-treesitter")
  -- Add parsers install dir to runtimepath
  vim.opt.runtimepath:append(ts_path)

  require("nvim-treesitter.configs").setup({
    ensure_installed = {
      "typescript", "tsx", "javascript", "json", "html", "css",
      "lua", "python", "rust", "go", "c", "cpp", "bash",
      "markdown", "markdown_inline", "yaml", "toml", "diff",
      "vim", "vimdoc", "regex", "query",
    },
    auto_install = true,
    highlight = {
      enable = true,
      additional_vim_regex_highlighting = false,
    },
    indent = { enable = true },
    incremental_selection = {
      enable = true,
      keymaps = {
        init_selection = "<C-space>",
        node_incremental = "<C-space>",
        scope_incremental = false,
        node_decremental = "<bs>",
      },
    },
  })
end)

-- ─── nvim-tree (file explorer) ───
local tree_ok = pcall(function()
  ensure_plugin("nvim-web-devicons", "https://github.com/nvim-tree/nvim-web-devicons")
  ensure_plugin("nvim-tree.lua", "https://github.com/nvim-tree/nvim-tree.lua")

  require("nvim-web-devicons").setup()
  require("nvim-tree").setup({
    view = {
      width = 28,
    },
    renderer = {
      icons = {
        show = {
          file = true,
          folder = true,
          folder_arrow = true,
          git = true,
        },
      },
    },
    actions = {
      open_file = {
        quit_on_open = false,
      },
    },
  })
end)

-- Auto-open nvim-tree on VimEnter
if tree_ok then
  vim.api.nvim_create_autocmd("VimEnter", {
    once = true,
    callback = function()
      vim.schedule(function()
        require("nvim-tree.api").tree.open()
      end)
    end,
  })
end

-- ─── mini.nvim (pairs, surround, comment) ───
pcall(function()
  ensure_plugin("mini.nvim", "https://github.com/echasnovski/mini.nvim")

  pcall(function() require("mini.pairs").setup() end)
  pcall(function() require("mini.surround").setup() end)
  pcall(function() require("mini.comment").setup() end)
end)

-- ─── Mason + LSP (v2 API — requires Neovim 0.11+) ───
pcall(function()
  ensure_plugin("mason.nvim", "https://github.com/mason-org/mason.nvim")
  ensure_plugin("mason-lspconfig.nvim", "https://github.com/mason-org/mason-lspconfig.nvim")
  ensure_plugin("nvim-lspconfig", "https://github.com/neovim/nvim-lspconfig")

  require("mason").setup()
  require("mason-lspconfig").setup({
    ensure_installed = {
      "ts_ls",
      "pyright",
      "ruff",
      "eslint",
      "biome",
      "lua_ls",
    },
    automatic_enable = true,
  })

  -- Per-server config via Neovim 0.11 native API
  vim.lsp.config("lua_ls", {
    settings = {
      Lua = {
        diagnostics = {
          globals = { "vim" },
        },
      },
    },
  })
end)

-- ─── Keybindings ───

-- Leader key
vim.g.mapleader = " "

-- File explorer: <leader>e toggles, - finds current file
vim.keymap.set("n", "<leader>e", "<cmd>NvimTreeToggle<CR>", { silent = true, desc = "Toggle file explorer" })
vim.keymap.set("n", "-", "<cmd>NvimTreeFindFile<CR>", { silent = true, desc = "Find current file in explorer" })

-- Better window navigation
vim.keymap.set("n", "<C-h>", "<C-w>h", { silent = true })
vim.keymap.set("n", "<C-j>", "<C-w>j", { silent = true })
vim.keymap.set("n", "<C-k>", "<C-w>k", { silent = true })
vim.keymap.set("n", "<C-l>", "<C-w>l", { silent = true })

-- Clear search highlights
vim.keymap.set("n", "<Esc>", "<cmd>nohlsearch<CR>", { silent = true })

-- Stay in visual mode when indenting
vim.keymap.set("v", "<", "<gv", { silent = true })
vim.keymap.set("v", ">", ">gv", { silent = true })

-- Move lines up/down in visual mode
vim.keymap.set("v", "J", ":m '>+1<CR>gv=gv", { silent = true })
vim.keymap.set("v", "K", ":m '<-2<CR>gv=gv", { silent = true })

-- ─── LSP Keybindings ───
vim.api.nvim_create_autocmd("LspAttach", {
  callback = function(ev)
    local bufopts = { buffer = ev.buf, silent = true }
    vim.keymap.set("n", "gd", vim.lsp.buf.definition, bufopts)
    vim.keymap.set("n", "gD", vim.lsp.buf.declaration, bufopts)
    vim.keymap.set("n", "gi", vim.lsp.buf.implementation, bufopts)
    vim.keymap.set("n", "gy", vim.lsp.buf.type_definition, bufopts)
    vim.keymap.set("n", "K", vim.lsp.buf.hover, bufopts)
    vim.keymap.set("n", "gr", vim.lsp.buf.references, bufopts)
    vim.keymap.set("n", "[d", vim.diagnostic.goto_prev, bufopts)
    vim.keymap.set("n", "]d", vim.diagnostic.goto_next, bufopts)
    vim.keymap.set("n", "<leader>rn", vim.lsp.buf.rename, bufopts)
    vim.keymap.set("n", "<leader>ca", vim.lsp.buf.code_action, bufopts)
    vim.keymap.set("n", "<leader>f", function() vim.lsp.buf.format({ async = true }) end, bufopts)
    vim.keymap.set("i", "<C-k>", vim.lsp.buf.signature_help, bufopts)
  end,
})

-- ─── Filetype detection (fallback) ───
vim.cmd("filetype plugin indent on")
