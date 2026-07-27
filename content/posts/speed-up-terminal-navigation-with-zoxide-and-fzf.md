+++
title = "Speed up terminal navigation with zoxide and fzf"
date = "2026-07-26T21:23:54-04:00"
draft = false
description = "A plain-language guide to zoxide (a smarter `cd`) and fzf (a general-purpose fuzzy finder) — what they are, how to install and configure each on its own, and how they combine into a terminal that feels like it can read your mind."
summary = "A plain-language guide to zoxide (a smarter `cd`) and fzf (a general-purpose fuzzy finder) — what they are, how to install and configure each on its own, and how they combine into a terminal that feels like it can read your mind."
tags = ["zoxide", "fzf", "shell", "productivity", "cli", "zsh", "bash"]
categories = ["Terminal Tooling"]
ShowToc = true

[cover]
image = "/images/og/speed-up-terminal-navigation-with-zoxide-and-fzf.png"
hiddenInList = true
hiddenInSingle = true
+++

Every developer has a top-ten list of directories they live in. They usually look something like `~/code/<org>/<repo>`, one level deeper for monorepos, sometimes two or three levels deeper for specific packages inside them. Typing `cd ~/code/acme/webapp/src/components/dashboard` a dozen times a day is one of those chores that costs you nothing to notice and everything in aggregate. It's death by a thousand keystrokes.

There are two small, unglamorous command-line tools that between them make this whole class of friction disappear:

