+++
title = "Reducing your Claude token bill without giving up capability"
date = "2026-09-15T15:05:02-04:00"
draft = false
description = "A plain-language playbook for cutting Claude token spend — route to the right model, cache repeated context, batch offline work, and keep your context lean without losing capability."
tags = ["claude", "claude-code", "ai-assisted-development", "productivity", "cost-optimization"]
categories = ["Claude Code"]

[cover]
image = "/images/og/reducing-your-claude-token-bill-without-giving-up-capability.png"
hiddenInList = true
hiddenInSingle = true
+++

You open Claude, ask a question, and see an answer. That is the entire mental model most people have of a token bill. What is invisible on that same turn is that the session has already loaded a system prompt, whatever memory files apply, the tool definitions, the last few tool results, and — if you asked Claude to read a file — the file too. Add fifty turns and a couple of re-reads to fix a mistake, and the same conversation that felt like ten questions is closer to a hundred pages of input the model is re-processing every time you hit enter.

*The single most useful question I ask about a Claude session is: which of these tokens are actually earning their keep?* Everything below is a way to answer that question in a place you can act on it.

I'm writing this from the pragmatist position — capability first, cost as a design constraint rather than a target. The steelman on the other side is real. "Spend hours optimizing prompts, save cents on tokens" is a genuine failure mode for individual developers on small workloads. If you send Claude a handful of requests a day from a laptop, the cost of your time will always dominate the cost of your tokens. This post is not for that end of the spectrum. It is for anyone whose usage has crossed one of two thresholds — a monthly bill they now think about, or a session length that runs past the context window regularly — and who wants a set of levers to pull instead of a vague sense they should "use Claude less."

One narrowing before the techniques. This post assumes your usage is **metered** — the Claude API, Claude Code on the API-billing path, the SDKs, Managed Agents, or any product built on top. If you're on a flat-fee subscription (Claude.ai Pro, Max, Team, Enterprise), you don't have a token bill in the ordinary sense — you have rate limits and a session-length ceiling. Levers 4 through 6 below (context hygiene, durable instructions, being specific about file reads) still apply directly to you, because they extend how much useful work fits inside your session before you hit compaction or a limit. The other four (model routing, prompt caching, batch, parallel tool calls) are largely invisible from inside a subscription chat and can be skimmed.

With that scoped: each section below names *what* the lever is, *why* it works, and *when* to reach for it. Read straight through the first time, then come back and use it as a checklist against your own setup.

## The seven levers

The order below is the order I'd audit an existing setup in — cheapest-to-check first, most-invasive-to-change last — not a ranking by savings. Which lever pays back most depends on your workload, and the closing section names which levers matter most for common workload shapes.

## Lever 1 — Route each task to the right model

