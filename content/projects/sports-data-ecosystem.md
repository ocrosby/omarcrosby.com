+++
title = "Sports Data Ecosystem"
date = 2026-07-04T11:15:00-04:00
draft = false
summary = "MCP servers, Python SDKs, an RPI calculator, and a match-tracking app — a stack of tools for pulling and reasoning about soccer, NFL, and other league data."
tags = ["mcp", "sports-data", "python", "go"]

[cover]
image = "/images/og/projects/sports-data-ecosystem.png"
hiddenInList = true
+++

A collection of independently useful pieces that all speak the same data:

- **MCP servers** exposing NWSL, ECNL/ECRL, and NFL data as LLM-callable tools:
  [`jk-mcp-nwsl`](https://github.com/jedi-knights/jk-mcp-nwsl),
  [`jk-mcp-ecnl`](https://github.com/jedi-knights/jk-mcp-ecnl),
  [`jk-mcp-nfl`](https://github.com/jedi-knights/jk-mcp-nfl).
- **Python SDKs** for a growing list of leagues:
  [`jk-soccer-core`](https://github.com/jedi-knights/jk-soccer-core) (the base),
  [`jk-soccer-nwsl`](https://github.com/jedi-knights/jk-soccer-nwsl),
  [`jk-soccer-mls`](https://github.com/jedi-knights/jk-soccer-mls),
  [`jk-soccer-ecnl`](https://github.com/jedi-knights/jk-soccer-ecnl),
  [`jk-soccer-ncaa`](https://github.com/jedi-knights/jk-soccer-ncaa),
  [`jk-soccer-usl`](https://github.com/jedi-knights/jk-soccer-usl),
  [`jk-soccer-wpsl`](https://github.com/jedi-knights/jk-soccer-wpsl),
  [`jk-soccer-ga`](https://github.com/jedi-knights/jk-soccer-ga),
  [`jk-soccer-soccerwire`](https://github.com/jedi-knights/jk-soccer-soccerwire),
  [`jk-soccer-topdrawer`](https://github.com/jedi-knights/jk-soccer-topdrawer).
- **A Go ECNL module** — [`ecnl`](https://github.com/jedi-knights/ecnl) — and an [`rpi`](https://github.com/jedi-knights/rpi) calculator for ratings and standings.
- **Adjacent pieces** — [`gridiron-insights`](https://github.com/jedi-knights/gridiron-insights) for football data, [`ratings`](https://github.com/jedi-knights/ratings) and [`rankings`](https://github.com/jedi-knights/rankings) as general-purpose ranking tools.

**Stack:** Python (SDKs, MCP servers), Go (ECNL module, RPI, Touchline), MCP.
