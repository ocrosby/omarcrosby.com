+++
title = "Design patterns as vocabulary"
date = "2026-07-20T22:00:34-04:00"
draft = false
description = "Not a catalog of the Gang of Four patterns — an argument for why they're foundational. Design patterns are a shared vocabulary that lets you read a codebase's architectural intent from the names alone, and the value of that shared language transcends any specific programming language."
summary = "Not a catalog of the Gang of Four patterns — an argument for why they're foundational. Design patterns are a shared vocabulary that lets you read a codebase's architectural intent from the names alone, and the value of that shared language transcends any specific programming language."
tags = ["design-patterns", "gang-of-four", "architecture", "software-design", "fundamentals", "python", "go", "rust"]
categories = ["Fundamentals"]
ShowToc = true

[cover]
image = "/images/og/design-patterns-as-vocabulary.png"
hiddenInList = true
hiddenInSingle = true
+++

You open an unfamiliar Go codebase. There's a file called `payment_strategy.go`. Another one called `event_observer.go`. A struct called `NotificationDecorator`. A function called `NewClientFactory`.

You haven't read any of the implementations yet, and you already know — with high confidence — how each of these fits into the larger system. The `PaymentStrategy` is one of several interchangeable algorithms selected at runtime. The `EventObserver` gets notified when something happens somewhere else. The `NotificationDecorator` wraps another notifier to add behavior around it. The `ClientFactory` builds clients so callers don't have to know which concrete type they're getting.

Every one of those inferences is right, or at least ninety percent right. And you knew all of it from the file names.

That is the actual, foundational value of the Gang of Four design patterns. Not that each pattern is a solution to a recurring problem — that's true, but you can find that argument in every intro-to-patterns article on the internet. The deeper value is that they gave the industry a **shared vocabulary**. Twenty different developers with different backgrounds, working in different languages, on different codebases, converge on the same names for the same shapes. When you see one of those names, an enormous amount of context arrives with it for free.

This post is not a tour of the individual patterns. There are already a thousand of those. This is an argument for why, if you haven't yet, learning the vocabulary is worth an afternoon of your career.

## What "GoF" refers to, in one paragraph

*Design Patterns: Elements of Reusable Object-Oriented Software* was published in **1994** by four authors — Erich Gamma, Richard Helm, Ralph Johnson, and John Vlissides — who collectively became known as *the Gang of Four*. The book catalogs **23 recurring design problems** and the object-oriented solutions software teams had converged on, split into three groups: **5 creational patterns** (how objects come into existence), **7 structural patterns** (how objects are composed), and **11 behavioral patterns** (how objects communicate). The book has sold over half a million copies, has been translated into more than a dozen languages, and won the ACM SIGPLAN Programming Languages Achievement Award in 2005 for its impact on programming practice.

Thirty years later, developers still identify problems and communicate solutions in the vocabulary the book established. That vocabulary is what you're really learning when you learn the patterns.

## The vocabulary argument

Software has an unusually severe communication problem. Every system has hundreds of moving parts. The parts have subtle rules about how they interact. Those rules aren't visible in the code — they're implicit in class relationships, method signatures, and control flow. When one developer tries to describe a system to another, they have to reconstruct all of that context in prose or in a diagram. The reconstruction is slow, imprecise, and often has to be redone every time the audience changes.

Design patterns partly solve this by giving common shapes short, agreed-upon names.

Consider the difference between these two ways of explaining a piece of a system to a colleague:

> "So we have a class that maintains a list of subscribers. Whenever a certain kind of event happens, it walks the list and calls a method on each one. The subscribers register themselves at startup, and they can unregister later. Each subscriber only cares about the events it subscribed to — the class doesn't know what any of them do with the events. Also, we have to be careful about thread safety when subscribers are added or removed while events are firing..."

Or:

> "It's an Observer. Thread-safe registration."

