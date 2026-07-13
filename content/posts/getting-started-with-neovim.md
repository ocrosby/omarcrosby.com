+++
title = "Getting started with Neovim"
date = 2026-07-13T09:00:00-04:00
draft = false
summary = "A practical starter track: install Neovim, put your config in a GitHub repo you own, and layer on a small set of plugins that turn the empty editor into something you'll want to keep using."
tags = ["neovim", "lua", "developer-tools", "personal-development-environment", "getting-started"]
categories = ["Neovim"]
ShowToc = true

[cover]
image = "/images/og/getting-started-with-neovim.png"
hiddenInList = true
hiddenInSingle = true
+++

If you've heard the case for Neovim and want to try it — [I made the case here]({{< ref "posts/why-i-love-neovim.md" >}}) — this post is the on-ramp. By the end you'll have Neovim installed, your configuration in a GitHub repo you own, and a small, deliberate set of plugins that makes the editor pleasant to work in without being overwhelming.

I'm keeping the scope narrow on purpose. The internet has plenty of "here are 40 plugins I use" posts and none of them are what a beginner should copy on day one. The starter you'll finish this post with is something like fifteen files of Lua, most of which you can read in a single sitting. It's built to grow.

## What you'll end up with

A `~/.config/nvim/` directory backed by a GitHub repo, cloneable to any machine, with:

- Neovim installed and current
- A plugin manager set up to install everything on first launch
- A file explorer, fuzzy finder, dashboard, and floating terminal — all from a single utility plugin
- Syntax highlighting via Treesitter
- LSP wired up so definitions, hovers, and diagnostics work out of the box
- Autocompletion, git signs in the gutter, and a status line
- A color scheme that's actually pleasant to look at

Roughly one hour of work if you follow along without detours.

## Install Neovim

Homebrew is the shortest path on macOS:

```bash
brew install neovim
```

On Ubuntu and Debian the version in `apt` lags reality by two years or more, which is a real problem because plugins target current Neovim. Prefer the AppImage from the official releases:

```bash
curl -L https://github.com/neovim/neovim/releases/latest/download/nvim-linux-x86_64.appimage \
  -o /usr/local/bin/nvim
chmod +x /usr/local/bin/nvim
```

On Windows `winget install Neovim.Neovim` works, though most of the ecosystem assumes a Unix-shaped filesystem. If you can, run Neovim inside WSL and treat the whole setup as Linux.

Confirm the install:

```bash
nvim --version | head -1
```

You want `NVIM v0.11.x` or later. Most plugins listed below drop support for anything older than 0.10.

## Put your config in a GitHub repo before you write a single line

This is the piece most beginner tutorials skip and it changes the whole experience. Neovim reads its configuration from `~/.config/nvim/` on Unix. If you write it in place, your dotfiles are stranded on one machine. If you back the directory with a public GitHub repo, your editor moves with you.

Create an empty repo on GitHub called `nvim` (or `dotfiles-nvim`, or `pde` — the name is only visible to you). Then:

```bash
mkdir -p ~/.config
cd ~/.config
git clone git@github.com:<your-user>/nvim.git
cd nvim
```

You now have an empty `~/.config/nvim/` that is a git working copy. Every change you make becomes a commit you can revert or roll forward. When you set up a new machine, `git clone` into `~/.config/nvim/` and everything is there.

Commit after each step below — the diffs make a much better learning artifact than a single dump.

## Lay out the directory structure

There is more than one right way to structure a Neovim config, but the pattern that scales is *one concern per file, plugins loaded via a modular directory*. This is the shape you'll grow into:

