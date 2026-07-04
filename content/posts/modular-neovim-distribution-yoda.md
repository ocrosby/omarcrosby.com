+++
title = "Yoda: what I learned making a Neovim distribution modular"
date = 2026-07-04T11:15:00-04:00
draft = true
summary = "yoda.nvim is a Neovim distribution built as a spine that pulls in independently useful plugins — yoda-core, yoda-window, yoda-logging, yoda-diagnostics, and more. Here's why the extraction was worth it."
tags = ["neovim", "lua", "nvim-plugin", "yoda"]
ShowToc = true
+++

## TL;DR

_[One sentence: Yoda's shape + why modularity was the specific design goal.]_

[yoda.nvim](https://github.com/jedi-knights/yoda.nvim) is a Neovim distribution assembled from a family of plugins that are each independently usable outside of it — [yoda-core.nvim](https://github.com/jedi-knights/yoda-core.nvim), [yoda-window.nvim](https://github.com/jedi-knights/yoda-window.nvim), [yoda-logging.nvim](https://github.com/jedi-knights/yoda-logging.nvim), [yoda-diagnostics.nvim](https://github.com/jedi-knights/yoda-diagnostics.nvim), [yoda-terminal.nvim](https://github.com/jedi-knights/yoda-terminal.nvim), and [yoda.nvim-adapters](https://github.com/jedi-knights/yoda.nvim-adapters). This post is about why that split existed from the beginning.

## The distro-vs-plugin tension

_[Two paragraphs on the classic dilemma: a distribution wants a coherent user experience, but the components that make it work are individually useful. Most distros end up as a monolith that's hard to lift pieces out of.]_

## The extraction map

_[List each yoda-* plugin with one sentence about what it does standalone.]_

- **`yoda-core.nvim`** — _[core primitives; what's in it]_
- **`yoda-window.nvim`** — _[window/split utilities]_
- **`yoda-logging.nvim`** — _[structured logging with backends; 77 tests, ~95% coverage per the repo description]_
- **`yoda-diagnostics.nvim`** — _[diagnostics helpers]_
- **`yoda-terminal.nvim`** — _[venv-aware terminal integration]_
- **`yoda.nvim-adapters`** — _[abstracts notify/picker backends over noice/snacks/telescope with a native fallback]_

## The adapter pattern in Neovim

_[Why yoda.nvim-adapters exists as a separate plugin. The problem: users are opinionated about which notify/picker backends they use, and hardcoding a choice hurts adoption. The solution: define a small interface and dispatch to whichever backend is installed.]_

```lua
-- _[example: adapter surface]_
```

## What the modular split cost me

_[Honest retrospective: what got harder because pieces were split.]_

## What it made possible

_[The wins.]_

## Where to find it

- **Distribution:** [github.com/jedi-knights/yoda.nvim](https://github.com/jedi-knights/yoda.nvim)
- **All the plugins:** [github.com/jedi-knights?q=yoda](https://github.com/jedi-knights?q=yoda)
