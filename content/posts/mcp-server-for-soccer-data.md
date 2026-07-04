+++
title = "Building an MCP server for NWSL and ECNL soccer data"
date = 2026-07-04T11:15:00-04:00
draft = true
summary = "How jk-mcp-nwsl and jk-mcp-ecnl expose league data — rosters, standings, RPI, schedules, match details — as tools Claude can call."
tags = ["mcp", "python", "sports-data", "nwsl", "ecnl", "soccer"]
ShowToc = true
+++

## TL;DR

_[One sentence: what the MCP servers do and who's using them.]_

I built [jk-mcp-nwsl](https://github.com/jedi-knights/jk-mcp-nwsl) and [jk-mcp-ecnl](https://github.com/jedi-knights/jk-mcp-ecnl) so I can ask Claude about league state — standings, rosters, RPI, results — without opening seven tabs of league websites. They wrap different upstreams but present a coherent tool surface.

## Two leagues, two upstreams

_[Split into subsections.]_

### NWSL — ESPN's public API

_[Endpoints ESPN exposes; what they return; caching considerations.]_

### ECNL / ECRL — Total Global Sports / AthleteOne

_[The undocumented API. What was hard to figure out. HTTP shape, auth handshake if any.]_

## The MCP tools I exposed

_[Group by domain. Example:]_

- **Standings** — `get_standings`, `get_conference_standings`
- **Roster** — `get_team`, `get_roster`, `get_player_leaderboards`
- **Schedule & results** — `get_schedule`, `get_team_schedule`, `get_results`, `get_match_details`
- **RPI** — `get_rpi`, `get_team_rpi`
- **Events / brackets** — `find_events`, `get_event_overview`, `get_brackets`
- _[etc.]_

## One end-to-end example

_[A Claude prompt about a specific match or standings question and the resulting tool call chain.]_

```text
Me:     _[e.g., "How is Gotham FC ranked in the NWSL standings right now?"]_

Claude: _[what it called + what it said]_
```

## Data drift and cache invalidation

_[The upstream schemas change without notice. How the SDK layer normalizes them; how you decide what to cache and for how long.]_

## Where the MCP shape helped

_[What was easier because you're doing MCP rather than a REST API or a script.]_

## What I'd add next

_[Player-level stats? Match-level xG? Bracket predictions?]_

## Where to find it

- **NWSL server:** [github.com/jedi-knights/jk-mcp-nwsl](https://github.com/jedi-knights/jk-mcp-nwsl)
- **ECNL server:** [github.com/jedi-knights/jk-mcp-ecnl](https://github.com/jedi-knights/jk-mcp-ecnl)
- **Base SDK:** [github.com/jedi-knights/jk-soccer-core](https://github.com/jedi-knights/jk-soccer-core)
