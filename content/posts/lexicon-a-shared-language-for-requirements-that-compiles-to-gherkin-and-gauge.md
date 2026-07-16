+++
title = "lexicon: a shared language for requirements that compiles to Gherkin and Gauge"
date = "2026-07-16T08:58:54-04:00"
draft = false
description = "Lexicon is a markdown-native requirements format that stays readable on GitHub and Slack with no special tooling, and compiles deterministically into Gherkin, Gauge, or a structured JSON representation built for LLM consumption."
tags = ["requirements", "bdd", "gherkin", "gauge", "go", "cli", "open-source"]
categories = ["Code Quality"]

[cover]
image = "/images/og/lexicon-a-shared-language-for-requirements-that-compiles-to-gherkin-and-gauge.png"
hiddenInList = true
hiddenInSingle = true
+++

[A previous post]({{< ref "posts/why-dev-qa-and-product-read-the-same-requirement-differently.md" >}}) argued that Dev, QA, and Product read the same requirement differently not because anyone is careless, but because prose leaves three things implicit — the precondition, the action, and the outcome — and that a structured format forces those three things into the open. It also argued that the specific tool doesn't matter much: Gherkin's Given/When/Then is one well-known way to get the structure, not the only one, and a team is free to define its own.

This post is about what happened when I took that argument seriously enough to build something: [**Lexicon**](https://github.com/jedi-knights/lexicon), a small, open-source, markdown-native requirements format that compiles deterministically into Gherkin, Gauge, or a structured JSON representation.

## The problem it's actually solving

Say a team agrees, in principle, that requirements need more structure than a paragraph. The next conversation is almost always about which BDD tool to adopt — Cucumber, Gauge, SpecFlow — and that conversation has a predictable shape: whoever's closest to writing the executable tests wants the format their runner speaks, and everyone else has to learn a syntax they'll never personally execute, just to review a PR.

Lexicon sidesteps that by not being a BDD framework at all. A `.lex.md` file is valid CommonMark — headings, bullet lists, tables, fenced code blocks. It renders correctly in a GitHub diff or pasted into Slack with zero plugins, which means Product and Dev can read and write it without installing anything or learning a runner's syntax. The structure that actually matters — precondition, action, outcome — is captured in a bold-keyword bullet list that any Markdown renderer already understands:

```markdown
# Feature: Search results pagination

As a user, I want to page through search results so I can browse more than the first page of matches.

@search @pagination
## Scenario: Navigating to the next page

- **Given** the user has performed a search that returns more than one page of results
- **When** the user clicks the "Next" pagination control
- **Then** the second page of results replaces the first page
- **And** the pagination control shows page 2 as active
```

QA — the one team that actually needs Given/When/Then in a specific runner's syntax — gets it mechanically instead of by hand:

```bash
$ lexicon compile --to gherkin pagination.lex.md
Feature: Search results pagination
  ...
  Scenario: Navigating to the next page
    Given the user has performed a search that returns more than one page of results
    When the user clicks the "Next" pagination control
    Then the second page of results replaces the first page
    And the pagination control shows page 2 as active
```

The same file compiles to a Gauge specification instead, if that's the runner in use — Gauge specs are themselves already markdown, so the translation is close to structural. And it compiles to a schema-stable JSON structure, where every step carries both its surface `keyword` (`Given`/`When`/`Then`) and its resolved semantic `role` (`precondition`/`action`/`outcome`) as separate fields — the concept the original post actually argued for, made explicit instead of left for a reader (human or LLM) to infer from BDD convention.

## How a team might actually use it

The workflow this is built for looks like:

1. **Product or Dev writes the `.lex.md` file as part of the story**, in the same PR as the ticket. Reviewers read it as plain markdown — no tooling required to understand what's being proposed, and no BDD syntax to learn just to leave a comment.
2. **`lexicon check` runs in CI** (there's a [GitHub Action](https://github.com/jedi-knights/lexicon/blob/main/action.yml) that wraps it) and catches structural gaps — a scenario with no `Then`, an empty Feature — before the story is ever picked up. This is the same idea as a linter, but for the shape of a requirement instead of the shape of code.
3. **QA compiles it to whatever their runner actually executes.** `lexicon compile --to gherkin` for a Cucumber-based suite, `--to gauge` for a Gauge-based one. The requirement and the executable spec stop being two documents that can quietly drift apart — one is generated from the other.
4. **Nobody has to agree on a BDD framework to get the benefit.** The structure — and the CI gate — exist independent of which runner (if any) eventually consumes the compiled output.

## Where it stands today

Lexicon is early — a `v0`, [MIT-licensed](https://github.com/jedi-knights/lexicon/blob/main/LICENSE), living in the [`jedi-knights`](https://github.com/jedi-knights/lexicon) org. A few things are true about it right now that are worth saying plainly rather than discovering later: Gherkin output is verified against the real `cucumber/gherkin` parser as a CI gate, so an emitted `.feature` file is checked, not just assumed, to be valid; Gauge output doesn't have an equivalent real-parser check yet, because Gauge's parsing internals aren't exposed as a stable library, so it's verified against hand-authored fixtures for now. Gherkin's `Rule` keyword, Gauge's Concepts and teardown blocks, and any kind of editor/LSP tooling are deliberately out of scope for this version — named in the README, not silently missing.

The part I'd actually defend, independent of how the rest of it matures: the translation target is an open set, not a hardcoded pair. Gherkin and Gauge are the first two proofs that the architecture works, not the ceiling of what it can do — a team with its own in-house test format writes one new adapter, not a migration off Lexicon. The format was never really the point. What has to survive contact with a real team is whether a precondition, an action, and an outcome are still impossible to leave out of the file, no matter which tool — if any — eventually reads it.
