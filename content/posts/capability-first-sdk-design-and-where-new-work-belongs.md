+++
title = "Capability-first SDK design, and where new work belongs"
date = "2026-08-07T06:05:10-04:00"
draft = false
description = "The question is almost never 'how do we add this method to the SDK?' — it's 'where should this capability live?' A companion to the SDK fundamentals post, covering capability-first SDK design (with the caller-sketch discipline as the practice), the five-way routing framework for new capability requests (pure SDK / additive API change / new endpoint / new API service / push down for generation), signals for extending an existing API vs. creating a new one (with Stripe Terminal and AWS Lambda as named examples), and the version-coordination process when a capability requires changes on both sides."
summary = "The question is almost never 'how do we add this method to the SDK?' — it's 'where should this capability live?' A companion to the SDK fundamentals post, covering capability-first SDK design (with the caller-sketch discipline as the practice), the five-way routing framework for new capability requests (pure SDK / additive API change / new endpoint / new API service / push down for generation), signals for extending an existing API vs. creating a new one (with Stripe Terminal and AWS Lambda as named examples), and the version-coordination process when a capability requires changes on both sides."
tags = ["sdk", "api-design", "developer-tools", "go", "fundamentals", "platform-engineering", "software-design"]
categories = ["Fundamentals"]
ShowToc = true

[cover]
image = "/images/og/capability-first-sdk-design-and-where-new-work-belongs.png"
hiddenInList = true
hiddenInSingle = true
+++

A pull request lands in your SDK repo. It adds one method — `client.Orders.CancelAndRefund(ctx, orderID)` — with a reasonable justification: "callers always do these two calls together, let's help them." Two reviewers disagree in the comments. The first says ship it; the SDK's job is to make common workflows easy. The second says push it back to the API team, because otherwise every language's SDK will reimplement the same helper, and every non-SDK caller — the ecosystem's Terraform provider, the ops team's curl scripts, some customer's Ruby client that doesn't exist yet — will be stuck writing it themselves. The PR sits for a week.

*Both reviewers are answering different questions — they're not really arguing about the method but about where the capability lives, and the team has no shared framework for deciding.*

This post is that framework. It is the fourth in a four-post series on SDK design; the [fundamentals post](/posts/what-an-sdk-actually-is-and-when-to-build-one/) covered what an SDK is (a curated bundle, not a client library) and when to build one at all. This one is about the harder question that shows up next: once you have both an SDK and one or more APIs behind it, how do you decide, for every new capability request, where the work should land? In the SDK? As a change to an existing API? A whole new API service? The remaining outcomes are variants of those three, and the framework below sorts every request into exactly one.

The framework rests on one shift in perspective, and once you make the shift, the routing decisions become tractable.

## The shift: SDKs think in capabilities, APIs think in endpoints

An API's contract is *given this request, I return this response*. Its natural unit is the endpoint. It exposes what the server can do, not what the caller wants to accomplish.

An SDK's contract is *given this problem, I give you the code that solves it*. Its natural unit is the capability. A capability may map to one endpoint, to five endpoints stitched together, or to zero endpoints — pure client-side work like parsing, validation, or a language-idiomatic wrapper.

When you conflate the two — when you design an SDK method-per-endpoint — you have shipped a client library that happens to have nicer types. You have not shipped an SDK, in the sense the fundamentals post argues for. Every caller still has to reassemble the capabilities from the endpoints themselves.

The canonical illustration is `s3manager.NewUploader` in the AWS SDK for Go. From the caller's point of view, that is one method — *upload a large object reliably*. Behind it is a state machine that initiates a multipart upload, uploads parts in parallel with retries, completes the upload on success, and aborts cleanly on failure. If the SDK had been designed endpoint-first, you would see four methods (`CreateMultipartUpload`, `UploadPart`, `CompleteMultipartUpload`, `AbortMultipartUpload`) and every caller would have to learn the state machine themselves. Same underlying power; worse ergonomics; more bugs in the wild. The capability abstraction is what an SDK is *for*.

That's the shift. Everything below is downstream of it.

## Designing new capabilities: the caller sketch first

Before you touch API primitives, write the code you wish the caller could type. Five to ten lines. This is the *caller sketch*, and it is the design.

Suppose someone asks: *"Can the SDK make it easier to reconcile all paid orders from the previous month?"*

The endpoint-first designer opens the API docs, finds the closest existing endpoints (`ListOrders`, `GetPaymentStatus`), and starts composing them into a caller-facing method. The composition is competent — it works — but it inherits every quirk of how those endpoints happened to be shaped, including the round-trip pattern.

The capability-first designer writes the sketch first:

```go
for order, err := range client.Orders.Reconcile(ctx, ReconcileFilter{
    Month:  time.January,
    Year:   2026,
    Status: OrderStatusPaid,
}) {
    if err != nil { return err }
    // do something with `order`, which arrives with payment status embedded
}
```

