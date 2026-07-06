---
description: Shuffle every entry in `data/music.yaml` below the featured slot (items[0]), direct-commit to `main`, and push. The "now playing" song stays pinned; entries 1..N are randomized among themselves. Semantic-release cuts a patch bump; Fly redeploys. No PR, no branch — data churn.
argument-hint: "[--dry-run]"
---

# /randomize-music

Reorders the History section of `/music/` by shuffling every entry **below** the featured "now playing" video (items[0]). Same shuffle mechanism `/add-music` uses after prepending a new entry — this skill just does the shuffle without adding anything.

Direct-commits to `main`. No PR, no feature branch — same data-churn model as `/add-music` and `/sync-recipes`.

## Arguments

- `--dry-run` (optional) — print the reordered YAML preview to stdout and exit without touching disk or git. Nothing else runs.

## Workflow

### 1. Preconditions — stop before touching anything if any of these fail

- Working directory must be the `omarcrosby.com` repo root (`hugo.toml` exists at cwd).
- `git status --porcelain` must be empty. If not, stop and ask the user to stash/commit first.
- Current branch must be `main`. If not, `git checkout main && git pull --ff-only` before continuing.
- `data/music.yaml` must contain at least 3 `- youtube_id:` entries. Fewer than 3 means the shuffle can produce no meaningful reorder (0 entries: nothing; 1 entry: only the pinned featured; 2 entries: single-position "shuffle" that is guaranteed to be the same order). Refuse the churn and report.

### 2. Dry-run branch (if `--dry-run` was passed)

```bash
python3 scripts/shuffle-music.py --dry-run | head -40
```

Print the first ~40 lines of the shuffled preview and stop. Do not touch `data/music.yaml`, do not commit.

### 3. Shuffle entries 1..N

```bash
python3 scripts/shuffle-music.py
```

The script keeps `entries[0]` (the featured "now playing" video) pinned, shuffles entries 1..N in place, and preserves any file preamble. Shared with `/add-music`; see `scripts/shuffle-music.py` for the reference implementation.

### 4. Diff check

If `git diff --quiet data/music.yaml`, nothing changed (`random.shuffle` produced the same order — statistically possible on small lists). Report `No change — shuffle produced the same order. Try again if you'd like.` and stop. Do not commit an empty change.

If there is a diff, show a compact summary:

```bash
git diff --stat data/music.yaml
```

### 5. Verify the site still builds

Run `hugo --gc --minify --panicOnWarning` from the repo root. If it exits non-zero, `git restore data/music.yaml` and stop — do not commit a broken build.

**Exit-status guardrail.** Do not pipe hugo's output into another command when checking exit status — pipelines return only the last command's status. Either redirect (`hugo ... >/dev/null`) or enable `set -o pipefail` before the pipeline. Same rule `/add-music` uses.

### 6. Direct-commit to main and push

```bash
git add data/music.yaml
ALLOW_MAIN_COMMIT=1 git commit -m 'fix(music): shuffle history order'
git push origin main
```

Commit type is intentionally `fix(music)` — matches `/add-music`'s patch-bump cadence. This is a reorder-only change; no new content, no version-worthy delta.

### 7. Report

Print:

- The commit SHA (`git log -1 --format=%H`)
- The push confirmation
- The number of entries shuffled (len(rest) from step 3)
- A short note that semantic-release + Fly deploy will run in the background
- The live URL: `https://omarcrosby.com/music/`

Do **not** watch the release workflow — the user checks it themselves.

## Rules

- **No PR, no branch.** Data churn on a single-author site; a PR loop per shuffle is friction.
- **Never `--force` push.** If push is rejected because someone else pushed, `git pull --rebase` first, then push.
- **Never skip hooks** (`--no-verify`).
- **Do not touch anything outside `data/music.yaml`.** Layouts, `hugo.toml`, and content pages are not this command's concern.
- If any step from 3 onward fails after `data/music.yaml` is modified, `git restore data/music.yaml` before stopping.

## When NOT to use this skill

- **Immediately after `/add-music`.** That command already shuffles entries 1..N (after prepending the new entry at position 0), so a follow-up `/randomize-music` is redundant churn.
- **On a playlist with fewer than 3 entries.** No meaningful shuffle possible; the skill refuses in step 1.

## Example

```text
/randomize-music
```

→ Preconditions pass; 30 entries in `data/music.yaml` (1 featured + 29 history)
→ Python shuffles entries 1..29 in place; entries[0] stays pinned
→ `hugo --gc --minify --panicOnWarning` succeeds
→ Committed as `fix(music): shuffle history order`
→ Pushed to `main` → semantic-release patches → Fly deploys
→ Report: SHA, 29 entries shuffled, live URL
