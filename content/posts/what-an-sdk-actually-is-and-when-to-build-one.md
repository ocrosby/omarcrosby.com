+++
title = "What an SDK actually is, and when to build one"
date = "2026-08-07T05:34:04-04:00"
draft = false
description = "An SDK is not just a client library — it's the smallest thing a platform can ship that turns 'read our docs and call our API' into 'install this and get to work.' First in a four-post series on SDK design: this one covers the fundamentals — what SDKs are, where they came from, how they differ from libraries and frameworks and protocols, why they're becoming the product itself, and a concrete decision framework for when to build one. Companion posts cover the anatomy of an SDK's surface in Go, the rubric for what makes one good with named exemplars, and the design-process question of routing new capabilities between the SDK and the API."
summary = "An SDK is not just a client library — it's the smallest thing a platform can ship that turns 'read our docs and call our API' into 'install this and get to work.' First in a four-post series on SDK design: this one covers the fundamentals — what SDKs are, where they came from, how they differ from libraries and frameworks and protocols, why they're becoming the product itself, and a concrete decision framework for when to build one. Companion posts cover the anatomy of an SDK's surface in Go, the rubric for what makes one good with named exemplars, and the design-process question of routing new capabilities between the SDK and the API."
tags = ["sdk", "api-design", "developer-tools", "go", "fundamentals", "platform-engineering"]
categories = ["Fundamentals"]
ShowToc = true

[cover]
image = "/images/og/what-an-sdk-actually-is-and-when-to-build-one.png"
hiddenInList = true
hiddenInSingle = true
+++

You've just been asked to integrate with a new platform. You open its documentation and the getting-started page shows you two options. On the left, a curl invocation against the raw HTTP endpoint. On the right, a three-line snippet:

```go
client := example.NewClient(os.Getenv("EXAMPLE_API_KEY"))
order, err := client.Orders.Create(ctx, example.CreateOrderRequest{ /* ... */ })
```

You will almost always pick the second, and so will most engineers who land on that page. Not because it's shorter — the curl example is often shorter. You pick it because the three-line version is a promise: someone has already thought about auth, retries, pagination, streaming, typed errors, and the six ways this platform's API surprises new callers, and the surprises are behind a function signature you can jump into with your editor.

That promise, wrapped and shipped, is what an SDK is. *The single most useful question I ask when scoping one is: what am I promising the caller they will never have to think about again?* Everything else — the client class, the option pattern, the retry middleware, the generated types — is downstream of that promise.

