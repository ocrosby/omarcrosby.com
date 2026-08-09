+++
title = "Vim registers, all ten kinds and when each one saves you"
date = "2026-08-09T17:53:53-04:00"
draft = false
description = "Vim has ten kinds of registers — unnamed, numbered, named, small-delete, read-only, expression, selection, black-hole, alternate-file, and last-search. Most Vim users know two of them and lose work to the other eight. This is the reference post: what each register is for, when it saves you, and the concrete recipes that turn registers from trivia into a daily tool. Third in a four-part Vim series."
summary = "Vim has ten kinds of registers — unnamed, numbered, named, small-delete, read-only, expression, selection, black-hole, alternate-file, and last-search. Most Vim users know two of them and lose work to the other eight. This is the reference post: what each register is for, when it saves you, and the concrete recipes that turn registers from trivia into a daily tool. Third in a four-part Vim series."
tags = ["vim", "neovim", "registers", "clipboard", "developer-tools", "fundamentals", "editor"]
categories = ["Neovim"]
ShowToc = true

[cover]
image = "/images/og/vim-registers-all-ten-kinds-and-when-each-one-saves-you.png"
hiddenInList = true
hiddenInSingle = true
+++

Here is the moment that made me learn registers properly. I yanked a block of code, moved somewhere else, and did a small `x` to delete a stray character before pasting. When I hit `p`, I got back the stray character. My yanked block was gone, replaced by a single letter, because every delete in Vim — even a one-character `x` — overwrites the same "clipboard" you just yanked into. I said something unprintable, undid, and looked up how to make Vim stop doing this. That's how I learned Vim has ten kinds of registers, and I'd been using two.

*The single most useful question to ask about a Vim register workflow is: which register is about to be overwritten by the next operation, and is that the one I want to overwrite?* If the answer is "I don't know," the next paste is going to surprise you.

This post is the reference. Every register category, when each one saves you, and the concrete recipes that make registers a daily tool instead of a curiosity. It's the third post in a four-part Vim series; if you haven't yet read the [modal-editing intro](/posts/modal-editing-in-vim-from-scratch/) or the [motions and text objects reference](/posts/vim-motions-and-text-objects-the-actual-language/), start there. [Macros](/posts/vim-macros-from-record-and-replay-to-reshaping-thousands-of-lines/) is post four, and macros are recorded into registers, so this post is a prerequisite for that one.

## What a register actually is

A register in Vim is a **named slot that holds text and (usually) a "type"** — character-wise, line-wise, or block-wise. Every yank, delete, and change writes to at least one register. Every put (`p` / `P`) reads from a register — by default, the *unnamed* register, but you can name any register with a `"<name>` prefix.

The syntax to name a register:

- `"ay` yanks into register `a`.
- `"ap` puts from register `a`.
- `"Ay` *appends* to register `a` (uppercase = append).
- `:reg` lists all populated registers.
- `:reg a b c` lists specific ones.

That prefix — `"<letter>` — is the piece most users never learn, and it's the doorway to everything below.

## The ten categories

Vim organizes registers into ten categories. `:help registers` in your editor lists them all with an authoritative one-liner each; this post walks through them in the order that matters for daily work.

### 1. The unnamed register — `""`

**What it is:** the default. Every yank, delete, or change without an explicit register writes here. Every `p` or `P` without an explicit register reads from here.

**Failure mode:** the one I opened with. You yank a valuable region, then do any delete — even `x` for one character — and the unnamed register is overwritten. Your yank is gone.

**How to see it:** `:reg "` shows the current unnamed contents. It's also always the same as either the last yank register (register `0`) or one of the small-delete/numbered registers, so you rarely need to inspect it directly.

**When it's the right choice:** the majority of edits. Yank, move, paste — the unnamed register handles it. Just know when to switch.

### 2. The numbered registers — `"0` through `"9`

The numbered registers are the second-most-useful category and the one that saves you from the failure mode above.

**Register `0` — the yank register.**

Every yank goes into `"0` in addition to the unnamed register. Deletes do *not* go into `"0`. This means: after any delete, your last yanked text is still in `"0`, unharmed.

Recovery for the opening scenario: I yanked a block, deleted a character, hit `p` and got junk. `u` to undo, then `"0p` — the yanked block reappears.

**Register `1` — the last delete of a full line, paragraph, or larger.**

