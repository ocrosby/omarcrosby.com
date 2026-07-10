+++
title = "Testing Go with Ginkgo and Gomega without giving up go test"
date = "2026-07-09T10:41:32-04:00"
draft = false
description = "Ginkgo and Gomega bring BDD-style specs and suite-level setup to Go — and every one of them still runs under the plain go test command you already trust."
tags = ["go", "testing", "ginkgo", "gomega", "bdd", "ci-cd"]
categories = ["Code Quality"]
ShowToc = true

[cover]
image = "/images/og/testing-go-with-ginkgo-and-gomega.png"
hiddenInList = true
hiddenInSingle = true
+++

If you've never looked at [Ginkgo](https://onsi.github.io/ginkgo/) and [Gomega](https://onsi.github.io/gomega/), there's a decent chance you're picturing something that replaces `go test` — a separate test runner, a separate CI step, another tool your team has to adopt wholesale before anyone sees a benefit. That picture is wrong, and it's worth correcting up front, because it's the single biggest reason Go developers who'd genuinely enjoy Ginkgo never try it.

Here's the fact that should change your mind: **a Ginkgo spec is a Go test.** It compiles into the same test binary, it runs when you type `go test ./...`, and your existing CI pipeline doesn't need to know Ginkgo exists. What Ginkgo adds is a richer vocabulary for organizing specs — nested `Describe`/`Context`/`It` blocks instead of a flat list of `Test*` functions — plus first-class suite lifecycle (`BeforeSuite`/`AfterSuite`), table-driven specs, async timeouts, and labels for slicing a suite into subsets. Gomega adds the assertion language (`Expect(x).To(Equal(y))`) that makes failures read like a sentence instead of a `%v != %v` diff.

This post walks through both, side by side with the standard-library equivalent, at both the unit and the integration level — and every code sample below was actually compiled and run, not just typed out. By the end you'll have a setup you can drop into an existing package this afternoon.

## The one fact that makes this low-risk: it's still `go test`

Every Ginkgo suite needs exactly one bridge into Go's testing package, usually generated for you by `ginkgo bootstrap`:

```go
package cart_test

import (
    "testing"

    . "github.com/onsi/ginkgo/v2"
    . "github.com/onsi/gomega"
)

func TestCart(t *testing.T) {
    RegisterFailHandler(Fail)
    RunSpecs(t, "Cart Suite")
}
```

`TestCart` is an ordinary Go test function. `go test` finds it exactly the way it finds any other `func TestXxx(t *testing.T)`. `RegisterFailHandler(Fail)` tells Gomega "when an assertion fails, call Ginkgo's `Fail`, not `t.Fatal`" — that's the wiring that lets `Expect(...)` and Ginkgo's spec tree talk to the same underlying `*testing.T`. `RunSpecs` then walks every `Describe`/`It` registered in the package and runs them as Ginkgo specs, reporting pass/fail/skip back up through that one `TestCart` result.

The practical consequence: you can add a Ginkgo suite to a package that already has ordinary `_test.go` files, and both run together, in one invocation, with zero CI changes. I'll prove that below rather than just asserting it.

## Setup

```bash
# Add the libraries to your module
go get github.com/onsi/ginkgo/v2
go get github.com/onsi/gomega

# Optional: the ginkgo CLI, for parallel runs, richer filtering, and code generation.
# Pin it to the same version as go.mod — Ginkgo explicitly requires this.
go install github.com/onsi/ginkgo/v2/ginkgo@latest

# From inside the package you want to test:
cd yourpackage
ginkgo bootstrap          # generates yourpackage_suite_test.go (the RunSpecs bridge above)
ginkgo generate something # generates something_test.go with an empty Describe skeleton
```

The `ginkgo` CLI is optional — everything in this post also runs with plain `go test` — but it's worth installing because it's what unlocks parallel spec execution (`ginkgo -p`) and a friendlier `--label-filter` syntax, both covered below.

## Unit-level: the same test, two ways

Say you have a small shopping cart type:

```go
package cart

type Item struct {
    Name       string
    PriceCents int
    Qty        int
}

type Cart struct {
    Items []Item
}

func (c *Cart) TotalCents() int {
    total := 0
    for _, item := range c.Items {
        total += item.PriceCents * item.Qty
    }
    return total
}

func (c *Cart) TotalAfterDiscount(percentOff int) int {
    total := c.TotalCents()
    return total - (total * percentOff / 100)
}
```

### The standard-library version: a table-driven test

The idiomatic way to test this today is a table-driven test:

