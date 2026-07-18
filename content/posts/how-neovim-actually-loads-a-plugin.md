+++
title = "How Neovim actually loads a plugin"
date = "2026-07-18T03:10:58-04:00"
draft = false
description = "The runtime path, the seven directories Neovim treats specially, and the startup order that determines when each of your plugin's files gets sourced. Once you know the rules, the directory structure stops looking arbitrary."
tags = ["neovim", "lua", "nvim-plugin", "plugin-development"]
categories = ["Neovim"]
ShowToc = true

[cover]
image = "/images/og/how-neovim-actually-loads-a-plugin.png"
hiddenInList = true
hiddenInSingle = true
+++

A pattern shows up in the way most people first install a Neovim plugin. They add a line to their plugin manager's config — a URL, maybe a version pin — restart Neovim, and the plugin's commands, keymaps, and behaviors just appear. The install feels like a black box: you handed the manager a name, the manager did something, the plugin exists.

The black box is smaller than it looks. Underneath every plugin manager is Neovim's own built-in plugin discovery, and it's mechanical, deterministic, and short enough to explain in a single post. Once you know what fires when, the directory structure of any plugin — including one you write yourself — stops looking like a convention someone made up and starts looking like a straightforward consequence of Neovim's rules.

[The previous post in this series]({{< ref "posts/your-first-neovim-plugin.md" >}}) walked through building a plugin end-to-end without ever explaining *why* the directories had the names they did. This post fills that gap. We'll look at the runtime path, the small set of directories Neovim treats specially, and the order in which their contents get sourced at startup. By the end you'll be able to open any plugin's tree on GitHub and predict exactly when each file will run.

## The runtime path

Neovim keeps an ordered list of directories called the *runtime path*, exposed as the option `&runtimepath` (or `runtimepath` in Lua). Every directory on this list is a place Neovim will look when it needs to find something — a plugin file, a filetype handler, a colorscheme, a help tag, a treesitter query. Nothing on disk is "installed"; the runtime path is just where Neovim looks, and anything sitting in one of those directories in the right shape is what Neovim finds.

You can inspect the current value with `:set rtp?`, and the result on a moderately-configured system looks something like this (formatted here across multiple lines for readability; the actual output is a single comma-separated string):

```text
runtimepath=~/.config/nvim,
            ~/.local/share/nvim/site,
            ~/.local/share/nvim/site/pack/local/start/strip-trailing-ws,
            /opt/homebrew/share/nvim/runtime,
            ~/.local/share/nvim/site/after,
            ~/.config/nvim/after
```

The list is longer in practice — every installed plugin contributes one or more entries — but the shape is the same. Reading top to bottom: your personal config, the standard user data directory, one entry per installed plugin, the Neovim runtime that ships with the binary, and the `after/` versions of the same paths at the end (we'll come back to those). Each entry is a self-contained directory tree with the same expected shape, and Neovim treats them all identically. The one at the top of the list is your config; the ones at the bottom are the built-in runtime that ships with Neovim itself. Plugins live in between.

Two things about that list deserve emphasis. First, there is no manifest and no registration. A plugin is on the list because its directory happens to be on the list; nothing is "installed" in a package-manager sense. Second, the entries at the bottom of the list — `~/.local/share/nvim/site/after` and `~/.config/nvim/after` — are the same paths as the ones near the top with `/after` appended. Neovim scans both, and the `after/` versions get their turn last. This is the mechanism that lets a user override a plugin's default without editing the plugin's source.

The runtime path itself isn't a static setting — Neovim assembles it at startup by combining `$VIMRUNTIME` (the built-in runtime that ships with the binary), your user config directory, the standard user data directory, any `pack/*/start/*` subdirectories inside those, and the `after/` counterpart of each. Plugin managers extend it further by prepending an entry per plugin they know about. To see the same list in structured form rather than as a comma-glued string, `:lua vim.print(vim.api.nvim_list_runtime_paths())` prints one path per line. That's the command to reach for when a plugin claims to be loading and you want to check whether Neovim actually sees the directory it lives in.

## The directories Neovim treats specially

Inside every entry on the runtime path, Neovim looks for a small set of subdirectory names. It ignores everything else. The subdirectories are:

| Directory | Sourced when | What belongs there |
| --- | --- | --- |
| `plugin/` | At startup, eagerly — every `.lua` or `.vim` file, in filename order | User commands, autocmds, keymap definitions, top-level side effects that must exist before the user touches anything |
| `lua/` | Lazily, only when Lua code calls `require("...")` | Modules, business logic, reusable functions — nothing runs until something asks for it |
| `ftplugin/` | On the `FileType` event, for the matching filetype only | Buffer-local options and mappings scoped to a specific filetype |
| `after/plugin/` | At startup, after every non-`after/` `plugin/` file has been sourced | Overrides — the last chance to change an option or mapping before the user sees the editor |
| `after/ftplugin/` | On `FileType`, after normal `ftplugin/` for the same filetype | Overrides of built-in or plugin-provided filetype settings |
| `doc/` | Rebuilt on `:helptags` (or auto-scanned when the plugin loads) | Vimdoc `.txt` files that provide `:help <topic>` for the plugin |
| `colors/` | On `:colorscheme <name>` — the file `colors/<name>.vim` or `colors/<name>.lua` gets sourced | One file per colorscheme the plugin ships |
| `queries/` | On demand, by treesitter, when a parser and query are both available | Tree-sitter queries — highlights, injections, textobjects, folds |

A few older names still work — `syntax/`, `autoload/`, `indent/`, `ftdetect/` — but they're rarely load-bearing for a modern Lua-first plugin. `ftdetect/` is the one worth naming, because plugins that provide support for an unusual file format still use it: a `ftdetect/mytype.lua` registers an autocmd that assigns the filetype to filename patterns Neovim wouldn't otherwise recognize, which then lets the corresponding `ftplugin/mytype.lua` fire on those files. Most Lua-first configs use `vim.filetype.add()` instead for the same purpose. The eight directories in the table above are what you'll actually interact with, and every one of them corresponds to a specific answer to the question "when do you want this to run?"

## The startup order

The order matters more than the names. When Neovim launches, it walks the runtime path in a fixed sequence. Roughly:

1. Every `plugin/*.lua` and `plugin/*.vim` file across every runtime-path entry gets sourced, in filename order. Yours, every installed plugin's, then the built-in runtime's.
2. Every `after/plugin/*.lua` and `after/plugin/*.vim` gets sourced, in the same walking order. This is why the `after/` version of your config is the last thing that runs before the editor becomes interactive.
3. `lua/` never gets scanned eagerly. A file at `lua/foo/bar.lua` is invisible to Neovim until some Lua code runs `require("foo.bar")`. The file's cost — parse time, execution time, memory — is deferred until first use.
4. `ftplugin/<filetype>.lua` gets sourced when Neovim fires the `FileType` autocmd for a buffer that matches. Then the `after/ftplugin/` version for the same filetype.
5. `doc/` is not sourced at startup at all; it's indexed by `:helptags ALL` on demand, and the resulting `tags` file is what makes `:help <topic>` work.
6. `colors/`, `queries/`, and the other on-demand directories fire only when something explicitly requests them.

The consequence for anyone writing a plugin is that the split between `plugin/` and `lua/` is a *load-cost lever*. Code in `plugin/` runs on every Neovim startup, whether the user calls your command or not — so it should be as small as possible. Code in `lua/` runs the first time it's needed, and never again in the same session (Lua's `require` caches modules), so it can be as large as it needs to be. The pattern you'll see in every well-shaped plugin — a small `plugin/` file that only registers commands and autocmds, all logic in `lua/<name>/init.lua` — is a direct consequence of this split. It's not a stylistic preference. It's what stops the plugin from paying its full cost at startup even when the user never invokes it.

