# Turbo Frame Static Link

Any Markdown link from a Hugo-rendered page (`content/**/*.md`) to a **static HTML file that lives outside the PaperMod layout tree** — `/tools/*`, `/labs/*`, anything under `static/` that is not wrapped in `<turbo-frame id="content">` — must be authored as raw HTML with `data-turbo-frame="_top"`, not as a plain Markdown link.

Raw HTML in Markdown is allowed here — `hugo.toml` sets `markup.goldmark.renderer.unsafe = true`.

## Why

The site's `layouts/_default/baseof.html` renders `<body data-turbo-frame="content">` around every page. That cascades to every same-origin link click: [Hotwire Turbo](https://turbo.hotwired.dev/) intercepts the click, fetches the target, and looks for a matching `<turbo-frame id="content">` in the response to swap into the current frame. If the response has no such frame, Turbo drops in its **"Content missing"** placeholder — the click looks broken to the visitor even though the target page returned 200 with the correct HTML.

Static tool pages under `static/tools/*` are self-contained HTML documents that do not (and generally should not) know about Turbo. Adding a `<turbo-frame id="content">` wrapper to each one just to make one link work is the wrong shape — it couples the tool to a chrome concern it doesn't otherwise participate in.

Opting the specific link out of the frame swap with `data-turbo-frame="_top"` promotes the click to a full-document navigation — same behavior as an external-origin link. The tool then loads normally, Chart.js and other assets initialize, and back-button behavior is what a visitor expects for a stand-alone tool.

The background is documented in detail in `content/posts/keeping-a-youtube-iframe-playing-across-every-page-with-turbo-frames.md` — read that post for the full explanation of why `data-turbo-frame="content"` cascades from `<body>`.

## The incident this rule prevents

PR #127 introduced `/tools/dev-qa-load/` — a static Chart.js tool under `static/tools/` — and added a plain Markdown link from `/now/`:

```markdown
[Dev/QA team load, management view](/tools/dev-qa-load/)
```

The tool page shipped correctly (Fly deploy succeeded; `curl -I` returned 200; the HTML was fully present). But clicking the link on the live `/now/` page displayed **Content missing** because Turbo tried to swap the tool's HTML into the current `content` frame and found no matching frame in the response. PR #128 fixed it by switching the link to raw HTML with `data-turbo-frame="_top"`.

## The rule

- **Do not use plain Markdown link syntax** (`[label](/tools/...)`) for links to any static HTML page under `static/` that is not wrapped in `<turbo-frame id="content">`.
- **Use raw HTML** with `data-turbo-frame="_top"`:

  ```markdown
  Also new: a small interactive tool — <a href="/tools/dev-qa-load/" data-turbo-frame="_top">Dev/QA team load</a> — that models...
  ```

- **Add an inline HTML comment** immediately after the link naming the reason. Without it, a future editor will "clean up" the raw HTML back to Markdown syntax and re-introduce the bug. Example:

  ```html
  <!-- data-turbo-frame="_top" required — target is a static HTML page with no <turbo-frame id="content"> wrapper; a plain Markdown link would show Turbo's "Content missing" fallback. -->
  ```

- **Cross-origin links** (`https://` on a different origin) do not need this — Turbo already treats them as full-document navigations.

- **Regular content-to-content links** (`content/posts/x.md` → `content/posts/y.md`) do not need this — the destination page is rendered by PaperMod's layouts and carries the same `<turbo-frame id="content">` wrapper, so the frame swap succeeds.

## Signals

| Signal | Fix |
|---|---|
| Markdown link `[label](/tools/...)`, `[label](/labs/...)`, or any `content/**/*.md` link whose target is a file under `static/` | Rewrite as raw HTML with `data-turbo-frame="_top"` + explanatory HTML comment |
| Visitor reports clicking a link and seeing **"Content missing"** or a blank content region | Check if the target is a static HTML page outside the layout tree; if so, apply this rule |
| PR adds a new page under `static/` and a Markdown link to it in the same or adjacent commit | Confirm the link uses raw HTML + `data-turbo-frame="_top"` before merging |
| PR "cleans up" existing raw-HTML links back to Markdown syntax | Reject unless the target now sits under `content/**/*.md` and gets rendered inside the layout tree |

## When this rule fires

- Any `Write` or `Edit` under `content/` that adds or modifies a link whose target path starts with a directory under `static/` (currently `/tools/`, but the rule generalizes to any future `/labs/`, `/demos/`, etc.).
- Any `Write` that adds a new file under `static/` where the same PR or a downstream PR introduces a Markdown link to it.
- Any `hugo-reviewer` invocation whose diff touches `content/**/*.md` with a link to `/tools/`, `/labs/`, or similar static path.

## Report as

- **Must Fix** — a diff introduces a plain Markdown link to a static HTML page outside the layout tree. The link will display "Content missing" on the live site, appearing broken to every visitor.
- **Should Fix** — a raw-HTML link with `data-turbo-frame="_top"` is present but the inline explanatory comment is missing. A future editor will strip the attribute and reintroduce the bug.

## Exceptions

- If the static HTML page is deliberately updated to include a top-level `<turbo-frame id="content">` wrapper (making it participate in the site's Turbo Drive navigation), the plain Markdown link works and this rule does not apply. That is a heavier design decision — the tool page then has to keep the frame ID consistent forever, or every inbound link breaks again. Prefer the `_top` opt-out unless the tool genuinely wants site chrome.

## Not covered by this rule

- **Nav-menu items** in `hugo.toml` — those are wired through PaperMod's header template and follow its own Turbo semantics.
- **External-origin links** (`https://` on any other host) — Turbo already treats these as full-document navigations, no attribute needed.
- **Shortcode-rendered links** (`{{< ref "..." >}}`) — these expand to internal content routes, not static asset paths.
