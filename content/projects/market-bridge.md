+++
title = "Market Bridge"
date = 2026-07-04T11:15:00-04:00
draft = false
summary = "MCP server bridging trading platforms (Tradovate, Bookmap, Thinkorswim) to Claude for real-time /ES futures data analysis."
tags = ["mcp", "trading", "python", "futures"]

[cover]
image = "/images/og/projects/market-bridge.png"
hiddenInList = true
hiddenInSingle = true
+++

An MCP server that bridges the trading platforms I use — **Tradovate**, **Bookmap**, **Thinkorswim** — into Claude, so I can ask questions about real-time **/ES futures** data (order flow, tape, positioning, volatility) inside a Claude conversation instead of context-switching to each platform.

**Deep dive:** [Bridging Tradovate, Bookmap, and Thinkorswim to Claude with MCP →]({{< ref "posts/mcp-server-for-trading-platforms.md" >}}) — why "no CSV exports, no context-switching" changed how I read a session, and what shape the MCP tools take when the caller is a conversation, not a script.

**Stack:** Python · MCP · Tradovate API · Bookmap · Thinkorswim

- **Repo:** [github.com/ocrosby/market-bridge](https://github.com/ocrosby/market-bridge)
