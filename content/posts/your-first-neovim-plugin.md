+++
title = "Your first Neovim plugin"
date = "2026-07-18T02:59:14-04:00"
draft = false
description = "A hands-on walkthrough from empty directory to a working command, using nothing but Neovim's built-in plugin discovery. Skip the theory; build the plugin first."
tags = ["neovim", "lua", "nvim-plugin", "plugin-development", "getting-started"]
categories = ["Neovim"]
ShowToc = true

[cover]
image = "/images/og/your-first-neovim-plugin.png"
hiddenInList = true
hiddenInSingle = true
+++

A pattern shows up in almost every Neovim user I talk to who has been using the editor for a year or two. They have their config version-controlled. They know their leader mappings by feel. They can name ten plugins they rely on daily. And they've been meaning to write one of their own for months.

The gap between using a plugin and writing one feels larger than it actually is. Not because the work is hard, but because nothing in the getting-started path makes the shape of a plugin obvious. Every tutorial jumps to configuration DSLs, package managers, or a distribution's opinion about layout. The mechanics underneath all of that — how Neovim actually finds and loads your code — stay invisible right up until you try to write a plugin, at which point they become the whole problem.

This post skips the theory. We're going to build a small, useful plugin end-to-end and get it loading in your editor in under ten minutes. What you'll have at the end is a plugin the same way any installed plugin is a plugin — sourced by Neovim through the same mechanism, discoverable through the same runtime path, indistinguishable from something you'd install from GitHub. The next post in this series explains *why* the pieces fit together the way they do. This one is about producing evidence that plugin development is not mysterious.

## What we're building

The plugin will expose one command: `:StripTrailingWhitespace`. Invoking it removes trailing whitespace from every line in the current buffer, without moving the cursor or clobbering search history. It's a tiny operation, but it's the kind of thing you'd genuinely install a plugin for — and it has enough surface (a command, a Lua module, a configurable option, an autocommand) to touch every major building block you'll use when writing anything larger.

The whole plugin fits in two files and about fifty lines of Lua. No external dependencies. No plugin manager required.

## Create the plugin directory

Neovim ships with a built-in mechanism for loading local plugins that predates every plugin manager: the `pack/` directory under your config. Any directory that follows the pattern `~/.config/nvim/pack/<any-name>/start/<plugin-name>/` gets sourced automatically at startup, exactly the way an installed plugin would be. We'll put our plugin there:

```bash
mkdir -p ~/.config/nvim/pack/local/start/strip-trailing-ws/plugin
mkdir -p ~/.config/nvim/pack/local/start/strip-trailing-ws/lua/strip_trailing_ws
```

The `local` in the path is arbitrary — it's a bucket name for plugins you author yourself, distinct from anything a plugin manager might create. `start` means "load at startup" (as opposed to `opt`, which loads on demand via `:packadd`). The `strip-trailing-ws` at the end is the plugin's name, and it's the root directory Neovim will treat as a single plugin.

Two things about the Lua subdirectory name deserve a note. First, it uses underscores instead of the hyphen in the plugin name — this isn't stylistic, it's structural. Lua's `require` function does not accept hyphens in module names, so if the plugin is named `strip-trailing-ws`, the Lua module name has to be `strip_trailing_ws`. Second, the directory pattern is `lua/<module_name>/`, not `lua/`. Neovim treats each subdirectory of `lua/` as a Lua module you can `require()` — the module path mirrors the filesystem path.

## The single file that makes it work

Create `~/.config/nvim/pack/local/start/strip-trailing-ws/plugin/strip-trailing-ws.lua` with the following:

```lua
vim.api.nvim_create_user_command("StripTrailingWhitespace", function()
  local view = vim.fn.winsaveview()
  vim.cmd([[keepjumps keeppatterns %s/\s\+$//e]])
  vim.fn.winrestview(view)
end, {
  desc = "Strip trailing whitespace from the current buffer",
})
```

That's the whole plugin. Restart Neovim, then run `:StripTrailingWhitespace` in a buffer that has trailing whitespace somewhere. The whitespace is gone; your cursor didn't move; your last search wasn't overwritten by the substitution's pattern.

A few things happened that are worth naming. Neovim scanned your `pack/` directories on startup, found the `strip-trailing-ws` plugin, and eagerly sourced every Lua file in its `plugin/` subdirectory. Sourcing our file registered the `:StripTrailingWhitespace` command. The command is now available every time you open Neovim, without you touching your `init.lua`. This is what "installing a plugin" actually is — every plugin manager you've used is fundamentally just automation around dropping a directory in this same location.

The `keepjumps keeppatterns` prefix keeps the substitution from polluting the jumplist or the search-pattern history. The `//e` suffix on the substitution suppresses the "pattern not found" error when the buffer happens to have no trailing whitespace. The `winsaveview` / `winrestview` pair preserves cursor position, scroll offset, and folds across the buffer mutation. These are the small mechanical details that separate a plugin someone actually wants to use from one that fights the user.

