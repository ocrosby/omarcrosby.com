+++
title = "Go concurrency, explained slowly"
date = "2026-07-18T04:43:18-04:00"
draft = false
description = "A patient tutorial for people who found the other Go concurrency resources confusing. Every primitive defined from scratch, every pattern shown as short runnable code, and the rules of thumb kept in their own section so you know which is which."
tags = ["go", "concurrency", "goroutines", "channels", "context", "tutorial"]
categories = ["Go"]
ShowToc = true

[cover]
image = "/images/og/go-concurrency-explained-slowly.png"
hiddenInList = true
hiddenInSingle = true
+++

If you have read three articles on Go concurrency and closed each one more confused than when you started, this post is for you. Most writing on the subject moves too fast — it uses the word "channel" as if you already know what one is, drops phrases like "fan-out fan-in" as if they refer to well-known landmarks, and expects you to bring your own mental model of how goroutines relate to threads. This post makes the opposite bet. It starts from zero, defines each term the moment it appears, keeps the code samples small enough to hold in your head, and — this part matters — puts the **primitives** (the building blocks) and the **best practices** (the rules of thumb) in separate sections so you never have to guess which one you are looking at.

You should be able to read this once, top to bottom, and come away with a working mental model. If you want to go deeper afterward, the last section lists the sources every serious Go writer eventually points at.

## The one distinction to make before anything else

The single most useful sentence about Go concurrency was written by Rob Pike, one of Go's designers, in a 2012 talk called *Concurrency Is Not Parallelism*:

- **Concurrency** is *dealing with* many things at once. It is a way of writing a program so that independent activities are described independently, without saying which one runs first or whether they run at the same time.
- **Parallelism** is *doing* many things at once. It is what happens when those independent activities are actually executed simultaneously on multiple CPU cores.

That sounds like a word game until you notice what it lets you do: you can write a concurrent Go program on a single-core machine and it will run correctly. If you put it on a multi-core machine, the Go runtime will happily execute parts of it in parallel, and your program does not need to change. Concurrency is a way of **structuring** a program. Parallelism is what the hardware may or may not do when it runs.

The whole rest of the language design falls out of this. Everything below is a tool for describing "these activities are independent" — nothing more.

## The mental model, in one paragraph

A **goroutine** is a function that runs on its own, alongside the rest of your program, without you having to wait for it to finish. A **channel** is a small pipe you can send values through: one goroutine puts a value in one end, another goroutine takes it out the other end. Everything else in this post is a variation on those two ideas: sometimes with a lock instead of a channel, sometimes with a group of goroutines instead of one, sometimes with a way to tell every goroutine "stop what you're doing." That's it. Hold onto that.

---

# Part I — The primitives

The primitives are the raw building blocks. Each one has three questions attached: *what is it, what does it look like, and when would I reach for it?* We will answer those three, in order, for every primitive.

## The goroutine

**What it is.** A goroutine is a function that runs concurrently with the rest of your program. You start one by writing the keyword `go` in front of a function call. The function begins executing immediately, and your code keeps going without waiting for it to finish.

Goroutines are not operating-system threads — they are much lighter. The Go runtime can happily run thousands or hundreds of thousands of them on a small number of real threads. You do not schedule them yourself; the runtime does. You just say "run this alongside everything else."

**What it looks like.**

```go
package main

import (
    "fmt"
    "time"
)

func say(msg string) {
    for i := 0; i < 3; i++ {
        fmt.Println(msg)
        time.Sleep(100 * time.Millisecond)
    }
}

func main() {
    go say("hello")   // runs concurrently
    say("world")      // runs on the main goroutine
}
```

If you run this, `hello` and `world` interleave in the output. If you remove the `go`, they don't — `say("hello")` finishes completely before `say("world")` starts.

**When you'd reach for it.** Any time a piece of work is genuinely independent of the work around it — a background task, an outbound HTTP request while you do something else, a periodic tick, one worker among several handling incoming jobs.

There is one catch worth naming up front, because it burns everyone once: **the moment `main` returns, the whole program exits, even if goroutines you started are still running.** A goroutine is not a promise your program will wait for it. You need to arrange that separately — with a channel, a `sync.WaitGroup`, or an `errgroup` — all of which we get to below.

