+++
title = "Yoda: what I learned making a Neovim distribution modular"
date = 2026-07-04T11:15:00-04:00
draft = false
summary = "yoda.nvim is a Neovim distribution built from a family of independently useful plugins — yoda-core, yoda-window, yoda-logging, yoda-diagnostics, yoda-terminal, and adapters. Modularity was the design goal, not a refactor after the fact."
tags = ["neovim", "lua", "nvim-plugin", "yoda"]
ShowToc = true
+++

*Companion to the [Yoda project page]({{< ref "projects/yoda-nvim.md" >}}).*

There are a lot of Neovim distributions. Most of them ship as a single repo you clone into `~/.config/nvim`, and if you want a piece of what they do — the picker wiring, the notification shim, the diagnostics helpers — you get to copy the file, adjust the paths, and hope nothing else in it depends on the rest of the distro.

[yoda.nvim](https://github.com/jedi-knights/yoda.nvim) is my attempt to not be that. It's a modular, beginner-friendly Neovim distribution with Claude Code integration, TokyoNight, lazy-loading, LSP and testing and debugging and Git — the usual distribution surface — but the pieces underneath are their own plugins, individually installable, individually tested. The design goal from the beginning was: *if you want just the logging piece, you should be able to take just the logging piece.*

## Why the split existed from day one

The distribution-vs-plugin tension is the classic dilemma. A distribution wants a coherent user experience — everything works out of the box, the pieces know about each other, the defaults are opinionated. A plugin wants to be reusable — small surface, no assumptions about the rest of your config, no hidden coupling.

Most distros pick the first and end up as monoliths. Anything worth extracting stays trapped inside because it *knows* the distro's globals, the distro's colorscheme, the distro's picker, the distro's notification backend. Extraction becomes a rewrite.

Yoda flipped the constraint. The pieces exist independently first. The distribution is the *composition*, not the container.

## The extraction map

The parts that have been extracted so far:

- **[`yoda-core.nvim`](https://github.com/jedi-knights/yoda-core.nvim)** — core primitives shared by the rest of the family
- **[`yoda-window.nvim`](https://github.com/jedi-knights/yoda-window.nvim)** — window and split utilities that don't assume any particular buffer or filetype
- **[`yoda-logging.nvim`](https://github.com/jedi-knights/yoda-logging.nvim)** — a production-grade logging framework with pluggable console / file / notify / multi backends, lazy evaluation, level filtering, structured context. 77 tests, ~95% coverage.
- **[`yoda-diagnostics.nvim`](https://github.com/jedi-knights/yoda-diagnostics.nvim)** — diagnostics helpers built on top of Neovim's native diagnostic API
- **[`yoda-terminal.nvim`](https://github.com/jedi-knights/yoda-terminal.nvim)** — venv-aware terminal integration that auto-detects `.venv` and activates it, cross-platform (bash / zsh / Windows), with interactive selection. Facade + Builder patterns.
- **[`yoda.nvim-adapters`](https://github.com/jedi-knights/yoda.nvim-adapters)** — adapter layer for notification and picker backends

The distribution itself pulls those in, wires them up, and adds the opinionated defaults. If you're an existing Neovim user with your own config and you want just the logging framework, you install `yoda-logging.nvim` and you don't have to know Yoda exists.

## The adapter pattern is the interesting one

`yoda.nvim-adapters` deserves its own paragraph. The problem it solves is: users have *strong* opinions about which notification backend they use (noice, snacks, native `vim.notify`) and which picker they use (telescope, snacks.picker, native `vim.ui.select`). Hardcoding a choice in the distribution excludes half your potential users. Prompting them at first-run is friction.

The adapter layer defines a small interface — `notify(msg, level)`, `pick(items, opts, cb)` — and dispatches at runtime to whichever backend is installed. If noice is present, notifications go there. If not, snacks. If not, `vim.notify`. Same story on the picker side. The rest of Yoda calls the interface; users get the backend they've already committed to.

## What modularity actually cost

- **Six repos to keep in sync**, not one. Version bumps have to happen in dependency order.
- **CI is duplicated** across all the plugins. Same test rigging, same coverage machinery, six places.
- **Discovery is harder.** People find `yoda.nvim`; they don't find `yoda-logging.nvim` unless someone tells them.

## What it made possible

- **Real reuse.** `yoda-logging.nvim` has users outside Yoda. That wouldn't have happened from inside a monolith.
- **Honest testing.** Each plugin gets its own test suite that can't reach into the distro's globals to cheat. That's how the 95% coverage numbers stay honest.
- **Cleaner boundaries.** When the picker backend needs to change, exactly one file changes. In a monolithic distro that's usually a grep-and-pray operation.

## Where to find it

- **Distribution:** [github.com/jedi-knights/yoda.nvim](https://github.com/jedi-knights/yoda.nvim)
- **All the plugins:** [github.com/jedi-knights?tab=repositories&q=yoda](https://github.com/jedi-knights?tab=repositories&q=yoda)
