+++
title = "How the NCAA women's soccer RPI actually works — and why teams pick their opponents carefully"
date = 2026-07-11T21:15:00-04:00
draft = false
summary = "A plain-English walkthrough of the Rating Percentage Index — the three components, the strength-of-schedule feedback loops, why the formula shapes non-conference scheduling decisions across the sport, and why recomputing it is genuinely expensive."
tags = ["ncaa", "soccer", "womens-soccer", "rpi", "sports-analytics"]
categories = ["Sports Data"]
ShowToc = true

[cover]
image = "/images/og/how-the-ncaa-womens-soccer-rpi-actually-works.png"
hiddenInList = true
hiddenInSingle = true
+++

Every fall, in the last weekend of the NCAA women's soccer regular season, a coach somewhere decides not to schedule a non-conference match against a team they'd beat 4–0. Sometimes it's not that they'd lose — it's that even winning would *hurt them*. That decision only makes sense once you understand the RPI.

The Rating Percentage Index is the single most important number the NCAA Division I Women's Soccer Committee looks at when it picks and seeds the 64-team tournament. It's a formula, not an opinion, and the formula has a very particular shape — one that rewards playing higher-RPI opponents even when you lose to them, and quietly penalizes you for beating lower-RPI ones. That asymmetry is where all the interesting behavior comes from.

This post walks through what the RPI actually is, why the strength-of-schedule pieces make it feel almost adversarial, why your own rating can shift for reasons that have nothing to do with your team, and why computing it at scale is genuinely non-trivial.

## What the RPI is trying to measure

RPI is trying to answer a single question: *how good is this team, given who they've played?*

A team that finishes 15–2–1 against nobody is not obviously better than a team that finishes 10–7–1 against the top of the country. Wins and losses in isolation lie. So the RPI takes your record and *inflates or deflates it* based on the quality of the opponents you played, and — more subtly — the quality of the teams *those* opponents played.

The formula the NCAA uses for women's soccer combines three weighted pieces:

```text
Unadjusted RPI = (WP + 2·OWP + OOWP) / 4
```

Which comes out to roughly:

- **25% Winning Percentage (WP)** — your own record.
- **50% Opponents' Winning Percentage (OWP)** — the average record of the teams you played.
- **25% Opponents' Opponents' Winning Percentage (OOWP)** — the average record of the teams your opponents played.

Then a set of small bonus and penalty adjustments get applied on top for non-conference wins and losses against particular RPI-ranked opponents. More on those in a moment.

Notice how heavily the formula leans on other people. Only a quarter of your rating is *what you did*. Half is *who you played*. The last quarter is *who they played*. That's the strength-of-schedule design, and it's deliberate.

## The three components in plain English

### Winning Percentage — with a twist for ties

Your winning percentage is not just wins over games. Since 2024, the NCAA women's soccer formula treats a tie as *one-third of a win*:

```text
WP = (W + (1/3)·T) / (W + L + T)
```

Before 2024, a tie counted as half a win. Moving from 1/2 to 1/3 was a policy choice — it makes ties look more like losses than they used to. Under either version, a penalty-kick tiebreaker in a conference tournament still counts as a tie for RPI purposes; the PK result doesn't change the record.

### Opponents' Winning Percentage — with the biggest asterisk in the formula

For each team you played, take *their* record — but **remove the game they played against you** before computing their winning percentage. Then average those adjusted percentages across all your opponents.

Why remove the game against you? Because otherwise, when a team beats you, their WP goes up partly *because they beat you*, which then makes your OWP go up, which then makes your RPI go up. That's circular. Removing the head-to-head breaks the loop and forces the formula to ask a cleaner question: *how well does this opponent do against everyone else?*

The three cases look like this. Let `OW`, `OL`, `OT` be your opponent's wins, losses, and ties in their full record.

```text
If you beat them:     (OW + (1/2)·OT) / (OW + (OL - 1) + OT)
If you tied them:     (OW + (1/2)·(OT - 1)) / (OW + OL + (OT - 1))
If they beat you:     ((OW - 1) + (1/2)·OT) / ((OW - 1) + OL + OT)
```