```go
package cart

import "testing"

func TestTotalAfterDiscount(t *testing.T) {
    tests := []struct {
        name       string
        items      []Item
        percentOff int
        want       int
    }{
        {"no discount", []Item{{Name: "Mug", PriceCents: 1000, Qty: 2}}, 0, 2000},
        {"twenty percent off", []Item{{Name: "Mug", PriceCents: 1000, Qty: 2}}, 20, 1600},
        {"multiple items", []Item{
            {Name: "Mug", PriceCents: 1000, Qty: 2},
            {Name: "Saucer", PriceCents: 500, Qty: 1},
        }, 10, 2250},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            c := &Cart{Items: tt.items}
            got := c.TotalAfterDiscount(tt.percentOff)
            if got != tt.want {
                t.Errorf("TotalAfterDiscount(%d) = %d, want %d", tt.percentOff, got, tt.want)
            }
        })
    }
}
```

This is good code. Nothing here needs replacing on its own merits.

### The Ginkgo and Gomega version: a DescribeTable

Here's the same coverage as a `DescribeTable`, living in the same package, in a second `_test.go` file:

```go
package cart_test

import (
    . "github.com/onsi/ginkgo/v2"
    . "github.com/onsi/gomega"

    "yourmodule/cart"
)

var _ = Describe("Cart", Label("unit"), func() {
    var c *cart.Cart

    BeforeEach(func() {
        c = &cart.Cart{}
    })

    Describe("TotalAfterDiscount", func() {
        DescribeTable("applying a percentage discount",
            func(items []cart.Item, percentOff int, want int) {
                c.Items = items
                Expect(c.TotalAfterDiscount(percentOff)).To(Equal(want))
            },
            Entry("no discount",
                []cart.Item{{Name: "Mug", PriceCents: 1000, Qty: 2}}, 0, 2000),
            Entry("twenty percent off",
                []cart.Item{{Name: "Mug", PriceCents: 1000, Qty: 2}}, 20, 1600),
            Entry("multiple items",
                []cart.Item{
                    {Name: "Mug", PriceCents: 1000, Qty: 2},
                    {Name: "Saucer", PriceCents: 500, Qty: 1},
                }, 10, 2250),
        )
    })
})
```

A few things worth naming explicitly, because they're the actual differences, not just syntax preference:

- **`BeforeEach` gives every entry a fresh `*cart.Cart`.** In the table-driven stdlib version, that freshness comes from declaring `c` inside the loop body. In Ginkgo, it comes from the "declare in the container, initialize in the setup node" pattern — `c` is declared in `Describe`'s closure, but assigned in `BeforeEach`, so every spec gets its own instance without you having to think about it per-entry.
- **`Label("unit")` isn't decoration.** It's the mechanism the CI section below uses to run only this suite.
- **`Expect(...).To(Equal(...))` reads as a sentence**, and on failure prints a structural diff of the two values, not just `%v != %v`.

### Proof: both run under one `go test`

Here's the part I actually verified rather than took on faith — running `go test` against a package containing *both* files above, with no special flags:

```text
$ go test ./cart/... -v
=== RUN   TestTotalAfterDiscount
=== RUN   TestTotalAfterDiscount/no_discount
=== RUN   TestTotalAfterDiscount/twenty_percent_off
=== RUN   TestTotalAfterDiscount/multiple_items
--- PASS: TestTotalAfterDiscount (0.00s)
=== RUN   TestCart
Running Suite: Cart Suite
Random Seed: 1783607930

Will run 3 of 3 specs
•••

Ran 3 of 3 Specs in 0.000 seconds
SUCCESS! -- 3 Passed | 0 Failed | 0 Pending | 0 Skipped
--- PASS: TestCart (0.00s)
PASS
ok      yourmodule/cart   0.816s
```

`TestTotalAfterDiscount` is the plain stdlib test. `TestCart` is the single entry point that runs all three Ginkgo specs and reports back as one Go test result. Nobody had to reconfigure a CI pipeline, add a new command, or install anything beyond the two `go get`s — this is what "Ginkgo tests run under your beloved `go test`" looks like with no hand-waving.

## Integration-level: suite lifecycle and async waits

Unit tests exercise pure logic against fakes. Integration tests exercise the boundary code itself — the HTTP client, the JSON decoding, the real round trip — against something that behaves like the real dependency, even if it's a local stand-in. This is where Ginkgo's suite-level hooks earn their keep.

Take a small catalog client that fetches a price over HTTP:

```go
package catalog

import (
    "context"
    "encoding/json"
    "fmt"
    "net/http"
)

type Client struct {
    BaseURL string
    HTTP    *http.Client
}

func NewClient(baseURL string) *Client {
    return &Client{BaseURL: baseURL, HTTP: http.DefaultClient}
}

type priceResponse struct {
    PriceCents int `json:"price_cents"`
}

func (c *Client) FetchPriceCents(ctx context.Context, sku string) (int, error) {
    req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/price/"+sku, nil)
    if err != nil {
        return 0, fmt.Errorf("building request: %w", err)
    }

    resp, err := c.HTTP.Do(req)
    if err != nil {
        return 0, fmt.Errorf("fetching price: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        return 0, fmt.Errorf("catalog returned status %d", resp.StatusCode)
    }

    var parsed priceResponse
    if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
        return 0, fmt.Errorf("decoding price: %w", err)
    }
    return parsed.PriceCents, nil
}
```