*Then* traces the sketch backwards. Does the API return paginated orders with a month/year/status filter? Perhaps. Does the order response include the payment status field the caller needs, or does the SDK have to make N+1 calls to `GetPaymentStatus` for every page? If it's N+1, latency compounds badly on large months and the whole capability degrades. Maybe the right answer is to ask the API team to embed the payment status in the order response for this filter — a one-line schema addition on the server, zero SDK complexity, one round trip per page. Land the API change first, then ship the SDK method.

The sketch is the anchor. Without it, the conversation reduces to *"what endpoints do we have?"* — the wrong starting point. The right question is: *what does the caller want to type?* The server-side question comes second: *what does the API have to provide to make that possible?*

Two practical guardrails around the sketch:

- **Every capability needs a one-sentence "so that" statement.** *"Reconcile paid orders from the previous month so that finance can close the books."* If you can't say it, the capability is an implementation task in disguise, and no amount of API design will make it well-shaped.
- **Group capabilities into services that mirror the caller's mental model, not the API's URL scheme.** `client.Orders`, `client.Subscriptions`, `client.Refunds` — the domain the caller lives in. Not `client.PostV1OrdersCheckoutSessionsBatchReconcile`.

## The evolution question: where should this live?

For every capability request that lands in your SDK repo — or your API repo, or a Slack channel, or a support ticket — three questions, in order:

1. **What's the caller sketch?** Write the ideal calling code first.
2. **Does the current API support that sketch exactly, unchanged?** Trace every input the caller sends and every output the caller reads back to a real API primitive.
3. **If not, what's the minimum server-side change that would?** An additive field is cheap. A new endpoint is medium. A new versioned service is expensive.

Those three questions sort the request into one of five outcomes. Each outcome routes the work differently — and knowing which outcome you're in is most of the value.

### 1. Pure SDK

The capability composes existing API primitives, or is entirely client-side (typing, parsing, iteration, backoff). Ship it in the SDK. Fastest path. No cross-team coordination.

Examples: a paginator wrapping cursor plumbing; a `Result<T, E>`-style helper in Rust; a retry middleware; a webhook-signature-verification helper; a `context.Context`-aware timeout wrapper. If the API has everything and the capability is stateless composition, the SDK is the right home.

### 2. SDK plus an additive API change

The API needs one new optional field, a new response value, or a new query parameter. Non-breaking on both sides. Coordinate two releases: API vN.M lands the additive change; SDK v(N+1) requires it and exposes the new capability. This is the second most common outcome after pure-SDK — most capability requests that require any API change need only an additive one, and coordinating additive changes across two releases is cheap.

### 3. New endpoint on the existing API

The capability is a new operation on an existing resource, or a new resource that lives inside the current service boundary. The domain model already covers it — you are filling a gap.

Land the API change first. Let the SDK follow the released API version. Do not race them; a merged SDK PR that depends on an unreleased API is a red flag every time. Callers on the SDK's `main` branch shouldn't be able to call a method the deployed API doesn't support.

### 4. New API service entirely

The capability is a new bounded context. This is the outcome teams get wrong most often — usually by smuggling the capability into an existing API when it should have gone into a new one. Signals for this outcome are below.

### 5. Push it back down to the API for generation

The capability would require the same server-side logic or decision to be re-implemented in every language's SDK. That is a signal you have chosen the wrong layer — the *shape* can and often should differ per language (Go's `iter.Seq2`, Python's generator, Rust's `Iterator` are three correct expressions of the same idea), but the underlying computation or decision belongs on the server. Own the logic in the API — most commonly by returning richer data, or by exposing a compound endpoint that handles the workflow server-side — so every generated SDK inherits it for free.

Rule of thumb: if every SDK is going to compute the same "next retry time" from a `Retry-After` header, that's an SDK-level concern. But if every SDK is going to compute the same *decision* about whether a resource is eligible for some operation, the eligibility belongs in the API response, not in the SDK. Truth about server state lives on the server.

## Extend an existing API vs. create a new one

This is the split most teams underweight. Extending is the path of least resistance, so new capabilities accumulate as flags, optional fields, and conditional behaviors on existing endpoints. Every one of those makes the existing API harder to reason about for its existing callers. Meanwhile, creating a new API service *feels* expensive, so teams avoid it even when it's the right call — and the resulting overloaded endpoint ends up more expensive to maintain than the new service would have been.

The signals are opposite in shape.

**Extend an existing API when:**

- The capability is a variant of an existing operation, or a new operation on an existing resource.
- The domain model already covers the concept — you are filling a gap, not opening one.
- The existing API's auth model, error semantics, versioning cadence, and consistency guarantees all still fit.
- The capability's caller base overlaps substantially with the existing API's callers.
- Only additive schema changes are required (new fields, new optional parameters, new response values).
- Existing rate limits, quotas, and SLOs remain sensible.