When you delete something larger than one line (`dd`, `d}`, `dG`, etc.), it goes into `"1`. Small deletes (`x`, `dw`, `d$`) do *not* go here — they go into the small-delete register (see below).

**Registers `2` through `9` — the delete history.**

Each large delete shifts the previous `"1` into `"2`, `"2` into `"3`, and so on. So `"1` is your most recent large delete, `"2` is the one before that, and so on down to `"9`.

**Practical recovery:** you deleted a function three deletes ago. `:reg 1 2 3` shows the last three; `"3p` puts back the one you want.

### 3. The small-delete register — `"-`

**What it is:** the target for deletes *smaller than one line* — `x`, `dw`, `di"`, `d$`. Anything that stays within a line.

**Why it exists:** to protect the numbered `"1`–`"9` history from being polluted by every one-character delete. If small deletes went into the numbered stack, the delete history would be useless.

**When it saves you:** you `x`'d something you meant to keep. `"-p` puts it back — even after subsequent yanks or deletes have moved through the unnamed register.

### 4. Named registers — `"a` through `"z`

These are yours. Vim never writes to them without you asking. Twenty-six slots you can name explicitly.

- `"ay` yanks into `a`.
- `"ap` puts from `a`.
- `"Ay` appends to `a` (uppercase = append instead of overwrite).

**Recipe: multi-slot clipboard.** You need to move four pieces of code from all over a file into a new file. Yank each into its own named register:

- Cursor on region 1, `"ayip` (yank paragraph into `a`).
- Move to region 2, `"byip`.
- Move to region 3, `"cyip`.
- Move to region 4, `"dyip`.

Now open the new file, and `"ap`, `"bp`, `"cp`, `"dp` place them in order. Four independent yanks, held simultaneously.

**Recipe: append to a growing collection.** You're gathering all lines matching a pattern into a scratch buffer. On each match, `"Ayy` — capital A appends the current line to register `a` without overwriting. When you're done, `"ap` in another buffer pastes the whole accumulated collection.

**Recipe: keep something safe for the whole session.** You have a snippet you'll paste twelve times over the next hour. `"sy` (or any letter) puts it into a named register that no ambient delete will touch. Every `"sp` reproduces it exactly, no matter how much unrelated editing has happened in between.

### 5. The read-only registers — `":`, `".`, `"%`, `"#`

These four registers are populated by Vim automatically and are *read-only from user commands* — you can't yank into them, only read from them.

**`":` — the last executed Ex command.**

Everything you typed after a `:`. Useful for repeating and modifying complex commands. `":p` pastes it into the buffer as text; `@:` re-executes it (see macros).

**`".` — the last inserted text.**

Whatever you typed most recently in Insert mode. `".p` reinserts it as text. Practical use: you typed a long string, escaped, moved, and want the same string in another place — `".p`.

**`"%` — the current file's name.**

`:reg %` shows the path. `"%p` pastes the current file path into the buffer. Useful when composing commit messages, doc references, or shell commands referencing the file you're in.

**`"#` — the alternate file's name.**

The file you were in before this one — the one you'd flip to with `<Ctrl-^>`. `"#p` pastes its path.

### 6. The expression register — `"=`

The one most people never touch, and one of the most powerful once you do.

**What it is:** an evaluator. Type `"=` then a Vimscript expression, hit Enter, and the *result* of the expression becomes the register's contents.

**Recipe: paste the result of arithmetic.** You need `86400` (seconds in a day) in your code. Enter Insert mode, then `<Ctrl-r>=60*60*24<Enter>` — the calculation runs and `86400` appears in the buffer. `<Ctrl-r>` in Insert mode reads a register; `=` targets the expression register; the expression evaluates and the result is inserted.

**Recipe: paste the current date.**

```text
<Ctrl-r>=strftime("%Y-%m-%d")<Enter>
```

Inserts today's date in ISO format. Useful in headers, changelogs, front matter.

**Recipe: paste a computed filename.**

```text
<Ctrl-r>=expand("%:t:r") . "_test.go"<Enter>
```

Takes the current file's basename without extension, appends `_test.go`, and inserts it. Handy for scaffolding.

This register is a full Vimscript evaluator — anything Vimscript can compute, `"=` can produce.

### 7. The selection registers — `"*` and `"+`

