+++
title = "Skills vs MCP: what we're actually arguing about"
date = "2026-08-07T11:19:04-04:00"
draft = false
description = "Three voices argue about how to extend a Claude agent — skills-first, MCP-anchored, complementary. The debate dissolves once you separate procedural knowledge from live reach."
summary = "Three voices argue about how to extend a Claude agent — skills-first, MCP-anchored, complementary. The debate dissolves once you separate procedural knowledge from live reach."
tags = ["claude-code", "mcp", "skills", "ai-assisted-development", "developer-tools"]
categories = ["Claude Code"]
ShowToc = true

[cover]
image = "/images/og/skills-vs-mcp-what-were-actually-arguing-about.png"
hiddenInList = true
hiddenInSingle = true
+++

A teammate's PR added a small Claude Code workflow last quarter: pull a GitHub issue's comments, summarize them, draft a triage reply. He shipped it as a skill — a folder of Markdown with a shell script that shelled out to `gh api`. Another reviewer asked, entirely reasonably, why we hadn't wired up the official GitHub MCP server instead. Both of them were right in a way that made the answer harder than the question looked. One was optimizing for the tokens the wiring would eat before the model ever saw the task; the other was optimizing for the reach a shared transport buys the whole team over the next dozen integrations. Neither could tell you the other was wrong; neither could tell you what they were actually arguing about.

Up front: I'm writing this from the explicitly-complementary position — the one that ends up mixing both — which is the side this essay lands on; you'll see the reasoning as we go. I'll give the skills-first and MCP-anchored voices the strongest form of their arguments before I say where I disagree, and I'll turn the same lens on the complementary position too.

## Timeline

Anthropic introduced the **Model Context Protocol** on <a href="https://www.anthropic.com/news/model-context-protocol" target="_blank" rel="noopener">November 25, 2024</a> as *"an open standard that enables developers to build secure, two-way connections between their data sources and AI-powered tools."* Launch partners included Block, Apollo, Zed, Replit, Codeium, and Sourcegraph; prebuilt servers for GitHub, Google Drive, Slack, Postgres, and Puppeteer shipped the same day.

**Claude Skills** shipped on <a href="https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills" target="_blank" rel="noopener">October 16, 2025</a>, framed by Anthropic as *"folders that include instructions, scripts, and resources that Claude can load when needed."* Skills are model-invoked: only the `name` and short `description` load at session start; the body and any bundled scripts load on demand. Anthropic's own metaphor for the loading strategy is *"a well-organized manual that starts with a table of contents, then specific chapters, and finally a detailed appendix."*

The same October day the Skills announcement dropped, Simon Willison published <a href="https://simonwillison.net/2025/Oct/16/claude-skills/" target="_blank" rel="noopener">*Claude Skills are awesome, maybe a bigger deal than MCP*</a>. That title is where the current three-way conversation begins.

## The three voices in every real conversation about this

Any long-enough conversation about extending a Claude agent gathers three distinct voices. The honest version of each, not the caricature I could dismiss:

- **The skills-first challenger** — *the context window is finite, and every tool schema loaded up front eats the budget the model has to actually think.* Skills load progressively; a folder of Markdown is portable across projects and lives beside the code that uses it. Do the simplest thing that could possibly work, and only reach for a running server when you actually need one. Simon Willison is the most visible voice here.
- **The MCP-anchored mainstream** — *a year of tooling and adoption has coalesced around MCP as the default answer to "how do I plug X into an agent."* Ten thousand-plus public servers, cross-client portability, an actual auth handshake. Nobody in this camp is arguing skills are bad; they're arguing MCP is the load-bearing structure and skills are additive rather than a replacement. Pedro Rodrigues (Supabase) captures the version I've seen articulated most cleanly: *"MCP is the pilot, skills are the co-pilot. You don't fire the pilot because the co-pilot knows the route."*
- **The complementary pragmatist** — *the argument is a category error.* MCP is infrastructure; skills are knowledge. A skill tells the agent how to think about a problem; an MCP server gives it something to think about. The interesting question isn't which one to pick, but where the seam belongs in a specific workflow. Anthropic's own Skills announcement lands here explicitly: skills *"complement Model Context Protocol (MCP) servers by teaching agents more complex workflows that involve external tools and software."*

