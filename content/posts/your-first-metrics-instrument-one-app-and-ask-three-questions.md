+++
title = "Your first metrics: instrument one app and ask three questions"
date = "2026-10-08T09:47:15-04:00"
draft = false
description = "A hands-on introduction to Prometheus: instrument a small Flask app with a counter and a histogram, run Prometheus in Docker Compose, and answer how much, how broken, and how slow with three PromQL queries."
summary = "Instrument one small app with a counter and a histogram, run Prometheus 3.x in Docker Compose, and answer how much, how broken, and how slow with three PromQL queries. Part 2 of a series."
tags = ["prometheus", "observability", "metrics", "promql", "devops"]
categories = ["Fundamentals"]
ShowToc = true

[cover]
image = "/images/og/your-first-metrics-instrument-one-app-and-ask-three-questions.png"
hiddenInList = true
hiddenInSingle = true
+++

At the end of the last post I left you with a small experiment: run the dice-roller app, read the JSON log lines it writes, and try to answer *"how slow is `/slow` at the 99th percentile?"* from the output alone. If you actually tried it, you probably ended up with a throwaway script that parsed a few hundred lines, sorted some numbers, and printed one result for one moment in time. Now imagine wanting that answer every fifteen seconds, for every route, for the last month, without re-reading a month of logs each time.