### The standard-library version: `httptest` and `TestMain`

Testing this for real means standing up something that answers HTTP requests. `httptest.Server` is the standard tool, and `TestMain` is the standard place to start and stop it once for the whole package:

```go
package catalog

import (
    "context"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "os"
    "testing"
    "time"
)

var fakeCatalog *httptest.Server

func TestMain(m *testing.M) {
    fakeCatalog = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.URL.Path == "/price/mug-42" {
            json.NewEncoder(w).Encode(map[string]int{"price_cents": 1499})
            return
        }
        w.WriteHeader(http.StatusNotFound)
    }))

    code := m.Run()

    fakeCatalog.Close()
    os.Exit(code)
}

func TestFetchPriceCents(t *testing.T) {
    ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
    defer cancel()

    client := NewClient(fakeCatalog.URL)

    got, err := client.FetchPriceCents(ctx, "mug-42")
    if err != nil {
        t.Fatalf("FetchPriceCents() error = %v", err)
    }
    if got != 1499 {
        t.Errorf("FetchPriceCents() = %d, want 1499", got)
    }
}
```

This works fine for one test. It gets uncomfortable fast once a package has several integration tests that each need the timeout boilerplate, and `TestMain` is a single, package-wide, easy-to-collide-with hook — there's only one, so every package can have at most one setup/teardown story, however many different fixtures its tests actually need.

### The Ginkgo and Gomega version: `BeforeSuite` and `SpecContext`

`BeforeSuite` and `AfterSuite` are Ginkgo's dedicated equivalent of `TestMain`'s setup/teardown, and `SpecContext` plus `SpecTimeout` replace the manual `context.WithTimeout` in every test:

```go
package catalog_test

import (
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "time"

    . "github.com/onsi/ginkgo/v2"
    . "github.com/onsi/gomega"

    "yourmodule/catalog"
)

var fakeCatalog *httptest.Server

var _ = BeforeSuite(func() {
    fakeCatalog = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.URL.Path == "/price/mug-42" {
            json.NewEncoder(w).Encode(map[string]int{"price_cents": 1499})
            return
        }
        w.WriteHeader(http.StatusNotFound)
    }))
})

var _ = AfterSuite(func() {
    fakeCatalog.Close()
})

var _ = Describe("Client", Label("integration"), func() {
    It("fetches the price for a known SKU", func(ctx SpecContext) {
        client := catalog.NewClient(fakeCatalog.URL)

        got, err := client.FetchPriceCents(ctx, "mug-42")

        Expect(err).NotTo(HaveOccurred())
        Expect(got).To(Equal(1499))
    }, SpecTimeout(2*time.Second))

    It("returns an error for an unknown SKU", func(ctx SpecContext) {
        client := catalog.NewClient(fakeCatalog.URL)

        _, err := client.FetchPriceCents(ctx, "does-not-exist")

        Expect(err).To(HaveOccurred())
    }, SpecTimeout(2*time.Second))
})
```

Verified output, same as before — one `go test`, no extra flags:

```text
$ go test ./catalog/... -v
=== RUN   TestCatalog
Running Suite: Catalog Suite
Will run 2 of 2 specs
••

Ran 2 of 2 Specs in 0.002 seconds
SUCCESS! -- 2 Passed | 0 Failed | 0 Pending | 0 Skipped
--- PASS: TestCatalog (0.00s)
PASS
```

Two things scale better here than in the `TestMain` version. First, `BeforeSuite`/`AfterSuite` are per-suite, not per-package — a package with several concerns can have several suites (or one suite with several `Describe` blocks, each managing its own fixtures via nested setup), instead of fighting over the package's single `TestMain`. Second, `func(ctx SpecContext)` plus `SpecTimeout(...)` gives every spec its own cancellable context automatically — Ginkgo cancels it if the timeout elapses or the process receives an interrupt, so a hung integration test fails cleanly with "spec timed out" instead of hanging the whole run.

## Segmenting unit from integration for targeted CI runs

This is the part that makes Ginkgo genuinely useful for CI, not just nicer to read: `Label(...)` on a `Describe` or `It` isn't just organizational metadata. It's a filter you can apply at run time, and — this is the detail most people miss — **you don't need the `ginkgo` CLI to use it.** Ginkgo registers its flags with the standard `flag` package, so plain `go test` can pass them straight through:

```bash
# Run only specs labeled "unit" — no ginkgo CLI required
go test ./... -args -ginkgo.label-filter=unit

# Equivalently, exclude anything labeled "integration"
go test ./... -args -ginkgo.label-filter='!integration'
```