These are the interface to the system clipboard, and their behavior differs by platform in ways that catch people out.

- **`"*` — the primary selection** on X11 systems (Linux with X). Text is added here by highlighting with the mouse; you paste it by middle-clicking. On macOS and Windows, `"*` is aliased to the clipboard.
- **`"+` — the system clipboard.** The Cmd-C / Ctrl-C clipboard on every OS.

**Practical use:**

- `"+y` yanks the current selection into the system clipboard, ready to Cmd-V / Ctrl-V into any application.
- `"+p` pastes from the system clipboard into the buffer.
- `"*y` yanks into the X11 primary selection (Linux) — ready for a middle-click.

**Platform gotcha:** on many Linux systems, Vim is compiled without clipboard support, and `"+y` silently does nothing. Check with `:echo has("clipboard")` — if it prints `0`, you need a build of Vim with the `+clipboard` feature (or use Neovim, which handles this via external provider tools). Neovim requires `xclip`, `xsel`, `wl-copy`, or `pbcopy` on the PATH depending on your OS; `:checkhealth` will tell you which one is missing.

**Ergonomic shortcut:** many people set `set clipboard=unnamedplus` in their config, which makes the unnamed register *alias* to `"+` — every yank goes to the system clipboard automatically. This is convenient but does mean that Vim yanks pollute your system clipboard history; whether that's a bug or a feature depends on your workflow.

### 8. The black-hole register — `"_`

**What it is:** a write-only, drop-everything register. Text sent here disappears.

**Why it matters:** every delete in Vim overwrites the unnamed register. If you want to delete without disturbing your carefully-yanked content, send the delete to the black hole.

- `"_dd` — delete the current line, and do not overwrite the unnamed register.
- `"_diw` — delete the word, unnamed register untouched.
- `"_x` — delete a character without polluting `"-` (the small-delete register).

**Recipe: paste-then-delete-original.** You want to move a line by yanking, going somewhere, pasting, and then coming back to delete the original — but the delete would clobber your yank. The workaround people often reach for is a named register (`"ay`, move, `"ap`, come back, `dd`). The black-hole workaround: yank normally, paste normally, then `"_dd` on the original. The unnamed register keeps the yanked text through the delete.

**Recipe: default all deletes to black-hole.** Some people remap:

```vim
nnoremap d "_d
nnoremap D "_D
nnoremap x "_x
```

Which turns every delete into a "just get rid of it" operation, and forces you to think about yanking explicitly when you actually want to keep something. This is a controversial config choice — it breaks the numbered-register history, which some workflows depend on — but it eliminates the failure mode from the opening story entirely.

### 9. The last-search register — `"/`

**What it is:** the pattern of the most recent `/` or `?` search.

**Why it's useful:**

- `"/p` pastes the last search pattern into the buffer as text. Great for building `:%s/<same-pattern>/replacement/g` commands: search first, confirm it matches what you want, then start a substitute and paste the pattern with `<Ctrl-r>/`.
- `<Ctrl-r>/` in Insert mode inserts the last search pattern.
- `:let @/ = ""` clears search highlighting programmatically.

**Recipe: search-then-substitute without retyping.**

1. `/some_pattern` to search and verify.
2. `:%s//replacement/g` — note the empty pattern between the first two slashes. When the pattern field is empty, Vim uses `@/`, which is the last search. So this substitutes your just-verified pattern.

This is how you write regex substitutions safely: test the pattern with `/` first, then substitute with an empty pattern to reuse it.

### 10. Registers you rarely need but should know exist

- `"~` — the last inserted text from a drop operation (drag-and-drop into gVim, mostly).
- `"_` — already covered as the black-hole.
- The `"<0-9>` numbered registers are shown above; the numbered stack applies only to deletes larger than a line.

For most workflows, if you don't recognize a register from `:reg`, it's safe to ignore it. `:help registers` has the exhaustive list, and it's shorter than you'd expect.

## The `:reg` and `:reg <letters>` commands

`:reg` (or `:registers`) shows every populated register with a preview of its contents. `:reg abc"` limits the output to those specific registers. Any time you're about to paste and are not 100% sure what's there, `:reg` first.

The output looks like:

```text
Type Name Content
  c  ""   this is a character-wise yank
  l  "0   line-wise\n
  c  "-   x
  l  "1   deleted paragraph...\n
  l  "a   my saved snippet\n
```

