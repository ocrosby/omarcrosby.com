# Design Voice

Every visual surface on this site should look like the same person designed it — including the ones Claude touches when adding a new layout, extending a CSS file, or scaffolding a standalone tool under `static/`. The failure mode this rule guards against is generic "AI design voice": a layout that is technically correct, accessibility-clean, and indistinguishable from a thousand other PaperMod-with-tweaks blogs. That design is fluent but flat. It uses cool-grey defaults, adds a hero banner where the site anchors on a top-left avatar, introduces a bright saturated accent that breaks the warm-earth family, or ships a hover state that flips to a different color instead of deepening the identity.

This rule was derived by reading the site's existing visual surfaces — `assets/css/extended/brand-warmth.css`, `assets/css/extended/profile-hero.css`, `layouts/baseof.html`, `layouts/list.html`, `layouts/_partials/index_profile.html`, `layouts/_partials/extend_head.html`, and `static/tools/dev-qa-load/index.html` — and extracting the concrete, recurring design decisions. It is not a transplant of any third-party detector catalog; every claim below is grounded in a file:line that proves the pattern already exists.

## The voice, characterized

- **Warm-earth palette, mode-tuned terracotta accent.** Dark mode: `#c26a5a` on `rgb(32, 29, 27)` warm brown-black (`brand-warmth.css:34-59`). Light mode: `#a8583e` on `rgb(253, 249, 244)` warm cream (`brand-warmth.css:63-82`). Every accent choice names its WCAG AA contrast ratio inline (4.39:1 dark, 4.85:1 light). A new color enters the site only as an addition to this family, never as a replacement.

- **Fraunces humanist serif for `h1`–`h3` only; body stays system sans.** `brand-warmth.css:144-155`. The h4/h5 fall back to sans deliberately — the comment names why: *"the serif starts to feel heavy below h3."* Any new heading rule that runs the serif past h3 needs its own named reason.

- **Depth via gradient + softened warm-tinted shadows, not hard color blocks.** A 180deg two-stop body gradient (`brand-warmth.css:174-181`), warm-tinted `box-shadow: 0 1px 3px rgba(64, 30, 18, 0.12)` on cards. The intent comment names it: *"reads as quiet dimension not designed gradient."* Hard-offset shadows (`box-shadow: 4px 4px 0`) or flat enclosed borders break this.

- **Hover states deepen contrast toward `--accent-strong`; they never flip to a different color family.** `brand-warmth.css:113-117, 194-198, 208-211`. Links, cards, buttons — every interaction moves within the terracotta family. The failure mode this prevents: a hover that goes blue because "blue means link" is the default AI instinct.

- **Avatar-not-banner on landing. Top-anchored, not viewport-centered.** `profile-hero.css:22-37`. Explicit choice: `align-items: flex-start`, max-width 260px, round clip. The comment names the intent: *"reads as an avatar rather than a page banner."* Hero-image banners are the generic-blog default; this site is deliberately not that.

- **Standalone HTML tools under `static/` mirror the palette via commented cross-references, not duplication-by-copy.** `static/tools/dev-qa-load/index.html:21-48` sets `--bg`, `--panel`, `--ink`, `--accent` with inline `/* matches site --theme */` and `/* See assets/css/extended/brand-warmth.css */` comments. A new tool page that invents its own palette breaks the identity; one that mirrors without the cross-reference comment silently invites drift.

- **Data-viz hues stay warm-family and name their roles.** `dev-qa-load/index.html:38-45`: muted natural green (`#7fa370`) is `--dev`, warm plum (`#a084b8`) is `--qa`, warm amber (`#d4a548`) is `--warn`, deep rust (`#b04a35`) is `--danger`. Bright primary RGB (`#00ff00`, `#ff0000`, `#0000ff`) would break the identity. Named roles get named colors with intent comments.

- **Every override of a PaperMod theme file documents its diff from upstream.** `baseof.html:1-33`, `list.html:1-23`, `index_profile.html:1-21`, `extend_head.html:1-14`. The opening comment names the structural change, the reason, and the re-diff trigger. A copied-then-silently-modified theme file is the failure mode this prevents.

- **Every CSS block carries a comment naming the WHY, not the WHAT.** `brand-warmth.css` opens with a full-file preamble (lines 1-30) describing intent and fallback behavior. Every subsequent section has a short comment explaining purpose, not restating the selectors. A new rule without an intent comment is a Should Fix.

- **Resource loading is section-guarded, not site-wide.** `extend_head.html:53-56` gates YouTube preconnects to `.Section == "music"`. Any new resource hint (preconnect, preload, prefetch, Google Fonts URL) that fires globally for a surface used by one section is a Should Fix — the pattern to copy is the YouTube one.

## Recognition signals

