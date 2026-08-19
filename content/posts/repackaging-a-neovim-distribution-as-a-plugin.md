+++
title = "Repackaging a Neovim distribution as a plugin"
date = "2026-08-19T17:55:05-04:00"
draft = false
description = "Most Neovim distributions ship as a repo you clone into ~/.config/nvim, which makes your config and their distribution the same git repository. Splitting them into a plugin plus a starter template fixes that — here's why, and how."
summary = "Most Neovim distributions ship as a repo you clone into ~/.config/nvim, which makes your config and their distribution the same git repository. Splitting them into a plugin plus a starter template fixes that — here's why, and how."
tags = ["neovim", "lua", "nvim-plugin", "plugin-development", "yoda"]
categories = ["Neovim"]
ShowToc = true

[cover]
image = "/images/og/repackaging-a-neovim-distribution-as-a-plugin.png"
hiddenInList = true
hiddenInSingle = true
+++

I broke my editor last week by deleting a file, and the way it broke is the whole argument of this post.

I was in the middle of restructuring [yoda.nvim](https://github.com/jedi-knights/yoda.nvim), my Neovim distribution. One of the steps was removing the top-level `init.lua`. I deleted it, committed, merged — and then, some time later, went to open a file and got dropped into a bare Neovim with none of my configuration. It took an embarrassing minute to work out why. My `~/.config/nvim` was a symlink to `~/.config/nvim-yoda`, which was itself a symlink to the git checkout I had been editing all afternoon. My editor and the project I was working on were the same directory. Deleting the entry point from the repo deleted the entry point from my editor.

That's a self-inflicted wound and easy to laugh at. But it is a sharpened version of the thing that happens to every user of a distribution that ships as a config repo, and it points straight at the question this post is about:

*When someone customizes your distribution, are they editing their files or yours?*

If the honest answer is "mine," then every downstream problem — update conflicts, lost customizations, no way to roll back, no meaningful version number — follows from that one conflation. Everything below is about separating those two things.

## The model most distributions ship with

The standard shape is: clone the distribution into `~/.config/nvim`, start Neovim, let a plugin manager bootstrap everything on first launch.

```bash
git clone https://github.com/someone/their-distro ~/.config/nvim
nvim
```

It's one command. It works. And I want to give it its strongest form before I argue with it, because a lot of very good software ships this way for very good reasons.

The config-repo model is **radically legible**. Everything Neovim will do on startup is a file you can open, in one directory, with no indirection. There is no version resolution to reason about, no separation between "the distribution's files" and "your files," no wondering which layer set an option. When something misbehaves you `grep` one tree and find it. TJ DeVries's [kickstart.nvim](https://github.com/nvim-lua/kickstart.nvim) leans all the way into this — it's a single heavily-commented file you are *supposed* to read top to bottom and then own. For a teaching artifact, that's not a compromise, it's the entire point. Any indirection I add below makes kickstart worse at its job.

It's also the right shape for a config that has exactly one user. If you are the only person who will ever run it, "your config and the repo are the same thing" is not a conflation — it's just true, and the simplicity is free.

## What breaks once you have users who aren't you

The model starts costing something the moment someone other than the author runs it and wants to change something.

**Customization competes with updates.** The user wants a different colorscheme option. The natural move is to edit the file that sets it — which is your file, tracked in your repo. Now `git pull` is a merge conflict. The usual patch is a blessed escape hatch: a `lua/custom/` directory that's gitignored and imported if present. That works, and it is what yoda did for a long time, but notice what it is — a small, carefully-fenced area where the user is allowed to own something, inside a repo that is otherwise yours.

**There's no version to pin.** If the install instruction is "clone the default branch," then every user is on whatever `main` happened to be that day. You cannot ship a breaking change deliberately, because there is no mechanism to say *this is breaking* other than a README note and hope. Users can't stay on a known-good version while you work, and they can't roll back when an update goes sideways, because rolling back means rolling back the repository that also contains their customizations.

**The blast radius is the whole editor.** A distribution that owns `init.lua` owns startup. In the config-repo model there's no natural boundary between "the distribution failed to load" and "Neovim is unusable" — which is exactly the failure I inflicted on myself.

None of this is hypothetical or novel. It's why [LazyVim](https://github.com/LazyVim/LazyVim) ships as a plugin with a separate [starter](https://github.com/LazyVim/starter) repository, and why that split is now the reference pattern for distributions with an audience.

## The shape we moved to

Two repositories with clearly different owners:

- **`yoda.nvim`** — the distribution, as an ordinary Neovim plugin. It has no `init.lua`. It cannot be cloned into `~/.config/nvim`. It's installed and updated by a plugin manager like anything else.
- **`yoda-starter`** — a small template you clone into `~/.config/nvim` and then *own*. It's a handful of files: leader keys, plugin-manager bootstrap, one file declaring the distribution and its options, one empty file for your own plugins.

The user's config is now genuinely theirs — their repo, their history, their lockfile. The distribution is a dependency they can pin, update on their own schedule, and roll back without touching anything they wrote.

That's the whole idea. The rest of this post is how you get there from a config repo, and what bites you on the way.

## How we actually did it

The order matters more than any individual step, so I'll give the sequence and then the details.

**1. Namespace everything under one directory.** This is the first move and the least obvious. When a plugin manager installs your plugin, it puts your entire repository on Neovim's runtimepath. Anything sitting at `lua/<something>.lua` in your repo becomes `require("<something>")` for *every user of your plugin*. A config repo accumulates top-level modules — `options.lua`, `autocmds.lua`, `custom/` — that are perfectly reasonable as a config and are namespace pollution as a plugin. Everything moves under `lua/yoda/`.

**2. Give it a public API.** One entry point, `require("yoda").setup(opts)`, that does everything a consumer needs and nothing they didn't ask for.

**3. Make side effects explicit.** In a config, a module can do its work as a side effect of being `require`d — `require("options")` sets your options and that's the whole design. As a plugin, that's a trap: the caller can't decline, can't reorder, and can't test it without executing it. Each of those modules grows an explicit `apply()` function instead, and `setup()` calls them behind flags so a user can keep the distribution's plugins while supplying their own keymaps.

This step paid for itself immediately, and not in the way I expected. The options module had been setting two Neovim 0.12-only options unconditionally, while the distribution advertised support for 0.10.1+. Setting an unknown option raises an error, which aborted the rest of the function and took every option after that line with it. Any user on 0.10 or 0.11 had a broken config load. It had never been caught because nothing in the test suite ever loaded that module — it only ran at startup, on my machine, on a new enough Neovim. The moment `apply()` made it callable, CI ran it and went red on the first try.

**4. Pick one configuration vessel and validate it.** yoda had accumulated `vim.g.yoda_*` globals as its config surface. Globals are convenient and genuinely awful for this: they leak across plugins, can't be validated, and give you no place to document the schema. Everything moved to an `opts` table with a defaults schema in one file. Removing the old path is a real breaking change, which brings us to the part people skip.

**5. Warn about the thing you removed.** When the globals stopped being read, they didn't start erroring — they just stopped doing anything. A setting that silently does nothing is the worst failure mode available, because the user's config still loads, still looks right, and quietly ignores them. So `:checkhealth yoda` now warns when it finds one, naming each specific global. If you take one idea from this post, take that one: *when you drop a configuration mechanism, add a health check that detects the old one.*

**6. Split core from opt-in extras.** A distribution accumulates language tooling — Go test adapters, Python debuggers, Rust wiring. In a config repo those install unconditionally, because why not. As a plugin with users, "why not" is startup cost you're imposing on people who don't write Go. Language stacks became opt-in imports the starter enables explicitly.

**7. Only now, delete the entry points — and not before the starter exists.** This is the ordering constraint that matters. `init.lua` and the plugin-manager bootstrap are the only working install path right up until the moment there's a starter repository to replace them. Deleting them first leaves your users, and possibly you, with no way to run the thing. We built and published the starter, verified it end to end, and only then removed the files.

Every one of those steps landed as its own pull request, in that order, each one green before the next started. That isn't ceremony. A restructure like this touches everything, and the difference between "one of these nine changes broke it" and "the change I merged four minutes ago broke it" is most of the debugging cost.

## Four things that only show up once you try it

These are the ones I'd want to have known in advance. They're specific to lazy.nvim, but the shape of each generalizes to any plugin manager with a spec-merging model.

**Plugin specs merge; `config` functions don't.** If two files both declare the same plugin, lazy.nvim merges the specs — but a later `config` function *replaces* the earlier one rather than composing with it. This matters the instant you have opt-in extras, because the obvious way for a language extra to add a debug adapter is to re-declare the debugger plugin with its own `config`. Do that and you silently blow away the core configuration: keymaps, UI listeners, everything. The fix is a small registry module — extras register a function, the core drains the queue when it configures. It's a few dozen lines and it turns a landmine into an ordinary seam.

**Options can't gate imports.** My original design had `opts.extras = { "lang.rust" }` — configure your languages the same way you configure everything else. It cannot work. The plugin manager resolves its entire spec graph *before* any `config` callback runs, so by the time your options exist, the decision they were meant to inform has already been made. Extras have to be explicit `import` entries in the starter's spec list. Users delete the lines they don't want. Less elegant, actually works.

**Some things must happen before the plugin loads.** Options that disable Neovim's built-in plugins only bite if they're set before those plugins are sourced, which is earlier than a plugin's `config` callback fires. The starter applies options from the spec's `init` hook instead, and `apply()` is idempotent so the later `setup()` call is a harmless no-op. Idempotence is what lets you stop reasoning about which of the two calls "wins."

**A version constraint with no matching version is worse than no constraint.** The starter initially wanted `version = "*"` — follow released versions, the sane default. But at that moment the newest tag was `v0.3.1`, which predated the plugin restructure entirely. `version = "*"` would have cheerfully resolved to a version that didn't work at all. Until the major release existed, tracking the main branch was the honest pointer, with a comment saying exactly when to change it.

## How to know it actually works

You cannot test this by restarting your own editor, because your own editor has years of state in it. `NVIM_APPNAME` gives you a completely isolated config and data directory:

```bash
git clone https://github.com/jedi-knights/yoda-starter ~/.config/yoda-trial
NVIM_APPNAME=yoda-trial nvim
```

Delete those two directories and it's as if it never happened. We used this to verify the starter against a clean machine state before publishing anything, and then again against the actual published release: install from scratch, boot headless, and assert on what got wired up — did `setup()` run, are the keymaps registered, are the commands defined, did the colorscheme apply, is any deprecated global still set. Comparing those numbers before and after the restructure is what let us say the migration changed nothing functionally, rather than hoping so.

One thing that check taught me: a colorscheme applied via `vim.schedule` reads as "not applied" if you inspect it too early in a headless run. The first time I saw that I thought I'd broken theming. Wait for the scheduled callback and it's fine. Verification scripts have their own failure modes, and a check that reports a false problem costs you the same afternoon as a real one.

## What this buys you

**Users own their configuration.** Their repo, their commits, their lockfile. Updating the distribution is a plugin update, not a merge into a tree they've edited.

**A version contract that means something.** The starter pins to a major version, so users get fixes and features but never an unannounced breaking change. When you do break something, the version number says so, and there's a tag to stay on while they migrate.

**Rollback that actually works.** The lockfile lives in the user's repo. Restore the previous one, resync, and you're back — without reverting anything you wrote.

**A smaller surface by default.** Opt-in language stacks mean a Go developer isn't paying startup cost for Rust tooling.

**Your development checkout stops being your editor.** Which is where this post started, and which I now consider a feature rather than a fix.

## What this does not buy you

I said I'd be honest about the boundary, so:

**It does not make the distribution good.** This is packaging. A badly-designed distribution with a clean plugin boundary is still badly designed. None of this work made yoda better at editing text.

**It costs indirection.** There are now two repositories, and answering "where does this setting come from" sometimes means checking both. The config-repo model's legibility was real, and this trades some of it away.

**It's worse for beginners than clone-and-go.** "Clone this, run `nvim`" is one step. "Clone the starter, understand that the distribution is a plugin it declares, know which file to edit for which kind of change" is more. If your audience is people learning Neovim, weigh that seriously.

**The migration is genuinely breaking, and that cost lands on your users.** Not on you. You need a real migration guide with a mapping table from old settings to new, a health check that catches what they miss, and a pinned tag for anyone who'd rather not move at all. We shipped all three and I still expect someone to have a bad afternoon.

**If you're the only user, this is overhead.** A single-user config has no version contract to honor and no one else's customizations to protect. Stay with the simple thing.

## If you want to try it

Start with step one only. Move everything into `lua/<yourname>/` and fix what breaks. That single change is independently useful — it's the one that stops your config from colliding with other people's modules — and it tells you how much hidden coupling you have before you commit to the rest. If it's painful, that's information. The remaining steps are the same work in smaller pieces.

The distinction worth carrying away is narrower than "plugin good, config repo bad": **a config repo is the right shape for a config with one user, and the wrong shape the moment you're asking strangers to trust it with their editor.** The split isn't about architecture — it's about which files a user is allowed to own.

If you maintain a distribution anyone else installs, go look at whether their customizations live in your repository. That's the whole diagnosis, and you can finish it in about thirty seconds.

*For how yoda's underlying pieces were split into independently installable plugins — a different axis of the same instinct — see [Yoda: what I learned making a Neovim distribution modular]({{< ref "posts/modular-neovim-distribution-yoda.md" >}}). For the mechanics of what a plugin manager actually does at startup, see [How Neovim actually loads a plugin]({{< ref "posts/how-neovim-actually-loads-a-plugin.md" >}}).*