The second version is not a shorter version of the first — it's a *complete* version, for anyone who knows the vocabulary. The word *Observer* activates everything the first version had to spell out: the list of subscribers, the notification loop, the registration/deregistration, the decoupled don't-know-what-they-do relationship, and — usually — the standard concerns about concurrent modification. All of that arrives with the name. The colleague nods, asks about the thread-safety mechanism, and you've spent thirty seconds on what would otherwise take three minutes.

This compression effect happens in every conversation about software design. It happens in code review comments (*"why aren't we using a Strategy here?"* is a complete thought). It happens in commit messages (*"refactor(payment): extract Strategy for gateway selection"* tells the reader exactly what changed). It happens in job interviews (*"we introduced a Facade to isolate the legacy system"* conveys a real architectural decision in eight words). It happens in the file names and class names you write, where a suffix like `Factory`, `Adapter`, or `Visitor` labels the shape for every future reader.

The vocabulary compounds. Every developer who learns the same names becomes another peer who can read your intent instantly, and whose intent you can read instantly in return.

## Why patterns transcend languages

The critical property is that the vocabulary describes **shapes**, not **syntax**. A shape is language-independent by definition — it's a description of how parts fit together, which doesn't care whether the parts are Python classes, Go structs, or Rust traits.

The same **Strategy** pattern in three languages:

```python
# Python — protocol-based
class PricingStrategy(Protocol):
    def price(self, items: list[Item]) -> int: ...

def checkout(items, strategy: PricingStrategy) -> int:
    return strategy.price(items)
```

```go
// Go — interface-based
type PricingStrategy interface {
    Price(items []Item) int
}

func Checkout(items []Item, strategy PricingStrategy) int {
    return strategy.Price(items)
}
```

```rust
// Rust — trait-based
trait PricingStrategy {
    fn price(&self, items: &[Item]) -> u64;
}

fn checkout(items: &[Item], strategy: &dyn PricingStrategy) -> u64 {
    strategy.price(items)
}
```

Three different syntaxes for the same shape. If you know what "Strategy" means, all three snippets tell you the same story instantly: the checkout function delegates the pricing decision to an interchangeable algorithm that's chosen at runtime. Any of these variants could implement Black Friday pricing, subscriber discounts, corporate contract rates, or a hundred other rules, and the calling code doesn't change.

You can walk into a Java project, a Ruby project, a TypeScript project, or a Kotlin project and see the exact same shape. The identifier might be `PricingStrategy`, `IPricingStrategy`, `PricingPolicy`, or `PricingCalculator`, but the moment you see it accepted as a constructor argument or a method parameter, the shape resolves. You are reading the same architectural intent regardless of the language you happen to be in.

This is the property that makes patterns *foundational*. A new library you learn in a new language teaches you that library. A new pattern you learn teaches you a shape you'll recognize in every language you ever work in again.

## Naming compresses architectural intent

The compression works at the level of individual identifiers too. Look at how much a single word tells you about what the code does:

- `UserRepository` — this thing owns persistence for users. It probably has `save`, `find_by_id`, `find_by_email`, `delete` methods, and it's the *only* place in the codebase that talks to the underlying storage. If I change from Postgres to Dynamo, I edit this thing and probably nothing else.
- `ClickHandler` — this thing responds to clicks. It's decoupled from whatever emits the clicks; something else registers it with an event source.
- `RequestBuilder` — this thing constructs requests through a series of method calls that each set one part of the request. There's probably a final `.build()` or `.send()` that finalizes it.
- `LoggingProxy` — this thing wraps another thing that has the same interface, adds logging around every call, and forwards the call to the wrapped thing. The users of the proxy can't tell they're talking to a proxy.
- `ConnectionPool` — this thing manages a bounded set of expensive resources and hands them out on demand, blocking or timing out when the pool is exhausted.

