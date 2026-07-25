+++
title = "Mutation testing in Go: getting started with gremlins"
date = "2026-07-25T13:37:41-04:00"
draft = false
description = "The Go companion to the mutmut post: what mutation testing actually measures, how gremlins produces the score, and how to run it against a real Go module in five minutes."
summary = "The Go companion to the mutmut post: what mutation testing actually measures, how gremlins produces the score, and how to run it against a real Go module in five minutes."
tags = ["testing", "go", "mutation-testing", "gremlins", "code-quality"]
categories = ["Code Quality"]
ShowToc = true

[cover]
image = "/images/og/mutation-testing-in-go-getting-started-with-gremlins.png"
hiddenInList = true
hiddenInSingle = true
+++

This is the Go companion to <a href="/posts/mutation-testing-in-python-getting-started-with-mutmut/">*Mutation testing in Python: getting started with mutmut*</a>. Same premise — *coverage tells you where the tests went; mutation testing tells you whether the tests you have would notice if the code were wrong* — different tool, different language, same payoff. If you already read the Python post the fundamentals section here will feel familiar; I've kept it shorter and pointed back to the Python post for the fuller explanation, so this one is entirely readable on its own without being repetitive if you didn't.

The tool is <a href="https://github.com/go-gremlins/gremlins" target="_blank" rel="noopener">gremlins</a>. It wraps `go test` the way mutmut wraps `pytest` — same tests you already run, same fixtures, same build tags — and reports which mutations of your code survived those tests.

## What line coverage doesn't solve, one more time

Line coverage answers a narrow question: *did any test cause this line to execute?* It doesn't ask whether the test would have noticed if the line were **wrong**. The following Go function and test produce 100% coverage while asserting nothing:

```go
func IsAdult(age int) bool {
    return age >= 18
}

func TestIsAdult(t *testing.T) {
    IsAdult(25)
}
```

Every line of `IsAdult` ran. Coverage is a perfect 100%. But the test has no `if got != want`, no `require.Equal`, no assertion of any kind — it would pass if the body were `return false`, `return true`, `return age > 18`, or `return age != 18`. The suite has told you nothing about whether the function is correct.

Real Go suites rarely commit that specific sin outright, but the milder versions of it are everywhere: table-driven tests that arrange a struct and call a method but only assert that the returned error is `nil`; tests that check one branch's outcome but never exercise the boundary between branches; tests that assert `result != nil` instead of `result.Field == "expected"`. Every one of those is a place where the coverage number tells you the line was visited and the assertion doesn't confirm what it did there.

## What mutation testing actually is

Mutation testing asks the inverse question: *if I broke the code, would the tests notice?*

The mechanism is direct. A mutation testing tool takes your source code, applies a small, mechanical change to it — a *mutation* — and reruns the test suite against the changed code.

- If **at least one test now fails**, the mutation was *killed*. Your suite noticed the change.
- If **every test still passes**, the mutation *survived* (gremlins calls this `LIVED`). Your suite would not have noticed if the code had actually looked like that.

The tool then reverts the change, applies a different one, and repeats. Examples of the kinds of edits gremlins applies:

- `a > b` → `a >= b` (and the reverse)
- `a < b` → `a <= b` (and the reverse)
- `if cond` → `if !cond`
- `x + y` → `x - y` (arithmetic base)
- `i++` → `i--` (increment/decrement)
- `-x` → `x` (invert negatives)

Each surviving mutant is a specific, minimal counter-example. It's the tool handing you a version of your code that is **provably wrong** and that your tests **do not object to**. That's what your suite would let ship if a human made the same slip.

The output metric is the **mutation score**: killed mutants divided by total viable mutants, expressed as a percentage. Gremlins reports two related numbers: *test efficacy* (killed / testable) and *mutant coverage* (testable / total mutations); both can be gated in CI, more on that below.

## What mutation testing uncovers — and what it doesn't

