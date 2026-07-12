+++
title = "Why I love Neovim"
date = 2026-07-12T15:43:04-04:00
draft = false
summary = "The case for Neovim from someone who spent thirty-plus years on vi and years on JetBrains before finally trying it — not because either was broken, but because Neovim's customizability makes your editor a Personal Development Environment in a way IDEs can't match. With concrete examples from the yoda.nvim distribution."
tags = ["neovim", "vim", "developer-tools", "personal-development-environment", "customization", "editor"]
categories = ["Neovim"]
ShowToc = true

[cover]
image = "/images/og/why-i-love-neovim.png"
hiddenInList = true
hiddenInSingle = true
+++

A colleague asked me what editor I used. At the time I was living inside JetBrains — I'd cycled through a few of their IDEs over the years, whichever one matched the language I happened to be writing. He asked why I hadn't ever tried Neovim.

I'd been a vi user for over thirty years before JetBrains got its hooks in me — going back to a university terminal in the early nineties. Neovim wasn't a new name to me. Every few years someone would suggest it and I'd give them the same answer: my setup is fine, I don't need another editor to learn. I gave him the same one.

The difference this time was that I watched him work for a few minutes.

Six months later I have a Neovim configuration I wrote myself, cross-referenced with a family of plugins I built to fit my brain, and when I open a JetBrains IDE for a work task now, it feels the way it feels driving a rental car — everything is *fine*, but nothing is where my hands expect it to be.

This post is the case I wish someone had made to me sooner. Not that vi is bad. Not that JetBrains is bad. Not that Neovim is objectively better. That the customizability Neovim unlocks turns your editor into something none of the mainstream IDEs can be: a Personal Development Environment.

## What vi already gave me

Thirty years of vi will earn you a set of things that are genuinely hard to replicate. Modal editing means your fingers stay on the home row and your intent gets translated to text at the speed you think. You get muscle memory that survives OS reinstalls, distro switches, and the transition from a laptop to somebody else's server over SSH. You get a command language whose grammar has been stable for the entire time — the commands I learned in a university terminal in the early nineties still work exactly the same today. You get an editor that lives on every Unix box that has ever existed.

None of that is nothing. When people say "just switch to a modern IDE," they're not accounting for the cost of throwing all of that away.

But vi has a ceiling. It never learned about the language server protocol. It doesn't know what a treesitter parse tree is. Its plugin story is patchable but tired. When I started working with modern Python and Go codebases seriously, I moved to JetBrains for that work — it gave me the language intelligence vi never would, and I kept vi around for editing configs, quick fixes on remote servers, and anything where firing up a full IDE was overkill. Two editors, two mental models, one workflow.

That was my setup when my colleague suggested Neovim.

## The frame that clicked: personal development environment

