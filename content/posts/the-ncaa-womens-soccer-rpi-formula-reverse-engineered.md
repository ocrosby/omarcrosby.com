+++
title = "The NCAA women's soccer RPI formula, reverse-engineered from the rankings"
date = 2026-10-15T10:00:00-04:00
draft = false
summary = "I implemented the published RPI formula and the rankings didn't match NCAA's. A grid search against their published top-25 shows the actual weights are different — opponents' records weigh more, the location bonus is milder, and opponents' records enter the formula without any location adjustment."
tags = ["ncaa", "soccer", "womens-soccer", "rpi", "sports-analytics", "rust"]
categories = ["Sports Data"]
ShowToc = true

[cover]
image = "/images/og/the-ncaa-womens-soccer-rpi-formula-reverse-engineered.png"
hiddenInList = true
hiddenInSingle = true
+++

[In July I wrote about how the NCAA women's soccer RPI actually works][prev] — the three components, the strength-of-schedule feedback loops, why the formula shapes scheduling decisions. Then I actually implemented it, in Rust, against the full 2026 regular season. Then I compared my top-25 to NCAA's published RPI table.

They didn't match. Not off by rounding; off by a lot. Only 4 of 25 teams landed on their NCAA-published rank exactly. Kansas was 7 ranks too high in my output. Duke was 6 too high. Colorado was 7 too low. The team-by-team records matched NCAA's exactly, so this wasn't a data problem — it was a formula problem.

This post is what I did about it, what I found, and what it means in plain English for how NCAA's RPI actually works vs how the formula is usually documented.

[prev]: /posts/how-the-ncaa-womens-soccer-rpi-actually-works/

## The published formula, in constants

If you take the three components from the previous post and look up the numbers people cite for the location adjustment, you get a specific implementation. The commonly-cited numbers are:

```text
RPI = 0.25·AWP + 0.50·OWP + 0.25·OOWP

Location weights for AWP:
  home win → ×0.6     home loss → ×1.4
  away win → ×1.4     away loss → ×0.6
  neutral  → ×1.0     neutral   → ×1.0
```

Those four location multipliers — ×0.6 / ×1.4 / ×1.4 / ×0.6 — appear on every explainer page I've seen about the RPI, including the one in my previous post. And the component weights 25% / 50% / 25% are what the standard "take the weighted mean of three numbers" presentation of the RPI implies.

I plugged all of that in and recomputed. Here's what I got against NCAA's published top-25 (snapshot through 2026-10-13, which is what their table reflected the day I ran this):

| Metric | My output |
|---|---|
| Exactly matching NCAA | 4 / 25 |
| Within 5 ranks of NCAA | 20 / 25 |
| Sum of absolute rank differences | 73 |

Four. That's not "my data is a day out of sync." That's a formula that doesn't produce the rankings everyone cites it as producing.

## What I did next

I treated the formula as a function with four knobs and asked which knob settings reproduce NCAA's rankings most closely.

The knobs are:

1. **Location bonus α.** The home-win weight. If α is the home-win weight, then by symmetry the home-loss weight is 2−α, the away-win weight is 2−α, and the away-loss weight is α. The commonly-cited α is 0.6; that gives you the ×0.6 / ×1.4 pattern.
2. **Component weights (a, b, c)** for WP, OWP, OOWP, with a + b + c = 1. The commonly-cited (a, b, c) is (0.25, 0.50, 0.25).
3. **Whether opponents' records in OWP and OOWP are themselves location-adjusted, or just plain `(W + 0.5·T) / (W + L + T)`.** The published literature is genuinely ambiguous on this.
4. **Everything else held constant** — the DI-only filter, exclusion of head-to-head games from OWP, dedup rules for teams played twice.

I grid-searched α over 0.5 to 0.95 in steps of 0.025, (a, b, c) over the full triangle at 0.01 resolution, and both OWP modes. Each combination produced a top-25 that I scored against NCAA's by: how many exact rank matches, how many within 5, and the sum of absolute rank differences.

That's 9,696 formula variants in the first pass, narrowed to a tighter grid in a second pass to pin the optimum. The whole search finished in a couple of minutes in Python — the formula itself is cheap, there's just a lot of it.

## The result

The best fit is sharp and sits on a wide, stable ridge:

```text
RPI = 0.25·AWP + 0.55·OWP + 0.20·OOWP

Location weights for AWP (α = 0.80):
  home win → ×0.8     home loss → ×1.2
  away win → ×1.2     away loss → ×0.8
  neutral  → ×1.0     neutral   → ×1.0

OWP and OOWP use opponents' plain WP, not location-weighted.
```

The scorecard against NCAA's published top-25 goes from this:

| Formula | Exact | Within 5 | Sum of diffs |
|---|---|---|---|
| Commonly cited (0.25/0.50/0.25, α=0.6, adjusted OWP) | 4 / 25 | 20 / 25 | 73 |
| Fitted (0.25/0.55/0.20, α=0.8, plain OWP) | **12 / 25** | **24 / 25** | **32** |

Three times as many exact rank matches. Half the total rank error. The one team still more than 5 ranks off is Harvard — Ivy League schedules are thin enough that one game's data resolution matters disproportionately for them.

### Robustness

A grid search that pins exactly one combination out of 9,696 is suspicious — the obvious worry is overfitting to 25 ordinal data points. But the optimum isn't a spike. It's a wide, stable plateau: every α between 0.78 and 0.82, paired with OWP weights between 0.54 and 0.57, scores 10 or 11 exact matches. The published (α=0.6, OWP=0.5) is nowhere near the plateau — it's down a cliff. That shape is what you'd see if the fitted numbers reflect something real about how NCAA computes the formula, not something that happens to pattern-match the top-25 I tested on.

## Three things NCAA does differently, in plain language

### 1. Opponents' records enter the formula as plain winning percentages, with no location adjustment

The commonly-cited formula location-adjusts your own winning percentage (that's AWP, the first component). The confusion is about what happens one level out — does the formula also location-adjust *your opponents'* winning percentages when computing OWP?

The fit says no. Opponents enter OWP and OOWP via the plain formula `(wins + 0.5 · ties) / (wins + losses + ties)`. Their home / away split doesn't matter.

That makes sense structurally. The location adjustment is a reward for *your* road play — the formula is saying "this team won on the road, we should give them a nudge." Re-applying that nudge to every schedule you touched would mean a team's rating depends on whether their opponents' *opponents* won their games at home or away, which is three steps removed and starts to feel like noise. Not re-applying it keeps the location signal tight.

Of the three findings, this one is the most confident. Switching OWP from location-adjusted to plain closes most of the gap on its own.

### 2. The location bonus is milder than ×1.4

The ×0.6 / ×1.4 numbers you'll find in every RPI explainer give road wins a 40% boost over home wins. The fit says NCAA's actual numbers are closer to ×0.8 / ×1.2 — a 20% boost. Half the swing.

That's a meaningful difference for teams with lopsided home / away splits. Take Kansas in the 2026 season: 5-0-0 at home, 5-3-1 on the road. Under ×0.6 / ×1.4, Kansas's adjusted winning percentage is `(5·0.6 + 5·1.4 + 0.5·1.4) / (5·0.6 + 5·1.4 + 3·0.6 + 0.5·1.4 + 0.5·0.6) = 10.7 / 12.8 ≈ 0.836`. Under ×0.8 / ×1.2, it's `(5·0.8 + 5·1.2 + 0.5·1.2) / (5·0.8 + 5·1.2 + 3·0.8 + 0.5·1.2 + 0.5·0.8) = 10.6 / 13.0 ≈ 0.815`. The difference, 0.02, propagates through the formula and is enough to move Kansas from my #11 under the published spec to NCAA's actual #18 under the fitted spec.

The intuition: under the published ×1.4, if a team wins everywhere except on the road, the formula punishes them very lightly for the road losses. Under the fitted ×1.2, those road losses are less of a free pass. Which is the behavior you want — road wins should reward you, but road losses shouldn't be waved away.

### 3. Opponents' records are weighted at 55%, not 50%

The published formula puts 50% weight on OWP (your opponents' records) and 25% on OOWP (your opponents' opponents' records). The fit says it's closer to 55% / 20%. OWP goes up five points, OOWP comes down five points. The top-line WP weight stays at 25%.

This change is small in isolation and I'd be cautious reading too much into the exact numbers, but the direction is consistent and robust: OWP matters more than published, OOWP matters less. That's the simpler reading of what's going on — OWP is a direct signal (who you played, how they did), while OOWP is a step removed and genuinely noisier. Weighting the directer signal more and the noisier signal less is, in retrospect, a sensible calibration choice.

## What changed in my rankings

For the teams where my previous implementation disagreed most sharply with NCAA, the fitted weights snap things into alignment:

| Team | Mine, published spec | Mine, fitted spec | NCAA |
|---|---|---|---|
| Kansas | #11 | **#18** | #18 |
| Duke | #11 | **#17** | #17 |
| Stanford | #25 | #13 | #13 |
| Auburn | #14 | **#19** | #19 |
| Xavier | #24 | **#20** | #20 |
| Clemson | #34 | **#21** | #21 |
| Penn State | #32 | **#22** | #22 |

The ones in bold are previously-wrong rankings that landed exactly on NCAA's number with the new weights. Not approximately — exactly.

Kansas and Duke are the two that spent weeks in my "known residual" column during the implementation. The team records matched NCAA. The opponent records matched NCAA. Nothing in the data was wrong. The formula was wrong.

## Honest caveats

Three things to name explicitly, because I'd rather you read this as reverse-engineering than as revelation:

**The fit is against 25 data points.** NCAA's RPI table publishes 349 ranks; I used the top 25 because that's the band that matters for tournament seeding and the band where every rank movement is high-stakes. The plateau width around the optimum makes me confident the fit isn't noise, but 25 is still 25.

**I didn't model the 2024 bonus/penalty table.** The previous post describes an on-top adjustment table that gives small bonuses for beating top-ranked opponents on the road and penalties for losing to low-ranked opponents at home. Those adjustments are at most ~0.03 per team across a full season. It's possible — I can't rule it out — that NCAA actually does use the published 0.25/0.50/0.25 and α=0.6 and the bonus/penalty table, and the apparent "weight shift" in my fit is just the table's net effect compressed into weight space. The ranking match I got says *something* systematic is going on. It doesn't prove which something.

**My ingest is 2 days ahead of NCAA's snapshot.** Their table says "Through Games Oct. 13 2026"; mine includes Oct. 14 and Oct. 15 results. I controlled for this by replaying the fit with an Oct-13 cutoff, which is where the 12/25 exact matches come from. On live data (through Oct 15) the fitted formula hits 11/25 exact — essentially identical.

## What this means if you're building sports data tooling

Two takeaways that I think generalize beyond this one case:

**Verify your formula against the published rankings, not against the published formula.** The "published formula" is a secondhand description of what some committee runs on some data at some cadence. The published rankings are the output of that process. If you can only match one, match the output. A formula that produces the committee's rankings is more useful than one that reproduces the committee's documentation.

**Grid-search the uncertain knobs even when the paper spec is specific.** The paper spec was *very* specific about ×0.6 / ×1.4. Treating those numbers as fixed and spending days hunting data bugs — which I did, before I ran the grid search — was lower-ROI than treating them as approximate and asking the data what they should be. For a formula with 4 degrees of freedom and 25 ordinal targets, grid search finishes in minutes.

For my own [wsoccer-stats](https://github.com/jedi-knights/wsoccer-stats) project, I shipped the fitted weights as the implementation. The commonly-cited numbers were a prior; NCAA's rankings are the evidence; the posterior update is to switch. The old numbers remain documented in-code as the historical baseline so a future reader doesn't come in and "fix" them back to ×0.6 / ×1.4 thinking it was a typo.

## What I'd like to know next

If anyone with access to NCAA's internal RPI code is reading this: I'd love to know whether (a) the actual constants are indeed closer to α=0.8 and (0.25, 0.55, 0.20), or (b) the published 0.25/0.50/0.25 + α=0.6 + bonus/penalty table reproduces the same rankings when the bonus/penalty values are populated correctly. Either answer is useful. The current public documentation is clearly incomplete about one of them.

## References

- [How the NCAA women's soccer RPI actually works][prev] — the previous post this builds on
- [`wsoccer-stats`](https://github.com/jedi-knights/wsoccer-stats) — Rust/Tauri app with the fitted implementation
- [`athletics-ingest-platform`](https://github.com/jedi-knights/athletics-ingest-platform) — scrapes the schedules the fit feeds on
- [Rating Percentage Index formula (Division I women's soccer)](https://sites.google.com/site/rpifordivisioniwomenssoccer/rpi-formula) — one of the explainer pages where the commonly-cited numbers live
