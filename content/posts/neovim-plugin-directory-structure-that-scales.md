+++
title = "The Neovim plugin directory structure that scales"
date = "2026-07-18T03:22:54-04:00"
draft = false
description = "A plugin can start as one file. Once it grows, the same directories consistently appear — this is each stage and what each new file earns you."
tags = ["neovim", "lua", "nvim-plugin", "plugin-development"]
categories = ["Neovim"]
ShowToc = true

[cover]
image = "/images/og/neovim-plugin-directory-structure-that-scales.png"
hiddenInList = true
hiddenInSingle = true
+++

A pattern shows up in almost every first attempt at a real plugin. The author has read the source of a plugin they respect, sees its `lua/` directory with eight submodules, a `types.lua`, a `health.lua`, an `after/ftplugin/` file, and a full vimdoc under `doc/`. So they scaffold their own new plugin with the same shape on day one — a `config.lua` that reads no config, a `types.lua` with no types, an `init.lua` that just re-exports what the other files export. Two weeks later they can't add a feature without also picking which of the empty scaffolding files it belongs in, and each choice feels arbitrary because there's no pressure yet to justify it.

The layout of a mature plugin is a *consequence* of that pressure, not a starting point. Every directory and every file split earns its place by solving a problem the plugin has actually hit. Copying the destination without walking the road makes the destination unusable. This post walks through the road: what the minimum viable plugin looks like, when to introduce each additional file, and what specifically each new file gives you that the previous stage did not.

[The previous post in this series]({{< ref "posts/how-neovim-actually-loads-a-plugin.md" >}}) explained the eight directories Neovim treats specially and the order in which their contents get sourced. This post uses that knowledge — every stage below is a specific move within the rules that post laid out — and shows how a plugin's tree evolves in practice, from one file to fully-shaped, without ever adding a file before you need it. The stages cover the directories most plugins actually reach for; `colors/` applies only to colorscheme plugins and `queries/` only to plugins that ship treesitter integrations, so both are set aside here.

## Stage 1 — one file in `plugin/`

The smallest legitimate Neovim plugin is a single `.lua` file under a `plugin/` directory. That's it. Not "a single file that grew from a template" — a single file, deliberately kept that way.

```text
mything/
└── plugin/
    └── mything.lua
```

The file registers whatever needs to exist at startup — a user command, an autocmd, a keymap default — and does the work inline. There's no `lua/` module, no `setup()`, no config. Some plugins ship in this shape at 30 lines and never grow past it. If your plugin is a single command that does one thing, this is the right shape and staying here is the right decision. Everything below is what you do when your plugin *stops* fitting.

The signal that you've outgrown Stage 1 is duplication. When the code you'd need to call from a new autocmd is the same code you already called from a user command, and copy-pasting the body starts to feel wrong, that's when the next stage earns its keep.

## Stage 2 — extract logic into `lua/<name>/init.lua`

Move the doing-work code into a Lua module. The `plugin/` file shrinks to registrations that call into the module. This is the shape [the walkthrough post]({{< ref "posts/your-first-neovim-plugin.md" >}}) ended on, and it's the load-bearing structural split in the entire Neovim plugin conventions.

```text
mything/
├── plugin/
│   └── mything.lua
└── lua/
    └── mything/
        └── init.lua
```

What you gain: the logic is now importable. A second call site — an autocmd, another command, a keymap that wants to call the same behavior — reuses the function instead of duplicating the body. The `plugin/` file becomes small and easy to skim; anyone reading it can see the plugin's public surface without wading through implementation.

The naming detail that trips up half the people who reach Stage 2: the directory under `lua/` uses the *module* name, and Lua's `require` does not accept hyphens. If the plugin is called `strip-trailing-ws`, the module directory has to be `strip_trailing_ws`, and every `require` from `plugin/` looks like `require("strip_trailing_ws")`. The plugin's repository name and its Lua module name are two different identifiers, and you get to choose the mapping between them — usually the shortest snake_case form of the repo name — but you have to choose it once and stay consistent. Every `require` from this plugin's own code and every downstream consumer's `require` will use the same string.

