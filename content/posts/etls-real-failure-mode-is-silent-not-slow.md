+++
title = "ETL's real failure mode is silent, not slow"
date = "2026-08-13T10:30:00-04:00"
draft = false
description = "ETL's dominant failure mode isn't a slow pipeline — it's a green one that produces wrong data. Four invariants that separate 'finished' from 'correct.'"
summary = "ETL's dominant failure mode isn't a slow pipeline — it's a green one that produces wrong data. Four invariants that separate 'finished' from 'correct.'"
tags = ["etl", "data-engineering", "data-quality", "data-warehouse", "pipelines"]
categories = ["Engineering"]
ShowToc = true

[cover]
image = "/images/og/etls-real-failure-mode-is-silent-not-slow.png"
hiddenInList = true
hiddenInSingle = true
+++

Two teams can both be running "healthy" ETL pipelines by every dashboard metric — SLA green, task-success rate at 99.8%, average runtime inside its historical envelope — and one of them can be quietly poisoning the data warehouse while the other is not. The team being poisoned won't find out from the pipeline. They'll find out from a revenue-attribution analyst who notices that customer counts in one dimension don't reconcile with the same customers in another, and then a Slack thread will unspool backwards for two days trying to figure out when the divergence started.

That shape — pipeline finishes green, downstream data is wrong, discovery lags production by weeks — is what most real ETL incidents look like. The stereotype of ETL failure is a job that runs long, times out, or crashes loudly. Those exist and they're comparatively easy: something breaks, an alert fires, an on-call fixes it, everyone moves on. The corrosive class is different. *When your ETL job finishes green, do you know the downstream data is right — or do you only know that the job didn't crash?*

That question is what most standard advice on ETL — batch vs. streaming, ETL vs. ELT, which orchestrator to run — sidesteps entirely.

## The steelman for "just add more tests"

The obvious response is that this is a testing problem. Add unit tests for each transformation. Add integration tests that run a fixture through the whole pipeline. Track coverage. Do TDD if you want to be really disciplined. That's a real and useful response — a pipeline whose transformations aren't unit-tested is failing at a lower bar than the one this post is about — and I want to give it the strongest form before saying why it isn't sufficient.

The strongest form is: the transformation layer is deterministic Python (or SQL, or Spark) that maps inputs to outputs. If the inputs and outputs are covered by tests, the transformations are correct. Anything downstream of correct transformations must also be correct. The rest is infrastructure — schedulers, connectors, retries — and that's somebody else's problem.

Where the argument stops working is at the boundary. Unit tests for transformations validate that *given these inputs, we produce these outputs*. They can't tell you:

- Whether the source system's schema silently changed last Tuesday and a required column is now nullable
- Whether an upstream field documented as `YYYY-MM-DD` has started arriving as an empty string for legacy rows
- Whether the `customer_id` column in table A and the `customer_id` column in table B still mean the same thing after a marketing migration you didn't hear about
- Whether the pipeline is producing the *right* result — or the same wrong result twice in a row after an idempotent retry that isn't actually idempotent

Every one of those is a case where every test passes, every transformation runs, every job finishes green, and the numbers in the warehouse are wrong. The tests validated the code. Nothing validated the *data* — its provenance, its distribution, its consistency across sources, and its trajectory over time.

## Four invariants that catch silent-wrong data

The four below aren't a checklist. They're related answers to the same question: how do you distinguish "green" from "correct"?

### 1. Idempotency is not a nice-to-have; it's what makes rerunning safe

A pipeline is **idempotent** if running it twice with the same input produces the same result as running it once. In Martin Kleppmann's framing in *Designing Data-Intensive Applications* (2017), idempotency is what makes the industry's "exactly-once" claim actually true in practice — real systems ship at-least-once delivery combined with idempotent processing and call it exactly-once, because it behaves like it.

The reason this matters for ETL specifically: the day a scheduled run fails halfway, you're going to rerun it. If the load step isn't idempotent, the rerun will double-count everything the first run partially loaded. Now the warehouse holds 1.4× the true row count, no alert fires, and every downstream aggregate is silently wrong until someone notices. The fix is to design loads as **upserts keyed by a stable natural or surrogate key**, not appends. Every ETL primer says this and most production pipelines still get it wrong under pressure.

Test for it deliberately: run the full pipeline twice in a row against the same fixture and diff the final warehouse state against itself. If the two runs don't produce byte-identical output, you don't have idempotency — you have a story you tell yourself about idempotency.

### 2. The staging area is a boundary, not overhead

Ralph Kimball's *The Data Warehouse Toolkit* (first edition 1996, still the reference) treats the staging area as a first-class architectural component — the "back room" where raw extracts land, get cleaned, and get conformed before anything reaches the "front room" that analysts query. It's tempting to skip staging on the grounds that it's an extra copy. Don't. Its value isn't storage; it's that it's the single place where you can validate data *before* it contaminates the warehouse.

