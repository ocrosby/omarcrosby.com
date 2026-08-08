+++
title = "grep, sed, and awk: a practical introduction for Mac users"
date = "2026-08-08T13:26:24-05:00"
draft = false
description = "A hands-on first tour of grep, sed, and awk for people new to the macOS terminal — what each one is for, copy-pasteable examples, and the BSD gotchas that trip up newcomers."
tags = ["developer-tools", "fundamentals", "productivity", "grep", "sed", "awk", "macos"]
categories = ["Terminal Tooling"]

[cover]
image = "/images/og/grep-sed-and-awk-a-practical-introduction-for-mac-users.png"
hiddenInList = true
hiddenInSingle = true
+++

You export a report from some web app and it hands you a 40,000-line CSV. You need three columns out of it, only the rows from last Tuesday, with one misspelled city name fixed throughout. You *could* open it in a spreadsheet, wait for the beachball, scroll, sort, find-and-replace, and export again. Or you could describe the whole job in one line of text and get the answer before the spreadsheet finishes loading.

That line of text is where `grep`, `sed`, and `awk` earn their keep. They are three of the oldest tools on your Mac — they predate the Mac itself — and once they click, they turn the terminal from an intimidating black box into the fastest text editor you own.

*The single most useful thing to know before you start is which of the three to reach for, and that maps cleanly onto three verbs: `grep` **finds** lines, `sed` **changes** lines, and `awk` **understands** lines as columns.* Almost everything else in this post is detail hanging off those three verbs. Keep them in your head and the rest follows.

A quick note on lineage, because it explains the odd names. `grep` comes from a command in the old `ed` editor — `g/re/p`, "globally search a regular expression and print" — and was split out by Ken Thompson in the early 1970s. `sed` is the "stream editor," written by Lee McMahon at Bell Labs. `awk` is named for its three authors — Alfred Aho, Peter Weinberger, and Brian Kernighan — who published it in 1977. You are learning tools that have survived fifty years of churn because they got the fundamentals right.

## Before you start: one file and one macOS caveat

