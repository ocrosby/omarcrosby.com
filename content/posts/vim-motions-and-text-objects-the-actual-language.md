+++
title = "Vim motions and text objects, the actual language"
date = "2026-08-09T17:53:52-04:00"
draft = false
description = "Motions and text objects are where Vim's productivity actually lives. This post is a full reference — every motion category, every text object, the counts and repeats that combine with them, and worked examples showing why 'change inside quotes' is the command you'll type ten times a day. Second in a four-post series on Vim, following the modal-editing intro and preceding the deep dives on registers and macros."
summary = "Motions and text objects are where Vim's productivity actually lives. This post is a full reference — every motion category, every text object, the counts and repeats that combine with them, and worked examples showing why 'change inside quotes' is the command you'll type ten times a day. Second in a four-post series on Vim, following the modal-editing intro and preceding the deep dives on registers and macros."
tags = ["vim", "neovim", "modal-editing", "motions", "text-objects", "developer-tools", "fundamentals", "editor"]
categories = ["Neovim"]
ShowToc = true

[cover]
image = "/images/og/vim-motions-and-text-objects-the-actual-language.png"
hiddenInList = true
hiddenInSingle = true
+++

I once watched a colleague spend forty-five seconds selecting a JSON value with the mouse, deleting it, and typing a replacement, while I did the same edit with `ci"newvalue<Esc>` — five keystrokes, under a second. He asked how I did it and I answered "change inside quotes." He looked at me like I'd said something in Latin. That gap is what this post exists to close.

Motions and text objects are where the productivity of Vim actually lives. The four modes and the verb-motion grammar from the [first post in this series](/posts/modal-editing-in-vim-from-scratch/) are the scaffolding; motions and text objects are the vocabulary that makes the scaffolding useful. *The single most important question to ask when you catch yourself using arrow keys or the mouse in Vim is: what motion or text object would have described this region in three keystrokes or fewer?* Almost always, there is one.

This is a full reference — every motion I use regularly, every text object worth knowing, and worked examples for the compositions that come up most often. It's the second post in a four-part series; the [modal-editing intro](/posts/modal-editing-in-vim-from-scratch/) comes before it, and [registers](/posts/vim-registers-all-ten-kinds-and-when-each-one-saves-you/) and [macros](/posts/vim-macros-from-record-and-replay-to-reshaping-thousands-of-lines/) come after.

## The grammar, in one line

```text
[count] <verb> [count] <motion-or-text-object>
```

Where a **motion** moves the cursor (and, when combined with a verb, operates on the range from cursor to destination), and a **text object** is a *region defined by structure* rather than by cursor position. The distinction matters: `dw` deletes from your cursor forward to the next word boundary (motion), while `diw` deletes the entire word your cursor is inside regardless of where in the word it sits (text object). The second is almost always what you want.

## Character motions — the smallest hop

The character motions are the ones you use continuously. They're worth being fluent in even though they get overshadowed by their fancier siblings.

- `h` — one character left.
- `l` — one character right.
- `j` — one line down (character in the same visual column).
- `k` — one line up.
- `<count>` prefix — repeat: `5j` is five lines down.

**When to prefer them:** short hops inside a line, tuning position after a jump, adjusting cursor for a delete boundary. **When to reach for something bigger:** anything over three or four characters. If you're typing `jjjjjjj`, use `7j` or a word motion.

## Word motions — the daily driver

Vim distinguishes between a *word* (alphanumerics-plus-underscore) and a *WORD* (any sequence of non-blank characters — capital W is the mnemonic for the bigger unit).

- `w` — forward to the start of the next word.
- `W` — forward to the start of the next WORD.
- `b` — backward to the start of the current or previous word.
- `B` — backward to the start of the current or previous WORD.
- `e` — forward to the end of the current or next word.
- `E` — forward to the end of the current or next WORD.
- `ge` / `gE` — backward to the end of the previous word / WORD.

The `WORD` variant matters when you're editing paths, URLs, or expressions with punctuation. On the string `foo.bar()`, `w` moves five times to get across it (`foo` → `.` → `bar` → `(` → `)`); `W` moves once, treating the whole `foo.bar()` as a single WORD.

Combined with verbs: `dw` (delete word), `cw` (change word — replace and drop into Insert mode), `yw` (yank word). But note the more useful form is almost always the text-object version: `diw`, `ciw`, `yiw` — see below.

