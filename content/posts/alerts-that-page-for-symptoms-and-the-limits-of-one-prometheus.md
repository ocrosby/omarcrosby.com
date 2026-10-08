+++
title = "Alerts that page for symptoms, and the limits of one Prometheus"
date = "2026-10-08T09:59:50-04:00"
draft = false
description = "Turn Prometheus metrics into alerts that page a person only when users are hurting: recording rules, error-budget burn-rate alerts, Alertmanager routing and inhibition, and how to tell when one Prometheus server stops being enough."
summary = "Write symptom-based alerts with recording rules and error-budget burn rates, route them through Alertmanager, and learn where a single Prometheus server runs out of room. Part 3 of a series."
tags = ["prometheus", "alertmanager", "observability", "sre", "devops"]
categories = ["Fundamentals"]
ShowToc = true

[cover]
image = "/images/og/alerts-that-page-for-symptoms-and-the-limits-of-one-prometheus.png"
hiddenInList = true
hiddenInSingle = true
+++

Every team that adopts metrics goes through the same phase. Someone sets up an alert for disk usage above 80 percent, another for CPU above 90, another for memory, another for a queue that is "too deep." For a couple of weeks the pager is quiet and everyone feels safe. Then the alerts start firing on things nobody can act on at 3 a.m., people begin to silence them by reflex, and one night the page that matters arrives in a stream of pages that do not. The monitoring is working perfectly. It has just stopped being trusted.

*The question to put to every alert before you create it is: if this woke me up right now, is there something a human should do about it immediately, and are users being hurt?* If either answer is no, it is not a page. It might be a ticket, or a dashboard panel, or nothing at all.

This is part 3 of the series. The previous post put a counter and a histogram into the dice-roller app and answered how much, how broken, and how slow with PromQL. Here we turn the error question into an alert that behaves, route it through Alertmanager, and then look honestly at where a single Prometheus server runs out of room. Everything below was run against the stack from part 2 with the additions shown.

## The strongest case for cause-based alerts

Before arguing for symptoms, here is the best case for the opposite. Cause-based alerts, such as "disk will be full in four hours," give you *advance warning*. A symptom alert fires only after users are already affected, and a full disk is a failure you can see coming. If you wait for the symptom, you have turned a calm afternoon fix into an incident. That is a fair point, and it is the reason some resource alerts deserve to exist.

The reconciliation, which is my own reading rather than a quotation, is about what the alert is allowed to do. An alert that predicts a problem hours out can be a ticket or a chat message, because nobody has to wake up. An alert that pages should be reserved for what users are feeling now. Prometheus's own alerting guidance says the same thing in fewer words: "alert on symptoms, have good consoles to allow pinpointing causes" ([Alerting practices](https://prometheus.io/docs/practices/alerting/)). Google's SRE book makes the underlying distinction, calling symptoms versus causes "one of the most important" ones in monitoring, and advises spending far more effort on catching symptoms ([SRE Book: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)). Causes are for debugging, not for waking people.

