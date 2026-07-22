+++
title = "The anatomy of a Claude Code configuration"
date = "2026-07-21T22:58:45-04:00"
draft = false
description = "A beginner-friendly tour of every file type that makes up a Claude Code configuration — CLAUDE.md, rules, settings, skills, slash commands, subagents, hooks, output styles, and MCP servers — with a plain-English definition of each and guidance on when to reach for it."
tags = ["claude-code", "ai-assisted-development", "developer-tools", "productivity"]
categories = ["Claude Code"]

[cover]
image = "/images/og/the-anatomy-of-a-claude-code-configuration.png"
hiddenInList = true
hiddenInSingle = true
+++

Claude Code is the terminal-and-editor version of Claude — the one that reads files, runs commands, edits code, and can drive a full development workflow. Out of the box it behaves the same for everyone. But almost every serious user ends up with a **personal configuration**: a folder called `~/.claude/` on their machine that quietly shapes how Claude behaves for *them*.

This post is a plain-language tour of what actually lives in that folder. If you've peeked at someone else's Claude setup on GitHub and felt lost — files called `SKILL.md`, folders named `agents/`, `hooks/`, `output-styles/` — this is the map.

I'll define every term before I use it. The only assumed background is that you've opened Claude Code at least once.

## The one-sentence version

A Claude Code configuration is a collection of small text files, mostly Markdown, that customize three things:

1. **What Claude knows about you** — your preferences, your projects, your conventions.
2. **What Claude is allowed to do** — which commands it can run without asking, which files it must never touch.
3. **What Claude can do on your behalf** — named workflows you can trigger by typing a slash command, or that Claude triggers itself when the moment is right.

Everything else is variations on those three themes.

## Four background terms

Before we tour the components, four words come up constantly. Get these in your head and the rest reads easily.

- **Session** — one conversation with Claude, from the moment you start it to the moment you exit. Each new session is a blank slate unless your configuration loads something at the start.
- **Context window** — Claude's working memory during a session. It has a fixed size (measured in tokens, roughly words), and everything Claude "remembers" in the moment lives inside it.
- **System prompt** — the invisible instructions Claude reads before your first message. This is where a configuration inserts its personality, its rules, and its knowledge of your setup.
- **The harness** — the program that actually runs Claude in your terminal. It is the harness, not Claude itself, that reads your configuration files, enforces permissions, and runs your hooks. This distinction will matter when we get to hooks.

With those in hand, here are the pieces.

---

## CLAUDE.md — the always-on instructions

**What it is.** A plain Markdown file that Claude reads at the start of every session. Whatever you put in it becomes part of Claude's system prompt.

**Where it lives.** Two places, and both are read together:

- `~/.claude/CLAUDE.md` — your personal, cross-project version. Applies to every project you open.
- `<project-root>/CLAUDE.md` — a project-specific version. Applies only when Claude is working in that directory.

**When to use it.** For facts and preferences that should be true in *every* session: "I follow conventional commits," "prefer TypeScript over JavaScript in new files," "this project's tests run via `pytest -q`."

**Rule of thumb.** If you find yourself typing the same reminder into Claude for the third time, it belongs in CLAUDE.md.

CLAUDE.md is the simplest and most powerful lever in the whole system. Most people start here and never need more — until they do.

---

## Rules — modular pieces of always-on knowledge

**What it is.** A "rule" is not an official Claude Code primitive. It is a *community convention* that experienced users have adopted to keep CLAUDE.md from turning into a wall of unrelated text. A rule is a Markdown file — typically stored under `~/.claude/rules/` — that captures a single piece of guidance. CLAUDE.md then pulls in the ones it wants, so Claude still sees them as always-on knowledge.

**Where it lives.** `~/.claude/rules/<topic>.md` — one file per topic. A rule called `commit-messages.md`, another called `error-handling.md`, another called `naming-conventions.md`.

**When to use it.** When your CLAUDE.md is starting to sprawl and you want to keep individual concerns editable in isolation.

**Why the pattern works.** Rules are the "one topic per file" answer to CLAUDE.md's "everything in one file." Same effect on Claude — always-on knowledge — but easier to maintain, easier to share, and easier to retire without wading through unrelated content.

---

## Settings — permissions, environment, and defaults

**What it is.** A JSON file named `settings.json`. Where CLAUDE.md tells Claude *what to think*, `settings.json` tells the harness *what to allow*.

**Where it lives.** Three locations, layered from broadest to narrowest:

- `~/.claude/settings.json` — your personal defaults, applied everywhere.
- `<project>/.claude/settings.json` — settings shared with anyone who clones the project (checked into git).
- `<project>/.claude/settings.local.json` — your personal overrides for one project (git-ignored, invisible to teammates).

