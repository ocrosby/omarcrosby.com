+++
title = "Hexagonal architecture, in plain language"
date = "2026-07-20T17:23:27-04:00"
draft = false
description = "A jargon-free introduction to hexagonal architecture — the idea that your business logic should sit in the middle and the outside world (databases, screens, APIs, tests) should plug into it through simple, agreed-upon shapes. Small worked examples in Python, Go, and Rust show what changes when a new requirement arrives."
summary = "A jargon-free introduction to hexagonal architecture — the idea that your business logic should sit in the middle and the outside world (databases, screens, APIs, tests) should plug into it through simple, agreed-upon shapes. Small worked examples in Python, Go, and Rust show what changes when a new requirement arrives."
tags = ["architecture", "hexagonal-architecture", "software-design", "python", "go", "rust", "fundamentals"]
categories = ["Fundamentals"]
ShowToc = true

[cover]
image = "/images/og/hexagonal-architecture-in-plain-language.png"
hiddenInList = true
hiddenInSingle = true
+++

Most explanations of hexagonal architecture start by telling you what a *port* is. Then they tell you what an *adapter* is. Then they draw a hexagon. Then, ten minutes in, you're still not sure why any of this would help you finish the ticket you were working on.

Let me try a different opening.

You have a function that does a real thing your business cares about — processes an order, calculates a bill, moves a file. Over the next year, three things happen: the database changes, someone asks for a mobile app that hits the same logic, and a bug shows up that you can only reproduce when the payment processor is slow. Each of those things is a normal, reasonable request. Each of them is agony to accommodate — because the function was written the way most functions get written the first time: it reaches out and talks directly to the database, directly to the payment API, directly to whatever it needs. When any one of those things changes, the function has to change too.

Hexagonal architecture is a way of writing that function so those three things stop hurting. That's the whole idea. The hexagon and the vocabulary are just the packaging.

## The idea, without any diagrams

Here's what it comes down to, in one sentence: **put your business logic in the middle, and let the outside world plug into it through simple shapes you defined.**

The "middle" is the code that knows what your business actually does. Rules like *an order over $100 gets free shipping*, *a user with three failed login attempts gets locked out for ten minutes*, *invoices are numbered sequentially per calendar year*. This code doesn't know or care whether the data came from Postgres or a CSV file. It doesn't know or care whether it's being called from an HTTP handler or a scheduled job or a test. It just knows the rules.

The "outside world" is everything else — the database that stores the data, the screen that shows it, the API that sends it, the email service that notifies the user, the message queue that dispatches jobs. Each of these is a *different technology*, and each one changes on its own schedule. The database gets migrated. The frontend gets rewritten. The email service gets swapped out. Every one of those changes should be a small, contained change, not a rewrite.

The way you make that work is by having your business logic **describe what it needs** in its own terms — "I need something that can save an order and give it back to me later" — and then letting the technology-specific code **provide** that thing in whatever way the technology allows. Postgres provides it one way. A CSV file provides it another way. A fake in-memory version provides it a third way for testing. The business logic doesn't care which one it got.

That's it. That's the whole pattern. The rest is mechanics.

## A kitchen makes it concrete

Imagine a pizza kitchen. In the middle of the kitchen is the cook and the recipe book. That's the business logic. The cook knows the recipes — the temperatures, the timings, the ratios. That knowledge doesn't change if the restaurant switches from paper order tickets to a tablet. It doesn't change if they switch suppliers for the flour.

Around the kitchen are windows and doors:

- A window at the front counter where a customer places an order.
- A phone that takes orders from the delivery driver's app.
- A tablet where the online-ordering system drops orders.
- A back door where the flour delivery arrives.
- A refrigerator that supplies the cheese.
- An oven that turns raw dough into cooked pizza.

The cook uses all of these — but the cook doesn't care that the online orders come from a tablet made by a specific vendor. What the cook needs is *an order*, in a format the cook can read. The tablet's job is to hand the cook an order in that format. If the tablet gets replaced next year with a smartwatch, the cook does nothing differently. The smartwatch also hands the cook an order in that format.

