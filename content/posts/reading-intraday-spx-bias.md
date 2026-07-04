+++
title = "Reading intraday SPX bias: turning market signals into credit-spread trades"
date = 2026-07-04T11:15:00-04:00
draft = true
summary = "strike-pilot is a Python engine that reads intraday SPX signals, scores its own confidence, and produces a concrete credit-spread recommendation — or explicitly refuses to trade."
tags = ["python", "trading", "options", "spx", "signals"]
ShowToc = true
+++

Most retail options traders make credit-spread decisions the same way: a chart, a feeling about the direction, a strike picked because it "feels safe", and hope. Nothing about that loop is systematic, and nothing about it forces the honest question — **is the setup actually there?**

[strike-pilot](https://github.com/ocrosby/strike-pilot) is the shape I wanted that loop to take. It ingests intraday market signals, decides on a directional bias with a calibrated confidence score, picks specific strikes, and validates the candidate spread against risk parameters. If any check fails, its output is `no-trade`. That last part matters more than any of the others.

## Why "no-trade" is a first-class output

A signal engine that can only say "buy" or "sell" is structurally incapable of the most valuable answer, which is *not today*. Most trading days for a retail credit-spread strategy are days you shouldn't take a trade — the edge isn't there, or the volatility environment is wrong, or your risk model says the payoff isn't worth the exposure. If the engine can't return a `no-trade` verdict, it will find *something* to recommend, and you'll take it. That's how accounts bleed out.

strike-pilot's default action is refusal. A recommendation only comes back when the bias, the confidence, and the risk validation all agree.

## The signal inputs

Right now the bias score is aggregated from four momentum inputs:

- **Price action** — intraday close relative to prior structure
- **RSI** — over a configurable window
- **SMA cross** — a moving-average confluence signal
- **VIX** — as a volatility gate, not a directional signal on its own

They're weighted into a single directional bias with a confidence score. All of that is a `BiasStrategy` port — a `Protocol` in Python-speak — so I can swap in a different aggregation without touching the rest of the engine.

## Strike selection is its own port

Once the engine has a bias and a confidence, it needs to pick strikes. That's where `StrikeSelector` comes in — another swap-in-a-thing port. Current strategies include:

- **Delta targeting** — pick strikes at a specific delta from spot
- **Probability of profit** — pick strikes such that POP crosses a threshold
- **Risk / reward** — pick strikes based on max loss vs max gain ratio

Every candidate spread is then re-validated against configurable risk parameters — position size caps, max loss per trade, exposure limits — before it's allowed to become a recommendation.

## The architecture, briefly

strike-pilot follows a **ports-and-adapters (hexagonal)** layout. The domain layer is pure — models, policies, business rules — and has zero I/O. Adapters supply the market data (static fixtures for tests, live via yfinance), the options chains (real or synthetic for backtesting), the presenters (console, JSON), and the alert channels (console, logging). Inbound adapters — a click CLI and a FastAPI HTTP surface — sit at the top so the engine is callable from both a terminal and a service.

The point of that split isn't purity. It's that when I want to swap yfinance for a proper broker feed, I don't have to touch a single line of domain logic.

## Backtesting is the honest test

Every claim about the strategy has to survive a backtest against historical data — real options chains where I have them, synthetic chains where I don't. The backtest infrastructure is the same shape as live: same `BiasStrategy`, same `StrikeSelector`, same risk validation. That's how I know a "no-trade" verdict is calibrated the same way in production as it was in the historical run.

Every recommendation the engine makes gets logged to CSV. Every alert fires through the same channel, whether it's live or during a backtest. Observability isn't retrofitted — it's a first-class output alongside the trade decision.

## What I'd add next

- More bias strategies (mean-reversion variants, VIX-term-structure aware)
- A live options-chain adapter (real broker feed, not synthetic)
- A companion notebook that runs the backtest across a parameter sweep and hands me a heatmap
- Integration with [market-bridge]({{< relref "mcp-server-for-trading-platforms" >}}) so Claude can call `strike-pilot`'s bias engine directly during a conversation

## Where to find it

- **Repo:** [github.com/ocrosby/strike-pilot](https://github.com/ocrosby/strike-pilot)
