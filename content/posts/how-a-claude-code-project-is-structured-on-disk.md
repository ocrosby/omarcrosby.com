+++
title = "How a Claude Code project is structured on disk"
date = "2026-08-04T06:02:47-04:00"
draft = false
description = "A file-by-file walkthrough of the project-scoped Claude Code layout — CLAUDE.md, .mcp.json, settings, rules, commands, skills, subagents, and hooks — and the team-shared / personal-local split behind every file."
summary = "A file-by-file walkthrough of the project-scoped Claude Code layout — CLAUDE.md, .mcp.json, settings, rules, commands, skills, subagents, and hooks — and the team-shared / personal-local split behind every file."
tags = ["claude-code", "ai-assisted-development", "developer-tools", "productivity"]
categories = ["Claude Code"]
ShowToc = true

[cover]
image = "/images/og/how-a-claude-code-project-is-structured-on-disk.png"
hiddenInList = true
hiddenInSingle = true
+++

An earlier post on this site, <a href="/posts/the-anatomy-of-a-claude-code-configuration/">*The anatomy of a Claude Code configuration*</a>, defined every primitive Claude Code exposes — `CLAUDE.md`, rules, settings, skills, slash commands, subagents, hooks, output styles, MCP servers — and explained *what each one is*. This post is the companion to it. Instead of defining the primitives, it walks the layout on disk when those primitives are scoped to a single project: what belongs inside a repo's `.claude/` directory, why each file lives where it does, and what gets committed to git versus kept personal.

The prompt for this write-up was Luis Rodrigues's excellent LinkedIn infographic titled *Claude Code — Project Structure*. His diagram lays out the pieces cleanly; the section-by-section walk below fills in the reasoning behind each one and points out the couple of places where the on-disk shape is subtler than a single tree can show.

## The two-layer model

Claude Code reads configuration from two layers, and both are always in effect:

- **Global** — `~/.claude/` on your machine. Personal to you, applies to every project.
- **Project** — `.claude/` at the root of any repo you open. Applies only when Claude is working in that directory.

The earlier anatomy post described the primitives as they show up in either layer. **This post is specifically about the project layer.** When you see `.claude/` referenced below, assume it lives at the root of a single repository — one you probably want to check into git so your teammates get the same experience.

The layout, from Luis's infographic:

```text
your-project/
├── CLAUDE.md              ← team-shared, loaded every session
├── CLAUDE.local.md        ← personal, git-ignored (legacy pattern)
├── .mcp.json              ← team-shared MCP server config
└── .claude/
    ├── settings.json          ← team-shared permissions, env, hooks
    ├── settings.local.json    ← personal overrides, git-ignored
    ├── rules/*.md             ← modular always-on guidance
    ├── commands/*.md          ← project-scoped slash commands
    ├── skills/<name>/SKILL.md ← project-scoped auto-triggerable workflows
    ├── agents/*.md            ← project-scoped subagents
    └── hooks/*.sh             ← shell scripts referenced from settings.json
```

Two files live at the repo root (`CLAUDE.md` and `.mcp.json`); everything else nests under `.claude/`. That split isn't arbitrary — it reflects what each file is scoped to. `CLAUDE.md` is prose Claude reads on every prompt, so it sits next to your `README.md` where humans expect prose. `.mcp.json` configures process spawning at the project boundary, so it sits at the root where other project-boundary configs live. Everything under `.claude/` is Claude-specific machinery — permissions, workflows, hooks — so it clusters under a single dot-directory the way `.github/` clusters CI configuration.

## `CLAUDE.md` — the file Claude reads first

**Where it lives.** At the root of the repo, alongside `README.md`.

**What it does.** The harness reads it at the start of every session and injects the contents into Claude's system prompt. Whatever you put here is always on for anyone who opens the project.

**What belongs in it.** The things every contributor to the project should have on tap:

- The project's purpose in a sentence or two.
- The tech stack, especially the parts that constrain how code should be written (framework version, language mode, style guide).
- Any convention that would surprise a competent developer coming in cold: "we don't use classes here," "all migrations are reversible," "tests run via `just test`, not `npm test`."
- The location of internal-to-the-repo primitives — where hooks live, where rules live, which slash commands the team relies on.
- Any hard "don't do this" that a new contributor (human or AI) should learn on their first day.

**What does not belong.** Anything specific to *you* — your personal keybindings, your preferred verbosity, your workflow tics. Those go in the global `~/.claude/CLAUDE.md` (or in a personal-local file — see the next section).

**Rule of thumb.** If a new teammate would need to know it to be productive in the repo, it belongs in `CLAUDE.md`. If only you would need to know it, it doesn't.

## `CLAUDE.local.md` — the personal-local overlay

Luis's infographic includes this file, and it's worth explaining carefully because Anthropic changed its recommendation here.

**Historically**, `CLAUDE.local.md` was the git-ignored counterpart to `CLAUDE.md` — a place to keep project-specific notes that were personal to you (an API token you keep in your shell, a local database path, a personal reminder that only made sense for your workflow). The file lived at the repo root next to `CLAUDE.md`, was listed in `.gitignore`, and was loaded automatically.

**The current supported pattern** is to import a personal file into your team `CLAUDE.md` explicitly, with an `@` reference on a line by itself:

```markdown
@./CLAUDE.local.md
```

The behavior is the same — a personal-local overlay is layered on top of the team-shared file — but the mechanism is now explicit rather than implicit. Either shape works today. If you're starting fresh, prefer the `@import` form; it survives configuration-loader changes better because it's part of your `CLAUDE.md` on purpose rather than by convention.

**When you actually need one.** Less often than you'd think. Most project-specific personal preferences (a model choice, a permission override) belong in `.claude/settings.local.json` instead. Reserve the personal Markdown overlay for genuine *prose* — a paragraph of context you want Claude to have that the team doesn't need.

## `.mcp.json` — team-shared MCP server config

**Where it lives.** At the repo root.

**What it does.** Declares the MCP servers the project uses — GitHub, Jira, Slack, a database, a monitoring dashboard, an internal API — so any teammate cloning the repo gets the same tool wiring.

**What it looks like.** JSON declaring each server, its transport (typically stdio via `npx` or an executable), and any command-line arguments:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    }
  }
}
```

**Why it lives at the root, not under `.claude/`.** MCP servers are processes the harness launches on session start. They are a *project-boundary* concern — the same way `Dockerfile`, `docker-compose.yml`, `.tool-versions`, and `.nvmrc` are. Keeping them at the root makes them discoverable by tools other than Claude Code (some IDE integrations read `.mcp.json` directly) and consistent with how the rest of the ecosystem places boundary configuration.

**What to check in vs keep out.** The connection shape and non-secret args go in `.mcp.json`. Secrets — API tokens, database passwords — go in your environment, referenced from the MCP server's own configuration. Never commit tokens.

## `.claude/settings.json` — team-shared harness config

**Where it lives.** Under `.claude/` at the repo root. **Checked into git.**

**What it does.** Tells the harness — not Claude — what to allow and how to behave when working in this project. The main knobs:

- **Permissions.** Command patterns Claude may run without asking (`allow`), or must never run (`deny`). Project-scoped permissions layer on top of the global ones — an `allow` list here extends what's allowed *specifically in this repo*.
- **Environment variables.** Values injected into every session run against this project.
- **Hooks.** Which shell scripts fire on which lifecycle events (`SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, …). This is where hooks are *configured*; the scripts themselves live in `.claude/hooks/` (or wherever the config points).
- **Model choice.** A default model for this project, if it differs from your personal default.
- **Additional directories.** Extra folders the harness may read alongside the project root.

**When to reach for it.** Any time the change is about *what the harness allows or does automatically in this repo*, and you want teammates to inherit the same behavior.

## `.claude/settings.local.json` — personal overrides

**Where it lives.** Under `.claude/`. **Listed in `.gitignore`.**