Every example below runs against a single small log file so you can follow along. Create it by pasting this into your terminal (Terminal.app or iTerm, it doesn't matter):

```bash
cat > server.log <<'EOF'
2026-08-01 10:15:02 INFO  user=alice action=login ip=192.168.1.10
2026-08-01 10:16:45 ERROR user=bob action=login ip=10.0.0.5 msg="bad password"
2026-08-01 10:17:12 INFO  user=carol action=upload ip=192.168.1.22 bytes=48213
2026-08-01 10:18:03 WARN  user=alice action=upload ip=192.168.1.10 bytes=1048576
2026-08-01 10:19:55 ERROR user=dave action=delete ip=10.0.0.9 msg="not authorized"
EOF
```

Now the caveat, stated up front because it is the single biggest source of confusion for newcomers: **the versions of these tools that ship with macOS are the BSD variants, not the GNU variants you'll find in most tutorials written for Linux.** For everyday use they behave identically. But a handful of flags differ, and one of them — `sed -i` — will bite you the first time you try to edit a file in place. I'll flag each difference as it comes up and collect them all at the end.

## grep — find the lines you care about

`grep` reads text and prints only the lines that match a pattern. That's the whole idea. The simplest form is `grep PATTERN FILE`:

```bash
grep ERROR server.log
```

```text
2026-08-01 10:16:45 ERROR user=bob action=login ip=10.0.0.5 msg="bad password"
2026-08-01 10:19:55 ERROR user=dave action=delete ip=10.0.0.9 msg="not authorized"
```

Two error lines out of five, and you didn't have to read the other three. A few flags turn this from a party trick into a daily habit:

```bash
grep -i error server.log     # -i: case-insensitive, matches ERROR, error, Error
grep -n ERROR server.log     # -n: prefix each match with its line number
grep -c login server.log     # -c: just count the matching lines (prints 3)
grep -v INFO server.log      # -v: invert — print lines that DON'T match
```

`-v` is the one people underuse. "Show me everything that isn't routine noise" is often more useful than "show me the one thing I'm looking for."

Where `grep` stops being a novelty is when you point it at a whole project instead of one file. `-r` recurses into a directory, and combined with `-n` it becomes the fastest way to answer "where in this codebase is X?":

```bash
grep -rn "TODO" .
```

That walks every file under the current directory (`.`) and prints `path:line:text` for every `TODO` it finds — clickable in most terminals and editors.

Finally, patterns can be *regular expressions* — a small language for describing shapes of text rather than exact strings. Turn it on with `-E`, and use `-o` to print only the matched part instead of the whole line:

```bash
grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' server.log | sort -u
```

```text
10.0.0.5
10.0.0.9
192.168.1.10
192.168.1.22
```

That pattern reads as "one-to-three digits, a dot, three times over, then one-to-three more digits" — i.e. an IP address. `sort -u` at the end dedupes them. You just extracted every unique IP from a log without writing a program.

> **macOS note:** many Linux tutorials use `grep -P` for "Perl-compatible regular expressions" (which enable niceties like `\d` for digits). BSD grep on macOS does **not** support `-P`. Use `-E` and spell out `[0-9]` instead, or install GNU grep (see the end).

## sed — change the lines as they stream past

If `grep` is a filter, `sed` is a tiny assembly line: text flows in one end, `sed` applies an edit to each line, and the edited text flows out the other. Its most common instruction by far is substitution, written `s/old/new/`:

```bash
sed 's/INFO/NOTICE/' server.log
```

Every `INFO` becomes `NOTICE` in the output. Crucially, **this does not touch `server.log` on disk** — `sed` prints the edited version to the screen and leaves the file alone. That's a feature: you get to see the result before you commit to it.

By default `s/old/new/` replaces only the *first* match on each line. Add a `g` (for "global") to replace all of them:

```bash
sed 's/user/member/g' people.csv
```

`sed` can also select lines rather than edit them. `-n` silences the default "print every line" behavior, and `p` explicitly prints — together they let you pull out a range, like `head` and `tail` combined:

```bash
sed -n '2,3p' server.log      # print only lines 2 through 3
```

And `d` deletes lines that match a pattern (the pattern goes in `/slashes/` before the `d`):

```bash
sed '/INFO/d' server.log      # print everything EXCEPT the INFO lines
```

Now the part that trips up every newcomer. To make `sed` edit a file **in place** — actually rewriting it on disk — you use `-i`. On Linux (GNU sed) that's simply `sed -i 's/.../.../ ' file`. **On macOS, `-i` requires an argument telling it what backup extension to use**, and if you want no backup you must pass an explicit empty string:

```bash
sed -i '' 's/foo/bar/g' file.txt      # macOS: edit in place, no backup
sed -i.bak 's/foo/bar/g' file.txt     # macOS: edit in place, keep file.txt.bak
```

Leave out that `''` and you'll get a cryptic error, or worse, `sed` will treat your command as the backup extension and misbehave. This is the number-one macOS `sed` gotcha, so it's worth building the habit: on a Mac, in-place edits are `sed -i '' ...`.

## awk — treat each line as a row of columns

`grep` and `sed` see a line as a single string. `awk` sees it as a *row of fields* — words separated by whitespace — and gives each field a number: `$1`, `$2`, `$3`, and so on, with `$0` meaning the whole line. That one idea makes `awk` the right tool the moment your data has columns.

Pulling out columns is the "hello world" of `awk`:

```bash
awk '{print $3, $4}' server.log
```

```text
INFO user=alice
ERROR user=bob
...
```

The part in `{braces}` is an action that runs for every line. For comma-separated files, tell `awk` the separator with `-F`, and use the built-in variable `NR` ("number of record," i.e. the line number) to skip a header row:

```bash
awk -F',' 'NR>1 {print $1}' people.csv     # first column, skipping the header
```

`awk` programs have the shape `PATTERN { ACTION }`. If you give it a pattern, the action only runs on matching lines — which means `awk` can do `grep`'s job *and* then compute something:

```bash
awk '/upload/ {gsub(/bytes=/,"",$NF); total += $NF} END {print "total bytes:", total}' server.log
```

```text
total bytes: 1096789
```

Read that slowly, because it shows off everything that makes `awk` special. `/upload/` limits the action to upload lines. `$NF` is a handy idiom — `NF` is "number of fields," so `$NF` is always the *last* field, here the `bytes=...` value. `gsub` strips the `bytes=` prefix off it. `total += $NF` accumulates a running sum in a variable you never had to declare. And the `END { ... }` block runs once, after the last line, to print the result. You just wrote a report.

The other pattern worth memorizing is counting things into an *associative array* — a lookup table keyed by strings:

```bash
awk '{count[$3]++} END {for (level in count) print level, count[level]}' server.log
```

```text
INFO 2
WARN 1
ERROR 2
```

`count[$3]++` uses the third field (the log level) as a key and bumps its tally. The `END` block walks the table and prints each level with its count. This "tally by column" move — group-by, in database terms — comes up constantly, and `awk` does it in one line with no setup.

## The real power move: chaining them with pipes

Each tool does one thing, and the `|` (pipe) character feeds the output of one straight into the next. This is the Unix philosophy in practice, and it's where the three tools stop being separate lessons and start being a single skill. Say you want the three most active IP addresses in the log:

```bash
grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' server.log | sort | uniq -c | sort -rn | head -3
```

`grep` extracts the IPs, `sort` groups identical ones together, `uniq -c` counts each run, `sort -rn` orders them by count descending, and `head -3` keeps the top three. Five small tools, one line, an answer that would take real effort in a spreadsheet. You'll reach `grep | sort | uniq -c | sort -rn` — the "count and rank" pipeline — for the rest of your life.

## The macOS footguns, collected

This post is deliberately a practical tour, not a reference manual, so here is what it does *not* cover and where the macOS defaults will surprise you:

- **`sed -i` needs an argument.** On a Mac it's `sed -i '' '...'` for no backup — not the bare `sed -i` you'll see in Linux tutorials. This is the big one.
- **`grep -P` doesn't exist** in BSD grep. Stick to `-E` and character classes like `[0-9]`, or install GNU grep.
- **Some GNU `sed` conveniences are missing** — case-conversion escapes like `\U`, and `\+` / `\?` in basic mode. Add `-E` for extended regex, which covers most of the gap.
- **`awk` on macOS is the classic "one true awk,"** not GNU's `gawk`. It handles everything in this post, but a few advanced `gawk`-only features (like `gensub` or true multidimensional arrays) aren't available.

If you find yourself fighting these differences, the escape hatch is one line with [Homebrew](https://brew.sh):

```bash
brew install grep gnu-sed gawk
```

That installs the GNU versions as `ggrep`, `gsed`, and `gawk`, leaving the system tools untouched so nothing else on your Mac breaks. Reach for them when a tutorial's syntax won't cooperate — but for the everyday jobs in this post, the built-in tools are all you need.

## Where to go from here

The distillation, if you remember nothing else: **`grep` finds, `sed` changes, `awk` computes, and a pipe (`|`) chains them into one answer.** Everything else is flags and regular expressions you'll pick up as specific problems demand them.

The way to actually learn these is not to read more about them — it's to reach for them the next time you'd have opened a spreadsheet or a text editor's find-and-replace. Point `grep -rn` at a folder you're curious about. Pull a column out of a CSV with `awk`. Fix a typo across ten files with `sed -i ''`. The muscle memory forms fast once the three verbs are in your head, and the terminal stops feeling like a place you visit and starts feeling like a place you work.
