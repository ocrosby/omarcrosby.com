+++
title = "nasm-lint: static analysis for NASM x86 in three shapes"
date = 2026-07-04T11:15:00-04:00
draft = true
summary = "One Rust-written analyzer for NASM assembly, delivered as a CLI, an LSP for editor diagnostics, and a GitHub Action that emits SARIF for GitHub code scanning."
tags = ["rust", "nasm", "assembly", "static-analysis", "lsp", "sarif"]
ShowToc = true
+++

Every serious language has a linter that people actually run. Rust has clippy. Python has ruff. Go has staticcheck and golangci-lint. Assembly, somehow, has none. If you write **NASM** — the syntax the majority of x86 hobbyists, security researchers, and CTF folks reach for — the only thing checking your code is the assembler, and it complains about a specific set of things and nothing else.

[nasm-lint](https://github.com/jedi-knights/nasm-lint) is the tool I wanted to exist. It's a static analyzer for NASM x86 / x86-64 assembly, written in Rust, that ships in three delivery shapes so it fits wherever code is already being checked.

## Why NASM ended up without a linter

Two reasons. First, the audience is smaller — most professional x86 work these days is compiler-generated, so the tooling incentive is aimed at the compiler side. Second, NASM's macro system is *rich*: `%macro`, `%if`, `%rep`, `%include`, structured contexts. That richness is what makes NASM pleasant to write, but it also makes the file you look at very different from the file that reaches the assembler. Any linter that ignores the macro layer catches almost nothing; any linter that emulates it is doing real work.

nasm-lint targets NASM specifically — not GAS, not MASM, not the intersection. That's the only way the checks stay honest.

## The three shapes

### CLI

```bash
nasmlint src/**/*.asm
```

Runs as a single static binary — no runtime, trivial to drop into CI. Output modes: human (what you want at your terminal), JSON (what you want to pipe into another tool), and SARIF 2.1.0 (what GitHub's code-scanning tab consumes).

### LSP server

The same core analyzer, wrapped in a Language Server Protocol server so editors get findings inline. Findings are byte-identical to the CLI's — same rule codes, same severities — because it's the same analysis pass. You configure your editor to launch `nasmlint-lsp` for `*.asm` files and diagnostics just appear.

### GitHub Action → SARIF

```yaml
- uses: jedi-knights/nasm-lint@v1
  with:
    files: 'src/**/*.asm'
    sarif: results.sarif

- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

SARIF is what makes findings show up as real annotations in pull requests and in the repo's code-scanning tab. It's the same delivery shape the big compiled-language security tools use, and it costs nothing extra to emit.

## What it catches today

Structural analysis is what's live now:

- **Label resolution** — undefined labels, unused labels, duplicate labels
- **Preprocessor balance** — mismatched `%macro`/`%endmacro`, `%if`/`%endif`, `%rep`/`%endrep`
- **Symbol linkage** — `section`, `global`, and `extern` consistency across a file

Every rule has a stable code and a configurable severity, tunable via a `.nasmlint.toml` in the repo root.

## What's coming next

The interesting stuff is the two milestones after this:

- **Instruction-aware checks (M3)** — mnemonic and operand-form validation driven by NASM's own `insns.dat`. That's the file NASM itself uses to know which forms of `mov` or `add` are legal in which modes. Consuming it directly is the only way to keep the rules current with NASM without duplicating a giant table by hand.
- **Control-flow analysis (M4)** — dead code, stack `push`/`pop` balance, and other checks that need a real control-flow graph rather than a linear pass.

## Why Rust for the core

Two reasons. One: shipping a single static binary is a first-class goal, and Rust's toolchain makes that a formality. Two: three frontends (CLI, LSP, Action) all sharing one analysis pass means the *core* has to be a proper library with a clean surface. Rust's type system makes that easier to keep honest than the alternatives I considered.

## Where to find it

- **Repo:** [github.com/jedi-knights/nasm-lint](https://github.com/jedi-knights/nasm-lint)
- **SARIF spec:** [docs.oasis-open.org/sarif](https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html)
- **NASM manual:** [nasm.us/docs.php](https://www.nasm.us/docs.php)
