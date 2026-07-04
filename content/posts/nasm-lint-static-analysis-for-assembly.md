+++
title = "nasm-lint: static analysis for NASM x86 in three shapes"
date = 2026-07-04T11:15:00-04:00
draft = true
summary = "One Rust-written analyzer for NASM assembly, delivered as a CLI, an LSP server for editor diagnostics, and a GitHub Action that emits SARIF."
tags = ["rust", "nasm", "assembly", "static-analysis", "lsp", "sarif"]
ShowToc = true
+++

## TL;DR

_[One sentence: what nasm-lint checks + the three delivery shapes.]_

[nasm-lint](https://github.com/jedi-knights/nasm-lint) is a static analyzer for NASM x86 assembly. It ships as a CLI, as an LSP server so editors get diagnostics inline, and as a GitHub Action that outputs SARIF for code-scanning surfaces. One analyzer core, three frontends.

## Why nobody was going to write this

_[Two or three sentences: assembly gets ignored by modern tooling; the classic Unix linters don't cover NASM's macro system; readers who write real NASM know the failure modes but nobody has automated them.]_

## The three shapes

### CLI

_[What running `nasm-lint file.asm` prints. Screenshot or code block.]_

```text
_[sample output]_
```

### LSP server

_[Editor integration story. Which editors have been tested; what the diagnostics look like inline.]_

_[Optional: brief on the JSON-RPC shape of `initialize` / `textDocument/publishDiagnostics`.]_

### GitHub Action → SARIF

_[Why SARIF matters — it lands in the code-scanning tab in GitHub. Example YAML snippet.]_

```yaml
- uses: jedi-knights/nasm-lint@v1
  with:
    files: 'src/**/*.asm'
    sarif: results.sarif
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

## What it actually catches

_[Categories with 1–2 examples each. E.g.:]_

- _Redundant register moves_
- _Unbalanced sections / macro pitfalls_
- _Deprecated forms of common instructions_
- _[etc.]_

## The analyzer core

_[Rust design notes: how the parser is structured, what representation the checks operate on, why Rust was a good fit for the multi-frontend goal.]_

## What I'd add next

_[Roadmap.]_

## Where to find it

- **Repo:** [github.com/jedi-knights/nasm-lint](https://github.com/jedi-knights/nasm-lint)
- **SARIF spec:** [docs.oasis-open.org/sarif](https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html)
