+++
title = "Vim macros, from record-and-replay to reshaping thousands of lines"
date = "2026-08-09T17:53:54-04:00"
draft = false
description = "A Vim macro is a recorded sequence of keystrokes that you replay against a range, and it is the tool that beats sed, awk, and multi-cursor for irregular structural edits. This is the reference post: recording, replaying, applying over ranges, editing a macro as text in a register, recursive macros, and the specific patterns that make macros a daily tool. Fourth and final in the Vim series."
summary = "A Vim macro is a recorded sequence of keystrokes that you replay against a range, and it is the tool that beats sed, awk, and multi-cursor for irregular structural edits. This is the reference post: recording, replaying, applying over ranges, editing a macro as text in a register, recursive macros, and the specific patterns that make macros a daily tool. Fourth and final in the Vim series."
tags = ["vim", "neovim", "macros", "registers", "developer-tools", "fundamentals", "editor", "automation"]
categories = ["Neovim"]
ShowToc = true

[cover]
image = "/images/og/vim-macros-from-record-and-replay-to-reshaping-thousands-of-lines.png"
hiddenInList = true
hiddenInSingle = true
+++

I once had a text file with 1,400 log lines that all looked like `2023-04-12T09:33:12Z INFO worker=42 msg="thing happened" duration_ms=1247`, and I needed to turn each one into a CSV row. `awk` would have worked, but every line had a slightly different key ordering and I would have been fighting the parser for an hour. Instead I opened the file in Vim, spent about ninety seconds recording a macro that transformed one line into the format I wanted, then ran `:%normal @q` and watched the whole file re-shape itself in under a second. That's the trick this post is about.

*The single most useful question to ask when you catch yourself doing the same edit more than three times in a row is: could I record this once and replay it against everything else?* The answer, almost every time, is yes.

This is the fourth and final post in a Vim series. If you haven't yet read [modal editing](/posts/modal-editing-in-vim-from-scratch/), [motions and text objects](/posts/vim-motions-and-text-objects-the-actual-language/), or [registers](/posts/vim-registers-all-ten-kinds-and-when-each-one-saves-you/), start with those — macros compose all three, and this post assumes you can read a command like `f"lct"foo<Esc>` without stopping to translate. The registers post especially is a prerequisite; macros *are* registers, and everything the register machinery does is available to macro workflows.

## What a macro actually is

A Vim macro is a **sequence of keystrokes stored in a register**, replayable on demand. Recording a macro captures every key you press between "start recording" and "stop recording"; replaying the macro types those keys again as if you were typing them.

Because a macro is just characters in a register, everything else in Vim's register system applies:

- You can `:let @q = "..."` to write a macro by hand.
- You can `"qp` to paste a macro into your buffer as text (to see or edit it).
- You can yank text from your buffer into a register and then execute it as a macro (`"qyy` followed by `@q` — the current line, executed as commands).
- You can share macros between sessions by writing the register to a file.

## Recording — `q<letter>` to `q`

The core loop:

1. Position the cursor at the starting point of the edit you want to record.
2. Press `q<letter>` to start recording — for example, `qa` records into register `a`. Vim shows `recording @a` in the status line.
3. Perform the edit. Every keystroke, motion, and command is captured.
4. Press `q` (without a letter) to stop recording.

The register letter matters: lowercase (`qa`, `qb`) overwrites the register; uppercase (`qA`, `qB`) *appends* to the existing register, which lets you extend a recording later.

**Recipe: convert a config line.** You have lines like `key: "value"` and want them in the form `"key" = "value",`. Cursor at the start of a line:

1. `qq` — start recording into `q`.
2. `i"` — enter Insert mode and type a quote.
3. `<Esc>` — back to Normal.
4. `f:` — jump to the colon.
5. `i"` — insert a quote before it.
6. `<Esc>` — Normal.
7. `l` — advance past the colon (which is now `":`).
8. `r=` — replace the colon with `=`.
9. `A,<Esc>` — append comma at end of line, back to Normal.
10. `j0` — move down one line, to column 0.
11. `q` — stop recording.

Now `@q` on the next line runs the same transformation. `100@q` runs it 100 times. `:%normal @q` runs it on every line in the file.

## Replaying — `@<letter>`, `@@`, and counts

- `@<letter>` — execute the macro in that register once.
- `@@` — repeat the last executed macro. (Shorthand: after `@q`, subsequent `@@` calls re-run `q`.)
- `<count>@<letter>` — execute the macro `<count>` times. `10@q` runs `q` ten times.

**Practical count behavior:** the macro re-runs from its own start on each iteration, but Vim doesn't reset the cursor position. So if the macro ends by moving down a line, `10@q` correctly processes ten consecutive lines. If the macro ends with the cursor still on the same line, `10@q` runs ten times on the same line — usually not what you want.

