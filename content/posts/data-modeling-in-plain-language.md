+++
title = "Data modeling in plain language"
date = "2026-08-11T14:44:54-04:00"
draft = false
description = "A jargon-free introduction to data models and data modeling — what a data model actually is, how they're typically represented (ER diagrams, relational schemas, JSON structures, dimensional models), and why deciding the shape of your data before writing the code that manipulates it is usually the cheapest work you'll do all quarter."
summary = "A jargon-free introduction to data models and data modeling — what a data model actually is, how they're typically represented (ER diagrams, relational schemas, JSON structures, dimensional models), and why deciding the shape of your data before writing the code that manipulates it is usually the cheapest work you'll do all quarter."
tags = ["data-modeling", "software-design", "databases", "architecture", "fundamentals"]
categories = ["Fundamentals"]
ShowToc = true

[cover]
image = "/images/og/data-modeling-in-plain-language.png"
hiddenInList = true
hiddenInSingle = true
+++

A team I worked with once shipped a signup flow in a weekend. It had a `users` table with a column called `address` — one string, freeform, whatever the customer typed. Two months later marketing asked a reasonable question: could we ship a promotion to everyone in three specific ZIP codes? Nobody could answer it. The `address` field held "123 Main St, Anywhere, NY 10001" for some customers, "PO Box 88 — please leave at back door!!" for others, and one memorable entry that was just the word `home`. There was no way to filter by ZIP code without writing a parser, and no way to build a reliable parser because the data was genuinely inconsistent. The fix wasn't a code change — the code did exactly what it was told. The fix was a *data model change*: split `address` into `street`, `city`, `state`, `postal_code`, `country`, backfill the old rows (imperfectly), and rewrite every place in the app that had assumed `address` was a single string.

That's the failure this whole discipline exists to prevent. And it costs almost nothing to prevent, if you do it before the first row lands in production.

The single most useful question I ask before writing the first line of code that stores something is: *if I need to answer a new question about this data six months from now — a question nobody has asked yet — will my model let me answer it, or will it force a migration?* Most of the time you'll settle for a model that requires *some* future migration, because you can't predict everything. But the question surfaces the tradeoffs so you can make them on purpose instead of by accident.

## What a data model actually is

A **data model** is the description of *what your system knows about* and *how those things relate to each other*, expressed in a form precise enough that a database, an API, and every developer on the team can all agree on the same meaning.

That's it. It's not a specific tool, it's not a specific diagram, and it's not tied to any particular database technology. A data model exists whether you write one down or not — if your system stores data, it *has* a model, the same way a house has a floor plan whether or not anyone ever drew one. The choice you're making isn't whether to have a model; it's whether the model is deliberate or accidental.

A useful data model captures four kinds of thing:

1. **Entities** — the nouns your system knows about. Customer, order, product, invoice, appointment, video, message.
2. **Attributes** — the facts you record about each entity. A customer has a name, an email, a signup date. An order has a total, a placed-at timestamp, a status.
3. **Relationships** — how entities connect. A customer *places* orders. An order *contains* line items. A video *belongs to* a channel.
4. **Constraints** — the rules that must always be true. An email is unique per customer. An order total is never negative. An appointment can't overlap another appointment on the same calendar.

Everything else — indexes, storage engines, replication, partitioning, JSON-vs-columnar, all the shiny infrastructure choices — is a *physical* concern. It matters, but it matters *after* you know what you're storing and why. Deciding the physical layer without deciding the logical layer first is like deciding what brand of nails to buy before you've drawn the floor plan.

## The three levels, and why the split matters