An honest caveat about the trichotomy: I couldn't find a named engineer publicly arguing the pure MCP-first, anti-skills position. The strongest MCP-anchored voices — Rodrigues, the Anthropic MCP team's own posts, the Block and Sourcegraph launch statements — all frame the two mechanisms as complementary rather than competitive. The "MCP-anchored" posture is real; the "MCP-purist" posture I would have to construct, which is a strawman. That absence is itself a data point about where the conversation has settled.

## Where the skills-first challenger is right: the token math

The most-cited data point on MCP's context cost is a specific measurement of three common MCP servers running side-by-side. Apideck, benchmarking GitHub + Slack + Sentry MCP tool definitions together, found the schemas alone consumed **roughly 143,000 of a 200,000-token context** before any user message — about 72% of the budget spent on nothing but describing what the agent *could* do. The number circulates in secondary coverage (<a href="https://byteiota.com/perplexity-ditches-mcp-72-context-waste-kills-protocol/" target="_blank" rel="noopener">byteiota</a>, agentmarketcap) attached to reporting that Perplexity's team walked away from MCP internally around Ask 2026; I've been unable to find a primary Perplexity source for the attribution, so I'm citing the measurement, not the on-stage claim.

The number is not unique to those three servers. Simon Willison, in <a href="https://simonwillison.net/2025/Aug/22/too-many-mcps/" target="_blank" rel="noopener">*Too many MCPs*</a> (August 2025), measured GitHub's official MCP server alone at **55,000 tokens defining 93 tools**. That is a defensible measurement against a specific commit of `github/github-mcp-server`, not a rhetorical figure — the current server exposes 16-plus toolsets (Actions, Issues, PRs, Repos, Discussions, Code Security, Dependabot, and more), and every additional toolset the server enables raises the count.

So the skills-first math is real. What the number *isn't* is a claim that skills replace MCP — it's a claim that eagerly loading every tool schema at startup was never an inevitability of extending an agent, and that the space of alternatives (progressive skills, deferred tool discovery, code-generated SDKs) matters more than the specific bake-off between the two options in current tutorials.

## A third architectural position worth naming: code generation

Cloudflare's April 2026 <a href="https://blog.cloudflare.com/code-mode-mcp/" target="_blank" rel="noopener">*Code Mode*</a> post is often quoted in skills-first arguments, but it's actually a distinct third architectural position: skip both static tool schemas *and* prose skill descriptions, and let the model write TypeScript against a generated SDK. Cloudflare reports the full Cloudflare API surface would consume *1.17 million tokens* as traditional MCP schemas versus *~1,000 tokens* as an SDK the model calls from generated code — a 99.9% reduction. That's Cloudflare's own measurement, published on their engineering blog; they have a commercial interest in the framing (Code Mode ships on Cloudflare Workers), but the arithmetic is straightforward and reproducible against any large API surface.

Code Mode belongs in its own section because it isn't ammunition for the skills-first side; it's a fourth voice — *"let the model write code that calls the API"* — that agrees with the skills-first critique of eager schema loading and *disagrees* about the fix. Skills fix the problem by loading procedural context progressively; Code Mode fixes it by letting the model discover the API through documentation and code, the same way a human developer would. Both are correct rebukes of "load every schema at startup"; they're not the same rebuke.

## Where the skills-first challenger stops helping: the freshness problem

Skills are files on disk. That is the source of their token efficiency and the source of their reach ceiling. A skill can tell an agent *how* to look up an order status, but a Markdown file cannot know what the order status is right now. Anything that changes between invocations — inventory, deploy state, ticket status, prices, live search results, a database row two seconds after a webhook — requires a live call, and the standard shape of a live call to a system the agent doesn't control is currently MCP.

Anthropic's own Skills announcement is careful about this. Skills *"complement Model Context Protocol (MCP) servers by teaching agents more complex workflows that involve external tools and software."* The framing is deliberately not "skills replace MCP" — the reason skills are useful *next to* MCP is that the tools skills call are often themselves MCP tools. Progressive disclosure of *how to use* a set of tools is a different problem from *reaching* those tools in the first place.

The skills-first voice is at its weakest when it treats *"MCP wastes context"* as evidence that MCP was a mistake. It wasn't the protocol that wasted context; it was the loading strategy of enumerating every tool at startup. Fix the pattern and you keep MCP's reach.