Being precise about this matters. Mutation testing measures **the sensitivity of your test suite**. Nothing else. It tells you, empirically:

- **Assertion gaps.** Tests that execute code but don't check the result. If `return 0 → return 1` survives, usually nothing asserts on the return value.
- **Boundary blindness.** Tests that hit both branches of an `if` but never exercise the boundary. If `>= → >` survives, you have no test at the exact edge case.
- **Over-broad assertions.** Tests that check `err == nil` instead of `got == want`. A mutation that silently changes the returned value survives because the assertion accepts any non-error outcome.
- **Dead branches.** Code paths no test reaches at all. Every mutation to a dead branch survives — this is line coverage rediscovering itself as a subset of mutation score.
- **Redundant code.** If mutating a line doesn't change any test outcome and it is not dead code, the line may be doing nothing useful.

It does **not** measure whether the code does the right thing in the first place. If your specification is wrong, mutation testing will still return a perfect score. It measures the tests against the code, not the code against reality. Nor does it grade whether your tests are the right shape (see the earlier post on <a href="/posts/testing-behavior-not-implementation/">black-box vs white-box testing</a>) — a suite of brittle white-box tests can score high while being terrible to live with.

The reason mutation score beats line coverage as a signal isn't that it replaces the specification. It's that it grades your assertions, not your visits. A test that visits a line without asserting on it is worthless; line coverage counts it; mutation testing does not.

## Enter gremlins

<a href="https://github.com/go-gremlins/gremlins" target="_blank" rel="noopener">gremlins</a> is a mutation testing tool for Go, inspired by <a href="https://pitest.org/" target="_blank" rel="noopener">PITest</a> (the Java equivalent). The docs live at <a href="https://gremlins.dev" target="_blank" rel="noopener">gremlins.dev</a>.

A few properties that matter in practice:

- **It runs your real tests.** Whatever `go test` does today, gremlins does — same test files, same fixtures, same build tags. It even takes a `--tags` flag that maps straight through to the `go` toolchain.
- **It only mutates covered code.** This is an important design difference from mutmut. Gremlins first runs `go test` with coverage enabled, then only mutates lines the coverage profile marks as executed. Uncovered lines are reported as `NOT COVERED` and not tested — the tool's argument is that if a mutation is not covered, you already know it will not be caught, so testing it is a waste of runtime. On a healthy Go module this is a large speedup; on one with poor coverage, be aware that the number you're computing is *"score among the code the tests actually reach."*
- **It reports six statuses**: `KILLED`, `LIVED`, `NOT COVERED`, `TIMED OUT`, `NOT VIABLE` (mutation made the build fail — normal and expected), and `RUNNABLE` (dry-run only).
- **It has CI thresholds built in.** `--threshold-efficacy` and `--threshold-mutant-coverage` cause gremlins to exit with a non-zero status if the numbers fall below what you set — exit codes 10 and 11 respectively, distinct so you can tell the two failure modes apart.
- **It has a diff mode.** `--diff origin/main` tests only mutations inside code changed on the current branch. This turns gremlins from *"scan the whole module"* into *"grade the PR I'm about to open,"* which is a much more actionable question.
- **It's honest about scale.** The README says outright that gremlins doesn't work well on very large Go modules — a run can take hours. It's designed for smallish modules, microservices, individual packages. Take that at face value.

## The five-minute getting started

### Install

For most Go setups, `go install` is the shortest path — no separate release artifact to manage, version pin in the command line, upgrades via `go install ...@latest`:

```bash
go install github.com/go-gremlins/gremlins/cmd/gremlins@v0.6.0
```

If you're on macOS and prefer Homebrew, there's a tap:

```bash
brew tap go-gremlins/tap
brew install gremlins
```

For CI runners that need reproducibility without a Go toolchain, use the Docker image:

```bash
docker run --rm -v "$(pwd):/app" -w /app gogremlins/gremlins gremlins unleash .
```

