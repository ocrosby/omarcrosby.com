+++
title = "Unit tests: what we're actually arguing about"
date = "2026-07-24T17:39:33-04:00"
draft = false
description = "Four voices argue about unit tests. The debate dissolves once you separate coverage-as-target from coverage-as-detector, with testability as the real prize."
summary = "Four voices argue about unit tests. The debate dissolves once you separate coverage-as-target from coverage-as-detector, with testability as the real prize."
tags = ["testing", "tdd", "code-coverage", "mutation-testing", "software-design", "code-quality"]
categories = ["Code Quality"]
ShowToc = true

[cover]
image = "/images/og/unit-tests-what-were-actually-arguing-about.png"
hiddenInList = true
hiddenInSingle = true
+++

Unit testing is one of the most talked-past topics in the field. Two engineers can both be advocating for "good practice" and end up in opposite rooms, because they're arguing about different things. I've spent a lot of time on it over my career — on greenfield projects, growing the harness alongside the code, and on legacy takeovers, building one from scratch around a system that had been running the business for years. In both cases the work was as much about *understanding* the code as proving it worked; the act of trying to write a real test is what forces the understanding.

Up front: I'm writing this from the pragmatist position, which is one of four voices I'll name below. I'll give each of the others the strongest form of its position before I say why I don't hold it, and I'll turn the same lens on the pragmatist too — the essay lands somewhere, and it's honest to say so at the top.

## The four voices in every real conversation about unit testing

Any long-enough discussion about unit tests seems to gather four distinct voices. The strongest version of each, not the weakest version I could dismiss:

- **The skeptic** — *tests have a real cost.* Writing them takes time, maintaining them takes more, and much of what a test catches was going to be caught in the next code review or the first run of the code anyway. That cost isn't hypothetical.
- **The believer** — *coverage is the anchor that keeps testing honest.* Untested code is riskier than tested code, and a percentage on a dashboard is one of the cheapest measurable proxies a team can maintain. Drop the number and arguments about test quality reduce to vibes.
- **The zealot** — *there's a floor, and it should be high.* Eighty percent is the least we should tolerate; anything lower means we've stopped caring about regressions in the code we don't touch. Discipline requires numbers.
- **The pragmatist** — *the honest answer is a portfolio.* Which tests you write depends on the code, the stakes, the shape of the change, and what the tests are actually asserting. A single testing standard rarely survives the range of workloads a real system contains.

Each voice is held by good engineers with real cases behind them. The whole debate mostly dissolves once you notice that the believer and the zealot are arguing about *coverage as a target*, while the strongest defenders of testing mean something else by the word.

## Where the skeptic and the believer meet: coverage as a target

The strongest published argument against chasing coverage as a target is Inozemtseva and Holmes, <a href="https://doi.org/10.1145/2568225.2568271" target="_blank" rel="noopener"><em>Coverage Is Not Strongly Correlated with Test Suite Effectiveness</em></a> (ICSE 2014). They mutated the code of five large Java projects and measured how often each project's test suite caught the mutations. Once they controlled for the number of tests in a suite, coverage's correlation with mutation-detection dropped from strong to low-to-moderate. In plain terms: at the same coverage percentage *and the same test count*, two suites can have very different capacities to actually catch a bug. This scopes to **line and branch coverage**, the common cases; stronger forms don't rescue the target claim.

The **believer** shrugs: *coverage isn't perfect, but it's directionally right and it's cheap.* True. The **skeptic** hears vindication: *the metric doesn't measure what you think, so stop making me chase it.* Also true. Goodhart's law is not gentle with software metrics: when a measure becomes a target, it ceases to be a good measure, because people optimize for the metric rather than for the thing it was proxying for.

Both readings are correct **about coverage as a target**. Where they part company is that the believer wants to keep the number and the skeptic wants to throw it out. Neither has asked yet whether coverage is doing some *other* useful job the target critique doesn't touch.

## Black-box tests vs coverage-chasing

Before the "other job" argument, there's a specific pathology worth naming when coverage is the goal. Tests written to *hit lines*, rather than to check that inputs produce expected outputs, end up knowing too much about *how* the code does its job. They mock internals instead of stubbing at the boundary (a *stub* supplies a canned response at the unit's contract; a *mock* reaches inside and asserts on the calls the unit makes). They assert on the sequence of calls a function makes, not on the value it returns. They break the moment you refactor, even when behavior is unchanged.

The classical framing is **black-box vs white-box** testing. A black-box test knows only the contract: for these inputs, expect these outputs. It doesn't care whether the function is a five-line straight-through or a state machine dispatched through three collaborators. A white-box test asserts on the internals. Coverage-chasing pulls hard toward the white-box side, because the shortest path to touching a branch is often to reach in and drive it directly.

The four voices land in very different places on this:

- **The skeptic** is often right for exactly this reason. What they call "the cost of tests" is usually the cost of *implementation-coupled* tests — black-box tests survive refactoring; white-box tests break every time the internals move.
- **The believer** falls in easily: line coverage rewards touching a line by any means, and the shortest means is often mocking a collaborator, which locks that collaboration into the test.
- **The zealot** falls in worst. Pushing past a certain point almost always requires asserting on internal branches that exist only because of today's implementation.
- **The pragmatist** tests the unit's *contract* — inputs to outputs — and lets some lines be covered incidentally or not at all. An uncovered line no behavior test naturally reaches is often a signal the code is doing something nobody asked for.