Anthropic ships three model tiers on purpose. Haiku is the small model, Sonnet is the mid tier, and Opus is the flagship. Each tier is priced roughly a step apart — the small model costs a fraction of the mid tier, and the mid tier costs a fraction of the flagship (see Anthropic's own [pricing page](https://platform.claude.com/docs/en/about-claude/pricing) for the current per-million-token numbers, which move faster than any blog post can track).

The rule of thumb: **use the smallest model that can complete the task well enough**. A classification, a summary, an extraction, a formatting pass, a short reply to a routine question — Haiku. A code edit, a design conversation, an ambiguous refactor, most agentic work — Sonnet. A hard architectural question with a lot of dependencies, or a task where a wrong answer costs you an hour of cleanup — Opus.

Running everything on the flagship model is the single most common source of an inflated Claude bill. Anthropic's [pricing page](https://platform.claude.com/docs/en/about-claude/pricing) lists the three tiers roughly a step apart — Sonnet is a few times cheaper than Opus, Haiku a few times cheaper than Sonnet. Concretely: a workload that runs 100% on Opus and gets rerouted so 80% runs on Sonnet costs roughly one-quarter as much on input tokens, without changing what the 20% that stays on Opus actually does. Actual savings depend on your workload mix; the pricing page has the current per-million-token numbers, and the arithmetic is a spreadsheet away. In Claude Code you can switch mid-session with `/model`; in the API and SDKs, you choose per request; in the Claude Console, you can route different agents to different models.

The failure mode of over-routing is real too: sending a hard question to Haiku and getting a confidently wrong answer costs you the follow-up round-trip *plus* the correction. Route to the smallest model that reliably handles the task on your workload, not the smallest model that has ever handled that task type in a benchmark.

## Lever 2 — Turn on prompt caching for anything you send more than twice

Every request you send Claude is re-processed from scratch — unless you mark a portion of the prompt as cacheable. Anthropic's [prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) feature lets you tag a block with `"cache_control": {"type": "ephemeral"}`; on the next matching request Claude reads it from cache instead of re-processing it.

The cost math is simple.

- A cache **read** costs 0.1× the base input price — a 90% discount.
- A cache **write** costs 1.25× the base for a 5-minute TTL, or 2× for a 1-hour TTL.
- **Break-even on the 5-minute TTL is one read.** The first cache hit already saves more than the 0.25× write premium cost — you're roughly 15% ahead after a single re-use.
- **Break-even on the 1-hour TTL is two reads.** Only worth the extra write premium if the same prefix will be re-read many times over a longer window — a system prompt hit by hundreds of sessions, a long document a batch job re-references throughout the hour.

The rules that catch people out:

- **Caching is prefix-based.** Put the stable content (system prompt, tool definitions, long documents you keep referencing) at the *start* of the prompt. Put the changing content (the user's current turn, a timestamp, per-request variables) at the *end*. A single character changing inside the cached prefix invalidates everything after it.
- **Minimum cacheable size varies by model** — most current models cache prefixes of at least ~1,000 tokens. Below that, the block is processed without caching and no error is returned.
- **You get four explicit cache breakpoints per request.** Use them at the boundaries between things that change at different rates — tool definitions rarely, system prompt occasionally, message history often.
- **Cache reads don't count against your input-tokens-per-minute rate limit.** For high-volume workloads this is a second-order benefit that often matters more than the price cut.

What caching does *not* do: it does not shrink the context window. A cached 20,000-token prompt still occupies 20,000 tokens of your window on every turn — you just stop paying full price to keep re-sending them. If your problem is the context window, keep reading.

## Lever 3 — Batch what doesn't need to be immediate

Anthropic's [Message Batches API](https://platform.claude.com/docs/en/build-with-claude/batch-processing) applies a flat **50% discount** to any request you're willing to wait up to 24 hours for. Real latency is usually minutes to a few hours; the SLA is the ceiling, not the norm. The trade is availability, not quality — identical model, identical output, half the cost.

Batch is the right tool for offline evals, document ingestion, nightly summarization, classification jobs, any "we run this once a day" workflow, and anything where a human is not staring at the response bar waiting for the token stream. It is the wrong tool for chat, interactive tool use, or anything on the critical path of a user request.

Batch stacks with caching: cached reads inside a batch request get the same 50% discount on top of the 90% cache-read discount, so the effective input cost on the right workload can drop to a small fraction of the base price. The [Anthropic launch post](https://anthropic.com/news/message-batches-api) walks through the request shape; the docs page above has the current field list.

## Lever 4 — Keep your context window lean

If you use Claude Code, the [context window](https://code.claude.com/docs/en/context-window) is finite (currently 200K tokens on the default model, 1M on the extended-context variants) and every token left in it is a token the next turn re-processes. There are three complementary levers here.

**`/clear`** starts a new session with a blank slate. Use it every time you switch to unrelated work. The cost of restarting is the cost of one system-prompt load; the cost of not restarting is that every future turn in that session carries the weight of the previous task's tool results, file reads, and correction history.

**`/compact`** summarizes the current session's history into a shorter version so the same conversation can continue in a smaller footprint. Reach for it when you're mid-task and don't want to `/clear`, but the context bar is filling. There is a quality cost — summarization is lossy — so use it in place of the alternative (Claude losing coherence as the context bar hits 100%), not preemptively.

**Subagents** are the biggest lever most people don't use. A subagent runs in a completely separate context window and returns only a summary to your main context. Ask a subagent "find every place we call the payments API" — it reads the files, then hands back a paragraph. The paragraph lands in your context; the files do not. Anthropic's [context window walkthrough](https://code.claude.com/docs/en/context-window) narrates a session where a subagent reads **6,100 tokens** of files and returns a **420-token** summary — a ~15× reduction on that portion of your window, with no loss of the actual information you needed.

The general rule: **anything you don't need to reason about again should live in a subagent's context, not yours.**

## Lever 5 — Put durable facts in a persistent file, not in every chat

Every serious Claude workflow has a set of instructions that are true across every session — coding conventions, project structure, commands that work in this repo, rules to never break. If you keep typing those into the chat window, you pay the token cost every time.

Move them into a persistent file instead. In Claude Code the file is `CLAUDE.md` (see [Anthropic's overview of Claude Code configuration](https://code.claude.com/docs/en/overview)); in the API it is your system prompt; in Anthropic's Managed Agents it is the agent's instructions field. Once, at the start of a session, Claude loads the file; from then on, the instructions are already in context and you never re-type them.

The mirror-image rule matters just as much: **things that only apply to today's task belong in the prompt, not in the persistent file.** A CLAUDE.md that has grown to 500 lines because someone kept dumping session-specific notes into it is a permanent token tax on every future session in that project. If in doubt, ask whether the instruction will still be true next week; if the answer is "no," it does not belong in the persistent file.

## Lever 6 — Be specific about which files Claude should read

"Read the codebase and figure out how auth works" is a maximally expensive prompt. Claude walks directories, samples files, hits dead ends, and often re-reads things because it did not know where to start. Every one of those reads consumes tokens.

"Read `internal/auth/handler.go` and its two direct callers" contains roughly the same information at a fraction of the tokens. When you know the file path, hand it over. When you know the symbol name, hand it over. When you know the answer is in the last thirty lines of a specific file, say so. This is not a shortcut around Claude's ability to explore — it is a shortcut around paying Claude to guess where to look.

The related habit: prefer one-shot shell commands to multi-step Claude reasoning for deterministic work. Asking Claude to count something across 500 log lines costs you those 500 lines of input, plus a chain of reasoning tokens, plus the risk of an off-by-one mistake. A three-line `awk` pipeline costs zero tokens, runs in milliseconds, and returns a number Claude can then reason about. The same logic applies to `grep`, `jq`, `git log --stat`, and any other CLI that already knows how to do the thing you were about to ask Claude to do by hand.

## Lever 7 — Batch parallel tool calls into a single turn

Any time Claude needs to do two or more independent things — read three files, run two greps, check `git status` and `git diff` — those calls should happen in one turn, not in a chain of sequential turns.

The mechanism: every new turn re-processes the entire conversation above it. Three sequential tool-call turns pay for the shared context four times over; one turn with three parallel tool calls pays for it twice. The cost differential grows with how much context sits above the call site — small on a fresh session, substantial deep in a long one — and shrinks toward zero when the prefix is cached. Most Claude interfaces support parallel tool calls natively; you rarely have to prompt for it explicitly. But the habit compounds, and a Claude that has fallen into a sequential rhythm can quietly double its own token consumption without either of you noticing.

## What this does not tell you

- **Whether the model you saved by switching from Opus to Sonnet is actually good enough for your workload.** The seven levers above cut cost. They do not guarantee quality. Evaluate on your own tasks before locking in a routing choice — a workload that Haiku handles at 95% quality for 20% of the cost is a win; a workload that Haiku handles at 60% quality is a false economy no matter what it costs.
- **Whether prompt caching will speed things up.** It usually will slightly, because cache reads skip a step. But the primary payoff is cost, not latency. Do not tune for cache hit rate as if it were a latency dashboard.
- **Which lever matters most for your specific setup.** Someone running one long Claude Code session a day should focus on levers 4–7. Someone running an evaluation harness against thousands of documents should focus on 1–3. A product built on the API should audit against all seven. There is no universal ranking.
- **How to measure whether any of this is working.** Every surface Anthropic ships exposes token accounting somewhere — Claude Code has `/context` and per-turn cost readouts; the API returns `input_tokens`, `output_tokens`, `cache_read_input_tokens`, and `cache_creation_input_tokens` on every response; the Anthropic Console shows aggregate usage per workspace and per API key. If you cannot see the number, you cannot tell whether a change helped.
- **How to negotiate the trade between token spend and human time.** Every technique above has a setup cost. Prompt caching requires a code change; subagents require thinking about task decomposition; batch processing requires an async workflow. If your total monthly Claude spend is less than an hour of your time, do not do the work. If it is more, start from the top of the list.

## The one-sentence version

*Cheap tokens are the ones that carry weight — either because they'll be read many times (cache them), used once and never revisited (route them to the smallest model that can handle them), or removed from the loop entirely (delete them, or let a subagent read them for you instead of you).*

The next time you start a Claude session, spend the first thirty seconds deciding which category the work in front of you falls into. That is the whole discipline. Everything above is scaffolding.
