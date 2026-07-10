---
paths:
  - "content/now.md"
---

# `/now/` Page Updated Timestamp

Every edit to `content/now.md` must bump **both** the front-matter `date` field and the visible `*Updated YYYY-MM-DD.*` italic line at the top of the body to today's date in America/New_York, before staging the change. No exceptions — including single-word content tweaks, typo fixes, or link updates.

## Why

The [nownownow.com](https://nownownow.com) convention gives the `/now/` page its whole value proposition: **visitors read the timestamp as a proxy for "is this person still actively maintaining this site?"** A `/now/` page with fresh content but a two-month-old timestamp reads as neglected. Worse: a `/now/` page with a fresh timestamp but content that hasn't been meaningfully re-thought reads as *cynical* — timestamp-fudging with nothing behind it.

The page names its own staleness threshold ("If the date at the top is more than about 45 days old, I've fallen behind on updates"). That commitment is only honest if the timestamp reflects the last time the content was genuinely re-considered — not the last time a typo was patched.

So the rule is: **any edit is a re-consideration**. If the content is worth changing at all, it's worth confirming everything else on the page still reflects current focus, and then bumping the date. If the content isn't worth re-considering, don't touch the file at all.

## The workflow

When editing `content/now.md`, always do these two in the same commit:

1. **Bump the front-matter `date`** to the current timestamp in ISO 8601 with America/New_York offset:

   ```bash
   TZ=America/New_York date +"%Y-%m-%dT%H:%M:%S%z" | sed 's/\(..\)$/:\1/'
   ```

2. **Bump the visible `*Updated YYYY-MM-DD.*`** line at the top of the body to today's date (no time — the front matter carries the time; the body carries the human-readable date).

Both bumps must land in the same commit as the content change — never as a follow-up commit, never separately from the content edit.

## Signals

| Signal | Fix |
|---|---|
| Diff modifies body of `content/now.md`, front-matter `date` unchanged | Bump `date` to today's timestamp before staging |
| Diff modifies body of `content/now.md`, `*Updated YYYY-MM-DD.*` line unchanged | Bump the visible date to today before staging |
| Front-matter `date` and `*Updated ...*` line disagree by more than a day | Re-sync — both should point at the same day; the mismatch is what social-share crawlers pick up from the `date` field while the visible line is what a human reads |
| PR touches `content/now.md` for anything (typo, link, tweak, restructure) without updating either the front matter or the visible date | **Must Fix** — reject and re-commit with both bumped |
| Diff is a pure format change (e.g. renaming a heading level, fixing markdownlint) with no content re-consideration | Still bump both dates; the visitor's mental model doesn't distinguish between "meaningful update" and "housekeeping update" and neither should the file |

## When this rule fires

- Any `Write` targeting `content/now.md` (rare — the file exists after PR #78; new writes would be full replacements).
- Any `Edit` to `content/now.md`, no matter how small.
- Any `hugo-reviewer` invocation whose diff includes `content/now.md`.
- Any `/git ship` (or equivalent) pre-flight when a staged change includes `content/now.md`.

## Report as

- **Must Fix** — `content/now.md` was edited but the timestamp bump was skipped. This is the exact failure the rule exists to prevent, and it produces the worst-of-both-worlds page (fresh content that reads as stale, or stale content that reads as fresh).
- **Should Fix** — front-matter `date` and visible `*Updated ...*` disagree (one was bumped, the other wasn't).
- **Consider** — the file hasn't been touched in more than 45 days (self-imposed staleness threshold from the page body). Not blocking, but worth a nudge to re-consider whether the content still reflects current focus.

## Exceptions

- None for the timestamp bump itself. If the file is worth editing, the timestamp is worth bumping.
- The 45-day staleness *threshold* is a soft signal (Consider), not a hard rule — real life has quieter stretches, and the page body explicitly says "about 45 days" not a hard cutoff.

## Not covered by this rule

- **`/uses/` page timestamps.** `/uses/` describes tools rather than current focus; it's meant to change when the stack changes, not on a fixed cadence. No timestamp requirement there.
- **Blog post `date` fields.** Post `date` reflects publish date, which is set once and never touched again. See `.claude/rules/content-frontmatter.md`.
