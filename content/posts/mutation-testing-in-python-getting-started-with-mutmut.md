+++
title = "Mutation testing in Python: getting started with mutmut"
date = "2026-07-25T10:50:15-04:00"
draft = false
description = "Line coverage tells you where the tests went. Mutation testing tells you whether the tests you have would notice if the code were wrong. A plain-language getting-started guide with mutmut."
summary = "Line coverage tells you where the tests went. Mutation testing tells you whether the tests you have would notice if the code were wrong. A plain-language getting-started guide with mutmut."
tags = ["testing", "python", "mutation-testing", "mutmut", "code-quality"]
categories = ["Code Quality"]
ShowToc = true

[cover]
image = "/images/og/mutation-testing-in-python-getting-started-with-mutmut.png"
hiddenInList = true
hiddenInSingle = true
+++

The previous post closed on a line I owe a receipt for: *coverage tells you where the tests haven't been; mutation score tells you whether the tests you have are checking anything.* This post is the receipt. It explains what mutation testing actually is in plain language, why the number it produces is a stronger signal than line coverage, and how to run it on real Python code with <a href="https://github.com/boxed/mutmut" target="_blank" rel="noopener">mutmut</a> from scratch. No prior exposure assumed.

The follow-on question after the earlier post — *"my suite is 92% covered, are the tests good?"* — has a real answer, and mutation testing is the tool that gives it to you. If you've ever shipped a change and thought *"weird, the tests passed, but nothing would have caught this,"* this is the missing loop.

## The problem line coverage doesn't solve

Line coverage answers a narrow question: *did any test cause this line to execute?* It doesn't ask whether the test would have noticed if the line were **wrong**. Those two questions sound similar. They aren't.

Here's a function and a test that produces 100% line coverage while proving nothing:

```python
def is_adult(age: int) -> bool:
    return age >= 18

def test_is_adult():
    is_adult(25)
```

Every line of `is_adult` ran. Coverage is a perfect 100%. But there is no `assert` — the test would pass if the function were `return False`, `return True`, `return age > 18`, or `return age != 18`. The suite has told you nothing about the correctness of the code it "covered."

Real production suites rarely commit that specific sin, but they commit subtler versions of it constantly. A test that arranges an object, calls a method, and asserts *"no exception was raised"* covers every line the method touched — and would keep passing if the return value silently flipped to garbage. A test that asserts one branch's outcome but never exercises the boundary between branches covers both branches by line count but would miss an off-by-one error at the boundary.

Line coverage is a floor, not a signal. It tells you where the tests have not been. It does not tell you whether the tests you have would catch a bug.

## What mutation testing is, exactly

Mutation testing asks the inverse question: *if I broke the code, would the tests notice?*

The mechanism is direct. A mutation testing tool takes your source code, applies a small change to it — a *mutation* — and reruns the test suite against the changed code.

- If **at least one test now fails**, the mutation was *killed*. Your suite noticed the change.
- If **every test still passes**, the mutation *survived*. Your suite would not have noticed if the code had actually looked like that.

The tool then reverts the change, applies a different one, and repeats. The mutations are small and mechanical, generated automatically. Examples of the kinds of edits mutmut applies:

- `x + y` → `x - y`
- `age >= 18` → `age > 18`
- `if cond:` → `if not cond:`
- `return 0` → `return 1`
- `break` → `continue`
- A number literal is nudged by one: `5` → `6`
- A string literal is wrapped in a marker so any comparison against it fails

Each surviving mutant is a specific, minimal counter-example. It's the tool handing you a version of your code that is **provably wrong** and that your tests **do not object to**. That's what your test suite would let ship if a human made the same slip.

The output metric is the **mutation score**: killed mutants divided by total viable mutants, expressed as a percentage. A mutation score of 80% means four out of every five sneaky edits to your production code would have been caught. A score of 40% means three out of five would have gone through unnoticed.

## What mutation testing uncovers — and what it doesn't

Being precise about this matters, because the failure mode of every code-quality metric is that people optimize the number and forget what the number was for.

