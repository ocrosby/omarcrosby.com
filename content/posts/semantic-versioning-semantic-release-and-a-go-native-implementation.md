+++
title = "Semantic Versioning, Semantic Release, and a Go-native implementation"
date = "2026-07-20T09:40:46-04:00"
draft = false
description = "How Semantic Versioning and Semantic Release fit together — the standard, the automation contract that turns commit history into version tags, and why I re-implemented the Node.js tool in Go to remove the JavaScript toolchain from CI pipelines that don't otherwise need one."
summary = "How Semantic Versioning and Semantic Release fit together — the standard, the automation contract that turns commit history into version tags, and why I re-implemented the Node.js tool in Go to remove the JavaScript toolchain from CI pipelines that don't otherwise need one."
tags = ["semver", "semantic-release", "release-tooling", "go", "conventional-commits", "ci-cd"]
categories = ["Release Tooling"]
ShowToc = true

[cover]
image = "/images/og/semantic-versioning-semantic-release-and-a-go-native-implementation.png"
hiddenInList = true
hiddenInSingle = true
+++

Two conventions do most of the work in modern release pipelines, and both get talked about as if they were the same thing. **Semantic Versioning** — SemVer — is the standard for what a version number *means*. **Semantic Release** is the automation contract that decides what the next version should *be* and stamps the tag onto the repo without a human touching a version file. One is a specification; the other is a pipeline. They only reach their full value together.