**The design rule:** end every macro with a *positioning motion* that sets up the next iteration. `j0` (down one, column 0) is the most common ending; `n` (next search match) is the second most common. If the macro is going to be replayed with a count or over a range, ending on a motion is how you make replay meaningful.

## Applying macros over a range — `:normal @<letter>`

Counts get you N sequential replays. Ranges get you any subset of the file.

- `:%normal @q` — run macro `q` on every line in the file.
- `:10,50normal @q` — run on lines 10 through 50.
- `:'<,'>normal @q` — run on the current Visual selection. (After selecting with `V`, `<`/`>` are the start/end marks of the last visual.)
- `:g/pattern/normal @q` — run on every line matching `pattern`.

`:g/pattern/normal @q` is the killer combination. It filters to matching lines and applies the macro to each. If your file has 10,000 lines and 40 of them need a transformation identifiable by a pattern, this is the two-command workflow: `:g/pattern/normal @q` — one to locate, one to transform, and neither requires you to know the line numbers in advance.

**Worked example.** You have a JSON file where every line matching `"status": "pending"` needs to become `"status": "in_progress"`. You could `:%s/"status": "pending"/"status": "in_progress"/g` — that's the substitution approach, and it works when the change is a simple text replacement. But suppose the change is more complex: you need to also update a nearby timestamp on the same line. `:g/"status": "pending"/normal 0f:lct,"in_progress" and rewrite the ts` — er, this is where a recorded macro is far more legible than trying to hand-write a complex `normal`-mode sequence at the command line. Record the transformation once with `qq`, verify it works on one line, then `:g/"status": "pending"/normal @q`.

## Editing a macro — treat the register as text

Macros are text in a register. This means you can edit them.

**Recipe: fix a macro that almost works.** Your macro `q` has a small bug — one motion goes the wrong way. Instead of re-recording:

1. On a scratch line in any buffer, `"qp` — paste the macro as text. You'll see the raw keystrokes, `<Esc>` shown as a special glyph.
2. Edit the pasted text in Normal or Insert mode.
3. Yank the fixed version back into the register: `"qdd` (delete the line into `q`) or `0"qy$` (yank the whole line into `q`).
4. `@q` now runs the fixed version.

**Recipe: write a macro from scratch without recording.**

```vim
:let @q = "0f:c$= \"new\"\<Esc>j0"
```

You wrote the keystrokes as a string and assigned them directly to the register. `\<Esc>` is how you encode a literal Escape inside a string. This is often faster than recording for simple, well-understood edits.

## Recursive macros — one macro calling itself

A macro can call itself. This lets one macro process a file until some condition ends it.

**Setup:**

1. Clear register `q` first — otherwise the recursion will include leftover contents: `qqq` (start recording, immediately stop, into empty).
2. `qq` — start real recording.
3. Do the edit.
4. `@q` — while recording, invoke `q`. This is the recursive call.
5. `q` — stop recording.

`@q` now runs the macro, which recursively invokes itself, running the edit repeatedly until the macro *fails* — which happens when a motion or command can't complete (e.g., `j` at the bottom of the file, or a search with no match).

**When to use recursive macros:** when you want "run this until it can't run anymore" without knowing the count in advance. The macro naturally terminates on the first failure, which is often exactly right.

**When not to use them:** when the terminating condition isn't a natural motion failure. Recursive macros are elegant for "process to end of file" but a footgun if the "end" isn't well-defined — an infinite loop in the recursive case just runs until you hit `<Ctrl-c>` to interrupt.

## Debugging a macro that doesn't do what you expected

Macros are opaque. When one goes wrong, the failure mode is often "it did something surprising to fifty lines before you noticed." Guard against this with a small ritual:

1. **Run the macro on one line first.** `@q` on a single line, look at the result, and only then reach for `:%normal @q`.
2. **Undo is your friend.** If a macro run over 500 lines goes wrong, `u` undoes the entire operation as one unit. You don't have to undo 500 times.
3. **Use `:reg q` to see the macro** as text. Often the bug is a stray keystroke you didn't realize you recorded — an accidental `x` or an escape you thought didn't happen.
4. **Prefer text-object motions to character motions** when recording. `ci"` works even if the cursor drifts within the quotes; `f"lct"` will break if the cursor is somewhere unexpected. Macros that use text objects are more robust across lines with varying shape.
5. **Consider `:set lazyredraw`** during a long macro run — it disables redraw between iterations and can make a 30-second macro run take one second. Set it before, unset after.

## Sharing macros across sessions

Registers persist within a Vim session but by default disappear when you quit. To keep a macro around:

**Option 1: shada / viminfo.** Vim's `viminfo` file (or Neovim's `shada`) persists register contents across sessions. In your config:

```vim
set viminfo='100,f1,<500,:100,@100,/100
```

The `@100` clause says "remember the last 100 macro registers." Now your macros survive `:q`.

**Option 2: manual save.** Put the macro definition in your config:

```vim
let @q = "0f:c$= \"new\"\<Esc>j0"
```

Adding this to `init.vim` / `init.lua` makes register `q` populated at startup every time.

**Option 3: named commands.** If a macro is genuinely reusable, promote it to a `command!` or a function. Macros are for one-off or session-specific work; commands are for durable functionality that belongs in your config.

## The macro-versus-substitute decision

Both macros and `:s` (substitute) transform text; when do you reach for which?

**Substitute wins when:**

- The change is a straightforward text replacement.
- The pattern is regular across every target line.
- The result is deterministic from the match alone.

`:%s/foo/bar/g` — every `foo` becomes `bar`. No macro can be shorter or faster.

**Macros win when:**

- Each edit depends on context — a lookup elsewhere, a computation, a Visual selection.
- The transformation involves structural motions (text objects, marks, jumps).
- The change is easier to *do* once than to *describe* as a regex.
- You need to invoke external commands, register content, or Vimscript expressions in the middle of the edit.

**A middle ground: `:s` with `\=`** lets a substitution call a Vimscript expression, which covers some macro use cases without leaving the substitute-command interface. `:%s/\d\+/\=submatch(0)*2/g` doubles every number in the file. But if the substitution needs to move around, invoke other commands, or make decisions, a macro is the right shape.

## Steelmanning the positions I don't hold

**"Macros are impressive but I'd just use sed / awk / a Python script."** This is the pragmatist objection, and it has real weight. If your transformation is regular, expressible as a regex, and you're going to want it reproducible in CI or a script, the external tool is the right answer. Macros are for interactive, one-off, in-place work. My counter: the reproducibility gap is real, but so is the speed gap in the *other* direction. Recording a macro takes 30 seconds; writing the equivalent `awk` takes five minutes if the pattern is tricky. For a change you're going to do once, in a file open in front of you, the 30-second macro wins even accounting for its lack of reproducibility. Save the script for the change you're going to do a hundred times over the next year.

**"Multi-cursor is the modern replacement."** VS Code, Sublime, Kakoune, and Helix all have multi-cursor: put cursors at N locations, type once, all N cursors receive the input. The strongest form of this argument is that multi-cursor is visible and verifiable — you see every cursor before you type — while a macro is opaque until it runs. My counter: multi-cursor is excellent when the cursor placements are visible and finite. Macros win when the range is large (thousands of lines), the placements are pattern-defined rather than eyeballed, or the edit depends on structural motion within each iteration. The two tools solve overlapping but different problems; the failure mode is choosing multi-cursor for 800 lines of similar-but-not-identical structural edits and spending fifteen minutes managing cursor positions.

**"Language servers and refactoring tools obsolete macros."** Rename-symbol, extract-function, and organize-imports come from an LSP or an IDE, not from a macro. The strongest form of the argument is that structured refactoring is *safer* than text-level macros — the LSP knows about scope, types, and semantics; a macro is just characters. This is entirely correct for refactorings that have LSP support. My counter: most editing is not the kind of refactoring an LSP handles. Reformatting a table, restructuring a config file, converting between data representations, extracting a subset of log lines into a spreadsheet — none of these have LSP support and all of them are macro-shaped work. LSPs and macros solve different classes of problems and both are correct in their class.

## What this post does NOT do

- **It does not teach general Vimscript.** `:help usr_41` is the canonical entry point for programming Vim beyond macros; that's a much larger surface than fits here.
- **It does not cover plugin-defined text objects or motions** used inside macros. Those extend the vocabulary the macro can invoke but are out of scope for a built-in reference.
- **It does not guarantee reproducibility.** Macros captured in one session run in that session; sharing across sessions requires the `shada`/`viminfo` or config-file workflows above, and moving a macro between different Vim/Neovim versions or configs can break if the recorded keys interact with plugins or key remappings.
- **It does not tell you whether to use macros or write a script.** That's a values conversation about how many times you'll run the transformation and how safe the recorded version needs to be.

## Closing distillation

A macro is just a register full of keystrokes you can replay against a range, and once you've internalized that a macro composes every motion, text object, and register from the rest of the series, the entire editor becomes programmable at the speed of typing — no plugin, no language, no build step. Open a file, find any repetitive edit you'd otherwise do by hand, record it with `qq`, verify with `@q` on one line, and then `:%normal @q` — the muscle memory arrives on the first real use, not the tenth.