Martin Fowler's <a href="https://martinfowler.com/articles/mocksArentStubs.html" target="_blank" rel="noopener"><em>Mocks Aren't Stubs</em></a>, which distinguishes state-verification from interaction-verification testing, is the canonical write-up of the two schools this argument belongs to.

## Coverage as a detector is a different question

Now the other job. Low coverage is not a soft signal. It is proof, at the granularity of a specific line, that this line has never been executed under test — not weakly-asserted, not badly-mocked, *never run*. That's a much stronger claim than "our tests are shallow," and it survives every critique of coverage-as-a-target. As a target, coverage tries to answer *are our tests good?* — a question it can't answer. As a detector, it answers *which lines have never been touched by any test?* — precisely what the instrumentation measures.

This is where a lot of legacy-takeover work pays off. On systems I've inherited with a thin test suite, the value of building the harness wasn't the number. It was that writing tests to reach the uncovered lines was also the exercise of *learning what those lines did.* The tests were the understanding-artifact; the number was the receipt. That turns the **skeptic's** cost argument on its head for one class of work: the tests pay for themselves in comprehension before the first bug they catch.

There's a real caveat the enthusiasm sometimes runs past: **characterization tests written to reach uncovered lines codify current behavior, not intended behavior.** If the existing behavior contains a bug, the test now enshrines that bug as the spec, and the next person to fix it breaks the test. The move that keeps this honest is to write those tests against the *specification* — the ticket, the API contract, the domain rule — not against what the code happens to do today. Legacy systems are usually the ones with the thinnest specs, though, and reconstructing what the code *should* do — from tickets, user reports, or conversations with people who remember why it was built — is itself part of the takeover work. Blind characterization is the failure mode. When the code and any recovered spec disagree, that's a bug find, not a test to write.

Ivanković, Petrović, Just and Fraser make a related point at scale in <a href="https://doi.org/10.1145/3338906.3340459" target="_blank" rel="noopener"><em>Code Coverage at Google</em></a> (ESEC/FSE 2019): coverage becomes actionable at the level of the specific changeset an engineer is about to merge, not as a dashboard number. That practice isn't novel — Codecov, Coveralls, and every serious modern CI provider have offered diff-scoped coverage for years — but the paper is a useful validation of it at industrial scale.

## The skeptic's steelman, and the honest answer

The **skeptic** has more than the target critique going for them. Writing and maintaining tests has a real cost, and the empirical record on unit-test ROI is more mixed than TDD advocacy suggests. Rafique and Mišić's meta-analysis of 27 industrial and academic TDD studies (<a href="https://doi.org/10.1109/TSE.2013.11" target="_blank" rel="noopener"><em>The Effects of Test-Driven Development on External Quality and Productivity: A Meta-Analysis</em></a>, IEEE TSE 2013) found a small positive effect on external quality but *little to no discernible effect on productivity* — and the productivity drop was actually larger in industrial studies than academic ones. Fucci et al. (<a href="https://arxiv.org/abs/1611.05994" target="_blank" rel="noopener"><em>A Dissection of the Test-Driven Development Process</em></a>, IEEE TSE 2016) went further: whatever benefit TDD does produce is tied more to *granularity and uniformity of steps* than to test-first sequencing.

If the skeptic's argument is *test-first makes me faster today*, the evidence isn't on their side. But the reverse claim — that unit tests reliably speed up delivery in exchange for their cost — also isn't well-supported for short-run work.

The honest defense is different: tests pay for themselves as a **regression harness** over months, when the system has to change and there's something that tells you within minutes whether the change broke it. Forsgren, Humble, and Kim's <a href="https://itrevolution.com/product/accelerate/" target="_blank" rel="noopener"><em>Accelerate</em></a> (2018) documents this at scale: teams with strong test automation deliver faster and more reliably over the long run, not in the sprint where the test is written. If the codebase will be thrown away in a month — a spike, a migration script, exploratory analysis — the skeptic has a point. If it won't, they don't.

## Where the believer stops helping: mutation testing

Once the **believer** has heard the target critique, the natural follow-up is *what metric should I use instead?* Don't replace the metric; add the missing half. Coverage measures line execution. What the believer actually wants — *do the tests catch the bugs?* — is measured by **mutation testing**: seed synthetic faults into the code, run the suite, report the percentage the tests caught (the "mutation score").

The reason mutation testing hasn't taken over dashboards despite being the technically-correct answer is operational: it's typically **10–100× slower than the underlying test suite**, because every seeded fault requires a full test run. The tractable form is what Google's <a href="https://arxiv.org/abs/2102.11378" target="_blank" rel="noopener"><em>Practical Mutation Testing at Scale</em></a> paper (ICSE 2021) describes: run mutation testing only against the code that changed in a diff, on the paths that actually matter, not against the whole repo on every push. Coverage tells you which lines have been touched; mutation score tells you whether the assertions on those lines are real. If coverage is on your dashboard and mutation score isn't anywhere in your process, you're seeing half the picture.