## The channel

**What it is.** A channel is a typed pipe. You create one with `make(chan T)` where `T` is the type of value it will carry. One goroutine sends values into it with the `<-` operator: `ch <- value`. Another goroutine receives values out of it with the same operator flipped: `value := <-ch`.

A channel is more than just a pipe though — it is also a **synchronization point**. That word matters, so let's slow down on it. When you create a channel with `make(chan T)`, it is *unbuffered*. That means every send is paired with a receive: the sender **blocks** (pauses) until some other goroutine is ready to receive, and the receiver blocks until some other goroutine is ready to send. The two goroutines meet at the channel, exchange a value, and continue. This is called a *rendezvous*.

**What it looks like.**

```go
package main

import "fmt"

func main() {
    ch := make(chan string)

    go func() {
        ch <- "hi from the goroutine"
    }()

    msg := <-ch
    fmt.Println(msg)
}
```

The `main` goroutine reaches `<-ch` and blocks. The launched goroutine sends its string; both goroutines proceed. If you removed the launched goroutine, `main` would block forever waiting for a message that never comes, and Go would eventually detect this and panic with "all goroutines are asleep — deadlock."

**When you'd reach for it.** When you want two goroutines to hand values back and forth in a coordinated way, or when you want to use the "waiting for the other side" behavior as a signal — "wait here until I tell you to go."

## The buffered channel

**What it is.** A channel with room for a certain number of values before it blocks. You make one with `make(chan T, N)`, where `N` is the buffer size. Now the sender only blocks if the buffer is full, and the receiver only blocks if the buffer is empty.

**What it looks like.**

```go
ch := make(chan int, 2)
ch <- 1        // does not block
ch <- 2        // does not block
// ch <- 3     // would block, because the buffer is full
fmt.Println(<-ch, <-ch) // 1 2
```

**When you'd reach for it.** Honestly, less often than you would think. The most common legitimate reason is when you know exactly how many values will be sent (say, "one result per worker, and I have five workers"), so a buffer of that size lets the workers finish their sends and exit without waiting for anyone to receive. If your reason for adding a buffer is "so the sender doesn't block," pause and ask *why the sender is blocking* — the buffer is probably masking a bug rather than fixing one. Prefer unbuffered channels as your default, and reach for a buffer only when you have a measured reason.

## select

**What it is.** `select` is a control structure that lets one goroutine wait on **multiple** channel operations at once, and act on the first one that becomes ready. It looks like a `switch`, but each case is a channel send or receive.

**What it looks like.**

```go
select {
case msg := <-ch1:
    fmt.Println("got from ch1:", msg)
case ch2 <- "hello":
    fmt.Println("sent to ch2")
case <-time.After(1 * time.Second):
    fmt.Println("timed out waiting")
}
```

If none of the cases are ready, `select` blocks until one is. If you add a `default:` case, `select` becomes non-blocking — it runs `default` immediately when no other case is ready.

**When you'd reach for it.** Whenever a goroutine needs to react to more than one thing at a time: "a message from the network, or a cancellation signal, or a timeout, whichever comes first." `select` is the fundamental multiplexer of the language.

## sync.Mutex

**What it is.** A **mutex** ("mutual exclusion") is a lock. When one goroutine calls `Lock`, any other goroutine that calls `Lock` on the same mutex has to wait until the first one calls `Unlock`. The purpose is to protect shared state — a variable that more than one goroutine reads and writes — so that only one goroutine is touching it at a time.

**What it looks like.**

```go
import "sync"

type Counter struct {
    mu sync.Mutex
    n  int
}

func (c *Counter) Inc() {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.n++
}
```

The `defer c.mu.Unlock()` guarantees the lock is released even if the function panics or returns early.

**When you'd reach for it.** When you have a piece of shared state that more than one goroutine needs to read *and* write, and passing the state around through a channel would be awkward. A mutex is the right tool for protecting a field on a struct; a channel is the right tool for handing a value from one goroutine to another. More on that distinction in the best-practices section.

## sync.RWMutex

**What it is.** A mutex with two flavors of lock: a **read lock** and a **write lock**. Many goroutines can hold the read lock at the same time; only one can hold the write lock, and while it is held, nobody can hold the read lock. Use it when your shared state is read far more often than it is written.