**Mutation testing measures the sensitivity of your test suite.** Nothing else. It tells you, empirically:

- **Assertion gaps.** Tests that execute code but do not check the result. A `return 0 → return 1` mutation that survives usually means nothing asserts on the return value.
- **Boundary blindness.** Tests that hit both branches of an `if` but never exercise the boundary. A `>= → >` mutation that survives says *"you have no test at the exact edge case."*
- **Over-broad assertions.** Tests that check `result is not None` instead of `result == expected`. A mutation that changes the returned value survives because the assertion accepts any non-None value.
- **Dead branches.** Code paths no test reaches at all. Every mutation to a dead branch survives — this is line coverage rediscovering itself as a subset of mutation score.
- **Redundant code.** If mutating a line does not change any test outcome and it is not dead code, the line may be doing nothing useful. Sometimes it's a genuine bug in the code (the branch is unreachable); more often it's a design smell.

**Mutation testing does not measure:**

- Whether the code does the right thing in the first place. If your specification is wrong, mutation testing will still give you 100%. It measures *the tests against the code*, not *the code against reality*.
- Whether the code is well designed, readable, or performant.
- Whether the tests are the right shape (see the previous post on <a href="/posts/testing-behavior-not-implementation/">black-box vs white-box</a>) — a suite of brittle white-box tests can score high while being terrible to live with.

The reason mutation score is a stronger signal than line coverage is not that it replaces the specification. It's that it grades your assertions, not your visits. A test that visits a line without asserting on it is worthless; line coverage counts it; mutation testing does not. That single distinction is what closes the gap between "the CI badge is green" and "I trust this suite."

## Enter mutmut

<a href="https://github.com/boxed/mutmut" target="_blank" rel="noopener">mutmut</a> is a mutation testing tool for Python by Anders Hovmöller. Version 3, the current line, focuses on mutating functions and offers a workflow that emphasizes iteration: you can stop it mid-run, come back later, and it resumes where it left off. The tool runs your existing `pytest` suite against each mutated copy of your code and reports which mutants survived.

A few properties that matter in practice:

- **It runs your real tests.** No parallel test harness to maintain. Whatever `pytest` does today, mutmut does — same fixtures, same plugins, same conftest.
- **It is incremental.** Mutmut remembers what it has already tested and what changed since. A rerun after a code change only re-tests the affected functions.
- **It is fork-based.** Mutmut requires a system with `fork()` support. On macOS and Linux it just works. On Windows you must run it inside WSL.
- **It has an interactive UI.** `mutmut browse` gives you a terminal UI for walking through surviving mutants, viewing them as diffs, and re-running individual mutants after you strengthen a test.

## The five-minute getting started

I'll walk through the smallest possible loop against a toy module, then talk about what to do with the output on a real codebase.

### Install

```bash
pip install mutmut
# or, with uv:
uv add --dev mutmut
```

On macOS you may see a build error about `libcst` needing a Rust compiler. That's a wheel-availability thing for some architectures; installing the Rust toolchain via <a href="https://www.rust-lang.org/tools/install" target="_blank" rel="noopener">rustup</a> and retrying the install fixes it. On Linux and Apple Silicon it usually just works.

### Point it at your code

For most projects the zero-config default works: mutmut runs `pytest` and infers where your source code lives. If it guesses wrong or you have a `src/` layout, tell it explicitly. In `pyproject.toml`:

```toml
[tool.mutmut]
source_paths = ["src/"]
pytest_add_cli_args_test_selection = ["tests/"]
```

The `pytest_add_cli_args_test_selection` line tells mutmut which tests to run against each mutant — it is deliberately separate from your normal pytest arguments so mutmut can select subsets efficiently.

The equivalent `setup.cfg` if that's what your project uses:

```ini
[mutmut]
source_paths=src/
pytest_add_cli_args_test_selection=tests/
```

### Run it

```bash
mutmut run
```

Go get a coffee. The first run is the slow one — mutmut has to try every generated mutant against your test suite. On a small module the whole thing finishes in seconds. On a real service with a few thousand mutants and a slow test suite, the first full pass can take minutes to hours.

