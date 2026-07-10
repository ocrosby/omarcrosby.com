+++
title = "How writing tests first changes the shape of Go code"
date = "2026-07-09T09:08:56-04:00"
draft = false
description = "Writing the test before the implementation forces you to design the seam first. That's where dependency injection comes from — not from discipline applied after the fact."
tags = ["go", "testing", "tdd", "dependency-injection", "software-design"]
categories = ["Code Quality"]
ShowToc = true
+++

Most of the debate around test-first development gets stuck on process — red-green-refactor, coverage percentages, whether it slows you down on day one. That debate misses a simpler, more concrete effect, and you don't need to know Go, or even know how to code, to follow it:

**Whichever thing you write second has to bend to fit whatever you wrote first.**

Write the code first and the test second, and the test has no choice but to accommodate whatever the code already does — however it talks to the database, however it calls the network, however it happens to be built. Write the test first, and it's the code's turn to bend: it has to be built in whatever shape lets the test — which doesn't have a real database or a real network sitting around — actually run. That's the entire mechanism. Nothing about willpower, experience, or caring more. Just: which one existed first gets to set the terms.

In Go, that one small fact reliably produces the same structural outcome: **code written test-first ends up depending on things it's handed from the outside; code written test-after ends up depending on things it built for itself.** The first is called dependency injection. It isn't a design philosophy someone chose to apply — it's what's left over once the test forced the code's hand.

The rest of this post makes that concrete with the same small feature, built both ways, so you can see exactly where each version's hand gets forced.

## The feature: process an order, apply a promo, send a confirmation

Say we're building an `OrderProcessor` for a small shop. It takes a subtotal, applies a 20% discount during a November promo, saves the order, and emails the customer a confirmation. Three collaborators: a clock (for the promo window), a database, and an SMTP server.

## Test-after: write the code, then try to test it

If you sit down and just write the feature, this is a completely reasonable first draft:

```go
package orders

import (
    "database/sql"
    "fmt"
    "net/smtp"
    "time"

    _ "github.com/lib/pq"
)

type OrderProcessor struct {
    db *sql.DB
}

func NewOrderProcessor(dsn string) (*OrderProcessor, error) {
    db, err := sql.Open("postgres", dsn)
    if err != nil {
        return nil, fmt.Errorf("opening db: %w", err)
    }
    return &OrderProcessor{db: db}, nil
}

func (p *OrderProcessor) Process(orderID string, subtotal float64) error {
    discount := 0.0
    if time.Now().Month() == time.November {
        discount = subtotal * 0.20
    }
    total := subtotal - discount

    if _, err := p.db.Exec(
        `INSERT INTO orders (id, total) VALUES ($1, $2)`,
        orderID, total,
    ); err != nil {
        return fmt.Errorf("saving order: %w", err)
    }

    auth := smtp.PlainAuth("", "orders@shop.test", "secret", "smtp.shop.test")
    msg := []byte(fmt.Sprintf("Subject: Order confirmed\r\n\r\nYour total is %.2f", total))
    to := []string{"customer@example.com"}
    if err := smtp.SendMail("smtp.shop.test:587", auth, "orders@shop.test", to, msg); err != nil {
        return fmt.Errorf("sending confirmation: %w", err)
    }
    return nil
}
```

It compiles, it reads cleanly top to bottom, and it works against a real database and a real SMTP server. Nothing about it looks wrong in review — this is what a large fraction of production Go looks like, because this is what code looks like when nothing has yet demanded it look otherwise.

Now try to write `TestProcess_AppliesNovemberDiscount` against it. Every line fights you:

- `NewOrderProcessor` opens a real `*sql.DB`. To construct an `OrderProcessor` in a test at all, you need a live Postgres instance, or you reach for `sqlmock` and start asserting against SQL query strings instead of behavior.
- `Process` calls `smtp.SendMail` directly. There's no seam to intercept it — you'd need a local SMTP test server just to verify a confirmation was sent, or a build tag that swaps the whole function out under test, which is a maintenance liability nobody wants.
- The discount logic calls `time.Now()` inline. To test the November-only behavior, you either wait for November, temporarily change the machine clock, or skip testing the one piece of business logic that actually has a bug-prone edge case (what happens on November 30th at 23:59? What about time zones?).

None of these are exotic problems — they're the standard shape of "legacy" Go, arrived at in one sitting. The usual resolution is that the discount math gets extracted into a small pure function that *is* tested, and the database call and the email call quietly stay untested forever, because untangling them now means refactoring code that already works. The riskiest part of the feature — did we save the right total, did we actually notify the customer — is exactly the part that stays unverified.

## Test-first: write the test you wish you could write

Now do the same feature in the other order. Before `OrderProcessor` exists at all, write the test you want to have:

```go
func TestProcess_AppliesNovemberDiscount(t *testing.T) {
    clock := fixedClock{time.Date(2026, time.November, 15, 0, 0, 0, 0, time.UTC)}
    repo := &fakeRepository{}
    notifier := &fakeNotifier{}

    p := NewOrderProcessor(repo, notifier, clock)

    err := p.Process("order-1", 100.00)

    if err != nil {
        t.Fatalf("Process() error = %v", err)
    }
    if repo.saved.Total != 80.00 {
        t.Errorf("saved total = %.2f, want 80.00", repo.saved.Total)
    }
    if notifier.sentTo != "customer@example.com" {
        t.Errorf("notified %q, want customer@example.com", notifier.sentTo)
    }
}
```

This doesn't compile. Nothing named `fixedClock`, `fakeRepository`, `fakeNotifier`, or a three-argument `NewOrderProcessor` exists yet. But the test has already made three design decisions on the production code's behalf, before a single line of it was written:

1. `Process` needs a **clock it receives**, not `time.Now()` called inline — otherwise "November" isn't something a test can control.
2. `Process` needs a **repository it receives**, not a `*sql.DB` it opens — otherwise "saved" isn't something a test can inspect without a live database.
3. `Process` needs a **notifier it receives**, not `smtp.SendMail` called inline — otherwise "sent" isn't something a test can observe without a live SMTP server.

Only now do you write the interfaces the test is demanding, sized to exactly what the test needs and nothing more:

```go
type Clock interface {
    Now() time.Time
}

type Repository interface {
    Save(o Order) error
}

type Notifier interface {
    Notify(to string, total float64) error
}

type Order struct {
    ID    string
    Total float64
}

type OrderProcessor struct {
    repo     Repository
    notifier Notifier
    clock    Clock
}

func NewOrderProcessor(repo Repository, notifier Notifier, clock Clock) *OrderProcessor {
    return &OrderProcessor{repo: repo, notifier: notifier, clock: clock}
}

func (p *OrderProcessor) Process(orderID string, subtotal float64) error {
    discount := 0.0
    if p.clock.Now().Month() == time.November {
        discount = subtotal * 0.20
    }
    total := subtotal - discount

    if err := p.repo.Save(Order{ID: orderID, Total: total}); err != nil {
        return fmt.Errorf("saving order: %w", err)
    }

    if err := p.notifier.Notify("customer@example.com", total); err != nil {
        return fmt.Errorf("sending confirmation: %w", err)
    }
    return nil
}
```

And the fakes the test needed are trivial, because the interfaces are small:

```go
type fixedClock struct{ t time.Time }

func (c fixedClock) Now() time.Time { return c.t }

type fakeRepository struct{ saved Order }

func (r *fakeRepository) Save(o Order) error {
    r.saved = o
    return nil
}

type fakeNotifier struct{ sentTo string }

func (n *fakeNotifier) Notify(to string, total float64) error {
    n.sentTo = to
    return nil
}
```

The real `*sql.DB` and the real `smtp.SendMail` call still exist — they just moved. They live in small adapter types (`postgres.OrderRepository`, `email.SMTPNotifier`) that implement `Repository` and `Notifier`, and get constructed once, at the edge of the program:

```go
func main() {
    db, err := sql.Open("postgres", dsn)
    if err != nil {
        log.Fatal(err)
    }

    processor := orders.NewOrderProcessor(
        postgres.NewOrderRepository(db),
        email.NewSMTPNotifier("smtp.shop.test:587", smtpCreds),
        realClock{},
    )
    // ...
}
```

`orders.Process` now has zero knowledge of Postgres or SMTP. It knows about three small interfaces it was handed. The November edge case is a one-line change to `fixedClock` in a test, not a wait-until-next-month problem.

## Why the order of operations is the actual mechanism

It's tempting to say "test-first developers just have better design instincts," but that gives too much credit, and it's not required. Look again at what actually happened above, in plain terms:

The test-first version needed to call a function — `NewOrderProcessor` — that didn't exist yet. To call something that doesn't exist, you have to decide, right then, what you're handing it. The person writing that test had no database sitting in front of them, no SMTP server, no way to make November arrive on demand. So the only things they *could* hand `NewOrderProcessor` were stand-ins: a fake repository, a fake notifier, a clock they controlled. That's not a best practice they chose to apply — it's the only option available to someone calling code that doesn't exist yet and has no real infrastructure around them. The interfaces (`Repository`, `Notifier`, `Clock`) exist because the test needed something to hand over, and a stand-in was all it had.

The test-after version never faced that moment. The person writing `Process` had a real database, a real SMTP library, and a real system clock all one import away, and nothing in the room was asking them not to use them directly. So they did — not out of carelessness, but because that's simply the easier, more obvious way to write a function when nothing is pushing back. By the time anyone gets around to writing a test, `sql.Open` and `smtp.SendMail` are already load-bearing lines inside a function other code depends on. Pulling them out now means changing working code under time pressure, not just writing the feature once in a slightly different order.