There are also pre-built binaries on the <a href="https://github.com/go-gremlins/gremlins/releases/latest" target="_blank" rel="noopener">releases page</a> — `.deb`, `.rpm`, `.tar.gz`, and `.zip` for Windows — if you want to drop `gremlins` straight into `PATH`.

Note the version pin. Gremlins is still in the `0.x.x` release line, and the maintainers are explicit that flags and configuration files can change between minor releases. If you use it in CI, pin the version and update deliberately rather than trusting `@latest`.

### Point it at your module

The zero-config default just works: from the module root, `gremlins unleash` picks up your `go.mod`, runs `go test` with coverage, and mutates the covered lines.

When you outgrow the defaults, drop a `.gremlins.yaml` in the module root. The complete configuration surface with defaults filled in:

```yaml
silent: false
unleash:
  integration: false          # run "go test ./..." (integration mode) vs per-package
  dry-run: false              # analyze without running mutation tests
  tags: ""                    # build tags — passed through to `go test`
  output: ""                  # write machine-readable JSON report to this file
  diff: ""                    # only test mutants inside diff vs this git ref
  workers: 0                  # 0 = use system CPU count
  threshold:
    efficacy: 0               # 0 = disabled; nonzero = exit code 10 below this %
    mutant-coverage: 0        # 0 = disabled; nonzero = exit code 11 below this %
  exclude-files: []           # regex patterns; matching files are skipped

mutants:
  arithmetic-base:        { enabled: true }
  conditionals-boundary:  { enabled: true }
  conditionals-negation:  { enabled: true }
  increment-decrement:    { enabled: true }
  invert-negatives:       { enabled: true }
  # off by default:
  invert-assignments:      { enabled: false }
  invert-bitwise:          { enabled: false }
  invert-bwassign:         { enabled: false }
  invert-logical:          { enabled: false }
  invert-loopctrl:         { enabled: false }
  remove-self-assignments: { enabled: false }
```

The default-on mutators are the ones the maintainers consider *"almost always the right test to run against Go code."* The default-off ones tend to produce a lot of `NOT VIABLE` noise (they break the build more often than they teach anything) or are aggressive in ways that only make sense for specific codebases. Turn them on once your default-on score is where you want it.

### Run it

```bash
gremlins unleash
```

Aliases: `gremlins run` and `gremlins r` both do the same thing. Go get a coffee. First run is the slow one — gremlins runs your full test suite once to collect coverage, then rebuilds and runs the tests once per mutation. On a small module the whole thing finishes in seconds; on a service-sized module with a few thousand testable mutations, expect minutes to an hour.

The output as it runs is a stream of status lines, one per mutation. When it finishes it prints a summary — how many mutations were killed, lived, uncovered, timed out, not viable — and the two headline percentages (test efficacy and mutant coverage).

You can pare down the output while it runs with `--output-statuses` (short flag `-S`), which takes a string of single-letter codes:

- `l` — LIVED (the interesting ones)
- `c` — NOT COVERED
- `t` — TIMED OUT
- `k` — KILLED
- `v` — NOT VIABLE
- `s` — SKIPPED
- `r` — RUNNABLE (dry-run only)

Most of the time what you want is just the survivors:

```bash
gremlins unleash --output-statuses lc
```

That prints only `LIVED` and `NOT COVERED` mutations as they're found — the two categories you can actually act on.

### Read the output

A typical `LIVED` line looks like this:

```text
         LIVED CONDITIONALS_BOUNDARY at internal/pricing/discount.go:12:5
```

Three things worth naming: the *status* on the left, the *mutator type* (`CONDITIONALS_BOUNDARY`, `ARITHMETIC_BASE`, etc.) in the middle, and the *file:line:column* on the right. Together, they tell you exactly which mutation your tests failed to catch and exactly where — so the next step ("write a test that catches this") is always concrete.

### Kill a mutant