**What it looks like.**

```go
var (
    mu    sync.RWMutex
    cache = map[string]string{}
)

func Get(k string) string {
    mu.RLock()
    defer mu.RUnlock()
    return cache[k]
}

func Set(k, v string) {
    mu.Lock()
    defer mu.Unlock()
    cache[k] = v
}
```

**One thing to know.** You cannot "upgrade" a read lock to a write lock. If you hold `RLock` and then call `Lock`, you will deadlock — you are waiting for yourself. Release the read lock first, then acquire the write lock, and re-check whatever you cared about (someone else may have written in between).

## sync.WaitGroup

**What it is.** A counter that lets one goroutine wait for a group of other goroutines to finish. You call `Add(n)` to say "I'm about to start n goroutines," each of those goroutines calls `Done()` when it finishes, and someone calls `Wait()` to block until the counter reaches zero.

**What it looks like.**

```go
var wg sync.WaitGroup

for _, name := range []string{"a", "b", "c"} {
    wg.Add(1)
    go func(n string) {
        defer wg.Done()
        doWork(n)
    }(n)
}

wg.Wait() // blocks until all three call Done()
```

**When you'd reach for it.** Any time you launch a set of goroutines and need to wait for all of them to finish before moving on. Note the ordering rule that trips people up: `Add` must be called **before** the corresponding `go`, not inside the goroutine. If you `Add` inside, the goroutine might not have started counting yet when `Wait` returns, and you'll fall out of the wait too early.

## sync.Once

**What it is.** A tiny helper that runs a given function exactly once, no matter how many goroutines call it concurrently. Everyone else waits for the first call to finish and then proceeds without re-running.

**What it looks like.**

```go
var (
    once sync.Once
    conn *Connection
)

func GetConnection() *Connection {
    once.Do(func() {
        conn = dial()
    })
    return conn
}
```

**When you'd reach for it.** Lazy initialization of an expensive shared resource — a database handle, a compiled regex, an in-memory cache — that many goroutines may ask for concurrently.

## sync.Cond (very briefly)

**What it is.** A "condition variable" — a way for goroutines to wait for some condition to become true, and for another goroutine to signal or broadcast when it does. It's paired with a mutex you provide.

You will very rarely need `sync.Cond` in Go — channels handle almost every situation more clearly. Its main niche is broadcasting a state change to many waiting goroutines at once, where a channel would require more bookkeeping. When in doubt, use a channel.

## sync/atomic

**What it is.** A package of low-level operations that read and write a single word of memory in a way that is safe from being interrupted or scrambled by a concurrent operation. Instead of taking a lock to increment a counter, you can call `atomic.AddInt64(&n, 1)` and get the same safety with less overhead.

Since Go 1.19, the recommended way to use it is through **typed atomic values** — `atomic.Int64`, `atomic.Bool`, `atomic.Pointer[T]`, and friends — which are harder to misuse than the free functions.

**What it looks like.**

```go
import "sync/atomic"

var count atomic.Int64

func hit() {
    count.Add(1)
}

func reads() int64 {
    return count.Load()
}
```

**When you'd reach for it.** For very simple shared numbers or flags where a mutex is measurably too much overhead — a hit counter on a hot request path, a boolean "the shutdown has started" flag. The `sync/atomic` docs themselves say: *"Synchronisation is better done with channels or the sync package."* Take that seriously. Atomics are a scalpel, not a first choice.

## context.Context

**What it is.** The `context` package gives you a small value — a `context.Context` — that carries three things across function calls: a **cancellation signal**, an optional **deadline**, and optional **key-value data** attached to a request. You create a root context (`context.Background()`) and derive child contexts from it (`context.WithCancel`, `context.WithTimeout`, `context.WithDeadline`, `context.WithValue`). When you cancel a parent context, every child derived from it is cancelled too, all the way down.

Think of it as the "stop what you are doing" wire that runs through every function in a call graph.

**What it looks like.**

```go
import (
    "context"
    "time"
)

func Search(ctx context.Context, q string) (Result, error) {
    // pass ctx down into every blocking call
    req, _ := http.NewRequestWithContext(ctx, "GET", url(q), nil)
    return doRequest(req)
}

func main() {
    ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
    defer cancel()
    Search(ctx, "widgets")
}
```