```text
~/.config/nvim/
├── init.lua                       # entry point — kept small
├── lua/
│   ├── config/
│   │   ├── options.lua            # vim.opt settings
│   │   ├── keymaps.lua            # non-plugin keymaps
│   │   └── autocmds.lua           # global autocommands
│   ├── plugins/                   # one file per plugin (spec-only)
│   │   ├── snacks.lua
│   │   ├── treesitter.lua
│   │   ├── lsp.lua
│   │   ├── completion.lua
│   │   ├── git.lua
│   │   ├── statusline.lua
│   │   ├── colorscheme.lua
│   │   ├── whichkey.lua
│   │   └── formatting.lua
│   └── lazy-bootstrap.lua         # clones the plugin manager if missing
├── lazy-lock.json                 # generated — pins every plugin's commit
├── .gitignore
└── README.md
```

Two things worth flagging up front:

- **`init.lua` stays small.** All it does is set the leader key, bootstrap the plugin manager, and require the config modules. Everything real lives in `lua/`.
- **`plugins/` is one file per concern.** When you decide you don't like a plugin, you delete one file and remove nothing from anywhere else — no ripple through five other files.

Create the tree:

```bash
mkdir -p lua/config lua/plugins
touch init.lua lua/lazy-bootstrap.lua
touch lua/config/{options,keymaps,autocmds}.lua
touch lua/plugins/{snacks,treesitter,lsp,completion,git,statusline,colorscheme,whichkey,formatting}.lua
```

## Bootstrap the plugin manager

`lazy.nvim` is the plugin manager the modern Neovim community has converged on. It handles installation, updates, and lazy-loading based on events, commands, or filetypes. You install it once by having your config clone it on first launch.

`lua/lazy-bootstrap.lua`:

```lua
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  local lazyrepo = "https://github.com/folke/lazy.nvim.git"
  local out = vim.fn.system({
    "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath,
  })
  if vim.v.shell_error ~= 0 then
    vim.api.nvim_echo({
      { "Failed to clone lazy.nvim:\n", "ErrorMsg" },
      { out, "WarningMsg" },
      { "\nPress any key to exit..." },
    }, true, {})
    vim.fn.getchar()
    os.exit(1)
  end
end
vim.opt.rtp:prepend(lazypath)
```

That is the pattern lazy.nvim's docs prescribe: check whether the plugin manager is on disk, clone the stable branch if not, then prepend its install path to the runtime path so `require("lazy")` works.

## Write the entry point

`init.lua`:

```lua
-- Leader key first — must be set before plugins load, some read it at import time.
vim.g.mapleader = " "
vim.g.maplocalleader = " "

require("lazy-bootstrap")

require("config.options")
require("config.keymaps")
require("config.autocmds")

require("lazy").setup({
  { import = "plugins" },
}, {
  checker = { enabled = true, notify = false },
  change_detection = { notify = false },
  install = { colorscheme = { "tokyonight", "habamax" } },
})
```

`{ import = "plugins" }` tells lazy to walk `lua/plugins/*.lua` and treat each file's return value as one or more plugin specs. That's what keeps the directory scannable — you never touch this file again to add a plugin.

## Options, keymaps, autocmds

`lua/config/options.lua` — the settings I'd suggest for anyone starting:

```lua
local opt = vim.opt

opt.number         = true
opt.relativenumber = true
opt.mouse          = "a"
opt.showmode       = false            -- lualine will show the mode

opt.clipboard      = "unnamedplus"    -- system clipboard by default
opt.breakindent    = true
opt.undofile       = true             -- persistent undo across sessions

opt.ignorecase     = true
opt.smartcase      = true

opt.signcolumn     = "yes"            -- always visible; avoids UI shift
opt.updatetime     = 250
opt.timeoutlen     = 300              -- which-key wants a short one

opt.splitright     = true
opt.splitbelow     = true

opt.list           = true
opt.listchars      = { tab = "» ", trail = "·", nbsp = "␣" }
opt.inccommand     = "split"          -- live preview for :s
opt.cursorline     = true
opt.scrolloff      = 10
```

`lua/config/keymaps.lua` — sparse for now, resist the temptation to bind everything:

```lua
local map = vim.keymap.set

map("n", "<Esc>", "<cmd>nohlsearch<CR>")

-- Diagnostics
map("n", "[d", vim.diagnostic.goto_prev, { desc = "Prev diagnostic" })
map("n", "]d", vim.diagnostic.goto_next, { desc = "Next diagnostic" })
map("n", "<leader>xd", vim.diagnostic.open_float, { desc = "Diagnostic float" })

-- Window navigation
map("n", "<C-h>", "<C-w><C-h>", { desc = "Move to left window" })
map("n", "<C-l>", "<C-w><C-l>", { desc = "Move to right window" })
map("n", "<C-j>", "<C-w><C-j>", { desc = "Move to lower window" })
map("n", "<C-k>", "<C-w><C-k>", { desc = "Move to upper window" })
```

`lua/config/autocmds.lua`:

```lua
-- Highlight yanked text briefly so you can see what you picked up.
vim.api.nvim_create_autocmd("TextYankPost", {
  group = vim.api.nvim_create_augroup("HighlightYank", { clear = true }),
  callback = function() vim.hl.on_yank() end,
})
```

## The starter plugin set

Every file below returns a lazy.nvim spec — a table describing the plugin, its dependencies, and when to load it. Lazy handles the rest.

### Utility toolkit — `lua/plugins/snacks.lua`

`snacks.nvim` is a single plugin from folke (the author of lazy.nvim) that bundles a dashboard, fuzzy picker, file explorer, floating terminal, notification stack, quickfile loader, and a dozen other quality-of-life pieces. For a starter it's the highest-leverage single plugin you can add — it replaces four or five plugins a typical starter config would otherwise pull in.

```lua
return {
  "folke/snacks.nvim",
  priority = 1000,
  lazy = false,
  opts = {
    dashboard = { enabled = true },
    explorer  = { enabled = true, replace_netrw = true },
    picker    = { enabled = true },
    terminal  = { enabled = true },
    notifier  = { enabled = true },
    quickfile = { enabled = true },
    input     = { enabled = true },
    bigfile   = { enabled = true },
  },
  keys = {
    { "<leader>ff", function() Snacks.picker.files()   end, desc = "Find file" },
    { "<leader>fg", function() Snacks.picker.grep()    end, desc = "Live grep" },
    { "<leader>fb", function() Snacks.picker.buffers() end, desc = "Buffers" },
    { "<leader>fh", function() Snacks.picker.help()    end, desc = "Help tags" },
    { "<leader>e",  function() Snacks.explorer()       end, desc = "File explorer" },
    { "<leader>t",  function() Snacks.terminal()       end, desc = "Floating terminal" },
    { "<leader>n",  function() Snacks.notifier.show_history() end, desc = "Notifications" },
  },
}
```

If you outgrow any of its pieces later you can disable that piece and swap in a specialist. Until then, this one plugin is your dashboard, your fuzzy finder, your explorer, and your terminal.

### Syntax highlighting — `lua/plugins/treesitter.lua`

Treesitter parses source code into a syntax tree and drives highlighting, indentation, and structural motions. It's what makes Neovim feel modern.

```lua
return {
  "nvim-treesitter/nvim-treesitter",
  build = ":TSUpdate",
  event = { "BufReadPost", "BufNewFile" },
  main = "nvim-treesitter.configs",
  opts = {
    ensure_installed = {
      "bash", "c", "diff", "html", "lua", "luadoc", "markdown", "markdown_inline",
      "query", "vim", "vimdoc",
      -- add whichever languages you write:
      "go", "python", "typescript", "javascript", "json", "yaml", "toml",
    },
    highlight = { enable = true },
    indent    = { enable = true },
    auto_install = true,
  },
}
```

### LSP — `lua/plugins/lsp.lua`

Language Server Protocol support is where "go-to-definition, hover docs, rename, diagnostics" come from — the things people mean when they say "IDE features." Mason downloads the servers, `nvim-lspconfig` supplies the wiring, and you tell them which servers to install.

