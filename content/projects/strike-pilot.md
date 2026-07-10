+++
title = "Strike Pilot"
date = 2026-07-04T11:15:00-04:00
draft = false
summary = "Intraday SPX bias predictor with confidence scoring; converts signals into structured credit-spread ideas or explicit no-trade decisions."
tags = ["python", "trading", "options", "signals"]

[cover]
image = "/images/og/projects/strike-pilot.png"
hiddenInList = true
hiddenInSingle = true
+++

A Python engine that predicts intraday **SPX bias** with a confidence score and converts the resulting signals into structured **credit-spread ideas** — strike selection, width, or an explicit no-trade recommendation. Combines price action, volatility, and risk constraints so the output is always something concrete to act on or explicitly reject.

**Deep dive:** [Reading intraday SPX bias: turning market signals into credit-spread trades →]({{< ref "posts/reading-intraday-spx-bias.md" >}}) — how the engine scores its own confidence, and why an explicit "no trade" output is a feature, not a fallback.

**Stack:** Python · options analysis · volatility modeling

- **Repo:** [github.com/ocrosby/strike-pilot](https://github.com/ocrosby/strike-pilot)