- **[zoxide](https://github.com/ajeetdsouza/zoxide)** — a smarter `cd` that learns which directories you actually visit and lets you jump to them by fragment.
- **[fzf](https://github.com/junegunn/fzf)** — a general-purpose fuzzy finder that turns any list of things (files, commands, git branches, docker containers) into an interactive picker.

They're independently useful. They're much more than the sum of their parts when installed together. This post walks through each one on its own — what it does, why you'd want it, how to install it, how the muscle memory forms — and then shows how they combine.

## Zoxide: a `cd` that remembers where you've been

`cd` is the oldest command most of us type. It has one big shortcoming: it doesn't know anything about you. It doesn't know that in the last week you have visited `~/code/acme/webapp` sixty times and `/etc/apt` exactly zero times. It treats both as equally likely destinations.

Zoxide fixes that. It hooks into your shell's directory-change events, keeps a tiny database of every path you `cd` into, and ranks those paths by a formula called **frecency** — a weighted blend of *frequency* and *recency* borrowed from Mozilla's URL bar. The more often and the more recently you visit a directory, the higher it ranks.

Once the database is populated, you navigate by fragment:

```bash
z webapp      # jumps to ~/code/acme/webapp
z dashboard   # jumps to that repo's src/components/dashboard/
z nvim conf   # jumps to ~/.config/nvim (two fragments, both must match)
z -           # jumps back to the previous directory
```

`z` is the primary command. It takes one or more fragments and jumps to the highest-ranked directory in your database whose path contains all of them. No slashes, no tab-completing through five parent directories, no scrolling through `Ctrl-R` history looking for the right `cd`. Just the piece of the path that's memorable.

### Installing zoxide

On macOS:

```bash
brew install zoxide
```

On Debian/Ubuntu:

```bash
sudo apt install zoxide
```

On Arch:

```bash
sudo pacman -S zoxide
```

On Windows:

```powershell
winget install ajeetdsouza.zoxide
```

If your distro's package is too old or missing, the [install script](https://github.com/ajeetdsouza/zoxide#installation) works everywhere:

```bash
curl -sSfL https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | sh
```

### Wiring zoxide into your shell

After installing the binary, one line in your shell's rc file hooks it in. Add this **at the bottom** of your init file — zoxide's hook needs to run after any other prompt-tracking machinery:

**Zsh** (`~/.zshrc`):

```bash
eval "$(zoxide init zsh)"
```

**Bash** (`~/.bashrc`):

```bash
eval "$(zoxide init bash)"
```

**Fish** (`~/.config/fish/config.fish`):

```fish
zoxide init fish | source
```

**PowerShell** (`$PROFILE`):

```powershell
Invoke-Expression (& { (zoxide init powershell | Out-String) })
```

Restart the shell (or `source` the file) and `z` is available. The database starts empty; it fills as you `cd` normally. After a day of ordinary work, `z <fragment>` will already be jumping to the right place most of the time.

### The one flag worth knowing

If you'd like zoxide to fully replace `cd` — same command, smarter behavior — pass `--cmd cd` to the init:

```bash
eval "$(zoxide init --cmd cd zsh)"
```

Now `cd webapp` jumps to the frecency-ranked match. Absolute and relative paths still work exactly like the built-in `cd` did, so you lose nothing. I keep it as `z` and leave `cd` alone — the two-character command trains the muscle memory faster than overloading `cd`, and it makes clear which behavior I'm invoking.

## Fzf: a fuzzy picker for any list

Where zoxide is a specialized tool that does one job, fzf is a swiss-army fuzzy finder. Its core is a single binary that reads a list from standard input, opens an interactive picker, and prints the selected line to standard output. That primitive turns out to be composable enough that people have built entire workflows around it.

The simplest possible use:

```bash
find . -type f | fzf
```

That command pipes every file under the current directory into fzf. You start typing; fzf narrows the list interactively as you type; you hit `Enter` and fzf prints the file you selected. That's the whole model.

The magic is that fzf's fuzzy matcher is fast — millions of items in milliseconds — and forgiving. Type `psql` to match `packages/postgres/query.sql`. Type `posts md` to narrow to Markdown files under any `posts` directory. Every character in your query has to appear in the item, in order, but not adjacent, which matches the way people actually remember filenames.

Where fzf earns its keep in daily use is through three keybindings that ship the moment you install its shell integration.

### Installing fzf

On macOS:

```bash
brew install fzf
```

Then run the post-install script Homebrew prints — or run it manually — to enable shell integration:

```bash
$(brew --prefix)/opt/fzf/install
```

The script asks whether to enable keybindings, fuzzy auto-completion, and to update your shell rc file. Say yes to all three; you can always turn things off later by editing the resulting `~/.fzf.zsh` (or `.bash`) file.

On Debian/Ubuntu:

```bash
sudo apt install fzf
```

Then either add `source /usr/share/doc/fzf/examples/key-bindings.zsh` to your `~/.zshrc` yourself, or install via git for the full setup:

```bash
git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf
~/.fzf/install
```

On Arch:

```bash
sudo pacman -S fzf
```

On Windows:

```powershell
winget install fzf
```

### The three shortcuts that change how you use the terminal

Once shell integration is enabled, three keystrokes are always available at your prompt.

**`Ctrl-T` — fuzzy-find files, insert the path into the current command.**

Type `vim` — don't press Enter yet — then hit `Ctrl-T`. fzf opens showing every file under the current directory. Start typing to filter. Hit `Enter`, and fzf pastes the path you picked into your command:

```text
vim (Ctrl-T) → picker opens → pick foo/bar.md → command becomes:
vim foo/bar.md
```

It composes with any command: `cat`, `less`, `git add`, `docker cp`, whatever.

**`Ctrl-R` — fuzzy-find shell history.**

The single most useful shortcut fzf ships. `Ctrl-R` opens a picker over your entire command history — thousands of past commands, all searchable interactively. Type fragments of the command you dimly remember (`kub logs prod` finds `kubectl logs -f deployment/api -n prod --tail 500`), pick one, hit `Enter`. The command lands in your prompt, ready to run or edit.

Once this replaces the default backward-i-search — which requires exact substring matches and no going back if you overshoot — you will not tolerate the default again on another machine.

**`Alt-C` — fuzzy-find a directory and `cd` into it.**

Similar to `Ctrl-T`, but for directories only, and it *runs* `cd` for you instead of pasting a path into your command line. `Alt-C`, type a fragment, `Enter`, and you're there.

There's overlap with zoxide's `z` here — and that's a good segue.

## Bringing them together

The complementary bit: **fzf gives you interactive filtering; zoxide gives you frecency-ranked destinations.** Each on its own has a gap the other closes.

- `Alt-C` (fzf) is great, but it walks the *current* directory tree — it doesn't know that the directory you actually want lives four levels up under `~/code`.
- `z` (zoxide) is great, but it commits you to whatever match ranks highest — no picker, no chance to disambiguate when two directories share a fragment.

Zoxide's `zi` command is where they combine. `zi <fragment>` (or `zi` alone) opens an interactive fzf picker over zoxide's *frecency-ranked* database:

```bash
$ zi post
# fzf opens with every ranked directory whose path contains "post"
# arrow keys to pick, Enter to jump
```

That's the shape that ends up doing most of the work: `z` for the unambiguous 90% ("just take me there"), `zi` for the ambiguous 10% ("I know it starts with `post` but I've got several"). Both use the same underlying database.

You get this for free the moment fzf is installed alongside zoxide — zoxide detects fzf on your `PATH` and enables `zi` automatically. No config, no init flag.

### Fzf's `**<tab>` completion, for the same reason

Fzf's shell integration also installs a **fuzzy completion trigger**: type `**` and hit `Tab` in the middle of any command, and fzf opens over the appropriate list.

```text
cat ~/**<Tab>            # fuzzy-find any file under ~/
ssh **<Tab>              # fuzzy-find a known SSH host from ~/.ssh/config
kill -9 **<Tab>          # fuzzy-find a running process
git checkout **<Tab>     # fuzzy-find a git branch (in a git repo)
```

The trigger works for most commands you'd expect it to work for. When it doesn't do exactly what you want, the completion function is a plain shell function you can override — see the [fzf wiki](https://github.com/junegunn/fzf/wiki) for the customization surface.

## A few small quality-of-life additions

Once the core setup is in place, a handful of aliases and options pay for themselves.

**Preview windows on `Ctrl-T`.** Set `FZF_CTRL_T_OPTS` to show the highlighted file's contents in a right-hand pane. Requires [bat](https://github.com/sharkdp/bat) (a `cat` with syntax highlighting):

```bash
export FZF_CTRL_T_OPTS="--preview 'bat --color=always --style=numbers --line-range=:200 {}'"
```

**Preview windows on `Alt-C`.** Show the directory's contents as you hover. Requires [eza](https://github.com/eza-community/eza) (a modern `ls`):

```bash
export FZF_ALT_C_OPTS="--preview 'eza --tree --level=2 --color=always {}'"
```

**Bigger fzf window with a border.** The default picker fills the bottom of the terminal; a bordered window feels less cluttered:

```bash
export FZF_DEFAULT_OPTS="--height 40% --layout=reverse --border --margin=1"
```

**Ask zoxide to print the destination before jumping.** Useful when you're first learning what it's matching:

```bash
export _ZO_ECHO=1
```

Drop the variable once you trust the frecency ranking.

**Exclude noisy directories from zoxide.** Node's `node_modules`, Python's `.venv`, big build artifact trees — you almost never want to jump into these:

```bash
export _ZO_EXCLUDE_DIRS="$HOME/.cache/*:*/node_modules/*:*/.venv/*"
```

## Why any of this matters

Terminal ergonomics is one of those areas where small friction compounds silently. The absolute time savings from `z webapp` over `cd ~/code/acme/webapp` is maybe two seconds. Two seconds, forty times a day, over ten thousand days of a career — that's not a rounding error, but it's also not the point.

The point is what happens to your attention while you're typing the long form. The moment your brain has to render "let me remember where that repo lives, was it `~/code` or `~/workspace`, and is the org spelled right" — that's the moment your idea evaporates. The two seconds you save typing `z` are seconds you spend still holding onto the thought that made you open the terminal in the first place.

The same logic applies to `Ctrl-R`. Everyone has a way of finding a past command. But the *default* way — hit `Ctrl-R`, type the exact substring, pray you typed enough — punishes uncertainty. Fzf's fuzzy history is forgiving to the way memory actually works: you recall fragments, you recall roughly what shape the command had, and fzf will find it from that.

Neither tool asks you to change how you work. They both slot in behind the commands you already know (`cd`, `Ctrl-R`, `Tab`) and quietly upgrade what those commands can do. That's why they're the first two things I install on a new machine, and why — once you've used them for a week — you'll find the un-upgraded shell on somebody else's laptop feels slightly broken.

Try them for a day. Give the frecency database a few hours to populate. Get used to `Ctrl-R` opening the fuzzy picker. Then notice, at the end of the day, how many little pauses in your workflow have quietly gone away.
