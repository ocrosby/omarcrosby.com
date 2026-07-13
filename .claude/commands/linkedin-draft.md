---
description: Generate a ready-to-paste LinkedIn draft from the site's RSS feed. Default = latest post, copied to clipboard. Length + fold status reported.
argument-hint: "[N] [--since YYYY-MM-DD] [--outdir drafts/] [--stdout]"
---

# /linkedin-draft

Turns entries in `https://omarcrosby.com/index.xml` into paste-ready LinkedIn posts. Runs `scripts/linkedin_from_rss.py` (stdlib-only) and — by default — pipes the result to `pbcopy` so you can `⌘V` straight into the LinkedIn composer.

The command **drafts**, it does not **post**. LinkedIn's posting API requires an approved app + rotating OAuth token; the paste step is a few seconds and the tradeoff isn't worth automating. See the design note at the bottom.

## Arguments

- **`[N]`** (optional) — number of most-recent posts to draft. Default `1`. If `N > 1`, the composed drafts are separated by a `===` divider in the clipboard payload — pick the one you want when pasting.
- **`--since YYYY-MM-DD`** (optional) — only draft posts published on or after this date. Overrides `[N]` when combined (returns everything since, capped at `[N]`).
- **`--outdir <dir>`** (optional) — write each draft to `<dir>/<slug>.txt` instead of stdout/clipboard. Preferred for `N > 1`.
- **`--stdout`** (optional) — skip `pbcopy` and print to stdout only. Useful when previewing before deciding to copy.

## Workflow

### 1. Preconditions

- The working directory must be the `omarcrosby.com` repo root. `test -f scripts/linkedin_from_rss.py` — if missing, stop and surface a clear error.
- `pbcopy` must exist on `PATH` unless `--stdout` or `--outdir` was passed. macOS ships it; Linux users will get an error unless they've aliased it or passed one of the opt-out flags.

### 2. Choose the feed source

Prefer the live feed at `https://omarcrosby.com/index.xml` — it's the source of truth for what's actually published, and the RSS is regenerated on every Fly deploy.

Fallback (only if the live fetch errors): `public/index.xml` from the local Hugo build. If neither is reachable, stop and tell the user.

### 3. Compose the draft(s)

The default happy path — `/linkedin-draft` with no args:

```bash
python3 scripts/linkedin_from_rss.py https://omarcrosby.com/index.xml --content-root content \
  | tee >(pbcopy) \
  | cat
```

The `tee` copies to `pbcopy` and echoes to stdout in one pass. Report the character count / fold status line to the user (the script emits it to stderr — capture it separately if needed).

With `N > 1`:

```bash
python3 scripts/linkedin_from_rss.py https://omarcrosby.com/index.xml --content-root content -n <N> \
  | tee >(pbcopy) \
  | cat
```

With `--outdir`:

```bash
mkdir -p <dir>
python3 scripts/linkedin_from_rss.py https://omarcrosby.com/index.xml --content-root content \
  -n <N> -o <dir>
```

Report the list of files written and each one's char/fold status.

### 4. Report

When copied to clipboard, print a two-line status block:

```text
Copied to clipboard — <chars>/3000 chars[, hook past ~210 fold]
Title: <title of the drafted post>
```

If the hook (first line = post title) exceeds ~210 chars, LinkedIn hides the rest behind "…see more" — the script's fold warning surfaces that. Suggest shortening the title in the draft before pasting, but don't rewrite the site's post — only the clipboard copy.

### 5. Exit cleanly

No branching, no committing — this command produces a clipboard artifact and does not modify the repo. If invoked from a dirty working tree, that's fine.

## Notes on the format

Each draft is composed as:

```text
<Post title>

<First two sentences of the front-matter summary or opening prose>

Full post: <URL>

#<hashtag> #<hashtag> …  (from post categories, up to 4)
```

The hook (first line) is what LinkedIn shows in-feed before the "…see more" fold. Keep it interesting. If a post's title alone doesn't sell it, edit the clipboard version before pasting — the site's title stays as-is.

Hugo's default RSS template doesn't emit `<category>` tags from front-matter taxonomies, so the script's `--content-root content` flag has it read tags + categories directly from each post's TOML front matter as a fallback. Hyphenated tags (`developer-tools`) become CamelCase (`#DeveloperTools`). Generated pages without a source file (music items) get no hashtags — silent fall-through.

## Why not auto-post to LinkedIn?

LinkedIn's Community Management API (`POST /rest/posts`, `POST /v2/ugcPosts`) requires:

1. A LinkedIn Developer app registered to a Company Page.
2. OAuth 2.0 token with `w_member_social` (personal) or `w_organization_social` (company) scope. Personal-scope access has been progressively locked behind partner-approval flows — it's not self-serve for "post to my own feed."
3. Token rotation every 60 days.

The delta from "draft on clipboard" to "posted" is ~10 seconds of pasting. Automating that end costs an approved developer app and ongoing OAuth maintenance, for a marginal time saving. Skip.

If that calculus changes (e.g. you want a scheduled posting queue), the extension point is: add `--post` to the script that reads `$LINKEDIN_ACCESS_TOKEN` from the env and POSTs the composed body. That'll be ~30 lines of `urllib.request`. But the token-lifecycle problem stays yours.