Notice ties are weighted at 1/2 here, not 1/3 the way they are in your own WP. That's how the NCAA has always done it — the tie treatment differs between the top-line WP and the opponent-side calculations, and yes, that inconsistency is a known quirk of the formula.

If you played the same team twice (regular season *and* conference tournament, say), each game is counted separately, and each removes itself from that opponent's record when it's your turn to average them in.

### Opponents' Opponents' Winning Percentage — one more layer down

Now do it again, one level deeper. For each of your opponents, compute *their* OWP — the average WP of the teams they played, with the appropriate exclusions. Then average those across your opponents.

That's your OOWP. It's the coarsest signal of the three, which is why it only gets a 25% weight. But it's non-trivial: it's what gives credit to a team that plays a mid-tier opponent whose *own* schedule happened to be brutal. You get a small piece of that difficulty passed through to you.

## The bonus and penalty adjustments (2024+)

On top of the unadjusted RPI, the current formula applies small bonuses for beating higher-RPI non-conference opponents on the road, and small penalties for losing to lower-RPI ones at home. The adjustments only apply to non-conference Division I games — conference games and games against non-D1 opponents get no bonus, no penalty.

The magnitudes are tiny per game, but they're the difference between a `.5820` and a `.5844`, which is often the difference between an at-large bid and a bubble miss.

| Result | Opponent's RPI Rank | Away | Neutral | Home |
|---|---|---|---|---|
| Win | Top 40 | +0.0024 | +0.0022 | +0.0020 |
| Tie | Top 40 | +0.0012 | +0.0010 | +0.0008 |
| Win | 41–80 | +0.0018 | +0.0016 | +0.0014 |
| Tie | Bottom 41–80 | −0.0002 | −0.0004 | −0.0006 |
| Loss | Bottom 41–80 | −0.0015 | −0.0017 | −0.0020 |
| Tie | Bottom 40 | −0.0009 | −0.0011 | −0.0013 |
| Loss | Bottom 40 | −0.0022 | −0.0024 | −0.0026 |

Two things fall out of this table immediately. First, road wins are worth more than home wins — the formula acknowledges that going somewhere and winning is harder. Second, and more importantly for scheduling: **a loss to a bottom-40 RPI opponent at home is roughly the mirror image of a win over a top-40 RPI opponent on the road.** Those cancel out. So if you're a top-25 program and you schedule a home game against an opponent well outside the top RPI tiers, the *upside* is bounded (small bonus, or no bonus at all — that game doesn't fall into any positive row) while the *downside* is a real penalty if anything goes wrong.

## Why the formula shapes non-conference matchups

Coaches at higher-RPI programs are not being dismissive when they turn down a non-conference matchup with an opponent whose RPI sits well below theirs. They're doing math the formula forces on them.

Look at what happens if you're a top-15 RPI program and you schedule an opponent outside the top RPI tiers:

- **If you win** (the expected outcome): your WP ticks up slightly, but your OWP takes a hit, because that opponent's record dilutes the average of the higher-RPI opponents you've otherwise played. The bonus/penalty table probably gives you nothing — the opponent isn't top-80 so no bonus row applies. Net: neutral to slightly negative.
- **If you tie**: your WP takes a hit *and* you eat a penalty from the adjustment table (ties against bottom-40 RPI opponents are penalized). Net: clearly negative.
- **If you lose**: your WP drops, your OWP still doesn't benefit meaningfully, and the adjustment table hits you with the maximum penalty (loss to a bottom-40 RPI opponent). Net: your at-large bid may be in real jeopardy.

Now flip it. Schedule a top-20 RPI opponent instead:

