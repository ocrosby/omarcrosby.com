+++
title = "Black-box unit tests: testing behavior, not implementation"
date = "2026-07-24T20:30:00-04:00"
draft = false
description = "Unit tests that break every time you refactor are describing the implementation, not the behavior. A senior engineer's playbook for writing black-box tests that survive."
summary = "Unit tests that break every time you refactor are describing the implementation, not the behavior. A senior engineer's playbook for writing black-box tests that survive."
tags = ["testing", "tdd", "refactoring", "software-design", "code-quality"]
categories = ["Code Quality"]
ShowToc = true

[cover]
image = "/images/og/testing-behavior-not-implementation.png"
hiddenInList = true
hiddenInSingle = true
+++

The single most useful question I ask about a unit test is: *if I change how this code is written without changing what it does, will the test still pass?* If the answer is no, the test isn't measuring behavior. It's transcribing the current implementation, and it will fight every refactor that touches the code it covers.

This is the follow-on to <a href="/posts/unit-tests-what-were-actually-arguing-about/">*Unit tests: what we're actually arguing about*</a>, which named black-box testing as the discipline that keeps the harness from becoming a brake on the next refactor but didn't get into the mechanics. This post gets into the mechanics: what black-box and white-box actually mean at the unit level, where white-box creeps in without anyone deciding, and how the same behavior looks when you write it either way. Examples are in Python, Go, and Rust so the point lands regardless of your stack — the failure mode is the same in every language.

## The terms, precisely

The vocabulary comes from Boris Beizer's *Software Testing Techniques* (2nd ed., Van Nostrand Reinhold, 1990), where he formalized what QA practitioners had been calling *black-box* and *glass-box* (later *white-box*) for years:

- **Black-box testing** treats the unit as an opaque contract. The test knows the inputs, expects specific outputs, and doesn't care how the unit computes the answer. Beizer called this *functional testing* — testing against the specification, not the code.
- **White-box testing** peers inside. The test knows the control flow, the branches, the collaborators, sometimes the data structures. Beizer called this *structural testing* — testing against the code itself.

In Beizer's original QA context, the distinction described *techniques* for coverage: equivalence partitioning and boundary-value analysis on the black-box side; branch coverage and MC/DC on the white-box side. Both were legitimate at different stages of the pipeline.

At the unit-test level — where developers, not QA teams, are writing the tests — the distinction becomes a *design* choice about what the tests couple to. And that choice determines whether the test suite is a safety net during refactors or a wall you have to demolish to move any load-bearing code. Vladimir Khorikov's <a href="https://www.manning.com/books/unit-testing" target="_blank" rel="noopener"><em>Unit Testing Principles, Practices, and Patterns</em></a> (Manning, 2020) is the most rigorous treatment of this framing I know of.

## The unit under test is a behavior, not a class

The first place teams go wrong is in defining *what a unit is*. The reflex — one class, one test file; one method, one test — is a category error. It equates the unit under test with the unit of code organization, and the two aren't the same.

Sandi Metz makes the point cleanly in <a href="https://www.youtube.com/watch?v=URSWYvyc42M" target="_blank" rel="noopener"><em>The Magic Tricks of Testing</em></a> (RailsConf 2013): the tests should live at the object's *outside surface*, its incoming messages, and largely ignore internal ones. Ian Cooper, in <a href="https://www.youtube.com/watch?v=EZ05e7EMOLM" target="_blank" rel="noopener"><em>TDD, Where Did It All Go Wrong</em></a> (DevTernity 2017), extends this further: the unit is the *behavior*, not the class — and the port through which that behavior is exercised is a public API, not a private method.

Concretely, if a `Cart` uses a `Discount`, an `Inventory`, and a `TaxCalculator` to compute a total, the behavior *"apply the store's discount rules to a cart and produce a total"* is one unit. The tests belong at the outside of that boundary. The three collaborators aren't three separate units to be tested through their interactions with `Cart` — they're part of the mechanism the behavior uses to do its work.