That is the job metrics do. *The smallest amount of data that still lets you answer "how much, how broken, how slow" is a counter of requests and a histogram of how long they took.* Everything in this post is a consequence of that sentence. We will add those two instruments to the app, run [Prometheus](https://prometheus.io/) next to it, and ask three questions in its query language, PromQL.

This is part 2 of a series. It assumes the demo app from the previous post, and everything below was run against that app, so you can copy the files as they are.

## What Prometheus is, and what it is not

Prometheus is, in its own words, "an open-source systems monitoring and alerting toolkit, originally built at SoundCloud" ([Overview](https://prometheus.io/docs/introduction/overview/)). It began there in 2012, joined the Cloud Native Computing Foundation in 2016, and graduated in August 2018 as the second CNCF project to do so after Kubernetes ([Prometheus blog, 2018](https://prometheus.io/blog/2018/08/09/prometheus-graduates-within-cncf/)). It stores numeric time series, each identified by a name and a set of key-value labels, and it lets you query them with PromQL.

Two design choices are worth understanding up front, because they explain most of what feels strange to newcomers.

**Prometheus pulls.** Your application does not send metrics anywhere. It exposes them on an HTTP endpoint, conventionally `/metrics`, and the Prometheus server visits each target on a schedule and reads them. The strongest argument for pushing instead is simplicity: a short-lived job or a service behind a firewall can just send its numbers out, and there is no server that needs to reach in. That argument is real. The project's own FAQ is refreshingly modest about the alternative, calling pull "slightly better than pushing, but it should not be considered a major point" ([FAQ](https://prometheus.io/docs/introduction/faq/)). What pull buys you in practice is a free health signal. Because the server initiates every scrape, it records an `up` metric for each target, `1` if the scrape worked and `0` if it did not, and you can open any target's `/metrics` page in a browser to see exactly what it is exposing. For short-lived batch jobs that cannot be scraped, there is a Pushgateway, but the docs say the usual valid use is capturing the outcome of a service-level batch job, not a general way to send metrics ([Pushing](https://prometheus.io/docs/practices/pushing/)).

**Each server is standalone.** A Prometheus server keeps its data on local disk and has no distributed-storage dependency. The docs describe it as designed "to be the system you go to during an outage" ([Overview](https://prometheus.io/docs/introduction/overview/)), which is a good reason to keep it boring. The next post covers what that means for scale.

It is also worth knowing what Prometheus is *not*. It is not an event log, and its FAQ points readers to systems like Loki for that job ([FAQ](https://prometheus.io/docs/introduction/faq/)). It is not for anything that needs exact accounting, such as per-request billing, because the data is sampled and may not be detailed or complete enough ([Overview](https://prometheus.io/docs/introduction/overview/)).

## The data model in five minutes

A Prometheus time series is a **metric name plus a set of labels**, and every unique combination is its own series. The docs write one like this ([Data model](https://prometheus.io/docs/concepts/data_model/)):

```text
http_requests_total{route="/flaky", status="500"}
```

Change, add, or remove a label and you have created a different series. That one fact drives almost everything about cost, and we will come back to it.

There are four metric types ([Metric types](https://prometheus.io/docs/concepts/metric_types/)):

| Type | What it is | Use it for |
|---|---|---|
| **Counter** | A cumulative number that only goes up, or resets to zero when the process restarts | Requests served, errors, bytes sent |
| **Gauge** | A number that goes up and down | Queue depth, memory in use, temperature |
| **Histogram** | Counts of observations falling into buckets, plus a running sum and count | Request durations, response sizes |
| **Summary** | Count and sum, plus quantiles computed inside the client | Rarely your first choice; its quantiles cannot be combined across instances |

The last row comes from general knowledge of how summaries work rather than from a page I read for this post, so check the [histograms and summaries guidance](https://prometheus.io/docs/practices/histograms/) before relying on it.

Naming conventions are worth following from day one, because they are how other people's dashboards will read yours. Use base units (seconds, bytes), end counters in `_total`, and prefix with the domain, as in `http_request_duration_seconds` ([Naming](https://prometheus.io/docs/practices/naming/)).

## Instrument the app

Here is the full `app.py`. It is the version from part 1 with the Prometheus client library added: a counter, a histogram, a small decorator that updates both, and a `/metrics` route. Everything else, including the JSON logging, is unchanged.

```python
import json
import logging
import random
import sys
import time
from functools import wraps

from flask import Flask, Response, jsonify
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

FLAKY_FAILURE_RATE = 0.2  # share of /flaky requests that fail on purpose
SLOW_MAX_SECONDS = 1.5    # upper bound on the artificial delay in /slow

app = Flask(__name__)

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(logging.Formatter("%(message)s"))
log = logging.getLogger("dice")
log.addHandler(handler)
log.setLevel(logging.INFO)

# Label values come from a fixed set (three routes, a handful of status codes),
# so the number of series stays small and bounded.
REQUESTS = Counter(
    "http_requests_total", "HTTP requests handled.", ["route", "status"]
)
DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds.",
    ["route"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0),
)


def emit(**fields):
    """Write one structured JSON log line to stdout."""
    log.info(json.dumps({"ts": round(time.time(), 3), "service": "dice", **fields}))


def instrumented(route):
    """Record a request count and a latency observation for every call."""

    def decorator(view):
        @wraps(view)
        def wrapper():
            start = time.perf_counter()
            response = view()
            body, status = response if isinstance(response, tuple) else (response, 200)
            DURATION.labels(route=route).observe(time.perf_counter() - start)
            REQUESTS.labels(route=route, status=str(status)).inc()
            return body, status

        return wrapper

    return decorator


@app.get("/roll")
@instrumented("/roll")
def roll():
    value = random.randint(1, 6)
    assert 1 <= value <= 6, f"die out of range: {value}"
    emit(route="/roll", status=200, value=value)
    return jsonify(value=value)


@app.get("/slow")
@instrumented("/slow")
def slow():
    delay = random.uniform(0.05, SLOW_MAX_SECONDS)
    time.sleep(delay)
    emit(route="/slow", status=200, duration_s=round(delay, 3))
    return jsonify(value=random.randint(1, 6), waited=round(delay, 3))


@app.get("/flaky")
@instrumented("/flaky")
def flaky():
    if random.random() < FLAKY_FAILURE_RATE:
        emit(route="/flaky", status=500, error="simulated failure")
        return jsonify(error="simulated failure"), 500
    emit(route="/flaky", status=200)
    return jsonify(value=random.randint(1, 6))


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)
```

Two decisions in there are worth a second look. The route label is passed in as a literal string (`"/roll"`), not read from the request's URL, which keeps the label to three possible values no matter what a client sends. And the histogram's `buckets` are chosen by hand to bracket the latencies we expect, from 10 ms to 2 s. A classic histogram can only tell you which bucket an observation fell into, so those boundaries decide how precisely you can answer latency questions later. That matters more than it sounds, as you will see in a moment.

Four more small files complete the stack. First, a `Dockerfile` for the app:

```dockerfile
FROM python:3.13-slim
WORKDIR /srv
RUN pip install --no-cache-dir flask==3.1.* prometheus-client==0.22.*
COPY app.py .
EXPOSE 8000
CMD ["flask", "--app", "app", "run", "--host", "0.0.0.0", "--port", "8000"]
```

Second, `prometheus.yml`, which tells Prometheus where to scrape. It scrapes itself, the dice app, and a node exporter, which is a small program that exposes host-level metrics such as CPU and memory:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ["localhost:9090"]

  - job_name: dice
    static_configs:
      - targets: ["dice:8000"]

  - job_name: node
    static_configs:
      - targets: ["node-exporter:9100"]
```

Third, `compose.yaml`, which wires the services together. The `load` service is a loop that keeps hitting all three routes so the graphs have something to show:

```yaml
services:
  dice:
    build: .
    ports:
      - "8000:8000"

  load:
    image: curlimages/curl:8.15.0
    depends_on:
      - dice
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        while true; do
          curl -s -o /dev/null http://dice:8000/roll
          curl -s -o /dev/null http://dice:8000/slow
          curl -s -o /dev/null http://dice:8000/flaky
          sleep 0.2
        done

  node-exporter:
    image: prom/node-exporter:v1.9.1

  prometheus:
    image: prom/prometheus:v3.13.4
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
    ports:
      - "9090:9090"
```

Every image is pinned to a specific tag, on purpose. Prometheus `v3.13.4` is a patch release on the 3.13 line, which the project designates a long-term-support release, supported until 2027-07-31 ([Release cycle](https://prometheus.io/docs/introduction/release-cycle/)). Floating tags such as `latest` make tutorials rot, so pin yours too. Put the four files in one directory and start everything:

```bash
docker compose up --build -d
```

Give it about two minutes so Prometheus collects enough samples for the five-minute windows below. If you are on Docker Desktop for Mac or Windows, note that the node exporter reports on the Linux virtual machine Docker runs in, not on your laptop itself.

## Read the raw metrics first

Before you query anything, look at what the app is actually exposing. This is the single most useful debugging habit in the whole Prometheus ecosystem:

```bash
curl -s localhost:8000/metrics | grep -E '^http_request'
```

On my run, a few minutes in, the counter lines looked like this:

```text
http_requests_total{route="/roll",status="200"} 80.0
http_requests_total{route="/slow",status="200"} 80.0
http_requests_total{route="/flaky",status="200"} 59.0
http_requests_total{route="/flaky",status="500"} 21.0
```

Those are the raw counters, and notice what they are: running totals since the process started. A counter on its own tells you very little, because "80 requests since startup" depends entirely on when it started. The interesting number is how fast it is growing, and that is what PromQL's `rate()` computes.

The histogram appears as a family of lines: one `_bucket` series for each boundary (the label `le`, short for "less than or equal"), plus `_sum` and `_count`. Open `http://localhost:9090` to get Prometheus's query page, and let's ask the three questions.

## Question 1: how much? (Rate)

```promql
sum by (route) (rate(http_requests_total[5m]))
```

`rate()` takes a counter and returns its per-second average increase over the given window, here the last five minutes, and it copes with counters that reset to zero when a process restarts. `sum by (route)` then adds the series up per route. On my run each route showed about 0.74 requests per second.

The order matters. The functions documentation says to take a `rate()` first and aggregate afterward ([Functions](https://prometheus.io/docs/prometheus/latest/querying/functions/)). Summing the raw counters first and then taking a rate gives you wrong answers whenever any one instance restarts, because the reset is hidden inside the sum. PromQL refuses the plain reverse order, since `rate()` needs a range of raw samples, not an already-aggregated number.

## Question 2: how broken? (Errors)

```promql
sum by (route) (rate(http_requests_total{status=~"5.."}[5m]))
  / sum by (route) (rate(http_requests_total[5m]))
```

The matcher `status=~"5.."` is a regular expression selecting any 5xx status. The expression divides the rate of failures by the rate of everything, which gives a ratio between 0 and 1. On my run it returned a single row, `/flaky`, at about 0.26. The app is configured to fail 20 percent of the time, so a measured 26 percent over a small sample is plausible, and it will drift toward 0.2 as you let it run. Notice that `/roll` and `/slow` do not appear at all. They have no series with a 5xx status, so there is nothing in the numerator to divide, and PromQL drops those routes from the result rather than showing zero. That surprises people the first time, and it is the reason the instrumentation guidance suggests exporting a `0` for series you expect to exist ([Instrumentation](https://prometheus.io/docs/practices/instrumentation/)).

## Question 3: how slow? (Duration)

```promql
histogram_quantile(0.99, sum by (route, le) (rate(http_request_duration_seconds_bucket[5m])))
```

This one reads inside-out. `rate()` turns each bucket counter into a per-second rate. `sum by (route, le)` combines them while keeping the `le` label, which `histogram_quantile` requires. Then `histogram_quantile(0.99, ...)` estimates the value below which 99 percent of observations fell. On my run:

| Route | p99 latency |
|---|---|
| `/roll` | about 0.0099 s |
| `/flaky` | about 0.0099 s |
| `/slow` | about 1.97 s |

The `/slow` number deserves suspicion, because the app never sleeps longer than 1.5 seconds. The estimate is 1.97 s because a classic histogram stores only bucket counts, so Prometheus assumes observations are spread evenly *within* a bucket and interpolates ([Functions](https://prometheus.io/docs/prometheus/latest/querying/functions/)). With a bucket covering 1.0 to 2.0 seconds, the answer lands near the top of it. The estimate can be off by a fraction of a bucket width, and the fix is to choose bucket boundaries around the latencies you care about, such as an extra bucket at 1.5 s. A percentile from a histogram is only as precise as its buckets.

Compare that with the average, which you can compute from the histogram's `_sum` and `_count` series:

```promql
sum(rate(http_request_duration_seconds_sum[5m])) / sum(rate(http_request_duration_seconds_count[5m]))
```

On my run that came out to about 0.27 s across all routes. A 0.27 s average sounds healthy, and it hides the fact that one route routinely takes more than a second. That is why latency is reported as percentiles, and why Gregg, in the USE method's own caveats, warns that averages can hide bursts ([Gregg](https://www.brendangregg.com/usemethod.html)).

## Is it even running? (`up`)

Every scrape target gets an `up` series for free. Run this to list anything that is down:

```promql
up == 0
```

Stop the node exporter with `docker compose stop node-exporter`, wait about 40 seconds, and the query returns exactly one row: the `node` job. Start it again and the row disappears. A silent exporter and a zero-traffic service look identical on a dashboard, so `up` is how you tell "nothing is happening" from "nothing is being reported".

For host-level health, the node exporter's CPU series gives a busy ratio:

```promql
1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))
```

On my run that returned about 0.27, meaning roughly a quarter of the Docker VM's CPU was busy. This is the USE method from the previous post in action: utilization of a resource, as opposed to the RED questions about a service.

## If you are following an older tutorial

Prometheus 3.0 shipped on 14 November 2024, the first major release in seven years ([3.0 announcement](https://prometheus.io/blog/2024/11/14/prometheus-3-0/)). A lot of material on the internet predates it, and a few changes will quietly break copy-pasted content. From the [migration guide](https://prometheus.io/docs/prometheus/latest/migration/):

- The `le` and `quantile` label values are normalized to floats, so a bucket written as `le="1"` is now `le="1.0"`. A dashboard or alert matching the old whole-number form will stop matching.
- Range selectors are now left-open. A subquery such as `foo[1m:1m]` can return a single point, which leaves `rate()` with no data to work with.
- A scrape whose response has a missing or unrecognized `Content-Type` is rejected.
- The Alertmanager v1 API is removed.
- The `.` in a PromQL regular expression now matches newlines.

Native histograms, a more efficient alternative to the classic buckets used above, became stable on the server in v3.8.0, but scraping them is opt-in and the docs list client support as Go and Java for now ([Metric types](https://prometheus.io/docs/concepts/metric_types/)). My advice for a first project is to use classic histograms, which every client library supports, and treat native histograms as the direction things are heading. That advice is my judgment, not the documentation's.

## Cardinality: the cost you do not see coming

Remember the rule that every unique label combination is a new series. Ask Prometheus how many series the dice app produced:

```promql
count({job="dice"})
```

On my run that was 62. Most of those come from the histogram, which creates a bucket series per boundary per route, plus the Python client library's built-in process and garbage-collection metrics. It is a tiny number, and it is bounded because the labels can only take a handful of values.

Now imagine adding a `user_id` label to the request counter. Every distinct user would multiply the series count, and the count would grow with your traffic instead of your code. The Prometheus docs are blunt about this: do not use labels to store dimensions with high cardinality, such as user IDs or email addresses ([Naming](https://prometheus.io/docs/practices/naming/)). They suggest keeping a typical metric's label cardinality below about ten, and investigating any that exceeds a hundred ([Instrumentation](https://prometheus.io/docs/practices/instrumentation/)). Per-user detail belongs in logs and traces, which are built to hold it.

## Mistakes that bite in the first week

- **Taking `rate()` of a gauge, or of nothing.** `rate()` is for counters. A gauge needs a different treatment, such as `avg_over_time` or just reading the value.
- **Aggregating before `rate()`.** As above: rate first, then sum.
- **Letting a label's values grow without bound.** One careless label can add millions of series.
- **Trusting a percentile without checking the buckets.** If your latency goal is 300 ms, make sure a bucket boundary sits at 0.3.
- **Using the Pushgateway for ordinary services.** It is for batch-job outcomes, and pushed series persist until someone deletes them.
- **Choosing a range too short for your scrape interval.** A `[1m]` window over a 15-second scrape has only about four samples, so results are noisy. I do not have an official rule of thumb to cite here, so treat any "N times the scrape interval" advice as folklore until you have measured your own data.

## What this does not tell you

Prometheus is not a billing system or an audit log, and a metric tells you that something is wrong without telling you why. A p99 of 1.97 seconds says `/slow` is slow. It does not say which request, which user, or which line of code, and getting there needs the logs and traces that the later posts add.

Several limits apply to this exact tutorial, too. Everything above ran against one machine with one app, so none of it says anything about running Prometheus at scale; the FAQ claims a single server can handle tens of millions of active series, but I have not measured that, and the storage and scaling story is the subject of the next post. The query results are from a single run on Docker Desktop with versions pinned in October 2026, so your numbers will differ and your versions will eventually age. And the node exporter in this stack reports on a virtual machine, which is fine for learning the query but not a picture of a real host.

## One sentence to keep

*A counter tells you how much, a histogram tells you how slow, and `rate()` turns both from running totals into answers.*

Next post: turning those answers into alerts that wake a person only when users are hurting, and where the limits of a single Prometheus server show up. Until then, bring the stack up, break something on purpose by changing `FLAKY_FAILURE_RATE` to `0.5`, and watch the error-ratio query move.
