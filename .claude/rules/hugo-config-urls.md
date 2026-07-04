---
paths:
  - "hugo.toml"
  - "config.toml"
---

# Hugo Config URLs

Every `url = "..."` value in `hugo.toml` **must** be one of:

- **Root-relative** — starts with a leading `/`, e.g. `url = "/posts/"`, `url = "/index.xml"`
- **Absolute** — starts with `http://` or `https://`, e.g. `url = "https://github.com/ocrosby"`, `url = "mailto:foo@bar.com"`

Never a bare string (e.g. `url = "posts"`, `url = "index.xml"`).

## Why

PaperMod's `params.profileMode.buttons`, `params.socialIcons`, and several other params are rendered **verbatim** into `href` attributes. Unlike `[[menu.main]]`, these values are *not* piped through `absURL` / `relURL` by the theme. A bare string becomes a browser-relative link, which then resolves against whatever URL the visitor is currently on:

| Visitor is on | `href="posts"` resolves to |
|---|---|
| `https://omarcrosby.com/` | `https://omarcrosby.com/posts` (works accidentally) |
| `http://localhost:8080/` (docker preview) | `http://localhost:8080/posts` — leaks preview port into bookmarks |
| `https://staging.example.com/` | wrong host |
| Any subpath | resolution breaks |

The failure is silent — Hugo builds fine, the link works from the homepage, and the bug only surfaces on non-home entry points or preview environments.

Root-relative (`/posts/`) always resolves against the visitor's current *host*, which is the intended behavior for a static site with a stable URL structure.

## Signals

| Pattern in `hugo.toml` | Fix |
|---|---|
| `[[params.profileMode.buttons]] ... url = "posts"` | `url = "/posts/"` |
| `[[params.socialIcons]] name = "rss" ... url = "index.xml"` | `url = "/index.xml"` |
| Any `url = "<bare-word>"` under `[params.*]` or `[[params.*]]` | Prefix with `/` for internal, or use full `https://…` for external |

Menu entries under `[[menu.main]]` are also expected to be root-relative (`/posts/`), but PaperMod's header template absolutizes them via baseURL — so a bare string there works accidentally today. Keep the leading slash anyway for consistency.

## When this rule fires

- Any `Edit` or `Write` targeting `hugo.toml`.
- Any `hugo-reviewer` invocation.
- When reviewing a PR whose diff includes `hugo.toml`.

## Report as

- **Must Fix** when a bare-string `url` sits under `params.profileMode.buttons` or `params.socialIcons` — this is the failure class we've already hit.
- **Should Fix** when a bare-string `url` sits under `[[menu.main]]` — currently absolutized by the theme, but silently drifting.

## Exceptions

`mailto:` and `tel:` URI schemes count as absolute — leave them as-is (`url = "mailto:foo@bar.com"`).
