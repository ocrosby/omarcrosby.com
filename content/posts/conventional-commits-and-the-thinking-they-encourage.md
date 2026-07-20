+++
title = "Conventional Commits, and the thinking they encourage"
date = "2026-07-20T09:12:12-04:00"
draft = false
description = "A working tour of Conventional Commits — the format, the reason it makes each changeset better before any tool touches it, how to identify good scopes, what the Angular convention adds on top, and where the whole thing fits into the release-automation ecosystem (semantic-release, release-please, cocogitto, git-cliff, commitlint)."
summary = "A working tour of Conventional Commits — the format, the reason it makes each changeset better before any tool touches it, how to identify good scopes, what the Angular convention adds on top, and where the whole thing fits into the release-automation ecosystem (semantic-release, release-please, cocogitto, git-cliff, commitlint)."
tags = ["conventional-commits", "git", "release-tooling", "semantic-release", "ci-cd", "workflow"]
categories = ["Release Tooling"]
ShowToc = true

[cover]
image = "/images/og/conventional-commits-and-the-thinking-they-encourage.png"
hiddenInList = true
hiddenInSingle = true
+++

Most developers spend a week arguing over commit-message wording and then never think about it again. The commits pile up, they look roughly consistent, and the version number moves up by the intern's calendar reminder. Six months later somebody grep-searches the log for "when did we change the auth flow" and gets a hundred commits titled `updates`, `fix`, `wip`, and `merge branch main`. Every project ends up here eventually. The way out is not more discipline — it's a convention that turns the discipline into a mechanical step.

**Conventional Commits** is that convention. It's a spec, it's not opinionated about your language or your workflow, and adopting it gives you two payoffs at once: your commit history becomes machine-readable (so tools can automate versioning and changelogs from it), and — the part I care about more — the format forces you to think about *what* the change is and *what part of the codebase* it touches before you write the message. That second effect turns out to be the more valuable one.

This post covers the format, the reason it changes how you commit before any tool touches it, how to pick good scopes, what the Angular convention adds on top, how to define your own convention within the spec's guardrails, and where the whole thing sits in the release-automation ecosystem.

## The spec, in one page