I ran this against the `cart` suite (labeled `unit`) and the `catalog` suite (labeled `integration`) together, and confirmed the filter does exactly what it says:

```text
$ go test ./cart/... ./catalog/... -v -args -ginkgo.label-filter=unit
=== RUN   TestCart
Will run 3 of 3 specs
•••
--- PASS: TestCart (0.00s)
=== RUN   TestCatalog
Will run 0 of 2 specs
SS
Ran 0 of 2 Specs in 0.000 seconds
SUCCESS! -- 0 Passed | 0 Failed | 0 Pending | 2 Skipped
--- PASS: TestCatalog (0.00s)
```

All three unit specs ran; both integration specs were reported skipped, not failed, so the build stays green. That's your fast, no-network "unit" CI stage: `go test ./... -args -ginkgo.label-filter='!integration'`. A separate, slower CI stage runs the full suite, or inverts the filter for `integration`-only, whenever it's time to actually hit real dependencies.

If you have the `ginkgo` CLI installed, the equivalent is a bit more ergonomic and adds parallelism for free:

```bash
ginkgo --label-filter='!integration' -r         # fast unit-only stage
ginkgo --label-filter=integration -r -p         # integration stage, parallelized
```

**The one caveat worth knowing before you rely on this**: label filtering is a Ginkgo feature, so it only affects Ginkgo specs. A plain `func TestFoo(t *testing.T)` in the same package runs regardless of `-ginkgo.label-filter`, because it never asked Ginkgo anything. If a package mixes hand-written stdlib integration tests with Ginkgo specs and you need the stdlib ones excluded from the fast CI stage too, either migrate them to Ginkgo (so they pick up a label), or keep them in a build-tag-gated file the way you likely already do today. Labels solve this cleanly for anything written in Ginkgo — they don't retroactively organize code that isn't.

## Why this is worth trying, not just tolerating

None of the above is about Ginkgo being "more correct" than the standard library — table-driven tests and `TestMain` are perfectly good tools. The case for trying Ginkgo is what accumulates once a codebase has more than a handful of tests:

- **The spec tree reads as documentation.** `Describe("Client") > Label("integration") > It("returns an error for an unknown SKU")` describes the behavior in a sentence a non-author can understand without opening the test body. A flat list of `TestFetchPriceCents_UnknownSKU` function names doesn't compose the same way once there are fifty of them.
- **Randomized spec order surfaces order-dependent bugs before your users do.** Ginkgo shuffles spec order by default specifically to catch state leaking between tests; `ginkgo --seed=<n>` reproduces a failing order deterministically once you've found one.
- **`DeferCleanup` puts teardown next to the setup that needs it**, instead of in a separate `AfterEach` you have to scroll to find and keep in sync by hand.
- **Gomega's failure output tells you what actually differed**, structurally, instead of a bare inequality — this matters most exactly when a test fails at 2am in CI and nobody's around to add print statements.

## Where to be careful

Adopting Ginkgo wholesale on day one, on every package, is the wrong move — same caution as any DSL that uses dot-imports and package-level magic (`Describe`, `It`, `Expect` are all dot-imported into your test file's namespace). For a small package with three straightforward table-driven tests, the stdlib version above is genuinely simpler and you should keep writing it that way. Reach for Ginkgo where its actual features solve a problem you have: suite-level fixtures shared across many specs, async operations that need per-spec timeouts, or a growing integration suite you want to slice by label for CI. Bolting Ginkgo onto a five-line unit test because it's trendy just adds an import and a mental model for no return.

## Setup recap

```bash
go get github.com/onsi/ginkgo/v2
go get github.com/onsi/gomega
go install github.com/onsi/ginkgo/v2/ginkgo@latest   # optional, match go.mod version

cd yourpackage
ginkgo bootstrap                                      # generates the RunSpecs bridge
ginkgo generate something                             # generates a Describe skeleton

go test ./...                                         # runs everything, stdlib and Ginkgo alike
go test ./... -args -ginkgo.label-filter='!integration'  # fast, unit-only CI stage
```

If you've already read [how writing tests first changes the shape of Go code]({{< ref "how-writing-tests-first-changes-the-shape-of-go-code.md" >}}), Ginkgo and Gomega are a natural next step for the same underlying habit — they don't change *when* you write the test, but they give the test itself a shape that scales past a handful of `Test*` functions without asking you to leave `go test` behind.

## Where to find them

- **Ginkgo:** [onsi.github.io/ginkgo](https://onsi.github.io/ginkgo/) — [github.com/onsi/ginkgo](https://github.com/onsi/ginkgo)
- **Gomega:** [onsi.github.io/gomega](https://onsi.github.io/gomega/) — [github.com/onsi/gomega](https://github.com/onsi/gomega)
