+++
title = "Writing a custom zsh completion function, end to end"
date = "2026-09-22T15:05:07-04:00"
draft = false
description = "A walkthrough of writing a zsh completion function for a small CLI — from an empty file to subcommand dispatch, contextual argument completion with help text, and dynamic completion driven by a command's own output. The one subsystem that makes zsh worth the switch."
summary = "A walkthrough of writing a zsh completion function for a small CLI — from an empty file to subcommand dispatch, contextual argument completion with help text, and dynamic completion driven by a command's own output. The one subsystem that makes zsh worth the switch."
tags = ["zsh", "shell", "terminal", "unix", "completion", "compsys", "productivity"]
categories = ["Terminal Tooling"]
ShowToc = true

[cover]
image = "/images/og/writing-a-custom-zsh-completion-function-end-to-end.png"
hiddenInList = true
hiddenInSingle = true
+++

Your team ships an internal CLI called `snap`. It creates named snapshots of some resource, lists them, deletes them, restores them. Every engineer on the team types `snap <TAB>` a hundred times a week and gets nothing back, because nobody wrote the completion function. So they type the subcommand out. They copy snapshot names from `snap list` output. They hit `snap delete production-2026-09-21` and get "no such snapshot" back — off by a day. They do this every day, forever, because a completion function feels like magic — some artifact bundled with the tool by the original author, not a fifty-line shell function anyone on the team could write.

*Zsh's completion system — `compsys`, documented in `zshcompsys(1)` — is the one subsystem the [overview](/posts/zsh-is-worth-switching-for-two-features-and-one-subsystem/) argued was worth switching for on its own. This post walks through writing a completion function for a made-up `snap` CLI from an empty file to a working script that handles subcommand dispatch, contextual arguments, and dynamic name completion driven by the tool's own output. The techniques generalize to every internal CLI your team has ever pretended not to need this for.*

This is the fourth and final post in the small zsh series. Read the [overview](/posts/zsh-is-worth-switching-for-two-features-and-one-subsystem/) for why bother; the [glob-qualifier](/posts/zsh-extended-glob-qualifiers-a-language-inside-pathnames/) and [parameter-expansion](/posts/zsh-parameter-expansion-flags-the-bash-users-missing-manual/) posts for the two syntactic features that complement this one. All examples run under an unmodified zsh with `autoload -Uz compinit; compinit` in `.zshrc` — the default setup any framework distribution already has.

## The CLI we're completing for

Assume `snap` takes this shape:

```text
snap create <name> [--tag=<tag>] [--verbose]
snap list   [--filter=<pattern>]
snap delete <name> [--force]
snap restore <name>
snap help [<subcommand>]
```

- `create` takes a positional name (a new snapshot ID the user is inventing), optional `--tag` (a category), and optional `--verbose`.
- `list` takes an optional `--filter` that accepts a glob.
- `delete` and `restore` take a name that must already exist — this is where dynamic completion pays off.
- `help` takes an optional subcommand name for context-specific help.

We'll build the completion function in six steps. At the end there's a "what this post does not tell you" section on the pieces I left out — nested subcommands, caching, `zstyle`, and the reasons the bash-completion shim rarely feels right.

## Step 1: the file, the shebang-that-isn't, and `compdef`

Zsh's completion loader (`compinit`) scans `$fpath` for files whose name matches `_<command>`. For our `snap` CLI the file is called `_snap`. It has no shebang — it's sourced by `compinit`, not executed — and it starts with a `#compdef` directive that tells `compinit` which command it completes for:

```zsh
#compdef snap

# _snap — zsh completion function for the snap CLI.
# Loaded lazily via compinit; put this file on $fpath.

_snap() {
    _arguments '1: :(create list delete restore help)'
}

_snap "$@"
```

Save that as `_snap` in `~/.zsh/completions/`, add that directory to `$fpath` before `compinit` runs:

```zsh
# In .zshrc, BEFORE compinit:
fpath=(~/.zsh/completions $fpath)
autoload -Uz compinit
compinit
```

Restart the shell (or `rm ~/.zcompdump; compinit` to force a reload), then `snap <TAB>` offers the five subcommands. That's the smallest useful completion function.

The `_arguments` builtin does most of the work. Its argument grammar takes some getting used to, so we'll unpack it piece by piece.

## Step 2: subcommand dispatch with `_arguments`

The `1: :(...)` from step 1 says *"the first positional argument is one of these literal words."* That's fine for the top level, but each subcommand needs its own completion — `create` accepts different flags from `list`. `_arguments` supports this via the `->STATE` action, which tells the completion system to jump into a `case` branch named `STATE` after matching:

```zsh
#compdef snap

_snap() {
    local -a subcommands
    subcommands=(
        'create:take a new snapshot'
        'list:show existing snapshots'
        'delete:remove a snapshot'
        'restore:roll back to a snapshot'
        'help:show help for a subcommand'
    )

    _arguments -C \
        '1: :->subcommand' \
        '*:: :->subcommand_args'

    case $state in
        subcommand)
            _describe -t commands 'snap subcommand' subcommands
            ;;
        subcommand_args)
            case $words[1] in
                create)   _snap_create ;;
                list)     _snap_list ;;
                delete)   _snap_delete ;;
                restore)  _snap_restore ;;
                help)     _snap_help ;;
            esac
            ;;
    esac
}
```

Three things to notice:

1. **`-C`** tells `_arguments` to keep the shell's `$CURRENT`, `$words`, and related variables consistent when it recurses. Every real completion function passes `-C`; without it, subcommand dispatch breaks in ways that look like completion just not working.
2. **`'1: :->subcommand'`** — the leading `1:` says *"position 1,"* the middle `:` is the description slot (empty), and `->subcommand` sets `$state` to `subcommand`. The colons look weird until you notice every `_arguments` spec has the same shape: `<position>:<description>:<action>`.
3. **`'*:: :->subcommand_args'`** — the `*::` means *"all remaining arguments, and hand them to the next completion in the recursive call."* This is what makes subcommand-specific completion possible: once the user has typed a subcommand and moved past it, the remaining words become the "argv" for the subcommand's own completion function.

`_describe` is a helper that turns an array of `name:description` pairs into a completion menu with help text visible next to each entry. It's the thing that makes zsh's completion feel *documented* — every candidate can carry a one-line explanation.

## Step 3: per-subcommand completion functions

Each `_snap_<subcommand>` is its own `_arguments` call. This is where the language gets expressive:

```zsh
_snap_create() {
    _arguments \
        '--tag=[category tag]:tag name:(prod staging dev)' \
        '--verbose[print detailed progress]' \
        ':snapshot name:'
}

_snap_list() {
    _arguments \
        '--filter=[glob pattern to filter by]:pattern:'
}

_snap_delete() {
    _arguments \
        '--force[skip confirmation]' \
        ':snapshot name:_snap_names'
}

_snap_restore() {
    _arguments \
        ':snapshot name:_snap_names'
}

_snap_help() {
    _arguments \
        ':subcommand:(create list delete restore)'
}
```

Reading `--tag=[category tag]:tag name:(prod staging dev)`:

- `--tag=` — the flag name, and the `=` says *"the value follows an equals sign,"* so `--tag=prod` completes but `--tag prod` (space-separated) would need `--tag+[...]` instead.
- `[category tag]` — the help text shown when the user hovers over the flag.
- `:tag name:` — the argument slot has a description ("tag name") and no explicit action for what values to accept.
- `(prod staging dev)` — the actual action: complete from a literal list of three strings.

Compact, but every part is doing work. `_arguments`'s reference documentation (`zshcompsys(1)`, *Utility Functions* section) is dense; reading five real completion functions from `/usr/share/zsh/site-functions/` teaches the syntax faster than reading the manual.