**When you'd reach for it.** Every time you write a function that does work on behalf of a request, or does anything that can be cancelled, or has any I/O in it. In modern Go code, `ctx context.Context` is the first parameter of almost every function that isn't purely a computation on local values. We'll come back to the specific rules in the best-practices section.

## errgroup

**What it is.** `errgroup.Group` (from `golang.org/x/sync/errgroup`) is a `sync.WaitGroup` with two features added: (1) it collects the first error returned by any goroutine in the group, and (2) it can give you a derived `context.Context` that gets cancelled as soon as any goroutine returns an error. That combination — wait for all, but cancel the rest as soon as one fails — is exactly what you want in most "do these N things in parallel" situations.

**What it looks like.**

```go
import "golang.org/x/sync/errgroup"

func FetchAll(ctx context.Context, urls []string) error {
    g, ctx := errgroup.WithContext(ctx)
    for _, u := range urls {
        u := u // capture the loop variable
        g.Go(func() error {
            return fetch(ctx, u)
        })
    }
    return g.Wait()
}
```

Add `g.SetLimit(n)` to cap how many goroutines run at once — a bounded worker pool with about eight lines of code.

**When you'd reach for it.** Any time you would have reached for `WaitGroup`, plus you also care about errors, which is almost always.

## semaphore

**What it is.** `semaphore.Weighted` (also from `golang.org/x/sync`) is a **counting semaphore**: a permit dispenser. You create it with a capacity N, and callers `Acquire(ctx, 1)` a permit before doing work and `Release(1)` when they're done. If all permits are outstanding, `Acquire` blocks (respecting the context, which is why it needs one) until someone releases.

**What it looks like.**

```go
sem := semaphore.NewWeighted(int64(runtime.GOMAXPROCS(0)))

for _, job := range jobs {
    if err := sem.Acquire(ctx, 1); err != nil {
        return err
    }
    go func(j Job) {
        defer sem.Release(1)
        process(j)
    }(job)
}
```

**When you'd reach for it.** When you want to cap parallelism at some number, and `errgroup.SetLimit` doesn't fit the shape of your code — for example, when you're launching goroutines from many places rather than one loop.

---

# Part II — The patterns

The primitives compose. When two or more primitives are used together in a recognisable shape often enough that the shape gets a name, that shape is called a **pattern**. This section is the shortest tour I could write of the ones you'll actually see.

## Fan-out, fan-in

**Fan-out** means one goroutine hands work to several workers. **Fan-in** means several workers hand their results into one channel that a single goroutine reads from. Together they are how you parallelise a stream of work.

```go
func fanIn(cs ...<-chan int) <-chan int {
    var wg sync.WaitGroup
    out := make(chan int)
    for _, c := range cs {
        wg.Add(1)
        go func(c <-chan int) {
            defer wg.Done()
            for v := range c {
                out <- v
            }
        }(c)
    }
    go func() { wg.Wait(); close(out) }()
    return out
}
```

The second goroutine is the important one — it waits for all fan-in workers to finish and *then* closes the output channel so the consumer's `for range` loop terminates cleanly.

## Worker pool with bounded parallelism

The classic "I have 10,000 URLs and I want to fetch them, but not all at once" shape. Prefer `errgroup.SetLimit` over a hand-rolled pool with a jobs channel — it is fewer lines and easier to reason about.

```go
g, ctx := errgroup.WithContext(ctx)
g.SetLimit(8)
for _, u := range urls {
    u := u
    g.Go(func() error {
        return fetch(ctx, u)
    })
}
return g.Wait()
```

Eight requests in flight at any time, first error cancels the rest, returns when everything is done or one has failed.

## Pipeline with cancellation

A **pipeline** is a chain of stages connected by channels: stage 1 reads from an input, does some work, sends to a channel; stage 2 reads that channel, does more work, sends to another channel; and so on. Cancellation matters here because if a downstream stage stops reading (say it hit an error), everything upstream will block forever trying to send to it — a goroutine leak.

The fix is a `done` channel or a `context` that every stage watches:

```go
func square(ctx context.Context, in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for n := range in {
            select {
            case out <- n * n:
            case <-ctx.Done():
                return
            }
        }
    }()
    return out
}
```

