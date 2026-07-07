+++
title = "Keeping the daily standup from becoming a status meeting"
date = 2026-07-07T09:33:30-04:00
draft = false
summary = "Some teams have quietly turned the daily standup into a status report — going around the room instead of walking the board, and asking for updates from people who aren't touching a single story that sprint. Here's what the Agile literature actually says a standup is for, and a few small structural fixes."
tags = ["agile", "scrum", "engineering-management", "standups"]
ShowToc = true
+++

A pattern I keep running into on teams that otherwise run a tight process: the daily standup slowly turns into a status meeting. Nobody decides to make it that way on purpose — the shape just drifts. Someone goes around the room instead of around the board. People who aren't touching a single story that sprint get asked for an update anyway, because they're "on the call" and it would be rude to skip them. And the three questions stop being a format and start being a suggestion, so a five-minute sync creeps toward twenty because someone's blocker turns into a design discussion in front of a dozen people who don't need to be in it.

None of this is malicious. It's just familiar. Going around the room and asking "what's your status" is how most of us were trained to run meetings before we ever heard the word Scrum, and old habits are patient — they wait for the first unguarded moment and slide right back in.

## Who the standup is actually for

The [Scrum Guide](https://scrumguides.org/scrum-guide.html) is specific about this: the Daily Scrum is a 15-minute event for the Developers of the Scrum Team, to inspect progress toward the Sprint Goal and adapt the Sprint Backlog as needed. It's an internal planning event *for the people doing the work*, not a report delivered upward to a manager or a stakeholder. The 2020 revision of the Guide even dropped the literal "three questions" template — but it kept the intent: whatever structure the team uses, the point is progress toward the goal, decided by and for the people pulling cards off the board that sprint.

That's the test worth applying before anyone opens their mouth: are you touching a story on the board right now? If the answer is no, you don't have a standup update by definition — not because you're unimportant, but because the meeting isn't measuring you. Asking anyway, "just to be thorough," is usually the first sign the meeting has quietly become "let's check in with everyone" instead of "let's sync on the sprint goal."

## The waterfall tell

The clearest diagnostic I've found for "this has become a status meeting" is simple: is the facilitator going around the *room*, or around the *board*? Going around the room — everyone gets a turn, in order, regardless of what they're carrying — is exactly the reporting pattern standups were introduced to replace. The [Agile Alliance's glossary entry on the Daily Meeting](https://www.agilealliance.org/glossary/daily-meeting/) and [Mountain Goat Software's writeup of the Daily Scrum](https://www.mountaingoatsoftware.com/agile/scrum/meetings/daily-scrum) both land on the same practical alternative: walk the board, not the headcount. Ask about cards — what moved, what's stuck, what's about to move — and let the people attached to those cards speak. If a card has no update, skip it. If someone in the room isn't attached to anything on the board this sprint, there's nothing wrong with them sitting in silently, or not attending at all.

Walking the board instead of the room also fixes a second, quieter problem: it stops the standup from being a proxy for attendance-taking. A status meeting wants to hear from everyone because that's what makes it feel complete. A standup only wants to hear from the board.

## Scope creep past the three questions

The other half of this is time. Jason Yip's ["It's Not Just Standing Up: Patterns for Daily Standup Meetings"](https://martinfowler.com/articles/itsNotJustStandingUp.html) catalogs the exact failure mode most teams eventually hit: a blocker gets named, and instead of just being *named*, it gets *solved*, live, in front of everyone who showed up to give a thirty-second update. The fix in the article is the parking lot pattern — the standup's job is to surface that a blocker exists and who needs to be involved in resolving it, not to resolve it. The actual conversation happens immediately afterward, with only the people who need to be there.

This is the part that's easiest to let slide, because the discussion that derails a standup is usually a genuinely useful discussion. The problem isn't that it's happening — it's that it's happening in the wrong room, in front of the wrong audience, on someone else's clock.

## A few things that actually help

None of this requires a ceremony rulebook. A short list of structural habits gets most of the way there:

- **Walk the board, not the room.** Ask about cards in progress; let whoever's attached to a card answer. Skip cards with no update.
- **Visible timebox.** A timer that everyone can see does more work than good intentions.
- **Name the parking lot out loud.** "Let's take that offline with the two of us right after this" is a complete sentence — say it and move on.
- **Silent attendance is fine.** Someone can sit in to stay informed without being asked for an update they don't have.
- **If you're not on the board this sprint, you don't owe the room anything.** That's not a judgment about your work — it just means this particular meeting isn't measuring you today.

None of this is a rebuke of any specific team — it's a pattern that's easy to fall into and a little annoying to notice from the inside, because the meeting still *feels* efficient while it's happening. The fifteen minutes just don't feel as short anymore, and it's worth asking why.