## Line motions — beginning, end, first non-blank

- `0` — first character of the line (column 0).
- `^` — first *non-blank* character of the line.
- `$` — last character of the line.
- `g_` — last *non-blank* character (rarely needed, but exists for symmetry).

Verb combinations: `d$` (delete to end of line — same as `D`), `d0` (delete to start of line), `c^` (change from cursor to first non-blank), `y$` (yank to end of line — same as `Y` in the modern Vim default).

**Shortcuts worth internalizing:**

- `D` — delete to end of line (equivalent to `d$`).
- `C` — change to end of line (equivalent to `c$`).
- `Y` — yank to end of line. Note: in classic Vim, `Y` was aliased to `yy` — Neovim and modern Vim default map it to `y$`, matching the `D`/`C` pattern. Check your version if it doesn't work as expected.

## Search motions — the underrated jump

`/foo` searches forward for "foo"; `?foo` searches backward. After the search, `n` repeats in the original direction and `N` repeats in the reverse direction.

What people miss: search is a *motion*, which means it composes with verbs. `d/foo<Enter>` deletes from the cursor to the character before the next "foo." `y/end<Enter>` yanks to the character before the next "end." This is the fastest way to delete a specific range when the endpoint is a distinctive substring — much faster than counting lines or eyeballing distances.

Regex, by default, follows Vim's own dialect. `\v` at the start of a pattern switches to "very magic" mode, which behaves closer to Perl/Python regex — `\vhello.*world` matches "hello" then anything then "world" without needing backslashes on the special characters. If you're already fluent in a modern regex dialect, `\v` is worth building into muscle memory.

## Character-find motions — `f`, `t`, `;`, `,`

The smallest jump-and-do-something family, and one of the highest-leverage sets of keys in Vim.

- `f<char>` — jump *to* the next occurrence of `<char>` on the current line.
- `F<char>` — jump *to* the previous occurrence of `<char>` on the current line.
- `t<char>` — jump *until* (up to but not on) the next `<char>` on the line.
- `T<char>` — jump *until* the previous `<char>` on the line.
- `;` — repeat the last `f`/`F`/`t`/`T`.
- `,` — repeat in the opposite direction.

Combined with verbs: `df,` deletes from the cursor up to and including the next comma. `dt)` deletes from the cursor up to but not including the next `)`. `ct"` changes text up to the next `"` — enter Insert mode ready to replace with something new.

**Worked example.** You're on the line `user := User{Name: "Alice", Age: 30, City: "Boston"}` with your cursor on the `A` of `Alice`. You want to replace `"Alice"` with `"Bob"`.

- `ct"Bob<Esc>` — change up to the closing quote, type Bob, escape. Four keystrokes plus the payload.

Alternative: `ci"Bob<Esc>` (change *inside* quotes). Four keystrokes plus the payload, and works no matter where your cursor is inside the quoted string. This is the text-object version; it's usually the better choice, and we'll cover text objects in the next section.

## Line and file motions — bigger hops

- `gg` — go to the first line of the file.
- `G` — go to the last line of the file.
- `<count>G` or `<count>gg` — go to line number `<count>`. `42G` jumps to line 42.
- `{` — jump to the previous blank-line-separated paragraph boundary.
- `}` — jump to the next paragraph boundary.
- `%` — jump to the matching bracket, paren, or brace. If your cursor is on `(`, `%` jumps to the matching `)` — and vice versa. Works for `[]`, `{}`, and in most languages for keyword pairs like `if`/`endif`.

`%` is worth pausing on: combined with a verb, `d%` deletes an entire balanced block. Cursor on the opening `{` of a function body, `d%` — the whole body is gone.

## Scroll motions — screen versus buffer

Scroll motions move the *view* while the cursor either follows or holds position, depending on the command.

- `<Ctrl-d>` — scroll down half a screen.
- `<Ctrl-u>` — scroll up half a screen.
- `<Ctrl-f>` — scroll forward a full screen.
- `<Ctrl-b>` — scroll back a full screen.
- `zz` — recenter the current line in the window (no scroll of the buffer, just repositioning the view).
- `zt` — put the current line at the *top* of the window.
- `zb` — put the current line at the *bottom* of the window.

`zz` after a jump is a small habit that pays off — you land somewhere with `G` or `/foo`, hit `zz`, and now the context you care about is centered instead of stuck at the bottom.

