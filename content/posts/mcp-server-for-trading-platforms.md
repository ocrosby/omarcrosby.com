+++
title = "Bridging Tradovate, Bookmap, and Thinkorswim to Claude with MCP"
date = 2026-07-04T11:15:00-04:00
draft = true
summary = "market-bridge is an MCP server that exposes real-time /ES futures data from three trading platforms as tools Claude can call directly."
tags = ["mcp", "trading", "python", "futures", "claude"]
ShowToc = true
+++

## TL;DR

_[One sentence: what this lets you do that you couldn't before.]_

I built [market-bridge](https://github.com/ocrosby/market-bridge), an MCP server that lets Claude read real-time /ES futures data straight out of the three trading platforms I actually use — Tradovate, Bookmap, and Thinkorswim — so I can reason about the tape in a chat instead of pivoting between four windows.

## Why this exists

_[The pain point: what were you doing before that made you write this?]_

_[Optional: a short story of a specific trade or moment where the friction was obvious.]_

## What MCP is, in one paragraph for people who haven't seen it yet

_[Skip if you've written this before; link out otherwise.]_

The [Model Context Protocol](https://modelcontextprotocol.io) is a small, well-defined RPC surface for exposing tools, resources, and prompts to LLM clients — Claude in particular. An MCP server declares tools, an MCP client calls them, and the LLM decides which to invoke. That's the whole shape.

## The tools I exposed

_[List the tool names + one-liners. Structured like:]_

- `get_current_price` — _...one line_
- `get_order_book_snapshot` — _...one line_
- `get_tape_window` — _...one line_
- _[etc.]_

_[Group by platform if the divide is meaningful.]_

## One end-to-end example

_[A prompt you typed and the response you got. Include the tool calls Claude made.]_

```text
Me:     _[the prompt]_

Claude: _[the response]_
```

## Where the seams are

_[Rate limits? Data quality? Auth quirks? Which platform was hardest?]_

## What I'd add next

_[Roadmap in one bulleted list — feel free to be aspirational.]_

## Where to find it

- **Repo:** [github.com/ocrosby/market-bridge](https://github.com/ocrosby/market-bridge)
- **MCP spec:** [modelcontextprotocol.io](https://modelcontextprotocol.io)