You can stop it at any point with `Ctrl-C`. Mutmut records progress as it goes; the next `mutmut run` picks up where you left off.

### Browse the survivors

```bash
mutmut browse
```

This opens an interactive terminal UI listing every mutation, grouped by module and function. Surviving mutants are the interesting ones — those are the specific edits your tests failed to catch. You can see the diff of each survivor and view the source it modified.

Key shortcuts in the browse UI:

- `r` — retest the currently selected mutant (use this after strengthening a test)
- `f` — retest every mutant in the current function
- `m` — retest every mutant in the current module
- `a` — apply the mutant to disk (writes the mutated code into your source tree)

That last one is worth pausing on. `mutmut apply` (or the `a` key in the browse UI) writes a surviving mutant to your source tree so you can run your tests against it directly, poke at it in the debugger, or use it as a template for writing a new test. **Do this only on a clean git working tree** — the applied mutant is a real edit to your source file, and if you forget to revert it you will commit broken code. The README says this in bold, and it earns the emphasis.

### Kill a mutant

Pick a survivor. Read the diff. Ask yourself: *what test would catch this?* Write that test. Run `mutmut browse`, select the mutant, press `r`. If it's dead, move on. If it still lives, your new test isn't tight enough — usually because it asserts on something too weak.

Repeat until the survivor list either goes to zero or narrows down to mutations you consciously decide are not worth killing (more on that below). That loop — surface a specific weakness, write the specific test, verify — is the core value of the tool.

## A worked example

Here's the simplest possible payoff. A tiny discount function and a passing test:

```python
# src/pricing.py
def bulk_discount(qty: int, price: float, threshold: int = 3) -> float:
    if qty >= threshold:
        return qty * price * 0.9
    return qty * price
```

```python
# tests/test_pricing.py
from pricing import bulk_discount

def test_below_threshold_pays_full_price():
    assert bulk_discount(qty=2, price=20.0) == 40.0

def test_at_or_above_threshold_gets_discount():
    assert bulk_discount(qty=5, price=20.0) == 90.0
```

Line coverage on `bulk_discount` is 100%. Both branches run. Confidence looks good.

Now run mutmut. Among the surviving mutants you'll almost certainly see:

- `if qty >= threshold:` → `if qty > threshold:` — **survives.** Neither test exercises the boundary case (`qty == threshold`). The mutation moves the boundary in by one, and both tests still pass: `qty=2` is still below the new boundary, and `qty=5` is still above it. Nothing here says *what happens at exactly `qty=3`.*
- `return qty * price * 0.9` → `return qty * price * 1.9` — **killed.** The second test's assertion (`== 90.0`) catches this.

The first surviving mutant is the payoff. It tells you a specific, actionable thing: *your suite has no test at the exact boundary between "no discount" and "discount."* Add one:

```python
def test_boundary_exact_threshold_gets_discount():
    assert bulk_discount(qty=3, price=20.0) == 54.0
```

Rerun the mutant. It dies. You have now made a small, permanent, provable improvement to the sensitivity of your test suite. Not to the coverage number, which was already 100%. To the actual thing you cared about — whether the suite would notice the bug you had not thought to write a test for.

Scale that loop across a real codebase and you will find that most surviving mutants cluster in three places: on boundaries, on return-value shape, and on early-return conditions. Each cluster teaches you something about how your suite is undertesting the code.

## What to do with the number

The temptation, once you can measure mutation score, is to treat it like line coverage: pick a target, hound the team to hit it, add it to CI as a hard gate. Resist that reflex, or at least approach it slowly.

The good use of the number is **as a signal, not a leash**. High-value things you can do with it:

- **On a small module you own end-to-end**, aim for something ambitious — 90%+ is achievable for pure functions and boundary-heavy code (validators, parsers, pricing rules, permission checks). Every surviving mutant on this kind of code is usually a genuine assertion gap.
- **On a service module with I/O**, aim lower — 70-80% is often the realistic ceiling before you start writing tests that pin implementation detail. Adapters to Stripe, S3, or the database are hard to mutation-test well because the "correctness" is at the boundary, not inside the function.
- **On a legacy module you inherited**, use mutmut as an archaeology tool. Run it once. Read the survivors as a map of where the previous team wasn't asserting on things. Fix the top ten. That's usually where the real bugs live.