## Jump list — going back where you were

Vim tracks a *jump list* of cursor positions after long-distance jumps (search matches, `gg`/`G`, `%`, tag jumps).

- `<Ctrl-o>` — jump to the older position in the jump list ("out").
- `<Ctrl-i>` — jump to the newer position ("in").
- `:jumps` — see the list.

Practical usage: you jump somewhere with `/foo`, edit, then `<Ctrl-o>` pops you back to where you were. This is the equivalent of "back" and "forward" for cursor navigation, and it makes exploring a file without losing your place cheap.

There's a separate *change list* accessed with `g;` (older change) and `g,` (newer change), which is often what you actually want — it tracks where you were *editing*, not just where you jumped to.

## Text objects — the actual game-changer

If you learn nothing else from this post, learn text objects. They are the reason Vim is Vim.

A text object is a *structural region* — a word, a sentence, a paragraph, a quoted string, a parenthesized expression, an XML tag. Text objects come in two flavors:

- `i` prefix — **inner**. The content, excluding delimiters or surrounding whitespace.
- `a` prefix — **around**. The content including delimiters or trailing whitespace.

Every text object composes with every verb.

### Word, sentence, paragraph

- `iw` / `aw` — inner word / a word (including trailing whitespace).
- `iW` / `aW` — inner WORD / a WORD.
- `is` / `as` — inner sentence / a sentence.
- `ip` / `ap` — inner paragraph / a paragraph (paragraph includes the blank line after it).

**Worked examples.** Cursor anywhere inside `unusualvariable`:

- `diw` — delete the word (cursor anywhere in it — no need to jump to the start).
- `ciw` — change the word (delete + Insert mode).
- `viw` — visually select the word.

Cursor anywhere inside a sentence:

- `das` — delete a sentence (including its trailing space).
- `cis` — change inside sentence.

### Quoted strings

- `i"` / `a"` — inside / around double-quoted string.
- `i'` / `a'` — inside / around single-quoted string.
- `` i` `` / `` a` `` — inside / around backtick-quoted string.

**Worked example.** You have `msg := "hello world"` and your cursor is anywhere from the `h` to the `d`. `ci"new content<Esc>` gives you `msg := "new content"`. This is the "change inside quotes" command from the opening story. It is worth ten thousand uses.

### Parens, brackets, braces

- `i(` / `a(` — inside / around parentheses. Shortcut: `ib` / `ab` (b for brackets).
- `i[` / `a[` — inside / around square brackets.
- `i{` / `a{` — inside / around curly braces. Shortcut: `iB` / `aB`.
- `i<` / `a<` — inside / around angle brackets.

Cursor inside a function's argument list, `ci(` — clear all arguments and drop into Insert mode. Cursor inside a function body, `di{` — delete the body but keep the braces.

### XML/HTML tags

- `it` / `at` — inside / around a tag. Works for `<div>...</div>`, `<Component>...</Component>`, JSX, XML.

Cursor inside a `<p>...</p>` block:

- `dit` — delete the paragraph text, leave the tags.
- `dat` — delete the whole element including tags.
- `cit` — replace the contents.

If you write JSX or HTML, this pair is worth its weight in gold.

### The takeaway

Text objects are what let you edit *structure* instead of *characters*. A modeless editor asks you to point at where the region starts, hold shift, point at where it ends, and then act. Vim asks you to say what shape of region you want, and it finds the region.

## Counts, ranges, and dot — the multipliers

Every command accepts a count prefix. Every count multiplies the operation.

- `3w` — move forward three words.
- `5dd` — delete five lines.
- `d3w` — delete three words.
- `y5j` — yank the current line and the next five (six lines total).

Counts compose with text objects too: `d3iw` (delete inner word, three times) does what you'd expect, though this is a less common pattern than counted motions.

**The dot command** (`.`) repeats the last change — where "change" is the last modification, not the last motion. So `ciwFoo<Esc>` on one word, then `n` (jump to next search match, if you started with one), then `.` — the same change applies to the new word. Drew Neil calls this the "dot formula": one keystroke to jump, one keystroke to repeat. Practical Vim (2012) has a whole chapter on it.

## Marks — bookmarks in the file

Marks let you set a named position and jump back to it later.

