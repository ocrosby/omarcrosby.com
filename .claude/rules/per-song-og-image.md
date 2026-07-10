---
paths:
  - "data/music.yaml"
  - "assets/js/music.ts"
  - "layouts/section/music.html"
  - "layouts/music/*.html"
---

# Per-Song OG Image

Every entry in `data/music.yaml` must have a matching `static/images/og/music/<youtube_id>.jpg` shipped in the same commit. The image is what social crawlers pull as `og:image` when someone shares `omarcrosby.com/music/<youtube_id>/` — without it, the shared URL falls back to the site-wide `og.png` and every song's share preview collapses to identical branding.

The rule has two halves — the image, and the URL that carries it. Both must hold together; either alone fails the sharing experience.

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

## URL model — the music player must write path-based URLs, not query strings

The image is only half the invariant. The music player at `assets/js/music.ts` must reflect the current song in the URL bar as a **path** (`/music/<lowercased-youtube_id>/`), never as a query string (`?v=<youtube_id>`). Otherwise the URL a user copies out of their address bar doesn't carry the per-song OG tags, and every shared link falls back to the site-wide `og.png` — same failure class as a missing JPG, different mechanism.

Why:

- Social crawlers (LinkedIn Post Inspector, iMessage, Slack, Facebook, X) resolve OG metadata against the exact URL that was shared. Query strings are stripped for OG discovery — the crawler hits `omarcrosby.com/music/` and gets the section landing's OG.
- The path `/music/<lowercased-youtube_id>/` matches what `content/music/_content.gotmpl` generates. That page has the per-song `og:image`, `og:title`, `twitter:image`, and JSON-LD image tags in its `<head>`.
- Hugo's content adapter lowercases URL slugs. The static-file path `/images/og/music/<youtube_id>.jpg` is case-preserved on disk, but the *page* path is lowercase. The music player must lowercase the id before writing it to the URL bar so the URL resolves to a real page.

### Signals (URL model)

| Signal | Fix |
|---|---|
| `assets/js/music.ts` calls `shareUrl.searchParams.set("v", ...)` and writes it via `history.replaceState` / `pushState` | Replace with `shareUrl.pathname = "/music/" + id.toLowerCase() + "/"` and `shareUrl.searchParams.delete("v")` before the `replaceState` call |
| A new song-selection code path is added that constructs a share URL without going through the swap()/deep-link init helpers | Route it through the same path-based URL builder — do not open-code `?v=` |
| The music player's deep-link init only reads `?v=<id>` from `location.search` (not from `location.pathname`) after a URL-model migration | Keep the legacy `?v=<id>` reader as backward-compat for old bookmarks, but always *rewrite* the URL bar to the path form on arrival (see the swap() reference in `music.ts`) |
| An old commit or PR reintroduces `searchParams.set("v", ...)` because "that's how the URL state used to work" | Reject in review — this specifically breaks per-song sharing |

### Report as (URL model)

- **Must Fix** — a change to `assets/js/music.ts` reintroduces `?v=<id>` writing. The bad-share state that results is invisible on-page (browser bar reads a valid URL) but silently breaks every LinkedIn/iMessage/Slack preview.
- **Should Fix** — the JS reads `?v=` legacy URLs but doesn't rewrite them to `/music/<id>/` on arrival. Old bookmarks work but the URL bar stays in the query-string form, so any subsequent copy-share loops back to the broken state.

## Exceptions

- None. Unlike posts, where the OG image is aesthetically valuable but not architecturally required, the music surface has real per-song URLs and social crawlers will actively fetch and cache the wrong preview if the JPG is missing or the URL model bypasses the per-song page.

## Not covered by this rule

- **Post OG images** — `.claude/rules/per-post-og-image.md` covers `content/posts/**/*.md`. Different rule, same shape.
- **The `/music/` index page** — that surface uses the site-wide OG image and doesn't need a per-song image.
