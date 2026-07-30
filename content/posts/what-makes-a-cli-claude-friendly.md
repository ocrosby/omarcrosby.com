+++
title = "What makes a CLI Claude-friendly"
date = "2026-07-30T05:48:22-04:00"
draft = false
description = "A concrete look at what turns a command-line tool into something an AI coding agent can drive reliably, with contrived before/after examples for structured output, subcommands, non-interactive defaults, exit codes, self-documenting help, idempotency, and when a token-oriented format like TOON is worth adding as a second output mode."
summary = "A concrete look at what turns a command-line tool into something an AI coding agent can drive reliably, with contrived before/after examples for structured output, subcommands, non-interactive defaults, exit codes, self-documenting help, idempotency, and when a token-oriented format like TOON is worth adding as a second output mode."
tags = ["claude-code", "cli-design", "ai-assisted-development", "developer-tools", "token-efficiency"]
categories = ["Claude Code"]

[cover]
image = "/images/og/what-makes-a-cli-claude-friendly.png"
hiddenInList = true
hiddenInSingle = true
+++

I asked Claude what an optimal setup looks like for a CLI that's meant to be driven through a Claude Code skill. The answer was a short list of properties — structured output, subcommands, non-interactive defaults, meaningful exit codes, self-documenting help, idempotency — that I recognized immediately, because they're the same properties I'd want from a CLI written for a human teammate who reads fast and never asks a clarifying question if the tool will just tell them the answer.

That's the useful framing: an AI agent driving your CLI behaves like a very literal, very fast junior engineer who has read your `--help` output once and is now composing commands from memory, with no opportunity to squint at a table or notice a color that didn't render. Every property below exists because *something specific goes wrong* when a CLI doesn't have it — not because "AI tools like JSON."

The tool in every example below is invented for this post — a fictional orchard-management CLI called `orchardctl` that tracks trees, harvests, and irrigation schedules on a pretend farm. None of it maps to anything real; it exists purely so the before/after shape is visible without dragging in domain noise.

## Structured output over pretty-printed text

**The problem:** a CLI that formats for a human terminal — box-drawing characters, ANSI color, column alignment computed at print time — hands an agent a wall of text it has to *parse before it can act*. Parsing pretty-printed output is exactly the kind of brittle string-scraping that breaks the next time someone widens a column by two spaces.

Here's the failure mode, concretely. Say `orchardctl trees status` prints this by default:

```text
┌────────┬────────────┬──────────┐
│ Tree   │ Variety    │ Status   │
├────────┼────────────┼──────────┤
│ T-014  │ Honeycrisp │ ✓ Healthy│
│ T-019  │ Fuji       │ ⚠ Stressed│
└────────┴────────────┴──────────┘
```

An agent that needs to know which trees are stressed now has to regex around box-drawing characters and a checkmark glyph, hope the column widths don't shift between runs, and hope "⚠ Stressed" is the only way that status ever renders. It'll often work. It will occasionally misparse in a way that's invisible until the agent acts on the wrong tree.

The fix is a `--json` flag (or JSON as the non-TTY default, with the pretty table reserved for an interactive terminal):

```bash
$ orchardctl trees status --json
{"trees":[
  {"id":"T-014","variety":"Honeycrisp","status":"healthy"},
  {"id":"T-019","variety":"Fuji","status":"stressed"}
]}
```

Now the agent has a stable contract — field names, not column positions — and parsing it is a one-line `json.loads` instead of a regex that's really a bet on formatting never changing.

## Subcommands over flag soup

**The problem:** a single command with a dozen optional flags is combinatorially harder to compose correctly than a command tree, because the agent has to hold all fifteen flags' interactions in its head at once, and there's no cheap way to discover which combinations are actually valid.

Contrast these two designs for scheduling a harvest:

```bash
# flag soup — every operation funneled through one command
orchardctl harvest --tree=T-014 --action=start --crew=north --notify=false --dry-run=false
orchardctl harvest --tree=T-014 --action=cancel --reason="frost warning"
orchardctl harvest --action=list --status=in-progress
```

Nothing here tells you which flags are meaningful together. Does `--crew` apply to `--action=cancel`? Does `--notify` do anything on `--action=list`? The agent has to guess or read the full `--help` every time, and a wrong guess (passing `--crew` to a cancel) might silently no-op instead of erroring.

```bash
# subcommands — the verb is the command, not a flag value
orchardctl harvest start T-014 --crew=north
orchardctl harvest cancel T-014 --reason="frost warning"
orchardctl harvest list --status=in-progress
```