This post walks through what an SDK actually is at a conceptual level, where the shape came from historically, why the industry is currently rediscovering SDKs as the primary surface a platform exposes, how SDKs differ from the four things they're most often confused with, and a concrete decision framework for when to build one. It's the first in a four-post series on SDK design; companion posts cover [the anatomy of an SDK's surface in Go](/posts/the-anatomy-of-an-sdk-in-go/), [the rubric for what makes one good](/posts/what-makes-a-good-sdk/) with named exemplars from Stripe, AWS, Anthropic, OpenAI, and GitHub Octokit, and [the design-process question of routing new capabilities between the SDK and the API](/posts/capability-first-sdk-design-and-where-new-work-belongs/).

## The one-sentence definition, and why it isn't a client library

An SDK — Software Development Kit — is **a curated bundle of everything a developer needs to build against a specific target**, packaged and versioned as one deliverable.

The word *bundle* is doing most of the work in that sentence. A single library is not an SDK. A single generated type file is not an SDK. What makes something an SDK is the *bundling* — the deliberate co-shipping of the code, the types, the docs, the samples, and often a CLI or generator or emulator — so that a developer moves from "I have credentials and a problem" to "I am running working code" without leaving your ecosystem to assemble the pieces.

Concretely, a well-formed SDK ships with some subset of:

1. **A client library** in one or more target languages, wrapping the transport (HTTP, gRPC, native syscalls) in idiomatic constructs.
2. **Generated types** representing the platform's data model as first-class values in each language.
3. **Authentication helpers** — token loading, refresh, signature construction — because auth is the first place a developer will otherwise get stuck.
4. **Sensible defaults** for retries, timeouts, pagination, and streaming, with clean escape hatches when the defaults are wrong.
5. **Documentation and runnable samples**, ideally co-located with the code so the two can't drift.
6. **Tooling** — a CLI, a code generator, an emulator, a mock server, a schema linter, a scaffolder — whatever collapses common tasks the platform assumes its users will perform.
7. **A versioning contract** that is legible independently of the underlying API's version — the SDK and the API are allowed to move on different cadences.

A library is an ingredient. An SDK is a meal. When you see a package described as "the official [platform] SDK" and it contains only the client wrapper — no auth helpers, no samples, no CLI, no docs beyond a README — the vendor has shipped a client library and labeled it an SDK. That mislabel is common enough to be worth flagging when you evaluate one.

## A brief history — where the shape came from

The term *Software Development Kit* predates the web. It comes out of an era when "developing against a platform" meant a physical box of floppy disks, printed manuals, and header files.

**Windows SDKs** date back to the mid-1980s, when Microsoft began shipping the toolchain, headers, sample programs, and API documentation you needed to write Windows applications as one physical package. The word *kit* was literal. Developers received a bundle in the mail. That original meaning — *everything you need to build against this platform, shipped together* — is the meaning that survived every subsequent decade.

**The Java Development Kit (JDK) 1.0**, released by Sun Microsystems on January 23, 1996, was another canonical form: a compiler (`javac`), a runtime (`java`), documentation, sample applets, and the platform's standard-library JARs, all versioned together as one download. The JDK survives essentially unchanged in structure thirty years later precisely because that bundle is the atomic unit developers reason about.

**The iPhone SDK**, announced by Apple on March 6, 2008, is the modern reference point. It bundled Xcode, the iPhone Simulator, an Interface Builder, the Objective-C headers and frameworks (UIKit, Foundation, Core Location, etc.), reference documentation, and a growing catalog of sample projects. The SDK's release — not the phone's — is what unlocked a third-party developer economy that eventually produced the App Store. The lesson many platforms internalized from that moment: *the SDK is the product's second launch*.

**Android SDK**, first released in early-access form on November 12, 2007, took the same bundle shape (tools + emulator + headers + samples + docs) and open-sourced most of it, entrenching the pattern across the mobile industry.

The 2010s brought a quiet inversion. As the industry moved from installed platforms to web APIs, the *kit* part of SDK receded — there was no emulator to ship, no headers to install, and the "toolchain" was whatever the target language already had. What was left was the client library plus the docs. For roughly a decade, "SDK" became a somewhat inflated word for what was, essentially, a wrapper around HTTP calls. Some companies pushed against the drift — Stripe's insistence on idiomatic hand-crafted client libraries across every major language, backed by exceptional reference documentation, became the template many later platforms tried to match — but most REST APIs shipped a single Python or JavaScript library and called it an SDK.

Then the AI-provider wave hit around 2023, and the *kit* returned.

## Why SDKs are becoming the product

Three shifts, roughly concurrent, are bringing the bundle shape back.

**First, generated SDKs became credible.** For years, hand-written SDKs were high-quality but expensive to maintain across many languages, and generated SDKs (from Swagger/OpenAPI or similar specs) were consistent but read like machine translation — un-idiomatic, awkward, unloved. Tools like Stainless, Fern, and Speakeasy changed that math by generating SDKs that a discerning engineer will accept as idiomatic in Python, TypeScript, Go, Java, Kotlin, and Ruby, from a single spec. Anthropic, OpenAI, and Cloudflare all ship generated SDKs today. The old failure mode — hand-written SDKs drifting from the API, or generated SDKs being unpleasant to use — is largely solved.

**Second, the API surface got too complex to reasonably call by hand.** This shift predates the AI wave. The AWS SDK for Go v2, released generally available in January 2021, was an explicit rewrite of the v1 SDK to improve ergonomics — first-class paginators, context propagation, injectable HTTP clients, more surgical error types. AWS made that investment because the underlying API had grown past the point where "just wrap it in a struct" was serving developers. The AI-provider APIs push the same dynamic further: they stream, they support server-sent tool calls with client-side dispatch, they expose long-running agent loops, they cache prompts across requests, they emit structured outputs against caller-provided schemas. Building all of that on top of raw HTTP is possible but painful — you'll implement your own SSE parser, your own retry logic, your own tool-call state machine, your own prompt-cache accounting. The vendor's SDK owns that complexity so every caller doesn't have to reinvent it. The HTTP endpoints are increasingly an implementation detail; the vendor's SDK is the primary consumption surface.

**Third, a genuine new tier emerged above the client-library SDK: the *agent SDK*.** The Claude Agent SDK, the Vercel AI SDK, LangChain-style toolkits — these are higher-level than an API wrapper. They encode multi-step workflow patterns (tool calling loops, memory, retrieval, streaming assembly of typed outputs) into the SDK itself. An agent SDK's job is not to wrap the model API but to *run* the tool-calling loop on the caller's behalf, which is why it starts to look framework-shaped. This tier is closer to a framework than a library, which we'll separate carefully in a moment.

Together, these shifts mean the SDK is doing more, is more automatable, and is now often what a developer is actually evaluating when they evaluate a platform. The docs point at the SDK. The samples use the SDK. The developer experience *is* the SDK. Calling this "the SDK becoming the product" isn't marketing — it's the operational reality of how developers pick platforms now.

## SDK versus the four things it's most confused with

The word *SDK* is used loosely enough that it's worth pinning down against its neighbors.

**API versus SDK.** An API is a *contract* — a specification of what requests are allowed, what shapes they take, and what shapes come back. It is language-agnostic. HTTP+JSON, gRPC+Protobuf, GraphQL, and native syscalls are all API forms. An SDK is a *bundle of code and tools that implements that contract for a specific target*. One API can have many SDKs — one per language, per platform, per audience. This is why "we have an API, do we still need an SDK?" is the wrong framing; the API is the underlying contract, the SDK is how developers actually reach it.

**Library versus SDK.** A library is a single reusable piece of code with a narrow purpose (parse dates, hash a string, connect to a database). A library is an ingredient in software. An SDK is a *bundle assembled around a specific platform or product*, of which the client library is only one part. Every SDK contains libraries; not every library is an SDK. A random JSON parser is a library. Stripe's `stripe-go` — client, types, webhook verification, retry logic, event listener helpers, sample apps, extensive docs — is an SDK.

**Framework versus SDK.** The distinguishing property of a framework is *inversion of control*: a framework calls your code, on its schedule, at its lifecycle events. Rails calls your controllers. React calls your components. FastAPI calls your route handlers. When you use a framework, you write plug-in points and the framework runs the loop. When you use an SDK, *you* run the loop and call *its* functions. The moment a package starts calling your callbacks or dictating your project structure, it has crossed from SDK into framework — which is fine when appropriate, but changes what you're committing to. Agent SDKs sit ambiguously on this line, and that ambiguity is worth naming when you evaluate one.

**Protocol versus SDK.** A protocol is a *wire-level standard* that any implementer can build against. HTTP is a protocol. gRPC is a protocol. The Language Server Protocol (LSP) is a protocol. The Model Context Protocol (MCP), released by Anthropic in November 2024, is a protocol. Protocols are cross-language and cross-vendor by design — any editor can implement LSP; any AI model runtime can implement MCP. SDKs, by contrast, are per-language and typically per-vendor. This distinction matters strategically: a protocol with many independent implementations is more durable than any single vendor's SDK, but it moves at the speed of consensus. Vendors ship SDKs when they want to move fast; the industry standardizes protocols when the pattern is mature enough that many parties want to interoperate.

## When to build an SDK — a decision framework

Not every API needs an SDK. Some APIs are simple enough that the vendor should ship excellent docs and let callers use their language's built-in HTTP client. Some are internal enough that the audience is small enough to just share a shared package. But when the following signals accumulate, the case for an SDK becomes concrete.

Build one when:

1. **Auth is more than a bearer token.** Signed requests, token refresh, HMAC computation, expiring keys, mTLS. Any auth mechanism that requires more than reading an environment variable will be gotten wrong by callers if you make them implement it. Own it in the SDK.
2. **The API exposes non-trivial protocols.** Server-sent events, chunked streaming, long-polling, WebSockets, gRPC streams, resumable uploads. If the developer needs to write parsing or state-machine code to interact with your API, ship that code so they don't have to.
3. **Pagination or cursor handling is required for common operations.** Callers reimplement pagination badly whenever it's exposed. Wrap it once.
4. **The API surface is large enough that developers can't keep it in their head.** A handful of endpoints can be navigated from docs and a well-designed URL scheme. Once the surface grows past that — dozens of resources, hundreds of methods — the SDK's autocomplete-driven discoverability becomes the fastest way for developers to find what exists.
5. **Retries, idempotency, or rate-limit handling matter for correctness.** These are cross-cutting concerns that belong in the SDK, not in every caller.
6. **You have more than one target language and want them to feel first-class in each.** Every language's users deserve idiomatic code — pythonic in Python, generic-typed in TypeScript, context-propagating and error-returning in Go. A single "example curl" does not scale to a serious multi-language developer base.
7. **You want observability into how developers use your API.** SDKs are your one legitimate place to emit anonymized usage signals (with clear opt-out) so you learn which methods are hot, which combinations trip callers, which error codes fire in the wild.

Do *not* build an SDK when:

1. **The API is trivial and small.** Three endpoints, static tokens, plain JSON — write great docs and stop there. An SDK adds a version to track and a dependency for the caller.
2. **The audience is internal and you already have a shared package.** An internal shared library is fine; dressing it up as "our internal SDK" adds ceremony without benefit.
3. **You can't commit to maintenance.** An SDK is a promise, and an SDK that lags six months behind the API is worse than no SDK — callers who trusted it now have to work around it. If your team can't afford to keep it fresh in every language you publish, publish fewer languages.
4. **A protocol implementation would serve the ecosystem better.** If the pattern you're implementing is genuinely industry-general (editor tooling, agent tooling, code intelligence), consider whether contributing to a protocol like LSP or MCP would serve more callers than a proprietary SDK.

## Steelmanned opposing positions

Two positions push back on the SDK-as-first-class-surface framing above. Each deserves to be given in its strongest form.

**"Raw HTTP is enough — and it ages better."** The strongest form of this argument is that HTTP+JSON is the industry's most durable interface. It works from every language, every platform, and every version of every runtime. An SDK is a *layer between the developer and the durable thing*, and layers accumulate. The SDK will have its own version, its own bugs, its own opinions about retries, its own quirks about how it names things. Every one of those is a coupling the caller now has. Meanwhile the curl example works from every laptop, every CI job, and every language that ever will exist. There's a real argument that vendors should invest in exceptional API design and exceptional docs, and let the callers reach for whatever HTTP wrapper their language already provides.

This position is correct for a class of APIs — small, stable, non-streaming, simple-auth. Where it starts to strain is exactly the point where the SDK earns its keep: streaming, retries, complex auth, cursor pagination, typed errors — the parts of the surface the [anatomy companion post](/posts/the-anatomy-of-an-sdk-in-go/) walks through in Go. Those are all cross-cutting concerns that every caller will reimplement without the SDK, and the vendor's support burden reflects the median implementation quality across all those callers rather than the best. Any maintenance cost the SDK carries — drift from the underlying API, its own bugs, its own version churn — has to be weighed against that median.

**"Everything should be a protocol, not an SDK."** The strongest form here is that protocols outlive vendors, and durability compounds. LSP outlived any specific editor's language plugin. gRPC outlived any specific service's RPC library. If a pattern is worth doing well, the argument goes, do it as a protocol so multiple SDKs can implement it and no single vendor's SDK becomes a bottleneck. MCP is currently doing exactly this for tool-using AI agents.

This is also correct, but late. Protocols codify things that are mature. Someone has to do the pattern for a while, with vendor-specific SDKs, before the shape stabilizes enough to standardize. The reason MCP could crystallize a protocol in late 2024 is that vendor-specific tool-calling SDK patterns had been shipping for the year prior and everyone had made roughly the same mistakes in roughly the same order. Vendor SDKs are how the industry discovers what a protocol should be; they are prior art, not competition.

The pragmatic synthesis is this: ship the SDK when you're figuring out the pattern, and be an eager contributor to a protocol when the pattern is stable enough to codify. Neither framing dominates the other — they're phases.

## What this post doesn't tell you

Every technique-focused post is more trustworthy when it names its limits, so:

- **This isn't a guide to picking an SDK generator.** Stainless, Fern, and Speakeasy all exist; they make different tradeoffs; the right pick depends on your API's shape and your team's constraints. Evaluate them against your own spec.
- **This doesn't cover mobile SDKs specifically.** iOS and Android SDKs carry additional concerns (binary size, permission dialogs, app-store review, back-compat with old OS versions) that a REST-API SDK doesn't. The general shape generalizes; the mobile-specific details need their own treatment.
- **This doesn't take a position on hand-written versus generated.** Both work. Hand-written SDKs read more idiomatically in each language and are more expensive to maintain across many languages. Generated SDKs are cheaper across many languages and are, in 2026, close enough to idiomatic that most callers can't tell. The correct answer depends on how many languages you ship and how differentiated the developer experience needs to be per language.
- **This doesn't address the legal and licensing dimension.** SDKs ship with a license; that license shapes what your users can build with them. That is a real design consideration and it's out of scope here.
- **This doesn't tell you the SDK is right for *your* API.** Run the decision framework against your specific situation. The framework is a signal, not a verdict.

## Related posts in this series

- [*The anatomy of an SDK, in Go*](/posts/the-anatomy-of-an-sdk-in-go/) — the seven-part walkthrough of the surface, with idiomatic Go for the client, resource groupings, typed requests and responses, typed errors with `errors.As`, pagination via `iter.Seq2`, streaming and retries and instrumentation, and the docs surface.
- [*What makes a good SDK*](/posts/what-makes-a-good-sdk/) — the eight-point quality rubric with named exemplars (Stripe, AWS, Anthropic, OpenAI, GitHub Octokit), plus the two-sided value proposition for vendors and callers.
- [*Capability-first SDK design, and where new work belongs*](/posts/capability-first-sdk-design-and-where-new-work-belongs/) — the design-process question of routing new capability requests between the SDK and one or more APIs, with the caller-sketch discipline as the practice.

*An SDK is the smallest bundle you can ship that turns "read our docs and call our API" into "install this and get to work" — and in 2026, that bundle is increasingly what the developer is actually evaluating when they evaluate your platform.*

If you're the vendor: assume the SDK is your product's second launch, and design it with the same care you designed the API. If you're the consumer: pick platforms whose SDKs read like they were shaped by real production usage, because the ones that don't will cost you the exact hours the SDK was supposed to save.
