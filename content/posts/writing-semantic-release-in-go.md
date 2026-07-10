+++
title = "Writing semantic-release in Go, with real monorepo support"
date = 2026-07-04T11:15:00-04:00
draft = false
summary = "go-semantic-release is a Go-native re-implementation of the semantic-release contract, with four monorepo discovery modes and a CLI surface compatible with the JS original. It's what publishes this site."
tags = ["go", "release-tooling", "ci-cd", "conventional-commits", "monorepo"]
categories = ["Code Quality"]
ShowToc = true

[cover]
image = "/images/og/writing-semantic-release-in-go.png"
+++

*Companion to the [Go Semantic Release project page]({{< ref "projects/go-semantic-release.md" >}}).*

The **semantic-release** contract is one of the best pieces of CI/CD glue in wide use. You write [Conventional Commits](https://www.conventionalcommits.org/), you push to a release branch, and a tool reads the commit history since the last tag, decides whether the next version is a major, minor, or patch, generates a changelog, tags the commit, and publishes a GitHub Release. No manual version bumps. No forgotten changelog entries. Every release is boring in the best sense.

The original implementation is Node.js. That's fine if your project already has a Node toolchain. It's less fine if you're releasing a Go project, or a Rust project, or a Python project, or anything else — because now every CI pipeline that just wants to tag a release has to install Node and pull down a dependency tree it doesn't otherwise need. [go-semantic-release](https://github.com/jedi-knights/go-semantic-release) is the Go-native re-implementation. It's what publishes every release of this site.

## The CLI surface is compatible on purpose

The whole point of a re-implementation is that people who already know the original don't have to re-learn anything. So `semantic-release` with no subcommand does what `semantic-release` from npm does: analyzes the commit range since the last tag, decides the next version, generates a changelog, tags, publishes a GitHub Release, done. The flags match — `--branches`, `--repository-url`, `--tag-format`, `--plugins`, `--extends`, `--dry-run`, `--ci` / `--no-ci`, `--debug`. If you have an existing workflow that shells out to `semantic-release`, swapping the JS binary for the Go one is a single line change.

Where the Go version *adds* surface, it does so as new subcommands so nothing collides with the compatible core:

- `semantic-release plan` — extended reporting for what would happen without doing it
- `semantic-release version` — preview the next version and exit
- `semantic-release changelog` — generate the release notes without publishing
- `semantic-release config init` — write a starter config

## Monorepo support is the interesting bit

The original semantic-release is single-package. Monorepo support is a plugin story, and the plugins are opinionated in ways that don't fit every layout. go-semantic-release supports four discovery modes out of the box:

- **Go workspaces** — `go.work` at the repo root, each `use` entry becomes an independently-versioned project
- **Multiple nested `go.mod` modules** — no workspace, just several modules in subdirectories, each versioned on its own commit stream
- **`cmd/` layout single-module monorepos** — one `go.mod` at the root, several binaries under `cmd/`, with heuristics that separate service-level changes from shared-library changes
- **Config-defined projects** — explicit path mappings for repos whose shape doesn't fit the automatic modes

The point of all four is: each independently-versioned piece gets exactly the commits that touched it, and its release stream is independent of the others. That's the only way per-package versioning stays honest.

## Branch policies match the ecosystem

Stable releases on `main`. Prereleases on `beta`, `alpha`, `next`. Version numbers follow the semver prerelease spec so `1.4.0-beta.3` is exactly what you'd expect. Branch policies are configurable if you want a different naming scheme, but the defaults are what the wider ecosystem uses.

## Dry-run is a first-class mode

`semantic-release --dry-run` does everything a real release does — analyzes commits, decides the version, renders the changelog — except it doesn't create tags, doesn't push, doesn't publish. That's the mode you run in a pull request to see what would happen, and the mode you run when debugging a config change. It's not a special code path; the mutation calls are behind an interface and the dry-run adapter is a no-op. Same code, different adapter.

## The architecture is boring in a good way

Ports-and-adapters. Domain layer with no I/O — commit parsing, version calculation, changelog rendering. Adapter layer for the outside world — git operations, GitHub API, filesystem, clock. The main flow is an application-layer use case that orchestrates domain + adapters through ports. That structure is what makes the four monorepo discovery modes possible: each is an adapter behind the same `ProjectDiscovery` port. Adding a fifth is a new adapter, not a rewrite.

That structure is also what makes dependency propagation work — when a shared library is bumped, dependent projects can be triggered automatically, because the dependency graph lives in the domain layer and the "trigger" is an adapter-level publish.

## How this site uses it

Every merge to `main` on this repo runs a small GitHub Action that shells out to `go-semantic-release`. If the commits since the last tag include a `feat:` or a `fix:` or a breaking change, the tool cuts the next version — minor, patch, or major respectively — creates the tag, and publishes the GitHub Release. A downstream job in the same workflow sees the new tag and deploys the tagged commit to Fly.io.

There's a small twist in the deploy step. `go-semantic-release` tags reliably, but its GitHub Release publisher occasionally 404s on this specific repo shape, so the workflow tolerates that step failing and then explicitly runs `gh release create` on the pushed tag as a fallback. Same result, one belt-and-suspenders extra.

## Where to find it

- **Repo:** [github.com/jedi-knights/go-semantic-release](https://github.com/jedi-knights/go-semantic-release)
- **Original Node implementation:** [github.com/semantic-release/semantic-release](https://github.com/semantic-release/semantic-release)
- **Conventional Commits spec:** [conventionalcommits.org](https://www.conventionalcommits.org/)