**Create a new API service when:**

- The capability is a genuinely new bounded context. When AWS launched Lambda in November 2014, it got a new API service entirely (`lambda.amazonaws.com`) rather than becoming a corner of EC2 — the "run a function" domain has nothing meaningful in common with the "run a virtual machine" domain. Stripe Terminal for in-person payments (introduced in 2018) is a milder version of the same outcome: rather than a fully separate service, Terminal got its own resource family within the existing Stripe API (`/v1/terminal/*`, with readers, locations, and connection tokens as first-class objects), because the in-person payment domain differs enough from the online payment domain to warrant its own model even though the base API endpoint is shared. Both are legitimate expressions of this outcome; the Lambda case is the pure form, and the Terminal case is what it looks like when a vendor prefers to keep the API surface unified at the transport level.
- The capability needs different SLOs — different latency, consistency, or availability guarantees than the existing API can honestly provide.
- The capability needs a different release cadence. Experimental beta APIs almost always deserve to be quarantined from stable production surfaces; a `v2beta1` endpoint on a `v1` API drags the beta's uncertainty into every existing caller's dependency graph.
- The capability serves a different primary audience — customer-facing vs. internal-ops; end-user vs. platform-integrator; human-invoked vs. machine-to-machine.
- The capability requires a different authentication or authorization model than the existing API's.
- The capability would materially bloat the existing API's surface, making it harder for existing callers to navigate.
- The capability wants a fresh versioning story free of the existing API's back-compat commitments.

That last one matters more than teams admit. Once an API has real callers, every extension inherits every prior compatibility constraint. Sometimes a new capability can only be designed cleanly on a fresh surface. *"We didn't want to think about back-compat"* is a bad reason to create a new API service; *"the constraints of the existing API force a shape we don't want to ship for the next decade"* is a good one.

## When the SDK team surfaces "we need a new API"

Because SDKs are where capabilities get expressed as caller-facing code first, the SDK team is often the first party to notice that a capability the caller wants doesn't have a natural home in any existing API. Take that signal seriously.

The wrong response is to smuggle the capability into an existing API because that's the path of least resistance. Symptoms of that mistake:

- A resource whose fields conditionally apply based on a flag the SDK sets in the request.
- An endpoint whose response shape changes if an unusual header is present.
- A versioning burden that grows because the new capability's release cycle doesn't match the host API's.
- A parameter documented as "for internal use only" that some SDK now depends on.
- An SDK method whose docs say *"not yet supported for X"* because the API can't actually deliver the capability the SDK is advertising.

When the SDK team hits one of these symptoms, the correct response is to route the capability into a routing decision, not into a workaround. That routing decision may say "extend this API," "add an endpoint here," or "spin up a new service" — but it should be a decision made in the open, not a smuggle hidden inside an SDK PR.

The recurring shape of this anti-pattern is what I've come to think of as *the flag festival*: an SDK method whose body branches on a caller-supplied flag, sending a subtly different variant of a request to the same API endpoint depending on the flag's value, because the API doesn't have distinct endpoints for the distinct capabilities and the SDK is trying to hide that fact. Every flag festival started as a routing decision that never happened.

## The version-coordination process

When a capability requires changes on both sides, the ordering of releases matters. Two rules cover most cases.

**API ships first when the SDK depends on it.** If SDK v2.4 needs a field the API doesn't yet return, do not merge SDK v2.4 first. Land the API change, cut an API release, then update the SDK to require that API version and cut the SDK release. Otherwise you ship a version of the SDK that mysteriously fails against the current API and only works against something that isn't out yet. Callers do not enjoy this experience.

**The SDK's compatibility table is explicit.** The SDK's README (or its `CHANGELOG`, or a dedicated compat doc) states which API versions each SDK version supports. When you ship SDK v2.4, say plainly: *"Requires API v1.7 or later; earlier API versions will return a 400 on the new fields."* Without this, callers upgrading the SDK against an older self-hosted API version get an inscrutable error and open a support ticket against the SDK when the fix is on the API side.

For platforms that host their own API and let customers control when to upgrade (Kubernetes, self-hosted GitLab, on-prem observability stacks), the compatibility surface is a real product concern and deserves the same discipline as an operating-system ABI. For hosted vendor APIs where the vendor upgrades everyone simultaneously, the compat table is still useful as an internal record — someone will need it during an incident, especially when a customer is running an SDK version several releases behind and their failure mode differs from what a current-SDK caller would produce against the same API.

## Steelmanned opposing positions

Two positions push back on the routing framework above. Each deserves to be given in its strongest form before being situated.

