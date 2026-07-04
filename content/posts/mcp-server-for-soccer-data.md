+++
title = "Building MCP servers for NWSL and ECNL soccer data"
date = 2026-07-04T11:15:00-04:00
draft = false
summary = "jk-mcp-nwsl and jk-mcp-ecnl give Claude direct access to live league data — standings, rosters, RPI, results — from three different upstreams stitched into a coherent tool surface."
tags = ["mcp", "python", "sports-data", "nwsl", "ecnl", "soccer"]
ShowToc = true
+++

Ask any LLM who's leading the NWSL right now and you'll get a polite disclaimer about a training cutoff. That's a genuine limitation — the model can't know today's standings, last night's scores, or whether Gotham FC is currently in a playoff spot. But it's also a *fixable* limitation, if you can give the model a way to ask.

That's what MCP is for. And that's why I built [jk-mcp-nwsl](https://github.com/jedi-knights/jk-mcp-nwsl) and its ECNL / ECRL sibling [jk-mcp-ecnl](https://github.com/jedi-knights/jk-mcp-ecnl) — two MCP servers that expose live league data as tools Claude can call directly. Same architecture, different upstreams, same experience on the ask-Claude-a-question side.

## Two servers, one architecture

Both are Python 3.13, FastMCP, `httpx`, hexagonal architecture. Both are read-only and idempotent — they never mutate anything upstream, and the same tool call with the same inputs returns the same output. Both are packaged for Docker so you can run them next to Claude Desktop or wire them into Claude Code without babysitting a venv.

The interesting differences are in the upstreams.

## NWSL: three data sources stitched into one surface

`jk-mcp-nwsl` doesn't have a single canonical API to talk to. It has three:

- The **ESPN public API** — teams, schedule, live scores, league standings, news
- The unofficial **SDP / Opta feed** that powers `nwslsoccer.com` — player stats, team aggregates, historical standings, Challenge Cup
- The **official NWSL CMS** — award articles (Best XI, Player of the Month, Rookie of the Month)

All three had to be reverse-engineered from the public site's widget bundles. There's no auth to fight, but there are also no contracts. When something breaks, the format changed upstream and I get to figure out where.

The tool surface hides all of that. The consumer of the server sees sixteen tools with descriptive names — `get_teams`, `get_roster`, `get_scoreboard`, `get_team_schedule`, `get_match_details`, `get_standings`, `get_historical_standings`, `get_challenge_cup_standings`, `get_player_leaderboards`, `get_team_season_stats`, `get_news`, `get_award_articles`, `get_strength_of_schedule`, `get_results_by_opponent_tier`, `get_adjusted_points_per_game` — and doesn't care which upstream any of them hits.

## Derived analytics are the interesting tools

The last three deserve a separate mention. They're not raw pulls — they're pure functions computed over the live ESPN standings and team schedule, and they surface schedule-strength context the raw table doesn't show:

- **`get_strength_of_schedule`** — a team's average opponent points-per-game across matches already played
- **`get_results_by_opponent_tier`** — split a team's record against the current top, middle, and bottom thirds of the standings
- **`get_adjusted_points_per_game`** — raw PPG alongside an opponent-quality-adjusted PPG

The inspiration is NCAA RPI's core idea of weighting by opponent quality. The adaptation is *not* recursion (no opponent-of-opponent nested loop) and no non-conference adjustment. Sixteen-team pro league, one round-robin. The math has to fit the shape of the league.

## ECNL / ECRL: a different data model

`jk-mcp-ecnl` looks similar from the outside — schedule, standings, results, rosters, RPI — but the underlying data model is completely different.

Youth soccer is structured as `league (ECNL/ECRL) × gender (boys/girls) × conference × season = one event`. Inside an event there are **divisions** (age groups like `G2008/2007` ≈ U17), and each division has one or more **flights**. Standings and schedules are keyed by `flight_id`. That's four levels of hierarchy where NWSL has essentially one.

I could have made the caller supply IDs, but that's a horrible experience. Instead the server exposes `find_events`, which turns a human description ("boys ECNL Southeast conference, current season") into the IDs the other tools need. Claude chains it automatically: `find_events` → `get_event_overview` → `get_standings` for a specific flight. From the outside it looks like natural language got you standings.

Data comes from the **Total Global Sports / AthleteOne** public API at `api.athleteone.com` — the one behind `theecnl.com`. Same reverse-engineering-from-a-widget-bundle story, same undocumented contract, same "if it breaks the format changed upstream" caveat.

## RPI, done correctly

`get_rpi` and `get_team_rpi` compute the Rating Percentage Index using the standard NCAA formula:

```text
RPI = 0.25·WP + 0.50·OWP + 0.25·OOWP
```

Where `WP = (W + tie_weight·T) / (W + L + T)` and `tie_weight` defaults to `1/3` (the current NCAA women's-soccer convention; pass `0.5` for the pre-2024 formula). OWP and OOWP score ties at `1/2` and correctly exclude the rated team from each opponent's record — that exclusion is easy to miss and easy to get wrong.

Two things worth noting about RPI inside a single ECNL conference. First, if the conference is a complete round-robin (which it usually is), the opponent-set and opponent-of-opponent-set are essentially symmetric, and OWP / OOWP converge on ~0.5. In that regime, RPI ≈ WP, and the sophistication doesn't buy you anything. Second, RPI's real value is *across* conferences — the postseason bracket — and that's where the tools earn their keep.

## Where MCP fits the shape

MCP wins over "just make a REST API" for exactly this kind of workload. The tools are already the shape Claude wants — verb-y names, JSON-schema arguments, structured results. The chaining is automatic (find_events → get_standings) because that's what tool-calling *is*. And the auth story is trivial because the server is local and the upstreams don't need auth.

If you're building a data feed for a specific league or dataset, MCP is probably the right delivery shape now.

## Where to find it

- **NWSL server:** [github.com/jedi-knights/jk-mcp-nwsl](https://github.com/jedi-knights/jk-mcp-nwsl)
- **ECNL / ECRL server:** [github.com/jedi-knights/jk-mcp-ecnl](https://github.com/jedi-knights/jk-mcp-ecnl)
- **Base SDK:** [github.com/jedi-knights/jk-soccer-core](https://github.com/jedi-knights/jk-soccer-core)
- **RPI reference:** [women's-soccer RPI formula](https://sites.google.com/site/rpifordivisioniwomenssoccer/rpi-formula)
