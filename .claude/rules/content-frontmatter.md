---
paths:
  - "content/**/*.md"
  - "archetypes/*.md"
---

# Content Front Matter

Every Markdown file under `content/` must open with a TOML front matter block delimited by `+++`. Missing or malformed front matter causes Hugo to skip the file silently or emit an ambiguous render error.

## Required fields

```toml
+++
title = "Human-readable title"
date = "2026-07-04T10:00:00-04:00"
draft = false
+++
```

- **`title`** — used in `<title>`, headings, and RSS.
- **`date`** — ISO 8601 with timezone. Drives sort order and archive grouping. Never leave `date = "0001-01-01T00:00:00Z"` — it sorts to the bottom of the archive.
- **`draft`** — `true` while writing (excluded from build). Must be `false` before the PR that merges the post.

## Recommended fields

```toml
description = "One-sentence summary for meta tags and social embeds."
tags = ["hugo", "self-hosting"]
categories = ["Engineering"]
series = ["themes-guide"]   # only if part of an existing series
```

- **`description`** — used in `<meta name="description">`. Aim for 120–160 chars.
- **`tags`** / **`categories`** — used by the taxonomy config in `config.toml`. Reuse existing values (grep `content/` for spelling); a new tag creates a new taxonomy page.

## Draft workflow

1. Scaffold with `/new-post <title>` (see `.claude/commands/new-post.md`) — creates the file with `draft = true`.
2. Write and iterate. `hugo server -D` shows drafts locally.
3. Before opening the PR, flip `draft = false` and confirm the file appears in `docker run` preview at the expected URL.

## When this rule fires

- Any `Write` creating a new file under `content/`.
- Any `Edit` to an existing content file — verify the front matter is still well-formed after the edit.
- Any review of a PR that adds or changes content.

## Common failure modes

| Symptom | Cause |
|---|---|
| Post doesn't appear in list pages | `draft = true` still set, or `date` is in the future |
| Post renders with title "Untitled" | `title` field missing from front matter |
| Hugo emits `ERROR: failed to unmarshal TOML` | Unquoted string, missing `+++` delimiter, or mismatched quotes |
| Post URL is `/posts/foo/` but you expected `/foo/` | Content path `content/posts/foo.md` produces `/posts/foo/`; use `content/foo.md` for root-level pages |
