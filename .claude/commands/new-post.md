---
description: "Scaffold a new blog post under content/posts/ with well-formed Hugo front matter."
argument-hint: "<post-title>"
---

# New Post

Scaffolds a new post at `content/posts/<slug>.md` with the required front matter (see `.claude/rules/content-frontmatter.md`).

**If `$ARGUMENTS` is empty: stop and tell the caller to pass a post title.**

## Steps

1. Derive the slug from `$ARGUMENTS`:
   - Lowercase
   - Replace non-alphanumerics with `-`
   - Collapse repeated `-`
   - Trim leading/trailing `-`

2. If `content/posts/<slug>.md` already exists, stop and report — do not overwrite.

3. Capture the current ISO 8601 timestamp in local timezone:

   ```bash
   date +"%Y-%m-%dT%H:%M:%S%z" | sed 's/\(..\)$/:\1/'
   ```

4. Write `content/posts/<slug>.md` with this exact structure:

   ```markdown
   +++
   title = "<$ARGUMENTS verbatim>"
   date = "<timestamp from step 3>"
   draft = true
   description = ""
   tags = []
   categories = []

   [cover]
   image = "/images/og/<slug>.png"
   hiddenInList = true
   +++

   Write your post here.
   ```

   The `[cover]` block is required per `.claude/rules/per-post-og-image.md`. `image` points at the path `scripts/generate-og-images.py` will write to; the PNG doesn't exist yet — that's fine while `draft = true`. `hiddenInList = true` keeps the cover from rendering as a full-width banner on `/posts/` and every taxonomy list (established in PR #87).

5. Report the path back to the caller so they can open it, with a reminder to run the generator before shipping:

   ```text
   Created content/posts/<slug>.md — flip draft to false when ready to ship, then run
   `python3 scripts/generate-og-images.py` before opening the PR so the [cover] image
   at /images/og/<slug>.png exists on the filesystem.
   ```

## Notes

- Do not run `hugo new` — the theme's `archetypes/default.md` may inject theme-specific placeholder fields that don't match this repo's front matter convention.
- Do not commit the draft — it stays local until `draft = false`.
- Path is deliberately `content/posts/` so URLs are `/posts/<slug>/`. To create a root-level page (`/<slug>/`), use `content/<slug>.md` manually — this command is for posts specifically.