The signal that you've outgrown Stage 2 is that `init.lua` starts to feel like a bag of unrelated things. When you can't describe the module in a single sentence and the file has crossed a few hundred lines, the next stage earns its keep.

## Stage 3 — split `init.lua` into focused modules

Break out cohesive slices of `init.lua` into sibling modules. The commonest first split is `config.lua`, holding the plugin's default settings, the `setup()` merge behavior, and any validation. `init.lua` becomes a thin facade that delegates.

```text
mything/
├── plugin/
│   └── mything.lua
└── lua/
    └── mything/
        ├── init.lua
        └── config.lua
```

Other splits appear organically as the plugin grows: `commands.lua` for user-command handlers, `ui.lua` for anything that draws to a floating window, `runner.lua` for external subprocess management, `logger.lua` for structured logging. Every split is worth making only when the module it splits from has a clear responsibility being diluted by the code you're moving out.

Three anti-patterns are worth rejecting early, because each one gets much harder to unwind later.

The first is splitting `init.lua` into `commands.lua`, `helpers.lua`, `utils.lua`, `misc.lua`, and `common.lua` when there is no actual responsibility distinction between them. A file named `utils.lua` almost always signals "I didn't know where this belonged so I put it here"; it accretes unrelated helpers over time and becomes the file everyone imports from and no one can describe. If you can't name the module in domain terms (`config`, `runner`, `parser`, `ui`), don't split it.

The second is mixing configuration state with logic at the module root. If `init.lua` opens with `local config = { ... }` at the top and then a mix of functions that read from it and functions that write to it, changing the config shape or adding a validation step later means editing every function in the file. Push the config to its own module the moment you have more than a couple of fields, and let `init.lua` `require` it — the config becomes an object with a clear interface (`config.get()`, `config.setup(opts)`) rather than a global you have to mentally track.

The third is `require`-ing anything under `after/` from your `plugin/` or `lua/` code. It's tempting: you read the docs, saw that `after/plugin/` runs last, and thought "great, I'll put this override there and pull it in when I need it." Neovim's runtime path sourcing does not work that way. Files under `after/plugin/` are sourced at startup by the runtime path walker, not by `require`. Calling `require` into `after/` confuses the two mechanisms and creates load-order bugs that only surface when a user installs another plugin whose `after/` files interact with yours. Anything you put in `after/` should be for the runtime path walker to source at the right time; nothing in `lua/` should reach into it.

## Stage 4 — add `types.lua` for LuaLS annotations

Once the plugin has a config table with more than three or four fields, and callers have started to get things wrong, `types.lua` earns its place. It contains no runtime code — only Lua-doc `---@class` blocks that document the shape of the public data types.

```text
mything/
├── plugin/
│   └── mything.lua
└── lua/
    └── mything/
        ├── init.lua
        ├── config.lua
        └── types.lua
```

A minimal `types.lua` for a plugin whose `setup()` accepts a couple of options:

```lua
---@class MyThing.Config
---@field enabled boolean
---@field excluded_filetypes string[]
---@field on_save boolean
```

Once this class exists, every function that touches config can annotate its parameter with `---@param opts MyThing.Config`, and LuaLS will type-check the field access in the editor. The rest of your codebase and — importantly — anyone downstream who consumes the plugin's `setup()` function gets autocomplete on the config fields, hover documentation on each one, and an editor warning when they misspell a field name.

There is no runtime cost. `types.lua` doesn't get `require`d by anything, because it defines no runnable code. Its whole purpose is to sit somewhere LuaLS can find it and enrich the developer experience of everyone using the plugin.

## Stage 5 — add `lua/<name>/health.lua`

Every plugin above a certain complexity should have a health check. Users run `:checkhealth` when the plugin misbehaves, and if your plugin isn't listed, they'll open an issue asking a question the health check could have answered.

```text
mything/
├── plugin/
│   └── mything.lua
└── lua/
    └── mything/
        ├── init.lua
        ├── config.lua
        ├── types.lua
        └── health.lua
```