**"The SDK is just a client wrapper. Adding a helper is not a design decision. Ship the method, move on."** The strongest form is that most SDK capability requests are genuinely small — a helper that combines two calls, a validator that catches a bad input before it hits the network, a convenience iterator. Debating routing for each of these adds meeting overhead that has to be paid every time, forever, in exchange for the occasional avoided mistake of putting something in the wrong layer. Small teams can afford the debate; medium teams get suffocated by it; large teams end up in analysis paralysis where every SDK PR becomes a cross-team RFC. There's a real argument that the routing framework only makes sense when the capability is large enough to be worth the overhead — and for the vast majority of SDK PRs, "just ship it" is the correct answer.

This is right for small capabilities and small teams, and the framework should not become bureaucracy. But even for small helpers, the caller-sketch discipline is essentially free — writing the ideal calling code before the implementation is not overhead; it *is* the design. And the routing framework's real cost only shows up on the medium-to-large capabilities where getting it wrong is genuinely expensive. The rule that scales is: apply the framework proportional to the capability's blast radius. A five-line helper doesn't need a cross-team meeting; a new resource lifecycle does.

**"Everything should be on the API. The SDK should be pure generation with zero design."** The strongest form is that the API is the durable, cross-language, cross-vendor thing. Every capability that has real shape belongs there. The SDK's job is to be a mechanical projection of the API into idiomatic code — and modern generators (Stainless, Fern, Speakeasy) are good enough that this is now practical for the ninety-percent case. Any capability that exists in the SDK but not in the API is a coupling to that SDK's implementation, and couplings compound. Push everything to the API; let generation handle the SDK; keep the SDK team small and focused on the generation pipeline.

This position is right about generation being good enough for most of the surface. It goes wrong on the class of capabilities that are legitimately client-side: language-idiomatic iterators (Go's `iter.Seq2`, Python's context managers, Rust's `Result<T, E>`), retry loops with backoff, streaming assembly of typed events, tool-call orchestration in agent SDKs, format converters, validation helpers, testing utilities and fakes. The API cannot own a Go-idiomatic iterator or a Python-idiomatic context manager — those exist because the language exists, and the SDK is the correct home. The synthesis: everything that has a server-side truth belongs in the API; everything that is purely about how the caller expresses the capability in their language belongs in the SDK; and the routing framework above is how you tell them apart.

## What this post doesn't tell you

- **It doesn't tell you how to run the cross-team meeting.** Getting the API team and the SDK team to align on a routing decision is a political and cultural problem as much as a technical one. This post gives you the framework; the meeting itself is org-specific.
- **It doesn't cover the case where the API is external to your organization** (you are building an SDK against a third-party API). You cannot extend an API you don't control — every capability request either fits into "pure SDK" or turns into a feature request against the vendor. The routing framework simplifies dramatically in that setting, but the caller-sketch discipline still applies.
- **It doesn't address monorepo vs. multi-repo tradeoffs.** Coordinating SDK and API releases is easier in a monorepo and harder across repos; both are workable, and the choice is downstream of other constraints that this post doesn't try to relitigate.
- **It doesn't give you a decision matrix for when to deprecate an old capability** in favor of a new one. Deprecation, back-compat commitments, and the "how long do we keep the old surface working" question deserve their own treatment.
- **It doesn't cover multi-tenant complications** — capabilities that behave differently for different customer tiers, or that require per-tenant feature flags at the API layer. That's real and it's out of scope here.

## Related posts in this series

- [*What an SDK actually is, and when to build one*](/posts/what-an-sdk-actually-is-and-when-to-build-one/) — the fundamentals: what SDKs are, where the shape came from, how they differ from APIs and libraries and frameworks and protocols, and when to build one.
- [*The anatomy of an SDK, in Go*](/posts/the-anatomy-of-an-sdk-in-go/) — the seven-part walkthrough of the surface, with idiomatic Go for the client, resource groupings, typed requests and responses, typed errors with `errors.As`, pagination via `iter.Seq2`, streaming and retries and instrumentation, and the docs surface.
- [*What makes a good SDK*](/posts/what-makes-a-good-sdk/) — the eight-point quality rubric with named exemplars (Stripe, AWS, Anthropic, OpenAI, GitHub Octokit), plus the two-sided value proposition for vendors and callers.

*The question is almost never "how do we add this method to the SDK?" — it's "where should this capability live?" — and the answer routes the work between the SDK, an additive API change, a new endpoint, a new API service, or a push down to the API so every generated SDK inherits it for free.*

If you're on an SDK team: adopt the caller-sketch discipline this week. Before your next capability PR, write the code you wish the caller could type. Trace it backwards to the API primitives. Let the sketch tell you where the work belongs — you'll find, more often than you expect, that the answer isn't the SDK, and that surprise is the whole point of the exercise.
