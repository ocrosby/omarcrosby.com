+++
title = "Distributed Systems"
date = 2026-07-09T21:45:00-04:00
draft = false
description = "Notes on log-based brokers, streaming semantics, and the guarantees that hold under partition and truncation."
+++

Posts on log-based brokers, streaming semantics, and the guarantees that hold when the network isn't cooperating. Right now the running thread is [Holocron]({{< ref "projects/holocron.md" >}}) — a learning-first take on Kafka-style event streaming — and the design decisions that follow from taking per-partition ordering as the load-bearing property.