Before we add anything else, confirm the plugin is actually loading. Type `:StripTrail` and press tab — the command should complete to `:StripTrailingWhitespace`. If it doesn't, Neovim didn't discover the plugin, and the fault is almost always a typo in the directory path (`pack/local/start/` is the exact spelling; `packages/` and `plugins/` are the common misses). Getting the discovery right once means you never have to think about it again for anything you build later.

## Extract the logic into a Lua module

A single-file plugin is a legitimate shape — some plugins live their entire lives in `plugin/*.lua` and never grow beyond it. Ours will, though, because we're going to add a configurable option and an autocommand hook. That means the logic needs to be importable from more than one place, which means it needs to live in a Lua module.

Create `~/.config/nvim/pack/local/start/strip-trailing-ws/lua/strip_trailing_ws/init.lua`:

```lua
local M = {}

function M.strip(bufnr)
  bufnr = bufnr or 0
  local view = vim.fn.winsaveview()
  vim.api.nvim_buf_call(bufnr, function()
    vim.cmd([[keepjumps keeppatterns %s/\s\+$//e]])
  end)
  vim.fn.winrestview(view)
end

return M
```

Then update the `plugin/` file to delegate to it:

```lua
vim.api.nvim_create_user_command("StripTrailingWhitespace", function()
  require("strip_trailing_ws").strip()
end, {
  desc = "Strip trailing whitespace from the current buffer",
})
```

Two things changed. The substitution logic is now a function on a module we can `require()`, so other code — including our own autocommand later — can call it without duplicating the implementation. And the `vim.api.nvim_buf_call` wrapper lets us run the substitution against an explicit buffer number, which matters the moment we start firing it from an event that might not target the current buffer.

Restart Neovim and confirm the command still works. The behavior is identical to what we had before; the structure is what changed. That's the whole point of this stage: separating the user-facing surface (`plugin/`) from the reusable logic (`lua/`) is the smallest structural distinction that matters, and it's the one you'll reach for over and over as anything you write grows past twenty lines.

## Add a configurable option and a save-time hook

The plugin does something useful, but it makes the user run the command manually every time. Most people who want trailing whitespace stripped want it stripped on save, and they want it not stripped in files where trailing whitespace is meaningful (Markdown, for example, uses two trailing spaces to mean a line break; diffs preserve trailing whitespace deliberately). Both of those are configuration decisions the plugin's author cannot make for the user — they need to be user-facing knobs.

Replace `lua/strip_trailing_ws/init.lua` with:

```lua
local M = {}

local config = {
  excluded_filetypes = { "markdown", "diff" },
  on_save = false,
}

function M.setup(opts)
  config = vim.tbl_deep_extend("force", config, opts or {})

  if config.on_save then
    local group = vim.api.nvim_create_augroup("StripTrailingWS", { clear = true })
    vim.api.nvim_create_autocmd("BufWritePre", {
      group = group,
      callback = function(args)
        M.strip(args.buf)
      end,
    })
  end
end

function M.strip(bufnr)
  bufnr = bufnr or 0
  if vim.tbl_contains(config.excluded_filetypes, vim.bo[bufnr].filetype) then
    return
  end
  local view = vim.fn.winsaveview()
  vim.api.nvim_buf_call(bufnr, function()
    vim.cmd([[keepjumps keeppatterns %s/\s\+$//e]])
  end)
  vim.fn.winrestview(view)
end

return M
```

Nothing else needs to change. The `plugin/` file still registers the command; the command still calls `require("strip_trailing_ws").strip()`; the user now has the option of also calling `require("strip_trailing_ws").setup({ on_save = true })` from their config to opt in to save-time stripping. The `excluded_filetypes` list applies to both the manual command and the autocommand, so a user who runs `:StripTrailingWhitespace` in a Markdown buffer gets the same "no, we're not touching this file" behavior as the autocommand would give them.

To exercise the autocommand path, add this to your `init.lua`:

```lua
require("strip_trailing_ws").setup({ on_save = true })
```

Save a buffer with trailing whitespace. The whitespace is gone before the file hits disk.

## What you have now

The completed plugin's tree, from the `strip-trailing-ws/` root:

```text
strip-trailing-ws/
├── plugin/
│   └── strip-trailing-ws.lua
└── lua/
    └── strip_trailing_ws/
        └── init.lua
```

Two files, about fifty lines of Lua. It exposes a `:StripTrailingWhitespace` command that's always available, a `setup()` function users can call to opt in to save-time behavior, and a filetype exclusion list users can override without editing your source. Everything a plugin distributed on GitHub would do, minus the GitHub — the mechanism is identical.

In production you'd almost certainly install a plugin through a package manager rather than by dropping it in `pack/local/start/`. The install path differs; nothing else does. The manager creates a directory, adds it to Neovim's runtime path, and Neovim discovers your plugin's files using the same rules that just discovered ours.

You have a plugin. [The next post in this series]({{< ref "posts/how-neovim-actually-loads-a-plugin.md" >}}) explains why every one of those files lives where it does — why `plugin/` versus `lua/`, why the underscore versus the hyphen, and what the other directory names you'll see in mature plugins (`ftplugin/`, `after/`, `doc/`, `queries/`) are for. The directory names aren't arbitrary; they're a contract with Neovim, and once you know the contract, every plugin you look at makes more sense than it did before.
