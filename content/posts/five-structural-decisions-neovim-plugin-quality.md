+++
title = "Five structural decisions that shape a Neovim plugin's future"
date = "2026-07-18T03:34:20-04:00"
draft = false
description = "Five choices every plugin author makes by omission. Get them right and future features fit on top; get them wrong and you rewrite in a year."
tags = ["neovim", "lua", "nvim-plugin", "plugin-development"]
categories = ["Neovim"]
ShowToc = true

[cover]
image = "/images/og/five-structural-decisions-neovim-plugin-quality.png"
hiddenInList = true
hiddenInSingle = true
+++

A pattern shows up when a plugin author reopens their own plugin a year after last touching it. Half the design choices in the code they wrote themselves are now inscrutable. Why does `setup()` bail early when called twice? Why is the autocmd group named the way it is? Why does the picker call path have a `pcall` wrapped around it and a `vim.ui.select` fallback beneath?

The uncomfortable answer, most of the time, is that those choices weren't really decisions when they were made. They were the shape the code happened to take when a specific problem forced it. Five of these shapes recur in every plugin worth shipping, and each one has a recommended default that becomes obvious only in retrospect. Make them consciously in the first hour of work and the plugin absorbs future features without contortion. Skip them, and you'll rediscover them in a year — usually as a rewrite.

[The previous post in this series]({{< ref "posts/neovim-plugin-directory-structure-that-scales.md" >}}) covered the *shape* of a plugin's tree — which directories, which files, when to add each. This post covers the choices embedded inside those files. The tree tells you the what and the when; these five decisions tell you the how.

## Decision 1: Is `setup()` required, or does the plugin work without it?

### Recommendation: it works without `setup()`

The pressure that produces this recommendation is that commands, autocmds, and keymaps registered in `plugin/*.lua` at Neovim startup exist whether the user has called `setup()` or not. If your `:MyCommand` is defined inside a function that only runs after `require("mything").setup()`, users who install the plugin but haven't gotten around to wiring `setup()` into their config will type `:MyCommand`, hit an error, and open an issue on your repo. From their perspective the plugin is broken; from yours, they didn't follow the install instructions. Both perspectives are correct, and both are avoidable.

Design `setup()` as the mechanism for *modifying* behavior, not *enabling* it. Registration goes in `plugin/`, defaults live in `lua/<name>/config.lua`, and `setup(opts)` merges the user's options into those defaults for the plugin's own code to read. A user who never calls `setup()` gets the plugin's default behavior, and their command exists. A user who calls `setup()` gets the same command, with the behavior tuned by whatever they passed in.

The corollary rule that falls out of this: `setup()` must be safe to call zero or many times. A first-time call installs the config; a second call replaces it; a call with no argument returns without change. If `setup()` has irreversible side effects — subscribing to an autocmd, opening a file handle — those side effects need to be idempotent, guarded by a flag, or moved into `plugin/`. Otherwise reloading your Lua config in a running Neovim session will accumulate duplicated behavior every time.

**Recommended:**

```lua
-- lua/mything/init.lua
local M = {}

local defaults = {
  enabled = true,
  excluded_filetypes = {},
}

local config = vim.deepcopy(defaults)

function M.setup(opts)
  -- Idempotent: each call reinstalls the merged config from scratch,
  -- overwriting any previous setup() call. No accumulation.
  config = vim.tbl_deep_extend("force", defaults, opts or {})
end

function M.get_config()
  return config
end

return M
```

**Anti-pattern:**

```lua
-- lua/mything/init.lua
local M = {}

local config = nil

function M.setup(opts)
  -- Callers must invoke setup() before using anything else, or get_config()
  -- returns nil and every downstream function crashes. Users who install
  -- but forget setup() get a broken plugin.
  config = opts
  vim.api.nvim_create_autocmd("BufWritePre", { callback = ... })
end
```

The recommended shape gives users a functional plugin at import, lets them tune it whenever they want, and survives config reloads without breaking. The anti-pattern gives them a plugin that only works after a setup call they might not know to make, and doubles up autocmds every time they source their config.

## Decision 2: How are default keymaps published?

### Recommendation: publish `<Plug>` mappings; guard any default keybind behind an existing-map check

