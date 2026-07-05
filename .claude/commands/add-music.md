---
description: Add a YouTube music video to data/music.yaml, direct-commit to main, and push. Semantic-release will cut a patch bump and Fly will redeploy. No PR, no branch — this is data churn.
argument-hint: <youtube-url> [--album "Album"] [--year 1985] [--note "..."] [--yes]
---

# /add-music

Adds a YouTube music video to the top of `data/music.yaml` on the current site, direct-commits to `main`, and pushes. Semantic-release turns the `fix(music):` commit into a patch bump; the existing release workflow deploys to Fly. No PR, no feature branch.

## Arguments

- **`<youtube-url>`** (required) — the video URL. Accepts:
  - `https://www.youtube.com/watch?v=<ID>` (with any extra query params)
  - `https://youtu.be/<ID>`
  - `https://www.youtube.com/shorts/<ID>`
- `--album "<name>"` (optional) — album name to record alongside artist/year
- `--year <YYYY>` (optional) — release year
- `--note "<text>"` (optional) — short note (why you added it, what mood)
- `--yes` (optional) — skip the step-5 confirmation prompt and proceed straight to the duplicate check + prepend. Only use when the split is unambiguous (a single ` - `, ` – `, ` — `, or `: ` in the raw title) — for anything else the confirmation is what catches parse bugs. Also enables **queue-and-batch mode**: if the user fires several `/add-music --yes` invocations back-to-back without waiting for each to finish, treat them as one atomic batch — one build check, one commit per song, one push at the end.

## Workflow

### 1. Preconditions — stop before touching anything if any of these fail

- The working directory must be the `omarcrosby.com` repo root (`hugo.toml` exists at cwd).
- `git status --porcelain` must be empty (clean working tree). If not, stop and ask the user to stash/commit first.
- Current branch must be `main`. If not, `git checkout main && git pull --ff-only` before continuing.

### 2. Parse the URL

Extract the 11-character video ID. In order, try:

- `v=` query parameter of a `youtube.com/watch` URL
- Last path segment of `youtu.be/...`
- Last path segment of `youtube.com/shorts/...`
- Any bare 11-character `[A-Za-z0-9_-]` token in the argument

Reject anything else — do not try to be clever. Stop and ask if you cannot extract exactly one ID.

### 3. Fetch metadata via YouTube oEmbed

Use `WebFetch`:

```text
url:    https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<ID>&format=json
prompt: Return the raw JSON body. Quote the values of these fields exactly: title, author_name, thumbnail_url, provider_name. If the response is not JSON (login wall, HTML, 404), say so and quote what you received.
```

If the response is not JSON, stop and report — do not guess.

### 4. Parse artist and title from `title`

YouTube's video title usually follows one of these shapes:

| Raw title | Parsed artist | Parsed title |
|---|---|---|
| `DeBarge - Rhythm Of The Night (Official Music Video)` | `DeBarge` | `Rhythm Of The Night` |
| `Artist – Song Name [Official Video]` | `Artist` | `Song Name` |
| `Artist: Song Name (HD)` | `Artist` | `Song Name` |
| `Song Name` (no dash) | `<author_name>` with `VEVO` stripped | `Song Name` |

Rules:

- Split on the first ` - `, ` – `, ` — `, or a colon followed by a space — whichever appears first.
- Strip trailing suffixes matching any of `(Official Music Video)`, `(Official Video)`, `[Official Video]`, `(Official Audio)`, `(Audio)`, `(Lyrics)`, `(HD)`, `(4K)`, `(Remastered)`, `(Live)`, or a bare `(YYYY)`.
- If no split character exists, use the whole title as `title` and use `author_name` (with a trailing `VEVO` stripped) as `artist`.

### 5. Confirm with the user

Print a compact preview and ask "OK to add?" — do not proceed on ambiguity:

```text
Video ID:   <id>
Title:      <parsed title>
Artist:     <parsed artist>
Album:      <--album flag or "(none)">
Year:       <--year flag or "(none)">
Note:       <--note flag or "(none)">
Thumbnail:  https://i.ytimg.com/vi/<id>/mqdefault.jpg
```

Only continue on explicit confirmation.

**`--yes` skip.** If `--yes` was passed, the preview is still printed (so the user can see what happened in the transcript), but the confirmation is bypassed. Only apply `--yes` when the split character (` - `, ` – `, ` — `, or `: `) is present exactly once at the top level of the raw title — otherwise the parse is ambiguous and confirmation must still fire. When in doubt, do not honor `--yes`.

**Queue-and-batch behavior.** If a second `/add-music --yes` fires while a prior one is still processing, treat both as part of a single batch: buffer the parsed entries, verify the site builds once at the end, produce **one commit per song** in queue order (each prepended above the previous, so the last-queued ends up at the top), and push once. Do not push per-song when batching — the release workflow collapses commits per push, so batching yields one deploy instead of N.

