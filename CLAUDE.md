# omarcrosby.com — Project Instructions

## ICP (feature-skeptic anchor)

This is Omar Crosby's personal website — a single-author static blog. The audience is Omar's professional network and search visitors. It is **not** a multi-tenant platform, a themable CMS, or a shared publishing tool. When `rules/feature-skeptic.md` fires, use this line as the ICP: "one author, publishing infrequently, to a personal audience."

## Stack

- **Hugo** (extended) — static site generator
- **Theme**: `themes/puppet` — git submodule from [`roninro/hugo-theme-puppet`](https://github.com/roninro/hugo-theme-puppet)
- **Container**: multi-stage `Dockerfile` → `nginx:alpine` on port 8080
- **Hosting**: [Fly.io](https://fly.io) — app `omarcrosby-com`, region `iad`
- **DNS**: AWS Route 53 → Fly shared IPs
- **CI/CD**: GitHub Actions — `ci.yml` (PR gates) and `release.yml` (semantic-release → tag → Fly deploy)
- **Versioning**: [`jedi-knights/go-semantic-release`](https://github.com/jedi-knights/go-semantic-release) driven by Conventional Commits

## Hard Constraints

### Hugo version is pinned `< 0.128.0`

The puppet theme uses `resources.ToCSS`, which was removed in Hugo 0.128+. Both `Dockerfile` and `.github/workflows/ci.yml` pin **`0.127.0`**. **Do not upgrade Hugo without first migrating the theme's SASS pipeline to `css.Sass`.**

The local Homebrew Hugo (currently 0.160.1) will fail to build this site. Use one of:

```bash
docker build -t omarcrosby-com .              # container preview
docker run --rm -p 8080:8080 omarcrosby-com   # then visit http://localhost:8080
```

or install a pinned Hugo via `go install github.com/gohugoio/hugo@v0.127.0` (needs `CGO_ENABLED=1` + the extended tag) or `asdf`/`mise` version pinning.

See `.claude/rules/hugo-version-lock.md`.

### `themes/puppet/` is read-only

It is a git submodule pointing at an upstream repo. **Never edit files inside `themes/puppet/`.** To customize a theme file, copy it to the same relative path under the site root — Hugo's lookup order gives `layouts/`, `assets/`, `static/`, and `i18n/` at the site root priority over the theme. See `.claude/rules/theme-immutable.md`.

### Content front matter

Every file under `content/` must have title, date, and draft fields. See `.claude/rules/content-frontmatter.md`.

## Commit Discipline

- Follow global Conventional Commits (see `~/.claude/CLAUDE.md`).
- **Release-triggering** commit types: `feat`, `fix`, and breaking-changes (`!` or `BREAKING CHANGE:` footer). These bump the version and cut a Fly deploy.
- **Non-release** commit types: `docs`, `chore`, `style`, `refactor`, `test`, `build`, `ci`, `perf`. Merged, but the release workflow no-ops.
- One PR = one `type(scope)` pair — global rule applies.

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

- `.claude/rules/hugo-version-lock.md` — do not upgrade Hugo above 0.127.x
- `.claude/rules/theme-immutable.md` — override at site level, never edit the submodule
- `.claude/rules/content-frontmatter.md` — required Hugo front matter
- `.claude/commands/new-post.md` — `/new-post <title>` scaffolder
- `.claude/commands/preview.md` — `/preview` local Docker preview
- `.claude/commands/verify.md` — `/verify` runs CI gates locally
- `.claude/agents/hugo-reviewer.md` — review Hugo content and layout changes
- `.claude/skills/hugo-authoring/SKILL.md` — auto-triggers on `content/**/*.md`

## Repo Map

```
├── content/            # Hugo content (Markdown + front matter) — YOU own this
├── layouts/            # Site-level layout overrides — takes precedence over theme
├── assets/             # Site-level assets (SASS, JS) — takes precedence over theme
├── static/             # Files copied verbatim to public/ root
├── data/               # Hugo data files (YAML/JSON/TOML)
├── i18n/               # Translation strings
├── archetypes/         # Templates for `hugo new`
├── themes/puppet/      # SUBMODULE — read-only
├── public/             # BUILD OUTPUT — gitignored
├── resources/          # Hugo cache — gitignored
├── Dockerfile          # Multi-stage build
├── nginx.conf          # Serves public/ + www→apex redirect
├── fly.toml            # Fly.io app config
├── config.toml         # Hugo site config
├── .semantic-release.yaml
└── .github/workflows/  # ci.yml, release.yml
```
