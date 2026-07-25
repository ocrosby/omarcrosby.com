+++
title = "Mutation testing in Rust: getting started with cargo-mutants"
date = "2026-07-25T13:57:47-04:00"
draft = false
description = "The Rust chapter of the mutation-testing series: what the technique measures, why the number is stronger than line coverage, and how to run cargo-mutants against a real Rust crate in five minutes."
summary = "The Rust chapter of the mutation-testing series: what the technique measures, why the number is stronger than line coverage, and how to run cargo-mutants against a real Rust crate in five minutes."
tags = ["testing", "rust", "mutation-testing", "cargo-mutants", "code-quality"]
categories = ["Code Quality"]
ShowToc = true

[cover]
image = "/images/og/mutation-testing-in-rust-getting-started-with-cargo-mutants.png"
hiddenInList = true
hiddenInSingle = true
+++

This closes the three-part getting-started arc on mutation testing, alongside <a href="/posts/mutation-testing-in-python-getting-started-with-mutmut/">the Python post on mutmut</a> and <a href="/posts/mutation-testing-in-go-getting-started-with-gremlins/">the Go post on gremlins</a>. Same premise — *line coverage tells you where the tests went; mutation testing tells you whether the tests you have would notice if the code were wrong* — and, in Rust, the tool of choice is <a href="https://github.com/sourcefrog/cargo-mutants" target="_blank" rel="noopener">cargo-mutants</a> by Martin Pool (the same Martin Pool of `rsync` fame). If you've read either prior post the fundamentals section here will feel familiar; I've kept it tight and pointed back to the Python post for the fuller version. The rest of the post is Rust-and-cargo-mutants-specific — including one mutator category that neither mutmut nor gremlins ships, which turns out to be the most interesting one.

## What line coverage doesn't solve, in Rust

Line coverage answers a narrow question: *did any test cause this line to execute?* It doesn't ask whether the test would have noticed if the line were **wrong**. Here's a Rust function and test that reach 100% line coverage while asserting nothing:

```rust
pub fn is_adult(age: u32) -> bool {
    age >= 18
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_adult() {
        is_adult(25);
    }
}
```

Every line of `is_adult` ran. `cargo tarpaulin` or `cargo llvm-cov` will hand you a perfect 100% coverage number. But there is no `assert_eq!`, no `assert!`, no assertion of any kind — the test would pass if the body were `false`, `true`, `age > 18`, or `age != 18`. The suite has told you nothing about whether the function is correct, only that its bytes ran.

Real Rust suites rarely commit that specific sin outright, but the milder versions are everywhere: `#[test]` functions that call an API and only check `result.is_ok()`, tests that pattern-match on `Some(_)` without inspecting the inner value, tests that hit both arms of an `if` without ever hitting the boundary between them. Each of those is a spot where the coverage number confirms the line was visited and no assertion confirms what it did.

## What mutation testing is, in one paragraph

Mutation testing asks the inverse question: *if I broke the code, would the tests notice?*

A mutation testing tool takes your source, applies a small, mechanical change — a *mutation* — and reruns the test suite against the modified code. If at least one test now fails, the mutation was **caught**. If every test still passes, the mutation is **missed** — your suite would have shipped the broken version. The tool reverts the change, tries another mutation, repeats. Each missed mutation is a specific, minimal, provably-wrong version of your code that your tests do not object to. That is what your suite would let ship if a human made the same slip. The output metric is the mutation score: caught mutants divided by total viable mutants. For deeper background — including the *what does this actually uncover / what does it not* discussion — see the <a href="/posts/mutation-testing-in-python-getting-started-with-mutmut/">Python post</a>; the fundamentals are language-independent.

## Enter cargo-mutants

<a href="https://github.com/sourcefrog/cargo-mutants" target="_blank" rel="noopener">cargo-mutants</a> is a mutation testing tool for Rust. It's installable as a cargo subcommand, runs on stable Rust (no nightly required), and wraps `cargo test` — or `cargo nextest`, if that's what your project uses. The docs live at <a href="https://mutants.rs/" target="_blank" rel="noopener">mutants.rs</a>.

Four properties are worth naming up front, because they meaningfully differ from mutmut and gremlins:

- **Baseline verification.** Before generating a single mutation, cargo-mutants copies your source tree to a scratch directory and runs your tests unmodified. If the baseline fails or hangs, it stops immediately with exit code 4. This prevents the failure mode where a broken suite reports "0% mutation score caught" and looks like the tool is telling you the tests are terrible when actually the tests never ran. Loud failure over silent misreporting — the right default.

