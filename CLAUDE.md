# omarcrosby.com — Project Instructions

## ICP (feature-skeptic anchor)

This is Omar Crosby's personal website — a single-author static blog. The audience is Omar's professional network and search visitors. It is **not** a multi-tenant platform, a themable CMS, or a shared publishing tool. When `rules/feature-skeptic.md` fires, use this line as the ICP: "one author, publishing infrequently, to a personal audience."

## Stack

- **Hugo** (extended) — static site generator, pinned to **`0.160.1`** in `Dockerfile` and CI
- **Theme**: `themes/PaperMod` — git submodule from [`adityatelange/hugo-PaperMod`](https://github.com/adityatelange/hugo-PaperMod)
- **Container**: multi-stage `Dockerfile` → `nginx:alpine` on port 8080
- **Hosting**: [Fly.io](https://fly.io) — app `omarcrosby-com`, region `iad`
- **DNS**: AWS Route 53 → Fly shared IPs
- **CI/CD**: GitHub Actions — `ci.yml` (PR gates) and `release.yml` (semantic-release → tag → Fly deploy)
- **Versioning**: [`jedi-knights/go-semantic-release`](https://github.com/jedi-knights/go-semantic-release) driven by Conventional Commits

## Hard Constraints

### Hugo pin

Hugo is pinned to `0.160.1` (matches the local Homebrew build). PaperMod supports current Hugo, so — unlike the previous puppet setup — there is no *upper* version bound. Bumps should still land in one PR that updates all three of `Dockerfile`, `.github/workflows/ci.yml`, and this line.

### `themes/PaperMod/` is read-only

It is a git submodule pointing at an upstream repo. **Never edit files inside `themes/PaperMod/`.** To customize a theme file, copy it to the same relative path under the site root — Hugo's lookup order gives `layouts/`, `assets/`, `static/`, and `i18n/` at the site root priority over the theme. See `.claude/rules/theme-immutable.md`.

### Content front matter

Every file under `content/` must have title, date, and draft fields. See `.claude/rules/content-frontmatter.md`.

### Per-post OG image

Every post under `content/posts/` must ship with its own OpenGraph image, not the site-wide `og.png`. Before opening any post PR: run `python3 scripts/generate-og-images.py` and add a `[cover] image = "/images/og/<slug>.png"` block to the post's front matter. The generator is re-runnable; commit the resulting PNG. See `.claude/rules/per-post-og-image.md`.

## Commit Discipline

- Follow global Conventional Commits (see `~/.claude/CLAUDE.md`).
- **Release-triggering** commit types: `feat`, `fix`, and breaking-changes (`!` or `BREAKING CHANGE:` footer). These bump the version and cut a Fly deploy.
- **Non-release** commit types: `docs`, `chore`, `style`, `refactor`, `test`, `build`, `ci`, `perf`. Merged, but the release workflow no-ops.
- One PR = one `type(scope)` pair — global rule applies.

## Pre-Flight Before `/git ship`

This repo has no `package.json`/`go.mod`/`uv.lock` — so `/git ship`'s generic pre-flight table (in `~/.claude/skills/git/`) finds nothing to run and silently skips straight to commit/push. That leaves this repo's actual CI gates (Hugo build, lychee broken-link check, markdownlint, typos) unchecked until the PR is already open. **Run `/verify` before pushing any PR from this repo** — do not rely on `/git ship`'s pre-flight table to catch Hugo/Markdown/link/typo issues, it doesn't know about them.

If checks fail on an already-open PR, don't assume the diff caused it: `markdownlint` and `typos` scan the **entire repo tree**, not just the diff, so a failure can be pre-existing debt on `main` that every open PR inherits. Confirm with `git diff main..<branch> --stat` — if the failing file isn't in that diff, it's pre-existing. Fix it in its own `fix(ci)` PR rather than folding it into the unrelated change, then rebase.

## Local Development

```bash
git submodule update --init --recursive     # first-time only

# Preview
docker build -t omarcrosby-com . && docker run --rm -p 8080:8080 omarcrosby-com

# Slash commands (see .claude/commands/)
/new-post <title>   # scaffold a new post with correct front matter
/preview            # docker build + run in one step
/verify             # run all CI gates locally before pushing

# Manual deploy (bypass release workflow)
flyctl deploy --remote-only
```

## Project-Specific Rules, Skills, Agents

- `.claude/rules/theme-immutable.md` — override at site level, never edit the submodule
- `.claude/rules/content-frontmatter.md` — required Hugo front matter
- `.claude/rules/per-post-og-image.md` — every post gets its own `/images/og/<slug>.png`, generated via `scripts/generate-og-images.py`
- `.claude/rules/hugo-config-urls.md` — `url = "..."` in `hugo.toml` must be root-relative or absolute
- `.claude/commands/new-post.md` — `/new-post <title>` scaffolder
- `.claude/commands/preview.md` — `/preview` local Docker preview
- `.claude/commands/verify.md` — `/verify` runs CI gates locally
- `.claude/commands/add-music.md` — `/add-music <youtube-url>` prepends to `data/music.yaml` and direct-commits to `main`
- `.claude/agents/hugo-reviewer.md` — review Hugo content and layout changes
- `.claude/skills/hugo-authoring/SKILL.md` — auto-triggers on `content/**/*.md`

## Repo Map

```text
├── content/            # Hugo content (Markdown + front matter) — YOU own this
├── layouts/            # Site-level layout overrides — takes precedence over theme
├── assets/             # Site-level assets (SASS, JS) — takes precedence over theme
├── static/             # Files copied verbatim to public/ root
├── data/               # Hugo data files (YAML/JSON/TOML)
├── i18n/               # Translation strings
├── archetypes/         # Templates for `hugo new`
├── themes/PaperMod/    # SUBMODULE — read-only
├── public/             # BUILD OUTPUT — gitignored
├── resources/          # Hugo cache — gitignored
├── Dockerfile          # Multi-stage build
├── nginx.conf          # Serves public/ + www→apex redirect
├── fly.toml            # Fly.io app config
├── hugo.toml           # Hugo site config
├── .semantic-release.yaml
└── .github/workflows/  # ci.yml, release.yml
```
