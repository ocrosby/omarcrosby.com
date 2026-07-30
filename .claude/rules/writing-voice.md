# Writing Voice

Every post on this site should read like the same person wrote it — including the ones Claude drafts or edits. The failure mode this rule guards against is generic "AI blog voice": a post that is technically accurate, well-organized, and indistinguishable from a thousand other technical blogs. That voice is fluent but flat. It never commits to a position, never shows its sources, never admits a limitation, and never ends anywhere memorable.

This rule was derived by reading a sample of existing posts (`mutation-testing-grading-the-tests-not-the-code.md`, `unit-tests-what-were-actually-arguing-about.md`, `testing-behavior-not-implementation.md`, `why-dev-qa-and-product-read-the-same-requirement-differently.md`, `the-pair-programming-session-that-made-me-write-tests-first.md`) and extracting the concrete, recurring patterns — not vibes like "clear" or "conversational."

## The voice, characterized

- **Open on a concrete scenario or a sharp diagnostic claim, never a definition.** *"Years ago, on my first day at a new company, I sat down for what I thought was going to be a normal pair-programming session."* / *"Two engineers can both be advocating for 'good practice' and end up in opposite rooms, because they're arguing about different things."* The opening earns the reader's attention with a situation, not a topic sentence.
- **State the thesis early, often as an italicized diagnostic question.** *"The single most useful question I ask about a unit test is: if I change how this code is written without changing what it does, will the test still pass?"* The reader knows the whole post's argument by the end of paragraph one or two.
- **Name your own position and steelman the others before disagreeing with them.** *"I'm writing this from the pragmatist position, which is one of four voices I'll name below. I'll give each of the others the strongest form of its position before I say why I don't hold it."* Never build a strawman to knock down.
- **Ground technical claims and terms in named, dated primary sources.** Beizer's *Software Testing Techniques* (1990), DeMillo/Lipton/Sayward's 1978 paper, Petrović and Ivanković's 2018 Google paper. A claim that has a known originator gets that originator's name attached, not "some argue" or "it's often said."
- **Include an explicit "what this does NOT tell you" section on any technique- or tool-focused post.** Mutation testing does not measure whether the spec is right; a requirement structure does not replace judgment. Naming the boundary of a technique is not hedging — it's the thing that makes the recommendation trustworthy.
- **Close with a single-sentence distillation of the whole post, then a nudge toward action.** Not a recap of sections — one sentence that would still make sense quoted out of context, followed by an invitation to go try the thing now rather than someday.
- **When an example is meant to generalize, say so explicitly and often show it in more than one language or tool.** *"Examples are in Python, Go, and Rust so the point lands regardless of your stack — the failure mode is the same in every language."*
- **Prose rhythm alternates a short, declarative claim with a longer sentence that unpacks it.** Avoid three medium-length sentences of the same shape in a row — it reads as generated.
- **Skepticism toward metrics and hype is a standing default.** Call out the failure mode of optimizing a number directly ("chasing mutation score with tests that pin implementation detail raises the score and lowers the suite's survivability") rather than presenting a technique as an unqualified win.

## Recognition Signals

| Signal | Fix |
|---|---|
| Draft opens with a definition, a topic sentence, or "In this post I will explain X" | Rewrite the opening as a concrete scenario, anecdote, or a stated tension/diagnostic claim |
| The core claim doesn't appear until paragraph 3+ | Move the thesis into the first one or two paragraphs, ideally phrased as an italicized diagnostic question |
| A position is stated and argued against without giving the opposing view its strongest form first | Add a steelman paragraph — the strongest version of the view being rejected — before the rebuttal |
| A technical claim, term, or history is presented with no attribution | Name the originating book, paper, or person, with a year, if one genuinely exists. Don't invent one if it doesn't. |
| A technique- or tool-focused post has no "what this does not tell you" / limitations section | Add one — this is a standing structural expectation for this kind of post, not optional polish |
| The post ends on the last technical point with no distillation | Add a closing single-sentence version of the whole argument, then a concrete next action |
| An example is framed as generalizing but only shows one language/tool | Either add a second language/tool example, or explicitly state why the failure mode is the same regardless |
| Three or more consecutive sentences share the same length and clause structure | Vary rhythm — short declarative claim, then a longer sentence that unpacks it |
| A tool, metric, or technique is presented with no acknowledgment of a failure mode or misuse pattern | Add the skeptical counterweight — this site does not do unqualified endorsements |

## Mandatory Behaviors

**When drafting new post prose** (not front matter, not scaffolding placeholder text): apply the recognition signals above before considering a draft done. Read the draft once specifically checking for the opening, the thesis placement, and the closing distillation — those three are the highest-leverage checks.

**When editing existing post prose**: preserve the voice patterns already present in that post. Don't introduce a steelman paragraph into a post that never argues a position, and don't strip one out of a post that does.

## Pragmatism Guard

Do not apply this rule when:

- **The post is a straightforward mechanical walkthrough with no position to argue** (an install guide, a tool-setup post). These can skip the steelman/opposing-positions signal, but should still open on something concrete rather than a definition, and should still close with a distillation.
- **The scaffolded placeholder from `/new-post`** (`draft = true`, body is `Write your post here.`) — this rule applies once real prose is being written, not to the stub.
- **The user explicitly asks for a different register** (a short announcement, a changelog-style post) — follow the explicit request over this rule.

## When this rule fires

- Any `Write` creating substantive prose under `content/posts/`.
- Any `Edit` that changes prose (not front matter) under `content/posts/`.
- Any `hugo-authoring` skill invocation that drafts new post content.

## Report as

- **Should Fix** — a draft is missing two or more of the recognition signals above.
- **Consider** — the overall shape is right but a specific paragraph reads generic or flat.

## Not covered by this rule

- **Grammar, emphasis-delimiter consistency, heading case** — see `markdown-emphasis-style.md` and the global `docs-principles.md` style guide.
- **Front matter fields, tags, categories** — see `content-frontmatter.md`.
- **Titles under `content/projects/`** — those follow `project-title-naming.md`, a display-formatting rule, not a voice rule.