| Signal | Fix |
|---|---|
| New CSS or inline style introduces a cool grey (`#888`, `rgb(128, 128, 128)`), pure black (`#000`), or pure white (`#fff`) | Replace with a value from `brand-warmth.css` (`--theme`, `--primary`, `--content`, `--secondary`) — the warm-earth family is the identity, not a default to override |
| A new accent color is introduced outside the terracotta pair (`#c26a5a` / `#a8583e`) with no WCAG contrast-ratio comment next to it | Either reuse `--accent` / `--accent-strong` / `--accent-soft`, or add an inline comment naming the contrast ratio and why the new hue exists |
| A new `h4`/`h5` rule runs Fraunces past h3 | Add a named reason in the comment or keep the sans fallback — the existing boundary is intentional (`brand-warmth.css:153`) |
| A new hover state flips to a different color family (link goes blue, button goes green) | Rewrite the hover to move toward `--accent-strong` — identity-preserving transitions are the house style |
| New `box-shadow` is hard-offset or uses a bright color (`4px 4px 0 black`, `0 0 10px red`) | Replace with warm-tinted low-opacity shadow matching `rgba(64, 30, 18, 0.12)` or similar — depth is quiet, not announced |
| A new section introduces a full-width hero banner image on landing | Keep the top-anchored small-avatar pattern unless this is a content page where a banner is genuinely load-bearing (post cover is fine; a landing banner is not) |
| A new standalone HTML tool under `static/` sets its own `--bg` / `--accent` with no `/* matches site --theme */` cross-reference | Add the cross-reference comment pointing at `assets/css/extended/brand-warmth.css` |
| A new standalone HTML tool uses bright primaries for data viz (`#ff0000`, `#00ff00`, pure RGB) | Pick warm-family hues that extend the palette (muted green, warm plum, warm amber, deep rust) and name the role each hue represents in a comment |
| A `layouts/` file overrides a PaperMod template with no top-of-file diff comment vs upstream | Add a block comment naming the diff and the re-diff trigger — same shape as `baseof.html`, `list.html`, `index_profile.html` |
| A CSS block or `<style>` section has no block comment explaining intent | Add a 1–3 line comment naming the WHY — matches the existing convention across every file in `assets/css/extended/` |
| A resource hint (`preconnect`, `preload`, Google Fonts) fires site-wide for a surface used by one section | Gate the hint on `.Section == "<name>"` — mirrors the YouTube pattern at `extend_head.html:53-56` |
| A visual-only CSS/layout change is proposed with commit type `chore` | Change to `feat` or `fix` per `CLAUDE.md` commit discipline — UI-visible changes trigger the Fly deploy; `chore` does not |

## Mandatory behaviors

**When adding or editing visual surfaces** (`assets/css/**`, `layouts/**`, standalone HTML under `static/`, inline `<style>` in content, inline `style="..."` attributes): apply the recognition signals above before considering the diff done. Specifically check palette, hover direction, shadow style, and the override-comment convention — those four cover the common failure modes.

**When adding a new accent color or data-viz hue:** name the role it represents (`--dev`, `--qa`, `--warn`, `--danger` already set the precedent) and include either an inline WCAG contrast-ratio comment or a comment anchoring it to the warm-earth family. A hex without justification is a Should Fix.

**When overriding a PaperMod theme file for the first time:** copy it to the site-level override path (per `theme-immutable.md`) and add the standard top-of-file comment naming the diffs vs upstream and the re-diff trigger. Mirrors `baseof.html:1-33`.

**When extending a standalone HTML tool under `static/`:** mirror the palette via commented cross-reference to `brand-warmth.css`. Do not re-derive the color values from the current page's rendering; read them from `brand-warmth.css` directly.

## Pragmatism guard

Do not apply this rule when:

- **The change is to PaperMod's submodule itself** (`themes/PaperMod/**`) — that's a `theme-immutable.md` violation first; this rule doesn't fire because the submodule is immutable.
- **The change is purely prose or front matter** under `content/**/*.md` with no inline HTML, CSS, or style attributes. That's `writing-voice.md`'s territory.
- **The diff only adds behavior inside a shortcode or theme-provided class** where the visual is inherited from PaperMod and the identity already matches. No override is being authored, so no rule firing is needed.
- **The user explicitly requests a different design register** (a throwaway demo page, a reproduction of an external design for comparison). Follow the explicit request; this rule holds for the site's own surfaces, not for paste-ins the user clearly framed as external.
- **The diff is a deliberate palette evolution** the user is rolling out across the site. In that case the file:line references in this rule will go stale; update the rule in the same PR and treat the migration as the rule's new baseline.

## When this rule fires

- Any `Write` or `Edit` under `assets/css/**`.
- Any `Write` or `Edit` under `layouts/**` that changes HTML structure, class usage, or inline styling (pure template-logic edits that don't affect rendered output are exempt).
- Any `Write` or `Edit` under `static/tools/**` or any `static/**/*.html` that adds visual surface.
- Any `Write` or `Edit` under `content/**/*.md` that introduces raw HTML or inline `style="..."` attributes with visual effect.
- Any `hugo-reviewer` invocation whose diff touches the paths above — the reviewer still refuses taste feedback (per `hugo-reviewer.md:93`), but should surface a one-line pointer to this rule.

## Report as

- **Must Fix** — the diff introduces a hard-offset shadow, a bright primary color, or a hover color flip. These break the identity at the first-glance level, not at the audit level.
- **Should Fix** — the diff introduces two or more recognition signals (palette drift, missing override comment, missing standalone-tool cross-reference, undocumented hue). The site's identity is coherent enough that each individual slip is small; in combination they're visible.
- **Consider** — the diff is identity-consistent but a specific choice (a spacing value, a border radius, a single color stop) feels slightly off and could be nudged. These are preferences; name them as such.

## Not covered by this rule

- **Prose voice in posts** — see `writing-voice.md`.
- **Markdown italic/bold delimiter consistency** — see `markdown-emphasis-style.md`.
- **Theme-file-vs-override discipline** — see `theme-immutable.md`.
- **Hugo front matter correctness** — see `content-frontmatter.md` and `per-post-og-image.md`.
- **Accessibility correctness** (alt text, heading order, semantic HTML) — this is correctness, handled by `hugo-reviewer` plus `docs-principles.md` recognition signals, not taste. If accessibility and this rule conflict (a hover that meets contrast but this rule flags the color flip), accessibility wins.
- **External URL hygiene** — see `external-link-hygiene.md`.
- **Impeccable or any specific third-party tool's gotchas** — if one is adopted later, its gotcha rules live in their own file (likely `impeccable-usage.md`). This rule names the site's identity, not the toolchain.