```lua
return {
  "neovim/nvim-lspconfig",
  event = { "BufReadPre", "BufNewFile" },
  dependencies = {
    { "williamboman/mason.nvim", opts = {} },
    { "williamboman/mason-lspconfig.nvim" },
  },
  config = function()
    require("mason-lspconfig").setup({
      ensure_installed = {
        "lua_ls",
        "gopls",
        "pyright",
        "ts_ls",
      },
      automatic_installation = true,
    })

    vim.api.nvim_create_autocmd("LspAttach", {
      group = vim.api.nvim_create_augroup("UserLspAttach", { clear = true }),
      callback = function(event)
        local map = function(keys, fn, desc)
          vim.keymap.set("n", keys, fn, { buffer = event.buf, desc = "LSP: " .. desc })
        end
        map("gd", vim.lsp.buf.definition,     "Definition")
        map("gr", vim.lsp.buf.references,     "References")
        map("gI", vim.lsp.buf.implementation, "Implementation")
        map("K",  vim.lsp.buf.hover,          "Hover")
        map("<leader>rn", vim.lsp.buf.rename,      "Rename")
        map("<leader>ca", vim.lsp.buf.code_action, "Code action")
      end,
    })
  end,
}
```

Replace `ensure_installed` with servers for the languages you actually write. Mason has the full catalog at `:Mason`.

### Completion — `lua/plugins/completion.lua`

`blink.cmp` is a fast, Rust-backed completion engine that pulls suggestions from your LSP, buffer text, and snippets. It has replaced the older `nvim-cmp` in most starter tracks worth reading.

```lua
return {
  "saghen/blink.cmp",
  event = "InsertEnter",
  version = "*",
  opts = {
    keymap = { preset = "default" },
    appearance = { nerd_font_variant = "mono" },
    completion = {
      documentation = { auto_show = true, auto_show_delay_ms = 250 },
      menu = { border = "rounded" },
      ghost_text = { enabled = true },
    },
    sources = {
      default = { "lsp", "path", "snippets", "buffer" },
    },
    signature = { enabled = true },
  },
}
```

### Git — `lua/plugins/git.lua`

`gitsigns.nvim` draws add/change/delete markers in the sign column and gives you inline blame plus hunk-level actions (stage, undo, preview) without leaving the buffer.

```lua
return {
  "lewis6991/gitsigns.nvim",
  event = { "BufReadPre", "BufNewFile" },
  opts = {
    signs = {
      add          = { text = "│" },
      change       = { text = "│" },
      delete       = { text = "_" },
      topdelete    = { text = "‾" },
      changedelete = { text = "~" },
    },
    current_line_blame = true,
    current_line_blame_opts = { delay = 500 },
  },
}
```

### Status line — `lua/plugins/statusline.lua`

`lualine.nvim` is the modern replacement for airline. Shows the mode, current branch, diagnostics, and file position.

```lua
return {
  "nvim-lualine/lualine.nvim",
  event = "VeryLazy",
  opts = {
    options = {
      theme = "tokyonight",
      component_separators = { left = "│", right = "│" },
      section_separators   = { left = "",  right = "" },
      globalstatus = true,
    },
    sections = {
      lualine_a = { "mode" },
      lualine_b = { "branch", "diff", "diagnostics" },
      lualine_c = { { "filename", path = 1 } },
      lualine_x = { "filetype" },
      lualine_y = { "progress" },
      lualine_z = { "location" },
    },
  },
}
```

### Color scheme — `lua/plugins/colorscheme.lua`

Pick one strong default and move on. `tokyonight` reads well in most terminals, has broad plugin support, and doesn't fight your monitor at night. Alternatives worth knowing: `catppuccin/nvim` and `rebelot/kanagawa.nvim`.

```lua
return {
  "folke/tokyonight.nvim",
  priority = 1000,
  lazy = false,
  config = function()
    require("tokyonight").setup({ style = "night" })
    vim.cmd.colorscheme("tokyonight")
  end,
}
```

### Keymap hints — `lua/plugins/whichkey.lua`

