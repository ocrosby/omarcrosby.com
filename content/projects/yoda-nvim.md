+++
title = "Yoda (yoda.nvim)"
date = 2026-07-04T11:15:00-04:00
draft = false
summary = "A community-driven Neovim distribution and a family of modular plugins — logging, diagnostics, window management, YAML, pytest, and more."
tags = ["neovim", "lua", "nvim-plugin"]
+++

A Neovim distribution that boots with sensible defaults, plus a family of small modular plugins so pieces are usable outside of Yoda itself.

- **Distribution:** [`yoda.nvim`](https://github.com/jedi-knights/yoda.nvim)
- **Modular building blocks:**
  [`yoda-core.nvim`](https://github.com/jedi-knights/yoda-core.nvim),
  [`yoda-window.nvim`](https://github.com/jedi-knights/yoda-window.nvim),
  [`yoda-logging.nvim`](https://github.com/jedi-knights/yoda-logging.nvim),
  [`yoda-diagnostics.nvim`](https://github.com/jedi-knights/yoda-diagnostics.nvim),
  [`yoda-terminal.nvim`](https://github.com/jedi-knights/yoda-terminal.nvim) (venv-aware terminal),
  [`yoda.nvim-adapters`](https://github.com/jedi-knights/yoda.nvim-adapters) (abstract notify/picker backends).
- **Language and tool integrations:**
  [`pytest.nvim`](https://github.com/jedi-knights/pytest.nvim),
  [`yaml.nvim`](https://github.com/jedi-knights/yaml.nvim),
  [`go.nvim`](https://github.com/jedi-knights/go.nvim),
  [`python.nvim`](https://github.com/jedi-knights/python.nvim),
  [`go-task.nvim`](https://github.com/jedi-knights/go-task.nvim),
  [`invoke.nvim`](https://github.com/jedi-knights/invoke.nvim).
- **Docs source:** [`neovim-plugin-development`](https://github.com/jedi-knights/neovim-plugin-development) — the GitBook source for the plugin-development guide.

**Stack:** Lua · Neovim runtime · vim.pack
