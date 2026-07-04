+++
title = "Reading intraday SPX bias: turning market signals into credit-spread trades"
date = 2026-07-04T11:15:00-04:00
draft = true
summary = "strike-pilot is a Python engine that predicts intraday SPX bias with a confidence score and converts the signal into a structured credit-spread idea — or an explicit no-trade decision."
tags = ["python", "trading", "options", "spx", "signals"]
ShowToc = true
+++

## TL;DR

_[One sentence: what strike-pilot produces + why "no-trade" is a first-class output.]_

[strike-pilot](https://github.com/ocrosby/strike-pilot) reads intraday SPX bias, scores its own confidence, and emits either a concrete credit-spread recommendation (strike, width) or an explicit no-trade decision. The last part matters more than the first two.

## Why "no-trade" is a first-class output

_[Two paragraphs about the discipline problem. Every trader has a subjective sense of when the setup isn't there; almost no tooling encodes it. If your signal engine can only say "buy" or "sell", it's structurally incapable of the most valuable answer.]_

## The signal inputs

_[List the inputs in order of importance. E.g.:]_

- **Price action** — _[what specifically, over what window]_
- **Volatility surface** — _[which slice, VIX / VVIX / term structure]_
- **Risk constraints** — _[position size caps, max loss per trade]_
- _[additional inputs]_

## The scoring pipeline

_[High-level flow: inputs → features → bias direction → confidence → strike/width mapping. Mermaid or ASCII diagram if you want.]_

## Strike selection logic

_[How the engine picks strikes given bias + confidence. Rule-based? Fitted? Both?]_

## An example day

_[Walk through one actual trading day: what the engine saw, what it recommended, whether the trade worked. Fine to anonymize.]_

## What I got wrong at first

_[A few concrete lessons — a feature that seemed obvious but hurt performance, or a threshold that needed to be recalibrated.]_

## What I'd add next

_[Roadmap.]_

## Where to find it

- **Repo:** [github.com/ocrosby/strike-pilot](https://github.com/ocrosby/strike-pilot)
