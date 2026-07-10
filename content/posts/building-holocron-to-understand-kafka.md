+++
title = "Holocron: a Go-native distributed log with NATS JetStream ergonomics and Kafka semantics"
date = 2026-07-04T11:15:00-04:00
draft = false
summary = "Holocron is a single-binary Go distributed log broker. JetStream's operational simplicity plus the per-partition ordering and Kafka-shaped log model JetStream lacks."
tags = ["go", "distributed-systems", "kafka", "nats", "streaming"]
categories = ["Distributed Systems"]
ShowToc = true

[cover]
image = "/images/og/building-holocron-to-understand-kafka.png"
hiddenInList = true
hiddenInSingle = true
+++

*Companion to the [Holocron project page]({{< ref "projects/holocron.md" >}}).*

If you want an event streaming platform today, the two obvious answers are **Kafka** and **NATS JetStream**. Kafka gives you the log model people build systems around — topics, partitions, offsets, consumer groups, strict per-partition ordering. It also gives you a JVM, a coordination layer (ZooKeeper, or KRaft now), an operator, and a small crew of humans to keep it healthy. NATS JetStream gives you a single Go binary you can drop on a host and forget. It also gives you a data model that isn't quite the same shape, and a [known ordering bug under truncation](https://jepsen.io/analyses/nats-2.12.1) that Jepsen documented in the 2.12.1 analysis.

You often want the union: JetStream's operational simplicity with Kafka's semantics. [Holocron](https://github.com/jedi-knights/holocron) is my attempt at that.

It's a single-binary, Go-native distributed log broker. One process, no JVM, no ZooKeeper-or-KRaft, no operator, no sidecar. Topics, partitions, per-partition strict ordering, replayable consumers, consumer groups, replication via Raft, mTLS between nodes. Kafka's shape where the shape earns its keep, smaller where it doesn't.

## Why per-partition ordering matters

The single most valuable Kafka guarantee is: records with the same key always land on the same partition, and within a partition they stay in the order they were produced. Everything you build on top of a log — the event-sourced state machine, the changelog-backed materialized view, the consumer that has to see events in causal order — depends on that guarantee holding, cleanly, always.

JetStream's ordering isn't a broker primitive in the same way. Publisher-side hashing gets you most of the way there under normal conditions, but the truncation path Jepsen exercised produced observable reorders. That's the bug you don't get in Holocron because the ordering guarantee is *inside* the broker, on the segment append path, not asserted from the outside.

## What's shipped

The feature list is longer than I expected it to be at this point:

- **Topics and partitions** with strict per-partition ordering
- **Replayable consumers** — read from any offset, forever
- **Disk-backed segmented log** with sparse offset index and atomic recovery
- **Retention policies** — time-based, size-based, both
- **Network wire protocol** — TCP with length-prefixed binary framing, full `produce` / `fetch` / `metadata` / `commit` / `create-topic` opcodes
- **Consumer groups** with range-assignment rebalancing
- **Multi-node clusters** with Raft leader election and replication
- **TLS everywhere** — server TLS, optional or required mTLS for clients, mandatory mTLS for inter-node Raft traffic
- **Idempotent producer** with persistent broker-side deduplication
- **Connector framework** — Connect-style sources and sinks with reference connectors
- **Schema registry** — optional, Confluent-compatible HTTP API
- **Stream-processing DSL** — stateful operators, windows, joins
- **`holocronctl`** — operator CLI with full inspection and management surface, `--json` on every subcommand

The gaps still on the roadmap: authentication and authorization for clients, a KV / Object store on top of the log, non-Go SDKs, and geo-replication. Everything in that list is in the docs.

## The operational story

The reason I care about this is exactly the reason people reach for JetStream over Kafka: I don't want a JVM in my deploy story, I don't want a coordination service to keep healthy, and I don't want a Kubernetes operator to be the answer to "how do I run this." Kafka is excellent at scale but *heavy* at every scale below that. NATS JetStream is light but doesn't give me the log model my services are shaped around.

Holocron is a single binary. On a laptop, that's a `make build` and a `./bin/holocrond`. In production, that's a systemd unit and a directory. In a cluster, that's the same binary run with `--cluster` and a peer list, Raft doing leader election, and you can watch replication happen with `holocronctl`.

## What surprised me during implementation

**Sequential disk IO is much faster than you expect.** Every log-based broker exists because it's true, but you don't feel *how* true it is until you've written the segment append path yourself and watched a saturated NVMe drive do a million records a second on a single partition without breaking a sweat.

**Consumer group rebalancing is where the subtle correctness bugs live.** Producing to a partition is straightforward. Consuming from one is straightforward. Coordinating which consumer owns which partition in a group across restarts, with cooperative rebalancing, is where I spent the most time and the most tests.

**The wire protocol is more of the codebase than the log.** Length-prefixed framing, opcode dispatch, backpressure, connection lifecycle, TLS handshake handling, mTLS peer identity verification — the log is beautiful and simple and small. The network layer is most of the surface area of the project.

## Pre-alpha means pre-alpha

The on-disk format, the wire protocol, and the public APIs can change without notice until the first tagged release. I mean that literally. There is production shape here but there aren't yet production guarantees, and the roadmap explicitly names the gaps (auth, geo-replication, non-Go SDKs) that would have to close before I'd point anyone at it for real workloads.

## Where to find it

- **Broker + Go SDK:** [github.com/jedi-knights/holocron](https://github.com/jedi-knights/holocron)
- **Python SDK:** [github.com/jedi-knights/holocron-python](https://github.com/jedi-knights/holocron-python)
- **Jepsen's NATS JetStream 2.12.1 analysis:** [jepsen.io/analyses/nats-2.12.1](https://jepsen.io/analyses/nats-2.12.1)