**What it does.** Overrides `.claude/settings.json` with values personal to you. Its most common uses are:

- Personal permission grants that shouldn't leak into the team config ("I trust `rg` broadly, but the team hasn't agreed on that").
- Personal model preferences.
- Local environment variables — a personal API key, a machine-local port.

**When to use it.** Whenever you'd change a project setting for your own workflow but you can't or shouldn't ask teammates to adopt the same change.

The pair of files — `settings.json` shared, `settings.local.json` personal — mirrors the `CLAUDE.md` / `CLAUDE.local.md` split. Anything the whole team should get, commit. Anything only you should get, keep local and ignored.

## `.claude/rules/` — modular always-on guidance

**Where it lives.** `.claude/rules/*.md`. Checked into git.

**What it does.** Each `.md` in `rules/` is a self-contained piece of guidance — a single topic — that the team wants Claude to treat as always-on knowledge. Common examples: `commit-messages.md`, `error-handling.md`, `api-conventions.md`, `pr-discipline.md`.

Rules are **not a first-class Claude Code primitive**. They're a community convention that emerged because `CLAUDE.md` sprawls badly once it grows past a page — mixing tone-of-voice notes, tech-stack facts, security warnings, and workflow reminders in one document that nobody wants to re-read to change a single line. Splitting each concern into its own file keeps every rule editable in isolation, easy to retire without wading through unrelated content, and easy to review as a diff.

**How they're loaded.** `CLAUDE.md` pulls the rules it wants in with `@` imports:

```markdown
@./.claude/rules/commit-messages.md
@./.claude/rules/api-conventions.md
```

The effect on Claude is identical to putting the same text inline in `CLAUDE.md`. The difference is entirely maintenance — one topic per file, imports listed in one place, and each rule's diff history stays clean.

**When to reach for a rule file.** When your project's `CLAUDE.md` starts covering more than one topic. The rule of thumb I've settled into: if I'd give the guidance a heading of its own inside `CLAUDE.md`, it deserves its own file.

## `.claude/commands/` — project-scoped slash commands

**Where it lives.** `.claude/commands/*.md`. Checked into git.

**What it does.** Each Markdown file becomes a slash command available inside the project. A file at `.claude/commands/review.md` produces a `/review` command; `.claude/commands/deploy.md` produces `/deploy`.

**Anatomy of a command file.** A short YAML frontmatter block declaring the description and (optionally) an argument hint, followed by the prompt body:

```markdown
---
description: "Review the current diff against our style guide."
argument-hint: "<optional-scope>"
---

Review the diff in $ARGUMENTS against the conventions in
@./.claude/rules/style-guide.md. Report findings using the
three-bucket format (Must Fix / Should Fix / Consider).
```

The prompt supports three interpolations worth knowing about:

- `$ARGUMENTS` — whatever the user typed after the command name.
- `!command` — inlines the stdout of a shell command at expansion time.
- `@path/to/file` — inlines the file's contents.

**When to reach for a command.** When there's a workflow you'd type into Claude the same way every time. Small, deterministic, invoked by name: `/pr-title`, `/explain-diff`, `/deploy-staging`, `/generate-migration`.

**Team-shared vs personal.** Commands under `.claude/commands/` are project-scoped and shared with the team via git. Commands you want only for yourself go in `~/.claude/commands/` (global) — they're then available across every project.

## `.claude/skills/<name>/SKILL.md` — project-scoped skills

**Where it lives.** `.claude/skills/<skill-name>/SKILL.md`, with optional supporting files in the same folder. Checked into git.

**What it does.** A skill is a slash command's more capable cousin. It's a folder rather than a single file, its Markdown carries structured frontmatter with a `description` that Claude uses to *auto-trigger* the skill when the task matches, and it can bundle scripts, reference data, and sub-documents beside its prompt.

**Why the folder form matters.** A slash command is a single Markdown file. A skill is a directory:

```text
.claude/skills/testing-patterns/
├── SKILL.md
├── scripts/detect-framework.sh
└── reference/black-box-testing.md
```