The pressure here is that users always win when there's a conflict between what your plugin binds and what the user has already bound. If your plugin unconditionally maps `<leader>ff` to your file finder because you assumed that key was free, and the user has already mapped `<leader>ff` to their preferred one, your plugin has stolen a key without asking. The user opens their config to remap it, discovers your mapping is set inside your plugin's Lua, and has no way to override it without editing your source.

The two-step pattern that avoids this: publish `<Plug>` mappings for every action, and bind default keys only if the user hasn't already claimed them.

**Recommended:**

```lua
-- Publish the Plug mapping unconditionally. This is your plugin's public
-- keymap interface. Users can rebind by referencing <Plug>(mything-find).
vim.keymap.set("n", "<Plug>(mything-find)", function()
  require("mything").find()
end, { silent = true })

-- Bind a default only if the user hasn't already mapped either the target
-- Plug or the default key.
if vim.fn.hasmapto("<Plug>(mything-find)") == 0
   and vim.fn.mapcheck("<leader>mf", "n") == "" then
  vim.keymap.set("n", "<leader>mf", "<Plug>(mything-find)")
end
```

**Anti-pattern:**

```lua
-- Unconditionally binds the key. Steals it from any user who had
-- mapped <leader>mf to something else. No way to override in user config
-- without editing this file.
vim.keymap.set("n", "<leader>mf", function()
  require("mything").find()
end)
```

The `<Plug>` name is your plugin's stable public keymap identifier. Users who want to change the default do it by binding their preferred key to your `<Plug>(mything-find)`. That's the mechanism Neovim already gives you for user-overridable keys, and it works precisely because you decoupled the *action* from the *key that invokes it*.

## Decision 3: How are autocmds grouped?

### Recommendation: every autocmd belongs to a named `augroup` created with `clear = true`

The failure mode here is invisible until it fires. An autocmd registered without a group survives `:source` — if the user sources their config again, or if a plugin reload happens, the autocmd gets registered a second time. Now every triggering event fires the callback twice, then three times, then four. The behavior looks correct on the first `:source` and only breaks on the second.

Naming the group and passing `clear = true` when you create it means every re-registration first wipes the previous autocmds in that group, so the second `:source` produces the same state as the first.

**Recommended:**

```lua
local group = vim.api.nvim_create_augroup("MyThing", { clear = true })

vim.api.nvim_create_autocmd("BufWritePre", {
  group = group,
  pattern = "*",
  callback = function(args)
    require("mything").before_save(args.buf)
  end,
})
```

**Anti-pattern:**

```lua
vim.api.nvim_create_autocmd("BufWritePre", {
  pattern = "*",
  callback = function(args)
    require("mything").before_save(args.buf)
  end,
})
-- No group. On a second :source, this autocmd is registered a second
-- time. Every BufWritePre now fires the callback twice.
```

The group name should be your plugin's own name (`MyThing`, or the CamelCase form of your snake_case module) so nothing else in the ecosystem is likely to collide with it. And every autocmd your plugin registers should belong to that same group. The group is the unit of "everything my plugin subscribed to;" clearing it wipes exactly your plugin's autocmds and nothing else.

## Decision 4: What does `:checkhealth` verify?

### Recommendation: ship a `lua/<name>/health.lua` that checks executables, Neovim version, and optional peers

Users run `:checkhealth` when the plugin misbehaves. If your plugin isn't listed in the output, they open an issue asking a question a health check could have answered in seconds. Every hour of triage on those issues costs more than writing the health check would have.

A useful health check has three sections:

```lua
-- lua/mything/health.lua
local M = {}

function M.check()
  vim.health.start("mything")

  -- Executables the plugin shells out to
  if vim.fn.executable("rg") == 1 then
    vim.health.ok("ripgrep found on PATH")
  else
    vim.health.error("ripgrep not found on PATH", {
      "Install ripgrep: https://github.com/BurntSushi/ripgrep",
    })
  end

  -- Neovim version floor
  if vim.fn.has("nvim-0.10") == 1 then
    vim.health.ok("Neovim 0.10+ detected")
  else
    vim.health.error("Neovim 0.10 or later is required")
  end

  -- Optional peers — WARN if missing, not ERROR
  local ok = pcall(require, "snacks")
  if ok then
    vim.health.ok("snacks.nvim available (picker UI enabled)")
  else
    vim.health.warn("snacks.nvim not installed",
      "Picker UI will fall back to vim.ui.select")
  end
end

return M
```

