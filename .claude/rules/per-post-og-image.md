---
paths:
  - "content/posts/**/*.md"
---

# Per-Post OG Image

Every post under `content/posts/` must have its own OpenGraph preview image, generated via `scripts/generate-og-images.py` and referenced in the post's front matter via a `[cover]` block. Never let a new post ship with the site-wide `images/og.png` as its `og:image` — that makes every share of every post look identical in a feed.

## Why

PaperMod's `_partials/templates/opengraph.html` cascades:

1. If the post has `Params.cover.image`, emit that as `og:image`, `twitter:image`, and the JSON-LD `schema.org` image.
2. Otherwise fall back to the site-wide `params.images` (currently `["images/og.png"]`).

If step 2 fires, LinkedIn / X / Slack all render the same 1200×630 site logo for every post the site has ever published. Feed-level distinctiveness collapses. The whole point of the per-post OG surface (established by PR #71) is that every share is visually distinct at a glance.

## The rule

Before opening any PR that adds a post under `content/posts/`:

1. Run the generator (re-runnable — safe to run on any post state):

   ```bash
   python3 scripts/generate-og-images.py
   ```

   It walks `content/posts/*.md`, parses title + primary category from front matter, and writes `static/images/og/<slug>.png`. Adding a new post → the script generates its image on the next run. Editing an existing post's title or category → rerun the script to refresh that post's image.

2. Ensure the post's front matter carries a `[cover]` block pointing at its image:

   ```toml
   [cover]
   image = "/images/og/<slug>.png"
   ```

   Placed as the last block inside the front matter (TOML tables must follow all top-level keys). The path is root-relative; PaperMod's opengraph template runs it through `absURL`.

3. Verify `og:image` in the rendered HTML resolves to the per-post PNG, not `og.png`:

   ```bash
   hugo --gc --minify --panicOnWarning >/dev/null
   grep -o 'og:image[^>]*' "public/posts/<slug>/index.html"
   ```

   Should print a URL under `/images/og/`, not `/images/og.png`.

## Signals

| Signal | Fix |
|---|---|
| New file under `content/posts/` in the diff, no matching `static/images/og/<slug>.png` | Run `python3 scripts/generate-og-images.py`, stage the new PNG |
| Post's front matter lacks a `[cover]` block | Add `[cover]\nimage = "/images/og/<slug>.png"` before the closing `+++` |
| Post's `[cover].image` points at `images/og.png` or another shared file | Replace with `/images/og/<slug>.png` and generate the per-post image |
| Post's title changed but `static/images/og/<slug>.png` hasn't been regenerated | Re-run the generator; commit the refreshed PNG |
| `scripts/generate-og-images.py` reports `SKIP <post>: no title in front matter` | The post is missing `title` — fix the front matter first (see `.claude/rules/content-frontmatter.md`) |

## When this rule fires

- Any `Write` creating a new file under `content/posts/`.
- Any `Edit` to a `content/posts/*.md` file that changes `title` or `categories`.
- Any invocation of `/new-post` — the scaffold produces a draft, but the OG image must be generated before flipping `draft = false` and opening the PR.
- Any `hugo-reviewer` invocation whose diff touches `content/posts/`.

## Report as

- **Must Fix** — a new post lands without an OG image, or the `[cover]` block is missing, or the referenced image doesn't exist under `static/images/og/`. The whole SEO/discovery gain from PR #71 collapses on the first post that skips this.
- **Should Fix** — the post's title has changed since the last OG generation and the image no longer matches the current title.

## Exceptions

- `content/posts/_index.md` — this is the section landing page, not a post. Skip.
- Posts with `draft = true` — the generator will still render the image (it walks front matter, not build output), and that's fine. Wasted work is preferable to forgetting on the final commit.

## Not covered by this rule

- **Project pages, category pages, or other content types** — only `content/posts/` posts get per-post OG images today. If the pattern extends to other sections later, update `scripts/generate-og-images.py` and this rule together.
- **Static image generation for non-OG surfaces** (post covers displayed inline, illustration images inside posts). Those are authored separately per the `Images` section of the `hugo-authoring` skill.