Each subcommand only accepts the flags relevant to *that* operation, so an invalid combination becomes a parse error the agent sees immediately instead of a silent misfire it discovers three steps later. This is the same discipline as designing a good REST API — nouns and verbs in the resource path, not a single endpoint with a `mode` parameter that changes what every other field means.

## Deterministic, non-interactive by default

**The problem:** a prompt that expects a live terminal (`Continue? [y/N]`, a spinner that assumes a TTY, an editor that pops open for a commit message) either hangs forever waiting for input that will never come, or gets a garbage answer from whatever the agent's stdin happens to contain.

```bash
$ orchardctl trees remove T-019
This will permanently remove tree T-019 and its harvest history.
Continue? [y/N]: _
```

An agent running this non-interactively either blocks indefinitely or the harness feeds it an empty line, which resolves to the default — and if the tool's author picked `[y/N]` meaning "default no," that's *safe* by accident, but plenty of tools default the other way, and now a destructive action just ran because nobody was watching stdin.

The fix is to make the confirmation an explicit flag rather than a prompt:

```bash
$ orchardctl trees remove T-019
Error: this is a destructive operation and requires --yes to run non-interactively.
$ orchardctl trees remove T-019 --yes
Removed T-019.
```

Now there's no ambiguous default to get wrong. The skill's own instructions can say "never pass `--yes` to a destructive `orchardctl` command without asking the user first" — which only works because the tool gave the skill an explicit flag to withhold. A prompt gives the skill nothing to withhold; withholding a keystroke isn't a decision point Claude can reason about the way withholding a flag is.

## Meaningful exit codes

**The problem:** a tool that only ever exits `0` or `1` collapses every kind of failure into "something went wrong," which forces the caller to parse stderr text to figure out *what* went wrong before it can decide how to react — and stderr text is exactly the unstructured-output problem again, just moved to the error path.

```bash
$ orchardctl irrigate check --zone=north; echo $?
Error: irrigation controller unreachable
1
$ orchardctl irrigate check --zone=south; echo $?
No irrigation needed — soil moisture above threshold
1
```

Both of those are exit code `1`, but they mean completely different things — one is "the tool couldn't even run its check" (retry later, maybe alert someone), the other is "the check ran fine and the answer is no" (nothing is wrong, do nothing). An agent (or a skill script wrapping this tool) can't branch on that distinction without string-matching stderr, which is fragile in the same way pretty-printed tables are fragile.

Distinct exit codes let the caller branch on *meaning*, not on message text:

```text
0 — irrigation needed and started
2 — no irrigation needed (soil moisture fine)
3 — validation failed (unknown zone)
4 — controller unreachable (network/hardware failure)
```

```bash
$ orchardctl irrigate check --zone=north; echo $?
Error: irrigation controller unreachable
4
```

Now `4` unambiguously means "infrastructure problem, not a soil-moisture answer" — the skill's logic (or Claude's own reasoning about what to do next) can branch on the number without ever reading the message.

## Self-documenting `--help`

**The problem:** an agent will often run `--help` before guessing at a flag, on the reasonable assumption that it's cheaper and more reliable than trial and error. If `--help` is stale, terse to the point of uselessness, or just wrong, the agent inherits that staleness as a wrong guess that looks confident.

```text
$ orchardctl harvest start --help
Usage: orchardctl harvest start [OPTIONS] TREE_ID

Options:
  --crew TEXT
  --notify / --no-notify
```

This tells you the flags exist but not what values `--crew` accepts, what `--notify` actually does, or whether `TREE_ID` is a bare ID or needs a prefix. An agent guessing from this will guess something plausible-looking and wrong.

```text
$ orchardctl harvest start --help
Usage: orchardctl harvest start [OPTIONS] TREE_ID

Starts a harvest for the given tree. TREE_ID is the tree's identifier as
shown in `orchardctl trees list` (e.g. T-014).

Options:
  --crew TEXT             Crew name to assign. Must match an entry in
                           `orchardctl crews list`. Required.
  --notify / --no-notify  Send a Slack notification when the harvest
                           completes. Default: --notify.

Examples:
  orchardctl harvest start T-014 --crew=north
  orchardctl harvest start T-014 --crew=north --no-notify
```

