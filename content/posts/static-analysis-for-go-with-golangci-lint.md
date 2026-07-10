+++
title = "Static analysis for Go: what golangci-lint catches, and why it belongs in CI"
date = "2026-07-09T13:44:25-04:00"
draft = false
description = "A tour of golangci-lint's 100-plus linters, the categories of bugs static analysis catches, and how to adopt it on a Go codebase without drowning in findings."
tags = ["go", "static-analysis", "code-quality", "ci-cd", "golangci-lint", "security"]
categories = ["Code Quality"]
ShowToc = true

[cover]
image = "/images/og/static-analysis-for-go-with-golangci-lint.png"
+++

Code review catches the bugs a human happens to notice. Static analysis catches the bugs a specific, well-defined check is built to notice — every time, on every line, before anyone opens the diff. Those are different guarantees, and the difference matters most for the bug classes reviewers are worst at: an HTTP response body that never gets closed three call sites deep, an error return silently discarded in a one-line change, a security-sensitive value generated with the wrong random source. None of these look wrong at a glance. All of them are mechanically detectable.

This post is about [golangci-lint](https://golangci-lint.run/docs/), the standard way to run static analysis on Go code, and about the broader question underneath it: what *kinds* of problems does static analysis actually find, and why does running it in CI — not just locally, not just "when someone remembers" — change the outcome. Everything below, including the linter output, was run for real against real (deliberately flawed) Go code, not typed out from memory.

## What golangci-lint actually is

Go's ecosystem has dozens of standalone linters — `go vet`, `staticcheck`, `errcheck`, `gosec`, and many more — each maintained separately, each with its own binary, its own config format, its own invocation. Running them all by hand means N separate commands, N separate output formats to parse, and no shared cache, so every linter re-walks the same AST from scratch.

golangci-lint is a **linter aggregator and runner**, not a linter of its own. It bundles more than a hundred linters behind one binary, one configuration file, and one command:

```bash
golangci-lint run
```

The value isn't just convenience. golangci-lint runs linters in parallel, caches analysis results between runs so incremental checks are fast, and normalizes every linter's output into one consistent report — so a CI failure looks the same whether it came from `govet` or `gosec` or a linter you'd never heard of before today.

Out of the box, with zero configuration, five linters are enabled: `errcheck`, `govet`, `ineffassign`, `staticcheck`, and `unused`. That's deliberately conservative — the maintainers' philosophy is that a default that produces false positives on day one gets disabled entirely, so the "standard" set is the subset with the best signal-to-noise ratio. Everything else is opt-in.

## Setup

```bash
# Homebrew
brew install golangci-lint

# Or the pinned install script (recommended over `go install` — no local
# toolchain/version drift):
curl -sSfL https://golangci-lint.run/install.sh | sh -s -- -b $(go env GOPATH)/bin v2.12.2

golangci-lint run                 # lint the current module, using defaults or .golangci.yml
golangci-lint run ./...           # explicit recursive form
golangci-lint run --enable gosec  # add one linter for this run without touching config
```

A minimal config file, `.golangci.yml` at the repo root:

```yaml
version: "2"

linters:
  default: standard   # the same conservative 5-linter baseline as no config at all
  enable:
    - gosec
    - bodyclose
    - cyclop

run:
  timeout: 5m

output:
  formats:
    - text
```

And in CI, the maintainers' own GitHub Action:

```yaml
name: golangci-lint
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  golangci:
    name: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-go@v6
        with:
          go-version: stable
      - uses: golangci/golangci-lint-action@v9
        with:
          version: v2.12
```

That's the whole setup cost.

### Disabling linters, at every level

The first thing every team asks after enabling this is "how do I turn off the one that's wrong for us" — and there's a mechanism at every scope, from a single line to the whole repo, each verified below:

**One line**, with a required reason so the suppression is self-documenting:

```go
func helper() string { //nolint:unused // kept for an upcoming feature flag
    return "unused"
}
```

**One linter, repo-wide**, either on the CLI for a one-off run:

```bash
golangci-lint run -D unused
```

or persistently in config:

```yaml
linters:
  default: standard
  disable:
    - unused
```

**One linter, scoped to a path** — the tool for "we know `legacy/` is a mess, don't hold new code to the same standard while it waits for a rewrite":

```yaml
linters:
  default: standard
  exclusions:
    rules:
      - path: legacy/
        linters:
          - unused
```

This runs `unused` everywhere except `legacy/`, rather than turning it off globally because one directory isn't ready for it yet.

**Everything, as a starting point** — covered next, because turning every linter off and re-enabling them one at a time is a legitimate adoption strategy, not just a way to silence noise.

## The general categories of issues static analysis catches

Before looking at the full linter catalog, it's worth naming the *kinds* of problems this class of tool exists to solve — because the value isn't "more warnings," it's specific categories of production incident that each map to a specific, checkable pattern in source code.

- **Correctness bugs that compile cleanly.** An ignored error return, a value assigned and never used, a nil check that doesn't actually guard the code path that follows it. None of these are syntax errors. All of them are runtime bugs waiting for the right input.
- **Resource leaks and concurrency hazards.** An `http.Response.Body` that's read but never closed. A SQL `*sql.Rows` left open on an early return. A `context.Context` created inside a loop where it should be created once. These leak file descriptors, connections, and goroutines slowly enough that they pass every test and show up as a production incident weeks later.
- **Security vulnerabilities with a known shape.** Weak randomness used for a token instead of `crypto/rand`. A file path or shell command built from unsanitized input. A TLS config with certificate verification disabled. These are exactly the classes of finding a security review is looking for — a linter finds them on every commit instead of once a quarter.
- **Dead and unreachable code.** Unused variables, unused function parameters, unused struct fields, functions nothing calls. Individually harmless; collectively, this is how a codebase accumulates the kind of debris that makes a new hire ask "wait, is this still used anywhere?" about half the files they open.
- **Deprecated or unsafe API usage.** A call into a package the standard library has since deprecated, a function whose replacement fixes a known correctness edge case. These findings are cheap to fix the week they appear and expensive to fix in bulk three major versions later.
- **Complexity and maintainability debt.** Functions whose cyclomatic complexity, nesting depth, or sheer length have quietly crossed the point where a reviewer can hold the whole thing in their head. This is the category that doesn't cause an incident today — it causes the *next* change to that function to take three times as long and introduce a bug nobody meant to write.
- **Performance inefficiencies with a mechanical fix.** A slice that's appended to in a loop without a capacity hint, a `fmt.Sprintf` call that could be a cheaper string operation, a type conversion that does nothing. Small individually; the kind of thing that's genuinely worth fixing once and never thinking about again.
- **Style and consistency drift.** Import ordering, comment punctuation, naming conventions, struct tag alignment. The lowest-stakes category, and also the one most likely to generate bikeshedding in code review if a linter isn't enforcing it automatically instead.
- **Test hygiene.** Missing `t.Parallel()`, test helpers that don't call `t.Helper()` (so failures report the wrong line), tests living in the same package as the code they test when they shouldn't. These don't affect production, but they affect how much you can trust your test suite's failure output.

Every category above maps to real linters in the catalog further down. But the categories are the point — a linter name is just a label for "this specific pattern, checked mechanically, every time."

## A worked example: what a CI gate actually catches

Here's a small, realistic `auth.go` — the kind of file that would pass a normal code review, because none of its problems are visible without knowing exactly what to look for:

```go
package auth

import (
    "encoding/json"
    "fmt"
    "io/ioutil"
    "math/rand"
    "net/http"
)

const adminPassword = "sup3rSecret!"

type Profile struct {
    Name string `json:"name"`
}

func GenerateSessionToken() string {
    return fmt.Sprintf("%d", rand.Intn(1000000))
}

func FetchProfile(url string) (*Profile, error) {
    resp, err := http.Get(url)
    body, _ := ioutil.ReadAll(resp.Body)

    var p Profile
    json.Unmarshal(body, &p)
    return &p, err
}
```

Running `golangci-lint run` with a handful of linters enabled (`errcheck`, `govet`, `ineffassign`, `staticcheck`, `unused`, `bodyclose`, `gosec`) against this file, verbatim:

```text
bad.go:22:23: response body must be closed (bodyclose)
    resp, err := http.Get(url)
                         ^
bad.go:26:16: Error return value of `json.Unmarshal` is not checked (errcheck)
    json.Unmarshal(body, &p)
                  ^
bad.go:18:27: G404: Use of weak random number generator (math/rand or math/rand/v2 instead of crypto/rand) (gosec)
    return fmt.Sprintf("%d", rand.Intn(1000000))
                             ^
bad.go:22:15: G107: Potential HTTP request made with variable url (gosec)
    resp, err := http.Get(url)
                 ^
bad.go:26:2: G104: Errors unhandled (gosec)
    json.Unmarshal(body, &p)
    ^
bad.go:6:2: SA1019: "io/ioutil" has been deprecated since Go 1.19: As of Go 1.16, the same functionality is now provided by package io or package os, and those implementations should be preferred in new code. (staticcheck)
    "io/ioutil"
    ^
bad.go:11:7: const adminPassword is unused (unused)
const adminPassword = "sup3rSecret!"
      ^

7 issues:
* bodyclose: 1
* errcheck: 1
* gosec: 3
* staticcheck: 1
* unused: 1
```

Seven real findings, five of the nine categories from the section above, in nineteen lines of code that would sail through a normal PR review:

- **Resource leak** — `resp.Body` is read but never closed (`bodyclose`). This one's a slow leak: it works fine locally, works fine in a test that makes one request, and exhausts file descriptors under real traffic.
- **Correctness bug** — the return values of `json.Unmarshal` and (per `gosec`'s independent check) the ignored decode error are both silently dropped. If the response isn't valid JSON, `FetchProfile` returns a zero-value `Profile` and `nil` for that error path, indistinguishable from success.
- **Security** — `math/rand` is not cryptographically secure; using it for a session token means a determined attacker can predict tokens. `gosec` also flags the variable `url` being used directly in an outbound `http.Get` as a potential SSRF vector worth a second look.
- **Deprecated API** — `io/ioutil` has been deprecated since Go 1.19 in favor of `io` and `os`; `staticcheck` catches this automatically, which matters because "deprecated but still compiles" is exactly the kind of thing nobody notices until a major version bump forces the issue.
- **Dead code** — `adminPassword` is declared and never referenced anywhere. Either it's leftover from a refactor (delete it) or it's supposed to be used somewhere and isn't (a bug).

Fixed, addressing every finding:

```go
package auth

import (
    "crypto/rand"
    "encoding/json"
    "fmt"
    "io"
    "math/big"
    "net/http"
)

type Profile struct {
    Name string `json:"name"`
}

func GenerateSessionToken() (string, error) {
    n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
    if err != nil {
        return "", fmt.Errorf("generating token: %w", err)
    }
    return n.String(), nil
}

func FetchProfile(url string) (*Profile, error) {
    resp, err := http.Get(url)
    if err != nil {
        return nil, fmt.Errorf("fetching profile: %w", err)
    }
    defer resp.Body.Close()

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, fmt.Errorf("reading response: %w", err)
    }

    var p Profile
    if err := json.Unmarshal(body, &p); err != nil {
        return nil, fmt.Errorf("decoding profile: %w", err)
    }
    return &p, nil
}
```

Re-running the same linter set against the fixed version: zero issues. Every fix above is small and mechanical — check the error, close the body, use `crypto/rand`, delete the dead constant, swap the deprecated import — and every one of them is a fix a static analyzer can point at with a file and line number, no debugging required.

## Complexity is its own category

None of the linters above would have caught this next one, because none of them measure structure — they measure specific patterns. Cyclomatic complexity needs its own check:

```go
func Classify(age int, hasLicense, hasInsurance, isOwner, isSuspended bool) string {
    if isSuspended {
        return "suspended"
    }
    if age >= 18 {
        if hasLicense {
            if hasInsurance {
                if isOwner {
                    return "eligible-owner"
                } else {
                    return "eligible-driver"
                }
            } else {
                return "needs-insurance"
            }
        } else {
            return "needs-license"
        }
    } else {
        return "underage"
    }
}
```

With `cyclop` enabled and its threshold configured down to 5 (its default is more lenient):

```text
complex.go:3:1: calculated cyclomatic complexity for function Classify is 6, max is 5 (cyclop)
func Classify(age int, hasLicense, hasInsurance, isOwner, isSuspended bool) string {
^
```

Nothing here is a bug today. It's a bug *incubator* — the next person who needs to add a sixth condition is going to nest it one level deeper rather than restructure, and the function that was borderline-readable at six branches becomes genuinely hard to review at eight. Complexity linters exist to flag that trend while it's still cheap to fix, which in this case means extracting the license/insurance/ownership logic into its own function rather than adding another `if`.

## The full linter catalog

golangci-lint bundles over 100 linters. Below is the complete set, at the time of writing, grouped by the categories described above so you can scan for what you actually need rather than reading an alphabetical wall of names. `✓ default` marks the five linters enabled with zero configuration.

### Correctness & runtime bugs

| Linter | Catches |
|---|---|
| `govet` ✓ default | Suspicious constructs the Go team itself flags: printf format mismatches, struct tag errors, lock copying, and more. |
| `staticcheck` ✓ default | A large, actively maintained rule set for bugs, deprecated API usage, and dubious constructs — one of the highest-signal linters available. |
| `ineffassign` ✓ default | A value is assigned to a variable but overwritten or discarded before it's ever read. |
| `unused` ✓ default | Constants, variables, functions, and types that are declared but never referenced. |
| `errcheck` ✓ default | A function's error return value is silently discarded. |
| `predeclared` | Code shadows one of Go's built-in identifiers (`len`, `min`, `new`, etc.), inviting confusing bugs. |
| `reassign` | A package-level variable is reassigned somewhere it shouldn't be. |
| `recvcheck` | Methods on the same type inconsistently mix pointer and value receivers. |
| `gochecksumtype` | Exhaustiveness checks on Go's informal "sum type" pattern (sealed interfaces). |
| `exhaustive` | A `switch` over an enum-like type doesn't handle every value. |
| `exhaustruct` | A struct literal doesn't initialize every field, leaving zero values that may not be safe defaults. |
| `decorder` | Enforces a consistent order and count for type, const, var, and func declarations. |
| `iotamixing` | An `iota`-based const block mixes in non-`iota` values, a common source of off-by-one enum bugs. |
| `embeddedstructfieldcheck` | Embedded struct fields aren't grouped at the top of the field list, separated from regular fields. |
| `funcorder` | Functions, methods, and constructors aren't declared in a consistent order within a file. |
| `gocheckcompilerdirectives` | A `//go:` compiler directive comment is malformed and silently ignored. |
| `asasalint` | A `[]any` is passed where a variadic `...any` was expected, usually not what the caller intended. |
| `forcetypeassert` | A type assertion (`x.(T)`) is used without the two-value form, so a mismatch panics instead of returning an error. |
| `iface` | Interfaces are used in ways that cause "interface pollution" — accepting or returning broader interfaces than necessary. |
| `ireturn` | A function returns an interface type where a concrete type would be clearer and more useful to callers. |

### Resource leaks & concurrency hazards

| Linter | Catches |
|---|---|
| `bodyclose` | An `http.Response.Body` is read but never closed — a slow file-descriptor leak under real traffic. |
| `sqlclosecheck` | `sql.Rows`, `sql.Stmt`, or similar are opened but never closed. |
| `rowserrcheck` | `Rows.Err()` is never checked after iterating a `database/sql` result set, silently swallowing scan errors. |
| `noctx` | An HTTP request or similar operation is made without a `context.Context`, so it can't be cancelled or timed out. |
| `containedctx` | A `context.Context` is stored as a struct field instead of passed explicitly, which usually means it's stale by the time it's used. |
| `contextcheck` | A function uses a context that isn't the one inherited from its caller, breaking cancellation propagation. |
| `fatcontext` | A `context.Context` is created inside a loop or closure where it should be created once outside it. |
| `copyloopvar` | A loop variable is copied in a way that's now unnecessary or risky under Go's per-iteration loop variable semantics. |
| `durationcheck` | Two `time.Duration` values are multiplied together, which is almost always a units bug. |
| `spancheck` | Common mistakes with OpenTelemetry/OpenCensus tracing spans — created but never ended, or ended on the wrong path. |
| `makezero` | A slice is declared with a non-zero initial length and then appended to, silently leaving zero-value gaps. |
| `wastedassign` | A value is computed and assigned but never used — the concurrency-adjacent sibling of `ineffassign` for more complex expressions. |

### Error-handling conventions

| Linter | Catches |
|---|---|
| `errorlint` | Code that breaks Go 1.13's error-wrapping scheme — using `==` instead of `errors.Is`, or `.(type)` instead of `errors.As`. |
| `errname` | Sentinel errors aren't prefixed `Err` and custom error types aren't suffixed `Error`, the convention `errors.Is`/`As` tooling expects. |
| `err113` | Enforces a specific style for constructing and comparing errors (named after the Go 1.13 error-wrapping proposal). |
| `wrapcheck` | An error returned from a third-party package is passed straight through instead of wrapped with local context. |
| `nilerr` | A function checks that `err != nil` and then returns `nil` anyway — a copy-paste bug that silently discards real failures. |
| `nilnil` | A function simultaneously returns a `nil` error and a `nil` value that the caller can't safely use, an ambiguous contract. |
| `nilnesserr` | A function checks `err != nil` but returns a *different* error value that is itself `nil`, masking the original failure. |

### Security

| Linter | Catches |
|---|---|
| `gosec` | The broadest security linter here: weak randomness, hardcoded credentials, SQL built by string concatenation, disabled TLS verification, and more, each tagged with a CWE-style rule ID. |
| `bidichk` | Dangerous Unicode bidirectional control characters that can make code visually lie about what it does (the "Trojan Source" class of attack). |
| `gosmopolitan` | Internationalization/localization anti-patterns that can produce subtly wrong behavior across locales. |

### Dead code, unused code & declaration hygiene

| Linter | Catches |
|---|---|
| `unparam` | A function parameter is never used, or is always called with the same value — a signal the signature is wider than it needs to be. |
| `nonamedreturns` | Named return values are declared but add no clarity, inviting the "naked return" bugs `nakedret` also watches for. |
| `nakedret` | A function with named returns uses a bare `return` in a function long enough that it's no longer obvious what's being returned. |
| `dogsled` | An assignment discards too many return values with blank identifiers (`_, _, _, x := f()`), often hiding a signature that's grown unwieldy. |
| `unqueryvet` | `SELECT *` in a raw SQL query or query builder, pulling columns the code never asked for and can't safely assume the shape of. |

### Complexity & maintainability

| Linter | Catches |
|---|---|
| `cyclop` | Cyclomatic complexity of a function or package crosses a configured threshold. |
| `gocyclo` | The original cyclomatic complexity checker; largely superseded by `cyclop` but still available. |
| `gocognit` | Cognitive complexity — weights nested branching more heavily than raw cyclomatic complexity does, closer to how hard code actually is to follow. |
| `funlen` | A function's line count crosses a configured threshold. |
| `nestif` | `if` statements are nested more deeply than is comfortable to read. |
| `maintidx` | The maintainability index (a composite of complexity, volume, and length) for a function drops below a healthy threshold. |
| `interfacebloat` | An interface has grown too many methods to be a focused, single-purpose abstraction. |
| `dupl` | Near-duplicate blocks of code that should probably be a shared function. |
| `goconst` | The same string literal is repeated enough times that it should be a named constant. |
| `mnd` | "Magic numbers" — unexplained numeric literals that should be named constants. |

### Performance & unnecessary work

| Linter | Catches |
|---|---|
| `prealloc` | A slice is grown with repeated `append` calls where its final size was knowable up front and could have been preallocated. |
| `perfsprint` | `fmt.Sprintf` is used where a faster, allocation-free alternative (like simple string concatenation) would do. |
| `unconvert` | A type conversion is performed where the value is already the target type — dead work on every call. |
| `modernize` | Suggests simplifications available in newer Go versions — modern stdlib equivalents of older idioms. |
| `exptostd` | A function imported from `golang.org/x/exp` now has a standard-library equivalent and should use it instead. |
| `intrange` | A classic index-based `for` loop could use Go's newer integer `range` form instead. |

### Style, formatting & naming consistency

| Linter | Catches |
|---|---|
| `godot` | Comments that don't end in a period, for consistent godoc rendering. |
| `godox` | `TODO`, `FIXME`, and similar markers left in comments, so they surface in review instead of getting forgotten. |
| `godoclint` | Go doc comments that don't follow godoc's documented conventions. |
| `goheader` | A file's header comment doesn't match a required pattern (license headers, for example). |
| `whitespace` | Unnecessary blank lines at the start or end of blocks. |
| `wsl_v5` | Enforces specific rules about where blank lines are required or forbidden for readability (a stricter, opinionated formatter-adjacent check). |
| `nlreturn` | A `return` or branch statement isn't preceded by a blank line where the style guide expects one. |
| `lll` | Lines exceeding a configured maximum length. |
| `tagalign` | Struct tags (`json:"..."`, `yaml:"..."`, etc.) aren't vertically aligned within a struct. |
| `tagliatelle` | Struct tag naming doesn't follow a consistent case convention (`camelCase` vs. `snake_case`, for example). |
| `importas` | An import is aliased inconsistently across the codebase. |
| `inamedparam` | An interface method declares unnamed parameters, hurting generated docs and IDE hints. |
| `varnamelen` | A variable's name is too short (or too long) for the scope it lives in — `i` is fine in a five-line loop, not in a fifty-line function. |
| `grouper` | Related `import`, `const`, `var`, or `type` declarations aren't grouped together. |
| `gochecknoglobals` | Package-level (global) variables exist at all — a stricter, opt-in style rule for teams that ban them outright. |
| `gochecknoinits` | An `init()` function exists — some teams ban these because they run implicitly and complicate testability. |
| `forbidigo` | A specific identifier or pattern your team has explicitly blocklisted (e.g., `fmt.Println` in production code) is used. |
| `depguard` | An import comes from a package your team has explicitly blocklisted or restricted to certain files. |
| `gomodguard_v2` | Restricts which third-party modules can be added as direct dependencies at all. |
| `gomoddirectives` | `go.mod` contains `replace`, `retract`, or `exclude` directives your policy doesn't allow, or that were left in by accident. |
| `asciicheck` | An identifier contains non-ASCII characters, which can be confusing or, combined with `bidichk`, actively deceptive. |
| `dupword` | The same word appears twice in a row in a comment or string, almost always a typo. |
| `misspell` | Commonly misspelled English words in comments and strings. |
| `canonicalheader` | `net/http.Header` values aren't written in their canonical form (`Content-Type` vs. `content-type`). |
| `usestdlibvars` | A literal value is used where the standard library already defines a named constant for it (an HTTP status code as `200` instead of `http.StatusOK`, for example). |
| `nolintlint` | A `//nolint` suppression comment is malformed, missing a required explanation, or no longer suppressing anything. |
| `gomodguard` | Deprecated — superseded by `gomodguard_v2`. |
| `wsl` | Deprecated — superseded by `wsl_v5`. |

### Test hygiene

| Linter | Catches |
|---|---|
| `paralleltest` | A test could safely call `t.Parallel()` and doesn't, leaving test suite wall-clock time on the table. |
| `tparallel` | `t.Parallel()` is used in a way that doesn't actually achieve parallelism (called after a blocking setup step, for example). |
| `thelper` | A test helper function doesn't call `t.Helper()`, so failures report the wrong line number. |
| `testifylint` | Common misuses of `github.com/stretchr/testify`'s assertion API. |
| `testpackage` | Tests live in the package under test (`package foo`) instead of the recommended external `foo_test` package. |
| `testableexamples` | A Go doc example (`func Example...`) has no `// Output:` comment, so it isn't actually verified when tests run. |
| `usetesting` | A function has a direct replacement inside the `testing` package (e.g., `t.TempDir()` instead of `ioutil.TempDir`). |
| `ginkgolinter` | Enforces correct usage of the [Ginkgo and Gomega]({{< ref "testing-go-with-ginkgo-and-gomega.md" >}}) testing DSLs. |

### Domain- and library-specific checks

| Linter | Catches |
|---|---|
| `loggercheck` | Mismatched key-value pairs in structured logging calls (`kitlog`, `klog`, `logr`, `slog`, `zap`). |
| `sloglint` | Inconsistent usage style for the standard library's `log/slog` package. |
| `zerologlint` | A `zerolog` log event is built but never dispatched with `.Send()` or `.Msg()`, so nothing is actually logged. |
| `promlinter` | Prometheus metric names don't follow Prometheus's own naming conventions. |
| `musttag` | A struct is marshaled or unmarshaled without the field tags that format requires (`json`, `yaml`, `xml`, etc.). |
| `protogetter` | Protobuf message fields are read directly instead of through their generated getter methods, bypassing nil-safety. |
| `errchkjson` | A value passed to `encoding/json` can't actually be marshaled the way the code assumes (unsupported types, cyclic structures). |
| `arangolint` | Opinionated best practices specific to the ArangoDB Go client. |
| `clickhouselint` | Common mistakes specific to the ClickHouse native Go driver. |

That's the full catalog. No single project should enable all of it — several of these encode opinionated style choices (`wsl_v5`, `nlreturn`, `gochecknoglobals`) that only make sense if your team has actually agreed to them. The value is in picking the subset that matches problems you actually have, which is exactly what the next section is about.

## Adopting this without drowning in findings

Turning on a broad linter set all at once, on an existing codebase, produces hundreds or thousands of findings on day one — which is how teams end up disabling the whole thing three weeks later out of fatigue. There are two complementary ratchets for avoiding that, and most teams that stick with golangci-lint long-term end up using both.

### Ratchet by time: only fail on new code

```bash
# In CI, lint only the lines that changed against the target branch
golangci-lint run --new-from-rev=HEAD~
```

The project's own guidance is blunt about why: *"It's not practical to fix all existing issues at the moment of integration: much better to not allow issues in new code."* Turn on the full linter set you want, but scope enforcement to new and changed code only, and let the existing debt shrink gradually as files get touched for other reasons instead of blocking on a cleanup sprint nobody has time for.

### Ratchet by linter: start from nothing, add one at a time

The second axis is which linters are even running, and it's just as valid to start there instead of starting broad. Begin with everything off:

```yaml
version: "2"
linters:
  default: none
```

Running `golangci-lint run` against that config reports `no linters enabled` — a deliberately inert starting point. Then enable exactly one:

```yaml
linters:
  default: none
  enable:
    - unused
```

Fix what it finds (or suppress the handful that genuinely need it, with a `//nolint` reason attached), merge, and move to the next linter — `errcheck`, then `govet`, then whichever from the catalog above actually matches a problem your codebase has had. Each step is a small, reviewable PR with a bounded diff, rather than one enormous "fix everything golangci-lint found" change that's too large for anyone to review carefully and too risky to land in one go.

The two ratchets combine cleanly: once a linter is enabled repo-wide, immediately narrow it back to `--new-from-rev` if its existing-code findings are still too large to fix in one sitting — enable the check, don't yet demand the backlog be clean, and come back for the backlog later.

The other lever worth knowing: `//nolint:lintername // reason` suppresses a specific finding inline, and `nolintlint` (in the catalog above) keeps those suppressions honest — flagging ones that are missing a reason, or that no longer suppress anything because the underlying code changed. A suppression without a reason is just a disagreement with the linter that the next reader has no way to evaluate.

## Where to find it

- **Docs:** [golangci-lint.run/docs](https://golangci-lint.run/docs/)
- **Full linter list (source of truth, updated as linters are added):** [golangci-lint.run/docs/linters](https://golangci-lint.run/docs/linters/)
- **GitHub Action:** [github.com/golangci/golangci-lint-action](https://github.com/golangci/golangci-lint-action)
- **Repo:** [github.com/golangci/golangci-lint](https://github.com/golangci/golangci-lint)