The [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification defines the following commit-message shape:

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

That's the whole grammar. Every commit message either matches or it doesn't.

A concrete example:

```text
feat(auth): add TOTP-based two-factor login flow

Users can now enroll a TOTP device from their profile page and are prompted
for a six-digit code on subsequent logins. Backup codes are generated at
enrollment time and displayed once.

Refs: #482
Reviewed-by: Alice Cooper
```

Three commits, each valid, each carrying different amounts of information:

```text
fix: correct off-by-one in pagination cursor
feat(billing): support annual plans
docs(readme): note the new minimum Go version
```

The spec **mandates** two types: `fix` (a bug fix — patch bump in semver terms) and `feat` (a new feature — minor bump). Everything else — `docs`, `refactor`, `chore`, `ci`, etc. — is *permissible* but not part of the base spec. Different projects standardize on different sets; the most widely-adopted extension is the Angular convention, covered below.

Breaking changes are signaled two ways:

- **Bang notation**: append `!` immediately before the colon — `feat!: rename the /users endpoint to /accounts`. This alone is sufficient.
- **Footer notation**: add a `BREAKING CHANGE:` footer (uppercase is mandatory) — `BREAKING CHANGE: the /users endpoint is now /accounts`. Can be combined with `!` for extra visibility.

Either form triggers a **major** version bump under semver.

That's the mechanical part. Let me get to the actual reason to adopt this.

## The cognitive shift

When I first adopted Conventional Commits I expected to gain a nicer changelog and a version-bumping robot. I got both. But the effect I didn't expect — and the one I've since talked about the most — is what the format does to how you think *before* you type the message.

The moment you type `feat(` or `fix(` at the start of a commit, you've already committed to two things: **what kind of change this is**, and **where in the codebase it lives**. That triggers a small forcing function. If the change is a mix of "small bug fix in the parser" and "new logging in the API layer," the type/scope box refuses to hold both. You either write a subject line that's misleading, or you go back and split the changeset. Almost every time I've gone back and split, I've realized I was about to bundle two unrelated concerns into one commit that would be a nightmare to revert independently later.

That's the deeper win: the format nudges you toward atomic commits. Each commit becomes a single story — one type, one scope, one description — and the whole history becomes a sequence of decisions rather than a stream of activity. When you look back at the log a year later, you're reading a project's biography, not its call log.

There's a secondary effect too: the type field labels **intent**. `refactor(auth)` and `feat(auth)` might touch the same files, but they promise very different things to a reviewer. A refactor claims no observable behavior change; a feat announces one. Reviewers can calibrate their attention accordingly. Bisecting later gets easier — if you're hunting a behavior regression, you can skip every commit that isn't `feat` or `fix`.

I'll return to this angle later, because it also drives how to pick scopes. Scopes are the piece where the cognitive-shift argument does the most work.

## Types: the base set, and what you add on top

The spec's mandated types are `fix` and `feat`. Every other type is optional and up to you or your project's convention.

The **Angular convention** — the most widely adopted extension — adds:

| Type | Meaning | Semver effect |
|---|---|---|
| `feat` | A new feature | Minor bump |
| `fix` | A bug fix | Patch bump |
| `docs` | Documentation only | None |
| `style` | Whitespace, formatting, semicolons — no code change | None |
| `refactor` | A code change that neither fixes a bug nor adds a feature | None |
| `perf` | A change that improves performance | Patch (some tools) or None |
| `test` | Adding missing tests or correcting existing tests | None |
| `build` | Changes to build system or external dependencies | None |
| `ci` | Changes to CI configuration files and scripts | None |
| `chore` | Everything else that doesn't fit above (housekeeping, dep bumps) | None |
| `revert` | A commit that reverts a previous commit | Depends on what's being reverted |

A `feat` or `fix` — or *any* type carrying a `!` or a `BREAKING CHANGE:` footer — triggers a release under semantic-release-style automation. Everything else lands on `main` without cutting a new version. That distinction has a practical consequence I'll come back to under the tooling section: **`chore` is silently non-releasing**, and misusing it will publish work to `main` that never actually ships to your users.

Where the base spec ends and your project's convention begins is entirely up to you. The spec is deliberately minimal — it defines the grammar, mandates `fix` and `feat`, and leaves the rest to convention.

## Subject-line rules

The description is one short imperative sentence, all lowercase, no trailing period:

```text
feat(auth): add TOTP-based two-factor login flow
```

Not:

```text
feat(auth): Added TOTP-based two-factor login flow.
feat(auth): TOTP two-factor login.
feat(auth): The two-factor login flow is now added
```

The imperative-mood convention comes from Git itself — the commit-message rule Git projects have used since the kernel days. It reads naturally alongside auto-generated release notes: *"This release will `add TOTP-based two-factor login flow`."*

The description should also be **short** — 50 to 72 characters is the durable target, and most tooling truncates the subject line at 100 for changelog generation. If you need more space, use the body.

## The body and the footers

The body is optional, blank-line-separated from the subject, and used for the *why* — not the what. The subject already carries the what. The body explains motivation, references incidents, or notes context that isn't obvious from the diff:

```text
fix(cache): expire entries after 10 minutes instead of 1 hour

The 1-hour TTL was chosen empirically in 2023 when the auth service was
still hitting the database on every request. Since PR #812 (query cache),
the auth service serves 99% of reads from memory anyway. The long cache
TTL now delays picking up permission revocations by up to an hour, which
customers have started noticing.

Refs: SUPPORT-4712
```

Footers follow Git trailer conventions: `Token: Value`, one per line, blank line before the block. Two footer patterns matter across the spec and the wider ecosystem:

- **`BREAKING CHANGE:`** — the token that marks a major-version-triggering change. Uppercase is mandatory. The description that follows goes into the changelog under a highly-visible "Breaking Changes" section.
- **`<Any-Token>: <Value>`** — anything else. `Refs:`, `Closes:`, `Reviewed-by:`, `Signed-off-by:`, and custom project-specific trailers like `Deploy-to:` or `Feature-flag:`. Different tools consume different trailers; the spec is neutral about which ones you use.

One nuance from the Angular convention specifically: **`Fixes #<issue>`** and **`Closes #<pr>`** work as issue-closing trailers on GitHub / GitLab. If you write the trailer correctly, the referenced issue closes when the commit lands on the default branch. That is a small nicety with large aggregate value — no one manually closes issues, they close themselves as the code merges.

## Scopes: the piece that pays off the most

Scopes are the parenthetical after the type: `feat(auth)`, `fix(billing)`, `docs(readme)`. The spec says only that a scope "MUST consist of a noun describing a section of the codebase surrounded by parenthesis." That's deliberately broad — the shape a scope takes depends on the shape of your project.

Three practical patterns cover almost every codebase:

### 1. Directory / package scopes

The most common shape. Each significant subtree of the repo gets a scope name that matches its directory or package. For a Go project:

```text
feat(cmd/server): add /healthz endpoint
fix(pkg/router): correct trailing-slash normalization
refactor(internal/auth): extract session store behind interface
docs(examples): show how to embed the middleware
```

For a Python project laid out under `src/`:

```text
feat(users): add email verification workflow
fix(billing): correct annual-plan proration math
refactor(shared/db): switch to explicit session scoping
```

The scope tells a reader — and a change reviewer, and a git-log searcher a year from now — *which subsystem* moved. `git log --oneline --grep="^fix(billing)"` becomes a working tool the moment the convention is in place.

### 2. Feature / concept scopes

When directories don't map neatly to features, use the feature name instead of the path:

```text
feat(auth): add TOTP two-factor flow
feat(auth): expire enrollment codes after 15 minutes
fix(auth): correct redirect after failed login
```

`auth` here isn't a single directory — it's the *concept* of authentication, which might touch `/handlers`, `/middleware`, `/db/schema.sql`, and `/templates/login.html` in one commit. The scope names the story, not the file layout.

### 3. Cross-cutting scopes

For CI, build, lint, or infrastructure work, use short cross-cutting names:

```text
ci: switch to Go 1.24 in the release workflow
build(docker): pin the alpine base image to 3.19
chore(deps): bump github.com/stretchr/testify to v1.9.0
style(lint): fix golangci-lint warnings under revive
```

The scope for cross-cutting work names the *tool* or *layer*, not a code path. `ci`, `deps`, `docker`, `lint`, `release`, `perf` — these show up as scopes as often as directory names.

### How to identify the scopes for your project

Sit down with the repo at the point you're adopting the convention. Do one pass, once:

1. **List every top-level directory** that carries meaningful code. `cmd/`, `pkg/`, `internal/`, `src/`, `crates/`, `apps/*`, `services/*` — whatever your layout uses.
2. **List every distinct concept** your team refers to by name in conversation. `auth`, `billing`, `router`, `parser`, `cache`, `search`, `admin`. If you'd write it on a whiteboard when explaining the system, it's a scope.
3. **List the cross-cutting concerns**. `ci`, `deps`, `docker`, `docs`, `release`, `lint`, `types`. If it's an aspect that touches multiple concepts but is itself a topic, it's a scope.

That list becomes your project's scope vocabulary. Write it into `CONTRIBUTING.md` or the repo's `README.md`. When someone reaches for a scope that isn't in the list, they either add it to the doc (small design decision, worth naming) or use the closest existing one.

I keep this list explicitly in a repo's `CONTRIBUTING.md` (or `CLAUDE.md`, if the repo is one I work in with Claude) so it's the first thing a reviewer or a fresh contributor sees. A scope that "everyone knows" but is nowhere documented drifts across three developers in about a month.

### Why scopes carry the cognitive weight

Here's where the cognitive-shift argument lands. When you type `git commit -m "fix(` and pause, you're being asked a question: **which single part of this codebase did I just change?** If the honest answer is "two of them," you have a mixed-concern commit and it should be split. If the honest answer is "I don't know," you probably haven't understood what your own change did.

That pause — the two seconds between `fix(` and the closing paren — is where the format earns its keep. It's a mini design review, run against your own diff, forced by the syntax.

## The Angular convention specifically

Conventional Commits itself is generic. The **Angular convention** is a specific instantiation the Angular team wrote for their own project, and it's the convention that most tooling in the ecosystem assumes by default when you don't tell it otherwise.

The Angular convention adds four things on top of the base spec:

1. **A fixed set of types** — the eleven types listed in the table above. Anything outside that set is invalid.
2. **A stricter subject-line grammar** — imperative mood, lowercase, no period, 100 characters max.
3. **A required body** (20 characters minimum) for anything except docs-only commits, explaining the *why*.
4. **A `DEPRECATED:` footer** — same shape as `BREAKING CHANGE:`, used to announce upcoming API removals before they become breaking. Not universal, but widely adopted.
5. **Revert semantics** — a `revert:` type whose body must include the SHA of the reverted commit and a short reason.

I use the Angular convention personally, on every project I own — including this site — because the type list is small enough to memorize, wide enough to cover every real commit I've written, and standardized enough that every off-the-shelf tool understands it without configuration. The Angular convention is also what [`go-semantic-release`](https://github.com/jedi-knights/go-semantic-release), commitlint's default, cocogitto, and release-please all assume when you accept their defaults. Choosing it is choosing the path of least tooling friction.

## Rolling your own convention within the spec

The spec is deliberately extensible. Nothing stops you from defining project-specific types or scope patterns, as long as they don't violate the grammar (`<type>[(scope)]!?: <description>`).

Real-world extensions I've seen or used:

- **`hotfix`** — a subset of `fix` that indicates the change bypassed the normal review process for an incident. Same semver behavior as `fix`; distinct changelog category.
- **`security`** — a subset of `fix` for CVE-triggered patches. Some tooling treats it like `fix`; some tools (release-please, cocogitto) let you configure a distinct semver bump policy (e.g., always a minor for `security`).
- **`i18n`** — a scope-adjacent type for translation-only changes. Not a semver-triggering event.
- **`deps`** — a type (rather than a scope under `chore`) that some projects prefer to separate dependency bumps from other housekeeping. `deps(go): bump testify to v1.9.0`.

The pattern that consistently works: **fork the Angular list, add or remove types deliberately, and write the resulting list down in `CONTRIBUTING.md`.** Then teach whatever tool you use — commitlint, cocogitto, release-please — the new list via configuration. Don't just informally invent types in the commit log; the tools will silently reject or misclassify them and the effect will surface as a mysterious missing changelog entry six months later.

An example custom convention I use in a hobby project:

```text
Types:
  feat        — new user-visible functionality (minor bump)
  fix         — bug fix (patch bump)
  perf        — performance improvement (patch bump)
  refactor    — internal restructure, no behavior change
  docs        — documentation only
  test        — tests only
  build       — build system, Dockerfile, dependencies
  ci          — CI configuration
  chore       — housekeeping, none of the above

Scopes:
  Any top-level directory under cmd/, pkg/, internal/
  Cross-cutting: deps, docker, lint, release
```

Fifteen lines. Every contributor to the project reads them once, refers back to them for a week, and then internalizes them. That's the whole overhead.

## Where Conventional Commits meets release automation

The reason Conventional Commits exists in the shape it does — machine-readable types, `!` and `BREAKING CHANGE:` mapping cleanly to semver, structured footers — is that the format was designed to be the input to release-automation tooling. If you've read this far and only care about the human-facing benefits, you can stop here and you'll still be strictly better off.

But there's a payoff on top: if you follow the convention, a category of release tools takes over the whole "cut a version, generate a changelog, tag the release" workflow with zero manual input.

### semantic-release and go-semantic-release

The original tool is [**semantic-release**](https://github.com/semantic-release/semantic-release) (Node.js). Runs in CI on every push to a release branch. Reads the commit history since the last tag, applies the semver rules (`fix` → patch, `feat` → minor, `BREAKING CHANGE:` → major), decides the next version, generates a changelog, creates the tag, publishes a GitHub Release, and — with the right plugins — publishes to npm / PyPI / cargo. If no release-triggering commits are present since the last tag, it exits cleanly and does nothing.

The Go re-implementation is [**go-semantic-release**](https://github.com/jedi-knights/go-semantic-release) — a Go-native implementation of the same contract, with better monorepo support and no Node dependency. I've written a full post on it: [Writing semantic-release in Go, with real monorepo support]({{< ref "posts/writing-semantic-release-in-go.md" >}}). This site is published by it.

The two-token summary: **semantic-release turns your commit log into version tags with no human intervention.** That is the archetypal Conventional Commits use case.

### release-please (Google)

[**release-please**](https://github.com/googleapis/release-please) takes a different shape. Instead of cutting releases immediately on merge, it maintains a **Release PR** — an always-open pull request that accumulates every commit since the last release and shows the resulting changelog and version bump. When you're ready to release, you merge the PR; the version tag and GitHub Release land at that moment. When you're not, the PR sits and updates itself as new commits arrive.

The PR-driven model has real advantages: releases stop being surprises, the changelog is reviewable before it's published, and you can control the exact release moment (which matters for coordinated cross-team deploys). It also handles the "batch a week of feat/fix commits into one visible release" case gracefully. Supports Node.js, Python, Java, Go, Rust, Ruby, and about fifteen other ecosystems. Does *not* publish to package managers — narrower scope than semantic-release, which some projects prefer.

Pick semantic-release if you want fully-automated, release-per-merge behavior. Pick release-please if you want a visible review checkpoint before each release.

### cocogitto (Rust)

[**cocogitto**](https://github.com/cocogitto/cocogitto) — usually invoked as `cog` — is a Rust-native CLI and GitOps toolbox for the whole Conventional Commits workflow. Written for developers who want the full ceremony in a single tool: a commit-writing wizard (`cog commit feat auth "add TOTP flow"`), a linter (`cog check`), a bumper (`cog bump --auto`), and a changelog generator (`cog changelog`). Native monorepo support. Runs locally as well as in CI, so you can rehearse a release without pushing.

If your project is Rust-heavy and you'd rather not run a Node toolchain, cocogitto is the closest single-binary equivalent to semantic-release + commitlint + conventional-changelog. It also supports custom conventions cleanly through its `cog.toml` config.

### git-cliff (Rust)

[**git-cliff**](https://github.com/orhun/git-cliff) is a focused tool for one job: generating a changelog file from the commit history. Reads the log, groups by Conventional Commits type, renders through a Tera template, outputs Markdown (or JSON, or anything else). No release-cutting, no versioning, no publishing — just the changelog step.

Pair it with any other release tool, or drive it standalone. It's the highest-quality changelog generator I've used; the template system is worth the setup cost if the default output isn't quite what you want.

### commitlint (Node)

[**commitlint**](https://github.com/conventional-changelog/commitlint) enforces Conventional Commits at commit time. Runs as a Git hook (usually via [Husky](https://typicode.github.io/husky/)): every `git commit` is validated against a rule set before it can be recorded. Bad message → hook rejects, developer edits, tries again.

The rule set is configurable. The default preset is `@commitlint/config-conventional`, which enforces the Angular convention. Custom rules let you require specific scopes from a fixed list, restrict types, or limit subject-line length. Most projects that use Conventional Commits at scale reach for commitlint eventually — the "just document the convention and hope everyone follows it" approach has a shelf life of about two weeks.

### commitizen

[**commitizen**](https://commitizen-tools.github.io/commitizen/) approaches the same problem from the opposite direction: instead of validating messages after the fact, it prompts developers through a wizard when composing them. `cz commit` asks for the type (from a dropdown), the scope (autocomplete against a defined list), the description, whether there's a breaking change, and the body — then assembles a valid Conventional Commits message. Great for onboarding contributors; some experienced developers find it slower than typing the message by hand. Available in both Node (`commitizen`, the original) and Python (`commitizen-tools`, a separate but compatible implementation).

### The picture

- **commitizen** helps you *write* good messages.
- **commitlint** enforces that messages are good.
- **git-cliff** generates a changelog *from* the messages.
- **semantic-release** / **go-semantic-release** / **release-please** / **cocogitto** do the whole release pipeline including tagging and publishing.

You don't need all of them. Most projects pick one release automation tool + optionally one linter or wizard. The stack I use on new projects: commitlint at the pre-commit hook + go-semantic-release in the release workflow. Two tools, no ceremony beyond `git commit`.

## The bare-minimum adoption path

If you're convinced and want to try this on a project tomorrow, here's the shortest path:

1. **Read the [Conventional Commits 1.0.0 spec](https://www.conventionalcommits.org/en/v1.0.0/)** — three minutes. It's shorter than this post.
2. **Adopt the Angular convention as your starting point.** Don't invent a custom convention until you have a specific reason to.
3. **Write your project's scope list** into `CONTRIBUTING.md` or `README.md`. Ten to twenty scopes for a mid-sized project. Update it when you add a subsystem.
4. **Install `commitlint` with `@commitlint/config-conventional`** (or `cog check` in a pre-commit hook if you're Rust-native). This gives you enforcement from day one so bad messages don't accumulate in the log.
5. **Optionally, add `go-semantic-release` or `release-please` in CI** for the automation payoff.

The first week feels like extra typing. The second week the format is muscle memory. By the third week the changelog writes itself, `git log --grep` becomes a search tool you actually use, and the pause between `fix(` and `)` is the design review you never scheduled.

## Sources

- [Conventional Commits 1.0.0 specification](https://www.conventionalcommits.org/en/v1.0.0/) — the canonical spec.
- [Angular commit message guidelines](https://github.com/angular/angular/blob/main/contributing-docs/commit-message-guidelines.md) — the reference convention.
- [Cocogitto documentation](https://docs.cocogitto.io/) — Rust-native tooling for the full workflow.
- [release-please](https://github.com/googleapis/release-please) — Google's release-PR-driven alternative to semantic-release.
- [commitlint](https://github.com/conventional-changelog/commitlint) — enforcement at commit time.
- [Commitizen](https://commitizen-tools.github.io/commitizen/) — commit-writing wizard.
- [git-cliff](https://github.com/orhun/git-cliff) — Rust changelog generator.
- [go-semantic-release](https://github.com/jedi-knights/go-semantic-release) — Go-native semantic-release re-implementation.