The examples at the bottom matter more than the flag reference above them — an agent pattern-matches on a worked example faster than it parses a flag description, for the same reason a human skimming docs looks for the example block first. Accurate `--help` also does double duty as the skill's own documentation: if it's kept current, the skill's `SKILL.md` can point at `--help` instead of duplicating a flag reference that will drift out of sync the first time a flag is renamed.

## Idempotent where possible

**The problem:** a one-shot mutating command is comparatively risky for an agent to run speculatively, because running it twice by accident (a retried step, a re-executed instruction, a skill that gets invoked twice in the same session) produces a different, possibly worse, result than running it once.

```bash
$ orchardctl irrigate schedule --zone=north --start=06:00 --duration=30m
Created schedule sched-0091 for zone north.
$ orchardctl irrigate schedule --zone=north --start=06:00 --duration=30m
Created schedule sched-0092 for zone north.
```

Run that twice — because a retry fired, or because the agent wasn't sure the first call succeeded and reran it to check — and zone north now has two overlapping irrigation schedules instead of one. The tool did exactly what it was told each time; the danger is that "what it was told" wasn't "make sure this schedule exists," it was "create a new schedule," and those aren't the same instruction even though they look similar from the caller's side.

An idempotent version of the same operation:

```bash
$ orchardctl irrigate ensure-schedule --zone=north --start=06:00 --duration=30m
Created schedule sched-0091 for zone north.
$ orchardctl irrigate ensure-schedule --zone=north --start=06:00 --duration=30m
Schedule for zone north already matches — no change.
```

Same inputs, same tool, but the second call now returns "already matches" instead of duplicating state. This doesn't mean every command needs an idempotent variant — a one-shot `harvest start` is fine as a mutating command precisely because starting a harvest twice is obviously wrong and easy for a human reviewer to catch in the transcript. It matters most for checks, validations, and setup-style operations that an agent is likely to run speculatively as part of figuring out current state, exactly the operations most likely to get called more than once in a session without anyone deciding that on purpose.

## A further step: TOON, once the array gets large

Everything above assumes JSON is the destination format, and for most of a CLI's output that's still the right call — it's universal, every language parses it, and `jq` doesn't care who's on the other end of the pipe. But JSON's braces, repeated field names, and quoting are pure overhead once the payload an agent has to read is not two trees but four hundred, and that overhead is paid in tokens, which is the one resource an agent's context window actually meters.