Draw the boundary right and black-box tests get much easier to write. Draw it around a single class or method and every collaborator becomes something the test has to reach through, and the reaching is where the coupling comes from.

## Where white-box creeps in

Nobody sits down and decides to write implementation-coupled tests. They arrive through three specific patterns, each of which starts as a reasonable local decision.

### Pattern 1 — Testing every method as its own unit

A `Cart` class has `add_item`, `apply_discount`, `total`, `checkout`. A test file appears with one test per method. Now the test for `total` needs a cart with items and a discount applied, so it calls `add_item` and `apply_discount` in the setup — and asserts that the return value of `apply_discount` is a specific `Discount` object. The moment `apply_discount` stops returning that object (because someone refactored it to a builder pattern, or made the discount a field, or moved the responsibility to a `DiscountPolicy`), the test fails. The behavior — *a cart with items and a discount produces the right total* — hasn't changed at all.

### Pattern 2 — Mocking your own collaborators

Two objects owned by the same team, in the same codebase, in the same deployable, are collaborators. Mocking one of them at the boundary between them is a white-box move: the test now asserts that `A` calls `B.foo(x)` in a specific sequence. Refactor the collaboration — inline `B`, move the responsibility, extract a different seam — and the test breaks even though the observable outcome is unchanged.

Martin Fowler's <a href="https://martinfowler.com/articles/mocksArentStubs.html" target="_blank" rel="noopener"><em>Mocks Aren't Stubs</em></a> is the definitive treatment of this distinction. His summary: *state verification* (assert on what the world looks like after) is black-box; *behavior verification* (assert on which calls were made) is white-box. Both are testing techniques with legitimate uses, but the second one couples to the collaboration.

The heuristic that keeps this honest is: mock at the edges of your system (databases, HTTP clients, message queues, the clock, the filesystem), not at the edges of your classes. When two classes on the same side of the deployment boundary talk to each other, replacing that conversation with a mock is nearly always a design signal that the boundary was drawn in the wrong place.

### Pattern 3 — Coverage-chasing

The previous post covered this in depth. In one line: line coverage rewards touching a line by any means, and the shortest path to a stubborn branch is usually to reach in and drive it directly. Every such reach-in becomes a white-box coupling, and the tests get harder to change from that point forward.

## The same behavior, two ways — Python

Here's a shopping cart that applies a bulk discount. First, the white-box version — one class, methods tested individually, collaborators mocked. It's the shape a lot of well-intentioned test files land in.

```python
from unittest.mock import Mock

def test_apply_discount_calls_policy_with_subtotal():
    policy = Mock()
    policy.discount_for.return_value = 5.0
    cart = Cart(discount_policy=policy)
    cart.add_item("book", price=20.0, qty=3)

    cart.apply_discount()

    policy.discount_for.assert_called_once_with(60.0)

def test_total_returns_subtotal_minus_discount():
    cart = Cart(discount_policy=Mock())
    cart._items = [{"price": 20.0, "qty": 3}]
    cart._discount = 5.0

    assert cart.total() == 55.0
```

These tests fail every time the internals move. Change `discount_for` to take a list of items rather than a subtotal — first test breaks. Rename `_items` to `_line_items` or move discount storage to a `Pricing` object — second test breaks. Neither change alters the observable behavior of the cart. The tests are asserting on the *shape of the collaboration* and the *shape of the internal state*, both of which are implementation details.

Now the black-box version — one behavior, tested through the public surface, with a real (or realistic) collaborator:

```python
def test_bulk_purchase_of_the_same_book_gets_the_bulk_discount():
    cart = Cart(discount_policy=BulkDiscountPolicy(threshold=3, percent=10))
    cart.add_item("book", price=20.0, qty=3)

    assert cart.total() == 54.0  # 3 * 20.0 * 0.9

def test_purchase_below_the_bulk_threshold_pays_full_price():
    cart = Cart(discount_policy=BulkDiscountPolicy(threshold=3, percent=10))
    cart.add_item("book", price=20.0, qty=2)

    assert cart.total() == 40.0
```

