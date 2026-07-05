# Project Title Naming

Every `title = "..."` in `content/projects/*.md` front matter is the display name that renders on the projects listing and page. To keep the listing scannable and internally consistent, all titles must follow the same shape.

## The rules

1. **No dashes.** The repo-slug convention uses `kebab-case.md` filenames (`nasm-lint.md`, `market-bridge.md`), but the display `title` must never contain a `-`. Replace with a space and capitalize each word.
2. **Title case, space-separated words.** Each significant word is capitalized. Articles/prepositions/conjunctions three letters or shorter (`a`, `an`, `the`, `of`, `to`, `in`, `on`, `for`, `and`, `or`) are lowercased **unless** they are the first word.
3. **Preserve acronyms in ALL CAPS.** `NASM`, `API`, `MCP`, `SPX`, `LSP`, `SARIF`, `CLI`, `SDK`, `JSON`, `XML`, `HTTP`, `RPI`, `NWSL`, `ECNL`, `NFL` — do not title-case these to `Nasm` / `Api` / etc. If a title mixes an acronym and regular words, both rules apply: `NASM Lint`, `API Gateway`, `MCP Server`.
4. **Language / framework parentheticals** (`(Go)`, `(Python)`) stay in the display form used by convention. Preserve them verbatim.
5. **Package-identifier parentheticals** (`(yoda.nvim)`) are acceptable when they distinguish the project from a more generic term the title would otherwise share (`Yoda (yoda.nvim)` disambiguates from Star Wars). Do not add them decoratively; only when they carry disambiguation weight.

## Recognition signals

| Signal | Fix |
|---|---|
| `title = "nasm-lint"` | Replace with `title = "NASM Lint"` — dash removed, acronym preserved |
| `title = "market-bridge"` | Replace with `title = "Market Bridge"` — dash removed, title-cased |
| `title = "go-semantic-release"` | Replace with `title = "Go Semantic Release"` — dashes removed, title-cased |
| `title = "ctestprobe"` (fused all-lowercase, no dashes) | Split into logical words + title case: `C Test Probe`. Parallels `NASM Assembly Intro` (acronym + rest) |
| `title = "Something-Else"` | Replace with `title = "Something Else"` — even title-cased dashes are wrong |
| `title = "SOMETHING"` (all-caps for non-acronym) | Replace with `Something` — ALL CAPS is only for genuine acronyms |

## When this rule fires

- Any `Write` creating a new file under `content/projects/`.
- Any `Edit` to the `title = "..."` line of a `content/projects/*.md` file.
- Any `hugo-reviewer` invocation whose diff touches `content/projects/`.

## Report as

- **Should Fix** — a project title contains a dash or is not in title case. The listing is user-facing; consistency is the whole point.
- **Consider** — a title uses a package-identifier parenthetical without disambiguation weight (decorative only).

## Not covered by this rule

- **Front-matter `summary` / `description`** — these are prose; title case does not apply.
- **In-body project name mentions** — inside a project's own body, you may refer to it by its package name in backticks (`` `nasm-lint` ``, `` `market-bridge` ``) — that's a code identifier, not a display title.
- **Blog post titles under `content/posts/`** — those follow the sentence-case convention documented in `.claude/skills/hugo-authoring/SKILL.md`, not this rule.
