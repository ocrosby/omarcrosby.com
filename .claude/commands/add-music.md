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

### 6. Check for duplicates

Read `data/music.yaml`. If any existing entry has the same `youtube_id`, stop and ask "duplicate — add anyway?" — do not add silently.

### 7. Prepend the new entry

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

Prepend it above all existing entries. Write the file back.

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