These tests describe *what a shopper experiences*, not how `Cart` computes it. Rename `_items`. Split `Cart` into `Cart` and `Pricing`. Change `BulkDiscountPolicy` from a class to a closure. Inline the discount calculation. None of it breaks these tests — the observable outcome (the total for a given cart configuration) is the same.

Notice too that the second version uses a real `BulkDiscountPolicy`, not a mock. When the collaborator is owned by the same team, deterministic, and fast, the test is more truthful and less brittle if it just uses it. Save the mocks for the edges — the database, the payment gateway, the clock.

## The same behavior, two ways — Go

Go's small-interfaces convention rewards black-box testing, but the same white-box trap exists — usually in the form of hand-rolled spies that assert on which repository methods were called.

The white-box version — the test replaces the repository with a spy and asserts on the calls:

```go
type SpyRepo struct {
    SaveCalled bool
    SavedOrder *Order
}

func (s *SpyRepo) Save(o *Order) error {
    s.SaveCalled = true
    s.SavedOrder = o
    return nil
}

func TestPlaceOrder_CallsSaveOnce(t *testing.T) {
    repo := &SpyRepo{}
    svc := NewOrderService(repo)

    _ = svc.PlaceOrder(Order{ID: "42", Items: []Item{{SKU: "book", Qty: 1}}})

    if !repo.SaveCalled {
        t.Fatal("expected Save to be called")
    }
    if repo.SavedOrder.ID != "42" {
        t.Errorf("expected saved order ID 42, got %q", repo.SavedOrder.ID)
    }
}
```

That test passes if the service calls `Save` — and fails if a refactor consolidates the save into a batch, or if the service starts calling `Upsert` instead, or if the ordering of operations changes. None of those changes affect what a caller can observe about the system.

The black-box version — a real in-memory fake, assertions on the state left behind:

```go
type InMemoryOrderRepo struct {
    orders map[string]Order
}

func NewInMemoryOrderRepo() *InMemoryOrderRepo {
    return &InMemoryOrderRepo{orders: map[string]Order{}}
}

func (r *InMemoryOrderRepo) Save(o *Order) error {
    r.orders[o.ID] = *o
    return nil
}

func (r *InMemoryOrderRepo) FindByID(id string) (Order, bool) {
    o, ok := r.orders[id]
    return o, ok
}

func TestPlacedOrderCanBeRetrievedByID(t *testing.T) {
    repo := NewInMemoryOrderRepo()
    svc := NewOrderService(repo)

    if err := svc.PlaceOrder(Order{ID: "42", Items: []Item{{SKU: "book", Qty: 1}}}); err != nil {
        t.Fatalf("PlaceOrder returned error: %v", err)
    }

    got, ok := repo.FindByID("42")
    if !ok {
        t.Fatal("expected order 42 to be retrievable after placement")
    }
    if len(got.Items) != 1 || got.Items[0].SKU != "book" {
        t.Errorf("saved order does not match: %+v", got)
    }
}
```

The test now says *place an order; then it can be looked up*. That is the actual contract of the service, and it is written in the caller's vocabulary. The service is free to reorganize how it persists the order — batch it, decorate it, split it across repositories, add caching — as long as retrieval by ID keeps working. Fowler's classification: this is state verification, and it survives implementation change in a way that behavior verification does not.

The in-memory fake is a modest amount of code — thirty lines, maybe — and it is a one-time investment that pays back for the life of the codebase. Every test that uses it is now black-box-shaped by construction.

## The same behavior, two ways — Rust

Rust's trait system makes the boundary explicit, which is a gift for testability if you draw the traits at the right seams. The white-box trap is the same one as in Go: define a fine-grained trait per collaborator, mock it, assert on which methods were called.