## What this means for your plugin's shape

Three practical rules fall out of the startup order.

First, everything that needs to *exist* before the user does anything — the user command that will be typed, the autocmd that will fire on the right event — must be registered in `plugin/`. If you defined `:MyCommand` inside a `lua/mything/init.lua` function that only runs after `require("mything").setup()`, users who haven't wired up `setup()` in their config will have a plugin whose command doesn't exist. The command has to exist at Neovim startup, not after user code runs.

Second, everything that needs to *do work* — the substitution, the API call, the treesitter walk — belongs in `lua/`. Nothing there runs until it's requested, so the cost stays lazy. The registration in `plugin/` is one line: `require("mything").do_the_thing()`. All the real code lives on the other side of that call, and Neovim pays for it only if the user actually invokes it.

Third, `after/` exists specifically for the case where you need to change something *after* someone else has already set it. If a plugin sets a default option you disagree with — say it enables `wrap = true` globally and you want lines to stay unwrapped — you can't just set `vim.opt.wrap = false` in your regular config, because the plugin's `plugin/` file runs after yours and clobbers your setting. Putting the same line in `~/.config/nvim/after/plugin/wrap-off.lua` runs it last, after every plugin has had its say, and it wins. This is the mechanism your `.config/nvim/after/` directory uses to override plugin defaults, and it's the same mechanism plugins themselves use to override the built-in runtime. It exists because the alternative — editing the plugin's source to change the default — creates a fork you have to maintain forever.

## What a plugin isn't

There's no package format. There's no install script. There's no manifest declaring what the plugin provides or what it depends on. A Neovim plugin is a directory somewhere on the runtime path with the special subdirectory names Neovim knows how to look for. Everything else — the `README.md`, the `LICENSE`, a `.github/` directory, tests under `tests/` — is invisible to Neovim. Those files exist for humans and for GitHub. Neovim ignores them all.

This is why plugin managers can be simple. Every plugin manager, under the noise, is a program that clones a git repository into a directory and prepends that directory to the runtime path. The rest is Neovim doing its own discovery. Understanding this is what lets you skip the plugin manager entirely when you want to — the walkthrough post used `~/.config/nvim/pack/local/start/` for exactly this reason, and the plugin worked because `pack/*/start/*` is a directory Neovim already knows how to prepend to the runtime path on its own.

The directory tree is a contract with Neovim. Get the names right, put the right kind of code in each one, and Neovim does the rest. [The next post in this series]({{< ref "posts/neovim-plugin-directory-structure-that-scales.md" >}}) walks through how that tree evolves in practice — from the single-file plugin you built earlier, to the layered structure you'll see in any mature plugin, and what each new file earns you when you add it.
