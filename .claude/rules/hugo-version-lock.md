---
paths:
  - "Dockerfile"
  - ".github/workflows/*.yml"
  - "config.toml"
  - "themes/**"
---

# Hugo Version Lock

Hugo is pinned to `0.127.0` in both `Dockerfile` and `.github/workflows/ci.yml`. Do not change these to a newer version without first migrating the theme.

## Why

The `puppet` theme (a git submodule) uses `resources.ToCSS` and `resources.Minify` in `themes/puppet/layouts/_default/baseof.html`. In Hugo:

- **0.128.0** (June 2024) — `resources.ToCSS` deprecated in favor of `css.Sass`
- **~0.146+** — `resources.ToCSS` removed entirely

The site builds cleanly on `0.127.0`. It fails on `0.160+` with `can't evaluate field ToCSS in type interface {}` — the exact error observed on the maintainer's local Homebrew Hugo.

## The lock

| File | Locked value |
|---|---|
| `Dockerfile` (stage 1) | `FROM hugomods/hugo:0.127.0 AS builder` |
| `.github/workflows/ci.yml` | `hugo-version: '0.127.0'` |
| `README.md` requirements | `>= 0.101.0, < 0.128.0` |

## When this rule fires

Any change proposing to bump the Hugo version — via Dockerfile edit, workflow edit, README bump, or `mise`/`asdf` toolfile.

## How to upgrade Hugo safely (out of scope for casual bumps)

If Hugo *must* be upgraded (for a new feature or security fix), do this in a single PR that:

1. Copies `themes/puppet/layouts/_default/baseof.html` to `layouts/_default/baseof.html` at the site root.
2. Replaces the deprecated calls:
   - `resources.Get "sass/main.scss" | resources.ToCSS $options`
     → `resources.Get "sass/main.scss" | css.Sass $options`
   - `resources.Get "zoomjs/zoom.css" | resources.Minify`
     → `resources.Get "zoomjs/zoom.css" | resources.Fingerprint | resources.Minify` (verify with `hugo --panicOnWarning`)
3. Grep the theme for other deprecated calls (`.Site.IsServer`, `.Hugo`, `.GetPage` with old signatures) and add overrides for each.
4. Bump `Dockerfile`, `ci.yml`, `README.md`, and this rule's "locked value" table in the same PR.
5. Verify: `docker build` succeeds, container smoke test passes (`curl -I` returns 200), and `--panicOnWarning` can be re-enabled in `ci.yml`.

Do **not** upgrade Hugo speculatively "to stay current." The theme dictates the ceiling.
