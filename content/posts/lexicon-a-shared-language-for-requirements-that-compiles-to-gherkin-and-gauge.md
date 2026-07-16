+++
title = "lexicon: a shared language for requirements that compiles to Gherkin and Gauge"
date = "2026-07-16T08:58:54-04:00"
draft = false
description = "Lexicon is a markdown-native requirements format that stays readable on GitHub and Slack with no special tooling, and compiles deterministically into Gherkin, Gauge, or a structured JSON representation built for LLM consumption."
tags = ["requirements", "bdd", "gherkin", "gauge", "go", "cli", "open-source", "claude"]
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

Lexicon sidesteps that by not being a BDD framework at all. A `.lex.md` file is valid CommonMark — headings, bullet lists, tables, fenced code blocks. It renders correctly in a GitHub diff or pasted into Slack with zero plugins, which means Product and Dev can read and write it without installing anything or learning a runner's syntax.

## The syntax

The whole grammar fits in one file, and every construct is something CommonMark already renders correctly on its own. A file with all of it looks like this:

```markdown
---
id: SEARCH-042
owner: product
status: draft
---

# Feature: Search results pagination

As a user, I want to page through search results so I can browse more than the first page of matches.

## Background

- **Precondition** the catalog has more than one page of results

@search @pagination
## Scenario: Navigating to the next page

- **Precondition** the user has performed a search that returns more than one page of results
- **Action** the user clicks the "Next" pagination control
- **Outcome** the second page of results replaces the first page
- **And** the pagination control shows page 2 as active

@search @pagination
## Scenario: Jumping to a specific page

- **Precondition** the user has performed a search that returns more than one page of results
- **Action** the user clicks the page `<page>` control
- **Outcome** the `<page>` page of results replaces the current page

| page |
| ---- |
| 2    |
| 3    |
```

Walking through each piece:

- **`# Feature: <name>`** is the one required heading, with an optional free-text description paragraph directly beneath it (the "As a user, I want..." line above). One per file.
- **`## Scenario: <name>`** is a named sequence of steps. A file can have as many as it needs.
- **`## Background`** (no `Scenario:` prefix) runs before every other scenario in the file — the same idea as Gherkin's `Background:`, spelled the same way on purpose.
- **Steps are bullets with a bold leading keyword, written in either of two dialects.** The example above uses the dialect-neutral spelling — `- **Precondition**`, `**Action**`, `**Outcome**`, `**And**`, `**But**` — which matches the names of the underlying semantic roles exactly. Lexicon also accepts the widely-recognized BDD spelling — `- **Given**`, `**When**`, `**Then**`, `**And**`, `**But**` — the one Cucumber, Behave, and SpecFlow all use. Both dialects resolve to the same underlying role, can be mixed freely across scenarios in the same file, and are otherwise a normal Markdown bullet list everywhere they're viewed — nothing about either one requires a renderer that understands Lexicon specifically. Which dialect to reach for is really a question of audience: neutral phrasing reads as plain English to someone who's never touched a BDD tool, BDD phrasing reads as familiar shorthand to someone who has.
- **`@search @pagination`** on the line directly above a heading tags it. It's the only tagging mechanism — front matter is never used for tags, so there's exactly one place to look.
- **The table after the second scenario's steps is Examples/outline data.** Its presence, combined with the `` `<page>` `` placeholders in the step text above it, is what turns that scenario into an outline — run once per row. No separate `Scenario Outline` keyword is needed, because a table already means "these values vary."
- **The placeholders are backtick-escaped on purpose, not by style preference.** A bare `<page>` is inline raw HTML as far as CommonMark is concerned, and GitHub's renderer silently drops tags it doesn't recognize — a bare placeholder in an Examples row just vanishes when viewed on GitHub. I checked this against GitHub's actual markdown API rather than assuming it: a bare `<page>` renders as nothing; `` `<page>` `` renders as visible `<page>` text every time.
- **The `---`-delimited block at the top is front matter** for bookkeeping that has no BDD equivalent — a ticket ID, an owner, a status, a `links` list. It's kept deliberately separate from tags, so there isn't a second, parallel way to label a scenario. Anything else added to the block lands in a catch-all `extra` map in the parsed output rather than being silently dropped.

