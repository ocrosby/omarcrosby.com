+++
title = "Zsh is worth switching to for two features and one subsystem"
date = "2026-09-22T06:40:34-04:00"
draft = false
description = "The case for zsh over bash — and fish, and framework distributions — narrowed to the three parts of the shell that actually earn the switch: extended glob qualifiers, parameter expansion flags, and the completion system. Everything else is bash-plus-plugins."
summary = "The case for zsh over bash — and fish, and framework distributions — narrowed to the three parts of the shell that actually earn the switch: extended glob qualifiers, parameter expansion flags, and the completion system. Everything else is bash-plus-plugins."
tags = ["zsh", "shell", "terminal", "bash", "unix", "productivity"]
categories = ["Terminal Tooling"]
ShowToc = true

[cover]
image = "/images/og/zsh-is-worth-switching-for-two-features-and-one-subsystem.png"
hiddenInList = true
hiddenInSingle = true
+++

You want the twenty most recently modified `.md` files anywhere under the current directory, sorted newest first. In bash you reach for `find` and a `stat`/`sort`/`head` pipeline, or you shell out to `fd` and hope it's installed. In zsh you type this and hit enter:

```zsh
ls -tld **/*.md(.om[1,20])
```

That one line is not magic. It's two features that have been in zsh since the early 1990s — recursive globbing (`**/`) and a glob qualifier (`(.om[1,20])`) that filters to regular files (`.`), orders them by modification time newest first (`om`), and slices out the first twenty (`[1,20]`). No external tool. No pipeline. No `-name` versus `-iname` versus `-regex` argument to remember. That kind of one-liner is why engineers who switch to zsh stop reaching for `find`.

*The case for zsh is narrower than most "switch to zsh" posts make it. It rests on two syntactic features and one subsystem — extended glob qualifiers, parameter expansion flags, and the completion system. Everything else you'll read in a switching guide — the prompt, the plugin manager, the autosuggestions, the syntax highlighting — is bash-plus-plugins, achievable in bash if you cared to.*

This is the anchor post of a small series. Three follow-ups will each take one of the three parts above and go deep: [extended glob qualifiers](/posts/zsh-extended-glob-qualifiers-a-language-inside-pathnames/), [parameter expansion flags](/posts/zsh-parameter-expansion-flags-the-bash-users-missing-manual/), and [writing a custom completion function](/posts/writing-a-custom-zsh-completion-function-end-to-end/). This post is the argument for why you'd bother reading them at all — and, just as importantly, when you shouldn't.

## A short history, because the names are strange

Zsh was written by Paul Falstad at Princeton in 1990. He posted the first public release to `comp.sources.misc` in December 1990, describing it as "a shell designed for interactive use, although it is also a powerful scripting language." Falstad stopped maintaining it in the mid-1990s; Peter Stephenson picked it up and has driven the project for most of the three decades since. The reference book is still Peter Stephenson's *From Bash to Z Shell* (Apress, 2004) — dated in the specifics but not superseded on the fundamentals.

The name is a Princeton in-joke: Paul Falstad's TA that semester was Zhong Shao, whose login was `zsh`. The shell inherited the initials by accident rather than any grand ambition to sort last in the alphabet.

## What most switching guides get wrong

Almost every "switch to zsh" post on the internet is really a *"install oh-my-zsh"* post. The featured screenshots are of prompts. The featured commands are `git clone https://github.com/robbyrussell/oh-my-zsh.git`. The featured plugins are `zsh-autosuggestions`, `zsh-syntax-highlighting`, and `fast-syntax-highlighting`. The reader comes away thinking zsh is a shell whose selling point is *"prettier prompt, ghost text as you type, colored commands."*

None of that is wrong. All of it is achievable in bash. `oh-my-bash` exists. `bash-preexec` and `blesh` cover the syntax highlighting and autosuggestions. If those are the features you want, the honest recommendation is *"install those bash plugins,"* not *"switch shells."* The switching cost is real: startup time, script portability, a handful of behavior differences that will bite you at 2 a.m. the first time. Prompt aesthetics do not justify it.

The features that *do* justify it are the ones bash cannot get to without turning into a different shell — the ones that live in the syntax of the language, not in a plugin ecosystem bolted on top.

## The two features

### 1. Extended glob qualifiers

Glob qualifiers are a small trailing sublanguage attached to pathname expansion. Any glob pattern can be followed by `(...)` containing filters and modifiers — file-type checks, size and time constraints, sort orders, slice indices, execution predicates. `zshexpn(1)` documents them under the *Filename Generation* section, which is the technical name for globbing in zsh.

A few examples that map onto workflows every developer runs weekly:

```zsh
# Just the directories under the current path, no files.
ls -d */(/)

# The five newest .log files in /var/log, biggest first among those.
ls -Sld /var/log/*.log(.om[1,5])

# Every regular file bigger than 100 KB modified in the last day.
print -l **/*(.Lk+100mh-24)

# Every symlink in ~/bin whose target no longer exists.
print -l ~/bin/*(@-e:)
```