- **The `Replace function body with value` mutator.** This is the one that neither mutmut nor gremlins ships in this form, and it's arguably the most illuminating class of mutation for a real codebase. Instead of tweaking an operator, cargo-mutants replaces the entire body of a function with a value guessed from the return type: `()` for unit, `0` and `1` for integers, `true` / `false` for `bool`, `Ok(Default::default())` for `Result`, `Some(...)` / `None` for `Option`, `Vec::new()` and single-element vecs for `Vec<T>`, and so on. What this measures: *would any test fail if this function did nothing / returned a plausible-but-wrong value?* If not, the function is under-tested at the level of "does it actually do its job," not just "are the boundaries checked." That's a different, and often more important, question than what operator mutations answer.

- **`#[mutants::skip]` as an in-source attribute.** Because Rust has real attributes, cargo-mutants uses them for per-item exclusion. Add the tiny `mutants = "0.0.5"` crate as a **regular** (not dev-) dependency, and you can annotate functions, `impl` blocks, `mod`s, or entire files. The attribute has no effect on the compiled code — it only flags the item for cargo-mutants. Prefer the `#[cfg_attr(test, mutants::skip)]` form when you want the attribute to be inert in normal builds; cargo-mutants honors it either way (it doesn't evaluate the `cfg` condition, it just reads the attribute).

- **Missed and timeout are printed by default; caught is silent.** The tool assumes you want to spend your attention on the actionable outputs. `--caught` and `--unviable` opt in to the noisier categories when you want to sanity-check what the tool is doing.

## The five-minute getting started

### Install

The straightforward path — cargo installs from source:

```bash
cargo install --locked cargo-mutants
```

If you'd rather download a pre-built binary (much faster in CI, avoids compiling the crate on the target machine), use <a href="https://github.com/cargo-bins/cargo-binstall" target="_blank" rel="noopener">cargo-binstall</a>:

```bash
cargo binstall cargo-mutants
```

In GitHub Actions, the recommended install uses <a href="https://github.com/taiki-e/install-action" target="_blank" rel="noopener">taiki-e/install-action</a>:

```yaml
- uses: taiki-e/install-action@v2
  with:
    tool: cargo-mutants
```

That grabs a pinned binary from the latest cargo-mutants GitHub release — no cargo compile, no cache warm-up.

### Prerequisites

The tool has a short and honest requirements list:

1. Your tests must **run under `cargo test` or `cargo nextest run`.** Custom test harnesses aren't supported.
2. Your tests must be **non-flaky.** A test suite whose outcome depends on the wall clock, network availability, or thread scheduling produces meaningless mutation results — you'll have caught and missed mutations at random. Fix the flakes first.
3. The tree must build for the host platform. Cross-compilation isn't supported.

### Run it

From your crate root:

```bash
cargo mutants
```

That's the whole command. Go get a coffee. First run is the slow one — cargo-mutants runs the baseline test suite once (the tests unmodified), then generates every mutation it can, and for each: rebuilds the crate, runs the test suite, records the outcome. On a small library the whole thing finishes in a minute or two. On a service-sized crate with a few hundred generated mutations, expect twenty minutes to an hour.

The default output is deliberately quiet — only missed mutants and timeouts print in real time, because those are the actionable ones. A typical line:

```text
src/pricing.rs:12: replace bulk_discounted_total -> f64 with 0.0 ... NOT CAUGHT in 0.6s build + 0.3s test
```

Three things worth naming in that line: the *location* (`src/pricing.rs:12`), the *mutation* (`replace bulk_discounted_total -> f64 with 0.0` — the tool overwrote the whole function body with `0.0`), and the *outcome* (`NOT CAUGHT`). Together they tell you exactly what edit went in, exactly where, and exactly which test would have needed to fail. So the next step (*"write a test that catches this"*) is always concrete.

At the end you get a summary:

```text
14 mutants tested in 0:08: 2 missed, 9 caught, 3 unviable
```

The four outcomes:

- **caught** — a test failed with the mutation applied. Good sign.
- **missed** — every test still passed. This is the interesting bucket — an actionable gap.
- **unviable** — the mutation doesn't compile. Inconclusive; no action needed.
- **timeout** — the mutation caused the tests to hang until the timeout killed them. Sometimes this points at a real gap (the tests didn't assert enough to fail fast); sometimes it points at a function where a mutation naturally causes an infinite loop and should be skipped.

### Read the mutants.out directory

While it runs, cargo-mutants writes to a `mutants.out/` directory in the crate root:

- `outcomes.json` — the full, machine-readable results
- `caught.txt`, `missed.txt`, `timeout.txt`, `unviable.txt` — plain-text lists per bucket
- `diff/` — one diff file per mutation, showing exactly what changed
- `logs/` — one log file per mutation, containing the mutation diff plus the full cargo output

Add `/mutants.out*` to your `.gitignore` (the `*` covers both `mutants.out` and `mutants.out.old`, which is kept as the previous run's results). No reason to commit this.

### Kill a mutant

Look at a line from `missed.txt`. Look at the diff in `mutants.out/diff/`. Ask yourself: *what test would catch this specific change?* Add that test. Rerun `cargo mutants` — or better, rerun just the affected mutant with `cargo mutants --re 'bulk_discounted_total'` to skip the rest. Repeat until the missed list either goes to zero or shrinks to mutations you consciously decide aren't worth killing.

The <a href="https://mutants.rs/" target="_blank" rel="noopener">user guide's advice on this loop</a> is worth quoting: *"the right thing here is not necessarily to directly assert that the mutated behavior doesn't happen [...] instead write tests that assert the correct behavior at the right level of abstraction, preferably through a public interface."* A mutant is an *example* of what could be wrong; the test should assert what should be right. This is the same design pressure the <a href="/posts/testing-behavior-not-implementation/">black-box testing post</a> makes.

## A worked example

Here's the smallest possible payoff — same shape as the Python and Go versions, so you can see the pattern land in a third language.

```rust
// src/pricing.rs

pub fn bulk_discounted_total(qty: u32, price: f64, threshold: u32) -> f64 {
    if qty >= threshold {
        f64::from(qty) * price * 0.9
    } else {
        f64::from(qty) * price
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn below_threshold_pays_full_price() {
        assert_eq!(bulk_discounted_total(2, 20.0, 3), 40.0);
    }

    #[test]
    fn at_or_above_threshold_gets_discount() {
        assert_eq!(bulk_discounted_total(5, 20.0, 3), 90.0);
    }
}
```

Line coverage is 100%. Both branches run.

Run `cargo mutants` and, among the missed mutants, you will almost certainly see two:

```text
src/pricing.rs:4: replace > with == in bulk_discounted_total ... NOT CAUGHT
src/pricing.rs:4: replace >= with > in bulk_discounted_total ... NOT CAUGHT
```

(cargo-mutants replaces `>=` with `>` from its binary-operator table; it also tries other replacements on `>=`. The exact set depends on the current release.)

The `>= → >` mutation moves the boundary in by one. Neither existing test exercises the boundary — `qty=2` is still below the mutated threshold, and `qty=5` is still above it. Nothing in the suite says *what happens at exactly `qty == threshold`.* Add a test at the boundary:

```rust
#[test]
fn exact_threshold_gets_discount() {
    assert_eq!(bulk_discounted_total(3, 20.0, 3), 54.0);
}
```

Rerun cargo-mutants. That mutant now shows up as `caught`.

And now the interesting one — the *function-body replacement* mutation that only cargo-mutants generates:

```text
src/pricing.rs:3: replace bulk_discounted_total -> f64 with 0.0 ... NOT CAUGHT
```

This mutation replaced the entire function body with `0.0`. The tests catch it — `40.0 != 0.0` and `90.0 != 0.0` — so it shows as caught here. But imagine a function returning `Result<Something, Error>` where every test only asserts `result.is_ok()`. cargo-mutants would replace the body with `Ok(Default::default())`, every `is_ok()` assertion would still pass, and the mutant would come back `NOT CAUGHT`. That's the finding you almost never notice yourself and almost never get from operator mutations alone: *my tests would pass if this function did essentially nothing.* Fix by asserting on the inner value, not just on the presence of `Ok`.

## What to do with the number

cargo-mutants exits with a code you can gate on in CI:

- `0` — every viable mutant was caught. Ship it.
- `2` — some mutants were missed.
- `3` — some mutants timed out.
- `4` — baseline tests already failed. The tool never ran. Fix the suite.
- `5`, `6` — problems with the `--in-diff` argument.

That's the CI gate: run `cargo mutants`, check the exit code, fail the build on non-zero. The `--in-place` flag skips the source-tree copy step (which is safe in CI, where the checkout is disposable) and is the maintainer's explicit recommendation:

```bash
cargo mutants -vV --in-place
```

The general shape of the guidance from the other two posts applies here too — treat the number as a signal, not a leash. High mutation-test discipline pays off on pure-logic crates (parsers, validators, pricing, permission checks) where 90%+ caught rates are achievable. On crates dominated by I/O adapters and framework glue, aim lower and expect a natural ceiling before you start writing implementation-pinning tests. Gate on the exit code, not on a percentage; ratchet the strictness up over quarters, not sprints.

## Configuring the noise away

Two skip mechanisms — attributes for per-item exclusion, config file for per-crate.

**In-source attributes** require adding the `mutants` crate as a regular dependency:

```toml
# Cargo.toml
[dependencies]
mutants = "0.0.5"
```

Then annotate the item:

```rust
use std::time::{Duration, Instant};

/// Returns true if the program should stop.
#[cfg_attr(test, mutants::skip)] // returning `false` here causes a hang
fn should_stop() -> bool {
    true
}
```

The `cfg_attr(test, ...)` wrapper is the tidy form — the attribute is a no-op in normal builds and only surfaces during cargo-mutants runs. The attribute can go on functions, `impl` blocks, `mod`s, individual expressions, or the whole file (as `#![mutants::skip]`). Add a comment explaining why the skip is there — future readers will not remember.

For finer control there's `#[mutants::exclude_re("pattern")]`, which drops only the mutations whose full name matches a regex, so you can keep the informative mutants on a function while dropping the ones you've decided aren't worth killing:

```rust
#[mutants::exclude_re("with 0")]  // don't test "replace ... -> i32 with 0"
fn compute(a: i32, b: i32) -> i32 {
    a + b
}
```

**Config file** lives at `.cargo/mutants.toml` in the crate root:

```toml
# Skip entire modules that we've deliberately decided not to mutation-test.
exclude_globs = [
    "src/main.rs",
    "src/generated/*.rs",
]

# Skip specific mutant categories across the whole crate.
exclude_re = [
    "impl Debug",              # Debug implementations
    "impl Display",            # Display implementations
]

# If your crate uses anyhow, teach cargo-mutants how to construct an Err
# so it can generate `Err(...)` mutations from Result-returning functions.
error_values = ["::anyhow::anyhow!(\"mutated\")"]
```

That last one is worth a callout. cargo-mutants by default generates `Ok(...)` mutations from `Result`-returning functions (does the test notice if the function silently succeeds?). To *also* test the `Err(...)` side (does the test notice if the function silently fails?), you have to tell cargo-mutants how to construct an error value for your crate — because the tool doesn't know your error type. Set `error_values` in the config file, and you get a whole additional class of mutation checking coverage of the error paths.

The tool's automatic exclusions cover most sensible defaults out of the box: test functions, `#[cfg(test)]` items, `#[mutants::skip]`, and `unsafe` functions are all skipped by default.

## Fitting cargo-mutants into a real workflow

1. **First run against a single crate with good line coverage.** Pick a pure-logic crate — a parser, a validator, a pricing rule. Run `cargo mutants` on it, look at the top ten missed mutants, kill the ones that are honest gaps. Feel the loop before scaling up.
2. **Use `--in-diff` on feature branches.** Same shape as gremlins' `--diff`: `cargo mutants --in-diff <(git diff origin/main)` tests only mutants that overlap with the changed code, turning a full-crate run into a per-PR check. Much faster feedback, and it maps directly onto code review.
3. **Use `--in-place` in CI.** Skips the source-tree copy step. The maintainer recommends it explicitly.
4. **Gate the CI job on the exit code.** No percentage-target math — non-zero means missed mutants, and the failure output tells you exactly which and where.
5. **Upload `mutants.out/` as an artifact.** So contributors can look at the diffs and logs without re-running the whole thing locally. The GitHub Actions example in <a href="https://mutants.rs/ci.html" target="_blank" rel="noopener">the manual</a> shows this end-to-end.
6. **Turn on `error_values` once the baseline is green.** It's a strict extension — every existing check keeps working, plus you now catch the "test only asserts on Ok" failure class.

Here's the CI shape distilled from the manual, adjusted to what I'd actually reach for:

```yaml
name: cargo-mutants
on:
  push:
    branches: [main]
  pull_request:
    paths:
      - ".cargo/mutants.toml"
      - "Cargo.*"
      - "src/**"
      - "tests/**"

jobs:
  cargo-mutants:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }  # needed for --in-diff against origin/main
      - uses: taiki-e/install-action@v2
        with: { tool: cargo-mutants }
      - run: cargo mutants -vV --in-place --in-diff <(git diff origin/main)
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: mutants-out
          path: mutants.out
```

That's a per-PR incremental gate, artifact upload for post-mortem, and no config gymnastics.

## The single-sentence version

If you take one thing from this post, take this: **line coverage measures where your tests went; mutation testing measures whether your tests are actually asserting on what they touched.** cargo-mutants adds one more thing beyond that: because it can replace an entire function body with a plausible-but-wrong value, it catches the failure mode where your tests fire, run, and check *something* — but not the something that would tell you the function was replaced with a stub. That's the version of *"are these tests any good?"* you almost never get from operator mutation alone.

Install it. Point it at one crate you care about. Look at the first ten missed mutants and the first `replace ... -> Result<T> with Ok(Default::default())` line in there. You will learn more about your test suite in the next hour than the coverage report has told you all quarter.