The most durable framework for talking about data models is the **three-schema architecture** proposed by the ANSI/SPARC study group in 1975 (Tsichritzis and Klug's report is the canonical citation). It splits any data model into three levels:

- **Conceptual model** — what the business knows and cares about, in the business's own vocabulary. "A customer places orders. An order has line items. A line item refers to a product." No mention of tables, columns, foreign keys, or any specific technology. If you handed this to a domain expert who has never seen a database, they should be able to read it and correct you.
- **Logical model** — the same content, expressed in the shape a specific *kind* of database would use. For a relational database, this is where tables, columns, primary keys, and foreign keys appear. For a document store, it's the shape of the documents. For a graph database, it's node types and edge types. Still no mention of a specific product.
- **Physical model** — how the logical model actually lives on disk in a specific product. Postgres or SQL Server, indexes, storage engine, partitioning, replication topology, materialized views, sharding keys.

The reason to keep these separate is that they change on different schedules and for different reasons. The conceptual model changes when the business changes ("we now sell to organizations, not just individuals"). The logical model changes when you learn something new about how the data is queried ("we need to look orders up by customer and by date, so we'll denormalize a customer name onto orders"). The physical model changes when scale changes ("we need to shard by customer_id"). When these are tangled — when the conceptual meaning of "customer" is embedded in an index decision — every one of those changes becomes expensive.

Most professionally-run projects skip writing the conceptual layer explicitly and jump to the logical layer, because the logical layer is where the tools live (ERD software, migration frameworks, ORM class definitions). That's usually fine for small systems. It becomes a problem the moment a business person and an engineer disagree about what a word means and there's no shared artifact to point at.

## How data models are typically represented

There are several common notations for expressing a data model. They aren't rival technologies — they're different views optimized for different audiences and different kinds of database.

### Entity-relationship diagrams (Chen notation, then IE/"crow's foot")

The original ER diagram was introduced by **Peter Chen** in his 1976 paper [*The Entity-Relationship Model — Toward a Unified View of Data*](https://csc.lsu.edu/~chen/pdf/erd-5-pages.pdf) in *ACM Transactions on Database Systems*. Chen's original notation drew entities as rectangles, relationships as diamonds between them, and attributes as ovals hanging off the entities. It's expressive but verbose.

Almost every diagramming tool today uses **Information Engineering notation**, better known as *crow's foot* — entities are still rectangles, but relationships are just lines between them, and the line's endpoints carry symbols showing cardinality. A single vertical bar means "exactly one," a circle means "zero or one," a crow's foot (three splayed lines) means "many." So a line ending with a bar on the `customers` side and a crow's foot on the `orders` side reads: *one customer has many orders, and every order belongs to exactly one customer*.

```text
+-----------+        +-----------+        +--------------+
| customers |1------<| orders    |1------<| line_items   |
+-----------+        +-----------+        +--------------+
| id (PK)   |        | id (PK)   |        | id (PK)      |
| email     |        | customer_id (FK)   | order_id (FK)|
| name      |        | placed_at |        | product_id   |
+-----------+        | total     |        | quantity     |
                     +-----------+        +--------------+
```

That's a logical ER diagram. It tells you what the tables are, what columns they have, and how they connect. It doesn't tell you which columns are indexed, which are nullable, or what happens on cascade delete — those are physical decisions, layered on top.

### Relational schema (SQL DDL)

Once the logical model exists, its most compact representation is the SQL that creates it. This is the shape most engineers actually read and modify day-to-day:

```sql
CREATE TABLE customers (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
    id            BIGSERIAL PRIMARY KEY,
    customer_id   BIGINT NOT NULL REFERENCES customers(id),
    placed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_cents   BIGINT NOT NULL CHECK (total_cents >= 0)
);

CREATE INDEX orders_by_customer ON orders(customer_id);
```

Every constraint the ER diagram implied — the foreign key, the uniqueness, the non-nullness, the "total is never negative" rule — is expressed in the DDL and enforced by the database itself. That's the payoff for using a database that supports constraints: the model isn't just a document, it's *executable*, and any code that tries to violate it fails loudly. This is Edgar Codd's original insight from his 1970 CACM paper [*A Relational Model of Data for Large Shared Data Banks*](https://www.seas.upenn.edu/~zives/03f/cis550/codd.pdf) — that structure and constraint could be expressed in a form the database itself understands, so the database can defend its own consistency without relying on every application to be careful.

### JSON Schema (for document stores and APIs)

If you're using a document database (MongoDB, DynamoDB, Firestore) or defining the shape of an API payload, the same modeling ideas live in **JSON Schema**:

```json
{
  "type": "object",
  "required": ["id", "customer_id", "placed_at", "total_cents"],
  "properties": {
    "id":          { "type": "string" },
    "customer_id": { "type": "string" },
    "placed_at":   { "type": "string", "format": "date-time" },
    "total_cents": { "type": "integer", "minimum": 0 },
    "line_items": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["product_id", "quantity"],
        "properties": {
          "product_id": { "type": "string" },
          "quantity":   { "type": "integer", "minimum": 1 }
        }
      }
    }
  }
}
```

Notice the tradeoff: line items are *nested inside* the order document, instead of living in a separate `line_items` table with a foreign key. That's a real modeling choice, not a stylistic one. It makes "give me the order and everything in it" a single fast read. It makes "give me every order that contains product X" harder, because you now have to scan through nested arrays instead of joining on an indexed column. There's no free lunch in modeling; every shape optimizes some questions and pessimizes others.

### UML class diagrams

Object-oriented codebases often express the model as **UML class diagrams** — boxes with three horizontal sections (class name, attributes, methods), connected by lines annotated with cardinality. UML is more expressive than ER (it can capture inheritance, methods, and interface relationships) but the extra expressiveness often gets in the way when you just want to talk about data. Most teams use UML for application design and ER for database design, and only reach for UML on data when inheritance is genuinely load-bearing.

### Dimensional models (star and snowflake schemas)

For analytics workloads, the dominant modeling style is **dimensional modeling**, formalized by **Ralph Kimball** in *The Data Warehouse Toolkit* (1996). A dimensional model organizes data into two kinds of table:

- **Fact tables** — the events or measurements. One row per order, or per pageview, or per sensor reading. Contains foreign keys to dimensions and numeric measures.
- **Dimension tables** — the descriptive context. Customer, product, date, geography. One row per real-world thing, with many descriptive columns.

The result is called a *star schema* because a diagram of one fact table connected to its dimensions looks like a star. It's a deliberately different shape from a transactional model — it trades write efficiency for read simplicity, because analytics workloads read the same tables thousands of times and rarely mutate them. Trying to run analytics on a normalized transactional schema and trying to run transactions on a star schema both work, and both hurt.

### Domain-driven vocabulary

**Eric Evans**' *Domain-Driven Design* (2003) is worth naming here, even though it's not a notation. DDD's contribution is to insist that the words in the data model be the *same words the business uses*, and to treat mismatches between business vocabulary and system vocabulary as a bug. That's not a diagramming technique; it's a discipline for keeping the conceptual layer honest. When a data model uses names like `entity_1` and `data_object`, or when engineers translate "customer" into `client` because the ORM has a naming convention, DDD is what pushes back.

## Why model first, not after

The strongest argument for modeling before implementing is one I first read in **Martin Fowler**'s *Patterns of Enterprise Application Architecture* (2002): **data outlives applications.** The Java framework you're using today will not be the Java framework you're using in seven years. The frontend will be rewritten. The mobile app will be replaced. The service layer will be broken up and reassembled. All of those changes are relatively cheap. The one thing that will still be there — and still be expensive to change — is the data. Customer records from your first year still need to work with the tenth version of your application.

The consequence is that a data-model mistake has an unusually long half-life. A bad function name gets renamed in five minutes. A bad column name in a table with fifty million production rows has a rewrite plan, a migration window, a rollback strategy, and a support ticket queue. This asymmetry is what earns modeling its up-front time. An hour spent on the whiteboard with the domain expert routinely prevents weeks of migration work eighteen months later.

There are five specific failure modes that early modeling prevents:

1. **The `address` problem** — using a freeform string where the business will eventually want to query on the parts. Any field the business will filter, group, or report on needs to be structured *now*, not later.
2. **The identity problem** — using a natural key (email address, phone number, employee ID) as a primary key and later discovering those values change. Every table that referenced the old value now points at nothing. Modeling forces the question *is this value stable for the entity's whole life?* early enough to answer it correctly.
3. **The premature nesting problem** — jamming multiple entities into one JSON blob (a document that contains its own comments, which contain their own reactions, which contain their own authors, all inline) because it was faster on day one. When you need to look up "everything one person has commented on," you're scanning every document in the collection.
4. **The premature normalization problem** — the opposite failure. Splitting one obvious entity into five tables because a textbook said to, and then paying five joins on every read for the rest of the system's life. Normalization is a tool, not a goal.
5. **The vocabulary drift problem** — engineers name a table `clients`, sales calls them `customers`, finance calls them `accounts`, and every conversation between the three groups spends the first ten minutes clarifying which one anyone means. Getting the vocabulary right in the model is the cheapest way to enforce it across the org.

Every one of these is prevented by an hour of conversation before the first migration lands. Every one of them takes weeks or months to fix in production.

## Steelmanning the "just start coding" position

I'm writing this from the position of an engineer who has paid the cost of skipping the modeling step more times than they'd like to admit. But the opposing position — *stop drawing diagrams and start shipping* — is real, and it deserves its strongest form before I disagree with it.

**"We don't know what we're building yet, so any model we draw will be wrong."** This is true. Early-stage products discover their real requirements by contact with users, and a model drawn on day one will not survive month three. The response is not to skip the model but to *keep it cheap*. A one-page ER sketch, a paragraph naming the entities, a shared vocabulary — none of that takes a day. What takes days and gets you in trouble is a fifty-page data-architecture document that goes stale the moment the first customer hits the app. Modeling scales down; modeling *ceremony* is what shouldn't.

**"The ORM will figure the schema out from the code."** Popular frameworks (Rails, Django, Prisma, Ent, Ecto) do let you define your model as classes and generate migrations. That works, and it's a productivity multiplier. But the classes *are* the model — the framework didn't remove modeling, it moved where you do it. If the class definitions are haphazard, the schema will be haphazard. The failure mode isn't "used an ORM"; it's "wrote classes without ever thinking about them as a data model."

**"YAGNI — you aren't going to need it."** True for functionality; less true for data shape. The cost of *adding* a feature you didn't build yet is roughly linear. The cost of *changing the shape of data* you already have in production is nonlinear in the amount of data and the number of dependent systems. YAGNI is right that you shouldn't build the checkout flow before the browse flow; it's misapplied when it says "don't decide whether an address is one string or five columns."

**"We'll refactor when we need to."** Refactoring code is a well-understood engineering activity. Refactoring the shape of live production data is a very different activity — it involves migrations that run against real rows, backfills that are usually imperfect, downtime windows or online-migration tooling, and a support surface for however many customers hit edge cases the backfill didn't handle. Some of this is unavoidable; a mature system will always evolve its schema. But every avoidable data refactor is one you're going to wish you had prevented at design time.

The healthy synthesis of both positions: **model lightly, model early, model in a form that changes as cheaply as code does.** A sketch on paper is more valuable than an elaborate diagram in a specialized tool nobody opens; a shared vocabulary in a README is more valuable than a formal ontology that lives in Confluence. The goal is the *shared understanding*, not the artifact.

## What data modeling does not do

This is where honesty matters. Data modeling is a high-leverage activity, but it is not a substitute for several other things, and pretending otherwise is how it earned the reputation of ivory-tower work in the 1990s.

- **It won't catch bad requirements.** If the business tells you a customer has one address and it turns out customers have shipping and billing addresses, the model will faithfully be wrong. Modeling is a conversation with the domain expert; the model can only be as good as that conversation.
- **It won't decide your performance profile.** A perfectly normalized model can be catastrophically slow at read time and vice versa. Physical decisions (indexes, denormalization, caching, partitioning) exist as a separate layer of thought — the logical model informs them but doesn't determine them.
- **It won't stop drift.** A model that was correct on the day it was drawn becomes incorrect as the business evolves. Modeling is a discipline you maintain, not a one-time artifact. Every team I've seen have long-term success with data modeling has some ritual — quarterly reviews, an ADR every time an entity is added, a "data model office hours" — that keeps the model and the code from diverging.
- **It won't design your APIs, your events, or your search index.** Those all have their own modeling decisions, and copying the transactional schema verbatim into an API is one of the most common ways to end up with a bad API. The transactional model is the source of truth; every derived surface (API, event, warehouse, search) is a *view* of it, shaped for its own audience.
- **It won't save you from schemaless data at the edges.** User-entered notes, file uploads, third-party payloads — all of that will eventually land in your system as freeform blobs. The model tells you where those blobs live and what promises the system does (and doesn't) make about them; it doesn't magically give them structure.

The value of naming these limits is that it prevents the failure mode where a team spends weeks on a data model and then treats the modeling artifact as though it has solved problems it hasn't touched. It hasn't. The rest of the engineering work still has to happen.

## What to actually do this week

If you're building a new system:

1. **Name the entities out loud** with a domain expert, using their words. Write them on a whiteboard or a page. Ten to fifteen minutes. Count how many times you have to stop and clarify what a word means — every clarification is a modeling win that would have cost you months later.
2. **Draw the relationships.** Which entity contains which? Which references which? Which cardinalities are one-to-one, one-to-many, many-to-many? Nothing fancy — boxes and lines, cardinality noted in the endpoints.
3. **For every attribute, ask "will we ever query, sort, filter, group, or report on this?"** If yes, it needs to be its own structured column, not buried in a freeform blob or nested string.
4. **For every identity, ask "is this stable for the entity's whole life?"** If not, use a surrogate key (a system-generated ID) as the primary key and let the natural value drift.
5. **Write it down in a form that changes as cheaply as the code does.** A `docs/data-model.md` with a plain-English list and an ER diagram in Mermaid or PlantUML text is a better artifact than a diagram in a proprietary tool nobody opens.

If you're inheriting a system:

1. **Reverse-engineer the model from the schema** in one sitting. Even a one-page picture of "what tables exist and how they connect" is often something the current team has never had.
2. **Sit with a domain expert and read the picture together.** Wherever their vocabulary and the schema's vocabulary diverge, mark it. Those are the places where future changes will be expensive.
3. **Pick one entity where the model is wrong and would be expensive to leave wrong.** Model the target shape. Now you have a north star for future work, even if you can't migrate immediately.

Neither of these is expensive. Both compound.

## The one thing to take away

If you take one idea from this post: **the shape of your data is the most durable decision your system will make, so decide it deliberately, not accidentally.** Everything else in the codebase can be refactored; the shape of the data you've already collected cannot, without cost.

You don't need an elaborate methodology and you don't need a specialized tool. You need to sit with a domain expert for an hour, name the nouns, draw the lines, and write it down somewhere your team will actually read. Do that once, before the first migration lands, and you will save yourself a year of the small, boring, expensive work that comes from a schema that didn't quite fit.

The whiteboard, it turns out, is where the cheapest hour of your quarter gets spent.

## Where to read more

- **[Chen, *The Entity-Relationship Model — Toward a Unified View of Data* (1976)](https://csc.lsu.edu/~chen/pdf/erd-5-pages.pdf)** — the original ER paper. Short, direct, and still worth reading fifty years later.
- **[Codd, *A Relational Model of Data for Large Shared Data Banks* (1970)](https://www.seas.upenn.edu/~zives/03f/cis550/codd.pdf)** — the founding paper of relational databases. The insight that structure can be *enforced* by the database itself starts here.
- **Fowler, *Patterns of Enterprise Application Architecture* (2002)** — the "data outlives applications" argument is made throughout; the chapters on domain logic and data mapping are the ones to start with.
- **Kimball & Ross, *The Data Warehouse Toolkit* (3rd ed., 2013)** — the canonical reference for dimensional modeling; the first few chapters are enough to grasp when to reach for a star schema and when not to.
- **Evans, *Domain-Driven Design* (2003)** — the discipline of keeping the model's vocabulary aligned with the business's vocabulary. The "ubiquitous language" chapter is the one that matters most for data modeling.
- **Date, *An Introduction to Database Systems* (8th ed., 2003)** — the textbook that most computer-science undergraduates who studied databases will have read. Denser than the others; worth it if you want the theory underneath the practice.
