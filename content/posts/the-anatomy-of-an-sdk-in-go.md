+++
title = "The anatomy of an SDK, in Go"
date = "2026-08-07T06:24:36-04:00"
draft = false
description = "A walkthrough of the surface an SDK exposes, in seven parts, with idiomatic Go for every piece: the client constructor with functional options, resource groupings that mirror the caller's mental model, typed requests and responses, typed errors with request IDs and errors.As, first-class pagination via iter.Seq2, streaming and retries and instrumentation, and the docs/samples/changelog trio that finishes the surface. Companion to the SDK fundamentals post."
summary = "A walkthrough of the surface an SDK exposes, in seven parts, with idiomatic Go for every piece: the client constructor with functional options, resource groupings that mirror the caller's mental model, typed requests and responses, typed errors with request IDs and errors.As, first-class pagination via iter.Seq2, streaming and retries and instrumentation, and the docs/samples/changelog trio that finishes the surface. Companion to the SDK fundamentals post."
tags = ["sdk", "api-design", "developer-tools", "go", "fundamentals", "platform-engineering"]
categories = ["Fundamentals"]
ShowToc = true

[cover]
image = "/images/og/the-anatomy-of-an-sdk-in-go.png"
hiddenInList = true
hiddenInSingle = true
+++

You've opened your editor to start a new SDK. You typed `type Client struct {` and paused. Whatever fields go on the next line will define what every caller ever does with this SDK — the auth story lives there, the observability seams live there, the difference between a client that composes with the caller's tracing and one that fights it lives there. There are more design choices packed into that one struct than in most of the code you will write after it.

*The design choices below are not aesthetic — each has a specific failure mode when you get it wrong, and the failure modes compound.* Getting the client constructor right buys you nothing if your errors carry no request IDs; getting typed errors right buys you nothing if pagination leaks cursor plumbing to the caller. The seven parts of the anatomy — client, resource groupings, typed requests and responses, typed errors, pagination, streaming/retries/instrumentation, docs — have to work together, and the easiest way to see how they interlock is to walk them in order.

This is the second in a four-post series on SDK design; the [fundamentals post](/posts/what-an-sdk-actually-is-and-when-to-build-one/) covered what an SDK is at a conceptual level and when the effort is worth it. Go is a useful lens for this walkthrough because it forces every design choice to be explicit — no reflection tricks, no magic decorators, no dynamic dispatch to hide behind. The patterns generalize to any language, but they land more visibly in Go, where the type system is the entire contract.

## 1. The client and its construction

The entry point is always a client value the caller constructs once and reuses. In Go, the two idiomatic construction patterns are the *config struct* and *functional options*. Both are variants of the Builder pattern; both compose well. Functional options tend to age better because adding a new option doesn't break existing call sites.

```go
package example

import (
    "log/slog"
    "net/http"
    "time"
)

type Client struct {
    apiKey     string
    baseURL    string
    httpClient *http.Client
    logger     *slog.Logger
    userAgent  string
}

type Option func(*Client)

func WithBaseURL(url string) Option        { return func(c *Client) { c.baseURL = url } }
func WithHTTPClient(h *http.Client) Option { return func(c *Client) { c.httpClient = h } }
func WithLogger(l *slog.Logger) Option     { return func(c *Client) { c.logger = l } }
func WithUserAgent(ua string) Option       { return func(c *Client) { c.userAgent = ua } }

func NewClient(apiKey string, opts ...Option) *Client {
    c := &Client{
        apiKey:     apiKey,
        baseURL:    "https://api.example.com",
        httpClient: &http.Client{Timeout: 30 * time.Second},
        logger:     slog.Default(),
        userAgent:  "example-go/1.0",
    }
    for _, opt := range opts {
        opt(c)
    }
    return c
}
```

Three things are worth noticing. The client accepts an `apiKey` positionally — it is required, so make it hard to forget. Everything else is optional and defaulted, so the ninety-percent case is a one-line construction. The `http.Client` is injectable, which sounds like a small detail but is what lets the caller add tracing, set custom transports, or plug the SDK into their existing observability stack without you having to design an escape hatch for each concern.

*Subsequent snippets elide imports for brevity — assume the usual `context`, `errors`, `fmt`, `net/http`, and `iter` where relevant.*

## 2. Resource groupings and method signatures

The public surface should mirror the platform's resource model. If the platform has orders, customers, and refunds, expose them as `client.Orders`, `client.Customers`, `client.Refunds` — each with its own methods. This is not a stylistic preference; it directly determines how discoverable the SDK is via editor autocomplete. In practice, extend the `Client` struct from the previous section with a service pointer per resource, and initialize them at the end of `NewClient`:

```go
// Additional fields on Client (from §1):
//     Orders    *OrdersService
//     Customers *CustomersService
//     Refunds   *RefundsService
// Assigned at the end of NewClient: c.Orders = &OrdersService{client: c}, etc.

type OrdersService struct {
    client *Client
}

func (s *OrdersService) Create(ctx context.Context, req CreateOrderRequest) (*Order, error) {
    var out Order
    if err := s.client.do(ctx, "POST", "/v1/orders", req, &out); err != nil {
        return nil, err
    }
    return &out, nil
}
```

Every method that talks to the platform takes a `context.Context` as its first argument. This is non-negotiable in Go — it's how the caller cancels in-flight requests, propagates deadlines, and carries trace metadata. An SDK that omits `ctx` on request-issuing methods is broken; it will need to be rewritten before it gets used seriously.

## 3. Typed requests and typed responses

The types are the SDK's contract in code form. Callers should never have to build a `map[string]any` and hope the JSON serializes correctly.

