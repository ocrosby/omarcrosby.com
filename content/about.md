+++
title = "About"
date = 2026-07-04T11:15:00-04:00
draft = false
description = "About Omar Crosby — software engineer at The Weather Company, sports-data infrastructure builder, cook, soccer fan."
+++

<img src="/images/omar.jpg" alt="Portrait of Omar Crosby" class="about-portrait" width="220" height="220" />

I'm a **software engineer at The Weather Company** who works across the stack. Day to day, that means **Next.js** and **TypeScript** on the front end and API layer, DevOps and CI work to keep the pipes moving, Linux administration to keep the servers honest, and — when the mood strikes — lower-level programming in **NASM assembly**.

{{< collapse summary="Background & education" >}}
Before The Weather Company I was **Director of Software Engineering at Fidelity Investments**. I studied **Applied Mathematics** at **North Carolina State University** (2000–2004), where I spent more time than was strictly reasonable on analysis, algebra, and PDEs. I'm a member of **ACM**, **SIAM**, **IEEE**, and **Mensa**.
{{< /collapse >}}

Outside the day job, my open-source work splits across two umbrellas — **[github.com/jedi-knights](https://github.com/jedi-knights)** for the larger infrastructure work and **[github.com/ocrosby](https://github.com/ocrosby)** for personal projects, tools, and lab code.

{{< collapse summary="Open-source portfolio (7 areas)" >}}

- **Sports-data infrastructure** — MCP servers exposing NWSL, ECNL/ECRL, and NFL data as tools for LLM clients; Python SDKs for a stack of leagues (NWSL, MLS, USL, NCAA, WPSL, and more); an RPI calculator; a work-in-progress Go match-tracking app.
- **Trading and market signals** — `market-bridge`, an MCP server bridging Tradovate, Bookmap, and Thinkorswim to Claude for real-time /ES futures data; and `strike-pilot`, a Python SPX-bias / credit-spread signal engine.
- **Identity and API platform** — a production-style OAuth2/OIDC reference in Go (`identity-platform-go`) built as clean microservices, plus a configurable reverse-proxy gateway (`api-gateway`) with rate limiting, circuit breaking, and MCP routing.
- **A Neovim distribution and plugin ecosystem** — `yoda.nvim` plus a family of modular plugins (`yoda-core.nvim`, `yoda-window.nvim`, `yoda-logging.nvim`, `yoda-diagnostics.nvim`, `yoda-terminal.nvim`, `pytest.nvim`, `yaml.nvim`, `go.nvim`, `python.nvim`, and `pytest-atlas.nvim` for pytest-bdd navigation).
- **Release, code-quality, and testing tooling** — `go-semantic-release` (which powers this site's release workflow), `nasm-lint` (Rust-based NASM static analyzer with CLI, LSP, and GitHub Action), `kyber` (Go quality metrics), `py-cyclo` (Python cyclomatic-complexity checker), `neospec` (Neovim test/coverage runner in Go), and `ctestprobe` — a unit testing framework for C, distributed via a Homebrew tap.
- **Distributed systems play** — `holocron`, a learning-first Kafka-style event streaming platform written as a Go workspace, with a Python SDK.
- **Dev environment** — `claude-config` (my Claude Code setup, GNU Stow–managed), my Neovim config, my macOS `dotfiles`, and a `learn-neovim` walkthrough.

Also a scattering of language labs across **Go**, **Python**, **Rust**, **C**, **C++**, **TypeScript**, **R**, and **NASM**, plus notes on **physics**, **math**, and **astronomy** calculations — because the best way to learn a language is to build something small in it.
{{< /collapse >}}

The through-line is: **build the boring plumbing well, in the language that fits, and open-source it**.

For the editor, shell, languages, and release stack I actually reach for day to day, see [/uses/]({{< ref "uses.md" >}}). For what I'm actively focused on right now (updated monthly), see [/now/]({{< ref "now.md" >}}).

## Experience

- **The Weather Company** — Mar 2025–present. Senior Software Engineer on the SUN QA team; day-to-day is Python backend-test automation, but the role essentially spans team leadership, overall QA evolution, and a lot of software architecture — without the formal titles for any of it.
- **Fidelity Investments** — 2015–2024. SE in Test → Principal Engineer → Architect over nine years across trading and internal-tooling orgs.
- **Sageworks** — 2014–2015. Senior Software Engineer on the analytics platform.
- **Paragon Application Systems** — 2010–2014. Senior Software Engineer on payments-testing simulators.
- **IBM / Lenovo** — 2000–2010. Software Engineer → Staff → Senior → Architect across the ThinkPad manufacturing test and firmware stack.

Away from a keyboard, I cook — from scratch, mostly, because measuring things is fun. I watch a lot of film and TV, and I follow soccer more closely than is probably healthy — especially the **NWSL**, and specifically **Gotham FC**.

## Contact

- LinkedIn — [linkedin.com/in/omarcrosby](https://www.linkedin.com/in/omarcrosby/)
- X — [x.com/crosbyomar](https://x.com/crosbyomar)
- Instagram — [instagram.com/omar.crosby](https://www.instagram.com/omar.crosby/)
- Facebook — [facebook.com/omar.crosby](https://www.facebook.com/omar.crosby/)
- Email — [omar.crosby@gmail.com](mailto:omar.crosby@gmail.com)
- GitHub (personal) — [github.com/ocrosby](https://github.com/ocrosby)
- GitHub (projects) — [github.com/jedi-knights](https://github.com/jedi-knights)