## Where the zealot goes wrong: cost and design damage

The **zealot's** steelman is that a floor prevents backsliding and forces discipline. The trouble is that Mockus, Nagappan, and Dinh-Trong (<a href="https://doi.org/10.1109/ESEM.2009.5315981" target="_blank" rel="noopener"><em>Test Coverage and Post-Verification Defects</em></a>, ESEM 2009) found the cost of coverage to be *superlinear* — the last stretch is disproportionately expensive per fault avoided. And DHH's <a href="https://dhh.dk/2014/test-induced-design-damage.html" target="_blank" rel="noopener"><em>Test-induced design damage</em></a> (April 2014), the essay that touched off the <a href="https://www.martinfowler.com/articles/is-tdd-dead" target="_blank" rel="noopener"><em>Is TDD Dead?</em></a> video conversations with Beck and Fowler that followed, named the failure mode at the far end: push testability pressure hard enough and you get indirection nobody needs, seams inserted for tests that don't correspond to a real axis of variation. The zealot's line is usually drawn past the point where the curve bends sharply upward.

## The move that mostly disarms the skeptic: testability is a design property

The most interesting thing about writing tests isn't the tests themselves. It's the design pressure that shows up when you try. When code is hard to test, that isn't a testing problem; it's a design diagnostic: hidden dependencies, functions doing too many things, business logic welded to I/O. Michael Feathers, in <a href="https://www.informit.com/store/working-effectively-with-legacy-code-9780131177055" target="_blank" rel="noopener"><em>Working Effectively with Legacy Code</em></a> (2004), reframes this whole class of trouble as an absence of *seams*: places where behavior can be varied without editing in place. Steve Freeman and Nat Pryce, in <a href="https://www.informit.com/store/growing-object-oriented-software-guided-by-tests-9780321503626" target="_blank" rel="noopener"><em>Growing Object-Oriented Software, Guided by Tests</em></a> (2009), devote a chapter (called *Listening to the Tests*) to reading test friction as design feedback: awkwardness at the test bench is the code trying to tell you something about its shape.

This is where the **skeptic's** position starts to shrink. The reason to write the test isn't only to catch bugs — it's to get an early, cheap read on the design. Write it first and this feedback shows up in the first fifteen minutes. Write it later and you learn six months in, when the thing is too rooted to move.

The honest limit is the one DHH's essay named: testability pressure produces useful design signals until the point where it starts producing indirection nobody needs. That boundary — where the code is genuinely telling you something versus where the tests are demanding the code contort — is the actual hard call, and it isn't resolvable by rule.

Janzen and Saiedian (<a href="https://doi.org/10.1109/MS.2008.34" target="_blank" rel="noopener"><em>Does Test-Driven Development Really Improve Software Design Quality?</em></a>, IEEE Software 2008) found test-first developers wrote code in smaller, less complex, more highly tested units, but honestly reported they could *not* confirm the coupling and cohesion improvements TDD advocates often claim. A real design signal, with honest caveats about what the evidence supports.

## Where the pragmatist goes wrong

The pragmatist has a specific failure mode too, and it's the one I have to watch in myself: *"it depends"* is easy cover for never committing to a team-wide standard, and inconsistent standards produce inconsistent quality across a codebase. A team where every engineer's judgment is trusted equally is a team where the same pull request is reviewed one way by someone in the skeptic camp and another way by someone in the zealot camp, with no procedural mechanism for reconciling the two. The pragmatist is the voice most likely to shrug at this — and least likely to notice it happening — because judgment feels like the honest answer.

The guardrail I try to hold to is that the pragmatist owes the team a *written* rule wherever one is possible. Coverage on the diff is a written rule. Mutation-testing critical paths is a written rule. "Prefer black-box tests" is a written rule. *It depends* belongs at the edges of the ruleset, not at its center. When I catch myself reaching for it too easily, the correct move is usually to figure out what the underlying rule would have been and write it down.

## The synthesis

Blind spot named and guarded against, the pragmatist's job is to absorb the strongest parts of each voice. From the skeptic: cost is real, so aim tests at external boundaries, business rules, and changes you can't rehearse in your head — and prefer black-box tests that survive refactoring. From the believer: coverage is a cheap, honest signal, so keep it, but on the diff and not on a dashboard. From the zealot: a floor is worth having, so mutation-test the critical paths where "the tests exist" needs to actually mean something. From the design view: testability is the real prize, and indirection nobody needs is a signal the tool is being misused, not broken.

Separate coverage-as-a-target from coverage-as-a-detector. Coverage tells you where the tests have never been; mutation testing on hot paths tells you whether the tests you have are checking anything; writing the test first tells you, cheaply and early, that your design has a hidden dependency; writing black-box tests keeps the harness from becoming a brake on the next refactor.

Stop arguing about the number. Ask instead: *which parts of this system have never been executed under test, and what will it cost me the day I need to change them?* That question has a real answer, and it doesn't require winning the argument between the four voices first. It does require writing the answer down.
