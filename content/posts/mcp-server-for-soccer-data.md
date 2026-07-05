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

## How to set them up

Both servers speak MCP over HTTP, so any MCP-aware client — Claude Code, Claude Desktop, Cursor, Zed — can connect. A live instance of each runs on Fly.io behind the [`api-gateway`](https://github.com/jedi-knights/api-gateway), which means you don't have to clone a repo, install Python, or manage a venv to start using them.

### Claude Code — hosted (recommended)

One command per server, installed globally so they're available in every project:

```sh
claude mcp add --transport http --scope user nwsl https://jk-api-gateway.fly.dev/mcp/nwsl
claude mcp add --transport http --scope user ecnl https://jk-api-gateway.fly.dev/mcp/ecnl
```

Verify:

```sh
claude mcp list
```

You should see both listed with a `✓ Connected` marker. Restart Claude Code if it was already open.

### Claude Desktop — hosted

Open the Claude Desktop config from **Settings → Developer → Edit Config**, or by hand:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add both servers to the `mcpServers` object:

```json
{
  "mcpServers": {
    "nwsl": {
      "type": "streamable-http",
      "url": "https://jk-api-gateway.fly.dev/mcp/nwsl"
    },
    "ecnl": {
      "type": "streamable-http",
      "url": "https://jk-api-gateway.fly.dev/mcp/ecnl"
    }
  }
}
```

Restart Claude Desktop after saving. The NWSL and ECNL tools show up in the tool picker.

### Running locally

If you'd rather run the server on your own machine — for hacking, offline use, or a fully-private setup — each repo's README has the local install path. The short version:

```sh
git clone https://github.com/jedi-knights/jk-mcp-nwsl.git
cd jk-mcp-nwsl
uv sync
uv run python -m nwsl.server           # stdio mode for Claude Code / Desktop
# or:
MCP_TRANSPORT=streamable-http uv run python -m nwsl.server
```

Same shape for `jk-mcp-ecnl` — just swap the paths and the module name.

## Example prompts

Once either server is connected, natural-language queries chain the tools for you — Claude picks `find_events` → `get_event_overview` → `get_standings` automatically, no ID lookup required from you. A sampling of what the two servers actually unlock:

### Standings and results

> Who is leading the NWSL standings right now?
>
> Show me the ECNL Girls Southwest U17 standings.
>
> What NWSL matches are scheduled for today?
>
> What were last weekend's scores in ECNL Boys Texas U17?

### Team and player detail

> Who scored in the most recent Portland–Carolina match?
>
> Who's on the Portland Thorns roster?
>
> Show me Kansas City Current's goalkeepers.
>
> When does Slammers FC HB Koge play next?

### Player leaderboards

> Who is the top scorer in the NWSL right now?
>
> Which NWSL team has the best passing accuracy this season?
>
> Compare Portland and Kansas City by points and goals scored this season.

### Schedule strength and adjusted metrics (NWSL)

> Which team has played the toughest schedule so far this season?
>
> Show me Gotham's record against the current top 5 teams in the standings.
>
> Compare San Diego and Seattle on adjusted points-per-game — who has earned their points the hard way?

### RPI analysis (ECNL)

> Rank the ECNL Girls Southwest U17 flight by RPI.
>
> What's Slammers FC's RPI, broken down into WP, OWP, and OOWP?
>
> Recompute that flight's RPI using the pre-2024 ½ tie weight.

### Historical

> Who won the 2018 NWSL Regular Season?
>
> Show me the 2022 NWSL Challenge Cup standings.

The point of these isn't to memorize a query syntax — the servers work *because* there isn't one. Ask what you'd ask a friend who watches too much soccer, and Claude figures out which tools to call.

## Where to find it

- **NWSL server:** [github.com/jedi-knights/jk-mcp-nwsl](https://github.com/jedi-knights/jk-mcp-nwsl)
- **ECNL / ECRL server:** [github.com/jedi-knights/jk-mcp-ecnl](https://github.com/jedi-knights/jk-mcp-ecnl)
- **Base SDK:** [github.com/jedi-knights/jk-soccer-core](https://github.com/jedi-knights/jk-soccer-core)
- **RPI reference:** [women's-soccer RPI formula](https://sites.google.com/site/rpifordivisioniwomenssoccer/rpi-formula)