Bash's globbing goes as far as `**` (with `shopt -s globstar`) and stops there. Everything else you want to do — filter by size, sort by time, take the top N, exclude symlinks — is an external tool and a pipeline. Zsh lets you compose it into the glob itself, and the composition is stable across every command that takes a filename argument.

Deep-dive: [Zsh extended glob qualifiers: a language inside pathnames](/posts/zsh-extended-glob-qualifiers-a-language-inside-pathnames/).

### 2. Parameter expansion flags

Bash's parameter expansion is a modest language: `${var}`, `${var:-default}`, `${var%pattern}`, `${var/from/to}`, and a small number of relatives documented in `bash(1)` under *Parameter Expansion*. Enough for most shell work, and portable to POSIX `sh` with a few caveats.

Zsh's parameter expansion is a much larger language. It adds *flags* — expressed as `${(flag)var}` — that transform the value before or during expansion. A partial catalog:

```zsh
# Uppercase / lowercase.
echo ${(U)path_string}      # /USR/LOCAL/BIN
echo ${(L)hostname}         # my-mac.local → my-mac.local (already lower)

# Split by newlines, tabs, arbitrary strings.
lines=(${(f)"$(< /etc/hosts)"})   # array of lines from a file, no IFS gymnastics

# Indirect expansion — read a variable whose name is in another variable.
key=HOME
echo ${(P)key}              # $HOME

# Hash operations — get the keys or values of an associative array.
typeset -A colors=(red '#f00' green '#0f0' blue '#00f')
echo ${(k)colors}           # red green blue (order is hash-order, not stable)
echo ${(v)colors}           # #f00 #0f0 #00f

# Path-component modifiers, from csh.
file=/etc/nginx/nginx.conf
echo ${file:h}              # /etc/nginx      (head — directory)
echo ${file:t}              # nginx.conf      (tail — basename)
echo ${file:r}              # /etc/nginx/nginx (root — sans extension)
echo ${file:e}              # conf            (extension)
```

Every one of those is a line of bash you didn't have to write, plus a subshell you didn't have to spawn. On a shell prompt where you're iterating quickly, the savings compound.