```rust
trait Clock {
    fn now(&self) -> u64;
}

struct RateLimiter<C: Clock> {
    clock: C,
    // ...
}

impl<C: Clock> RateLimiter<C> {
    pub fn allow(&mut self, key: &str) -> bool { /* ... */ }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct SpyClock {
        calls: std::cell::RefCell<u32>,
    }

    impl Clock for SpyClock {
        fn now(&self) -> u64 {
            *self.calls.borrow_mut() += 1;
            1_000
        }
    }

    #[test]
    fn allow_calls_clock_now_exactly_once_per_request() {
        let clock = SpyClock { calls: std::cell::RefCell::new(0) };
        let mut limiter = RateLimiter::new(clock);

        limiter.allow("user-1");

        assert_eq!(*limiter.clock.calls.borrow(), 1);
    }
}
```

This test enshrines an implementation detail — that `allow` reads the clock exactly once. Change the implementation to read the clock once at the start of a batch, or cache the last read for a millisecond, or read it lazily only when the bucket is close to empty, and the test breaks. The rate limiter's *behavior* — which calls it allows and which it rejects — is unchanged.

The black-box version uses a controllable but real-shaped clock and asserts on the outcome:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    struct FakeClock {
        t: Cell<u64>,
    }

    impl FakeClock {
        fn new(t: u64) -> Self { Self { t: Cell::new(t) } }
        fn advance(&self, dt: u64) { self.t.set(self.t.get() + dt); }
    }

    impl Clock for &FakeClock {
        fn now(&self) -> u64 { self.t.get() }
    }

    #[test]
    fn allows_up_to_the_limit_within_a_window_then_rejects() {
        let clock = FakeClock::new(0);
        let mut limiter = RateLimiter::new(&clock)
            .with_limit(3)
            .with_window_ms(1_000);

        assert!(limiter.allow("user-1"));
        assert!(limiter.allow("user-1"));
        assert!(limiter.allow("user-1"));
        assert!(!limiter.allow("user-1"), "fourth call within window should be rejected");
    }

    #[test]
    fn allows_again_after_the_window_expires() {
        let clock = FakeClock::new(0);
        let mut limiter = RateLimiter::new(&clock)
            .with_limit(1)
            .with_window_ms(1_000);

        assert!(limiter.allow("user-1"));
        assert!(!limiter.allow("user-1"));

        clock.advance(1_001);

        assert!(limiter.allow("user-1"));
    }
}
```

The `Clock` trait is a legitimate seam — time is an edge-of-the-system dependency, and controlling it is how deterministic tests get written for time-dependent behavior. But the tests exercise the rate limiter through its actual contract: *given this configuration and this sequence of requests, which are allowed and which are rejected?* That's the promise the rate limiter makes to its callers. Any implementation that keeps that promise passes both tests, forever.

## Kent Beck's Test Desiderata

The properties that make a test worth keeping are enumerated in Kent Beck's <a href="https://kentbeck.github.io/TestDesiderata/" target="_blank" rel="noopener"><em>Test Desiderata</em></a>, a short list of the qualities good tests share. Four of them speak directly to the black-box vs white-box question:

- **Behavioral** — tests should describe what the code does, not how it does it. This is the definitional property. Every test that fails when the implementation moves without a behavior change is failing this criterion.
- **Structure-insensitive** — tests shouldn't change when the structure of the code (class layout, method decomposition, collaborator wiring) changes. Structure-sensitivity is what makes a refactor cost ten hours instead of ten minutes.
- **Isolated** — the failure of one test shouldn't cascade to others. This is easier to hold when tests couple to a public contract than when they share fixtures reaching into internals.
- **Readable** — the intent should be legible at a glance. Black-box tests tend to read like specifications; white-box tests read like reverse-engineered flowcharts.

Beck also lists properties that pull the other direction — *specific*, *predictive*, *inspiring* — and no real test satisfies all of them at once. The desiderata are a Pareto frontier, not a checklist. But *behavioral* and *structure-insensitive* are the two that most directly determine whether the suite survives the code it covers.

## The legitimate exception: adapter tests

There is one place where white-box-shaped testing is the right call: at the *edge* of your system, where the interaction with an external collaborator *is* the contract.

An adapter to Stripe, an S3 client wrapper, a DAO that maps between your domain and the database schema — for these, the outbound calls and the request shape are the whole point of the code. A test that asserts *"when I call `charge`, we POST to `/v1/charges` with `amount` and `currency` in the body"* is asserting on behavior — the adapter's job is to make exactly that HTTP call. That's not a white-box coupling to implementation detail; it's a black-box test of a very narrow contract that happens to be specified in terms of an outbound message.

This is why the "mock at the edges, not at the classes" rule works: the seams that align with external systems are the seams where interaction-verification tests are honest. Anywhere else, they're transcribing a design choice that ought to be free to move.

Freeman and Pryce's <a href="https://www.informit.com/store/growing-object-oriented-software-guided-by-tests-9780321503626" target="_blank" rel="noopener"><em>Growing Object-Oriented Software, Guided by Tests</em></a> (2009) is the canonical treatment of this shape — mockist testing at genuine collaborator boundaries, driven by contract tests that pin the adapter's behavior against the real external system.

## Practical heuristics for authoring

The pattern I try to hold to, in whichever language I'm writing:

1. **Name the behavior first.** Before writing the test, write the sentence: *"Given X, when Y, then Z."* If the sentence talks about the collaborator (*"then it calls Foo.bar"*), the test will be white-box. Rephrase in terms of what the caller can observe.
2. **Set up through the public API.** If the only way to arrange the test is to reach into private fields or drive the object through methods marked `_internal`, the setup is measuring shape, not behavior. Prefer arrangement through the actual construction and public methods.
3. **Assert on the outcome, not the trace.** Prefer *"the account balance is 100"* over *"the ledger was called with a credit of 100"*. The second assertion pins the implementation to *how* the balance changed, not that it changed.
4. **Use real collaborators when you can.** Same team, same deployable, deterministic, fast — use the real thing. Reach for a mock only when the collaborator is at the edge of your system.
5. **Prefer fakes to mocks for stateful boundaries.** A ten-line in-memory implementation of a repository is nearly always cheaper across the lifetime of the codebase than a per-test mock ceremony. It also makes state assertions natural.
6. **When you catch yourself asserting on a call, ask why.** The answer sometimes reveals a genuine adapter-shaped contract. More often it reveals a boundary drawn in the wrong place.

None of these are absolutes. There are days when the shortest path to a specific bug is a targeted interaction assertion, and that's fine. But when the shape of the *suite* leans consistently toward interaction assertions on internal collaborators, the suite is doing white-box testing whether or not anyone named it that way — and the refactor cost is being paid every sprint.

## The refactoring loop is the fitness function

The best diagnostic for a test suite isn't its coverage number, its mutation score, or its size. It's what happens when someone refactors. Take a piece of code the suite covers, restructure it in a way that preserves behavior — extract a helper, move a method, inline a collaborator, swap a data structure — and run the tests. If they pass, the suite was testing behavior. If they fail, the suite was describing the implementation, and you now know exactly where.

That loop, done deliberately every few weeks, tells you more about the health of the harness than any dashboard. It's also the loop that keeps the suite from silently drifting toward white-box over time — because every refactor is a chance to notice which tests fought back, and either loosen those tests or redraw the boundary they were coupling to.

Coverage tells you where the tests haven't been. Mutation score tells you whether the tests you have are checking anything. The refactoring loop tells you whether the tests you have are *the right shape* — describing what the code does, not how it happens to do it today.

Write the tests through the public surface. Assert on the outcome. Use real collaborators where you can, fakes at the edges, mocks only when the interaction *is* the contract. The reward isn't a nicer test file — it's a codebase you can still change in year three without demolishing the safety net every time.