## Where the MCP-anchored mainstream is right: the standardization argument

The reason MCP took over the sentence *"how do I plug X into an agent"* isn't marketing; it's that the protocol works across clients. Every major agentic client has shipped MCP support with published documentation: <a href="https://docs.anthropic.com/en/docs/claude-code/mcp" target="_blank" rel="noopener">Claude Code</a>, <a href="https://cursor.com/docs/mcp" target="_blank" rel="noopener">Cursor</a>, <a href="https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-existing-server-to-agent" target="_blank" rel="noopener">Microsoft Copilot Studio</a>, <a href="https://zed.dev/docs/assistant/model-context-protocol" target="_blank" rel="noopener">Zed</a>, <a href="https://docs.replit.com/learn/model-context-protocol" target="_blank" rel="noopener">Replit</a>, and Windsurf (first-class in Cascade, configured via `~/.codeium/windsurf/mcp_config.json`). <a href="https://zuplo.com/blog/one-year-of-mcp" target="_blank" rel="noopener">Zuplo's one-year retrospective</a> collects the fuller vendor list; <a href="https://www.pento.ai/blog/a-year-of-mcp-2025-review" target="_blank" rel="noopener">Pento's year-review</a> reports on the order of ten thousand public MCP servers by late 2025.

A skill file works in Claude. An MCP server works in whichever client understands the protocol — and by mid-2026 that is most of them. If a team is building an integration that has to outlive any one editor or agent product, the protocol argument is difficult to argue against. This is the same reason the industry standardized on LSP for language servers, USB for peripherals, and OAuth for delegated auth — the transport becomes valuable in proportion to the number of consumers that can speak it.

The MCP-anchored voice tends to lead with a second point: **auth**. MCP has an actual authorization handshake — one a Markdown file cannot express. The maturity is more complicated than the marketing suggests: MCP core maintainer Paul Carleton's <a href="https://blog.modelcontextprotocol.io/posts/client_registration/" target="_blank" rel="noopener">*Evolving OAuth Client Registration*</a> post walks through the operational costs of the OAuth 2.1 dynamic client registration model — unbounded ephemeral client records, unauthenticated write endpoints, DoS surface — and motivates a client-independent metadata document (CIMD) alternative. The auth story is real, but the spec itself is under active revision. That's the honest form of the argument: anything requiring per-user authorization to a live system is more naturally an MCP integration than a skill; that judgment holds even while the specifics of *how* MCP does auth continue to move.

## Where the MCP-anchored voice stops helping: shape it the way the model wants

The MCP-anchored posture's blind spot is symmetric to the skills-first one: it treats *"the protocol is standardized"* as evidence that the answer is *"expose everything through it."* The 55k-tokens-for-GitHub-MCP number says otherwise. What the model actually wants at inference time is not "every tool your platform exposes"; it's "the specific tools the current task needs, plus enough procedural context to use them correctly."

That last piece — the procedural context — is the case for skills existing at all. A skill that says *"when the user asks for a monthly revenue chart, first call `list_invoices` filtered to the previous thirty days, then group by day, then render with the palette in `brand.md`"* is doing work no MCP server can do. It compresses the sequence, the filters, and the shape of the answer the user actually wants. The MCP server can list tools; it cannot tell the model which tool matters for *this* task, in *this* order, with *this* framing.

The MCP-anchored voice is strongest when it says *"you need this transport."* It's weakest when it says *"and therefore you don't need the procedural layer on top."*

## Where the complementary pragmatist goes wrong

The complementary position has its own failure mode, and it's the one I have to watch in myself: *"use both"* is easy cover for never deciding where the seam belongs. A team where every integration is *"some skills and some MCP"* without an underlying principle ends up with the same capability implemented three different ways — split across a Markdown file, a running server, and a hardcoded prompt — and nobody remembers why any of the three exists.

