+++
title = "Code Quality"
date = 2026-07-09T21:45:00-04:00
draft = false
description = "Writing on static analysis, testing, code metrics, and the tooling that catches problems before they reach production."
+++

Posts on the tooling that catches problems before they reach production — static analysis, testing frameworks, code-metric analyzers, and the release plumbing that gates all of it. Some of it is Go-specific (Ginkgo, golangci-lint, kyber, TDD-shape). Some of it isn't (nasm-lint for NASM assembly, semantic-release as a language-agnostic contract). The common thread is: the quality gate should live in the loop where the code is written, not in a review that happens after the fact.