The same Prometheus page has three more rules worth taping to a monitor: "Aim to have as few alerts as possible," "Only page on latency at one point in a stack," and "Allow for slack in alerting to accommodate small blips" ([Alerting practices](https://prometheus.io/docs/practices/alerting/)).

## Two programs, one job each

Alerting in the Prometheus world is split across two components, and it helps to keep them apart:

- **Prometheus evaluates rules.** You write a PromQL expression, and when it returns a result for long enough, Prometheus considers the alert *firing* and sends it onward.
- **Alertmanager decides what to do with firing alerts.** It deduplicates them, groups related ones into a single notification, routes them to the right receiver, mutes some while others are active (inhibition), and honors silences that humans create ([Alertmanager docs](https://prometheus.io/docs/alerting/latest/alertmanager/)).

An alerting rule has a few fields you will use constantly ([Rule syntax](https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/)):

- `expr` is the PromQL condition.
- `for` is how long the condition must keep holding before the alert moves from *pending* to *firing*. It defaults to zero, and it is your built-in slack for blips.
- `keep_firing_for` holds an alert in the firing state for a while after its condition clears, which stops a flapping signal from resolving and re-firing repeatedly.
- `labels` and `annotations` attach routing information and human-readable text.

## Recording rules: name the numbers you alert on

The error ratio from part 2 is a good alert candidate, but writing the same long expression into several rules invites mistakes. A **recording rule** evaluates an expression on a schedule and stores the result as a new series, which you can then query and alert on by name.

There is a naming convention, and it matters because it is how teammates read your rules. Recording rule names should take the form `level:metric:operations`, where the level says which labels the result is aggregated to, and for ratios the two metrics are joined with `_per_` ([Rules practices](https://prometheus.io/docs/practices/rules/)). The same page gives two pieces of advice that are easy to violate: when aggregating ratios, aggregate the numerator and denominator separately and then divide, and never average a ratio or an average of an average, because it is not statistically valid.

Here is the first half of `rules/dice.yml`. It records the 5xx ratio per route over four window lengths, which the alerts below will need:

```yaml
groups:
  - name: dice-recording
    rules:
      - record: route:http_request_failures_per_requests:ratio_rate5m
        expr: |
          sum without (instance, status) (rate(http_requests_total{status=~"5.."}[5m]))
            / sum without (instance, status) (rate(http_requests_total[5m]))
      - record: route:http_request_failures_per_requests:ratio_rate30m
        expr: |
          sum without (instance, status) (rate(http_requests_total{status=~"5.."}[30m]))
            / sum without (instance, status) (rate(http_requests_total[30m]))
      - record: route:http_request_failures_per_requests:ratio_rate1h
        expr: |
          sum without (instance, status) (rate(http_requests_total{status=~"5.."}[1h]))
            / sum without (instance, status) (rate(http_requests_total[1h]))
      - record: route:http_request_failures_per_requests:ratio_rate6h
        expr: |
          sum without (instance, status) (rate(http_requests_total{status=~"5.."}[6h]))
            / sum without (instance, status) (rate(http_requests_total[6h]))
```

The rules use `sum without (...)` instead of `sum by (...)`, because the same page recommends always writing the labels you are aggregating *away*, so the labels you keep are whatever the metric has. Both halves of each ratio drop `instance` and `status` and keep everything else, so `route` and `job` survive.

## Alert on how fast you are spending the error budget

In the first post I introduced SLOs and error budgets and promised to come back to burn rates. Here is the payoff. Suppose the SLO for a route is 99.9 percent of requests succeeding. The error budget is the remaining 0.1 percent, or 0.001 as a ratio. The **burn rate** is how fast you are spending it: the current error ratio divided by the budget. A burn rate of 1 uses the budget up exactly at the end of the SLO window, and a burn rate of 14.4 uses it up 14.4 times faster than that.

You could alert on "error ratio above 5 percent for ten minutes," and many teams do. The SRE Workbook lists what goes wrong with simple approaches like that: a raw error-rate threshold has low precision, long windows are slow to clear after an outage, a `for:` duration alone has poor recall, and a single burn-rate threshold can miss a severe but short problem ([SRE Workbook: Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)). Its recommended fix is a *multiwindow, multi-burn-rate* alert. For a 99.9 percent SLO, the Workbook's example thresholds are:

| Severity | Burn rate | Long window | Short window | Budget consumed at that point |
|---|---|---|---|---|
| Page | 14.4 | 1 hour | 5 minutes | 2% |
| Page | 6 | 6 hours | 30 minutes | 5% |
| Ticket | 1 | 3 days | 6 hours | 10% |

The pair of windows is the clever part. The long window proves the problem is significant. The short one proves it is still happening, so the alert clears quickly once you fix it. The alert fires only when both agree. Here are the first two rows as rules, and the third follows the same pattern if you also record a 3-day and a 6-hour ratio:

```yaml
  - name: dice-alerts
    rules:
      - alert: ErrorBudgetFastBurn
        expr: |
          route:http_request_failures_per_requests:ratio_rate1h > (14.4 * 0.001)
            and
          route:http_request_failures_per_requests:ratio_rate5m > (14.4 * 0.001)
        for: 2m
        labels:
          severity: page
        annotations:
          summary: "{{ $labels.route }} is burning its 99.9% error budget at more than 14.4x"

      - alert: ErrorBudgetSlowBurn
        expr: |
          route:http_request_failures_per_requests:ratio_rate6h > (6 * 0.001)
            and
          route:http_request_failures_per_requests:ratio_rate30m > (6 * 0.001)
        for: 2m
        labels:
          severity: page
        annotations:
          summary: "{{ $labels.route }} is burning its 99.9% error budget at more than 6x"

      - alert: TargetDown
        expr: up == 0
        for: 1m
        labels:
          severity: page
        annotations:
          summary: "{{ $labels.job }} target {{ $labels.instance }} has not been scraped successfully for 1m"
```

The `for: 2m` on the burn-rate alerts is my choice, made so the demo fires within minutes. The Workbook's windows already provide most of the slack, so tune this to your own tolerance. The `TargetDown` rule is the `up == 0` query from part 2, turned into a page after a minute of silence.

## Alertmanager: group, route, and inhibit

Alertmanager's configuration is short for what it does. Here is `alertmanager.yml`:

```yaml
route:
  receiver: webhook
  group_by: [alertname, route]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

receivers:
  - name: webhook
    webhook_configs:
      - url: http://sink:5001/
        send_resolved: true

inhibit_rules:
  - source_matchers:
      - alertname="ErrorBudgetFastBurn"
    target_matchers:
      - alertname="ErrorBudgetSlowBurn"
    equal: [route]
```

Walking through it:

- `group_by` collapses alerts that share these labels into one notification. Without grouping, a database outage that trips fifty alerts sends fifty messages.
- `group_wait`, `group_interval`, and `repeat_interval` control how long Alertmanager waits to collect a group before the first notification, how long between updates to a group, and how often it re-sends a still-firing alert. The three values shown (30 seconds, 5 minutes, 4 hours) are the documented defaults ([Alertmanager configuration](https://prometheus.io/docs/alerting/latest/configuration/)). I wrote them out so you can see what is being tuned.
- The **inhibition rule** says: while `ErrorBudgetFastBurn` is firing for a route, mute `ErrorBudgetSlowBurn` for the same route. When a fast burn is already paging someone, the slow-burn page for the same problem adds noise and no information.
- Use `matchers`, as above, rather than the older `match` and `match_re` keys. The documentation marks those deprecated.

A real receiver would be PagerDuty, Slack, or email. For this tutorial, the receiver is a webhook pointed at a tiny Python script that prints each alert it receives, so you can see the whole path without any accounts:

```python
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        payload = json.loads(body)
        for alert in payload["alerts"]:
            print(alert["status"], alert["labels"]["alertname"], alert["labels"].get("route", "-"), flush=True)
        self.send_response(200)
        self.end_headers()


HTTPServer(("0.0.0.0", 5001), Handler).serve_forever()
```

Save it as `sink/sink.py`. Now wire it all together. In `prometheus.yml`, add the rule files, the Alertmanager address, and a scrape job for Alertmanager itself:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - /etc/prometheus/rules/*.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ["localhost:9090"]

  - job_name: alertmanager
    static_configs:
      - targets: ["alertmanager:9093"]

  - job_name: dice
    static_configs:
      - targets: ["dice:8000"]

  - job_name: node
    static_configs:
      - targets: ["node-exporter:9100"]
```

And in `compose.yaml`, replace the `prometheus` service and add the two new ones (keep `dice`, `load`, and `node-exporter` exactly as they were in part 2):

```yaml
  prometheus:
    image: prom/prometheus:v3.13.4
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./rules:/etc/prometheus/rules:ro
      - prom-data:/prometheus
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.retention.time=15d
    ports:
      - "9090:9090"

  alertmanager:
    image: prom/alertmanager:v0.34.1
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
    ports:
      - "9093:9093"

  sink:
    image: python:3.13-slim
    volumes:
      - ./sink/sink.py:/sink.py:ro
    command: ["python", "-u", "/sink.py"]

volumes:
  prom-data: {}
```

Both tools ship a checker, and it is worth running before you start anything. They are in the same images, so no installation is needed:

```bash
docker run --rm --entrypoint promtool -v "$PWD:/w" -w /w prom/prometheus:v3.13.4 check rules rules/dice.yml
docker run --rm --entrypoint amtool -v "$PWD:/w" -w /w prom/alertmanager:v0.34.1 check-config alertmanager.yml
```

Then start it and watch the sink:

```bash
docker compose up -d --build
docker compose logs -f sink
```

## What I saw

The demo app's `/flaky` route fails about 20 percent of the time, which against a 99.9 percent SLO is an outrage, so the alerts fire without any help. Four minutes after startup, `curl -s localhost:9093/api/v2/alerts` listed two alerts for `/flaky`, and the sink had printed one notification:

```text
firing ErrorBudgetFastBurn /flaky
```

`ErrorBudgetSlowBurn` was *also* firing in Prometheus, but Alertmanager marked it `suppressed`, with the inhibiting alert's fingerprint attached. That is the inhibition rule working: two pages' worth of conditions, one page delivered. I checked the burn rate directly too. The recorded one-hour ratio was about 0.166, so dividing by the 0.001 budget gives a burn rate near 166, far past the 14.4 threshold.

Then I stopped the node exporter with `docker compose stop node-exporter`. About two and a half minutes later the sink printed:

```text
firing TargetDown -
```

The dash is the sink's placeholder for "no `route` label," since this alert belongs to a scrape target, not a route. I did not exercise resolved notifications, silences, or a real receiver, so treat those as the next things to try rather than things I have shown working.

## When one Prometheus stops being enough

Now the second half of the title. A single Prometheus server is more capable than its reputation suggests. The project's FAQ says a single instance can run reliably with tens of millions of active series, and that the claim Prometheus "doesn't scale" is "often more of a marketing claim" ([FAQ](https://prometheus.io/docs/introduction/faq/)). I take that as a reasonable default to plan from, though I have not tested it against any workload of my own.

Its limits are real, though, and they are structural. Local storage is single-node and not clustered, so a dead disk is lost history unless you replicate ([Storage](https://prometheus.io/docs/prometheus/latest/storage/)). Retention defaults to 15 days by time, size-based retention is off unless you set it, and whichever limit hits first wins. The storage docs give a sizing formula: disk equals retention in seconds, times samples per second, times bytes per sample, with roughly 1 to 2 bytes per sample after compression.

You can fill in that formula with numbers from your own server. On the demo stack, a few minutes in, Prometheus was ingesting about 147 samples per second:

```promql
rate(prometheus_tsdb_head_samples_appended_total[5m])
```

At 15 days of retention that is 1,296,000 seconds, so the estimate is 147 × 1,296,000 × 2 bytes, or about 380 MB at the pessimistic end of the documented range. Tiny. The point of doing the arithmetic is that it scales linearly: ten thousand times the samples means ten thousand times the disk, and the formula tells you which direction a decision pushes it. The docs add that reducing the number of series beats lengthening the scrape interval, so cardinality, not frequency, is your main cost lever.

That makes the series count the number to watch:

```promql
prometheus_tsdb_head_series
```

It read 2,869 on the demo stack, which includes everything: the app, the node exporter, Alertmanager, and Prometheus's own metrics. To find which metric names are responsible for the bulk, count series per name:

```promql
topk(5, count by (__name__) ({__name__=~".+"}))
```

On my run the top entries were Alertmanager's notification counters and the node exporter's CPU and NFS series. This query touches every series in the server, so I would not run it casually on a very large one, but that caution is general knowledge rather than something I measured.

**When do you actually outgrow one server?** The honest signals, and this list is my own synthesis rather than an official checklist, are:

- You need to keep history for months or years, longer than local disk can sensibly hold.
- You need a single query across several independent Prometheus servers, such as one per cluster or region.
- You need several teams to share a backend with isolation between them.
- You need the data to survive the loss of one server, beyond what a mirrored pair gives you.

The documented first steps do not involve a new product. The FAQ recommends running identical Prometheus servers in pairs for reliability, with Alertmanager deduplicating the identical alerts they both send, and the Alertmanager docs tell you to list *every* Alertmanager in each Prometheus's configuration rather than load-balancing between them ([Alertmanager docs](https://prometheus.io/docs/alerting/latest/alertmanager/)). Beyond that, Prometheus can forward its samples to a long-term store with remote write. Thanos and Grafana Mimir are the two names you will hear most. The sources I found comparing them were secondary and vendor-adjacent, so I am not going to rank them here; consider them leads for your own evaluation, not conclusions.

## Watch the watcher

An alerting pipeline that is silently broken looks identical to one with nothing to report. The Prometheus guidance is direct: "It is important to have confidence that monitoring is working," so alert on the health of Prometheus servers and Alertmanagers, and add external blackbox monitoring, which "can catch problems that are otherwise invisible" and also covers the case where your internal systems fail completely ([Alerting practices](https://prometheus.io/docs/practices/alerting/)). The configuration above covers the first half in a minimal way: Prometheus scrapes both itself and Alertmanager, so `TargetDown` would notice either one disappearing, provided Alertmanager is up to deliver it. It does nothing for the second half. If the whole stack is down, nothing is left to page you, which is exactly why the docs ask for something outside it.

## Mistakes that bite in the first month

- **Paging on causes.** CPU at 85 percent with healthy users is a dashboard panel. Page on what users feel, and send everything else to tickets.
- **No `for:` at all.** A single bad scrape or one slow request fires the pager and teaches everyone to ignore it.
- **One alert per symptom per instance.** Without grouping and sensible labels, one outage becomes a flood of notifications.
- **Alerting and recording against different label sets.** The burn-rate rules rely on the long and short windows carrying identical labels. If one side drops a label the other keeps, the `and` silently matches nothing and the alert never fires.
- **Never testing the alert.** An alert that has never fired is a theory. Break the app on purpose, once, and watch the notification arrive.
- **Copying 2.x-era alerting config.** The Alertmanager v1 API is gone in Prometheus 3, as noted in part 2.

## What this does not tell you

Burn-rate alerting assumes an SLO you believe in. I used 99.9 percent because it matches the Workbook's example table, not because any real service of mine promised it, and the numbers (14.4, 6, 1) come from that source's worked example for that target. Different SLOs and different time windows need different thresholds, and the Workbook explains how to derive them.

The demo itself has limits. The webhook sink proves the pipeline, not the experience of being paged. A real receiver brings its own concerns: authentication, escalation, who is on call. The sizing arithmetic used a few minutes of ingestion rate from a toy stack, which says nothing about what a production workload looks like. And all of this describes one Prometheus. The moment you add a second one, you have taken on a distributed-systems problem that the single-server tutorial never had to face.

## One sentence to keep

*Page a human only for what users feel, express "what users feel" as how fast the error budget is burning, and watch the series count, because that is what eventually ends a single Prometheus server's life.*

Next up is making these numbers readable to people who do not write PromQL: Grafana, and why it is a window onto your data rather than a place that stores it. Until then, set `FLAKY_FAILURE_RATE` to `0.0`, rebuild the app, and see how long the alerts take to resolve in the sink. I have not timed that, and the answer depends on your windows and `group_interval`.