```go
type CreateOrderRequest struct {
    CustomerID string      `json:"customer_id"`
    Currency   string      `json:"currency"`
    Items      []OrderItem `json:"items"`
    Metadata   map[string]string `json:"metadata,omitempty"`
}

type OrderItem struct {
    SKU         string `json:"sku"`
    Quantity    int    `json:"quantity"`
    UnitAmount  int64  `json:"unit_amount"` // cents
}

type Order struct {
    ID         string     `json:"id"`
    Status     string     `json:"status"`
    Total      int64      `json:"total"`
    CreatedAt  time.Time  `json:"created_at"`
    Customer   Customer   `json:"customer"`
}
```

If the platform has enum-like fields, model them as string constants and expose them as typed values so the compiler catches typos:

```go
type OrderStatus string

const (
    OrderStatusPending   OrderStatus = "pending"
    OrderStatusPaid      OrderStatus = "paid"
    OrderStatusShipped   OrderStatus = "shipped"
    OrderStatusCancelled OrderStatus = "cancelled"
)
```

## 4. Typed errors that carry the response context

The error surface tells you whether the SDK was designed by someone who has debugged one. A well-shaped error carries the status code, the platform's error code, the human-readable message, and — critically — the request ID so the caller can hand it to support.

```go
type APIError struct {
    StatusCode int    `json:"-"`
    Code       string `json:"code"`
    Message    string `json:"message"`
    RequestID  string `json:"-"`
}

func (e *APIError) Error() string {
    return fmt.Sprintf("example: %s (%d): %s [request_id=%s]",
        e.Code, e.StatusCode, e.Message, e.RequestID)
}

// Callers can use errors.As to inspect.
var apiErr *APIError
if errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusTooManyRequests {
    // handle rate limiting
}
```

Note the `errors.As` pattern — the SDK returns a `*APIError` inside a wrapped error chain, and the caller pulls it back out with the standard-library facility. Do not invent your own error-inspection function; use what the language already provides.

## 5. Pagination as a first-class iterator

Pagination is where SDKs most often leak. If the SDK exposes raw cursor handling to the caller (`ListOrders(cursor)` returning `(items, nextCursor, err)`), every caller reimplements the same pagination loop, badly. Since Go 1.23, `iter.Seq2` gives you an idiomatic way to hide the loop entirely.

```go
import "iter"

func (s *OrdersService) List(ctx context.Context, filter OrderFilter) iter.Seq2[*Order, error] {
    return func(yield func(*Order, error) bool) {
        cursor := ""
        for {
            page, err := s.listPage(ctx, filter, cursor)
            if err != nil {
                yield(nil, err)
                return
            }
            for _, order := range page.Items {
                if !yield(order, nil) {
                    return
                }
            }
            if page.NextCursor == "" {
                return
            }
            cursor = page.NextCursor
        }
    }
}

// Caller code — a single loop over all orders, regardless of page count:
for order, err := range client.Orders.List(ctx, OrderFilter{Status: OrderStatusPaid}) {
    if err != nil {
        return err
    }
    fmt.Println(order.ID)
}
```

The caller writes a plain `for range`. The SDK handles page turnover, cursor plumbing, and end-of-results — the three places pagination goes wrong. A caller who wants to stop early does so with `break`, and the iterator function returns cleanly.

## 6. Streaming, retries, and instrumentation

These are the three places where "just wrap HTTP" reveals itself as insufficient.

**Streaming** — for server-sent events or chunked responses, the SDK owns the parser. The caller gets an iterator or a channel of events, not a raw `io.Reader` to pick apart themselves.

**Retries** — the SDK ships with sensible defaults (exponential backoff, jittered, capped, only for idempotent methods or explicit `Idempotency-Key` headers) and lets the caller override them.

**Instrumentation** — every request has a hook point for logging, tracing, and metrics. In Go, the cleanest form is a middleware slot on the injectable `*http.Client`, plus an emitted `slog` line per request at debug level.

Callers who never touch these things get correct behavior anyway; callers who need to customize have a clear seam.

## 7. Docs, samples, and a changelog

The last part of the surface isn't code. It's the README that shows the ninety-percent case in the first ten lines, the samples directory with a runnable example per method, and a changelog that says exactly what changed between versions. Without these, everything above is a client library that is technically installable and functionally invisible. What separates a great docs surface from an adequate one is covered in a companion post on this site — [*What makes a good SDK*](/posts/what-makes-a-good-sdk/).

## Related posts in this series

- [*What an SDK actually is, and when to build one*](/posts/what-an-sdk-actually-is-and-when-to-build-one/) — the fundamentals: what SDKs are, where the shape came from, how they differ from APIs and libraries and frameworks and protocols, and when to build one.
- [*What makes a good SDK*](/posts/what-makes-a-good-sdk/) — the eight-point quality rubric with named exemplars (Stripe, AWS, Anthropic, OpenAI, GitHub Octokit), plus the two-sided value proposition for vendors and callers.
- [*Capability-first SDK design, and where new work belongs*](/posts/capability-first-sdk-design-and-where-new-work-belongs/) — the design-process question of routing new capability requests between the SDK and one or more APIs, with the caller-sketch discipline as the practice.

*The seven parts above are the surface an SDK exposes, and whether the resulting SDK is any good depends on whether those parts were assembled with the care the [rubric post](/posts/what-makes-a-good-sdk/) walks through.*

If you're building an SDK: use this walkthrough as a scaffold, but write your first `Client` struct against the specific failure modes your platform's API creates — the seven parts are universal, the shape of each one is not.
