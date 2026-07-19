+++
title = "The pair-programming session that made me write tests first"
date = "2026-07-18T23:15:11-04:00"
draft = false
description = "Years ago, on my first day at a new company, a senior developer I'd never met sat down next to me and refused to talk about implementation until we had a failing test. That one session rewired how I write code, in every language, for good."
tags = ["testing", "tdd", "mentorship", "software-design", "code-quality"]
categories = ["Code Quality"]

[cover]
image = "/images/og/the-pair-programming-session-that-made-me-write-tests-first.png"
hiddenInList = true
hiddenInSingle = true
+++

Years ago, on my first day at a new company, I sat down for what I thought was going to be a normal pair-programming session. There was a story on the board — I no longer remember what it was, exactly. Some feature, a handful of requirements, the usual shape of a first ticket at a new job. I read the requirements, my mind raced ahead to how I'd build it, and I started talking through my approach.

The developer sitting next to me — a quiet, learned man I'd only just met — waited until I paused for breath and said, evenly: *"Let's write a test."*

That single sentence baffled me in the moment. My reaction was the reaction most developers have the first time they hear it phrased that way, and I'm not proud of how confidently I pushed back in my own head: *How can I write a test when I don't even know what the code is going to do yet?* It felt backwards. The test is supposed to check the code. The code has to exist first for there to be anything to check. Every instinct I had built up to that point told me he'd gotten it turned around.

But I was new, and he was clearly not new, so I followed along.

## What he actually did in that session

He didn't lecture. He didn't hand me a book. He walked me through it in the same conversational tone he'd used to suggest it in the first place. Something close to:

> We need something that's going to take *these* inputs, and in *this one case* it should do *this*. So let's create a test that calls something with the interface we *think* it's going to have, and assert it does what it's supposed to do.

Then he wrote the test. It called a function that didn't exist yet. We ran it. It failed to even compile.

> Good. Now let's create a function with that interface that essentially does nothing. Run it again — it fails again, but now for the right reason. Now let's make it do that one thing.

We made it do that one thing. The test passed. He moved on to the next case in the requirements, and we did it again. And again. And again. Each cycle was minutes long. Each cycle produced one small, concrete, checked-in slice of behavior. When we had exhausted the requirements — every case the story described, each proven by a green test — we didn't stop. He started asking a different kind of question:

> What if this dependency throws? What if this database call times out? What if the input is empty? What if it's malformed?

For each one, he'd say: *let's mock that dependency to simulate that failure, and write a test that says we handle it gracefully.* And we did. On and on, until the thing we'd built was ringed by tests that described not just what it did, but every way the world could go wrong around it and how it would respond.

What struck me most, in hindsight, wasn't the test count. It was that the entire time we worked, he kept steering us toward dependency injection. He wouldn't let anything the code needed be quietly constructed inside a function. Everything a unit depended on — the clock, the client, the store — came in from the outside as an argument. That wasn't a design principle he'd decided to enforce for its own sake. It was the only way we could control what we were testing up front, and he knew it, and he shaped the code around that reality without ever making a speech about it.

## Why the shape came out different

The implementation we ended up with looked nothing like what I would have written on my own that morning. If I'd built it my way, I'd have started with a class, filled it in top-down, wired up its collaborators inside its constructor because that's convenient, and only *then* thought about how to test it — and I'd have hit a wall the moment I tried, because the code would have been in charge of everything and I'd have had nothing to substitute or observe.

Instead, because the test existed before the code, the code had no choice but to be built in a shape that let the test run. The seams were there from the first line. Dependencies came in, results came out, and everything in between was small and observable. I've since read a lot of writing about *why* test-first work produces that structure — I wrote about the mechanism specifically in [How writing tests first changes the shape of Go code]({{< ref "posts/how-writing-tests-first-changes-the-shape-of-go-code.md" >}}) — but in that session it was just a lived thing. The shape came out different because whichever thing you write second has to bend to fit whatever you wrote first, and this time the test was first.

By the time we were done, we had a solid implementation that handled every requirement in the story and was, honestly, ridiculously fault-tolerant for a first pass at a small feature. I remember looking at the finished thing and having a very quiet realization I didn't have language for yet: *this is what good code looks like when you don't have to bolt tests onto it afterward.*

## What it did to me

I don't want to overstate the size of that session — it was a couple of hours, one story, one function, one dependency graph. But I've never gone back to the way I wrote code before it. Not once. Regardless of the language, regardless of the platform, regardless of whether I'm writing production code or a hobby project on a Sunday, the approach is the same: a small failing test, then the smallest thing that makes it green, then a hard look at whether the thing I just wrote is actually well-shaped or just working. The quality of the code I ship is not the quality of the code I *could* ship on my best day — it's the quality of the loop I've been running since that afternoon. That's the part that matters.

The other thing I underestimated at the time, and would only appreciate later, is what it does to your relationship with a codebase you've been away from. Test-first code that ships with a real suite behind it is code you can walk away from for six months, come back to, change something meaningful, and know inside of a minute whether you've broken anything. Code without that suite is code you have to *remember*, and human memory of a codebase decays fast. The tests are the thing that lets you leave.

## When I don't do it

I want to be honest about this, because pretending otherwise is how test-first advocacy becomes annoying. There are places I don't work this way, or work this way loosely:

- **Spikes.** When I don't yet know what I'm building — genuinely exploring, not procrastinating — I skip the tests until the shape of the thing is clear enough to be worth pinning down. Then I usually throw the spike away and build the real version test-first from the requirements the spike surfaced.
- **UI glue.** The very outer layer of a UI, where the logic is *"take this event and hand it to the thing that already has tests,"* rarely benefits from a unit test. I lean on integration or end-to-end coverage for that layer instead.
- **Throwaway scripts.** A one-shot data-fix script that will be run once and deleted doesn't need a suite around it. It needs a good `--dry-run` and a careful reader.

Everything else — anything I'd have to explain to another engineer six months from now, anything that will be depended on, anything that has a chance of surviving the sprint it was born in — gets the loop. And the loop, still, is the one I learned in that session.

## The part I remember most

Years later, I still think about that "let's write a test" sentence as one of the highest-leverage things another developer has ever said to me. He didn't argue. He didn't sell it. He didn't tell me *why* first and *how* second. He just moved the pen an inch to the left of where I was going to start and let the rest follow. And it did. It changed which kind of engineer I turned into, and by extension the kind of code every team I've worked on since has had to read.

If you're reading this and you've been on the fence — either because it feels backwards, or because someone tried to sell it to you as a religion — try it the way he showed me. One tiny failing test. The smallest thing that makes it green. The next case. Don't argue with the loop until you've been through it enough times to have actually experienced it. That's the only honest way to know whether it's for you, and it costs an afternoon.

---

*Thanks, Charles.*