The kitchen is your business logic. The windows, doors, phones, tablets, and appliances are the *technology-specific code* that adapts each outside thing to the format your business logic expects. That's the hexagonal pattern. The shape you draw around the kitchen — whether it's a hexagon or a circle or a square — doesn't matter, and never has.

## A picture, for the readers who want one

```text
                    +---------------------+
   HTTP requests -->|                     |<-- PostgreSQL
      CLI args   -->|   Business logic    |<-- SendGrid (email)
   Message queue -->|   (recipes, rules,  |<-- File storage
       Tests     -->|    calculations)    |<-- In-memory fake (tests)
                    |                     |
                    +---------------------+
                     ↑                   ↑
              "driving" side      "driven" side
              (things that        (things the
               call in)            core calls out to)
```

Some things call *in* to the business logic — HTTP handlers, CLI commands, test cases, scheduled jobs. Some things get called *out* to by the business logic — databases, notification services, file storage. In the original vocabulary these are "driving" and "driven" (or "primary" and "secondary"), but the concept is what matters, not the name.

The critical part is what those arrows *don't* look like: **nothing on the outside reaches through the box.** HTTP handlers don't reach into the database directly. The database code doesn't reach into the email service directly. Every interaction with the business logic goes through the boundary — through a shape the business logic itself defined.

## The story of a small change gone bad

Let me show you what this pattern actually prevents. Here's a small Python function that processes an order — direct, straightforward, no cleverness. This is how everyone writes it the first time.

```python
import psycopg2
import requests

def process_order(user_id: int, item_ids: list[int], total_cents: int):
    # Talk to Postgres directly
    conn = psycopg2.connect("postgres://prod-db/orders")
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO orders (user_id, total_cents) VALUES (%s, %s) RETURNING id",
        (user_id, total_cents),
    )
    order_id = cur.fetchone()[0]
    for item_id in item_ids:
        cur.execute(
            "INSERT INTO order_items (order_id, item_id) VALUES (%s, %s)",
            (order_id, item_id),
        )
    conn.commit()

    # Talk to SendGrid directly
    requests.post(
        "https://api.sendgrid.com/v3/mail/send",
        headers={"Authorization": f"Bearer {SENDGRID_KEY}"},
        json={
            "personalizations": [{"to": [{"email": get_user_email(user_id)}]}],
            "from": {"email": "orders@example.com"},
            "subject": "Order confirmed",
            "content": [{"type": "text/plain", "value": f"Your order {order_id} is confirmed."}],
        },
    )

    return order_id
```

That works. It's readable. It ships.

Now let's have three requirements land over the next six months.

**Requirement 1 — Testing.** You need automated tests. But this function reaches directly into Postgres and directly into SendGrid. Running the test either requires a real Postgres and a real SendGrid account (slow, flaky, and now every developer needs credentials), or requires monkey-patching `psycopg2` and `requests` at import time (fragile — a rename in the underlying library breaks the test). Neither option is nice. You add a couple of tests, they're brittle, they break unrelated to the code they test, and the team quietly stops writing them.

**Requirement 2 — A different notification channel.** Marketing wants order confirmations to also go via SMS for premium customers. You open `process_order`. You add a branch: `if is_premium(user_id): send_sms(...) else: send_email(...)`. Now the function knows about SMS providers, email providers, *and* what "premium" means. When the team decides to add Slack notifications for internal orders, you'll add a third branch. When they say "actually, send email *and* SMS, not one or the other," you'll rewrite the branching logic. Every notification change edits the same function.

**Requirement 3 — Move off Postgres to a different database.** The company is standardizing on a new database. You open `process_order`. Every SQL statement has to change. The connection setup has to change. The transaction semantics have to change. And the "just moving the database" change has now touched the file that owns the business rule for what an order is.

None of these changes is fundamentally hard. The reason they *feel* hard is that they're all landing in the same file, on top of the business rule, all editing the same function. Every change risks breaking every other concern the function carries.

Now the same function, written with hexagonal thinking. Same behavior, differently organized:

```python
from typing import Protocol

# The business logic describes what it needs, in its own words.
class OrderRepository(Protocol):
    def save(self, user_id: int, item_ids: list[int], total_cents: int) -> int: ...

class Notifier(Protocol):
    def notify(self, user_id: int, message: str) -> None: ...

# The business logic itself. Notice what it does and doesn't do.
def process_order(
    user_id: int,
    item_ids: list[int],
    total_cents: int,
    repo: OrderRepository,
    notifier: Notifier,
) -> int:
    order_id = repo.save(user_id, item_ids, total_cents)
    notifier.notify(user_id, f"Your order {order_id} is confirmed.")
    return order_id
```

That's the whole business logic. Two lines that matter. No Postgres, no SendGrid, no HTTP, no imports of anything from outside the business itself. If you close your eyes and describe what this function does, the description matches what the code does — no gap between the intent and the implementation.

The technology-specific code lives elsewhere, in its own files:

```python
# postgres_repository.py — one adapter for saving orders
import psycopg2

class PostgresOrderRepository:
    def __init__(self, dsn: str):
        self.dsn = dsn

    def save(self, user_id, item_ids, total_cents):
        conn = psycopg2.connect(self.dsn)
        # ... same SQL as before ...
        return order_id

# sendgrid_notifier.py — one adapter for sending notifications
import requests

class SendGridNotifier:
    def __init__(self, api_key: str):
        self.api_key = api_key

    def notify(self, user_id, message):
        # ... same SendGrid call as before ...
```

The wiring — connecting the business logic to a specific set of adapters — happens at the edge, in a place like a `main.py` or an HTTP request handler:

```python
repo = PostgresOrderRepository(dsn="postgres://prod-db/orders")
notifier = SendGridNotifier(api_key=SENDGRID_KEY)
order_id = process_order(user_id, item_ids, total_cents, repo, notifier)
```

Now let's replay those three requirements.

**Testing.** You write a fake:

```python
class FakeRepository:
    def __init__(self):
        self.saved = []
    def save(self, user_id, item_ids, total_cents):
        self.saved.append((user_id, item_ids, total_cents))
        return len(self.saved)

class FakeNotifier:
    def __init__(self):
        self.messages = []
    def notify(self, user_id, message):
        self.messages.append((user_id, message))

def test_process_order():
    repo = FakeRepository()
    notifier = FakeNotifier()
    order_id = process_order(user_id=1, item_ids=[10, 11], total_cents=5000, repo=repo, notifier=notifier)
    assert order_id == 1
    assert notifier.messages == [(1, "Your order 1 is confirmed.")]
```

The test doesn't need Postgres, doesn't need SendGrid, doesn't monkey-patch anything, and runs in a millisecond. Every test is like this. Nobody quietly stops writing tests.

**SMS notifications.** Write a new adapter:

```python
class TwilioNotifier:
    def notify(self, user_id, message):
        # ... Twilio API call ...
```

Nothing in `process_order` changes. In fact, `process_order` could not tell you Twilio existed. If the business logic wants to send *both* email and SMS, that becomes its own new adapter (`MultiNotifier([SendGridNotifier(...), TwilioNotifier(...)])`) or the wiring code composes them. Either way, the business rule stays untouched.

**Move off Postgres.** Write a new adapter:

```python
class DynamoOrderRepository:
    def save(self, user_id, item_ids, total_cents):
        # ... DynamoDB call ...
```

Change one line of wiring: `repo = DynamoOrderRepository(...)`. `process_order` doesn't know the database changed. The old Postgres adapter can stay in the codebase (for the migration period) or be deleted. Either way, the business rule that defines what an order is has not been touched, and the risk of breaking it is zero.

That's the payoff. Every requirement change lands in one place, isolated from the others. Nothing infects anything else.

## The same idea in Go

Go doesn't have `Protocol`; it has interfaces. Interfaces are structurally typed — any type with the right methods satisfies them, no explicit `implements` keyword required. That's actually a nice fit for hexagonal thinking, because your adapters don't have to know about your ports at compile time; they just have to have the right method signatures.

