+++
title = "Writing semantic-release in Go: what I learned about Conventional Commits"
date = 2026-07-04T11:15:00-04:00
draft = true
summary = "go-semantic-release is a Go implementation of the semantic-release contract. It reads Conventional Commits, decides the next version, and tags. It's what deploys this site."
tags = ["go", "release-tooling", "ci-cd", "conventional-commits"]
ShowToc = true
+++

## TL;DR

_[One sentence: what go-semantic-release does + who it's for.]_

[go-semantic-release](https://github.com/jedi-knights/go-semantic-release) is a Go implementation of the semantic-release contract. It parses Conventional Commits since the last tag, decides the next version, tags, and publishes a GitHub Release. It's what publishes every release of this very site.

## Why re-implement it

_[Two paragraphs: the Node.js semantic-release toolchain works but drags Node into every CI pipeline that just wants to tag. A single Go binary is a nicer fit for repos that don't otherwise need Node.]_

## Parsing Conventional Commits without pretending it's regex

_[The commit-message format looks simple until you meet real commit history. Multi-line bodies. `BREAKING CHANGE:` footers with continuations. Types that aren't in the spec. Scopes with colons. How the parser handles them.]_

```go
// _[snippet: the parse result shape]_
```

## Deriving the next version

_[The mapping: feat → MINOR, fix → PATCH, breaking → MAJOR. Edge cases: what if there are no releasable commits? What if the last tag isn't semver? What if someone hand-tagged out of band?]_

## Tagging and publishing

_[Which git operations happen and in what order. Why publishing the GitHub Release from the same tool matters (or the tradeoff for splitting it).]_

## The `detect-semantic-release` wrapper

_[The [detect-semantic-release](https://github.com/jedi-knights/detect-semantic-release) Action wraps this tool and exposes `released` / `version` / `tag` outputs so a downstream deploy step can gate on them. Show the YAML pattern.]_

```yaml
- id: release
  uses: jedi-knights/detect-semantic-release@v1

- if: steps.release.outputs.released == 'true'
  run: _[deploy step]_
```

## How this site uses it

_[Every `feat:` or `fix:` merged to main gets the tool applied. The workflow tags, GitHub Release is created (with a small fallback path for repos where the built-in publish 404s), and Fly deploys the tagged commit.]_

## What I'd add next

_[Roadmap.]_

## Where to find it

- **Repo:** [github.com/jedi-knights/go-semantic-release](https://github.com/jedi-knights/go-semantic-release)
- **Action wrapper:** [github.com/jedi-knights/detect-semantic-release](https://github.com/jedi-knights/detect-semantic-release)
- **Conventional Commits spec:** [conventionalcommits.org](https://www.conventionalcommits.org/)