Every send is wrapped in a `select` with `<-ctx.Done()` so that if the caller cancels the context, the goroutine returns instead of blocking on a receiver that will never come.

## Timeouts

The idiom is a `select` that races your work against a timer:

```go
select {
case v := <-ch:
    use(v)
case <-time.After(1 * time.Second):
    return errors.New("timeout")
}
```

**A common bug worth naming.** `time.After` creates a timer that lives until it fires. If you call `time.After` inside a hot loop and most iterations don't hit the timeout case, those timers accumulate in memory until they fire — a slow leak that only shows up under load. The fix is to use `time.NewTimer` and `Stop()` it explicitly:

```go
t := time.NewTimer(1 * time.Second)
defer t.Stop()
select {
case v := <-ch:
    use(v)
case <-t.C:
    return errors.New("timeout")
}
```

## Rate limiting

`golang.org/x/time/rate` gives you a **token bucket**: a limiter that hands out N tokens per second, with an optional burst allowance. In the common case you just call `Wait`:

```go
lim := rate.NewLimiter(rate.Every(time.Second), 5) // 1 rps, burst of 5

for _, req := range requests {
    if err := lim.Wait(ctx); err != nil {
        return err
    }
    send(req)
}
```

## Graceful shutdown

When a signal (SIGINT, SIGTERM) arrives, you want in-flight work to finish and new work to stop being accepted. `signal.NotifyContext` gives you a context that gets cancelled on those signals:

```go
ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
defer stop()

srv := &http.Server{Addr: ":8080"}
go func() {
    <-ctx.Done()
    srv.Shutdown(context.Background())
}()

if err := srv.ListenAndServe(); err != http.ErrServerClosed {
    log.Fatal(err)
}
```

## Single-flight

When many goroutines all ask for the same expensive thing at once — a cache miss that stampedes into the database — you usually want only one to do the work and the rest to receive its result. `golang.org/x/sync/singleflight` does exactly this:

```go
var g singleflight.Group

v, err, _ := g.Do(userID, func() (any, error) {
    return db.LoadUser(userID)
})
```

If 100 goroutines call `g.Do("42", ...)` at the same time, only one runs the load; the other 99 wait on the same call and each get the same result.

---

# Part III — The best practices

The primitives tell you *what you can do*. The best practices tell you *what you should do*. Nothing in this section is enforced by the compiler — every one of these rules exists because people have shipped bugs by breaking it. Take them seriously; they are cheap to follow and expensive to relearn.

## "Don't communicate by sharing memory; share memory by communicating."

This is the most-quoted line about Go concurrency, and it deserves an explanation instead of being repeated like an incantation. It means: instead of putting a value into a shared variable and using a lock to coordinate access, prefer to **send the value through a channel from the goroutine that has it to the goroutine that needs it.** When a value moves through a channel, only one goroutine holds it at a time — you get exclusive access for free, without a lock.

The line is not a ban on mutexes. `sync/atomic`'s own package documentation says the same thing, then goes on to describe atomic operations. The rule of thumb — attributed to Dave Cheney, and consistent with the Go team's style guide — is:

- **Use a channel** to hand a value from one goroutine to another, or to coordinate independent goroutines.
- **Use a mutex** to protect the internal state of a single struct.

Both are correct Go. Reach for the one that expresses your intent most clearly.

## Every goroutine needs a stop condition, and you must know what it is

Before you type `go`, answer the question: *under what condition will this goroutine exit?* If you can't say — "it exits when the context is cancelled," "it exits when the input channel is closed," "it exits after one iteration" — you are writing a goroutine leak. Leaked goroutines never return their stack memory and never let their captured references get garbage-collected, so a leak can drag down a whole process over time.

This is the single most important rule in the section. Write it on a sticky note.

## Sender closes, receiver never; and never close twice

Closing a channel is a signal: "no more values will be sent." Two rules follow from that:

- **Only the sender closes a channel.** If a receiver closes, the sender may panic on the next send.
- **A channel must be closed exactly once.** Closing an already-closed channel panics.

When multiple goroutines send into the same channel, close it from a coordinator that waits for all senders to finish (the fan-in example above uses this shape — the `wg.Wait(); close(out)` goroutine is the coordinator).

