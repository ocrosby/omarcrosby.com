+++
title = "Monitoring tells you it broke; observability helps you ask why"
date = "2026-10-08T08:14:36-04:00"
draft = false
description = "A plain-language introduction to observability: how it differs from monitoring, what metrics, logs, and traces each answer, and the SLO, RED, USE, and golden-signal vocabulary you need before touching any tool."
summary = "What observability is, how it differs from monitoring, what metrics, logs, and traces each answer, and the vocabulary (SLOs, RED, USE, golden signals) to learn before you pick a tool. Part 1 of a series."
tags = ["observability", "monitoring", "sre", "devops", "fundamentals"]
categories = ["Fundamentals"]
ShowToc = true

[cover]
image = "/images/og/monitoring-tells-you-it-broke-observability-helps-you-ask-why.png"
hiddenInList = true
hiddenInSingle = true
+++

Picture a checkout service at 2 a.m. The page says *error rate above threshold*. You open the dashboard and every graph you built last quarter is green: CPU is flat, memory is flat, the database connection pool has room to spare. The alert is real, though, because support is already reporting that some customers cannot pay. You scroll through the logs and find ten thousand lines of "request completed." Somewhere in that service is a failure that affects a slice of your users, and none of the panels you built can tell you which slice, or why.

That gap, between *knowing something is wrong* and *being able to find out what*, is the whole subject of this series. This first post gives you the map and the vocabulary. It does not install anything. The later posts add Prometheus, Grafana, Loki, and OpenTelemetry one at a time, and they will make far more sense if you already know what question each one exists to answer.

*The single most useful test I know for observability is this: when the system misbehaves in a way nobody predicted, can I work out why using only what it already emits, without shipping new code first?* If the answer is yes, you have observability. If the answer is "we would need to add a log line and redeploy," you have monitoring, which is useful and different.

## Where the word comes from

"Observability" is borrowed from control theory. Rudolf Kálmán introduced it in 1960 alongside controllability, and the textbook question is whether you can determine a system's internal state from its outputs alone ([Wikipedia: Observability](https://en.wikipedia.org/wiki/Observability)). Software engineers adopted the word in the late 2010s for a similar reason: we are trying to understand the inside of a distributed system by looking only at what it lets out.