- **If you win**: WP goes up, OWP goes up, and you get a top-40 bonus that's larger if the game was away. Net: strongly positive.
- **If you tie**: WP takes a small hit but OWP still benefits, and the adjustment table gives you a small *bonus* for a tie against a top-40 RPI opponent. Net: mildly positive.
- **If you lose**: your WP drops but your OWP goes up meaningfully (that opponent's record — with the head-to-head removed — still looks strong). No penalty from the table because they're top-40. Net: mildly negative, but nothing like the earlier scenario.

The distribution of outcomes against a top-40 RPI opponent is much better than the distribution against one outside the RPI tiers. That's why the coach turns down the buy-game — the incentives point the same way for every program in that seat, regardless of who's asking.

It's also worth naming the flip side. Programs whose current RPI sits in the middle or lower ranges frequently *want* to play the top-ranked programs, and often can't get a game. Their expected outcome is closer to a tie or a narrow loss, which — against a top-40 RPI opponent — actually helps their own rating. The top-ranked program's rating has no comparable upside from the matchup. That mismatch of incentives isn't a judgment on either program; it's a direct consequence of the formula's shape.

## The immediate mechanic: how a win can lower your RPI the same day

The "your OWP takes a hit" line above deserves its own worked example, because it's the piece of the formula that feels most counter-intuitive at the moment of impact.

Suppose your current OWP sits at `.580` — the average winning percentage of the teams you've played so far this season. You now play a non-conference opponent whose current WP is `.400`, and you win.

Two things happen at the same time to the inputs of your RPI:

- **WP moves up a little.** You added a win to your own ~15-game record. A single win nudges WP up by roughly one game's worth — a small numerator change.
- **OWP moves down, meaningfully.** Your OWP is an *average*. Adding a `.400` datapoint to an average currently sitting at `.580` pulls it downward. Early in the season, when the average is composed of only a handful of opponents, each new datapoint carries more weight, so the pull is larger.

The dominant term in your RPI change is the OWP dip, for two reasons. First, OWP is weighted *twice as heavily* as WP in the formula, so a same-magnitude move in OWP shifts your RPI twice as far as the WP move. Second, the opponent isn't top-80, so the bonus/penalty table adds no positive offset from the win — that entire row of the table doesn't fire.

Add it up and the sum comes out negative. You won the game. Your RPI is lower than it was at kickoff.

This is the moment the scheduling call actually gets made — not the season-end retrospective. When a coach looks at a potential non-conference matchup weeks in advance, they can already see this arithmetic waiting on the other side of the whistle. A win that lowers your RPI is not an edge case or a modeling quirk; it's the ordinary behavior of an average-of-averages when the new datapoint sits below the running mean.

The mirror case is worth naming too. If you're the mid-tier program in the same matchup, the arithmetic runs the other direction — the opponent you play is *above* your current OWP average, so your OWP moves up even in a losing effort. Same formula, same math, different side of the average.

## The retroactive effect: your RPI moves after your season is over

Here is the piece that most fans and even some coaches don't fully internalize: **your RPI on any given Monday depends on games your opponents (and their opponents) played *the previous weekend*, in matches you had nothing to do with.**

Consider a scenario. You're a top-25 team. In week two of the season, you played a non-conference opponent and won 2–1. At the time, that opponent looked solid — they'd started 3–0. You got a nice bump.

Now it's late October. That opponent has since gone 2–10 the rest of the way. Their WP has collapsed. When your OWP is recomputed this week, their contribution to your OWP is much lower than it was in early September. Your RPI has been quietly bleeding for weeks because of a team you played once, months ago.

The reverse also happens. Say you played an unheralded opponent in week three and beat them 3–0. At the time, nobody thought that game did much for you. But that opponent turned out to be a program on the rise — they went 14–2 the rest of the way, won their conference, and finished with a top-40 RPI. Your OWP is now higher than anyone expected, and their contribution to your OOWP (because they played several other quality teams on their way up) also feeds through.

**Your RPI is a lagging function of every remaining game every team you played still has to play.** And the OOWP layer means it's *also* a lagging function of every game every team *those* teams still have to play. It doesn't stabilize until literally the last regular-season game of the last team two hops out from you.

This is why the RPI report the committee looks at is regenerated multiple times a week during the final month. The rankings genuinely move without you playing.

## Why computing RPI at scale is expensive

At first glance, the formula looks like it should be fast. Take 340-ish D1 women's soccer teams, sum some fractions, done. In practice, computing the full RPI table for the entire division is meaningfully more work than it seems.

For each team `t`, computing RPI requires:

1. `t`'s own record — trivial.
2. For each opponent of `t`, that opponent's full season record with the game against `t` excluded — one traversal per opponent, per unique game (double-plays require special handling).
3. For each opponent, that opponent's *own* OWP — which recursively requires walking each opponent-of-opponent's record with the appropriate head-to-head removed.
4. Then the bonus/penalty table needs to be applied, and the table depends on *each opponent's current RPI rank*, which means you need everyone else's RPI to compute yours.

That last point is the real complication. The bonus/penalty adjustments are ranked-relative — a "top-40 opponent" is only definable after every team's RPI has been computed *without* the bonuses, ranked, and then the bonuses layered on top. So the calculation is naturally two-pass: compute the unadjusted RPI for every team, rank, then compute the adjusted RPI using those ranks. Some implementations iterate a second time (recompute ranks after adjustments), which changes results at the margin.

The computational shape is also less friendly than a naive count of teams suggests. A team plays ~18 opponents. Each of those opponents played ~18 opponents. That's ~324 game records to touch per team just for OOWP, times 340 teams, times two passes, plus book-keeping for head-to-head exclusions, home/away/neutral flags, and D1/non-D1 filtering (only D1 opponents count for OWP and OOWP; games against non-D1 teams are dropped from those averages entirely, but *not* from your own WP).

Recomputing everything from scratch after each weekend's matches is the honest way to do it. Incremental updates are possible in principle but treacherous: a single result changing anywhere in the graph propagates two hops out. In practice, most implementations just rebuild the table, cache aggressively, and accept the O(N × avg_opponents²) work. It's not asymptotically bad, but it's plenty of work when the input changes twenty times a week and every downstream tool consumes the output.

If you're building tooling around this — and I did, in [`jk-mcp-ecnl`](https://github.com/jedi-knights/jk-mcp-ecnl) and [`jk-soccer-core`](https://github.com/jedi-knights/jk-soccer-core) — the two easy mistakes to make are forgetting to exclude the head-to-head from OWP, and forgetting that OOWP uses the opponent's OWP *with the appropriate exclusions applied a second time*. Miss either and your numbers will look plausibly correct to a casual eye and be silently wrong.

## What this means if you follow the sport

A few things fall out of all of this that are worth carrying with you the next time you look at a bracket:

- **A team's RPI is a picture of their entire season's environment, not just their season.** When you see two teams with similar records and very different RPIs, the answer is almost always in the OWP and OOWP columns.
- **Non-conference scheduling is strategy, not just calendar filling.** The games you play in August and early September are the ones that give you the biggest lever to move your rating late in the year.
- **A team's RPI can drift after their season ends** — even after conference tournaments, if opponents' opponents are still playing. This is why the tournament selection show happens *after* every conference has finished.
- **The formula rewards courage.** Playing a top-20 RPI opponent on the road is a strictly better decision, in RPI-expectation terms, than playing an opponent outside the top RPI tiers at home, even accounting for the higher chance of losing. That's a design choice, not an accident.

The RPI is not perfect. It's a coarse tool, it doesn't know anything about goal difference, and its bonus table is fussy. But it's transparent, it's reproducible, and once you see the shape of it, a lot of otherwise-puzzling coaching decisions stop being puzzling.

## References

- [Rating Percentage Index formula (Division I women's soccer)](https://sites.google.com/site/rpifordivisioniwomenssoccer/rpi-formula)
- [`jk-mcp-ecnl`](https://github.com/jedi-knights/jk-mcp-ecnl) — my MCP server that computes RPI over live ECNL / ECRL data
- [`jk-soccer-core`](https://github.com/jedi-knights/jk-soccer-core) — the base library where the WP / OWP / OOWP math lives