## The four channel behaviors to memorize

These four rules capture almost every channel bug you will hit:

| Operation | Result |
|---|---|
| Send on a closed channel | **Panic** |
| Close an already-closed channel | **Panic** |
| Send or receive on a `nil` channel | **Blocks forever** |
| Receive from a closed channel | Returns the zero value immediately, and `ok` is `false` |

The `nil`-channel rule is quietly useful: inside a `select`, you can set a case's channel to `nil` to *disable* that case without restructuring the whole select. `select` skips cases whose channel is nil.

## Prefer unbuffered channels

An unbuffered channel makes the synchronisation between sender and receiver explicit: "the send does not complete until the receive begins." That property is often exactly what you want, and it makes the code easier to reason about. A buffered channel weakens that guarantee — the send can complete before anyone is listening — which is sometimes what you want, but often just papers over a bug elsewhere.

Uber's style guide puts this crisply: channels should usually be size one or unbuffered; any other size deserves justification. Follow that default; add a buffer only when you have a specific reason.

## `WaitGroup.Add` before `go`, not inside

```go
// wrong — race between Add and Wait
go func() {
    wg.Add(1)
    defer wg.Done()
    work()
}()

// right — Add is visible to Wait before the goroutine even starts
wg.Add(1)
go func() {
    defer wg.Done()
    work()
}()
```

If `wg.Wait()` runs before `wg.Add(1)` does, you fall out of the wait too early and race whatever runs next. Always `Add` in the calling goroutine, before launching.

## Context propagation is a function-parameter contract

The `context` package's docs spell out the discipline; internalise it once:

- `ctx context.Context` is the **first parameter** of a function that takes one.
- Do **not** store a context in a struct field. Pass it explicitly.
- Do **not** pass a `nil` context. Use `context.TODO()` if you genuinely don't have one yet.
- Whenever you derive a context with `WithCancel`, `WithTimeout`, or `WithDeadline`, `defer cancel()` immediately so its resources are always released.

## Goroutine ownership is a design discipline

Whoever starts a goroutine is responsible for its lifecycle. Do not spawn a goroutine in `init()`; there is no one to shut it down and it is hidden from the caller. When your package needs background work, expose a lifecycle method — `Start`, `Close`, `Shutdown` — and let the caller decide when the work runs and when it stops.

A related principle from Google's Go style guide is worth pairing with this one: **prefer synchronous APIs.** Have your function return its result directly, and let the caller decide whether to run it in a goroutine. A library that spawns hidden goroutines gives its caller no way to bound concurrency, propagate cancellation, or observe errors.

## Run the race detector in CI

Go ships with a data-race detector. Enable it with `-race`:

```bash
go test -race ./...
```

It instruments your program to notice when two goroutines touch the same memory without synchronisation, and reports the offending stack traces. It costs roughly 5–10× in CPU and memory, so you don't run it in production, but you *do* run it in CI on every commit. Any race it reports is a real bug; races that only manifest under load are the ones that page you at 2 a.m.

The companion tool worth knowing about is `go.uber.org/goleak`: a small library that fails a test if it leaves goroutines behind after the test returns. Adding a `TestMain` that calls `goleak.VerifyTestMain(m)` is a five-line change that catches every leak the moment it lands.

## The rules about the memory model that actually matter

Go's [memory model](https://go.dev/ref/mem) is dense, but a handful of guarantees are worth knowing:

- A **send on a channel** happens before the matching **receive** completes.
- **Closing a channel** happens before a receive that observes the close (returning the zero value).
- On an unbuffered channel, the **receive** actually happens before the **send** completes — which is the formal way of saying "sender waits for receiver."
- For a buffered channel with capacity C, the k-th receive happens before the (k+C)-th send completes.
- `mu.Unlock()` on call n happens before `mu.Lock()` on call n+1.

You don't need to memorise these to write correct code — following the practical rules above is enough — but knowing they exist means you can reason precisely when something surprising happens.

---

# What to install and set up, once, so you're not on your own

You should not be finding concurrency bugs by staring at code. Set these up once per project and let them find bugs for you:

