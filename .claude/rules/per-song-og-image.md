---
paths:
  - "data/music.yaml"
---

# Per-Song OG Image

Every entry in `data/music.yaml` must have a matching `static/images/og/music/<youtube_id>.jpg` shipped in the same commit. The image is what social crawlers pull as `og:image` when someone shares `omarcrosby.com/music/<youtube_id>/` — without it, the shared URL falls back to the site-wide `og.png` and every song's share preview collapses to identical branding.

## Why

PR #74 established the machinery: `content/music/_content.gotmpl` generates a per-song page for every yaml entry, and `layouts/music/single.html` renders it with a `[cover]` block PaperMod's `_partials/templates/opengraph.html` reads to emit `og:image` / `twitter:image` / JSON-LD image. The image path is `/images/og/music/<youtube_id>.jpg` — case-preserved because `static/` filenames on Linux are case-sensitive.

If the yaml entry lands without the JPG:

- The `/music/<id>/` page still generates (the content adapter doesn't check for the image file).
- Social crawlers fetch the page, see the `og:image` URL, request `/images/og/music/<id>.jpg` → 404.
- LinkedIn / Facebook / Slack fall back to caching the site-wide `og.png`.
- Even after the JPG is eventually committed, the fallback stays cached at each of those platforms for hours to days.

This is why the rule is **Must Fix**, not Should Fix: the fallback isn't a graceful degradation, it's a persistent bad-preview state that outlasts the fix.

## The workflow

`/add-music` runs it automatically at step 7c. When editing `data/music.yaml` by hand — or landing a bulk change — do it explicitly:

```bash
python3 scripts/generate-music-og-images.py --only <youtube_id>
```

For a full backfill (e.g. after mass-editing titles / artists):

```bash
python3 scripts/generate-music-og-images.py --all
```

The script:

- Downloads the YouTube thumbnail (maxresdefault → hqdefault fallback) via `curl`, caches under `scripts/.thumbnail-cache/<id>.jpg`.
- Composites onto a 1200×630 canvas matching the post OG design tokens (dark bg `#1d1e20`, muted `#8a8a8a`, Arial Bold, side-by-side thumbnail-and-text layout).
- Writes to `static/images/og/music/<youtube_id>.jpg` — JPEG quality 90, 4:2:0 chroma, progressive scan (~30-80 KB per image).

## Signals

| Signal | Fix |
|---|---|
| Entry added to `data/music.yaml` with no matching `static/images/og/music/<youtube_id>.jpg` | Run `python3 scripts/generate-music-og-images.py --only <id>` and stage the resulting JPG in the same commit |
| Song's `title` or `artist` changed in yaml, JPG is older than the yaml modification time | Re-run the generator with `--only <id>` and stage the refreshed JPG |
| Bulk yaml edit (e.g. `/randomize-music`, a mass title parse) | The shuffle doesn't invalidate images (only positions changed), but any title/artist edit does — re-run `--all` and audit the diff before committing |
| `static/images/og/music/<youtube_id>.jpg` exists for a yaml entry that was removed | Delete the orphaned JPG in the same commit |
| Rendered `/music/<id>/` HTML has `og:image` pointing at `omarcrosby.com/images/og.png` (site-wide fallback) instead of `/images/og/music/<id>.jpg` | The JPG is missing — same fix as row 1 |

## When this rule fires

- Any `Write` or `Edit` targeting `data/music.yaml` that adds or removes a `- youtube_id:` block.
- Any `Edit` to `data/music.yaml` that changes a `title:` or `artist:` value (image content depends on both).
- Any invocation of `/add-music` — step 7c must run before commit.
- Any invocation of `/randomize-music` — no image changes needed (position-only), but sanity-verify the JPG-set is still 1:1 with the yaml entries before pushing.

## Report as

- **Must Fix** — new entry in `data/music.yaml` with no matching JPG in the same commit. The bad-preview state that results is persistently cached across social platforms.
- **Should Fix** — title/artist changed but the JPG wasn't regenerated. Old title/artist stays visible in every future share until refreshed.
- **Consider** — JPG file size is anomalously large (>150 KB after JPEG-90 compression) — indicates a very-detailed thumbnail; could re-encode at quality 85 to save space if it starts becoming a repo-size problem in aggregate.

## Exceptions

- None. Unlike posts, where the OG image is aesthetically valuable but not architecturally required, the music surface has real per-song URLs and social crawlers will actively fetch and cache the wrong preview if the JPG is missing.

## Not covered by this rule

- **Post OG images** — `.claude/rules/per-post-og-image.md` covers `content/posts/**/*.md`. Different rule, same shape.
- **The `/music/` index page** — that surface uses the site-wide OG image and doesn't need a per-song image.