That structure buys three things a bare command can't offer:

- **Auto-invocation.** The harness reads only skill `description` fields at session start (so they're cheap in context), and can trigger a skill when the description matches what you're doing — no `/skill-name` typing required.
- **Deterministic steps as scripts.** The Markdown handles judgment; the scripts handle the parts of the workflow that would produce the same output every time. Every step Claude runs as a script is a step it doesn't burn tokens reasoning through.
- **Reference material next to the prompt.** Long documents the skill occasionally consults sit beside `SKILL.md` and get loaded only when the workflow's branch calls for them.

**When to promote a command to a skill.** As soon as the workflow needs supporting files, needs to be auto-triggered by context, or would benefit from offloading deterministic work to scripts. If it's a one-liner prompt with no supporting material, keep it as a command.

## `.claude/agents/` — project-scoped subagents

**Where it lives.** `.claude/agents/*.md`. Checked into git.

**What it does.** Defines a subagent — a separately-configured Claude that runs in its own private context window. The main session can hand a task off to a subagent, wait for it to finish, and get back a summary instead of the full transcript. Frontmatter declares the agent's name, when to use it, an optional restricted tool list, and an optional model choice; the Markdown body becomes the agent's system prompt.

```markdown
---
name: code-reviewer
description: Review code for correctness and idiomatic style. Read-only.
tools: [Read, Grep, Glob, Bash]
model: haiku
---

You are a code reviewer. Report findings using the three-bucket format
(Must Fix / Should Fix / Consider) …
```

**When to reach for a subagent.**

- **Context hygiene.** The task will pull in a lot of noise (search results, logs, sprawling code) that the main session doesn't need to remember afterwards. Do it in a subagent; the main context sees only the summary.
- **Focused expertise.** A "security auditor" subagent can carry a system prompt tuned entirely for review and can be restricted to read-only tools so it cannot accidentally edit anything.
- **Cost control.** A subagent can be pinned to a faster, cheaper model for narrow work while the main session stays on your preferred model.

**Team-shared vs personal, again.** Agents under `.claude/agents/` are for workflows the whole team should have. Personal agents go in `~/.claude/agents/`.

## `.claude/hooks/` — deterministic event scripts

**Where it lives.** `.claude/hooks/*.sh` by convention. Checked into git.

**What it does.** Holds the shell scripts that fire on lifecycle events. But — and this is the piece Luis's diagram compresses — **hooks are configured in `.claude/settings.json`, not by their presence on disk**. Dropping `.claude/hooks/lint.sh` into the folder doesn't wire it up. Something like this in `settings.json` does:

```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "Edit|Write", "hooks": [{ "command": ".claude/hooks/lint.sh" }] }
    ]
  }
}
```

The scripts can live anywhere the config points; `.claude/hooks/` is a convention that keeps them collocated with the settings that reference them.

**What hooks buy you.** Deterministic behavior the harness enforces regardless of what Claude decides. A `PreToolUse` hook that blocks `rm -rf` will block it whether or not Claude "agrees." A `PostToolUse` hook that runs a formatter after every edit will format whether or not Claude remembers to. A `SessionStart` hook that injects today's git branch will inject it every session.

The mental model: **hooks are the parts of your policy that must not depend on the model choosing to enforce them.**

## The team-shared / personal-local split

The single most useful lens for reading the whole tree is which files are shared with teammates and which are personal:

| Shared with the team (committed)               | Personal-local (git-ignored)                    |
|------------------------------------------------|-------------------------------------------------|
| `CLAUDE.md`                                    | `CLAUDE.local.md` (or `@import` from `CLAUDE.md`) |
| `.mcp.json`                                    | *(none — secrets stay in env, never in a file)* |
| `.claude/settings.json`                        | `.claude/settings.local.json`                   |
| `.claude/rules/*.md`                           | *(personal rules go in `~/.claude/rules/`)*     |
| `.claude/commands/*.md`                        | *(personal commands go in `~/.claude/commands/`)* |
| `.claude/skills/<name>/`                       | *(personal skills go in `~/.claude/skills/`)*   |
| `.claude/agents/*.md`                          | *(personal agents go in `~/.claude/agents/`)*   |
| `.claude/hooks/*.sh`                           | *(personal hooks go in `~/.claude/`)*           |

The pattern is consistent: everything under `.claude/` in a project is the team's contract with Claude. Anything that's yours alone belongs in the global layer, or in a `.local.json` / `.local.md` sibling if it truly must be scoped to the project.

## A worked example — this site's own `.claude/` overlay

To make the layout concrete, here's what the project layer looks like on this site's repo (<a href="https://github.com/ocrosby/omarcrosby.com" target="_blank" rel="noopener">ocrosby/omarcrosby.com</a>):

```text
omarcrosby.com/
├── CLAUDE.md                       ← Hugo pin, per-post OG image rule, /verify pre-flight
└── .claude/
    ├── rules/
    │   ├── theme-immutable.md      ← never edit files under themes/PaperMod/
    │   ├── content-frontmatter.md  ← required TOML front matter
    │   ├── per-post-og-image.md    ← every post gets its own OG PNG
    │   ├── per-song-og-image.md    ← every music entry gets its own OG JPG
    │   ├── now-page-updated-timestamp.md
    │   ├── recipes-rss-feed.md
    │   ├── markdown-emphasis-style.md
    │   ├── hugo-config-urls.md
    │   ├── turbo-frame-static-link.md
    │   └── external-link-hygiene.md
    ├── commands/
    │   ├── new-post.md             ← /new-post <title> scaffolder
    │   ├── preview.md              ← /preview local Docker build
    │   ├── verify.md               ← /verify runs CI gates locally
    │   ├── add-music.md            ← /add-music <youtube-url>
    │   ├── sync-recipes.md
    │   └── randomize-music.md
    ├── skills/
    │   └── hugo-authoring/SKILL.md ← auto-triggers on edits under content/
    └── agents/
        └── hugo-reviewer.md        ← reviews Hugo content and layout changes
```

Every file in there earns its keep. The rules encode invariants the site's build depends on — a violated `per-post-og-image.md` ships a post whose LinkedIn preview shows the wrong image; a violated `markdown-emphasis-style.md` fails the whole markdownlint job on every open PR. The commands are the operations I run often enough to want a single token for. The skill auto-triggers when I edit anything under `content/` so I don't have to remember front-matter conventions on a Sunday afternoon. The agent is a specialized reviewer with a read-only tool list, called on demand for cross-cutting review work I don't want cluttering the main conversation.

None of that was designed up front. Every file went in the first time I typed the same instruction into Claude for the third time, or the first time I shipped a bug that a hook could have caught. The project's `.claude/` layout is a record of what I've noticed about this specific codebase.

## Start small, add on evidence

The pattern that produces useful project setups isn't ambitious scaffolding. It's:

1. A single `CLAUDE.md` at the root, three or four paragraphs, capturing what a new contributor needs to know.
2. One command in `.claude/commands/` for the workflow you're tired of retyping.
3. One hook in `.claude/settings.json` that blocks a class of mistake you've already made twice.
4. A rule file the first time `CLAUDE.md` grows a section heading that reads like a topic in its own right.
5. A skill the first time a command needs a script beside its prompt.
6. A subagent the first time a task pulls so much noise into context that you don't want to see it afterward.

Every step is a response to something the project actually asked for. A project-scoped `.claude/` directory grown that way is small, opinionated, and worth the disk it takes up. One grown from a template, before any of the primitives have earned their place, is just clutter.

---

*Thanks to Luis Rodrigues — whose LinkedIn infographic on Claude Code project structure prompted this post — and to the readers of the earlier <a href="/posts/the-anatomy-of-a-claude-code-configuration/">anatomy of a Claude Code configuration</a> post who asked what the project-scoped side looked like in practice.*