- **`go test -race ./...` in CI.** Non-negotiable.
- **`go.uber.org/goleak` in your test suite.** Catches leaked goroutines the moment they land.
- **`errgroup` from `golang.org/x/sync`.** Reach for it any time you would have reached for `WaitGroup`.
- **`golangci-lint` with `govet` and `staticcheck` enabled.** Catches a lot of concurrency footguns statically — missed locks, copied mutexes, mistakes with loop-variable capture in goroutines.

---

# A tiny end-to-end example that uses most of it

Here is a program that fetches a list of URLs concurrently with bounded parallelism, cancels everything on the first error, times out after five seconds, and shuts down cleanly on Ctrl-C.

```go
package main

import (
    "context"
    "fmt"
    "io"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "golang.org/x/sync/errgroup"
)

func fetch(ctx context.Context, url string) (int, error) {
    req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
    if err != nil {
        return 0, err
    }
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return 0, err
    }
    defer resp.Body.Close()
    n, err := io.Copy(io.Discard, resp.Body)
    return int(n), err
}

func main() {
    urls := []string{
        "https://go.dev",
        "https://pkg.go.dev",
        "https://golang.org",
    }

    // signal-driven shutdown
    ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
    defer stop()

    // overall deadline
    ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
    defer cancel()

    // parallel fetches with bounded concurrency
    g, ctx := errgroup.WithContext(ctx)
    g.SetLimit(2)

    for _, u := range urls {
        u := u
        g.Go(func() error {
            bytes, err := fetch(ctx, u)
            if err != nil {
                return fmt.Errorf("%s: %w", u, err)
            }
            fmt.Printf("%s: %d bytes\n", u, bytes)
            return nil
        })
    }

    if err := g.Wait(); err != nil {
        fmt.Fprintln(os.Stderr, "error:", err)
        os.Exit(1)
    }
}
```

Read it slowly. Every concept in this post shows up: goroutines (`g.Go`), context (`ctx` threaded everywhere), cancellation propagation (the signal handler cancels the context, which cancels every in-flight HTTP request), bounded parallelism (`g.SetLimit(2)`), timeouts (`WithTimeout`), and graceful shutdown (`signal.NotifyContext`). It does the right thing on the happy path, the error path, the slow path, and the "user hit Ctrl-C" path — in about 40 lines.

---

# Where to go next

If you want to go deeper, these are the sources every Go writer eventually points at, in a sensible reading order:

- [Effective Go — Concurrency](https://go.dev/doc/effective_go#concurrency) — the language authors' own overview.
- [Go Concurrency Patterns: Pipelines and cancellation](https://go.dev/blog/pipelines) — the canonical pipeline article. Read the "explicit cancellation" section twice.
- [Go Concurrency Patterns: Context](https://go.dev/blog/context) — the introduction to `context` that established the modern conventions.
- [Go Concurrency Patterns: Timing out, moving on](https://go.dev/blog/concurrency-timeouts) — where the `time.After` leak trap is spelled out.
- [Rob Pike — Concurrency Is Not Parallelism](https://go.dev/talks/2012/waza.slide) — the talk. 30 minutes; watch it once.
- [The Go Memory Model](https://go.dev/ref/mem) — dense but authoritative. Skim it now, come back to it when something surprises you.
- [Dave Cheney — Channel Axioms](https://dave.cheney.net/2014/03/19/channel-axioms) and [Never start a goroutine without knowing how it will stop](https://dave.cheney.net/2016/12/22/never-start-a-goroutine-without-knowing-how-it-will-stop) — short, direct, worth printing out.
- [Uber's Go style guide](https://github.com/uber-go/guide/blob/master/style.md) — the concurrency section codifies most of the rules above.
- [Google's Go style guide (decisions)](https://google.github.io/styleguide/go/decisions.html) — the "concurrency" and "contexts" sections.

If you read this post, understand it, and then read those in order, you will end up with a working practitioner's model of Go concurrency. You will still make mistakes — everyone does — but the race detector, `goleak`, and the rules above will catch almost all of them before they matter.

That's the whole thing. Two ideas — goroutines and channels — a small handful of primitives around them, a small handful of patterns built out of those primitives, and a small handful of rules to keep from hurting yourself. Held together it is not a big topic. It only feels big because most writing about it forgets to slow down.