Validation at the staging boundary is what catches the failure modes tests can't see:

- **Schema-drift check** — does today's extract have the columns yesterday's did, in the same types?
- **Distribution check** — is today's row count within an expected band of yesterday's, or did it drop to 12% for no announced reason?
- **Referential integrity check** — for every `customer_id` in `orders`, is there a matching row in `customers` — or did the two sources fall out of sync between extractions?

None of those are the transformation's job. They're the *boundary's* job. Without a boundary, they don't happen.

### 3. Lineage is what makes wrong data recoverable

When an analyst does report that a metric looks wrong, the recovery cost is a linear function of how quickly you can answer: *what sources produced this number, through what transformations, on what run?* If the answer requires archaeology across three DAGs, a Slack thread, and a `git blame` — recovery is measured in days. If lineage is captured as metadata alongside every load (`dbt`, `dagster`, and `openlineage` all build this in; you can also hand-roll it into a metadata table) — recovery is measured in minutes.

The observability advice in most ETL guides focuses on liveness — is the job running, how long, how many rows. That's necessary and insufficient. **Liveness tells you the plumbing is working. Lineage tells you where a specific wrong number came from.** They're different concerns and both belong in a production pipeline.

There's a concrete corollary in the Airflow-on-Kubernetes deployment guidance I read while working through this material. The recommended pattern is *dual logging* — task logs to object storage (S3/GCS) for the Airflow UI, and cluster logs to Loki via Promtail for platform observability. It looks like operational belt-and-suspenders. It isn't. Under `KubernetesExecutor`, task pods are ephemeral: they run, they exit, they get garbage-collected within minutes. Without durable per-task logs, you can look at a failed job three weeks later and see only that it ran. That's not a monitoring gap; it's an *audit* gap. Lineage without durable per-task logs is a signpost pointing at a bucket that has already been emptied.

### 4. ETL vs. ELT is a question about where the trust boundary sits

Most discussions of ETL vs. ELT frame it as a performance or cost question — ELT is cheaper because cloud warehouses do the transform work; ETL is slower because a middle-tier server does it. That framing misses the more useful question: **where in the pipeline does data become trusted?**

In classic ETL, data becomes trusted at the boundary between staging and the warehouse — the transform step is where cleaning, conforming, and validation happen, and only clean data reaches the warehouse. In ELT, data becomes trusted somewhere *inside* the warehouse — raw data lands first, and transformation happens as SQL views or `dbt` models on top of it. Both work. What matters is that a team knows which one they're doing, because that's where their validation has to live.

The typical failure isn't "we picked wrong." It's that the team adopts a cloud warehouse (Snowflake, BigQuery, Redshift), moves to ELT because that's what the vendor's marketing describes, and never explicitly moves the validation logic from where it used to live to where it now needs to live. Two years later, raw data has been landing in the warehouse untrusted, downstream models have been reading it as if it were trusted, and every "wrong data" incident traces back to the migration that never quite finished.

## What this argument does NOT tell you

Everything above helps you distinguish "the pipeline finished" from "the data is right." It doesn't help with the harder cases outside that frame:

- **Whether the specification is right.** If the business rule you were asked to implement is wrong — you're computing "monthly active users" using a definition Product changed six months ago and didn't tell you — every invariant above will pass and the number is still wrong. Idempotency does not fix wrong specs.
- **Whether the meaning of a source field has changed.** If the marketing team quietly redefines `active_customer` from "logged in this month" to "opened an email this month," the schema doesn't change and every distribution check passes. The number moves and you're the last to know. This is a coordination problem, not an ETL problem, and no amount of pipeline discipline substitutes for a data-contract conversation with the source team.
- **Whether your data model is the right shape for the questions being asked.** A star schema that made sense for last year's KPIs may be actively hostile to this year's. That's a modeling concern — see the [data-modeling primer](/posts/data-modeling-in-plain-language/) for the vocabulary — and it's independent of pipeline correctness.

The distinction matters because "our pipeline is fine, the numbers are wrong" and "our pipeline is broken and the numbers are wrong" have different diagnostic paths. Confusing them is how weeks of investigation get spent in the wrong layer.

## One thing to try

If you take one thing from any of this: **run your production pipeline twice in a row against the same input, and diff the resulting warehouse state against itself.** Byte-for-byte. If the two runs disagree at all — different row counts, different aggregates, different anything — you don't have idempotency, you have partial correctness, and you have a scheduled window during which any retry will silently corrupt your warehouse. That's the smallest possible experiment that reveals the largest possible class of quiet failures.

The point isn't to build a perfect pipeline. It's to build one that fails loudly instead of quietly — because loud failures are cheap and quiet failures compound.