If you take one plugin from this list because it makes the *learning* easier, take this one. `which-key.nvim` pops a floating panel showing every keybinding whose prefix you've typed so far. Start typing `<space>` and it shows you every leader-prefixed mapping in the config.

```lua
return {
  "folke/which-key.nvim",
  event = "VeryLazy",
  opts = {
    preset = "modern",
    delay = 300,
  },
}
```

### Formatting — `lua/plugins/formatting.lua`

`conform.nvim` runs a formatter of your choice (stylua, gofmt, prettier, ruff) on save. Falls back to LSP-provided formatting when you haven't declared one.

```lua
return {
  "stevearc/conform.nvim",
  event = { "BufWritePre" },
  cmd = { "ConformInfo" },
  keys = {
    { "<leader>f",
      function() require("conform").format({ async = true, lsp_format = "fallback" }) end,
      desc = "Format buffer" },
  },
  opts = {
    format_on_save = { timeout_ms = 500, lsp_format = "fallback" },
    formatters_by_ft = {
      lua        = { "stylua" },
      go         = { "goimports", "gofumpt" },
      python     = { "ruff_format" },
      javascript = { "prettier" },
      typescript = { "prettier" },
      json       = { "prettier" },
      markdown   = { "prettier" },
    },
  },
}
```

## First launch

Open Neovim:

```bash
nvim
```

Lazy will notice the plugin specs, install everything, and show a summary panel. Quit and restart once so plugins load cleanly. Mason may take another minute to pull the language servers you asked for — you can watch it with `:Mason`.

If something explodes on first load, it's almost always one of two things. Either the plugin manager didn't finish cloning (quit and rerun `nvim`), or a plugin spec has a typo (check `~/.local/state/nvim/lazy.log`). Neovim tells you where the error came from, and lazy's floating panel is friendlier than it looks.

## Commit and push

```bash
cd ~/.config/nvim
git add .
git commit -m "feat: initial Neovim configuration"
git push
```

Commit `lazy-lock.json` — that's the file recording exactly which commit of each plugin you're running. On a new machine, `git clone && nvim` will install the *same* versions, not whatever happens to be at HEAD on release day. The lockfile is the whole point of "your editor moves with you."

## Where to go from here

You now have a config you own. From here:

- **Watch someone else build one.** TJ DeVries — the current lead of the Neovim core team — has a talk that frames the whole approach as a Personal Development Environment, and his framing is what made the effort make sense to me:

  {{< youtube QMVIJhC9Veg >}}

  For a longer, more code-forward track, the [From 0 to IDE in Neovim from scratch](https://www.youtube.com/playlist?list=PLsz00TDipIffreIaUNk64KxTIkQaGguqn) playlist by typecraft walks through a similar zero-to-IDE build at more depth. A good place to start in that series:

  {{< youtube zHTeCSVAFNY >}}

- **Read [kickstart.nvim](https://github.com/nvim-lua/kickstart.nvim).** It's a curated single-file starter maintained by the community. Once you understand the shape of yours, kickstart is a great source of "how would experienced people configure X."

- **Look at bigger distributions.** [LazyVim](https://www.lazyvim.org/), [NvChad](https://nvchad.com/), and [AstroNvim](https://astronvim.com/) are batteries-included distributions. If you'd rather run someone else's config for a while and swap out pieces gradually, they're all reasonable starting points. My take is that writing your own is worth the effort — the point of Neovim is that the editor becomes yours — but there's no wrong answer.

- **Add plugins one at a time.** Every plugin you install is a promise to maintain something. Take a couple of weeks in this config before you decide what's missing. Most of what feels missing turns out to be a Neovim built-in you haven't discovered yet.

If the philosophy piece hasn't clicked and you're still wondering why anyone would put this much effort into an editor, [I wrote about that separately]({{< ref "posts/why-i-love-neovim.md" >}}). But you don't need to be sold on the case to start — the fastest way to know whether Neovim will suit you is to live in a config you built yourself for a week and decide.