The definition that has stuck most firmly in our industry comes from Honeycomb, the vendor most associated with the term. Their current explainer, last updated in April 2026, defines observability as "the ability to investigate a system by asking any question about its behavior," and contrasts it with monitoring, "the collection of predefined metrics" ([Honeycomb](https://honeycomb.io/blog/observability-whats-in-a-name)). Charity Majors, Honeycomb's co-founder, has made the same argument for years: monitoring watches for the failures you predicted, and observability is what you need for the ones you did not.

## The strongest case against the distinction

I hold the position above, but the opposing view deserves its best form first. It goes like this: *observability is just monitoring with richer data, and the new word is a marketing device.* Good monitoring has always meant knowing the system well enough to watch the right things. Every tool sold as an "observability platform" is, in this view, a metrics store, a log store, and a trace store with a new label on the box.

There is real evidence on that side. Google's *Site Reliability Engineering* book, published in 2016, already separates black-box monitoring (testing externally visible behavior, which catches active problems) from white-box monitoring (inspecting internals) and says a system needs both ([SRE Book: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)). The practical gap between the two camps is smaller than the rhetoric suggests. Majors herself has acknowledged that the tooling overlaps.

Where I land: the distinction is not a product category, it is a test of capability. A tool does not make you observable. The question is whether your data lets you ask new questions after the fact. Plenty of "observability platforms" fail that test when their data has been pre-aggregated, and plenty of carefully built monitoring setups pass it.

## The three signals, and what each one answers

You will hear that observability has "three pillars": metrics, logs, and traces. The framing is widely traced to a February 2017 post by Peter Bourgon, "Metrics, tracing, and logging," written after the Distributed Tracing Summit that year ([Bourgon](https://peter.bourgon.org/blog/2017/02/21/metrics-tracing-and-logging)). His post was a comparison of trade-offs, not a checklist, and the industry kept the three nouns while dropping the nuance. Treat them as three different questions you can ask a system.

| Signal | What it is | The question it answers | Cost shape |
|---|---|---|---|
| **Metrics** | Numbers sampled over time, aggregated | "How much, how often, how slow, right now and over the last month?" | Cheap per request, because it is aggregated; expensive if labels explode |
| **Logs** | Timestamped records of discrete events | "What exactly happened in this one case?" | Highest volume; grows with traffic |
| **Traces** | The path of one request through every service it touched | "Where did this request spend its time, and where did it fail?" | Sits in between; often sampled |

A fourth signal is arriving. Profiles show which code consumed CPU or memory, and OpenTelemetry's profiles signal entered public Alpha in March 2026, with traces, metrics, and logs already Stable in its specification ([OpenTelemetry blog](https://opentelemetry.io/blog/2026/profiles-alpha)). I will leave profiles out of the series, but you should know the list is still growing.

One caution before moving on. Having all three signals does not make a system observable. A team can ship metrics, logs, and traces into three separate tools, and still be unable to connect them during an incident. Post 7 of this series is about exactly that connection.

## Choosing what to measure: golden signals, RED, and USE

The most common beginner mistake is measuring everything. The second most common is measuring whatever the library happens to expose by default. Three short checklists exist to prevent both.

**The four golden signals** come from Google's SRE book: latency, traffic, errors, and saturation. The book's advice is blunt: "If you can only measure four metrics of your user-facing system, focus on these four" ([SRE Book](https://sre.google/sre-book/monitoring-distributed-systems/)). It also asks you to track the latency of failed requests separately from successful ones, since a fast error can make your average latency look better precisely when things are worse.

**RED** is a simplified version for services that handle requests: **R**ate, **E**rrors, **D**uration. Tom Wilkie created it in 2015 and presented it at GrafanaCON EU in March 2018 ([Grafana blog](https://grafana.com/blog/the-red-method-how-to-instrument-your-services/)). It is essentially the golden signals without saturation.

**USE** is for things that are resources rather than services: hosts, disks, network links, queues. Brendan Gregg's formulation is that "for every resource, check utilization, saturation, and errors" ([Gregg](https://www.brendangregg.com/usemethod.html)). He claims it resolves most server issues for a small share of the effort, and also calls it "one tool in a larger toolbox."

My rule of thumb for choosing, which is mine rather than a published prescription: if a thing answers requests, use RED; if a thing is consumed or queued, use USE; if you want one checklist to hold in your head, use the golden signals. Then use RED and USE together, because RED tells you what your users feel and USE tells you what your machines are doing about it.

## SLIs, SLOs, and the budget that makes alerts sane

Measuring is half of it. You also need to decide what "good enough" means, because without a target every alert is an argument. The SRE book gives four terms worth learning precisely ([SRE Book: Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)):

- An **SLI** (service level indicator) is a measurement of something users care about, such as the fraction of requests that succeed or complete under 300 ms.
- An **SLO** (service level objective) is a target for that measurement, such as "99.9% of requests succeed over 30 days."
- An **SLA** (service level agreement) is an SLO with contractual consequences, usually financial.
- An **error budget** is the amount of failure the SLO permits. A 99.9% target over 30 days allows roughly 43 minutes of full outage, and the book describes the budget as "an SLO for meeting other SLOs," in the sense that it is what you spend on releases and experiments.

The same chapter has advice I wish more teams followed: do not pick a target just because it matches today's performance, keep the number of SLOs small, avoid promising absolutes, and start loose before tightening. A 100% target is not ambitious, it is impossible, and it leaves no room to ship anything.

SLOs also change how you alert. The SRE Workbook recommends alerting on *burn rate*, meaning how quickly you are spending the error budget, with several window lengths at once. For a 99.9% SLO its example thresholds are a page at 14.4x burn over one hour (confirmed by a five-minute window), a page at 6x over six hours, and a ticket at 1x over three days ([SRE Workbook: Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)). Do not memorize those numbers. The point is that a brief spike should not wake you up, and a slow leak should still get noticed. Post 3 builds this properly.

## Meet the demo app

Every post in this series adds one tool to the same tiny service, so you can follow along on a laptop. It is a Flask "dice roller" with three deliberately useful endpoints: `/roll` is fast and healthy, `/slow` adds a random delay, and `/flaky` fails 20 percent of the time. It writes one structured JSON line per request to stdout. Those three behaviors give you something to measure for each of the RED questions: how much traffic, how many errors, how slow.

```python
import json
import logging
import random
import sys
import time

from flask import Flask, jsonify

FLAKY_FAILURE_RATE = 0.2  # share of /flaky requests that fail on purpose
SLOW_MAX_SECONDS = 1.5    # upper bound on the artificial delay in /slow

app = Flask(__name__)

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(logging.Formatter("%(message)s"))
log = logging.getLogger("dice")
log.addHandler(handler)
log.setLevel(logging.INFO)


def emit(**fields):
    """Write one structured JSON log line to stdout."""
    log.info(json.dumps({"ts": round(time.time(), 3), "service": "dice", **fields}))


@app.get("/roll")
def roll():
    value = random.randint(1, 6)
    assert 1 <= value <= 6, f"die out of range: {value}"
    emit(route="/roll", status=200, value=value)
    return jsonify(value=value)


@app.get("/slow")
def slow():
    delay = random.uniform(0.05, SLOW_MAX_SECONDS)
    time.sleep(delay)
    emit(route="/slow", status=200, duration_s=round(delay, 3))
    return jsonify(value=random.randint(1, 6), waited=round(delay, 3))


@app.get("/flaky")
def flaky():
    if random.random() < FLAKY_FAILURE_RATE:
        emit(route="/flaky", status=500, error="simulated failure")
        return jsonify(error="simulated failure"), 500
    emit(route="/flaky", status=200)
    return jsonify(value=random.randint(1, 6))
```

Save that as `app.py` and run it with [uv](https://docs.astral.sh/uv/), which installs Flask for you:

```bash
uv run --with flask flask --app app run -p 5055
```

In a second terminal, send it some traffic and watch the output:

```bash
for i in $(seq 1 10); do curl -s -o /dev/null -w "%{http_code} " localhost:5055/flaky; done
```

You should see a mix of `200` and `500` responses, and one JSON line per request in the server terminal. This is the whole system under observation. Notice what you can already ask of it from the logs alone, and what you cannot: you can count failures if you are willing to grep, but "how did p99 latency change over the last hour?" is not a question a pile of log lines answers well. That is the reason metrics exist, and it is where post 2 begins.

## A first-week path

If you are starting from nothing, here is the order I would work in. It is my own synthesis of the sources above rather than a published prescription, so weigh it accordingly.

1. **Measure RED for your user-facing services.** Request rate, error rate, and a latency distribution, not an average. This is the cheapest signal and covers most "is it broken?" questions.
2. **Write one SLO for one user journey.** Checkout, login, search: pick the one that costs you the most when it breaks.
3. **Make your logs structured and give every request an identifier.** JSON lines with a request or trace ID turn a pile of text into something you can filter.
4. **Add traces once you have more than one service.** In a single process a stack trace and a good log line are often enough. Across a network boundary, nothing else shows you where the time went.

Alert on what your users feel, not on what your machines are doing. The SRE book calls the symptoms-versus-causes distinction "one of the most important," and advises spending far more effort catching symptoms than causes ([SRE Book](https://sre.google/sre-book/monitoring-distributed-systems/)). A CPU alert tells you about a machine, and a failing checkout tells you about a person.

## Mistakes that cost the most

- **Treating volume as visibility.** Collecting more data is not the same as being able to answer more questions. If nobody can find the dashboard during an incident, it does not exist.
- **Putting unbounded values in metric labels.** The Prometheus documentation is direct about this: every unique combination of labels creates a new time series, so do not use labels for dimensions with high cardinality, such as user IDs ([Prometheus naming practices](https://prometheus.io/docs/practices/naming/)). Keep that kind of detail in logs and traces, which are built to hold it.
- **Setting an SLO from current performance.** You will lock in whatever your system happens to do today and call it a goal.
- **Paging on causes.** A page that says "CPU at 85%" with no user impact trains people to ignore pages.
- **Building a dashboard with no question.** Grafana's own best-practices guide says that if a dashboard has no goal, you should question whether it should exist. We will return to this in post 4.

## What this does not tell you

Observability does not fix a wrong specification. If the service does what it was built to do and that is the wrong thing, every signal will report success. It does not replace an on-call culture either: someone still has to be awake, trained, and empowered to act on what the data shows. It also has a cost, in storage, in engineering time, and in the discipline of keeping instrumentation current as code changes. I have no measured cost figures to offer here, and I would distrust anyone who quotes a universal number.

A few of the claims above rest on thinner ground than I would like. The history of the word is simple in outline, but I have not traced the exact lineage from control theory into software, and the "monitoring is just observability with fewer features" argument is the best opposing case I could build, not a position I found a named critic holding. And RED, USE, and the golden signals each have limits: Gregg himself notes that averages can hide bursts and that USE fits software resources poorly.

## One sentence to keep

*Observability is the ability to ask new questions of a running system without shipping new code, and everything else in this series is a way of buying that ability cheaply.*

Next up is the first tool: instrument this same dice roller with Prometheus and answer three questions with a single query language. If you want to get ahead, run the demo app and look at the logs it produces. Try to answer "how slow is `/slow` at the 99th percentile?" from the output alone, and notice how quickly that stops being fun.
