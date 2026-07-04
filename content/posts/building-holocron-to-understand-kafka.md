+++
title = "Holocron: writing a Kafka-style broker in Go to understand what Kafka does"
date = 2026-07-04T11:15:00-04:00
draft = true
summary = "A learning-first log-based event streaming platform, laid out as a Go workspace so the broker and SDK evolve together. The goal was never to replace Kafka — it was to understand the log."
tags = ["go", "distributed-systems", "kafka", "streaming"]
ShowToc = true
+++

## TL;DR

_[One sentence: what Holocron is + the learning-first framing.]_

[holocron](https://github.com/jedi-knights/holocron) is a single-binary Kafka-style event streaming broker plus SDK, laid out as a Go workspace so the two evolve together. I'm not replacing Kafka. I'm understanding Kafka by rebuilding the parts that matter.

## Why understanding-by-building beats reading docs

_[Two paragraphs. Kafka's docs describe what happens; they don't force you to grapple with the design decisions. When you implement even the simplest version yourself, the tradeoffs become inescapable — and you understand the docs on a second read.]_

## The log-append primitive

_[The heart of it. Bytes arrive, get appended to a segment, and get a monotonically increasing offset. Everything else in Kafka is built on this one operation being fast, ordered, and durable.]_

```go
// _[sample: the append signature and what it guarantees]_
```

## Consumers, groups, and offsets

_[How consumers track position. The interesting question isn't "how do consumers read" but "who owns which partition, and how do they hand off cleanly?"]_

## What Holocron doesn't do

_[Honest scope. No replication? Single node? Retention policy is basic? Whatever the current state is — this is the section that makes the "learning-first" framing credible.]_

## The SDK story

_[Why the Go SDK lives in the same workspace as the broker. Why a separate Python SDK exists in [holocron-python](https://github.com/jedi-knights/holocron-python). What both had to agree on.]_

## What surprised me during implementation

_[Two or three specific things. Sequential IO being faster than you expect. Serialization overhead being real. Choosing the wrong abstraction and paying for it.]_

## What I'd add next

_[Replication? Log compaction? Something else on the learning path?]_

## Where to find it

- **Broker + Go SDK:** [github.com/jedi-knights/holocron](https://github.com/jedi-knights/holocron)
- **Python SDK:** [github.com/jedi-knights/holocron-python](https://github.com/jedi-knights/holocron-python)