For `--verbose` there's no `=` and no value, so it's a plain flag. `[print detailed progress]` is the help text.

For the positional `:snapshot name:` we've written no action, so zsh falls back to file completion. That's fine for `create` (the user is inventing a name and file completion suggests nothing useful, but doesn't get in the way). It's *not* fine for `delete` and `restore`, which is what the next step fixes.

## Step 4: dynamic completion — driving from the tool's own output

The interesting one is `_snap_names`. `delete` and `restore` shouldn't offer file completion — they should offer the names of snapshots that actually exist. If `snap list --raw` prints one name per line, we can drive completion from its output:

```zsh
_snap_names() {
    local -a names
    names=(${(f)"$(snap list --raw 2>/dev/null)"})
    _describe 'snapshot' names
}
```

Three moves in one function:

1. **`${(f)"$(snap list --raw)"}`** — the parameter-expansion flag from the [previous post](/posts/zsh-parameter-expansion-flags-the-bash-users-missing-manual/) that splits captured output into an array of lines. No `while read` loop, no `IFS` gymnastics.
2. **`2>/dev/null`** — dropped errors. If `snap` isn't installed or the daemon isn't running, we don't want error text splattered into the completion menu. Silent-fail is the right default here.
3. **`_describe 'snapshot' names`** — feeds the array into the completion menu. No description column this time (we could add one if `snap list --raw` printed `name:description` per line, and it often should).

Now `snap delete <TAB>` calls out to the actual `snap` CLI, gets the current list, and offers it as tab-completion candidates. This is the technique that makes `kubectl get pods <TAB>` list actual pod names, `docker exec <TAB>` list actual container names, and `git checkout <TAB>` list actual branches — every one of those is a small function like `_snap_names`, doing exactly this.

The design lesson embedded here: **make your CLI produce a machine-parseable list mode** (`--raw`, `--porcelain`, `--format=names`, whatever). If it exists, the completion function is five lines. If it doesn't, someone (probably you) will parse the human-readable output with `sed`, and the completion will break the next time the human-readable output changes.

## Step 5: putting the whole file together

Combining steps 1-4:

```zsh
#compdef snap

_snap_names() {
    local -a names
    names=(${(f)"$(snap list --raw 2>/dev/null)"})
    _describe 'snapshot' names
}

_snap_create() {
    _arguments \
        '--tag=[category tag]:tag name:(prod staging dev)' \
        '--verbose[print detailed progress]' \
        ':snapshot name:'
}

_snap_list() {
    _arguments \
        '--filter=[glob pattern to filter by]:pattern:'
}

_snap_delete() {
    _arguments \
        '--force[skip confirmation]' \
        ':snapshot name:_snap_names'
}

_snap_restore() {
    _arguments \
        ':snapshot name:_snap_names'
}

_snap_help() {
    _arguments \
        ':subcommand:(create list delete restore)'
}

_snap() {
    local -a subcommands
    subcommands=(
        'create:take a new snapshot'
        'list:show existing snapshots'
        'delete:remove a snapshot'
        'restore:roll back to a snapshot'
        'help:show help for a subcommand'
    )

    local state
    _arguments -C \
        '1: :->subcommand' \
        '*:: :->subcommand_args'

    case $state in
        subcommand)
            _describe -t commands 'snap subcommand' subcommands
            ;;
        subcommand_args)
            case $words[1] in
                create)   _snap_create ;;
                list)     _snap_list ;;
                delete)   _snap_delete ;;
                restore)  _snap_restore ;;
                help)     _snap_help ;;
            esac
            ;;
    esac
}

_snap "$@"
```

Sixty-two lines. That's the whole thing — subcommand dispatch, flag completion with help text, positional completion, dynamic name completion, and per-subcommand routing.

## Step 6: installing, reloading, debugging

Installation:

```zsh
mkdir -p ~/.zsh/completions
mv _snap ~/.zsh/completions/
```

Ensure `.zshrc` has `~/.zsh/completions` on `$fpath` *before* the `compinit` call:

```zsh
fpath=(~/.zsh/completions $fpath)
autoload -Uz compinit
compinit
```

Reloading during development is the part most tutorials skip. `compinit` caches its findings in `~/.zcompdump`, so editing `_snap` doesn't take effect until you either wait for the cache to rebuild or force it:

```zsh
# Force compinit to rebuild the cache.
rm -f ~/.zcompdump*
compinit

# Or in one line, without restarting the shell:
unfunction _snap 2>/dev/null; autoload -U _snap
```

Debugging when the completion doesn't fire: **`bindkey '^Xh' _complete_help`**. That binds `Ctrl-X h` to the completion-help widget, which prints the completion function that would be called *at the current cursor position*. Type `snap create <cursor>` and hit `Ctrl-X h`; zsh tells you it would call `_snap_create` and lists the currently-active `_arguments` spec. If it says `_default` instead of `_snap_create`, the completion isn't loaded — check `$fpath` and `compinit`.

The other debugging technique is `_message`, a helper that displays an arbitrary string in the completion menu instead of candidates. Sprinkle `_message "reached _snap_create"` into a function and you get instant feedback about whether your subcommand dispatch is routing correctly.

## What this post does not tell you

- **It does not tell you every `_arguments` spec form.** The reference (`zshcompsys(1)`, *Completion System*) documents at least ten operators I did not cover: `+arg` (arguments that repeat), `!arg` (arguments to hide from completion but recognize when typed), `(-)` (mutual exclusion), `::arg::action` (optional positional), and more. The set above covers 80% of real completion functions; when you hit the other 20%, read `_git`, `_docker`, or `_kubectl` for prior art.
- **It does not tell you how to handle command hierarchies more than one level deep.** `git remote add <name> <url>` is two levels of subcommand (git → remote → add). The pattern generalizes — `_git_remote` dispatches to `_git_remote_add`, and so on — but the recursion adds ceremony. Look at `_git` in `/usr/share/zsh/site-functions/` for the shape.
- **It does not tell you how to cache dynamic completion output.** Every time `snap delete <TAB>` fires, `_snap_names` shells out to `snap list --raw`. For a fast command this is fine; for one that takes a couple of seconds this is unbearable. `_cache_invalid` and `_retrieve_cache` / `_store_cache` are the built-in helpers; they use a per-command cache keyed by a policy function you write. The Kubernetes and AWS completions use this pattern extensively.
- **It does not tell you the exact behavior of `zstyle`.** Zsh's completion appearance and behavior — grouped output, colored candidates, menu selection with arrow keys, case-insensitive matching — are controlled by `zstyle` rules the user puts in `.zshrc`. Every framework distribution ships a starter set. If your completion works but "doesn't feel right," the fix is usually a `zstyle` line, not a change to your completion function.
- **It does not tell you bash-completion functions can be reused.** They cannot, directly. If a tool ships only a `bash-completion` script, you'll either write the zsh completion yourself or install `bashcompinit`, which is zsh's compatibility shim. Bashcompinit's completions rarely feel as good as a native zsh one; if the tool matters, write the native one.

## The distillation

**Zsh's completion system is a small library plus a convention. The library is `_arguments`, `_describe`, and `_message`; the convention is one file named `_command` on `$fpath` per command you want to complete for.** Once you've written one — sixty-two lines, most of it copy-pasteable from an existing completion — the rest of the tools your team ships get their completions for free, because you'll have internalized the shape.

Pick one internal tool at your job that everyone types the same three commands into every day and doesn't have completion for. Write `_thatname`. Ship it in your team's dotfiles repo. Watch the volume of typos and copy-pastes fall the next week. This is the concrete, measurable payoff of the subsystem the [overview](/posts/zsh-is-worth-switching-for-two-features-and-one-subsystem/) argued was worth switching shells for on its own — and once you've written one, you won't understand how you lived without them.
