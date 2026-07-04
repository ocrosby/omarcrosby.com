+++
title = "nasm-lint"
date = 2026-07-04T11:15:00-04:00
draft = false
summary = "Static code analysis for NASM x86 assembly — CLI, editor LSP, and a GitHub Action with SARIF output."
tags = ["rust", "nasm", "assembly", "static-analysis", "lsp"]
+++

A static analyzer for NASM x86 assembly, written in Rust. Ships in three forms so it fits every place code is normally checked:

- A **CLI** for local runs and pre-commit hooks.
- An **editor LSP** for in-editor diagnostics.
- A **GitHub Action** that emits SARIF, so results land in the standard code-scanning surface.

**Stack:** Rust · NASM · LSP · SARIF · GitHub Actions

- **Repo:** [github.com/jedi-knights/nasm-lint](https://github.com/jedi-knights/nasm-lint)