The bad use is **turning it into a percentage gate on CI**. The failure mode is the same one that broke coverage as a signal: people optimize the metric by writing brittle, over-specified tests that pin implementation detail, and end up worse off than before. If you gate on mutation score at all, gate on *"survivors below N per module"* rather than *"score above X%"* — that framing keeps the focus on eliminating specific gaps rather than manufacturing generic assertions.

## Configuring the noise away

On a real codebase you will hit mutations that are technically correct but not useful to kill. Mutmut gives you three tools for suppressing them.

**Skip a whole line, function, class, or block with pragmas:**

```python
def send_alert(msg: str) -> None:  # pragma: no mutate block
    logger.info(msg)
    slack.post(msg)

x = compute_thing()  # pragma: no mutate
```

Use `# pragma: no mutate block` on a function or class definition to skip the entire node. Use `# pragma: no mutate` on a single line. There is also a range form: `# pragma: no mutate start` / `# pragma: no mutate end` for skipping arbitrary line spans.

**Skip patterns by regex in config**, when you have cross-cutting things (logging, exceptions) that produce noise everywhere:

```toml
[tool.mutmut]
do_not_mutate_patterns = [
    'logger\.\w+',       # skip all logger.info/debug/warn calls
    'raise \w+',         # skip mutations inside raise statements
]
```

**Filter mutants with your type checker** — mutmut can call `mypy` or `pyrefly` on each mutant and drop the ones the type checker rejects as invalid. This cuts noise substantially on a typed codebase:

```toml
[tool.mutmut]
type_check_command = ["mypy", "src", "--output", "json", "--disable-error-code", "unused-ignore"]
```

The trade-off: some real weaknesses hide behind type errors (a mutation that turns `x: str = "foo"` into `x: str = None` is invalid to `mypy`, but if your tests would not detect that change, the value of `x` may not be adequately tested regardless). Enable this once you have your baseline; don't lead with it.

## Fitting mutmut into a real workflow

The workflow that has worked for me on non-trivial Python codebases:

1. **First run against a single well-scoped module.** Pick a pure-logic module — a validator, a pricing rule, a permission check. Run mutmut against just that module (`mutmut run "pricing*"`). Fix the top few survivors. Feel the loop.
2. **Grow the scope one module at a time.** Do not enable it against the whole codebase on day one — you will get a survivor list too long to act on and the whole exercise will feel like a chore. Add modules as you strengthen them.
3. **Run it on the branch, not on `main`.** Because mutmut is incremental, running it after your change on a feature branch tells you specifically whether the functions you touched are well tested. That's a much narrower and more actionable question than *"what's the mutation score of the whole codebase."*
4. **Treat survivors like a code review.** Every surviving mutant is a specific claim: *"this test would not have caught this specific change."* Some of those claims are correct and actionable — write the test. Some are noise — suppress them with a pragma and a comment. Both are legitimate outcomes.
5. **Cache the `mutants/` directory in CI**, if you run it in CI at all. A cold run is expensive; a warm one is fast. Losing the cache turns a two-minute check into a twenty-minute one.

The `mutants/` directory in your repo root is where mutmut stores its state. It's safe to add to `.gitignore`. Delete it if you want to force a full clean run.

## The single-sentence version

If you take one thing from this post, take this: **line coverage measures where your tests went; mutation testing measures whether your tests are actually asserting on what they touched.** The first is a floor. The second is the signal you were reaching for when you asked *"are my tests good?"* And unlike most metrics that try to answer that question, this one produces a concrete, minimally-broken version of your code for every gap it finds — so the fix is always specific, always actionable, and almost always a five-line test away.

Install it. Point it at one module you care about. Read the first ten survivors. You will learn more about your test suite in the next hour than the coverage report has told you all year.