### 6. Check for duplicates — refuse, don't ask

Read `data/music.yaml`. If any existing entry has the same `youtube_id`, **stop and refuse the add**. Report:

```text
duplicate: <id> is already in data/music.yaml — nothing to do.
```

Do not offer an "add anyway" path. Duplicates are always a mistake for this playlist — the "now playing" model has no meaning if the same video appears twice. If the user truly wants to re-surface a song they added earlier, they can hand-edit `data/music.yaml` to move that entry to the top; `/add-music` will not do it for them.

**Batch behavior.** In queue-and-batch mode, a duplicate in the queue is skipped (not aborted): report which one was skipped and continue processing the rest of the batch. A duplicate against the on-disk file is treated identically to a duplicate against a queued-but-not-yet-committed entry.

### 7. Prepend the new entry and shuffle the history below it

Read `data/music.yaml`. Build the new entry with these fields, in this order:

```yaml
- youtube_id: "<id>"
  title: "<title>"
  artist: "<artist>"
  album: "<album or empty string>"
  year: <year integer, or omit the line entirely if not provided>
  added: <ISO 8601 timestamp in America/New_York, e.g. 2026-07-04T14:35:12-04:00>
  note: "<note or empty string>"
```

**Prepend** the new entry above all existing entries. It occupies position 0 — the "now playing" slot — and is never shuffled.

**Then shuffle every entry below the new one.** This prevents session clumps: without a shuffle, several songs added in one sitting sit next to each other in the file, and (since the music layout renders file order) show up as a clump on the page. The freshest add stays fixed at the top; everything else is randomized in place. The `added` timestamp field is preserved verbatim — it's factual metadata about when the entry entered the playlist, not a sort key.

Use this one-shot Python (stdlib only), run from the repo root:

```bash
python3 - <<'PY'
import pathlib, random, re
path = pathlib.Path("data/music.yaml")
text = path.read_text()
entries = [e for e in re.split(r"(?m)^(?=- youtube_id:)", text) if e.strip()]
head, rest = entries[0], entries[1:]
random.shuffle(rest)
path.write_text(head + "".join(rest))
PY
```

**Batch behavior.** In queue-and-batch mode, prepend each queued entry in order (last-queued ends up at position 0), then shuffle **once** at the end — not after every prepend. That way the final on-disk state has the freshest add on top with everything else randomized; intermediate shuffles would just be thrown away by the next prepend.

**Diff churn.** A shuffle rewrites nearly every line of the file per commit, so `git blame data/music.yaml` becomes useless. That's an accepted trade — the file is data, not source, and its blame history was never especially informative. If a bisect ever needs to attribute a song, `git log --all -- data/music.yaml` still finds the introducing commit via the file content.

### 8. Verify the site still builds

Run `hugo --gc --minify --panicOnWarning` from the repo root. If it exits non-zero, `git restore data/music.yaml` and stop — do not commit.

### 9. Direct-commit to main and push

```bash
git add data/music.yaml
ALLOW_MAIN_COMMIT=1 git commit -m 'fix(music): now playing "<title>" by <artist>'
git push origin main
```

The commit type is intentionally `fix(music)` — semantic-release maps this to a patch bump, avoiding minor-version churn on the several-per-day cadence.

### 10. Report

Print:

- The commit SHA (`git log -1 --format=%H`)
- The push confirmation
- A short note that semantic-release + Fly deploy will run in the background
- The live URL: `https://omarcrosby.com/music/`

Do **not** watch the release workflow — the user checks it themselves.

## Rules

- **No PR, no branch.** This is data churn on a single-author site; a PR loop per add is friction.
- **Never `--force` push.** If push is rejected because someone else pushed, `git pull --rebase` first, then push.
- **Never skip hooks** (`--no-verify`).
- **Never guess metadata.** If oEmbed doesn't return JSON or the URL doesn't parse, stop and ask.
- **Do not touch anything outside `data/music.yaml`.** Layouts, hugo.toml, and content pages are not this command's concern.
- If any step from 5 onward fails after `data/music.yaml` is modified, `git restore data/music.yaml` before stopping.

## Example

```text
/add-music https://www.youtube.com/watch?v=dQw4w9WgXcQ --album "Whenever You Need Somebody" --year 1987
```

→ oEmbed returns `title: "Rick Astley - Never Gonna Give You Up (Official Music Video)"`
→ Parsed: artist `Rick Astley`, title `Never Gonna Give You Up`
→ User confirms
→ Prepended to YAML with album + year
→ Committed as `fix(music): now playing "Never Gonna Give You Up" by Rick Astley`
→ Pushed to main → semantic-release patches → Fly deploys
