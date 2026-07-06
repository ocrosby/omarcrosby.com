---
description: Add a YouTube music video to data/music.yaml, direct-commit to main, and push. Semantic-release will cut a patch bump and Fly will redeploy. No PR, no branch — this is data churn.
argument-hint: <youtube-url> [--album "Album"] [--year 1985] [--note "..."]
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

**No confirmation prompt by default.** The parse rules in step 4 are deterministic — when they succeed with an unambiguous split, proceed straight to dedup + prepend + commit + push. Confirmation only fires when the parse itself is ambiguous (see step 5).

**Queue-and-batch is always on.** If a second `/add-music` fires while a prior one is still processing, buffer both as one batch — one build check, one commit per song, one push at the end.

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
- Strip trailing suffixes matching any of `(Official Music Video)`, `[Official Music Video]`, `(Official Video)`, `[Official Video]`, `(Video)`, `[Video]`, `(Music Video)`, `[Music Video]`, `(Official Audio)`, `(Audio)`, `(Lyrics)`, `(HD)`, `(4K)`, `(Official HD Video)`, `(Official 4K Video)`, `(Official 4K Music Video)`, `(Remastered)`, `(Live)`, `(YYYY)`, a bare trailing `Remastered`, or a bare trailing four-digit year (e.g. `... Set Adrift On Memory Bliss 1991`). Reupload/remaster channels routinely append these without parens.
- **When a bare trailing year is stripped**, also set `year: <YYYY>` on the entry — the title already told us the release year, and dropping it just to strip the suffix wastes signal. The intent is to strip **video-quality / video-role metadata** — bracket vs paren, "HD" vs "4K", "Video" vs "Music Video" are all the same category; apply the same-intent extension when a novel variant appears.
- Strip trailing `(From "<something>" Soundtrack)` and `(as featured in <film/show>)` — media-attribution metadata, same intent as `(Official Music Video)`. Both may appear alongside a video-role suffix (e.g. `(Official Video) (as featured in Anyone But You)`); strip repeatedly until no known trailing suffix matches.
- Strip a redundant trailing `ft. <name>` if `<name>` is already present in the parsed artist (typical for YouTube titles that list collab artists both comma-separated in the artist AND ft.-suffixed in the title). Keep `ft.` when the featured artist is *not* in the artist field.
- Keep parenthetical **subtitles** that are part of the canonical song name — `(This Time for Africa)`, `(Who Loves Me)`, `(Human Nature Radio Mix)`, `(feat. Joey Bada$$)` — these are content, not metadata. When the same parenthetical contains BOTH a real subtitle and metadata (e.g. `(Human Nature Radio Mix - Official Video)`), keep the subtitle and strip the metadata.
- **`author_name` strip list**: strip trailing `VEVO` and trailing " - Topic" (with the leading space; YouTube's auto-generated-topic-channel convention). Same intent.
- Comma-separated collab artists (`Artist A, Artist B`) and ampersand collabs (`Artist A & Artist B`) are kept verbatim as the artist — do not split.
- **If no split character exists at all** (e.g. pipe-separated `SONG | SHOW | CHANNEL` shape, or a single-token title that is NOT from a Topic channel): **do not blindly use the whole title.** This is one of the cases that triggers the parse-safety gate in step 5.
- **Topic channels are unambiguous, not a fallback.** When `author_name` ends in " - Topic", YouTube's auto-generated-topic-channel convention is: channel name (with " - Topic" stripped) is the artist, video title is the song. Parse cleanly as artist = stripped author, title = raw title. Do not trigger the parse-safety gate for these.

### 5. Parse-safety gate — only fires on ambiguous parses

The default is to **proceed without asking**. The parse rules in step 4 are deterministic; when they land on an unambiguous result, print a one-line summary and continue directly to dedup + prepend + commit + push.

The gate only fires when the parse itself is ambiguous. These are the trigger cases — nothing else:

- No split character exists AND the source is not a Topic channel (`SONG | SHOW | CHANNEL` shape, single-token title from a non-Topic channel).
- Multiple candidate splits at the same top-level position (rare — same distance ` - ` and ` – ` both present at competing positions).
- Trailing suffix in the title that doesn't match any codified strip pattern AND isn't a recognizable canonical subtitle — i.e. a novel variant the parser can't confidently classify.

When the gate fires, print the preview block and wait for explicit confirmation:

```text
Video ID:   <id>
Title:      <parsed title>          (or "?")
Artist:     <parsed artist>         (or "?")
Album:      <--album flag or "(none)">
Year:       <--year flag or "(none)">
Note:       <--note flag or "(none)">
Thumbnail:  https://i.ytimg.com/vi/<id>/mqdefault.jpg
Raw title:  <YouTube's title>
Author:     <YouTube's author_name>
```

When the gate does NOT fire (the common case), print a one-liner instead — enough to see what was parsed in the transcript, but do not wait:

```text
Parsed: "<title>" by <artist>  (stripped: <suffixes>, if any)
```

**Queue-and-batch (always on).** If a second `/add-music` fires while a prior one is still processing, treat both as one atomic batch: buffer the parsed entries, verify the site builds once at the end, produce **one commit per song** in queue order (each prepended above the previous, so the last-queued ends up at the top), and push once. If any entry in the batch triggers the parse-safety gate, hold that entry — process the unambiguous ones through commit and push, then surface the ambiguous one at the end for confirmation.

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

**Step 7a — Prepend the new entry.** Stdlib-only Python from the repo root:

```bash
python3 - <<PY
import pathlib
new_entry = '''- youtube_id: "<id>"
  title: "<title>"
  artist: "<artist>"
  album: "<album or empty string>"
  added: <ISO 8601 timestamp>
  note: "<note or empty string>"
'''
path = pathlib.Path("data/music.yaml")
path.write_text(new_entry + path.read_text())
PY
```

**Step 7b — Shuffle entries 1..N.**

```bash
python3 scripts/shuffle-music.py
```

The script keeps the fresh add pinned at position 0 (the "now playing" slot) and randomizes entries 1..N in place. Shared with `/randomize-music`; see `scripts/shuffle-music.py` for the reference implementation.

**Batch behavior.** In queue-and-batch mode, prepend each queued entry in order (last-queued ends up at position 0), then shuffle **once** at the end — not after every prepend. That way the final on-disk state has the freshest add on top with everything else randomized; intermediate shuffles would just be thrown away by the next prepend.

**Diff churn.** A shuffle rewrites nearly every line of the file per commit, so `git blame data/music.yaml` becomes useless. That's an accepted trade — the file is data, not source, and its blame history was never especially informative. If a bisect ever needs to attribute a song, `git log --all -- data/music.yaml` still finds the introducing commit via the file content.

### 8. Verify the site still builds

Run `hugo --gc --minify --panicOnWarning` from the repo root. If it exits non-zero, `git restore data/music.yaml` and stop — do not commit.

**Exit-status guardrail.** Do not pipe hugo's output into another command when checking exit status — pipelines return only the last command's status, so `hugo ... 2>&1 | tail -3 && git commit ...` silently commits on a broken build. Either redirect (`hugo ... >/dev/null`) or enable `set -o pipefail` before the pipeline.

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
