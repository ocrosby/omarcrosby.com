+++
title = "Identity Platform (Go)"
date = 2026-07-04T11:15:00-04:00
draft = false
summary = "A production-style OAuth2/OIDC reference in Go, built as pure microservices — each service independently deployable with its own database."
tags = ["oauth2", "oidc", "go", "microservices"]

[cover]
image = "/images/og/projects/identity-platform-go.png"
hiddenInList = true
+++

A working reference for OAuth2 and OIDC in Go, shaped as a proper microservices deployment rather than a monolith with routes. Each service is independently deployable, owns its own database, and follows a ports-and-adapters interior.

Auditability was a design goal: durable audit events land in a `audit_events` table, and a companion service ([`jk-metering`](https://github.com/jedi-knights/jk-metering)) transforms them for a metering backend.

**Stack:** Go · OAuth2 · OIDC · microservices · ports-and-adapters

- **Repo:** [github.com/jedi-knights/identity-platform-go](https://github.com/jedi-knights/identity-platform-go)
- **Metering companion:** [github.com/jedi-knights/jk-metering](https://github.com/jedi-knights/jk-metering)
- **Related — legacy Python impl:** [github.com/jedi-knights/identity-service](https://github.com/jedi-knights/identity-service)