[TOON](https://toonformat.dev/) (Token-Oriented Object Notation) is a format built specifically for that case: encode the same data as JSON, but for a *uniform array of flat objects* — the shape `orchardctl trees status` actually returns — fold the repeated field names into a single header and stream the rows underneath it, CSV-style:

```text
trees[2]{id,variety,status}:
  T-014,Honeycrisp,healthy
  T-019,Fuji,stressed
```

That's the same two trees from the JSON example earlier, and at two rows the difference is cosmetic. It stops being cosmetic at scale: the project's own benchmarks — run against 244 retrieval questions across four models (Claude Haiku, Gemini Flash, GPT-5 nano, Grok) — report TOON using **42.6% fewer tokens than pretty-printed JSON while matching its retrieval accuracy** (72.2% vs. JSON's 71.4%), and on fully-uniform, tabular-eligible datasets specifically, the savings against JSON run from 54.6% to 66.5%. The gain comes from paying for each field name once instead of once per row — the exact overhead JSON can't avoid and TOON is built to fold away.

**What this doesn't buy you.** The project's own "When Not to Use TOON" section is worth reading before reaching for it, because the same benchmark data shows the technique inverting, not just shrinking, outside its sweet spot:

- On a semi-uniform dataset (about 50% tabular-eligible — think event logs where some entries carry extra fields), TOON only beat pretty JSON by 15%, and used **19.9% *more* tokens than compact (minified) JSON** — worse than the format it's supposedly competing with.
- On deeply nested, non-tabular data (a config tree, ≈0% eligibility), the pattern repeats: 34.9% smaller than pretty JSON, but 6.7% *larger* than compact JSON.
- On purely flat tabular data where CSV is even an option, CSV still wins outright — TOON's field-list header and length marker are a reliability trade against CSV's smaller size, not a size win.
- Accuracy parity, not accuracy improvement, is the actual claim — 72.2% vs. 71.4% is a rounding error, not evidence that TOON helps an agent reason better. The entire case for TOON is token count, full stop.

So the rule of thumb `orchardctl` would apply: default `--format=json`, and offer `--format=toon` as an *additional* value on the same flag — consistent with the flags-not-subcommands discipline from earlier in this post — reserved for the specific case of a large, genuinely uniform array. A skill invoking the tool would only reach for `--format=toon` when it already knows the output is going to be long; for everything else, plain JSON stays both simpler and, per the numbers above, sometimes smaller.

**What it would look like in Python.** The reference implementation, `toon_format` on PyPI, is still in beta (`0.9.0b1` as of this writing) — and the trap worth naming explicitly: PyPI's *latest* tag for that project still points at an older `0.1.0` release that is nothing but a namespace reservation with no actual encoder. A bare `pip install toon-format` silently installs the placeholder, not the working library:

```bash
pip install --pre toon-format  # plain `pip install toon-format` grabs the abandoned 0.1.0 placeholder release
```

```python
from toon_format import encode

trees = [
    {"id": "T-014", "variety": "Honeycrisp", "status": "healthy"},
    {"id": "T-019", "variety": "Fuji", "status": "stressed"},
]
print(encode({"trees": trees}))
# trees[2]{id,variety,status}:
#   T-014,Honeycrisp,healthy
#   T-019,Fuji,stressed
```

The only dependency it pulls in is `typing-extensions`, and only on Python older than 3.10 — otherwise it's self-contained.

**What it would look like in Go.** `toon-go` is a community-maintained, dependency-free implementation — nothing beyond the standard library — but it has no tagged release yet (you'd pin a commit) and requires Go 1.23, worth checking against whatever version the rest of the codebase targets before adopting it:

```bash
go get github.com/toon-format/toon-go@latest  # community-maintained; no CLI, library only
```

```go
package main

import (
    "fmt"

    toon "github.com/toon-format/toon-go"
)

type Tree struct {
    ID      string `toon:"id"`
    Variety string `toon:"variety"`
    Status  string `toon:"status"`
}

type TreesResponse struct {
    Trees []Tree `toon:"trees"`
}

func main() {
    resp := TreesResponse{Trees: []Tree{
        {ID: "T-014", Variety: "Honeycrisp", Status: "healthy"},
        {ID: "T-019", Variety: "Fuji", Status: "stressed"},
    }}
    encoded, err := toon.Marshal(resp, toon.WithLengthMarkers(true))
    if err != nil {
        panic(err)
    }
    fmt.Println(string(encoded))
}
```

Unlike the Python package, there's no bundled CLI or `--format=toon` for free — a Go-built `orchardctl` would wire `toon.Marshal` into its own flag handling itself.

Both implementations are community-maintained rather than blessed by the TOON project's TypeScript core, and the ecosystem as a whole is under a year old (the spec repo was created in October 2025) — 25,000 GitHub stars and a handful of language ports is real traction for that age, but it's not the multi-decade stability guarantee JSON carries. Add it as a second, opt-in output mode for the specific case where an agent is going to read hundreds of uniform rows and token cost is a real constraint — not as a replacement for the JSON default this post opened with.

## Structuring the skill folder around the CLI

Once the CLI itself has these properties, the skill wrapping it should stay out of its way rather than duplicating what the tool already says about itself:

```text
orchard-ops/
  SKILL.md          # when to use it, 2-3 concrete invocation examples
  bin/orchardctl     # the compiled binary or script
  README.md         # optional — deeper reference if subcommands are numerous
```

A few things follow directly from everything above:

- **`SKILL.md` should show worked examples with real flags, not prose describing capabilities.** `orchardctl harvest start T-014 --crew=north` teaches Claude the calling convention in one line; a paragraph explaining that "the harvest subcommand starts harvests" teaches it nothing it couldn't get faster from `--help`.
- **If the CLI has many subcommands, point at `--help` instead of re-documenting it.** Two documents describing the same flag set will disagree with each other the first time one of them gets updated and the other doesn't — the same drift risk that shows up anywhere the same fact lives in two places.
- **Keep the binary dumb and scriptable; put judgment in `SKILL.md`.** Whether a destructive `orchardctl` command should run at all is a decision that belongs in the skill's instructions to Claude ("never pass `--yes` without asking first"), not baked into the tool as an interactive prompt the tool can't tell is being driven by an agent instead of a person.

None of this is exotic advice. It's the same design discipline that makes a CLI pleasant for a scripting-heavy human to drive from a shell pipeline — structured output composes with `jq`, subcommands compose with tab completion, non-interactive defaults compose with cron, meaningful exit codes compose with `&&`/`||` chains. An agent just makes the cost of skipping any of it visible immediately, instead of visible only to the one person on the team who happens to script against the tool.