This post walks through both — the SemVer spec first, then the Semantic Release contract, then how Conventional Commits closes the loop between them. It ends with the piece that motivated me to write my own implementation: [`go-semantic-release`](https://github.com/jedi-knights/go-semantic-release), a Go-native rewrite of the Node.js `semantic-release` tool. Same contract, same defaults, none of the JavaScript.

## Semantic Versioning: what the numbers mean

The [Semantic Versioning 2.0.0](https://semver.org/) specification (Tom Preston-Werner, 2013) defines a version number as three integers separated by dots:

```text
MAJOR.MINOR.PATCH
```

Each field has a precise, contract-driven meaning:

- **MAJOR** — incremented when you make **backward-incompatible** API changes. Consumers may need to modify their code to upgrade.
- **MINOR** — incremented when you add **new, backward-compatible** functionality, or when you deprecate existing API (deprecation is a signal, not yet a break).
- **PATCH** — incremented for **backward-compatible bug fixes**. No new features, no signature changes.

The rules that matter in practice:

- **Rule 3**: "Once a versioned package has been released, the contents of that version MUST NOT be modified." Every release is immutable. If you need to fix something in `1.2.0`, you release `1.2.1` — you don't re-tag `1.2.0`.
- **Rule 4**: `0.y.z` is "initial development" and the API is explicitly not stable. Anything goes; consumers are on notice. Most projects move to `1.0.0` when they've committed to an API they'll support.
- **Rule 5**: `1.0.0` *defines* the public API. From that moment forward, the version-bump rules above apply mechanically.
- **Rules 6-8**: incrementing MAJOR resets MINOR and PATCH to zero. Incrementing MINOR resets PATCH to zero. Incrementing PATCH leaves the rest alone. `2.4.7` → `3.0.0`, not `3.4.7`.

### Pre-release and build metadata

Two optional suffixes exist:

- **Pre-release** (Rule 9): a hyphen, then dot-separated identifiers. `1.0.0-alpha.1`, `1.0.0-beta.3`, `1.0.0-rc.2`. Pre-releases have **lower precedence** than the equivalent normal version — `1.0.0-alpha` < `1.0.0`. Numeric identifiers compare numerically; alphanumeric ones compare lexically. Numeric identifiers always precede non-numeric ones.
- **Build metadata** (Rule 10): a plus sign, then dot-separated identifiers. `1.0.0+build.123`, `1.0.0-beta.1+sha.5114f85`. Build metadata is **ignored when comparing precedence**. It's a label attached to the version for human information — a commit SHA, a build number — not part of what makes one release newer than another.

### Precedence

Rule 11 defines the ordering: compare MAJOR, then MINOR, then PATCH, then (if present) pre-release identifiers left-to-right. Once you've walked past every identifier, the version with fewer identifiers wins if all shared ones match. Concretely:

```text
1.0.0-alpha       < 1.0.0-alpha.1
1.0.0-alpha.1     < 1.0.0-alpha.beta
1.0.0-alpha.beta  < 1.0.0-beta
1.0.0-beta        < 1.0.0-beta.2
1.0.0-beta.2      < 1.0.0-beta.11
1.0.0-beta.11     < 1.0.0-rc.1
1.0.0-rc.1        < 1.0.0
```

Every language ecosystem — Go modules, Cargo, npm, PyPI's PEP 440 (a superset), Maven — implements this comparison. When your CI system asks "is this newer than what's deployed?", this is the algorithm it's running.

## The gap SemVer alone doesn't close

SemVer tells you what a version number *means* once you have one. It does not tell you what the next version *should be*. That decision — patch, minor, or major — has to come from somewhere, and traditionally that somewhere has been a human reading the diff and making a judgment call.

That works badly for three reasons:

1. **It doesn't scale with team size.** Ten developers can't all remember what the last tag was and whether their change is a `feat` or a `fix`.
2. **It doesn't scale with release frequency.** If you cut a release every merge, deciding the number by hand becomes the bottleneck.
3. **It's unauditable.** A version bump justified by "I think this is a minor?" leaves nothing for future readers to check against.

The fix is to make the bump decision **mechanical**. If you can write down the rule — "any commit with `feat` bumps minor; any commit with `fix` bumps patch; any commit with `BREAKING CHANGE:` bumps major" — the tooling can execute the rule against the commit history and produce the next version deterministically. That's what Semantic Release is.

## Semantic Release: the automation contract

[**semantic-release**](https://github.com/semantic-release/semantic-release) is the reference implementation, written in Node.js. But the value it introduced is less the tool itself and more the *contract* it defines. Any implementation of the contract does the same five things:

1. **Read the commit history since the last release tag.** `git log v1.2.3..HEAD`.
2. **Classify each commit** using a convention that maps commit-type to semver impact — almost always [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), where `fix` → PATCH, `feat` → MINOR, `BREAKING CHANGE:` → MAJOR.
3. **Compute the next version** by taking the highest bump implied by any commit in the range and applying it to the last tag. If no commit triggers a bump, exit cleanly — nothing to release.
4. **Generate a changelog entry** from the commit messages, grouped by type.
5. **Publish**: create the Git tag, push it, create a GitHub Release with the changelog, and (with plugins) publish to package registries.

That's the whole thing. Every step is deterministic given the commit history and the branch. The human's job is to write good commits — a job Conventional Commits already codifies — and the tool does the rest.

*(For a deeper look at how Conventional Commits sit under this automation, see the companion post [Conventional Commits, and the thinking they encourage]({{< ref "posts/conventional-commits-and-the-thinking-they-encourage.md" >}}). The rest of this post assumes you've either read it or already know the format.)*

## Why re-implement in Go?

The Node.js `semantic-release` package works well when your project is already a Node.js project. It runs in `npm install && npx semantic-release`, uses the plugin architecture your other Node tools already know, and integrates with `npm publish` for free.

It works less well when your project is anything else. The three concrete pain points:

**1. The Node.js toolchain becomes a build dependency of *every* release pipeline.** A Go project shipping a Go binary via GoReleaser. A Rust crate shipping via `cargo publish`. A Python package shipping via `uv publish`. A Docker image built from Alpine. None of these projects have a reason to install Node in CI — until you add `semantic-release`, at which point every release run installs Node 20+ plus a transitive dependency tree of several hundred npm packages, runs the release step, then throws it away. On GitHub Actions, that adds 20-40 seconds to every release run and pulls a stack of packages you're now responsible for auditing.

**2. The plugin architecture is optimized for Node ecosystems.** `@semantic-release/npm`, `@semantic-release/github`, `@semantic-release/git` — the plugins that make the tool feel seamless in a JS project are the same plugins that require every release run to have `node_modules` set up for them. Configuring the tool for a non-Node project means writing a `.releaserc` that carefully declines every plugin that doesn't apply and hoping the plugin resolution behaves.

**3. Monorepo support is a plugin story, and it's opinionated in ways that don't fit every layout.** The community has multiple mutually-incompatible monorepo plugins, and picking the wrong one for your layout means fighting the tool for weeks. Go workspaces and Cargo workspaces don't map naturally onto any of them.

None of these are killers if your project is Node. All three are non-trivial friction if it isn't.

I wrote [**go-semantic-release**](https://github.com/jedi-knights/go-semantic-release) to close that gap: same contract, single Go binary, no Node dependency, native monorepo support for the layouts I actually work with. The site you're reading is published by it.

## What go-semantic-release covers of the standard

The tool implements the full Semantic Release contract described above:

- **Reads commit history** since the last matching tag on the current branch.
- **Classifies commits** using the [Angular Conventional Commits](https://github.com/angular/angular/blob/main/contributing-docs/commit-message-guidelines.md) preset by default. Custom types and their semver impact are configurable.
- **Computes the next version** deterministically. `feat` → MINOR, `fix`/`perf`/`revert` → PATCH, any `!` or `BREAKING CHANGE:` footer → MAJOR. No release-triggering commits since the last tag → exit clean, no tag pushed.
- **Generates a changelog** from the commit history, grouped by type, with links back to commits and closed issues.
- **Publishes**: creates the tag, pushes it, creates a GitHub Release with the changelog as the body.

The CLI surface is **compatible with the JS original** where it makes sense to be. `semantic-release` with no subcommand does what `semantic-release` from npm does. The flags match — `--branches`, `--repository-url`, `--tag-format`, `--extends`, `--dry-run`, `--ci` / `--no-ci`, `--debug`. If you have an existing workflow that shells out to the Node binary, swapping it for the Go one is a one-line change.

**Branch policies match the ecosystem.** Stable releases on `main`. Prereleases on `beta`, `alpha`, `next`. Version numbers follow the SemVer pre-release spec so `1.4.0-beta.3` is exactly what you'd expect. Branch policies are configurable if you want a different naming scheme, but the defaults are the same as every other tool in the ecosystem — so a project migrating in doesn't have to re-learn conventions it already knows.

## What it does better or differently

The point of a re-implementation isn't to be identical — that would just be a translation. The Go version does five things the JS tool doesn't do, or doesn't do as cleanly.

### 1. Single-binary distribution, no runtime

The Go binary is one file, statically linked, ~15 MB. On GitHub Actions:

```yaml
- uses: jedi-knights/go-semantic-release@v0
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

That's the whole install step. No `setup-node`, no `npm install`, no `npx`. The action wraps the binary. Cold start is dominated by the API call to fetch commit history, not by toolchain setup.

For local runs — dry-run debugging, one-off releases — the story is `go install github.com/jedi-knights/go-semantic-release@latest` or `brew install jedi-knights/tap/semantic-release`. One binary. `which semantic-release` shows you a single path.

### 2. First-class monorepo support with four discovery modes

Rather than making monorepo behavior a plugin decision, the Go version bakes four discovery modes into the core tool:

- **Go workspaces** — `go.work` at the repo root; each `use` entry becomes an independently-versioned project with its own tag stream (`api/v1.2.0`, `worker/v0.4.1`).
- **Multiple nested `go.mod` modules** — no workspace file, just several modules in subdirectories. Each is versioned independently on its own commit stream.
- **`cmd/` layout single-module monorepos** — one `go.mod` at the root, several binaries under `cmd/`, with heuristics that separate service-level changes from shared-library changes so a fix to one service doesn't bump the version of the other.
- **Config-defined projects** — an explicit path-to-package mapping for repos whose shape doesn't fit any of the automatic modes.

Each independently-versioned piece receives exactly the commits that touched its subtree, and its release stream is independent of the others. That's the only way per-package versioning stays honest — and it's the mode most monorepo teams end up needing once the first cross-service bump ships a version of something that didn't actually change.

### 3. Dry-run is a real code path, not a special flag

`semantic-release --dry-run` runs the entire pipeline — analyzes commits, decides the next version, renders the changelog — and produces exactly the output the real release would produce, except no tag is created, no push happens, no release is published.

Internally, the mutation calls (`git tag`, `git push`, `POST /repos/.../releases`) sit behind an interface. The dry-run adapter is a no-op implementation of that interface. Same code path, different adapter — which means dry-run cannot silently drift from the real run. If dry-run says "next version will be `1.4.0` with these three entries in the changelog," the real run will produce exactly that.

This matters a lot when you're debugging a config change. The JS tool's `--dry-run` mode has drifted from real behavior more than once historically; making it a real code path prevents that class of bug from ever occurring.

### 4. Extended subcommands for reporting

The JS tool is monolithic: you run `semantic-release` and it either releases or doesn't. The Go version keeps that behavior but adds four subcommands that expose the internal steps for scripting:

- `semantic-release plan` — extended reporting on what *would* happen, without doing anything. Useful in PR-based workflows.
- `semantic-release version` — print the next version and exit. Handy in scripts that want to inject the version into a build.
- `semantic-release changelog` — generate the release notes for the current range without publishing.
- `semantic-release config init` — write a starter config into the repo.

These are additive; the compatible core is unchanged. Existing workflows that call `semantic-release` don't see any difference.

### 5. Native Go integration

If your build system is already Go — a Makefile that shells out to `go build`, a mage / task file, a `go run` script — you can invoke `go-semantic-release` as a library rather than a binary. The core package exports a stable API for the analyzer, the version calculator, and the changelog renderer. That gives you a scripting path the Node tool can't offer without spawning a subprocess.

## The minimum adoption path

Same shape as the JS tool. The whole workflow file:

```yaml
name: release
on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: jedi-knights/go-semantic-release@v0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

`fetch-depth: 0` is required — the tool reads the full commit history to figure out what changed since the last tag. A shallow clone will either produce wrong results or exit silently. This is the single most common misconfiguration for both the Go and the JS tools; every CI template that includes `semantic-release` should also pin `fetch-depth: 0`.

If your project doesn't yet use Conventional Commits, adopt those first — the automation only works when the commit history is machine-readable. See [Conventional Commits, and the thinking they encourage]({{< ref "posts/conventional-commits-and-the-thinking-they-encourage.md" >}}) for the adoption story on that front.

If you want the full picture of how a Conventional-Commit-driven release feeds into a downstream distribution channel — GoReleaser cutting binaries, cargo-dist for Rust, a Homebrew tap picking up new formulas — see [Distributing CLI tools with a personal Homebrew tap]({{< ref "posts/distributing-cli-tools-with-a-personal-homebrew-tap.md" >}}). Semantic Release is what puts a tag on the commit; those other tools take the tag as input.

## Where to go next

- [semver.org](https://semver.org/) — the SemVer 2.0.0 spec. Ten minutes to read, and reading it once is worth the ten minutes.
- [semantic-release (JS)](https://github.com/semantic-release/semantic-release) — the reference implementation. Worth understanding even if you use a different implementation; the ecosystem's conventions come from here.
- [go-semantic-release](https://github.com/jedi-knights/go-semantic-release) — the Go re-implementation. Same contract, single binary.
- [Writing semantic-release in Go, with real monorepo support]({{< ref "posts/writing-semantic-release-in-go.md" >}}) — companion post covering the *implementation* details: the four monorepo modes, the compatible CLI surface, and the dry-run architecture in more depth.

Two conventions and one automation contract — SemVer says what a version means, Conventional Commits says how a commit signals what changed, Semantic Release turns the two into a version tag. The rest is picking the implementation that matches the shape of the project. If you're not already committed to a Node.js toolchain, the Go binary saves you the overhead of one. If you are, use the JS tool — it's a fine piece of software. Either way, the value is the contract.
