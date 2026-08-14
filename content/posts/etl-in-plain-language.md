+++
title = "ETL in plain language"
date = "2026-08-14T17:38:36-04:00"
draft = false
description = "A jargon-free introduction to ETL — what Extract, Transform, and Load actually mean; the vocabulary (source system, staging area, warehouse, mart, DAG, batch vs streaming, ELT, CDC) defined without hand-waving; concrete examples of what an ETL process looks like; and how to decide when an organization actually needs one."
summary = "A jargon-free introduction to ETL — what Extract, Transform, and Load actually mean; the vocabulary defined without hand-waving; concrete examples; and how to decide when an organization actually needs one."
tags = ["etl", "data-engineering", "data-warehouse", "pipelines", "fundamentals"]
categories = ["Fundamentals"]
ShowToc = true

[cover]
image = "/images/og/etl-in-plain-language.png"
hiddenInList = true
hiddenInSingle = true
+++

A regional retailer I worked with once had six systems that each thought they owned the truth about a customer. The point-of-sale system knew what people bought in stores. The e-commerce platform knew what they bought online. The loyalty program knew their points balance. The email vendor knew what campaigns they'd opened. The returns system knew what they'd sent back. The support desk knew what they'd complained about. Every Monday morning, the head of marketing wanted a single report: *for customers who returned an item last week, how many opened our follow-up email, and how many purchased again in the next seven days?* Answering that question required a person — usually the same person — to export six CSVs, open Excel, do a chain of `VLOOKUP` calls, hope the customer IDs matched across systems, and email a spreadsheet by lunchtime. It took most of a day, it broke whenever anyone renamed a column, and by the time the report arrived the week it described was already over.

That's the failure ETL exists to fix. *If you find your organization repeatedly answering the same cross-system question by hand, you're paying the cost of not having an ETL process — you've just spread the cost across so many people that nobody has added it up.*

The term itself is older than most people building modern data pipelines. It comes out of the data-warehousing work Bill Inmon and Ralph Kimball formalized in the 1990s ([*The Data Warehouse Toolkit*](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/), Kimball, first edition 1996). What's changed since then is the tooling, the cloud, and the sheer volume of data. What hasn't changed is the shape of the problem, or the shape of the answer.

## What ETL actually stands for

**ETL** is an acronym for three steps that happen in order:

- **Extract** — pull data out of a **source system**. A source system is any place your organization stores data as part of its day-to-day operations: a database that runs your web app, a spreadsheet a finance analyst maintains, an API from a vendor you pay (Stripe, Salesforce, HubSpot), a stream of events from your product, a file dropped nightly on an SFTP server by a supplier. The extract step is about *getting a copy*, not moving the original. The source system keeps running; the extract produces a snapshot.
- **Transform** — reshape that copy into something usable. Fix inconsistent date formats. Split "New York, NY 10001" into a city, a state, and a ZIP code. Convert prices from three different currencies into one. Drop rows that are obviously test data. Join a customer's ID from the CRM to the same customer's ID from the billing system. Assign every row a "loaded on" timestamp so you know when it arrived. Anything that turns raw data into data you'd trust in a report is part of the transform step.
- **Load** — write the transformed data into a **destination system** — usually a **data warehouse** (see below). Loading is not the same as inserting rows once; a real load step has to handle "the same customer already exists," "yesterday's version of this order is now updated," and "this row was here yesterday but should be gone today."

The order matters. Extract has to finish before transform can start (you can't reshape data you haven't pulled). Transform has to finish before load can start (you don't want to contaminate the destination with data that hasn't been cleaned). When one step fails, the next one shouldn't run.

## The vocabulary, defined without hand-waving

If you've read three ETL articles and still aren't sure what half the words mean, that's the fault of the articles, not you. Here's the working vocabulary, defined in the order it usually comes up:

- **Source system** — any operational system your business uses whose data you want to analyze. "Operational" means it exists to run the business, not to answer questions about it: the checkout database, the ticketing system, the ad platform. ETL treats every source system as a *read-only input*.
- **Data warehouse** — a database purpose-built to answer analytical questions across your whole business. It's optimized for reads, not writes; it usually holds years of history; and its schema is deliberately different from any single source system's schema. The common cloud warehouses today are Snowflake, BigQuery, Redshift, and Databricks. Historically, on-premises warehouses ran on Teradata, Oracle, or SQL Server.
- **Data mart** — a smaller, subject-focused slice of the warehouse. "The marketing mart," "the finance mart." Same shape as a warehouse, narrower scope. Marts exist so a marketing analyst doesn't have to know the whole schema to answer a marketing question.
- **Staging area** — an intermediate location where raw extracts land *before* they've been transformed or validated. Usually a set of tables or files that mirror the source systems' shape. Its whole purpose is to be a boundary — the place where you can check that today's extract looks reasonable before letting it near the warehouse.
- **Schema** — the structure of a dataset: what tables exist, what columns each has, what types those columns are, what relationships connect them. A schema is a *contract* — as soon as one system depends on another's schema, changing the schema without warning breaks the dependent system.
- **Pipeline** — the concrete implementation of a specific ETL process. "The customer pipeline runs every night at 2 a.m." Each pipeline usually corresponds to one flow of data from one or more sources into one destination shape.
- **Orchestrator** — the software that decides *when* pipelines run, *in what order*, and *what happens when one fails*. Common orchestrators: Apache Airflow, Dagster, Prefect, and the cloud-native scheduler that ships with your warehouse. Without an orchestrator, every pipeline is a cron job with no memory.
- **DAG** — short for *directed acyclic graph*. An orchestrator's mental model of a pipeline is a DAG of tasks: "extract the orders table," then "extract the customers table," then (once both are done) "join them," then "load the result." No cycles allowed, because a cycle would mean a task waiting on itself.
- **Batch** — an ETL pattern where data is processed in scheduled chunks: every 15 minutes, every hour, every night. The pipeline runs, finishes, and does nothing until the next scheduled tick. This is what most ETL processes actually do.
- **Streaming** — the alternative: data flows through the pipeline continuously as events arrive. Streaming systems (Kafka, Kinesis, Pub/Sub, Flink) are more complex to operate but let downstream consumers see data seconds after it's produced, not hours.
- **Idempotency** — a property of a load step. It's **idempotent** if running it twice with the same input produces the same result as running it once. This sounds academic and turns out to be the single most important operational property a pipeline can have — because the day a scheduled run fails halfway, you're going to rerun it, and a non-idempotent load will double-count everything the first run partially wrote. (I go deeper on this in [ETL's real failure mode is silent, not slow](/posts/etls-real-failure-mode-is-silent-not-slow/).)
- **ELT** — the same three letters in a different order: **Extract, Load, Transform**. Data lands in the warehouse *first* (as raw as possible), and transformations happen inside the warehouse as SQL. This has become the dominant pattern in the cloud-warehouse era because cloud warehouses are cheap to store data in and powerful enough to run the transform work as SQL. ETL and ELT are not different technologies; they're different answers to the question *where does the transform work happen?*
- **CDC** — *Change Data Capture*. A technique for extracting only what has changed in a source system since the last extract, usually by reading the database's transaction log rather than scanning tables. CDC is what makes low-latency pipelines possible without hammering the source.
- **Fact table** and **dimension table** — Kimball's vocabulary for how warehouse data is organized. A *fact* table holds the events or measurements (one row per order, per click, per sensor reading). A *dimension* table holds the descriptive context (customer, product, date, geography). Together they form a **star schema** — a shape optimized for the kind of "sum this measure, grouped by these dimensions" query analysts write all day. There's a longer treatment of this shape in the [data-modeling primer](/posts/data-modeling-in-plain-language/).
- **Data contract** — an explicit, agreed-upon promise between the team that produces data and the team that consumes it, covering the schema, the semantics ("what does `active_customer` mean?"), the freshness ("updated by 6 a.m. daily"), and the process for changing any of it. Data contracts are how mature organizations stop paying the "the marketing team quietly redefined the field and we found out from a broken dashboard" tax.

That's most of the working vocabulary. Everything else is a variation on one of these ideas.

## What an ETL process actually looks like

Abstractions harden faster with examples. Here are four sketches, each one a shape you'll recognize if you've worked in the corresponding kind of organization.

### Example 1 — the nightly analytics warehouse (retail)

A regional grocery chain has 82 stores, an online-ordering site, a loyalty program, and a small BI team that produces the weekly sales report. Data lives in:

- **PostgreSQL** running the e-commerce site (orders, customers, sessions)
- **The point-of-sale vendor's API** (transactions from every store, hourly export)
- **A SaaS loyalty platform** (points balances, redemption events, member metadata)
- **An SFTP drop** from the supplier that manages produce restocks (delivery manifests as CSV)

Every night at 2 a.m., an Airflow DAG runs. It **extracts** the day's changes from each of the four sources (using CDC for Postgres, an incremental API pull for the POS, a full snapshot for loyalty, and file downloads from SFTP). It lands the raw extracts in a staging schema in Snowflake. It runs a series of **transforms** — normalize timestamps to UTC, resolve customer IDs across the POS and e-commerce systems using a shared email-hash lookup, drop cancelled orders, categorize items into department hierarchies. Then it **loads** the transformed data into the warehouse's fact tables (`fact_orders`, `fact_pos_transactions`) and dimension tables (`dim_customer`, `dim_product`, `dim_store`, `dim_date`).

By 4 a.m. the DAG is done. When the BI team walks in at 8 a.m., yesterday's data is queryable in a single unified schema. The weekly sales report is a straightforward SQL query, not a `VLOOKUP` marathon.

This is the canonical ETL shape. It's also probably 70% of what an average enterprise data team is actually building on any given day.

### Example 2 — the mainframe modernization (financial services)

A bank has a 30-year-old mainframe running COBOL that produces the authoritative record of every account balance. It also has a modern web and mobile app running on cloud infrastructure. The web app can't query the mainframe directly (the mainframe is a shared resource with hard capacity limits, and the transaction cost of an ad-hoc query is measured in real dollars). It also can't move off the mainframe (that's a decade-long project already in progress).

The compromise: an ETL process runs every 15 minutes. It extracts a change file from the mainframe (delivered as EBCDIC-encoded fixed-width text), transforms it into a modern representation (converting EBCDIC to UTF-8, parsing fixed-width fields per a `COPYBOOK` schema, mapping legacy account-type codes to a modern enum), and loads it into a PostgreSQL database the web app can query.

Customers see "near-real-time" balances that are actually 15 minutes stale. The mainframe stays authoritative. The web app never touches it directly. Every part of the pipeline has to be defensive: the mainframe file is late 3% of the time, sometimes corrupt, and the encoding conversion has a specific edge case around the character `Ø` that took two years to fully diagnose.

This is a *shape* of ETL that most cloud-first engineers never encounter and financial-services engineers see every day. It's still ETL; it just runs on tighter latency and less forgiving inputs.

### Example 3 — the marketing attribution pipeline (SaaS)

A B2B SaaS company wants to answer: *for every closed deal last quarter, which marketing touches did the contact interact with in the preceding 90 days, in what order?* Data lives in:

- **Salesforce** (accounts, contacts, opportunities, closed deals)
- **HubSpot** (email opens, clicks, form submissions)
- **Google Ads and LinkedIn Ads** (impression and click logs, via their reporting APIs)
- **Segment** (product usage events from the web app)

Each of these has its own idea of who a "person" is. Salesforce identifies contacts by internal IDs. HubSpot uses its own IDs. Ad platforms use cookies and hashed emails. Segment uses anonymous IDs and user IDs.

The ETL process extracts from all four sources (using Fivetran or Airbyte for the SaaS connectors, direct API calls for the ad platforms, Segment's warehouse sync for events). It lands everything raw in a warehouse. The transform work — the hard part — is **identity resolution**: figuring out which HubSpot contact corresponds to which Salesforce contact corresponds to which anonymous website visitor. The load step writes a `fact_touchpoint` table with one row per marketing interaction, keyed to a resolved person and (where possible) a Salesforce opportunity.

Once that's in place, "which touches preceded a deal" is a windowed SQL query. The report that used to require a marketing operations manager to build a bespoke Excel model every quarter becomes a dashboard that refreshes itself.

### Example 4 — the operational reverse-ETL (product analytics)

Traditional ETL moves data *out of* operational systems and *into* an analytical warehouse. **Reverse ETL** moves data the other way — takes an aggregate the warehouse computed (`customer_health_score`, `days_since_last_purchase`, `predicted_churn_probability`) and pushes it *back into* an operational system (Salesforce, HubSpot, Braze, Intercom) so a customer-facing user can act on it.

An example: a data team calculates a customer health score every night in the warehouse. A reverse-ETL pipeline (built with a tool like [Hightouch](https://hightouch.com/) or [Census](https://www.getcensus.com/), or hand-rolled with a scheduled job) pushes that score into the Salesforce contact record every morning. When an account executive opens Salesforce, they see the score next to the account. They didn't have to open a dashboard, cross-reference it with the CRM, and hold both in their head — the number is where the work already happens.

Reverse ETL is technically the same three steps (extract from warehouse, transform to fit the destination's schema, load into an operational system). It's called out separately because the *direction* changes who owns what and how failures are handled. It's the fastest-growing shape of ETL today, and it exists specifically because the answers the warehouse produces are worthless if they don't reach the people making decisions.

## How to decide when your organization needs an ETL process

Not every organization needs one. The right question isn't *"should we build ETL?"* — it's *"is the cost of not having it now higher than the cost of building it?"* Here are the signals that push the answer toward *yes*:

1. **You are answering the same cross-system question repeatedly by hand.** If a person exports two or more CSVs, joins them in a spreadsheet, and emails the result — and that happens weekly or more often — you already have an ETL process. It's just running in a person's head and Excel, at the cost of that person's time and the accuracy their spreadsheet formulas can produce. Automating it usually pays for itself within a quarter.

2. **Your source systems can't handle analytical queries.** Transactional databases (the one behind your web app) are tuned for many small reads and writes. Analytical queries — "sum revenue by product category by month for the last three years" — scan huge amounts of data and can degrade the performance of the operational workload. If your engineering team is scared to let anyone run analytics against the production database, you need a separate place to run them.

3. **You need history the source system doesn't keep.** Most operational systems overwrite past state — the CRM shows the current owner of an account, not who owned it three months ago; the inventory system shows current stock, not what stock was on the shelf every day for the last year. If the business needs to answer historical questions ("what were sales in Q2 versus Q1 last year, in each region?"), someone has to be *keeping* that history. A warehouse loaded by ETL is where that history usually lives.

4. **You have more than a handful of data sources that need to be combined.** Two sources you can join by hand. Five sources you probably can't join by hand and stay sane. Ten sources without a pipeline is chaos. The threshold isn't precise, but the shape is: the complexity of combining sources grows faster than the number of sources, because every additional source can potentially need to be joined with every existing one.

5. **Analysts are producing reports that don't reconcile with each other.** When the head of finance's revenue number doesn't match the head of sales's revenue number, and both are technically "correct" (they're pulling from different systems with different definitions), what you're seeing is the absence of an authoritative shared source of truth. A warehouse — with the transform layer explicitly reconciling how each source defines revenue — is how you get one.

6. **You need to enforce data quality that the source systems don't.** Legacy systems have data-quality issues that can't be fixed at the source without breaking downstream production consumers. The transform step is where you can normalize, deduplicate, and validate without touching the source.

7. **You are being asked for reports faster than a person can produce them.** The Monday-morning marketing report example above is a soft version of this. A hard version is regulatory: some industries have to produce a specific report at a specific frequency and prove it was correct. That's not a job a person can reliably do; it's a job a pipeline does, with the person auditing the pipeline.

## When you probably don't need one yet

Because feature-skepticism is a virtue for data infrastructure specifically — every pipeline is a permanent maintenance burden, and unused pipelines are the worst kind — here are the signals that push the answer toward *not yet*:

- **You have one source system, one destination, and one report.** A cron job that runs a SQL query and emails a CSV is not "ETL," and calling it one adds ceremony without adding capability. Build the cron job.
- **All your analysts already have direct read access to the operational database and the query performance is fine.** In small companies with low data volumes, "just query the app database" works surprisingly well until it doesn't. It usually doesn't around the time you hit a couple million rows or the second time an analyst's query locks the production database.
- **Your data volume genuinely fits in a spreadsheet.** If your organization has a thousand customers, ten thousand orders a year, and one product line, the entire business will fit in a Google Sheet, and the operational overhead of a real warehouse and pipeline will dwarf the value. Revisit when the shape of the business changes.
- **You have no dedicated data engineer, no plan to hire one, and no budget for a managed pipeline tool.** ETL infrastructure that nobody owns rots faster than most software. If you can't credibly answer "who will fix this pipeline when it breaks at 3 a.m. on a Saturday," you shouldn't build it yet.

The pattern to notice: the case *for* ETL grows as data volume grows, as the number of sources grows, as the number of consumers grows, and as the cost of a wrong answer grows. The case *against* holds while all four of those are small.

## Steelmanning the alternatives

Whenever a genuinely useful pattern gets popular, several nearby patterns start marketing themselves as replacements. Each of them has a real case; each of them has a limit. The healthy version of the ETL conversation names both.

**"Just use ELT and skip the T for now."** This is the loudest current alternative, and it's not wrong. Cloud warehouses are cheap enough that landing raw data first and transforming later (as `dbt` models on top of it) has legitimate advantages: analysts can iterate on transformations without touching pipeline code, raw data is preserved for questions you didn't anticipate, and you decouple *when data lands* from *when it's clean*. The failure mode isn't in adopting ELT; it's in adopting ELT and then never actually writing the T. Two years later, downstream models read raw data as if it were validated, and every "wrong data" incident traces back to the migration that never quite finished. ELT is a real answer; it's not an escape from the transform work.

**"Just use a SaaS pipeline (Fivetran, Airbyte, Stitch) and skip the whole build."** For the extract-and-load parts of common SaaS sources — Salesforce to Snowflake, HubSpot to BigQuery — this is often exactly right. Building and maintaining connectors to third-party APIs is a tax with no strategic value; paying a vendor to do it is a good trade. What the SaaS vendor cannot do is your organization's specific transform work — the identity resolution, the business-rule application, the reconciliation of "revenue" across your finance and sales systems. That is your problem regardless of whether you built the extractor or bought it. The vendor moves the data; your team still has to model it.

**"Streaming replaces batch ETL."** Some workloads genuinely need sub-minute latency (fraud detection, real-time personalization, some operational alerting), and for those, a streaming architecture is the right choice. But streaming is meaningfully more expensive to operate than batch, more sensitive to source-system flakiness, and much harder to debug when it produces wrong answers. Most business questions ("what were sales yesterday, by region?") don't actually need sub-minute freshness. They need *reliable, correct, once-daily*. Batch ETL is exactly that. The correct decision isn't "streaming vs. batch"; it's "which specific decisions require which specific freshness, and what's the cheapest way to serve each."

**"We have a data lake; we don't need a warehouse."** A **data lake** is a large, cheap store of raw data in open formats (Parquet, Iceberg, Delta), typically on object storage (S3, GCS). It's not a substitute for a warehouse; it's often a *layer beneath* one. The warehouse still needs structured, cleaned, modeled data to answer questions efficiently. Lakes handle the "hold every byte forever, cheap" concern; warehouses handle the "answer analytical questions in seconds" concern. The modern **lakehouse** pattern tries to be both (Databricks, Snowflake's Iceberg tables, BigQuery's external tables). Either way, the ETL/ELT question — how does raw data become trusted analytical data? — doesn't go away.

**"AI/LLMs will just answer questions directly from the source systems."** The current market pitch. It works for a class of narrow, well-scoped questions; it fails when the answer requires cross-system reconciliation, historical context, or business-rule application, because none of that is in any single source system. The interesting future here is probably LLMs on top of a well-modeled warehouse, not LLMs replacing one. Models can only be as accurate as the data they see; giving them the right data is still the ETL problem.

## What ETL does NOT solve

Being honest about the boundary of a technique is what makes recommending it trustworthy. Here's what ETL is not:

- **It doesn't fix bad definitions.** If the business hasn't decided whether "monthly active user" means "logged in once" or "performed a core action three times," the pipeline can't decide for them. Whichever definition the transform step encodes will be *consistent* and *wrong* if the definition is wrong. This is why data contracts and business-alignment conversations aren't optional — they're a prerequisite for a useful ETL process, not a follow-up to one.
- **It doesn't stop schema drift at the source.** If the marketing team quietly renames a column in the CRM, the extract will start failing (loud, easy) or start producing wrong-typed data (quiet, catastrophic). No amount of pipeline discipline substitutes for a data-contract conversation with the team that owns the source. See the [companion post on ETL failure modes](/posts/etls-real-failure-mode-is-silent-not-slow/) for a longer treatment.
- **It doesn't guarantee the warehouse is well-modeled.** A pipeline can move terabytes of data efficiently into a warehouse whose schema is a mess. The modeling work — deciding what the fact tables are, what the dimensions are, how history is tracked — is a separate discipline. See [Data modeling in plain language](/posts/data-modeling-in-plain-language/) for the vocabulary.
- **It doesn't produce insight.** A warehouse full of clean, reconciled data does not, by itself, tell you what's happening in the business. Analysts do that. Dashboards do that. The pipeline's job ends where the query begins; the value of a pipeline is measured in how much friction it removes from the analyst's day, not in how many rows it moves.
- **It doesn't remove the need for source-system discipline.** If your operational systems are a mess — inconsistent IDs, freeform text where structured values should be, no clear ownership — the pipeline can heroically clean them, but the cost of cleaning grows with the mess. Investing in source-system data quality pays back several times over in reduced pipeline complexity.

The reason to name these limits is that a team that has just spent months building an ETL platform is often tempted to treat the platform as though it has solved problems it has only *staged*. The pipeline is the plumbing. The house still has to be designed, the furniture still has to be picked, and someone still has to actually live in it.

## The one thing to take away

If you take one idea from this post: **an ETL process is the automation of work that a person is already doing by hand — and its value is measured in what that person can now do instead.**

You don't need a specialized team to start. Most useful pipelines begin as one Python script and a cron job, mature into an orchestrator with a handful of DAGs, and only later become something that justifies a dedicated data-engineering function. The right time to start is *before* the manual work becomes so expensive that everyone has learned to live with it — because at that point, the fix looks like a huge project and the "just export the CSV" workflow is culturally load-bearing.

Find one report your organization produces every week by hand. Time how long it takes. Multiply by 52. That number, in hours per year, is what an afternoon of pipeline work would recover — every year, forever, without anyone having to remember on Monday morning.

The pipeline, it turns out, is where the cheapest hour of your quarter gets spent.

## Where to read more

- **[Kimball & Ross, *The Data Warehouse Toolkit* (3rd ed., 2013)](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/)** — the canonical reference for dimensional modeling and the pattern language that most ETL work is still built on. The first few chapters are enough to grasp the vocabulary.
- **Inmon, *Building the Data Warehouse* (4th ed., 2005)** — the other founding text; more prescriptive about warehouse structure than Kimball. Worth reading for the historical context and the different design philosophy.
- **Kleppmann, *Designing Data-Intensive Applications* (2017)** — the modern reference on data-system tradeoffs. The chapters on batch and stream processing are the ones directly relevant to ETL design.
- **[dbt documentation](https://docs.getdbt.com/)** — the tool most modern teams reach for when doing the T of ELT. The "Learn Analytics Engineering" material doubles as a good primer on how transformation-as-code changes the shape of the work.
- **[Apache Airflow concepts](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/index.html)** — the most-deployed orchestrator; useful to read even if you end up choosing Dagster or Prefect, because Airflow's mental model shaped the whole category.
- **[The Data Engineering Wiki](https://dataengineering.wiki/)** — a community-maintained glossary and reference that fills in the gaps most introductory material leaves.