A useful `health.lua` checks three things: that any external executables the plugin depends on are present on `PATH`, that the required Neovim version is met, and that optional peers (a picker library, a job runner) are available or that the plugin has degraded gracefully in their absence. It uses `vim.health.start`, `vim.health.ok`, `vim.health.warn`, `vim.health.error` — the same functions Neovim's core health checks use — and appears automatically under `:checkhealth <name>` because Neovim discovers it by convention.

Users don't run `:checkhealth` speculatively. They run it when something is wrong. What earns your plugin trust is that when they do, the output tells them exactly what's wrong and what to do about it. A missing binary that the plugin shells out to should surface as an `error` with the exact install command; a version mismatch should surface as a `warn` with the required version stated.

## Stage 6 — buffer-local behavior via `after/ftplugin/`

If your plugin has behavior that should apply only inside buffers of a specific filetype — a keymap that only makes sense in Python buffers, an option value that only applies to Markdown — put it in `after/ftplugin/<filetype>.lua`. Neovim will source that file once per buffer of the matching filetype, after any existing ftplugin (built-in or from another plugin) has run.

```text
mything/
├── plugin/
│   └── mything.lua
├── lua/
│   └── mything/
│       ├── init.lua
│       ├── config.lua
│       ├── types.lua
│       └── health.lua
└── after/
    └── ftplugin/
        └── python.lua
```

Files in `after/ftplugin/` should use `vim.opt_local` and `vim.keymap.set(..., { buffer = 0 })` — anything set here is buffer-scoped and does not leak into other buffers when the user switches. This is the mechanical answer to the common question "how do I ship a plugin whose behavior varies by filetype without touching global state." The answer is that you don't touch global state; you put the filetype-specific code where Neovim will source it into the right buffer for you.

## Stage 7 — vimdoc under `doc/`

At the point where your plugin has a public API — a set of commands, a `setup()` schema, exported functions users are expected to call — it needs `:help` documentation. Vimdoc is the format: plain-text files with a specific set of markers Neovim understands, placed under `doc/` at the plugin root, and indexed on demand via `:helptags ALL` (which most plugin managers run automatically after install).

```text
mything/
├── plugin/
├── lua/
├── after/
└── doc/
    ├── mything.txt
    └── tags
```

A minimal `doc/mything.txt` starts with a header line naming the file, ends with `vim:ft=help:` on its last line so the file itself is recognized as vimdoc when opened, and uses `*tag-name*` at column-1 to define anchors that `:help tag-name` will jump to. The `tags` file is generated by `:helptags ALL` from the anchor definitions — you don't hand-write it, but you should either commit it to your repo or rely on your users' plugin manager to regenerate it on install (most modern managers do this automatically).

Users who already know Neovim expect `:help <your-plugin-name>` to work. Shipping without vimdoc is shipping a plugin whose documentation is "read the README on GitHub" — a downgrade from every other plugin they've installed.

## What you have at the end

A fully-shaped plugin looks like this:

```text
mything/
├── plugin/
│   └── mything.lua
├── lua/
│   └── mything/
│       ├── init.lua
│       ├── config.lua
│       ├── types.lua
│       └── health.lua
├── after/
│   └── ftplugin/
│       └── <filetype>.lua
└── doc/
    ├── mything.txt
    └── tags
```

Every file in that tree earns its place by solving a specific problem the plugin has actually hit, and every one of those files was added at the stage where the problem first showed up. The tree is not a template you build from; it's the shape a plugin takes as it grows into its own needs.

The corollary is the most important thing to internalize: not every plugin needs to end here. If yours stays useful at Stage 2 forever, that's not a failure to reach Stage 7 — it's the right shape for the problem it solves. The stages exist to be reached for when there's pressure, and staying at an earlier stage when the pressure isn't there is not laziness, it's discipline.

The tree tells you the *what* and the *when*. It doesn't tell you the *how* — the small handful of decisions embedded inside those files that determine whether the plugin ages well or gets rewritten in a year. [The next post in this series]({{< ref "posts/five-structural-decisions-neovim-plugin-quality.md" >}}) names those decisions and gives the recommended default for each, along with the pressure that makes that default the right one.
