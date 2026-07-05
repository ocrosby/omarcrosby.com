# External Link Hygiene

CI runs `lychee` against every rendered HTML page on the site. When lychee cannot resolve an external URL — 403 to bot user agents, TLS chain drift, auth wall — the whole job fails, and it fails on **the next PR**, not the one that introduced the URL. That makes the failure look unrelated to the diff being reviewed. This rule exists to catch fragile URL classes at authoring time so they never land.

## Fragile URL classes

The following hosts are known to reject `lychee`'s requests. Prefer the alternative in every new post; add to `.lycheeignore` only when no alternative exists.

| Class | Example | Failure | Preferred alternative |
|---|---|---|---|
| ACM Digital Library | `https://dl.acm.org/doi/10.1145/...` | 403 Forbidden — ACM blocks non-browser user agents by policy | `https://doi.org/10.1145/...` (DOI proxy) |
| IEEE Xplore | `https://ieeexplore.ieee.org/document/...` | 403/418 without authentication | `https://doi.org/10.1109/...` (DOI proxy) |
| University preprint hosts | `https://web.eecs.umich.edu/~author/paper.pdf`, `https://cs.stanford.edu/~author/...` | TLS `UnknownIssuer` — university CA chains drift on GitHub runners | `https://doi.org/...` (DOI proxy) if the paper is published; publisher landing page otherwise |
| LinkedIn profiles | `https://linkedin.com/in/handle` | 999 (LinkedIn's anti-bot signal) — already accepted via `--accept 999` in `ci.yml`, but flag if that accept list is removed | Keep as-is with the `--accept 999` list; do not add elsewhere |
| Login-walled pages | `https://twitter.com/user/status/...` (post-2023), private GitHub gists | Redirects to a login page that returns a different status | Prefer a public archive (`web.archive.org`) or omit |

## What to do at authoring time

1. **Before shipping any post that adds external URLs**, run `/verify` — its step-3 lychee gate catches these classes before CI does. If Docker isn't running, start it; do not skip the step.
2. **When citing a published paper**, use `https://doi.org/<doi>` in the post itself — DOIs are canonical, permanent, and read cleanly. But be aware: **lychee matches ignore patterns against the starting URL, not the redirect chain.** If the DOI redirects to a fragile host (ACM, IEEE Xplore, etc.), the doi.org URL will *itself* fail lychee. In that case add a specific `^https?://doi\.org/<doi>$` line to `.lycheeignore` with a comment naming the terminal host. Look the DOI up on Google Scholar, Semantic Scholar, or the publisher's landing page.
3. **When citing a non-paper resource** (spec, standard, docs), prefer the canonical location on a stable host (`w3.org`, `datatracker.ietf.org`, `learn.microsoft.com`, `en.wikipedia.org`) over a personal blog mirror.
4. **When no stable alternative exists** and the URL is genuinely load-bearing for the post, add the host pattern to `.lycheeignore` with a comment explaining the failure class, and note it in the PR description.

## What to do at review time (hugo-reviewer)

- Any new external URL matching a fragile-class row in the table above → **Should Fix** with the DOI-proxy or canonical alternative.
- A new `.lycheeignore` entry without a comment explaining the failure class → **Should Fix**.
- No `/verify` run reported in the PR description when the diff adds external URLs → **Should Fix**.

## Signal recap

| Signal | Action |
|---|---|
| `dl.acm.org` URL in a post | Rewrite to `doi.org/10.1145/...` |
| `ieeexplore.ieee.org` URL in a post | Rewrite to `doi.org/10.1109/...` |
| `.pdf` URL on a `.edu` host | Look up the DOI; rewrite. Add host to `.lycheeignore` only as backstop |
| Bare `linkedin.com/in/*` outside `--accept 999` scope | Confirm the accept list is still in `ci.yml` or ignore |

## When this rule fires

- Any `Write` or `Edit` under `content/` that introduces a Markdown link with an `http(s)://` scheme.
- Any `hugo-reviewer` invocation — the reviewer must run the signal table against the diff.
- Any `Edit` to `.lycheeignore` — new entries need a comment naming the failure class.

## Report as

- **Should Fix** — a fragile-class URL was added when a DOI or canonical alternative exists.
- **Consider** — a `.lycheeignore` entry has a comment but the comment is terse (add why the class fails, not just that it does).
