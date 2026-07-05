+++
title = "kyber: function-level code quality analysis for Go"
date = 2026-07-05T08:00:00-04:00
draft = false
summary = "Existing Go linters tell you which lines break a rule. kyber tells you which functions carry the most risk, using twelve metrics — McCabe, cognitive, Halstead, maintainability index, and structural signals — in one pipeline."
tags = ["go", "static-analysis", "code-quality", "complexity-metrics", "sarif"]
ShowToc = true
+++

There's a whole category of code-quality question that Go's existing linters don't answer. `golangci-lint`, `gocyclo`, and `revive` are all rule-oriented — you configure a threshold, they flag every line that crosses it, and everything else is invisible. That's the right shape for enforcing style. It is not the right shape for asking *which functions in this package are healthy, which are mediocre, and which are risky*, because health is a distribution, not a rule.

[kyber](https://github.com/jedi-knights/kyber) is a function-level Go code-quality analyzer that leans into that distinction. It walks a codebase, parses every function, and scores each one against a registered set of metrics — twelve of them at the moment — then reports per-function values, per-package means, and an overall mean. Output is human-readable text, JSON, or SARIF 2.1.0 for GitHub code scanning.

## Rule violations vs. function quality

`gocyclo` gives you a list: here are the eight functions with cyclomatic complexity above 15. That's useful. What it doesn't give you is the shape of the distribution — how many functions sit at 12 or 13, what the median looks like, whether the mean is drifting up over time, whether the risky functions cluster in one package or scatter across the codebase.

That's the gap kyber is trying to close. Every function gets a row. Every metric gets a column. Every package and the whole report get a mean line at the bottom. You can read the aggregate without piping through `jq`, and you can read the outliers without losing sight of the middle.

```text
                         mi cog cyc   diff     effrt fln      hal nst npth  read ret   tst
  New                 88.41   0   1      6    259.11   1    43.19   1    1  0.68   1  0.99
  GoAST.ParseFiles   51.03!   5   5 20.14! 14073.98!  18   698.81   3   12 0.31!   4 0.53!
```

The `!` marks a threshold cross. The header row is deliberately compact — `mi`, `cog`, `cyc`, `diff`, `effrt`, `fln`, `hal`, `nst`, `npth`, `read`, `ret`, `tst` — because you'll be reading twelve columns per function and short labels win.

## The metric families

The twelve metrics fall into four groups, and the point of running all of them at once is that they measure different things. Cyclomatic complexity can miss what cognitive complexity catches. Halstead Volume can flag a straight-line function that cyclomatic doesn't see. The composite scores (readability, testability) catch drift the individual metrics don't. You want the triangulation.

### Control-flow complexity

Three metrics answer *how many ways can control flow through this function*:

- **Cyclomatic** (McCabe, 1976) counts decision points. One for every `if`, `for`, `range`, non-default `case`, and short-circuit boolean operator. It's the metric everyone knows and the least discriminating — a flat function with seven `if`s scores the same as one with seven-deep nesting.
- **Cognitive** (SonarSource, 2018) weights control structures by nesting depth. Deep branching costs more than sequential branching. When cognitive is much higher than cyclomatic on the same function — say cyclomatic 4, cognitive 10 — that's the specific case it was designed to catch: hard-to-follow nested logic.
- **NPath** (Nejmeh, 1988) counts acyclic execution paths — but multiplicatively. Three sequential `if-else` blocks aren't 3 paths, they're 2 × 2 × 2 = 8. The number explodes fast, which is the point: NPath flags stacking that cyclomatic and cognitive can miss.

If a function is fine on cyclomatic but bad on cognitive, refactor the nesting. If it's fine on cognitive but bad on NPath, split the decision stacks. The three metrics agree in the easy cases and disagree in the interesting ones.

### Information content

Halstead's family (1977) treats source code as a bag of operators and operands:

- **Volume** — `V = N × log₂(n)`. Roughly proportional to information content. Catches long, dense, straight-line functions that cyclomatic gives a free pass to.
- **Difficulty** — `D = (n1 / 2) × (N2 / n2)`. High when many distinct operators act on a small operand vocabulary. Two functions can have similar Volume and very different Difficulty.
- **Effort** — `E = D × V`. The single most actionable Halstead number, because it composes density and total content into one signal.

Halstead metrics are the ones people love to argue about, but they consistently flag functions that the control-flow metrics silently approve of — the classic being a long cobra command builder that has cyclomatic 1 and Halstead Effort in the tens of thousands.

### Structural signals

The middle group is unglamorous and important:

- **Function length** (Fowler) — non-blank, non-comment body lines. Default flag at 40.
- **Maximum nesting depth** (ESLint's `max-depth` at 4).
- **Return statement count** (Dijkstra's early-returns debate at 4).

None of these are subtle. All of them correlate with everything else. Their job in the pipeline is to catch the obvious cases cheaply — you don't need Halstead to tell you a 300-line function is a problem.

### Composite scores

Two 0–1 scores made from weighted sub-signals:

- **Readability** — length, nesting depth, median identifier length (loop indices excluded), and comment density.
- **Testability** — parameter count, side effects (I/O calls and global reads), fraction of interface-typed parameters, and length.

These are heuristic. Buse & Weimer's [readability paper (2010)](https://doi.org/10.1109/TSE.2009.70) trained weights against human ratings; kyber's weights are hand-picked and deliberately simple. Read them as "watch the trend" signals, not as ground truth. A tiny utility function scoring low on readability because it has single-letter loop variables and no comments is not a bug in your function — it's a limit of the metric. Trust the *package-mean* trend more than any single function's value.

### Maintainability index

**MI** (Coleman et al., 1994; Visual Studio normalization) is the one composite that ships as a single number. It combines Volume, cyclomatic, and effective LOC into a 0–100 score where higher is better. It's the only metric in the set where "higher is better", and it's the one kyber promotes to the leftmost column of every table for exactly that reason — it's the fastest way to eyeball whether a function is broadly healthy.

Green ≥ 65, yellow 50–64, red < 50 is the Visual Studio convention. A single function below 65 isn't a fire. A whole *package mean* below 65 is.

## The point of running all twelve

Any one metric is easy to game or misinterpret. Twelve metrics running on the same AST walk, in the same pipeline, give you an escape hatch: when three or four independent measures agree that a function is a problem, that's a lot harder to dismiss than one number crossing one threshold.

That's the piece I think matters most about how kyber is put together. It's not a competition between metrics — it's an ensemble. The `[PACKAGE MEANS]` and `[OVERALL]` rows are the concrete version of this: you get to see whether one metric is skewing high across a package (which is a design signal) versus whether many metrics agree the package is dense (which is a refactoring signal).

## The design decision that keeps this honest

Under the hood, kyber is built around one `Metric` interface. Adding a new metric — say, parameter count, or fan-out — is one new file in [`internal/domain/metrics/`](https://github.com/jedi-knights/kyber/tree/main/internal/domain/metrics) and one line of registration. That's it. No changes to the CLI, no changes to the output layer, no changes to the aggregation logic.

The reason this matters isn't extensibility for its own sake — it's that a code-quality tool that's hard to extend eventually calcifies around whatever its original author thought was important. If you can't add "fan-out" or "parameter count" or "cognitive complexity of the largest branch" in an afternoon, you'll stop trying, and the metric set will stop reflecting what the team actually cares about.

## Delivery: CLI, JSON, SARIF

Three output shapes cover the three consumption modes:

- **Text** at the terminal — the aligned table with `!` markers, plus the package and overall means.
- **JSON** for anything programmatic — the full metric IDs (not the short labels), plus `min`/`max`/`count`/`mean` aggregates.
- **SARIF 2.1.0** for GitHub code scanning — findings become PR annotations and repo-level code-scanning items.

```bash
# Fail CI if any function exceeds its threshold
kyber analyze --fail-on-threshold ./...

# Emit SARIF for GitHub code scanning
kyber analyze --format=sarif -o kyber.sarif ./...

# Focus on one column at a time
kyber analyze --metric=cyclomatic ./...
```

Findings escalate to **error** severity at ≥ 2× threshold. In text that's still just `!`; JSON and SARIF distinguish warning from error, which matters for how GitHub renders them.

## Configuration is per-metric

`kyber.toml` at the repo root. Every metric can be disabled, its threshold changed, and — for the two composite scores — its sub-signal weights tuned:

```toml
[metrics.cyclomatic]
threshold = 10          # relaxed from the default 7

[metrics.testability]
weight_side_effects = 2 # care more about I/O than parameter count
```

CLI flags win over environment variables, which win over `kyber.toml`, which wins over built-in defaults. The full reference is in the [README](https://github.com/jedi-knights/kyber#configuration).

## Where it fits in a workflow

Two places, mostly:

1. **Local, during refactoring.** Run `kyber analyze ./...` before and after. Watch the package-mean row. The individual outliers tell you where to look; the means tell you whether the refactor made things better overall or just moved the complexity somewhere else.
2. **CI, as a gate.** `--fail-on-threshold` for hard gates, or SARIF upload for advisory annotations. The advisory path is the more useful default — hard gates on twelve metrics at once are how good tools get disabled.

## Where to find it

- **Repo:** [github.com/jedi-knights/kyber](https://github.com/jedi-knights/kyber)
- **Metrics documentation:** [`internal/domain/metrics/README.md`](https://github.com/jedi-knights/kyber/blob/main/internal/domain/metrics/README.md)
- **McCabe (1976):** [*A Complexity Measure*](https://en.wikipedia.org/wiki/Cyclomatic_complexity)
- **Campbell (2018):** [Cognitive Complexity white paper (PDF)](https://www.sonarsource.com/docs/CognitiveComplexity.pdf)
- **Nejmeh (1988):** [*NPATH: A measure of execution path complexity*](https://doi.org/10.1145/42372.42379)
- **Halstead (1977):** [*Elements of Software Science*](https://en.wikipedia.org/wiki/Halstead_complexity_measures)
- **Coleman et al. (1994):** [Maintainability Index range and meaning](https://learn.microsoft.com/en-us/visualstudio/code-quality/code-metrics-maintainability-index-range-and-meaning)
- **Buse & Weimer (2010):** [*A metric for software readability*](https://doi.org/10.1109/TSE.2009.70)
