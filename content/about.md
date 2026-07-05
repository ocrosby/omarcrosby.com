+++
title = "About"
date = 2026-07-04T11:15:00-04:00
draft = false
description = "About Omar Crosby — software engineer at The Weather Company, sports-data infrastructure builder, cook, soccer fan."
+++

I'm a **software engineer at The Weather Company** who works across the stack. Day to day, that means **Next.js** and **TypeScript** on the front end and API layer, DevOps and CI work to keep the pipes moving, Linux administration to keep the servers honest, and — when the mood strikes — lower-level programming in **NASM assembly**.

Before The Weather Company I was **Director of Software Engineering at Fidelity Investments**. I studied **Applied Mathematics** at **North Carolina State University** (2000–2004), where I spent more time than was strictly reasonable on analysis, algebra, and PDEs. I'm a member of **ACM**, **SIAM**, **IEEE**, and **Mensa**.

Outside the day job, my open-source work splits across two umbrellas — **[github.com/jedi-knights](https://github.com/jedi-knights)** for the larger infrastructure work and **[github.com/ocrosby](https://github.com/ocrosby)** for personal projects, tools, and lab code:

- **Sports-data infrastructure** — MCP servers exposing NWSL, ECNL/ECRL, and NFL data as tools for LLM clients; Python SDKs for a stack of leagues (NWSL, MLS, USL, NCAA, WPSL, and more); an RPI calculator; a work-in-progress Go match-tracking app.
- **Trading and market signals** — `market-bridge`, an MCP server bridging Tradovate, Bookmap, and Thinkorswim to Claude for real-time /ES futures data; and `strike-pilot`, a Python SPX-bias / credit-spread signal engine.
- **Identity and API platform** — a production-style OAuth2/OIDC reference in Go (`identity-platform-go`) built as clean microservices, plus a configurable reverse-proxy gateway (`api-gateway`) with rate limiting, circuit breaking, and MCP routing.
- **A Neovim distribution and plugin ecosystem** — `yoda.nvim` plus a family of modular plugins (`yoda-core.nvim`, `yoda-window.nvim`, `yoda-logging.nvim`, `yoda-diagnostics.nvim`, `yoda-terminal.nvim`, `pytest.nvim`, `yaml.nvim`, `go.nvim`, `python.nvim`, and `pytest-atlas.nvim` for pytest-bdd navigation).
- **Release, code-quality, and testing tooling** — `go-semantic-release` (which powers this site's release workflow), `nasm-lint` (Rust-based NASM static analyzer with CLI, LSP, and GitHub Action), `kyber` (Go quality metrics), `py-cyclo` (Python cyclomatic-complexity checker), `neospec` (Neovim test/coverage runner in Go), and `ctestprobe` — a unit testing framework for C, distributed via a Homebrew tap.
- **Distributed systems play** — `holocron`, a learning-first Kafka-style event streaming platform written as a Go workspace, with a Python SDK.
- **Dev environment** — `claude-config` (my Claude Code setup, GNU Stow–managed), my Neovim config, my macOS `dotfiles`, and a `learn-neovim` walkthrough.

Also a scattering of language labs across **Go**, **Python**, **Rust**, **C**, **C++**, **TypeScript**, **R**, and **NASM**, plus notes on **physics**, **math**, and **astronomy** calculations — because the best way to learn a language is to build something small in it.

The through-line is: **build the boring plumbing well, in the language that fits, and open-source it**.

Away from a keyboard, I cook — from scratch, mostly, because measuring things is fun. I watch a lot of film and TV, and I follow soccer more closely than is probably healthy — especially the **NWSL**, and specifically **Gotham FC**.

## Contact

- LinkedIn — [linkedin.com/in/omarcrosby](https://www.linkedin.com/in/omarcrosby/)
- X — [x.com/crosbyomar](https://x.com/crosbyomar)
- Email — [omar.crosby@gmail.com](mailto:omar.crosby@gmail.com)
- GitHub (personal) — [github.com/ocrosby](https://github.com/ocrosby)
- GitHub (projects) — [github.com/jedi-knights](https://github.com/jedi-knights)
