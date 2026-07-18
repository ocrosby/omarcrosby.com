+++
title = "Learning Rust from the C Family"
date = "2026-07-18T09:23:43-04:00"
draft = false
description = "A C/C++/Go veteran's first month with Rust. The alien parts explained plainly, a detailed tour of ownership, borrowing, and lifetimes, why 'memory safe' is a specific technical claim, and why NSA and DARPA are pushing the language at policy scale."
tags = ["rust", "memory-safety", "ownership", "borrow-checker", "systems-programming"]
categories = ["Rust"]
ShowToc = true

[cover]
image = "/images/og/learning-rust-from-the-c-family.png"
hiddenInList = true
hiddenInSingle = true
+++

I have spent most of my career in C-family languages — C and C++ for systems work, Go for services, plus enough Java, C#, and JavaScript to be dangerous. Rust is the first language in a long time that made me feel like a beginner again. Not because the syntax is exotic (it isn't — it looks like a slightly opinionated cousin of C++), but because the *rules* are different. The compiler asks questions I had been avoiding for twenty years, and it refuses to build until I answer them.

This post is my attempt to describe that experience honestly, and to explain the machinery underneath it — ownership, borrowing, lifetimes, the borrow checker — in enough depth that a reader from the same background walks away understanding not just *what* those concepts are, but *why* the language is built around them. I am not a Rust evangelist. I have shipped plenty of production C++ and Go, and I have no interest in rewriting the world. What I do want is to give you an accurate picture of what the language actually offers, what it costs, and why serious institutions — the NSA, CISA, DARPA — are pushing it at policy scale.

## The one-line framing

Rust's whole design goal is: *offer the safety of a managed language and the performance of C, by moving the safety checks to compile time*. Everything alien about the language falls out of that goal. Ownership, borrowing, lifetimes, and the borrow checker are not novelty features — they are the machinery required to catch, at compile time, the class of memory bugs that C and C++ catch only in production (or never).

Whether that trade is worth it depends on what you're building. Let's get to specifics.

## The weekly emotional arc

I want to describe the first month before I describe the mechanics, because the mechanics make more sense once you know what the learning curve actually feels like.

**Week 1 — Frustration.** The compiler rejects code that "obviously works." I write what feels like idiomatic C++ and the borrow checker tells me I have violated rules I did not know existed. Error messages are unusually well-written, but there are a lot of them. I feel infantilized. Every operation I take for granted — passing a pointer, sharing a buffer, mutating through an alias — seems to require ceremony.

**Week 2 — Suspicion.** I start reading the errors more carefully. The borrow checker is not saying "you can't do that"; it is saying "you have not told me why this is safe." I notice that several of the constructs it rejects are aliasing bugs I have written before in C++, sometimes shipped, sometimes debugged for days. The compiler is catching them at build time.

**Week 3 — Realization.** The friction wasn't hostility. It was the type system asking questions I *should* have been asking myself in every previous language — who owns this data, how long does this reference live, can another thread see this at the same time. In C and C++ those questions live in your head (or don't). Rust promotes them to the compiler.

**Week 4 — Discipline transfer.** Something interesting happens. I start writing better C++ and better Go, because Rust taught me to think about ownership and nullability even where the language doesn't enforce them. My Go code has fewer subtle aliasing bugs. My C++ code has clearer lifetimes. The mental model transfers whether or not the language does.

That arc is the honest experience. It is not "one day you love Rust." It is "one day you stop being annoyed at the compiler and realize it has been on your side the whole time."

## The core: ownership, borrowing, and lifetimes

Rust's approach to memory management is called *ownership* (sometimes *the ownership system*). It is the single feature that lets the language guarantee memory safety without a garbage collector, and everything else in this post depends on understanding it.

The system rests on three connected ideas.

### Ownership

*Every value has exactly one owner.* The owner is a variable. When the owner goes out of scope, the value is automatically dropped and its memory freed. This is not a runtime decision — the compiler knows statically where every scope ends and inserts the deallocation for you at exactly the right point.

```rust
fn main() {
    let s = String::from("hello"); // s owns the heap buffer
    println!("{}", s);
}                                  // s goes out of scope; buffer freed here
```

The consequence that surprises C++ programmers first is that *assignment moves the value*:

```rust
let a = String::from("hello");
let b = a;              // ownership moves from a to b
println!("{}", a);      // compile error: value borrowed after move
```