The clearest heuristic I've seen for where the seam belongs is <a href="https://subramanya.ai/2025/10/30/claude-skills-vs-mcp-a-tale-of-two-ai-customization-philosophies/" target="_blank" rel="noopener">Subramanya N's three-part split</a>. The more common framing across other secondary analysis — <a href="https://www.llamaindex.ai/blog/skills-vs-mcp-tools-for-agents-when-to-use-what" target="_blank" rel="noopener">LlamaIndex</a> and <a href="https://blog.bytebytego.com/p/ep213-mcp-vs-skills-clearly-explained" target="_blank" rel="noopener">ByteByteGo</a>, among others — is a two-way procedural-vs-live split; Subramanya adds a third bucket for deterministic local work that reads to me as the missing piece:

- **Procedural knowledge belongs in a skill.** The judgment, sequence, and context for *how* to do something. Anything you'd write as an internal playbook. Anything that doesn't change between invocations.
- **Reach into live systems belongs in MCP.** State, auth, dynamic data, side effects, anything the model can't precompute. Anything that requires talking to a system the agent doesn't own.
- **Deterministic local work belongs in a script the skill calls.** The middle case — the thing that would produce the same output every time on the local machine, given the same input. Anthropic's own skills use this pattern heavily: the Markdown handles judgment; the scripts handle the parts that would burn tokens on prose reasoning.

LlamaIndex's own framing captures the honest core of the *decision*: *"the choice of MCP vs skills is less about what each technology can do, but rather more about the use case."* But *"it depends"* is not the ruleset; the three lines above are. When I catch myself reaching for *"it depends"* too easily, the correct move is usually to figure out what the underlying rule would have been and write it down.

## What this comparison does not tell you

A limits section, because the enthusiasm on both sides tends to run past four things:

- **Neither approach settles whether the underlying tool is good.** A skill can be well-written and still describe a bad workflow; an MCP server can be spec-compliant and still expose an API surface that's confusing to use. The extension mechanism is orthogonal to the quality of what's being extended.
- **The token-cost numbers are load-bearing on specific measurement conditions.** Apideck's *"72% of context"* is against three specific servers running against a 200k window. Cloudflare's *"99.9% reduction"* is against a full Cloudflare-API surface most integrations wouldn't expose to a single agent at once. Neither generalizes to *"MCP eats 72% of every context"* or *"skills always save 99.9%."* The direction is right; the magnitude is a specific measurement.
- **Both mechanisms expand the security surface, and neither is neutral there.** Skills execute local scripts under the user's UID; installing an untrusted skill is installing untrusted code. MCP servers open network endpoints, often hold credentials, and expose whatever operations the server author decided to include; installing a third-party MCP server is running untrusted code with, potentially, access to production systems. The token-cost debate has largely crowded out the audit-and-permissions conversation both approaches actually need.
- **The two mechanisms have different operational profiles.** MCP servers are processes with startup cost, memory footprint, and latency per call. Skills are disk reads — no runtime overhead once the description is loaded — but the scripts a skill invokes are still processes with the same operational cost a small MCP server would incur. Neither approach is free; they're just distributing the cost differently.

A fifth thing worth naming: the two ecosystems are still moving. MCP's auth model, streaming semantics, and server-discovery flow have all changed at least once since launch. The skills-as-open-standard release and the widening list of non-Anthropic hosts is more recent still. Any specific number in this post is a mid-2026 measurement; the shape of the argument is likely to outlive the numbers.

## The synthesis

Separate the two things the debate is actually about. **Skills are how you compress procedural knowledge into a shape the model can load only when it needs it.** **MCP is how you give a model reach into systems that change between invocations, through a transport that survives across clients.** The first is a knowledge-compression problem; the second is an integration problem; they solve different halves of *"extend the agent."*

From the skills-first voice: keep the loading strategy progressive. Do not enumerate every tool at startup; the context you save is context available for the actual task. From the MCP-anchored voice: pick the transport that will still work when you change editors, and take auth seriously even while the auth spec is still moving. From the complementary pragmatist: write the seam down — *procedural in skills, live reach in MCP, deterministic local work in a script* — and defend the rule so the next integration isn't a new philosophy. And keep an eye on the fourth voice — code generation directly against generated SDKs — because it's the shape the argument may end up in a year from now.

Stop arguing about which is *the* answer. Ask instead: *which parts of this integration will still be true a year from now, and which parts change between invocations?* The parts that will still be true belong somewhere durable — a skill, a script, a generated SDK the model can call from code. The parts that change need a live transport that both sides trust. Once those two lines are on paper, the argument between the three voices settles on its own.