The `Type` column tells you if the register is character-wise (`c`), line-wise (`l`), or block-wise (`b`). This matters for paste behavior:

- Line-wise put (`p`) inserts on the line below the cursor as a full new line.
- Character-wise put inserts right after the cursor.
- Block-wise put inserts as a rectangular block.

If you paste and it goes in the wrong shape, the register was a different type than you assumed. Convert with `:let @a = substitute(@a, '\n', '', 'g')` or similar.

## Inserting a register from Insert or Command mode — `<Ctrl-r>`

Registers aren't only usable in Normal mode. In Insert mode and on the Ex command line, `<Ctrl-r><register>` inserts the register's contents.

- `<Ctrl-r>0` in Insert mode inserts the last yank without leaving Insert mode.
- `<Ctrl-r>a` inserts named register `a`.
- `<Ctrl-r>%` inserts the current filename.
- `<Ctrl-r>/` inserts the last search.
- `<Ctrl-r>=` opens the expression register prompt.

This is one of the most useful power-user tricks in the editor. You're mid-sentence in a commit message, need the filename, `<Ctrl-r>%` — done, no mode switch.

## Steelmanning the positions I don't hold

**"Just set `set clipboard=unnamedplus` and stop thinking about registers."** This is the pragmatist objection: aliasing the unnamed register to the system clipboard eliminates 80% of the friction, at the cost of polluting your OS clipboard with every yank. The strongest form is that most edits don't need multi-register plumbing, so the simpler setup wins for most workflows. My counter: aliasing to the clipboard is a great default and I run with it, but the register system is what saves you when the default isn't enough — when you need to hold four snippets, or append to a collection, or delete without losing your yank. Turning off registers because you don't use them daily is like turning off cross-references in a book because you don't use them daily.

**"Registers are a UI failure — modern editors have multi-clipboard as a first-class feature."** Emacs has the kill-ring, VS Code has clipboard history extensions, JetBrains IDEs have paste-from-history. The strongest form of this argument is that "how many clipboards do you want?" is better UX than "here's a register-naming syntax." I hold this is partly true — the discoverability of Vim's registers is genuinely bad, and `:help registers` is the only real onramp — and partly missing the point. Vim's registers aren't just multi-clipboard; they're programmable slots that integrate with the expression evaluator, the search history, the file system, and macros. The kill-ring can't hold a macro. The expression register can compute the paste content on the fly. That composition is what registers buy you, and no modern editor's clipboard-history feature comes close.

**"You don't need registers if you use `undo`."** Some workflows lean on Vim's undo tree (`:undolist`, `<Ctrl-o>` through history) to recover deleted content instead of managing registers. The strongest form: undo is universal, cheap, and doesn't require memorizing register letters. My counter: undo reverts your edit history, which means recovering a lost yank requires undoing everything you did after it. Registers let you recover *just* the yanked text without touching the intervening edits. Undo is a big hammer; the numbered registers are a scalpel for the same problem.

## What this post does NOT do

- **It does not cover macros.** Macros are stored in registers — `qa` records into register `a`, `@a` replays it — so this post is a prerequisite, but macro workflow deserves its own post. That's post four.
- **It does not teach clipboard integration setup.** The `:h clipboard` and `:checkhealth` output are the authoritative onramp for whichever OS you're on.
- **It does not cover plugin-managed registers** — vim-yoink, vim-yankstack, and similar plugins that layer clipboard-history semantics on top of registers. Those are legitimate ergonomic wins but out of scope for the built-in reference.
- **It does not tell you which register-management style to adopt.** Whether to default deletes to black-hole, whether to alias unnamed to system clipboard, whether to build muscle memory around numbered registers — those are personal-style calls that depend on how much you edit and how much system-clipboard integration you need.

## Closing distillation

Vim registers are ten programmable text slots that together turn "clipboard" from a single overwrite-on-every-delete slot into a workspace where deletes, yanks, computed values, filenames, search patterns, and system-clipboard content all coexist without stepping on each other — and the two commands that unlock them are `:reg` to see what's there and `"<letter>` before any yank, delete, or put to name your slot. Open your editor now, do a few yanks and deletes, and run `:reg` after each one; the mental model that emerges from actually watching the registers move is worth ten readings of this post.