One more construct doesn't show up above: a **doc string**, for attaching a longer block of text to a single step. It's a fenced code block, indented two spaces so CommonMark parses it as part of that step's bullet instead of ending the list:

````markdown
# Feature: Empty search state

## Scenario: Rendering an empty state

- **Precondition** the search returns zero results
- **Action** the results page renders
- **Outcome** the page shows the following message

  ```text
  No results found for your search.
  ```
````

## Compiling it

`lexicon compile --to gherkin` on the pagination file above produces the same output no matter which dialect the source was written in — `Precondition`/`Action`/`Outcome` and `Given`/`When`/`Then` both normalize to Gherkin's own `Given`/`When`/`Then` keywords in the emitted feature file:

```gherkin
Feature: Search results pagination

  As a user, I want to page through search results so I can browse more than the first page of matches.

  Background:
    Given the catalog has more than one page of results

  @search @pagination
  Scenario: Navigating to the next page
    Given the user has performed a search that returns more than one page of results
    When the user clicks the "Next" pagination control
    Then the second page of results replaces the first page
    And the pagination control shows page 2 as active

  @search @pagination
  Scenario: Jumping to a specific page
    Given the user has performed a search that returns more than one page of results
    When the user clicks the page <page> control
    Then the <page> page of results replaces the current page

    Examples:
      | page |
      | 2 |
      | 3 |
```

`--to gauge` produces the equivalent Gauge specification — Gauge specs are themselves already markdown, so that translation is close to structural. `--to json` produces a schema-stable structure instead of executable test syntax. For the doc-string example above:

```json
{
  "feature": {
    "name": "Empty search state",
    "scenarios": [
      {
        "name": "Rendering an empty state",
        "steps": [
          {
            "keyword": "Precondition",
            "role": "precondition",
            "text": "the search returns zero results"
          },
          {
            "keyword": "Action",
            "role": "action",
            "text": "the results page renders"
          },
          {
            "keyword": "Outcome",
            "role": "outcome",
            "text": "the page shows the following message",
            "doc_string": {
              "content_type": "text",
              "content": "No results found for your search."
            }
          }
        ]
      }
    ]
  }
}
```

Every step carries both its surface `keyword` — `Given`/`When`/`Then`/`And`/`But` if the source used the BDD dialect, `Precondition`/`Action`/`Outcome`/`And`/`But` if it used the neutral one — and its resolved semantic `role` (`precondition`/`action`/`outcome`) as separate fields — the concept the original post actually argued for, made explicit instead of left for a reader to infer from BDD convention. That distinction is also the reason this format is worth a closer look if you're using an LLM anywhere in the loop.

## Where Claude (and other LLMs) fit

Two directions matter here, and they're different problems: getting an LLM to *write* a `.lex.md` file, and getting an LLM (or any other tool) to *consume* one reliably.

**Writing.** The bold-keyword bullet list isn't a format Claude has to be taught — it's close to what a model already produces unprompted when asked to lay out steps, because it's just Markdown with a naming convention on top. Handing Claude one example like the pagination file above and asking it to draft a new scenario from a plain-English description works about as well as handing the same example to a new hire. The syntax was kept small specifically so that "here's one example, now do this" is a sufficient prompt — there's no separate DSL reference to paste into context first. The dialect choice carries over the same way: show the model a neutral-dialect example and it writes `Precondition`/`Action`/`Outcome`; show it a BDD-dialect one and it writes `Given`/`When`/`Then` — the one-example prompt still works either way, since both are just conventions layered on the same bullet-list shape.

The part that actually needs a tool, not a well-crafted prompt, is *validating* what came back. An LLM is good at producing fluent, plausible-sounding steps; fluency is exactly the property that makes it easy to miss a scenario that reads fine but never states an outcome:

```markdown
# Feature: Password reset

## Scenario: Requesting a reset link

- **Precondition** a registered user has forgotten their password
- **Action** the user submits their email on the reset form
```