In C++ this same line would perform a copy (or a move if you opt in with `std::move`). In Rust, `let b = a` transfers ownership. `a` is no longer valid — the compiler makes referencing it a build error, not a runtime bug. If you actually wanted a copy, you say so: `let b = a.clone();`. The point is that the default is loud, not silent.

This is the mechanism that rules out *double free*. There is exactly one owner responsible for freeing a value; there cannot be two.

### Borrowing

Sometimes you want another function to look at your data without giving it away. That's a *borrow*, written as a reference:

```rust
fn length(s: &String) -> usize {   // borrows s, does not take ownership
    s.len()
}

fn main() {
    let s = String::from("hello");
    let n = length(&s);            // lend s to the function
    println!("{} has length {}", s, n); // s is still ours
}
```

References come in two flavors, and this is where the rules get strict:

- **Immutable references** (`&T`) — as many as you like, all reading, none writing.
- **Mutable references** (`&mut T`) — exactly one, exclusive. No other references to the same data can exist while it lives.

The rule, in one line: *you can have any number of readers OR exactly one writer, never both simultaneously.* This is enforced at compile time by the *borrow checker*.

Here is a canonical example that fails:

```rust
let mut v = vec![1, 2, 3];
let first = &v[0];        // immutable borrow
v.push(4);                // needs a mutable borrow — compile error
println!("{}", first);
```

Why does the compiler reject this? Because `v.push(4)` may reallocate the vector's backing buffer, which would leave `first` pointing at freed memory. This is the classic "iterator invalidation" bug that has caused untold C++ crashes. Rust prevents it at build time by observing that `first` is still alive when `push` needs its own mutable borrow.

If you translate that same logic into C++:

```cpp
std::vector<int> v{1, 2, 3};
int& first = v[0];
v.push_back(4);           // may reallocate; first is now dangling
std::cout << first;       // undefined behavior
```

The C++ version compiles cleanly and might work most of the time. It will eventually corrupt memory on a machine you don't own, in a scenario you can't reproduce. That gap — between "compiles" and "actually safe" — is what the borrow checker is closing.

The borrowing rules also rule out *data races* at compile time. A data race requires two threads touching the same memory with at least one writer; the "one writer or many readers" rule makes that pattern un-typeable in safe Rust. This is what people mean when they say *fearless concurrency* — not that concurrent programming becomes easy, but that the specific bug class of data races is caught by the compiler.

### Lifetimes

The last piece is *lifetimes*. Every reference in Rust has a lifetime — the region of code during which it is valid. Most of the time the compiler infers them and you never see the syntax. Occasionally you have to spell them out, usually when a function returns a reference and the compiler needs to know which input it came from:

```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}
```

The `'a` is a *lifetime parameter*. It says: "the returned reference lives at least as long as both `x` and `y`." Without that annotation, the compiler couldn't tell whether the returned reference points into `x` or into `y`, and couldn't guarantee the caller won't use it after the underlying data is gone.

Lifetimes are the mechanism that rules out *use-after-free* and *dangling pointers*. The compiler tracks how long every reference lives and refuses to compile any program in which a reference could outlive the data it points to.

### Why the three pieces matter together

Ownership answers *who is responsible for cleanup*. Borrowing answers *who can look at this right now*. Lifetimes answer *how long can they look at it for*. Take away any one and the guarantee falls apart:

- Without ownership, you'd need a garbage collector to know when to free.
- Without borrowing rules, aliasing bugs sneak back in.
- Without lifetimes, references would outlive their data.

The mechanism the compiler uses to enforce all three is called the *borrow checker*. When Rust programmers say "I'm fighting the borrow checker," they mean the compiler is asking them to make ownership, borrowing, or lifetime relationships explicit that were implicit in their design. A large part of learning Rust is really just learning to satisfy the borrow checker — and, more importantly, learning to *think* in the terms it demands, so your first draft satisfies it instead of your third.

The related cleanup idiom is *RAII* — Resource Acquisition Is Initialization — borrowed from C++. Resources (memory, files, sockets, locks) are tied to object lifetimes and released automatically when the owner goes out of scope. Rust makes RAII the default rather than a discipline you have to remember.

## Is this why people keep saying Rust is memory safe?

Yes, and it is worth being precise about the claim, because "memory safe" is a technical term, not marketing.

*Memory safety* means the absence of a specific family of bugs:

- **Use-after-free** — using a pointer to memory that has already been freed. *Ruled out by lifetimes*: the borrow checker won't let a reference outlive the data it points to.
- **Double free** — freeing the same memory twice. *Ruled out by ownership*: each value has exactly one owner, and therefore exactly one place responsible for freeing it.
- **Dangling pointers** — references to memory that is no longer valid. *Same mechanism as use-after-free.*
- **Data races** — two threads touching the same memory concurrently with at least one writing. *Ruled out by borrowing*: one mutable reference or many immutable ones, never both.
- **Null pointer dereferences** — Rust sidesteps these by *having no null*. It uses `Option<T>`, a sum type with variants `Some(T)` and `None`, and the compiler forces you to handle both explicitly:

  ```rust
  fn find(name: &str) -> Option<User> { ... }

  match find("alice") {
      Some(user) => println!("found {}", user.name),
      None       => println!("no such user"),
  }
  ```

- **Buffer overflows** — reading or writing past the end of an array. Rust does bounds checking on indexed access; this one is a *runtime* check, not a compile-time guarantee, but it panics rather than corrupting memory.

The part of that list that makes Rust's claim distinctive is *when* most of these are caught: at compile time, with zero runtime cost. Java, Go, C#, and Python give you memory safety too — but they buy it with a garbage collector that runs while your program executes. C and C++ give you speed and control with no safety net. Rust's pitch is that ownership lets it have both — the performance of manual memory management with the safety of a managed language.

Two caveats are worth stating plainly:

- **The guarantee applies to *safe* Rust.** The `unsafe` keyword lets you opt out of some of the compiler's checks (for raw pointers, FFI to C, and a few low-level operations). Bugs inside `unsafe` blocks are on you. The design intent is that `unsafe` is used sparingly and isolated to small, auditable regions — not scattered through every file.
- **Memory safe is not bug free.** You can still write logic errors, deadlocks, and — oddly enough — leak memory. Leaking is considered *safe* in Rust; the class of bugs the language rules out is specifically memory *corruption*, not memory *waste*.

So when the marketing repeats "Rust is memory safe," the machinery underneath the slogan is: ownership for double-free, lifetimes for use-after-free and dangling pointers, borrowing for data races, `Option<T>` for null, and runtime bounds checks for buffer overflows.

## Performance and zero-cost abstractions

Rust shares a design goal with C and C++: *zero-cost abstractions*. High-level constructs should compile down to machine code no worse than what you would write by hand at a low level. You don't pay a runtime penalty for using nice tools. Several things make this possible.

**No garbage collector.** This is the big one, and it ties back to ownership. Java, Go, Python, and C# achieve memory safety by having a runtime that periodically scans memory to find and free unused objects. That work costs CPU and — worse for latency-sensitive systems — can introduce unpredictable stop-the-world pauses. Rust gets its memory safety at compile time. Because the compiler knows exactly when each value's owner goes out of scope, it inserts the deallocation calls statically. You get the memory behavior of manual `malloc`/`free` minus the human error.

**No runtime and minimal overhead.** Rust has no heavy runtime or virtual machine between your code and the hardware. It compiles ahead-of-time to native machine code via LLVM — the same backend behind Clang — so it inherits decades of mature optimization: inlining, vectorization, dead-code elimination. No interpreter, no JIT warm-up, no bytecode layer.

**Control over memory layout.** You decide whether data lives on the stack or the heap. Types are laid out compactly without the per-object headers or boxing that managed languages often impose. Stack allocation is essentially free, and predictable data layout is friendly to CPU caches — which matters enormously for real-world speed. Structs of primitives sit contiguously in memory the way they do in C.

**Abstractions really are zero-cost.** Iterators are the classic example. A chained expression like:

```rust
let total: i32 = xs.iter().map(|x| x * 2).filter(|x| x > &10).sum();
```

reads like functional code and typically compiles down to the same tight loop you would write by hand, with no allocations and no function-call overhead after inlining. Generics use *monomorphization* — the compiler specializes generic code into concrete versions per type at compile time, the way C++ templates do, rather than dispatching at runtime. Traits resolve to static dispatch by default; dynamic dispatch (`dyn Trait`, a vtable lookup) only happens when you explicitly ask for it.

**The safety checks are mostly compile-time.** The borrow checker, ownership tracking, and lifetime analysis all happen during compilation and vanish before runtime. They impose no cost on the running program. The main checks that do run at runtime are things like array bounds checking, and even many of those get optimized away when the compiler can prove they're unnecessary.

A useful way to frame the whole picture: traditionally you could pick two of *safety, speed, control* — Java and Go give you safety and ease but cede control and some speed to a GC; C and C++ give you speed and control but no safety net. Rust's pitch is that moving safety enforcement to compile time lets it offer all three. Benchmarks generally bear this out: Rust performs in the same tier as C and C++, sometimes marginally faster because its stricter aliasing rules give the optimizer more information than the C aliasing rules do, sometimes marginally slower.