**What goes in it.**

- **Permissions.** A list of commands and file patterns Claude may run without asking each time ("always allow `npm test`") or may never run ("always deny reads of `.env`").
- **Environment variables.** Values injected into every session — API tokens, feature flags, model preferences.
- **Hooks configuration.** Which shell scripts fire on which events (more on that shortly).
- **Model choice.** Which Claude model to use by default.
- **Additional directories.** Extra folders Claude can see beyond the current project.

**When to use it.** Any time you want to change *what Claude is allowed to do* rather than *what Claude knows*.

---

## Skills — reusable workflows Claude can invoke

**What it is.** A skill is a small named workflow — a Markdown file plus optional supporting files — that Claude can either invoke automatically when the situation matches, or that you invoke by typing `/skill-name`.

**Where it lives.** `~/.claude/skills/<skill-name>/SKILL.md`. The skill's name comes from the folder.

**What the file looks like.** A short YAML frontmatter block with the skill's name and a one-line description, followed by the actual instructions in Markdown. The description is the important part: Claude reads *only* descriptions at startup and uses them to decide when a skill is relevant. The full body loads only when the skill actually runs, so a skill can be arbitrarily detailed without costing you context space until it's needed.

**When to use it.** When a multi-step procedure keeps recurring. "Set up a new blog post," "run the release checklist," "review this pull request against our style guide."

**A note on terminology.** Anthropic recently merged **custom slash commands** and skills into one concept. A file at `~/.claude/commands/deploy.md` and a skill at `~/.claude/skills/deploy/SKILL.md` both create the same `/deploy` command and work the same way. Older tutorials talk about them as separate things — they are not anymore. Your existing `commands/` folder keeps working; skills simply add optional features like bundled supporting files and auto-triggering.

---

## Slash commands — the shortest possible skill

**What it is.** A slash command is a named prompt you can invoke by typing `/name` in the chat. As of Anthropic's recent unification, a "slash command" is really just a skill written in the simplest possible form: one Markdown file with no supporting directory.

**Where it lives.** `~/.claude/commands/<name>.md` (personal) or `<project>/.claude/commands/<name>.md` (project).

**What the file looks like.** A tiny frontmatter block (description, optional argument hint), then a Markdown prompt body. The prompt can reference `$ARGUMENTS` to receive whatever you typed after the command name, `!bash-exec-line` to run a shell command and inline its output, and `@path/to/file` to include a file's contents.

**When to use it.** When the workflow is small enough to fit in a single file and you don't need auto-invocation. Perfect for one-liners: `/pr-title`, `/explain-diff`, `/what-changed`.

**When to reach for a skill instead.** As soon as the workflow needs supporting scripts or reference material sitting next to the prompt, promote it to a skill (a folder with a `SKILL.md` inside).

---

## Subagents — Claude, but focused

**What it is.** A subagent is a separately-configured version of Claude that runs in its own private context window. The main Claude session can hand off a task to one, wait for the result, and get back a summary instead of the full transcript.

**Where it lives.** `~/.claude/agents/<agent-name>.md` (personal) or `<project>/.claude/agents/<agent-name>.md` (project).

**What the file looks like.** Frontmatter with a name, a description of when to use the agent, an optional restricted tool list, and an optional model choice — then the system prompt for the agent in Markdown.

**When to use it.**

- **Context hygiene.** If a task will pull in a lot of noise — search results, logs, thousands of lines of code — that you will not need to reference later, do it in a subagent. The main session sees only the summary.
- **Focused expertise.** A "code reviewer" subagent can have a system prompt tuned entirely for review, and can be restricted to read-only tools so it cannot accidentally edit anything.
- **Cost control.** A subagent can be pinned to a faster, cheaper model for narrow tasks while the main session stays on your preferred one.

Think of a subagent as a specialist consultant: you brief them, they go away and work, they come back with an answer. The details of *how* they got there stay out of your main conversation.

---

## Hooks — shell commands that run automatically

**What it is.** A hook is a shell command that the harness runs at specific moments in the session's lifecycle. Claude does not run hooks — the *harness* does. That means a hook can enforce something Claude cannot opt out of.

**Where it is configured.** In `settings.json`, under a `hooks` key. The scripts themselves usually live in a `hooks/` folder next to the settings file.

**When they can fire.** The main events:

