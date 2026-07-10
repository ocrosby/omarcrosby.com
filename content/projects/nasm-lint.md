+++
title = "NASM Lint"
date = 2026-07-04T11:15:00-04:00
draft = false
summary = "Static code analysis for NASM x86 assembly — CLI, editor LSP, and a GitHub Action with SARIF output."
tags = ["rust", "nasm", "assembly", "static-analysis", "lsp"]

[cover]
image = "/images/og/projects/nasm-lint.png"
hiddenInList = true
+++

A static analyzer for NASM x86 assembly, written in Rust. Ships in three forms so it fits every place code is normally checked:

- A **CLI** for local runs and pre-commit hooks.
- An **editor LSP** for in-editor diagnostics.
- A **GitHub Action** that emits SARIF, so results land in the standard code-scanning surface.

**Deep dive:** [nasm-lint: static analysis for NASM x86 in three shapes →]({{< ref "posts/nasm-lint-static-analysis-for-assembly.md" >}}) — why one analyzer core is shipped in three surfaces (CLI, LSP, GitHub Action + SARIF), and how the delivery shape shapes the rule catalog.

**Stack:** Rust · NASM · LSP · SARIF · GitHub Actions

- **Repo:** [github.com/jedi-knights/nasm-lint](https://github.com/jedi-knights/nasm-lint)