Look at the file:line. Look at the mutator type — the mutator docs at <a href="https://gremlins.dev/latest/usage/mutations/" target="_blank" rel="noopener">gremlins.dev</a> list the exact transformation for each type. Mentally apply that transformation. Ask yourself: *what test would catch this specific change?* Write that test. Rerun gremlins.

Repeat until the `LIVED` list either goes to zero or narrows down to mutations you consciously decide are not worth killing.

## A worked example

Here's the smallest possible payoff. A tiny pricing function and its tests:

```go
// internal/pricing/discount.go
package pricing

func BulkDiscountedTotal(qty int, price float64, threshold int) float64 {
    if qty >= threshold {
        return float64(qty) * price * 0.9
    }
    return float64(qty) * price
}
```

```go
// internal/pricing/discount_test.go
package pricing

import "testing"

func TestBelowThresholdPaysFullPrice(t *testing.T) {
    if got := BulkDiscountedTotal(2, 20.0, 3); got != 40.0 {
        t.Errorf("got %v, want 40.0", got)
    }
}

func TestAtOrAboveThresholdGetsDiscount(t *testing.T) {
    if got := BulkDiscountedTotal(5, 20.0, 3); got != 90.0 {
        t.Errorf("got %v, want 90.0", got)
    }
}
```

Line coverage on `BulkDiscountedTotal` is 100%. Both branches run. Confidence looks good.

Now run gremlins:

```bash
gremlins unleash --output-statuses lc
```

Among the surviving mutants you will almost certainly see:

```text
         LIVED CONDITIONALS_BOUNDARY at internal/pricing/discount.go:5:8
```

The mutator has applied `>= → >` at column 8 of line 5. Neither existing test exercises the boundary — `qty=2` is still below the mutated boundary, and `qty=5` is still above it. Nothing in the suite says *what happens at exactly `qty == threshold`.*

Add a test at the boundary:

```go
func TestExactThresholdGetsDiscount(t *testing.T) {
    if got := BulkDiscountedTotal(3, 20.0, 3); got != 54.0 {
        t.Errorf("got %v, want 54.0", got)
    }
}
```

Rerun gremlins. That mutant now shows up as `KILLED`. You have made a small, provable, permanent improvement to the sensitivity of your test suite — not to the coverage number, which was already 100%, but to the thing you actually cared about: *whether the suite would notice the bug you had not thought to write a test for.*

Scale that loop across a real module and you'll find most survivors cluster in three places: on boundaries, on return-value shape, and on early-return conditions. Each cluster teaches you something specific about how your tests are undertesting the code.

## What to do with the number

The temptation, once you can measure mutation score, is to treat it like line coverage: pick a target, hound the team to hit it, add it to CI as a hard gate. Resist that reflex, or at least approach it slowly.

The good use of the number is **as a signal, not a leash**:

- **On a small module you own end-to-end** — a validator, a pricing rule, a permission check — 90%+ efficacy is achievable and every surviving mutant usually points to a real assertion gap.
- **On a service module with I/O** — HTTP handlers, database adapters, external clients — 70-80% is often the realistic ceiling before you start writing tests that pin implementation detail.
- **On a legacy module you inherited**, run gremlins once and read the survivors as a map of where the previous team wasn't asserting on things. Fix the top ten. That's usually where the real bugs live.

If you do gate in CI, gremlins has this built in. Two flags, two distinct exit codes so you can tell the modes apart:

```bash
# Fail the build if test efficacy drops below 80% (exit code 10)
gremlins unleash --threshold-efficacy 80

# Fail the build if mutant coverage drops below 90% (exit code 11)
gremlins unleash --threshold-mutant-coverage 90
```

The two thresholds measure different things. **Efficacy** is *killed / (killed + lived)* — of the mutations that were tested, what fraction did the suite catch? **Mutant coverage** is *(killed + lived) / total viable mutations* — of the possible mutations, what fraction were even reachable by the tests? A high efficacy with low mutant coverage means *"the tests I have are sharp, but they don't cover much of the code."* A high mutant coverage with low efficacy means *"the tests reach the code but don't assert strongly enough."* Different failures, different fixes.