- `m<letter>` — set a mark. Lowercase letters (`ma`, `mb`, ...) are buffer-local; uppercase letters (`mA`, `mB`, ...) are global across buffers.
- `` `<letter> `` — jump to the exact position of the mark.
- `'<letter>` — jump to the first non-blank character of the line the mark is on.
- `:marks` — list all marks.

**Practical use.** You're deep in a file, need to look at something elsewhere, and want to come back. `ma` (mark position `a`), move around, `` `a `` returns exactly.

Marks compose with verbs: `` d`a `` deletes from the cursor to mark `a`. That range can span pages, which makes marks the tool for "delete everything from here to that place I flagged five minutes ago."

## Visual mode as motion — see it, then act

When you're not sure what a motion will select, use Visual mode to see first, then act.

- `v` — character-wise. Extend with any motion.
- `V` — line-wise.
- `<Ctrl-v>` — block-wise (columnar).
- `gv` — re-select the last visual selection.
- `o` (while in Visual mode) — swap cursor between the anchor and the other end of the selection.

Any motion or text object works to extend the selection. `V3j` selects the current line and the next three. `v/foo<Enter>` selects to the next "foo." `vi(` selects the contents of the paren block. Once selected, hit `d`, `y`, `c`, `>` (indent), `<` (outdent), `=` (auto-format), `~` (toggle case), or `gu`/`gU` (lowercase/uppercase).

Block-wise Visual mode with `I` (insert at start of block) or `A` (append at end of block) is Vim's answer to multi-cursor. `<Ctrl-v>3j$A;<Esc>` appends a semicolon to the end of four lines.

## Steelmanning the positions I don't hold

**"Vim motions are just keyboard shortcuts with weird names."** This is the objection I hear most often from developers who tried Vim, learned enough motions to get by, and never got the compose-them-with-verbs habit. Their claim is that any motion has an equivalent in a modern editor (Cmd+Right for end of word, Cmd+Shift+Right to select to end of word, etc.), so the labels are cosmetic. The strongest version of this argument is that if you're going to end up hitting one key per action anyway, it doesn't matter whether the key is `w` or `Cmd+Right`. I hold that this is true for motions in isolation — a motion by itself is roughly the same in either paradigm — and false the moment you combine motions with verbs. `d3w` is one command; the modeless equivalent is `Shift+Cmd+Right` three times followed by `Delete`, and there is no clean way to say "delete inside these quotes" without either grabbing the mouse or navigating carefully to the boundaries.

**"Text objects are too clever — I'd rather see the selection."** This objection comes from people who prefer Visual mode workflows: `v` to start a selection, extend visually, then delete. It's a legitimate style. The strongest form is that "delete inside quotes" is opaque until you know it, while "see the region, then act" is immediately readable. My counter: text objects and Visual mode compose. `vi"` selects inside quotes visually — you get to see it — and then you can act. Text objects are not opposed to visual confirmation; they are a *shorthand* that becomes available once you no longer need the visual confirmation.

**"Regex search is faster than any motion for structured edits."** This is a real position, especially from Emacs users. The strongest form: if you want to change every `foo(...)` to `bar(...)`, `:%s/foo(/bar(/g` is one command that hits every occurrence, versus Vim's motion-based approach of finding each and doing it. I hold that both are correct in their domain. Substitution wins when the pattern is regular across the file; motions and text objects win when each edit is a small variation. The two are complementary, not competitive.

## What this post does NOT do

- **It does not cover registers.** Every yank, delete, and change puts text into a register, and text objects interact with registers in interesting ways (`"ayiw` yanks the word into register `a`). That's the next post.
- **It does not cover macros.** Macros compose motions and text objects into replayable sequences. That's post four.
- **It does not cover plugins that extend the text-object vocabulary** — vim-textobj-user, targets.vim, vim-surround. Those are wonderful but out of scope for a language-level reference.
- **It does not teach LSP-integrated motions** — go-to-definition, find-references. Those are editor-level features layered on top of the motion vocabulary, and they belong in a plugin or LSP-configuration post.

## Closing distillation

Motions are how you move; text objects are how you describe structural regions; verbs act on either — and the whole grammar composes so tightly that once you've internalized it, most edits shrink from "point, click, drag, delete, type" to three or four keystrokes. Open a real file — one you actually work in — and for the next hour, every time you're about to reach for the mouse or an arrow key, stop and ask which motion or text object would describe the region; that's the practice loop that turns the vocabulary into fluency.