```go
package orders

// The business logic describes what it needs.
type Repository interface {
    Save(userID int, itemIDs []int, totalCents int) (int, error)
}

type Notifier interface {
    Notify(userID int, message string) error
}

// The business logic itself.
func ProcessOrder(
    userID int,
    itemIDs []int,
    totalCents int,
    repo Repository,
    notifier Notifier,
) (int, error) {
    orderID, err := repo.Save(userID, itemIDs, totalCents)
    if err != nil {
        return 0, err
    }
    msg := fmt.Sprintf("Your order %d is confirmed.", orderID)
    if err := notifier.Notify(userID, msg); err != nil {
        return 0, err
    }
    return orderID, nil
}
```

A Postgres adapter is a struct with the right methods:

```go
package postgresadapter

type OrderRepository struct {
    DB *sql.DB
}

func (r *OrderRepository) Save(userID int, itemIDs []int, totalCents int) (int, error) {
    // ... SQL ...
}
```

Notice: `postgresadapter.OrderRepository` never mentions `orders.Repository`. It doesn't have to. As long as it has a `Save` method with the right shape, Go's compiler will accept it wherever a `orders.Repository` is expected. Adding a new adapter — Dynamo, in-memory, whatever — is a new package that just has to satisfy the same method set.

## The same idea in Rust

Rust uses traits — same idea as protocols/interfaces, expressed differently.

```rust
pub trait Repository {
    fn save(&self, user_id: u32, item_ids: &[u32], total_cents: u64)
        -> Result<u32, Box<dyn std::error::Error>>;
}

pub trait Notifier {
    fn notify(&self, user_id: u32, message: &str)
        -> Result<(), Box<dyn std::error::Error>>;
}

pub fn process_order(
    user_id: u32,
    item_ids: &[u32],
    total_cents: u64,
    repo: &dyn Repository,
    notifier: &dyn Notifier,
) -> Result<u32, Box<dyn std::error::Error>> {
    let order_id = repo.save(user_id, item_ids, total_cents)?;
    notifier.notify(user_id, &format!("Your order {} is confirmed.", order_id))?;
    Ok(order_id)
}
```

A Postgres adapter is a struct that `impl`s the trait:

```rust
pub struct PostgresOrderRepository { pool: Pool }

impl Repository for PostgresOrderRepository {
    fn save(&self, user_id: u32, item_ids: &[u32], total_cents: u64)
        -> Result<u32, Box<dyn std::error::Error>>
    {
        // ... sqlx or diesel calls ...
    }
}
```

Rust's `impl Trait for Struct` is explicit where Go's is implicit and Python's is duck-typed, but the shape is identical: the business function accepts something that fits the trait, and the concrete type — Postgres, in-memory, mock — plugs in at the call site.

Three languages, one pattern. Notice what didn't change: the *business function itself* looks essentially the same in all three, and none of the three business functions imports a database library, an HTTP client, or a notification SDK. That's the whole point.

## Extending behavior by adding an adapter

The most valuable property of the pattern is what happens when a new requirement arrives that you didn't plan for.

Say six months from now, someone asks: *"can we start dispatching orders to a warehouse via a message queue when they're placed?"*

**Without hexagonal thinking**, that means opening `process_order`, adding a Kafka publish call in the middle of it, importing the Kafka library, adding a Kafka broker address to the config, and testing that the existing behavior didn't regress. The function grows a new concern. The next request grows another concern.

**With hexagonal thinking**, you add a new port:

```python
class WarehouseDispatcher(Protocol):
    def dispatch(self, order_id: int, item_ids: list[int]) -> None: ...
```

You add it as an argument to `process_order`:

```python
def process_order(user_id, item_ids, total_cents, repo, notifier, dispatcher):
    order_id = repo.save(user_id, item_ids, total_cents)
    notifier.notify(user_id, f"Your order {order_id} is confirmed.")
    dispatcher.dispatch(order_id, item_ids)
    return order_id
```

