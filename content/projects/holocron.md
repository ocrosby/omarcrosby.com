+++
title = "Holocron"
date = 2026-07-04T11:15:00-04:00
draft = false
summary = "Learning-first, Kafka-style event streaming platform — a single-binary broker and SDK, laid out as a Go workspace."
tags = ["go", "streaming", "distributed-systems"]
+++

A learning-first take on Kafka-style event streaming: a single-binary broker plus an SDK, arranged as a Go workspace so the two evolve together. The goal is teaching myself (and anyone reading) what actually happens in a log-based broker, not shipping a Kafka replacement.

**Deep dive:** [Holocron: a Go-native distributed log with NATS JetStream ergonomics and Kafka semantics →]({{< ref "posts/building-holocron-to-understand-kafka.md" >}}) — why per-partition ordering is the load-bearing Kafka guarantee, and how Holocron enforces it on the segment append path instead of assuming it from the outside.

**Stack:** Go workspace (broker + SDK) · Python SDK

- **Broker + Go SDK:** [github.com/jedi-knights/holocron](https://github.com/jedi-knights/holocron)
- **Python SDK:** [github.com/jedi-knights/holocron-python](https://github.com/jedi-knights/holocron-python)