The safer starting point is to gate on **efficacy only**, at a modest number (60-70%), so the build starts failing when the suite genuinely regresses without demanding heroics from every PR. Ratchet the threshold up over quarters, not sprints.

## Configuring the noise away

On a real module you'll hit two categories of noise: files that shouldn't be mutated at all, and mutator types that produce more `NOT VIABLE` output than useful signal.

**Exclude generated or wrapper files** with `exclude-files` in `.gremlins.yaml` (or `-E` on the command line). The value is a list of regex patterns matched against paths:

```yaml
unleash:
  exclude-files:
    - "_(gen|wrap)\\.go$"    # protoc-gen-go, sqlc, mockgen output
    - "^generated/"          # anything in a generated/ tree
    - "internal/legacy/"     # a module we're not investing in
```

Test files (`*_test.go`) are already excluded by default.

**Toggle mutators** in the `mutants:` section of the config. The default-off mutators (`invert-assignments`, `invert-bitwise`, `invert-logical`, `invert-loopctrl`, and friends) are aggressive by design; on a typical business-logic codebase they mostly produce `NOT VIABLE` (build broken) or trivially-killed mutants. If they're firing a lot of noise for you, either leave them off (the default) or scope them tightly to a single module where they add signal.

## Fitting gremlins into a real workflow

The workflow that has worked for me on Go modules:

1. **First run against a single well-scoped package.** Pick a pure-logic package with good line coverage — the pricing rules, the validation layer, the parser. Run gremlins against it, look at the top ten survivors, kill the ones that are honest gaps. Feel the loop.
2. **Grow the scope one package at a time.** Don't enable it against the whole module on day one; the survivor list will be too long to act on and the exercise will feel like a chore. Add packages as you strengthen them.
3. **Use `--diff` on feature branches.** This is the killer feature for day-to-day use. Running `gremlins unleash --diff origin/main` scopes the mutation testing to code changed on the current branch — you get a per-PR mutation score rather than a whole-module one. It's the difference between *"how healthy is my test suite overall"* and *"do the tests for this change catch the bugs the change could introduce."* The second is the question that maps onto code review.

   ```bash
   gremlins unleash --diff "origin/main"
   ```

   In a GitHub Actions PR job, use `--diff "origin/$GITHUB_BASE_REF"` and check out with `actions/checkout@v4 fetch-depth: 0` so the base branch's history is available for the diff.

4. **Use `--dry-run` for planning.** `gremlins unleash --dry-run` prints every `RUNNABLE` mutation without executing the test suite, so you can see how many mutations gremlins *would* generate before committing an hour to running them all. Useful for estimating the runtime of a full run, or for confirming your `exclude-files` list is doing what you expect.
5. **Cache the coverage profile in CI.** Gremlins runs the test suite with coverage as its first step. If you're already producing a coverage profile elsewhere in CI, threading that in avoids a redundant test run. The `--coverpkg` flag mirrors `go test -coverpkg` and controls which packages the coverage analysis considers.
6. **Be honest about the scale limit.** The maintainers say the tool struggles on very large modules. If your monorepo would take four hours to mutation-test, don't. Run it per-package, or per-service, or on the diff. The goal is a fast, actionable feedback loop — not a whole-repo dashboard.

## The single-sentence version

If you take one thing from this post, take this: **line coverage measures where your tests went; mutation testing measures whether your tests are actually asserting on what they touched.** The first is a floor. The second is the signal you were reaching for when you asked *"are these tests any good?"* And gremlins, like mutmut for Python, produces a concrete, minimally-broken version of your code for every gap it finds — so the fix is always specific, always actionable, and almost always a five-line test away.

Install it. Point it at one package you care about. Look at the first ten `LIVED` mutants. You will learn more about your test suite in the next hour than the coverage report has told you all quarter.