That reads like a complete thought. It isn't — there's no `Outcome` step. `lexicon check` doesn't care how fluent the prose is:

```bash
$ lexicon check password-reset.lex.md
password-reset.lex.md (Requesting a reset link): error: scenario has no Then (outcome) step
```

(The error text itself still says `Then` rather than `Outcome` regardless of which dialect the source used — a wording detail in the tool that hasn't caught up to the dialect-neutral option yet, not something specific to this example.)

That's the actual value of running a structural checker on LLM output: it catches the specific failure mode where a model fills in something plausible for whichever field it happened to address, and silently skips the one it didn't. The same check runs whether a human or a model wrote the file, which is the point — no separate "AI-generated content" review lane.

**Consuming.** This is where the JSON target does the real work. If you want an LLM (or an agent, or a codegen step) to act on a requirement programmatically — generate step-definition stubs, summarize a batch of scenarios, flag ones that look duplicated — handing it a `.lex.md` file means it has to re-derive precondition/action/outcome from BDD convention before it can do anything useful with the content. Handing it `lexicon compile --to json` output means that work is already done: `role: "outcome"` is a field to read, not an inference to make. That's a smaller, more reliable task for a model to get right than "read this prose and tell me which sentence is the assertion."

The workflow this actually enables, end to end: a human or an agent drafts a `.lex.md` scenario from a plain description; `lexicon check` runs — in CI, or as a quick local pass — before anyone treats the draft as done; `lexicon compile --to json` hands a structured version to whatever needs to act on it programmatically; `--to gherkin` or `--to gauge` hands QA's runner the executable form. Nothing in that chain requires the model to have been trained on Lexicon specifically — the format's whole design goal was staying close enough to plain Markdown that "write in this shape" is a one-example prompt, and structured enough that "read this reliably" doesn't require prose inference at all.

## How a team might actually use it

The workflow this is built for looks like:

1. **Product, Dev, or an LLM drafts the `.lex.md` file as part of the story**, in the same PR as the ticket. Reviewers read it as plain markdown — no tooling required to understand what's being proposed, and no BDD syntax to learn just to leave a comment.
2. **`lexicon check` runs in CI** (there's a [GitHub Action](https://github.com/jedi-knights/lexicon/blob/main/action.yml) that wraps it) and catches structural gaps — a scenario with no `Outcome` step, an empty Feature — before the story is ever picked up, regardless of who or what drafted it.
3. **QA compiles it to whatever their runner actually executes.** `lexicon compile --to gherkin` for a Cucumber-based suite, `--to gauge` for a Gauge-based one. The requirement and the executable spec stop being two documents that can quietly drift apart — one is generated from the other.
4. **Nobody has to agree on a BDD framework to get the benefit.** The structure — and the CI gate — exist independent of which runner (if any) eventually consumes the compiled output.

## Where it stands today

Lexicon is early — a `v0`, [MIT-licensed](https://github.com/jedi-knights/lexicon/blob/main/LICENSE), living in the [`jedi-knights`](https://github.com/jedi-knights/lexicon) org. A few things are true about it right now that are worth saying plainly rather than discovering later: Gherkin output is verified against the real `cucumber/gherkin` parser as a CI gate, so an emitted `.feature` file is checked, not just assumed, to be valid; Gauge output doesn't have an equivalent real-parser check yet, because Gauge's parsing internals aren't exposed as a stable library, so it's verified against hand-authored fixtures for now. Gherkin's `Rule` keyword, Gauge's Concepts and teardown blocks, and any kind of editor/LSP tooling are deliberately out of scope for this version — named in the README, not silently missing.

The part I'd actually defend, independent of how the rest of it matures: the translation target is an open set, not a hardcoded pair. Gherkin and Gauge are the first two proofs that the architecture works, not the ceiling of what it can do — a team with its own in-house test format writes one new adapter, not a migration off Lexicon. The format was never really the point. What has to survive contact with a real team is whether a precondition, an action, and an outcome are still impossible to leave out of the file, no matter which tool — if any — eventually reads it.
