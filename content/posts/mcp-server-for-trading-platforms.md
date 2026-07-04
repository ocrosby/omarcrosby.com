+++
title = "Bridging Tradovate, Bookmap, and Thinkorswim to Claude with MCP"
date = 2026-07-04T11:15:00-04:00
draft = false
summary = "market-bridge is an MCP server that gives Claude direct access to real-time /ES futures data from the three platforms I trade on. No CSV exports, no context-switching."
tags = ["mcp", "trading", "python", "futures", "claude"]
ShowToc = true
+++

I trade **/ES** (the S&P 500 E-mini futures) across three platforms — **Tradovate** for execution, **Bookmap** for order-flow visualization, and **Thinkorswim** for chart study. Each is good at its job. None of them talks to Claude.

That's the problem [market-bridge](https://github.com/ocrosby/market-bridge) solves: it's a small [FastMCP](https://gofastmcp.com)-based server that runs on my machine and lets Claude ask the platforms for market data directly, mid-conversation, without me exporting anything.

## The CSV-export loop

The workflow before market-bridge, when I wanted a second opinion on a setup, looked like this:

1. Open Tradovate → export the day's /ES bars to CSV
2. Switch to Claude → upload the CSV → wait while it parses
3. Ask a question
4. Realize I need volume-profile or order-flow context too
5. Switch to Bookmap → repeat the export cycle
6. By the time I had all the context loaded, the setup was gone

Markets don't wait for CSV exports. And every switch cost me the *thing I was actually watching*.

## What MCP is, in one paragraph

The [Model Context Protocol](https://modelcontextprotocol.io) is Anthropic's small, well-defined RPC surface for exposing **tools** to LLM clients. A server declares tools (name, JSON schema for arguments, what it returns), a client — Claude Code, Claude Desktop, or any MCP-aware app — connects and lists them, and the model decides when to call which one. That's the whole shape. There's no plugin framework, no auth dance for the model side, no Anthropic-specific SDK you have to link against. Just tools.

## What the server exposes

market-bridge is a **local** process. It's not a cloud service, and there's no third party sitting between Claude and my broker. It runs where the trading platforms already are — on my machine — and talks to them the way any local script would.

The tools sit in the domain of things I care about when reading /ES: price candles across timeframes, volume profiles, order-flow snapshots from Bookmap, key support/resistance levels, and derived signals I want to be able to inspect at will. The point is that Claude can *reach for the data itself* while we're mid-thought, instead of me interrupting to go fetch it.

## Where the seams are

- **Platform APIs differ wildly.** Tradovate has a proper REST/WebSocket API. Bookmap's automation surface is much thinner. Thinkorswim requires you to work with what its scripting environment exposes. The bridge normalizes all of that into a consistent tool shape, but the adapters underneath are not symmetrical.
- **Live data is live.** Snapshots are cheap; streams are expensive. Most of the tools return a bounded window (the last N minutes of tape, current book snapshot) rather than a subscription, because a subscription is the wrong primitive for the "ask Claude a question and get an answer" loop.
- **The bridge is stateless.** State lives in the platforms. That keeps the failure model simple — if I restart market-bridge mid-session, I lose nothing.

## What I'd add next

- More per-platform tools (Bookmap heatmap regions, Tradovate account state, TOS options-chain snapshots)
- A `record` mode that captures the tool calls Claude made during a session, so I can replay a day's analysis
- A companion connector to [strike-pilot]({{< relref "reading-intraday-spx-bias" >}}) so Claude can pipe the same data into my SPX bias engine without me copy-pasting

## Where to find it

- **Repo:** [github.com/ocrosby/market-bridge](https://github.com/ocrosby/market-bridge)
- **MCP spec:** [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **FastMCP:** [gofastmcp.com](https://gofastmcp.com)