The phrase I keep coming back to is one TJ DeVries coined a while back — **Personal Development Environment**, or [PDE](https://www.youtube.com/watch?v=QMVIJhC9Veg). It's a distinction that took me a few weeks to feel in my hands, but once it landed, everything else about Neovim started making sense.

Here's the shift.

VSCode and JetBrains are *products*. A vendor decides what the editor's shape is — where the sidebar goes, how the command palette works, which languages have first-class support, which patterns of workflow are cheap and which are expensive. You customize inside the boundaries the vendor drew. Every time you outgrow one, you file a feature request, hunt for an extension, or accept it.

Neovim isn't a product. It's a *set of primitives*. Windows, buffers, keymaps, autocommands, the LSP client, the treesitter API — these are exposed to you as a Lua programming interface. Your config isn't a JSON file you tweak; it's a Lua program you write. There is no boundary between "the editor" and "your setup." Your Lua program *is* the editor. When you install Neovim, you get a set of building blocks and an instruction manual. What you build with them is what you use.

That difference sounds academic until you've felt it. Once you have, going back to a product-editor feels like renting again after buying.

## What Neovim does that VSCode and JetBrains can't easily do

Five concrete things, each of which I use in my own config every day. Each one is not just "possible" in Neovim but *cheap* — worth a few minutes of Lua rather than a plugin submission, an extension review, or a workaround.

**1. LSP is a primitive, not a plugin.** Language server support is built into Neovim itself. As of Neovim 0.11, `vim.lsp.config` lets you point at any language server binary and configure it in a few lines of Lua — no wrapper plugin, no third-party abstraction layer, no marketplace review. In VSCode every LSP integration lives inside an extension the vendor ships; when it breaks, you file a bug and wait. In JetBrains, first-class language support is a paid Ultimate feature. In Neovim, `vim.lsp.config("gopls", { … })` is a line in your config.

**2. Every keymap is per-scope.** Global, per-filetype, per-project, per-buffer. My config splits keymaps into sixteen files organized by domain — one for Python, one for Go, one for Rust, one for TypeScript, one for git, one for testing, one for debugging, and so on. When I'm in a `.py` buffer, the LocalLeader mappings mean something completely different than when I'm in a `.go` buffer. VSCode's `keybindings.json` is a flat file by design; scoping is available via the `when` clause but tuning it feels like fighting a form.

**3. You can write your own plugins in an evening.** I've written six of them so far — `yoda.nvim-adapters`, `yoda-core.nvim`, `yoda-logging.nvim`, `yoda-terminal.nvim`, `yoda-window.nvim`, and `yoda-diagnostics.nvim` — each solving a real problem I'd hit. Each one is a Lua module I could iterate on locally without publishing anywhere. The VSCode equivalent is a `package.json`, a webpack build, a publisher account, and a marketplace review. The JetBrains equivalent is worse. In Neovim, "I need this thing to behave differently" and "I have written a plugin that behaves differently" are twenty minutes apart.

**4. Multi-project state is yours to model.** I work in several Python codebases in a given session, each with its own `.venv`. In my Neovim config, a closure resolves each buffer's `cwd` at test-time so `neotest` and `nvim-dap-python` pick the correct interpreter per project — one session, many projects, correct behavior. VSCode expects one workspace per venv. JetBrains expects one project window per venv. Neovim treats "how do I decide which virtualenv this file is in" as a decision I get to make, not a decision the editor makes for me.

**5. AI integration on your terms.** I use Claude Code inside Neovim via `claudecode.nvim`, wrapped in a custom `yoda-window.nvim` module that intelligently expands the Claude pane into the space freed up when the dashboard closes. When my file explorer sidebar is open, Claude respects it. When it isn't, Claude gets the whole right column. This layout decision took me an afternoon. In VSCode, the AI pane is exactly where the extension author put it — no argument.

Each of those is a specific behavior I've built into my editor because I could. None of them required a vendor's permission.

## What yoda actually is

The distribution I've been referring to is [yoda.nvim](https://github.com/jedi-knights/yoda.nvim) — the concrete instance of my PDE. It isn't the point of this post; I've written a [separate deep dive](/posts/modular-neovim-distribution-yoda/) on how the modular plugin family fits together internally. Here I only want it to be evidence that "customizability" isn't a marketing word.

Roughly, yoda categorizes what it does across:

- **LSP + diagnostics** — native `vim.lsp.config` per language server (gopls, lua_ls, ts_ls, basedpyright, yamlls, marksman, and a handful of specialty servers), with `rustaceanvim` handling the Rust special case.
- **Completion** — `blink.cmp` with per-filetype tuning (lazydev completions on in Lua, off in Python).
- **Fuzzy finding** — `mini.pick` plus `mini.extra` for extended pickers. About a third the size of `fzf-lua` and a fraction of Telescope.
- **Testing infrastructure** — `neotest` with adapters for pytest, cargo, jest, vitest, and Go, plus the multi-project venv resolver mentioned above.
- **Debugging** — `nvim-dap-python`, `nvim-dap-go`, and `rustaceanvim` for Rust, each project-aware.
- **AI integration** — `claudecode.nvim` composed with `yoda-window.nvim`'s `reclaim_width` for pane expansion.
- **Six custom `yoda-*` foundation plugins** — adapters, core, logging, terminal, window, and diagnostics — each independently useful, each independently testable.
- **Sixteen per-domain keymap modules** (~1,029 lines of Lua) grouped by concern rather than by feature.

In numbers: **8,472 lines of Lua across 70 files, with 23 plugin specifications**, on top of a plugin manager (`lazy.nvim`) and a native LSP client I don't have to think about. That's more surface than a small project has any business owning, and yet — because Neovim's Lua API is what it is — every one of those lines was quick to write, easy to change, and painless to audit. Numbers land more credibly than adjectives.

Two honest notes. There are excellent fellow modal editors — Helix, Emacs with evil-mode — and I've watched both from a distance. Neovim still won for me on ecosystem depth and the fact that Lua is a serious extension language, not a bolted-on afterthought. And yoda is not what you should start with. It's what I got to after a lot of iteration.

## Isn't this a lot of work?

Yes. Some.

If you already have modal editing from vi or vim, you're most of the way there — the muscle memory transfers directly and you skip the hardest part of the learning curve. If you don't, expect the first weekend to feel awkward, the first month to feel useful, and about a quarter before it starts feeling like it fits you the way a well-broken-in tool does. But the compounding is real: every custom keymap you write saves five to ten seconds a hundred times a day. The math on that is fast to break even.

You don't have to start from scratch, either. I strongly recommend one of these on-ramps:

- **[kickstart.nvim](https://github.com/nvim-lua/kickstart.nvim)** — a single well-commented `init.lua` designed to be read, not just installed. Best learning-oriented starting point I know of.
- **[LazyVim](https://www.lazyvim.org/)** — batteries-included distribution with sensible defaults. Fastest path to a productive setup.
- **[NvChad](https://nvchad.com/)** — opinionated and beautiful. Good if you want a working editor first and to hack later.

Pick one. Don't try to build yoda on day one. Live inside the on-ramp for a month, notice what annoys you, and start replacing pieces. That's how everyone I know got here — including me. I started with kickstart.nvim and read it end to end. When the single-file shape started feeling cramped, I moved to [kickstart-modular.nvim](https://github.com/dam9000/kickstart-modular.nvim) — the same starting point, split across a directory tree the way real Neovim configs eventually want to live. A few months of that and I understood enough to start from scratch. That's what yoda is now. Kickstart taught me the primitives. Kickstart-modular taught me the shape. Starting over taught me my own opinions.

One more resource I'd strongly recommend if the "read the config end to end" advice feels intimidating: typecraft's [From 0 to IDE in Neovim from scratch](https://www.youtube.com/playlist?list=PLsz00TDipIffreIaUNk64KxTIkQaGguqn) series on YouTube. The exact combination I'd hand a friend today is [kickstart.nvim](https://github.com/nvim-lua/kickstart.nvim) as your starting `init.lua`, opened in Neovim, and the typecraft series playing on the other monitor. I walked through it exactly that way and it was the single most useful thing I did to internalize what Neovim's Lua API actually enables. Several hours of investment across the episodes; the payoff is that you stop copying Lua code you don't understand and start writing Lua you do.

## Try it

If you've read this far and any of it landed, here's the practical version.

Install Neovim (`brew install neovim` on macOS, `apt install neovim` or your package manager elsewhere — check that you're on 0.11 or newer). Clone kickstart.nvim into `~/.config/nvim`. Open it. Read it. Give it two weeks of your real work. If you want to see what a mature PDE looks like once you've settled in, [yoda.nvim](https://github.com/jedi-knights/yoda.nvim) is on GitHub — not as a distribution to install, but as an existence proof.

I spent over thirty years thinking my editor was fine. It was. Neovim didn't fix a problem I had — it revealed a category of problems I didn't know were solvable. Somewhere between "my config is a Lua program I write" and "my AI assistant respects the layout of my file explorer sidebar because I told it to," the editor stopped being a place I go to type code and started being a place I go to think.

That's the pitch. If it sounds appealing, you already know what to do.