Deep-dive: [Zsh parameter expansion flags: the bash user's missing manual](/posts/zsh-parameter-expansion-flags-the-bash-users-missing-manual/).

## The one subsystem

### The completion system

`compsys` — zsh's programmable completion system, documented in `zshcompsys(1)` — is the single most-cited reason engineers stay on zsh rather than migrate to fish. It's a small library of shell functions plus a set of conventions for writing completion functions per command. The functions are loaded lazily via `compinit`; each command's completion lives in a file named `_<command>` on `$fpath`.

The reason it matters isn't that zsh completes commands — bash completes commands too, via `bash-completion`. It's that zsh's completion is *contextual and structured*. `git checkout <TAB>` doesn't just list files; it lists local branches. `docker exec <TAB>` lists running container names. `kubectl get pods <TAB>` lists actual pod names in the current namespace. `ssh <TAB>` lists hosts from `~/.ssh/config`. Every one of those is a small completion function that knows the semantics of the tool it's completing for, and every one of them was written the same way, with the same primitives — `_arguments`, `_describe`, `_files`, `_message`.

Once you internalize that any command you use often can have a smart completion — and that writing one is a fifty-line shell function, not a plugin — the interactive experience of the shell changes shape. You stop typing full arguments. You stop copying pod names out of `kubectl get pods`. You stop guessing which subcommand a tool has. The shell starts giving you the answer.

Deep-dive: [Writing a custom zsh completion function, end to end](/posts/writing-a-custom-zsh-completion-function-end-to-end/).

## Steelmanning the alternatives

Every switching argument owes an honest treatment of what you'd be leaving. Here are the three positions I don't hold, in their strongest form.

### The bash-forever position

> *"My shell scripts have to run on every machine, including the ones I don't control. Bash is on every Linux distribution and every macOS install, and POSIX `sh` is on every Unix ever shipped. Zsh is a preference; bash is a guarantee."*

This is correct for *scripting*. Do not write `#!/usr/bin/env zsh` on top of a tool you plan to ship. Even inside a single organization, the reliable choice for anything that runs unattended is bash — often POSIX `sh` if you're being disciplined. Zsh scripts are a fine choice for personal tools you run interactively; they are a bad choice for anything you'd hand to a colleague or install on a server.

The switch this post argues for is *interactive-shell only*. Keep bash as your scripting language. Use zsh as your prompt.

### The fish-is-better position

> *"Fish has sane defaults, ships syntax highlighting and autosuggestions in the box, and doesn't require a plugin manager. Zsh is a 1990 shell with three decades of accumulated cruft."*

This is largely correct. Fish is genuinely a nicer out-of-the-box experience. If you're setting up a shell for someone who does not want to think about shell customization ever, fish is a better recommendation than zsh.

Two costs, in my judgment. First, fish is deliberately non-POSIX — `foo | bar` and `if` mean similar things but the syntax is different, and the cognitive cost of switching between a fish prompt and a bash script is real if you write shell scripts often. Second, fish's ecosystem is smaller — the equivalent of zsh's `compsys` exists in fish but the community-maintained completions library isn't as broad. If your daily work touches ten command-line tools, several of them will have polished zsh completions and no fish equivalent worth speaking of.

If those two costs don't bind on your workflow, use fish and don't look back.

### The framework-user position

> *"I don't need to know any of this. `oh-my-zsh` and `Powerlevel10k` (or `prezto`, or `zinit`, or `starship` for the prompt) already give me smart completion, autosuggestions, syntax highlighting, a fast prompt, and sensible defaults. I never write a `compdef` or a `${(f)var}` by hand. I never need to."*

Also correct. If your goal is *"a nice shell,"* a framework is the fastest path to it and I'd recommend `oh-my-zsh` or `zinit` for the plugin management and `Powerlevel10k` for the prompt with no hesitation. What frameworks don't give you is a *mental model* — the ability to write a completion function when the tool you use every day doesn't have one, or to compose a glob qualifier when the shell already has the primitives you need. That's the delta this post series is trying to close, and it's a delta most framework users never notice they're missing until they hit it.

## What this post does not tell you

Being explicit about the limits, because every switching argument that skips this section is oversold.

- **It does not tell you zsh is faster.** Zsh startup time is comparable to bash for a bare install and slower than bash for any real configuration — every plugin, every completion, every hook adds milliseconds. Powerlevel10k's [instant-prompt](https://github.com/romkatv/powerlevel10k#instant-prompt) mechanism exists specifically because a heavily-configured zsh can take multiple seconds to become responsive without it. If prompt latency matters to you, budget for it.
- **It does not tell you your bash scripts will still work.** They will — mostly. Zsh's word-splitting rules are different (unquoted expansions in zsh do *not* split by default, which is a real improvement but a real difference), array indexing is 1-based, and a few built-ins behave differently. If you `source` a bash script into a zsh session, expect surprises. Run scripts under their intended shell via a shebang.
- **It does not tell you the compsys API is easy.** `_arguments` is powerful, and it is documented in dense reference style that assumes you've already seen a completion function. Post 4 in this series walks through one end-to-end; that's the shortest path I've found to internalizing the shape.
- **It does not measure the *social* cost of switching.** Pair programming with a bash user on your machine will confuse them. Copy-pasting a one-liner from a colleague's bash session may not work. These costs are small but non-zero.
- **It is not a recommendation for shell scripts destined for CI or shipping.** For that, write POSIX `sh`, or bash if you need arrays. This post is about *your interactive prompt*, nowhere else.

## When to switch, when not to

The high-value cases:

- **You spend a large fraction of your work at a prompt** — git operations, kubectl, docker, cloud CLIs, log inspection, file wrangling — and you'd like the prompt to be a leverage multiplier rather than a typing surface. Zsh pays back the switching cost fastest here.
- **You already write nontrivial bash and hit its limits regularly** — you know what a subshell costs, you've written a nested `find` pipeline, you've fought with `IFS`. The two features above will feel like a language you were trying to write in bash all along.
- **You want to write your own completions for the internal CLIs your team ships.** This is where compsys really earns its space. A ten-line `_argocd` might already exist; a fifty-line completion for `your-internal-deploy-tool` is something only you can write, and zsh gives you the shortest path.

The low-value or negative cases:

- **You mostly write shell scripts, not interactive commands.** Stay on bash. The features above don't help scripts you can't count on running under zsh.
- **You mostly use the shell for `cd`, `ls`, and running one command per line.** The switching cost is not worth the payoff.
- **You want a nice-looking prompt.** Install `starship` on your bash. It renders the same prompt zsh users have. That's not a good reason to switch shells.

## The distillation

**Switch to zsh if you spend a lot of time at a prompt and want that time to be a leverage multiplier. Stay on bash if what you value most is the guarantee that your shell scripts run everywhere.** The three deep-dives that follow are for the first group — they're the *specific* payoff, once you've paid the switching cost.

Read [the glob-qualifier post](/posts/zsh-extended-glob-qualifiers-a-language-inside-pathnames/) first if you want to feel the language change under your fingers within an hour. Read [the parameter-expansion post](/posts/zsh-parameter-expansion-flags-the-bash-users-missing-manual/) second — it's the syntax that most changes how zsh scripts read. Save [the completion-function post](/posts/writing-a-custom-zsh-completion-function-end-to-end/) for the week you first wish an internal CLI at your job had a completion someone had bothered to write.