Two honest caveats. "As fast as C" is a general truth, not a per-program guarantee — naive Rust can absolutely be slow, and squeezing out the last few percent still takes effort. And the cost is paid elsewhere: compile times are relatively long (monomorphization and all that analysis aren't free for the compiler), and the language has a steeper learning curve because you are doing work upfront that a GC would otherwise handle for you at runtime. The performance is real; it is earned by front-loading effort into compile time and into the programmer's head.

## Other parts that felt alien

Beyond ownership, a handful of other constructs made me feel like I was starting over.

- **Enums that carry data.** In C an `enum` is an integer. In Rust an `enum` is a tagged union with pattern matching — the primary way to model domain state. `Option<T>` and `Result<T, E>` are just enums. `match` is exhaustive: forget a variant and the compiler refuses to build.
- **`Result<T, E>` and `?`.** Errors are values, not exceptions. The `?` operator propagates them up the call stack in one character. Coming from `try`/`catch` it feels ceremonial at first — then you realize the compiler now proves you handled every failure path.
- **Traits, not inheritance.** No class hierarchies, no `extends`. Composition through traits, closer in spirit to Haskell's typeclasses or Go's interfaces than to Java's classes — with more compile-time teeth than either. My "extract a base class" instinct had nowhere to go.
- **Move-by-default.** Assignment moves. `Copy` types (small primitives, mostly) opt into copy semantics. Everything else you either move or explicitly `clone`. This is where most first-week borrow-checker errors come from — muscle memory expects copy.
- **Interior mutability and `Send`/`Sync`.** Rust admits its rules are conservative and provides escape hatches (`Cell`, `RefCell`, `Mutex`, `Arc`) — but each one is a named, searchable, auditable pattern rather than an implicit convention.

None of these are hard on their own. All of them together take a month to feel natural.

## The policy backdrop: NSA and DARPA

One thing that surprised me while learning Rust was how *institutional* the push has become. This is no longer a hobbyist enthusiasm — it is showing up in national-security guidance and DARPA-funded research. Two threads are worth knowing about.

### NSA and CISA on memory-safe languages

The NSA has been one of the earliest and most consistent government voices pushing memory-safe languages. Its foundational document is the *Software Memory Safety* Cybersecurity Information Sheet, first released in November 2022, which recommended that organizations use memory-safe languages when possible and bolster protection through code-hardening defenses. Rust appears in the recommended list alongside C#, Go, Java, Ruby, and Swift.

The NSA's stated concern maps directly onto the mechanics above. The worry is that attackers exploit code that poorly manages memory, which happens more often in languages that give programmers direct control over memory. The examples cited are the same bug classes ownership rules out — buffer overflows, memory-allocation shortcomings — often serving as the first step in large-scale network intrusions. The framing of the fix is also familiar: memory-safe languages use a combination of compile-time and runtime checks to automatically block vulnerabilities caused by programmer mistakes.

The guidance has since been updated and expanded into a joint NSA/CISA effort. A June 2025 information sheet, *Memory Safe Languages: Reducing Vulnerabilities in Modern Software Development*, broadens the recommended list to include Ada, C#, Delphi/Object Pascal, Go, Java, Python, Ruby, Rust, and Swift. It argues these languages eliminate entire classes of vulnerabilities by default — buffer overflows, dangling pointers, and many other CWE entries — by embedding safety at the language level rather than relying on developer discipline.

Two practical points the guidance stresses:

- **You don't have to rewrite everything.** Adoption doesn't require existing code to be fully rewritten; the guidance points to FFI (foreign function interfaces) as the integration path. The common recommendation is to identify the most critical or vulnerable components and rewrite just those.
- **It's backed by data.** The agencies cite figures like the 2019 study finding roughly 66% of CVEs in iOS 12 and 71% in macOS Mojave were memory-safety related. The NSA guidance is one link in a broader chain of federal cyber-agency reporting — the NSA sheet in 2022 and CISA's *Case for Memory Safe Roadmaps* in 2023 both converge on the same conclusion.

One nuance: the NSA has always listed Rust as one option among several, not the single anointed choice. That's a slight contrast with DARPA's TRACTOR program, which targets Rust specifically. The NSA's position is language-agnostic — it cares that you move to a memory-safe language; Rust is a prominent member of that set rather than the sole recommendation.

### DARPA's TRACTOR program

DARPA has taken a more Rust-specific stance and has put real money behind it. The centerpiece is *TRACTOR* — *Translating All C to Rust*. Announced in mid-2024 with a Proposers Day on August 26, 2024, the program aims to automate the translation of legacy C code to Rust, targeting the same quality and style a skilled Rust developer would produce, and thereby eliminating the entire class of memory-safety vulnerabilities present in C programs.

The reasoning connects directly to what we've been discussing. DARPA notes that memory-safety vulnerabilities are the most prevalent class of disclosed software vulnerability. The problem, in their framing, is that languages like C let programmers manipulate memory directly, which makes it easy to accidentally corrupt memory state — precisely the class of bugs Rust's ownership system rules out. Their preferred fix is to use *safe* programming languages that can reject unsafe programs at compile time, preventing the emergence of memory-safety issues rather than patching them.

The program manager, Dan Wallach, has been quotable on why Rust specifically. He framed Rust's strictness as liberating rather than constraining — the idea being that once you acclimate to the rules, they act like guardrails that free you to focus on more important things. That is essentially the "fighting the borrow checker eventually pays off" experience, described at a policy level.

A few things worth knowing about the shape and motivation of the effort:

- **Why automation rather than telling people to rewrite by hand.** Manual translation from C to Rust can take years and cost billions of dollars for large legacy codebases; many organizations simply cannot afford it. The TRACTOR bet is that combining static and dynamic program analysis with large language models can make it tractable at scale.
- **It is a structured research program, not a press release.** MIT Lincoln Laboratory leads test and evaluation, releasing a benchmark every six months to guide the participating teams. A public test battery of 150 C programs was released to evaluate translation tools across a range of C features.
- **It fits a broader government stance.** CISA recommends memory-safe languages including Rust, C#, Go, Java, Python, and Swift. The NSA has advocated migration to Rust. TRACTOR is one piece of a wider push across the US government toward memory safety.
- **Skepticism exists, even among Rust proponents.** The task is genuinely hard. Preserving the exact semantics of the original C while producing genuinely idiomatic Rust — not a mechanical, `unsafe`-riddled transliteration — is the crux, and some Rust experts doubt the strongest version of the goal is achievable. Tim McNamara, author of *Rust in Action*, has called it a formidable task worth attempting while being skeptical the stated aims are fully possible.

The short version: DARPA's stance is that memory-unsafe C is a national-security-scale liability, that Rust is the leading fix, and that the bottleneck is the cost of migration — which they are trying to break by funding automated, LLM-assisted translation tooling.

## Honest tradeoffs

I want to close with the parts I *don't* love, because a post that only lists strengths isn't useful.

- **Compile times are long.** Monomorphization and all the analysis aren't free for the compiler. Iteration is slower than Go, sometimes markedly so.
- **The learning curve is real.** A month before you feel productive is not unusual. Teams considering Rust should budget for that honestly rather than assume it away.
- **Async is its own subsystem.** Rust's async model is powerful but has a distinct learning curve on top of the borrow checker — futures, pinning, and the split between runtimes (Tokio, async-std, smol) are their own topic.
- **The ecosystem, while good, is younger than Go's or Java's in some domains.** Not every problem has a mature, blessed library.
- **`unsafe` exists for a reason.** Interoperability with C, low-level performance tricks, and building safe abstractions from unsafe primitives all require it. The safety guarantees are as strong as your `unsafe` audit discipline.

None of these are dealbreakers. They are the honest cost of the compile-time-safety design choice, and they are worth stating alongside the wins.

## The takeaway

Rust does not feel like a new language so much as *the compiler finally becoming a peer reviewer*. The alien parts — ownership, lifetimes, exhaustive matching, no null — are not novelty for its own sake. They are the C family's oldest bugs promoted to compile-time errors. The discomfort of the first month is the sound of habits you didn't know were bad being corrected.

Whether that is worth adopting for your project is a specific question with specific answers. If you're writing a new operating system, a browser engine, an embedded controller, or a piece of infrastructure where a memory-corruption bug means CVEs and post-mortems — the case is strong, and the institutional backing (NSA, CISA, DARPA) reflects that. If you're writing a CRUD service where Go's GC is a rounding error and your team ships weekly — Rust's compile times and learning curve may not pay for themselves.

What I can say with more confidence is that a month of Rust changed how I write C++ and Go. The mental model transfers even when the language doesn't. If nothing else, that alone justifies the time.