- `SessionStart` — when a new session begins. Common use: inject the current git branch, open issues, or today's TODO list into Claude's context.
- `UserPromptSubmit` — after you press enter, before Claude processes your message. Common use: expand shortcuts, add reminders.
- `PreToolUse` — before Claude runs any tool. Can inspect the tool call and **block** it. Common use: refuse dangerous commands like `rm -rf` regardless of what Claude decides.
- `PostToolUse` — after a tool call succeeds. Common use: run a formatter or linter automatically after Claude edits a file.
- `Stop` / `SubagentStop` — when Claude finishes a response, or when a subagent finishes. Common use: log the turn, play a sound, send a notification.
- `SessionEnd` — cleanup when the session closes.

**When to use it.** For anything you want to happen *automatically*, without depending on Claude choosing to do it. Anything you would phrase as "from now on, whenever X happens, do Y" is a hook.

---

## Output styles — how Claude sounds

**What it is.** An output style modifies Claude's *voice, tone, and default response shape* — not what it knows or what it can do. It works by inserting instructions directly into the system prompt.

**Where it lives.** `~/.claude/output-styles/<style-name>.md`.

**When to use it.** When you consistently want a different feel: more terse, always leads with a diagram, always asks a clarifying question first, teaches instead of just doing. Claude Code ships with a few built-in styles (Default, Explanatory, Learning, Proactive), and you can write your own.

**Rule of thumb.** If you keep tacking "shorter, please" or "explain your reasoning" onto the end of every prompt, an output style will do it once and forever.

---

## MCP servers — connecting Claude to outside tools

**What it is.** MCP (Model Context Protocol) is an open standard for wiring external tools and data sources into an AI assistant. An **MCP server** is a small program that exposes a tool — Google Drive, GitHub Issues, a database, a monitoring dashboard, a custom API — in a way Claude can call directly.

**Where it is configured.** In `settings.json`, or via the `claude mcp add` command on the command line.

**When to use it.** Any time you find yourself copying data between Claude and some other tool. Instead of pasting a Jira ticket into chat, connect the Jira MCP server and let Claude read it. Instead of describing what your dashboard shows, connect the monitoring MCP server and let Claude look.

**Common examples.** GitHub, a Postgres database, Google Drive, Slack, Linear, Figma — and, for developers, your own custom MCP server that exposes internal APIs your team uses daily.

MCP is the part of the ecosystem that grows fastest. If a tool you use daily does not have an MCP server yet, one probably will soon — or you can write your own.

---

## How the pieces fit together

Here is a concrete flow that touches most of them. You open Claude Code in a project.

1. The harness loads your settings, both `CLAUDE.md` files, and your active output style. Permissions, MCP servers, and Claude's system prompt are now in place.
2. The harness registers your skills, subagents, and slash commands so they are callable, then your `SessionStart` hook fires and injects today's git branch into Claude's context.
3. You type `/new-post my thoughts on X` — a slash command runs.
4. Claude writes the file. A `PostToolUse` hook fires and runs your linter on the result.
5. You ask Claude to review the post. Claude delegates to your `writing-reviewer` subagent, which returns a summary. The noisy details never touch your main context.

You did not type any of that machinery. You configured it once.

## A quick decision guide

When you spot an opportunity to configure something, use this map to pick the right file type:

- "Claude should always know this." → **CLAUDE.md** (or a rule file if CLAUDE.md is getting long).
- "Claude should never do this — or should always be allowed to do this." → **settings.json** permissions.
- "I keep typing the same multi-step instructions." → **skill** (or a **slash command** if it's a one-liner).
- "This task fills the context with junk I won't need later." → **subagent**.
- "This should happen automatically at a specific moment, whether Claude thinks to or not." → **hook**.
- "I want Claude to talk differently — shorter, or more teacherly, or in a specific format." → **output style**.
- "Claude needs to reach into another tool I use." → **MCP server**.

## Where to look for real-world examples

The best way to learn a Claude configuration is to read one. Two starting points beyond your own experiments:

- [`obra/superpowers`](https://github.com/obra/superpowers) — a widely-used, opinionated collection of skills, agents, and hooks centered on test-driven development, structured brainstorming, and subagent-driven work.
- [`worldflowai/everything-claude-code`](https://github.com/worldflowai/everything-claude-code) — a broader catalog of configurations refined through months of production use, with strong material on hooks, memory, and context management.

Both are permissively licensed. Read them the way you would read a well-organized dotfiles repo: do not install everything, adopt one idea at a time, and let your own configuration grow around your own habits.

## Start small

The trap with all of this is thinking you need a large configuration to get value. You do not. Almost everyone who has a useful setup started the same way:

1. A CLAUDE.md with three or four preferences.
2. One skill for the workflow they were tired of retyping.
3. One hook that blocked a command they were tired of Claude proposing.

Everything else grew from those. A personal Claude configuration is, at its best, a record of what you have noticed about how you actually work — nothing more, nothing less.
