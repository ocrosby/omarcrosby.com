+++
title = "Uses"
date = 2026-07-09T22:15:00-04:00
draft = false
description = "The editor, shell, languages, and hosting stack I actually use — for anyone who wandered over from uses.tech."

[cover]
image = "/images/og/meta/uses.jpg"
hidden = true
+++

The tools I actually reach for, on the machine I'm actually sitting in front of. Updated when the setup changes, not sooner. Inspired by [uses.tech](https://uses.tech). For what I'm actively focused on this month, see [/now/]({{< ref "now.md" >}}).

## Machine

- **Apple silicon Mac**, macOS 15 Sequoia.
- Deliberately unopinionated about laptop skins, keyboard tenting, and monitor arm mounts. Whatever's on the desk this month.

## Editor

- **Neovim** with [Yoda]({{< ref "projects/yoda-nvim.md" >}}) — my own modular distribution. Every piece under the hood (window management, logging, diagnostics, terminal, adapters) is its own installable plugin, so I use Yoda-as-a-whole here and Yoda-piece-by-piece in every other Neovim-adjacent project.
- **`vim.pack`** for plugin management — the Neovim-native option. No `lazy.nvim`, no `packer`, no third-party loading wrapper.

## Terminal

- **[Ghostty](https://ghostty.org/)** — GPU-accelerated, native macOS, fast. Mitchell Hashimoto's terminal. Replaced whatever I was using before it shipped.

## Shell

- **`zsh`** — default on macOS since Catalina, no reason to switch.
- **[Homebrew](https://brew.sh)** for package management (Apple silicon prefix at `/opt/homebrew/`).
- **[GNU Stow](https://www.gnu.org/software/stow/)** for dotfile linking — the `~/.claude/` configuration in [`ocrosby/claude-config`]({{< ref "projects/claude-config.md" >}}) is a Stow package that symlinks its top-level items into `$HOME/.claude/`.

## AI

- **[Claude Code](https://docs.claude.com/en/docs/claude-code)** as my primary CLI-based coding assistant. This site was built on it; every commit on `main` has a Claude Code fingerprint somewhere in its authorship.
- **Personal configuration** — agents, skills, rules, commands, hooks, output styles — lives in [`ocrosby/claude-config`]({{< ref "projects/claude-config.md" >}}). Stow makes it portable across machines.

## Languages (day-to-day)

- **Go** — most of my open-source infrastructure work. See the [Code Quality]({{< ref "categories/code-quality" >}}) and [Distributed Systems]({{< ref "categories/distributed-systems" >}}) pillars for what that looks like in practice.
- **Python** — day job at The Weather Company (backend test automation), plus trading tools ([Market Bridge]({{< ref "projects/market-bridge.md" >}}), [Strike Pilot]({{< ref "projects/strike-pilot.md" >}})) and the sports-data pipelines.
- **Rust** — reached for when the domain benefits from it. [NASM Lint]({{< ref "projects/nasm-lint.md" >}}) is the current example.
- **Lua** — the Neovim plugin surface. Idiomatic Lua, not "JavaScript in Lua clothing."
- **TypeScript + Next.js** — reached for on the front-end and API layer.
- **NASM x86 assembly** — because it stays fun, and because building [NASM Lint]({{< ref "projects/nasm-lint.md" >}}) required understanding a language deeply enough to lint it.

## This site

- **[Hugo](https://gohugo.io)** (pinned to 0.160.1 in the `Dockerfile` and CI).
- **[PaperMod](https://github.com/adityatelange/hugo-PaperMod)** theme — kept as a submodule, never edited in place. All customizations live at the site root and shadow the theme's copies. See [`.claude/rules/theme-immutable.md`](https://github.com/ocrosby/omarcrosby.com/blob/main/.claude/rules/theme-immutable.md).
- **Docker + nginx** for local preview and the production image — one multi-stage `Dockerfile` produces the deployable artifact.
- **[Fly.io](https://fly.io)** for hosting — single-region (`iad`), single machine, Anycast IP.
- **AWS Route 53** for DNS.

## Release workflow

- **[Conventional Commits](https://www.conventionalcommits.org)** everywhere — `feat`, `fix`, `docs`, `chore`, `refactor`, `style`, `test`, `build`, `ci`, `perf`.
- **[`jedi-knights/go-semantic-release`]({{< ref "projects/go-semantic-release.md" >}})** as the release tool. Every `feat` or `fix` merge to `main` cuts a new tag and a Fly deploy. Non-release types merge cleanly but the release workflow no-ops.
- **[`jedi-knights/detect-semantic-release`](https://github.com/jedi-knights/detect-semantic-release)** as the GitHub Action wrapper that exposes `released` / `version` / `tag` outputs.

## Version control & CI

- **GitHub** for hosting, PRs, and CI.
- **GitHub Actions** for the CI pipeline — Hugo build, lychee link check, markdownlint, and typos on every PR; semantic-release + Fly deploy on `main`.
- **[GitGuardian](https://www.gitguardian.com/)** as the secrets scanner on PRs.

## Everything else

- **[ImageMagick](https://imagemagick.org/)** for the per-post OG image generator (`scripts/generate-og-images.py`) — see the [seo commit that shipped them](https://github.com/ocrosby/omarcrosby.com/pull/71).
- **[`typos`](https://github.com/crate-ci/typos)** as the CI-parity spell check.
- **[`lychee`](https://github.com/lycheeverse/lychee)** for broken-link scanning against every rendered page.

## What's not here

Deliberate omissions. If the question is "what keyboard, what mouse, what desk, what headphones" — those change too often to be worth pinning down here. If the question is "what productivity/note-taking app," I keep that separate: notes live in an Obsidian vault, tasks in the ambient stream of GitHub issues and TODO comments.