You write one adapter — `KafkaWarehouseDispatcher` — that knows how to publish to Kafka. You wire it in at the edge. You write a `FakeWarehouseDispatcher` for tests. The business function grew one line. Every adapter is independent of every other adapter. The Kafka library only appears in the one file that knows about Kafka.

Now imagine the request after that: *"actually, warehouse dispatch should go to a different warehouse depending on the item type, and premium customers get priority routing."* In the tangled version, that logic layers onto the existing branching mess. In the hexagonal version, that's *business logic* — it belongs in the core, not in the Kafka adapter. The Kafka adapter still just does "publish to Kafka." The core function grows a rule; the adapters don't change.

The compounding effect is the point. Each requirement lands where it belongs — infrastructure changes in adapters, business rule changes in the core — and neither side infects the other.

## When you don't need this

Not every codebase should be structured this way. A one-file script, a throwaway prototype, a five-line utility — writing a `Notifier` protocol for a function that will only ever call `print` is over-engineering for its own sake. The pattern earns its keep when:

- The code will live for more than a few months
- More than one person will change it
- The business logic is likely to outlive at least one of its dependencies (databases, external APIs, UI frameworks)
- Testability matters — usually because bugs are expensive or the domain is complex

If none of those apply, write it the direct way and revisit the shape when the code shows you it needs to change. The pattern is a tool, not an obligation.

Conversely, if you're writing a system where you *know* you'll need to change the database in three years, or you *know* you'll need to add three notification channels, or you *know* the business rule is going to be the stable center around which everything else moves — start with the hexagonal shape from day one. The initial cost is a few extra function arguments; the recurring benefit is that every requirement change stays small.

## Two names for the same idea, and some cousins

The pattern was formalized by **Alistair Cockburn** in a [2005 paper](https://alistair.cockburn.us/hexagonal-architecture/) — though he'd been describing it in different forms since the 1990s. He originally called it *"Hexagonal Architecture"* and later renamed the concept *"Ports and Adapters"* to make the vocabulary more descriptive. Both names refer to the same thing. He also published a [book on the subject in April 2024](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)) — recommended if you want the primary source in a single volume.

Two related patterns show up in the same conversation often enough that they're worth naming:

- **[Onion Architecture](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)** (Jeffrey Palermo, 2008) — the same core idea, drawn as concentric rings with more explicit prescriptions about which ring depends on which. If hexagonal architecture says "put the business logic in the middle," onion architecture says "and here are the specific layers around it."
- **[Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)** (Robert Martin, 2012) — a synthesis of hexagonal, onion, and a few other patterns into one prescription. Same underlying insight, formalized further.

For most projects, you don't need to pick between the three. Applying the hexagonal insight — business logic in the middle, technology-specific code adapts to it — gets you 80% of the value. The finer distinctions between hexagonal, onion, and clean matter mostly when you're doing greenfield architecture for a system that will grow to millions of lines of code.

## The one thing to take away

If you take one idea from this post: **the business logic should describe what it needs, and the outside world should adapt to fit.** Not the other way around.

Every time you find yourself editing a function that "handles orders" because the database changed, or because the notification service changed, or because you're adding a mobile client — the function was doing too much. Extract the business rule to a place that only knows about the rule. Extract the technology-specific parts to places that only know about the technology. Connect them through a shape you defined.

Do it once, on a function that hurts, and see how it feels. If the pain doesn't come back on the next requirements change, you'll know why the pattern has survived twenty years of software fashion cycles. If it does come back, you'll have learned something about how the pattern fits your specific situation. Either way, it's a good afternoon spent.

The hexagon on the whiteboard, it turns out, was never the point.

## Where to read more

- **[Cockburn, Hexagonal Architecture (2005)](https://alistair.cockburn.us/hexagonal-architecture/)** — the original paper. Short, direct, and the source everyone else is quoting.
- **[Hexagonal architecture on Wikipedia](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software))** — solid overview with historical context and pattern relationships.
- **[Palermo, The Onion Architecture (2008)](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)** — the sibling pattern; useful for seeing the same idea framed differently.
- **[Martin, The Clean Architecture (2012)](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)** — the synthesis pattern; useful for the concentric-rings diagram if you learn visually.