The severity gradient matters. Missing executables that break your plugin's core function are `error` — the user cannot use the plugin until they install it. Version mismatches that will cause deep errors are `error`. Optional peers that degrade a feature but don't break the plugin are `warn` — the plugin still works, the user just gets the fallback. And things that are working correctly are `ok`, so the user knows the check *ran* and didn't just fail to load.

Neovim discovers `lua/<name>/health.lua` by convention. Nothing else you need to register; the file being present at the right path is what makes `:checkhealth <name>` work.

## Decision 5: How are optional peer plugins handled?

### Recommendation: `pcall(require, "peer")`, always, with a graceful fallback when the peer is missing

Your plugin will almost certainly touch an ecosystem library — a picker (snacks, telescope), a job runner (plenary), a UI library (nui). Every one of those is an optional peer from your plugin's perspective, and every unconditional `require` of one is a landmine for users who don't have it installed.

An unguarded `local snacks = require("snacks")` at module load time will raise `E5108: module 'snacks' not found` and abort your plugin's load *before any of its own code runs*. The user gets an error message about a plugin they didn't install, from a plugin they did install, and no clue about the connection between the two.

**Recommended:**

```lua
function M.pick(items, on_choice)
  local ok, snacks = pcall(require, "snacks")
  if ok then
    return snacks.picker.pick({ items = items, on_choice = on_choice })
  end
  -- Graceful fallback to Neovim's built-in ui.select
  vim.ui.select(items, {}, on_choice)
end
```

**Anti-pattern:**

```lua
local snacks = require("snacks")  -- fatal at module load if snacks missing

function M.pick(items, on_choice)
  return snacks.picker.pick({ items = items, on_choice = on_choice })
end
```

The `pcall` shape moves the failure from load-time (fatal, opaque) to feature-time (graceful, actionable). Combined with the health check from Decision 4 warning users that snacks isn't installed, the whole story is coherent: the plugin works without the peer, the user gets a fallback experience, and if they want the richer feature they know exactly what to install.

## What these five give you

Each of the five decisions above solves a specific failure mode: `:MyCommand` doesn't exist because `setup()` wasn't called; the user's `<leader>ff` got stolen; the autocmd started firing twice after a reload; the user couldn't diagnose why the plugin was broken; the plugin refused to load because an optional peer was missing. Each failure mode is invisible until it hits — you don't notice you should have named the augroup until the day the callback runs twice, and by then the fix is invasive because everything you built later assumes the current shape.

Making all five decisions in the first hour costs almost nothing. Discovering later that any one of them was made wrong costs a rewrite of every piece of code that depended on the wrong choice. This is the anti-fragile layer of a Neovim plugin — five small choices, made deliberately, that let every feature you add on top rest on a foundation that won't shift underneath them.

The walkthrough plugin from earlier in the series — the fifty-line `:StripTrailingWhitespace` — followed the applicable four, mostly without saying so. Its command was registered in `plugin/*.lua`, so it existed at startup whether the user called `setup()` or not (Decision 1). It shipped no default keybind at all, because the plugin's job was providing the command; users who wanted a shortcut bound their own key to `:StripTrailingWhitespace` (a reasonable variant of Decision 2 for a plugin whose surface is a single command). Its opt-in save-time autocmd went into a named group created with `clear = true` (Decision 3). It didn't ship a `health.lua` (skipping Decision 4 is defensible for a plugin that small) and it required no optional peers (Decision 5 didn't apply). Fifty lines of code, four out of four applicable decisions made deliberately, and the fifth appropriately absent.

That ratio — every applicable decision made consciously, none left to accident — is what makes a plugin ship-shaped from the moment it exists, no matter how small it starts. Everything else the series covered — the directory structure, the runtime path, the growth stages — is scaffolding around these five decisions. Get them right, and the scaffolding holds.