Not every one of these is a formal GoF pattern (Repository and ConnectionPool aren't, strictly), but they all follow the same principle: **name-as-architectural-summary**. A single well-chosen noun communicates the shape, the responsibility, and often the implementation strategy.

When you see a codebase where every meaningful class or module is named in this style — nouns that describe a role in a well-known shape — reading the code becomes an exercise in pattern-recognition rather than close reading. You look at a directory listing and you already know the architecture. You look at a constructor's parameter list and you already know the collaborators. The reading speed goes up an order of magnitude.

The reverse is also true: when a codebase names things like `UserManager`, `DataProcessor`, `SystemHelper`, `Utils`, `Handler` — the names carry no architectural signal, and every file has to be read to understand what it does. Every codebase that reaches a certain size and never adopts the vocabulary ends up in that state. It's not that the code is bad; it's that reading it is slow, because the reader is reconstructing the shapes from first principles every time.

## The honest counter-view

It would be dishonest to write this post without acknowledging that not everyone agrees the patterns are foundational, and that even the original authors have criticized parts of the book.

The most-cited critique is from **Peter Norvig**, who [demonstrated](https://norvig.com/design-patterns/) that 16 of the 23 patterns either simplify substantially or disappear entirely in Lisp or Dylan — languages that have first-class functions, macros, and multiple dispatch. His argument, in miniature: many GoF patterns are recipes for overcoming the specific limitations of C++ and Java in 1994. If your language gives you those capabilities directly, the "pattern" becomes a single language feature you use without thinking about it. Strategy in Python often becomes "pass a function." Command in JavaScript often becomes "pass a closure." Observer in almost any modern language often becomes "attach an event handler."

Erich Gamma himself, in a 2009 interview, revealed that the four authors had discussed refactoring the book for a second edition. Among the changes they considered: **removing Singleton** entirely (Gamma proposed it; the others didn't agree), adding dependency injection and null object as new patterns, and recategorizing several existing patterns. That the original authors themselves would have made significant changes twelve years after publication is worth knowing — patterns are not scripture, and the specific twenty-three the book catalogs are not a complete or final list.

Modern senior engineers frequently caution against pattern-obsession. The failure mode is real: developers reach for a Factory to create objects that could be created with a constructor, wrap a class in a Facade to hide a complexity that wasn't there, introduce a Visitor when a simple `switch` would have been clearer. Pattern *language* is a communication tool; pattern *deployment* is a design decision that has to be justified by an actual problem. The rule I use — and the rule almost every experienced developer I know uses — is: **apply a pattern when the signal for it is present, and name it explicitly when you do.** Don't apply patterns speculatively.

None of this undermines the vocabulary argument. It refines it. What you're learning when you learn the patterns is not a set of blueprints to apply mechanically; it's a lens for recognizing shapes that already exist in the wild. That lens is what makes you fluent in the language of software design.

## The actual reason people who use them use them

Peel away the ceremony, the diagrams, the "when to use this pattern" tables, and the reasons developers who've been at this a while reach for the GoF vocabulary come down to three things:

**1. To describe a design decision in one word to a colleague.** When you tell a reviewer *"I extracted a Strategy here so we can add region-specific pricing without touching the checkout flow,"* you've conveyed the mechanism, the motivation, and the extensibility argument in a single sentence. That's an enormous efficiency in day-to-day collaboration.

**2. To recognize a pattern you're about to reinvent.** Halfway through writing a new class, you notice you've built a list of subscribers, a way to add and remove them, and a method that walks the list and calls each one. That's an Observer. Knowing that saves you from writing a slightly-wrong or slightly-idiosyncratic version — the pattern name pulls in twenty years of accumulated knowledge about what edge cases matter (concurrent modification, memory leaks from forgotten unsubscribes, ordering guarantees, event delivery under failure). Reinvention costs you the accumulated wisdom.

**3. To read someone else's code faster.** A codebase whose contributors know the vocabulary and use the naming conventions is dramatically easier to onboard onto. The pattern names shortcut the "what does this class do?" question that dominates early days on a new project. You skim, you recognize, you keep moving. The productivity difference on a large codebase is real and lasting.

The people who *seem* to use patterns for their own sake — building elaborate class hierarchies to demonstrate mastery of the catalog — are not actually the ones getting value from the patterns. The people getting value are the ones for whom the vocabulary has become invisible: they use it without noticing, the way a fluent speaker uses grammar.

## How to actually learn them

If this argument has landed, and you'd like to make the vocabulary yours, the pragmatic path is not to read the whole book cover-to-cover. That would work but it's a lot of reading before the payoff arrives.

The higher-leverage path:

**1. Learn five patterns in depth first.** My picks would be **Strategy**, **Observer**, **Adapter**, **Factory Method**, and **Decorator**. Between them, they cover the majority of pattern-recognition you'll do in day-to-day code review, and they show up in nearly every codebase of any significant size. Read each pattern's intent, look at three or four real-world examples, and try to write a small one yourself in a language you know.

**2. Start noticing them in code you read.** Every project you touch — open-source, your employer's, a tutorial — has these shapes in it. Some are labeled explicitly (`OrderStrategy`, `FileFactory`); some are unlabeled but structurally identical. Practice the recognition. It's the same skill as learning to spot common phrases in a foreign language you're studying.

**3. Name your own code using the vocabulary.** When you introduce a class that acts as an Adapter, name it `SomethingAdapter`. When you extract a Strategy, name the interface `SomethingStrategy`. This is not for your sake — it's for the sake of the next person who reads the code, and for the sake of the future you who will re-read it in six months. The naming compounds over time as the codebase's collaborators internalize the vocabulary.

**4. Add patterns to the list as you encounter them.** You don't need to memorize all twenty-three upfront. You'll pick up **Composite** the first time you build a tree of things. You'll pick up **State** the first time you have a class whose behavior changes based on an internal mode. You'll pick up **Chain of Responsibility** the first time you build a middleware pipeline. The vocabulary grows with your experience.

Once you have the first five or six patterns internalized, the rest of the catalog stops feeling like homework and starts feeling like *"oh, that thing has a name too."*

## Where to read more

- **[*Design Patterns: Elements of Reusable Object-Oriented Software*](https://en.wikipedia.org/wiki/Design_Patterns)** (Gamma, Helm, Johnson, Vlissides, 1994) — the primary source. Denser than modern textbooks; the pattern descriptions themselves are the parts to read first.
- **[Refactoring.Guru's patterns catalog](https://refactoring.guru/design-patterns)** — the most approachable modern reference. Every pattern is illustrated with a real problem, a diagram, and code in seven languages. Free.
- **[Peter Norvig's *Design Patterns in Dynamic Languages*](https://norvig.com/design-patterns/)** — the honest counterpoint. Fifteen slides that will change how you think about which patterns are pattern-shaped versus language-limitation-shaped.
- **[*Head First Design Patterns*](https://openlibrary.org/works/OL16942701W)** (Freeman & Robson, 2nd ed. 2020) — a friendlier introduction than GoF itself. If the original book feels too dry, start here.

And if you'd like to see the vocabulary applied to a different level of the design conversation — where the shapes are still language-independent but the framing is different — the [hexagonal architecture]({{< ref "posts/hexagonal-architecture-in-plain-language.md" >}}) post is a natural companion. Same underlying principle: name the shape, and the reader knows the story.

## The one thing to take away

If you take one idea from this post: **the patterns are worth learning not because you'll use them, but because you'll read code that uses them.** The vocabulary you build lets you read faster, communicate faster, and think in terms of shapes rather than lines. That is a permanent, compounding investment — a skill that will still be paying dividends thirty years from now, on codebases in languages that don't exist yet, described in the same words we've been using since 1994.

The Gang of Four wrote a book that named things. That's a smaller-sounding contribution than "invented a set of solutions," but it's actually the larger one. Once a shape has a name, everyone can talk about it — and once everyone can talk about it, the shape spreads to every codebase that ever wanted it.

The name is the pattern.
