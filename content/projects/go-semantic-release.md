+++
title = "Go Semantic Release"
date = 2026-07-04T11:15:00-04:00
draft = false
summary = "A semantic-release implementation in Go. Powers the release workflow behind this site."
tags = ["go", "release-tooling", "ci-cd"]
+++

A pure-Go implementation of the semantic-release contract — parses Conventional Commits since the last tag, decides the next version, tags, and publishes a GitHub Release. It powers the release workflow behind this site: every merge that says `feat` or `fix` flows through `go-semantic-release` to a new tag and a Fly.io deploy.

**Deep dive:** [Writing semantic-release in Go, with real monorepo support →]({{< ref "posts/writing-semantic-release-in-go.md" >}}) — the four monorepo discovery modes and why the Node original's assumptions don't survive a Go workspace.

Companions cover the ergonomic gaps around it:

- [`detect-semantic-release`](https://github.com/jedi-knights/detect-semantic-release) wraps `go-semantic-release` and exposes `released` / `version` / `tag` outputs to downstream steps.
- [`python-semantic-release`](https://github.com/jedi-knights/python-semantic-release) and [`relforge`](https://github.com/jedi-knights/relforge) are Python takes on the same idea.
- [`python-commitlint`](https://github.com/jedi-knights/python-commitlint) enforces the Conventional Commit shape at commit time.

**Stack:** Go · Conventional Commits · GitHub Actions

- **Repo:** [github.com/jedi-knights/go-semantic-release](https://github.com/jedi-knights/go-semantic-release)