That's the whole trick, and it's why "we'll add tests later" so reliably produces code that resists being tested at all — it's not a discipline failure. The code was simply never put in the one position that would have forced it to change shape: being called by something that showed up *before* it existed and had no access to anything real.

### Why this isn't just about one example

Dependency injection is the visible symptom here, but it's downstream of three more general things every reliable test needs, all of which a test-first caller demands automatically and a test-after caller has to retrofit by hand:

- **Explicit dependencies instead of hidden ones.** A test-first caller can only hand over what it has, so every collaborator ends up named in a constructor or function signature, in plain sight. A test-after function can quietly reach out to a global, a package-level client, or a database handle it opens itself — dependencies a reader can't see without reading the whole function body.
- **Controllable inputs instead of ambient ones.** Anything a test-first caller can't set directly — the clock, a random seed, an environment variable — has to become a parameter, because the test has no other way to pin it down. A test-after function is free to read `time.Now()` or `os.Getenv` wherever convenient, which is exactly what makes its behavior depend on *when* and *where* it runs instead of only on its inputs.
- **Interfaces sized to what's actually used, not what might be needed someday.** A test-first caller only asks for the fake to do the two or three things the test exercises, so the resulting interface stays small. Interfaces designed test-after, with no test dictating the shape, tend to mirror an entire concrete type (a whole `*sql.DB`, a whole SDK client) because there was no pressure keeping them narrow.

Put together, those three properties are what "testable code" actually means in practice — not a vague quality, but code whose behavior is fully determined by values you can see and set from the outside. Test-first development doesn't require you to know that vocabulary or aim for it deliberately. It arrives at it anyway, because a test that runs before the code exists can't get there any other way.

## What you get beyond testability

The dependency injection that falls out of this isn't only useful for tests:

- **The constructor documents the collaborators.** `NewOrderProcessor(repo Repository, notifier Notifier, clock Clock)` tells a reader everything `Process` depends on, without reading the method body. `NewOrderProcessor(dsn string)` tells a reader nothing — the real dependencies (SMTP host, credentials, the fact that time matters at all) are hidden inside the method.
- **Swapping an implementation doesn't touch the business logic.** Moving from email to Slack notifications, or from Postgres to a different store, means writing one new adapter that satisfies `Notifier` or `Repository`. `Process` doesn't change.
- **The concrete, unavoidably impure code — network calls, SQL, wall-clock time — gets pushed to the smallest possible surface**, the adapters and `main()`, instead of being smeared through the business logic that's supposed to be the interesting, reviewable part of the codebase.

## Where this goes wrong

None of this is a license to wrap every parameter in an interface. If you inject a seam for something that isn't actually a boundary — a pure function, a value type, a package-level constant — you get tests that assert on call counts and argument order instead of behavior, and a refactor of the implementation breaks tests that were never verifying anything a user could notice. That's a real failure mode of test-first development taken too literally, and it's the reason "just mock everything" has a bad reputation.

The rule that holds up is narrower: inject the things that are genuinely non-deterministic or external — **I/O, time, randomness, the network** — because those are the things a test cannot control any other way. A pure calculation, a struct literal, a string formatter doesn't need an interface in front of it; passing it as a plain value or calling it as a plain function is simpler and just as testable. Test-first development tends to find the right boundary here on its own, because the *test* only demands a seam where it genuinely cannot proceed without one — and a pure function never triggers that demand.

## An experiment for the next function you write

Here's a way to check whether any of this is actually true for you, instead of taking it on faith.

Next time you sit down to write a function that touches a database, an API, the filesystem, or the clock, stop before you write the body. Write the call site first — a test, or even just a comment showing how you wish you could invoke the thing that doesn't exist yet. Then pay attention to the exact moment you get stuck. That moment is the finding. If getting unstuck means reaching for a live database, a real network call, or waiting for a specific date to roll around, you've just located precisely which dependency your design was about to hide — before it had the chance to.

Now compare that against how you'd normally write the same function. Would you have noticed that dependency at all, or would it have gone in as a direct call because nothing was in the room to object? Most people, honestly answering that, find that the direct call would have gone in unnoticed — not from carelessness, but because nothing about writing the implementation first ever raises the question.

That gap is the whole argument of this post, and it's small enough to test on one function without adopting a methodology, a book, or a team-wide mandate. If the gap turns out to be real for you, the interesting question isn't "should I always write tests first." It's narrower and more useful: **which of the functions you're about to write this week are about to hide a dependency you won't notice until it's expensive to remove?** Those are the ones worth writing the call site for first. The rest can wait.
