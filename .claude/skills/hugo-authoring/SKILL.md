---
description: Hugo authoring guidance for omarcrosby.com — front matter conventions, shortcodes, image handling, taxonomy, and the preview loop. Auto-triggers when editing files under content/ or archetypes/.
paths:
  - "content/**/*.md"
  - "archetypes/*.md"
---

# Hugo Authoring

This skill loads when writing or editing content under `content/` or `archetypes/`. The nine project rules — `content-frontmatter.md`, `theme-immutable.md`, `hugo-config-urls.md`, `external-link-hygiene.md`, `project-title-naming.md`, `per-post-og-image.md`, `per-song-og-image.md`, `now-page-updated-timestamp.md`, `markdown-emphasis-style.md` — are the source of truth for enforcement. This skill provides the *how* for common authoring tasks.

## Fast path

- **New post**: use `/new-post <title>` (from `.claude/commands/new-post.md`). It scaffolds `content/posts/<slug>.md` with correct front matter.
- **Preview**: use `/preview`. It builds the Docker image and serves on `http://localhost:8080`. Drafts are excluded from Docker preview — see the draft workflow below.
- **Verify before ship**: if the diff added *any* external URL, `/verify` is **required** before opening the PR — its lychee gate catches fragile-URL classes (ACM, IEEE Xplore, university preprint PDFs) that only fail once merged. See `.claude/rules/external-link-hygiene.md`. Skipping `/verify` and shipping means the failure lands on *the next PR*, not this one.
- **Ship**: flip `draft = false`, open a PR with a `feat(content): ...` message, merge → release workflow tags and deploys.

## Front matter cheat sheet

TOML (this repo's convention):

```toml
+++
title = "The post title, no trailing period"
date = "2026-07-04T10:00:00-04:00"
draft = true
description = "One-sentence summary, 120–160 chars, used for meta + social embeds."
tags = ["hugo", "self-hosting"]
categories = ["Engineering"]
+++
```

Field notes:

| Field | Notes |
|---|---|
| `title` | Sentence case. No trailing period. Used verbatim in `<title>` and page headings. |
| `date` | ISO 8601 with timezone. Drives sort order. Never leave the zero value. |
| `draft` | Explicit `true` while writing. Must be `false` before the merge PR. |
| `description` | 120–160 chars. Under 120 = wasted space; over 160 = truncated in search results. |
| `tags` / `categories` | Reuse existing values. Grep `content/**/*.md` before inventing a new one. |
| `series` | Only if joining an existing series. Value must match exactly (case-sensitive). |
| `aliases` | List of old URLs that should redirect to this page. Keep after renames. |

## Draft workflow

1. `/new-post "My Title"` → scaffolds with `draft = true`.
2. Write. Iterate. Read your own prose out loud.
3. Optional local draft preview: `hugo server -D` (requires local Hugo — the Homebrew 0.160 build works with the current PaperMod submodule).
4. Flip `draft = false`.
5. **Generate the OG image and add the `[cover]` block** — required for every post per `.claude/rules/per-post-og-image.md`:

   ```bash
   python3 scripts/generate-og-images.py
   ```

   Then ensure the post's front matter ends with:

   ```toml
   [cover]
   image = "/images/og/<slug>.png"
   ```

   Verify with: `hugo --gc --minify --panicOnWarning >/dev/null && grep -o 'og:image[^>]*' "public/posts/<slug>/index.html"` — the URL should be under `/images/og/<slug>.png`, not the site-wide `/images/og.png`.

6. Verify in Docker preview: `/preview`, confirm the post appears in the archive at the expected URL.
7. **Required if the diff added external URLs — `/verify`.** Its lychee step checks every rendered page against the full external-link set; skipping this is how fragile-URL failures reach `main`. See `.claude/rules/external-link-hygiene.md` for the URL classes that break `lychee`.
8. Open PR with `feat(content): add "<slug>"` or similar. Merge triggers the release.

## URL structure

Hugo maps content paths to URLs by directory:

| Content path | URL |
|---|---|
| `content/about.md` | `/about/` |
| `content/posts/foo.md` | `/posts/foo/` |
| `content/posts/foo/index.md` (page bundle) | `/posts/foo/` |
| `content/series/hugo-guide/_index.md` | `/series/hugo-guide/` |

For posts with images or supporting files, prefer the **page bundle** pattern: `content/posts/<slug>/index.md` with images in the same directory. Then reference them as `{{< figure src="diagram.png" >}}` — no path prefix needed.

## Shortcodes

Available shortcodes:

| Shortcode | Purpose | Example |
|---|---|---|
| `figure` | Image with optional caption | `{{< figure src="diagram.png" caption="Flow" >}}` |
| `ref` | Absolute link to another page by path | `{{< ref "posts/other.md" >}}` |
| `relref` | Relative link to another page | `{{< relref "other.md" >}}` |
| `youtube` | Embed a YouTube video | `{{< youtube abc123 >}}` |
| `gist` | Embed a GitHub gist | `{{< gist user id >}}` |

To add a custom shortcode, create `layouts/shortcodes/<name>.html` at the site root (not in the theme — see `.claude/rules/theme-immutable.md`).

## Images

- **Static** images that don't change per post: `static/img/<name>.<ext>` → referenced as `/img/<name>.<ext>`.
- **Post-specific** images: use a page bundle (`content/posts/<slug>/index.md` + images alongside) and reference by filename.
- Always compress: PNG via `pngquant`, JPEG via `mozjpeg` or `jpegoptim`. Under 200KB per image for above-the-fold content.
- Provide `alt` text for accessibility — the `figure` shortcode's `alt` param takes it: `{{< figure src="x.png" alt="Description" >}}`.

## Taxonomy hygiene

Tags and categories are declared in `config.toml` under `[taxonomies]`:

```toml
[taxonomies]
category = "categories"
tag = "tags"
series = "series"
```

Each unique value creates a listing page at `/tags/<value>/`, `/categories/<value>/`, etc. Consequence: typos and inconsistent casing fragment your archive. Before adding a new tag, run:

```bash
grep -rh '^tags' content/ | sort -u
```

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Post doesn't appear on site | `draft = true` or `date` in the future | Flip draft, verify date |
| Post renders as "Untitled" | `title` missing | Add the field |
| `ERROR: failed to unmarshal TOML` | Unquoted string / stray `"` | Validate front matter |
| Shortcode renders as raw text | Unknown shortcode name | Check spelling or add a layout |
| Internal link 404s in production | Raw relative path used | Convert to `{{< ref "..." >}}` |

## What this skill does NOT do

- Prose editing / rewriting — Claude's default text handling is fine for that.
- Theme customization — that's a `layouts/` task; see `.claude/rules/theme-immutable.md`.
- Configuration changes — `config.toml` edits should go through review, not authoring flow.
