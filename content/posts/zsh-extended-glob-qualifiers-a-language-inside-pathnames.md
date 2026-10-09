+++
title = "Zsh extended glob qualifiers: a language inside pathnames"
date = "2026-09-22T06:43:27-04:00"
draft = false
description = "A tour of zsh's glob qualifiers — the small sublanguage attached to pathname expansion that filters, sorts, and slices matched files without a pipeline. File-type checks, time and size predicates, ordering, slicing, and the recursive globstar — with the equivalent bash + find one-liners for each so the win is concrete."
summary = "A tour of zsh's glob qualifiers — the small sublanguage attached to pathname expansion that filters, sorts, and slices matched files without a pipeline. File-type checks, time and size predicates, ordering, slicing, and the recursive globstar — with the equivalent bash + find one-liners for each so the win is concrete."
tags = ["zsh", "shell", "terminal", "unix", "globbing", "productivity"]
categories = ["Terminal Tooling"]
ShowToc = true

[cover]
image = "/images/og/zsh-extended-glob-qualifiers-a-language-inside-pathnames.png"
hiddenInList = true
hiddenInSingle = true
+++

You want to delete the ten oldest `.log` files in `/var/log`. In bash that's a `find` command with `-printf`, a `sort`, a `head`, and an `xargs rm` — five tools, four pipe stages, one race condition if a filename has a newline in it. In zsh:

```zsh
rm /var/log/*.log(.om[-10,-1])
```

That's one line. It's a glob pattern (`/var/log/*.log`) followed by a *glob qualifier* — the `(.om[-10,-1])` part. The qualifier says: only regular files (`.`), ordered by modification time newest-first (`om`), and — because `om` puts newest first — take slice `[-10,-1]` to get the ten oldest at the end. Zsh expands the glob, filters and sorts server-side inside the shell, and hands `rm` an exact argument list. No pipeline. No temporary file. No newline-in-filename issue.

*Glob qualifiers are a small trailing sublanguage attached to zsh's pathname expansion. They replace most of the reasons a bash user reaches for `find`, they compose orthogonally with recursive globbing (`**/`), and they've been documented under **FILENAME GENERATION** in `zshexpn(1)` since the early 1990s. Once they click, the shell prompt stops feeling like a place you build pipelines and starts feeling like a place you describe files.*

This is the second post in a small zsh series. The [overview](/posts/zsh-is-worth-switching-for-two-features-and-one-subsystem/) argues why zsh is worth switching to at all; this one takes the first of the three payoff features and walks through it end-to-end. All examples run in an unmodified zsh — no plugins, no framework. The `EXTENDED_GLOB` option (`setopt EXTENDED_GLOB`) unlocks a couple of pattern operators used in a few examples below; qualifiers themselves are always on.

## What a glob qualifier actually is

A glob qualifier is a parenthesized suffix on a glob pattern. Its syntax is `(qualifier-list)`, where the qualifier list is a sequence of single-character codes, each of which either *filters* the match set (drop entries that don't satisfy the predicate) or *transforms* it (sort, slice, run through a command). Multiple qualifiers combine into a single set of parentheses, and they can be chained with commas to mean *"or":*

```zsh
# Regular files bigger than 100 KB.
print -l **/*(.Lk+100)

# Regular files OR symlinks (either qualifier matches).
print -l **/*(.,@)
```

The rest of this post is a tour of the qualifiers grouped by what they do. For each family, I include the equivalent bash + `find` one-liner where one exists, because the switching case gets made most cleanly on side-by-side comparison.

## File-type qualifiers

The single most-used qualifiers select by file type. They're a single character each:

| Qualifier | Matches |
|---|---|
| `.` | Regular files (not directories, links, devices, sockets) |
| `/` | Directories |
| `@` | Symbolic links |
| `*` | Executable regular files |
| `=` | Sockets |
| `p` | Named pipes (FIFOs) |
| `%` | Any device (character or block) |
| `%b` | Block devices only |
| `%c` | Character devices only |

Examples:

```zsh
# Every directory under the current path, one per line.
print -l */(/)

# Every executable file on your PATH's first entry.
first_bin=${path[1]}
print -l $first_bin/*(*)

# Every broken symlink in ~/bin.
# @ = symlink, - modifies the next test to follow the link,
# e:'[[ ! -e $REPLY ]]': runs the test with $REPLY = each match.
print -l ~/bin/*(@-e:'[[ ! -e $REPLY ]]':)
```

The bash equivalent of *"every directory"* is `find . -maxdepth 1 -type d`. The bash equivalent of *"broken symlinks"* is `find ~/bin -maxdepth 1 -type l ! -exec test -e {} \; -print`. The zsh forms compose into any command that takes filenames — you don't have to remember whether `find` or `ls` or `xargs` is the right pipeline shape.

## Time qualifiers

Time qualifiers filter by file timestamps: modification time (`m`), access time (`a`), or inode-change time (`c`). Each takes a unit — hours (`h`), days (default), weeks (`w`), months (`M`) — and a sign — `+` for older-than, `-` for younger-than.

```zsh
# Every .py file modified in the last hour.
print -l **/*.py(mh-1)

# Every file older than 30 days in ~/Downloads.
print -l ~/Downloads/*(m+30)

# Every file accessed in the last week (units: w).
print -l **/*(aw-1)

# Every regular file that changed status (chmod, rename) in the last 24 hours.
print -l **/*(.ch-24)
```

The bash equivalent is `find ~/Downloads -maxdepth 1 -mtime +30` and its variants. `find`'s time flags are one of the parts of its interface people re-look-up every time; the zsh forms are more regular — same letter for the same operation across the whole shell.

## Size qualifiers

`L` filters by size. Units follow the letter: `k` for kilobytes, `m` for megabytes, `g` for gigabytes, or none for bytes. Sign follows the standard `+` (larger) / `-` (smaller) / equals (exact).

```zsh
# Every regular file bigger than 100 MB in the current tree.
print -l **/*(.Lm+100)

# Every zero-byte file under logs/.
print -l logs/**/*(.L0)

# Every regular file between 1 KB and 10 KB.
# The comma between qualifier groups means "and" here (both filters apply).
# For OR you'd use two comma-separated qualifier sets, not two ranges.
print -l **/*(.Lk+1Lk-10)
```

`find -size +100M` covers the same ground. The zsh form composes with the file-type check in the same parenthesized group, which is where the pipeline-vs-single-expression difference gets noticeable.

## Ownership and permission qualifiers

Less-used but occasionally load-bearing:

| Qualifier | Matches |
|---|---|
| `U` | Owned by the current user |
| `u<uid>` or `u:name:` | Owned by a specific user |
| `G` | Owned by the current user's primary group |
| `g<gid>` or `g:name:` | Owned by a specific group |
| `f<octal>` | Files with exactly these permission bits (`f0755`) |
| `f+<bits>` / `f-<bits>` | Files with any / none of these bits set |

```zsh
# Every file in /tmp not owned by you.
print -l /tmp/**/*(^U)

# Every world-writable file under the current tree.
print -l **/*(f+002)
```

The `^` prefix negates a qualifier. `(^U)` is "not owned by me." `(^.)` is "not a regular file." Negation composes with every predicate in the qualifier language.

## Ordering and slicing

This is where the qualifier language stops being a nicer `find` and starts being something else entirely. `o<letter>` sorts ascending, `O<letter>` sorts descending, and `[start,end]` slices the resulting array (1-indexed, negatives count from the end).

Sort keys:

| Letter | Sorts by |
|---|---|
| `n` | Name (default sort — you rarely need to type this) |
| `L` | Size |
| `l` | Number of hard links |
| `m` | Modification time |
| `a` | Access time |
| `c` | Inode-change time |
| `d` | Depth (deeper first with `Od`, shallower first with `od`) |

Combined:

```zsh
# The 5 newest .log files in /var/log, biggest first among those.
ls -Sld /var/log/*.log(.om[1,5])

# The 3 largest files in your Downloads folder.
ls -lh ~/Downloads/*(.OL[1,3])

# The 20 most recently modified .md files anywhere in this repo.
ls -tld **/*.md(.om[1,20])

# The 10 oldest log files (see the intro).
rm /var/log/*.log(.om[-10,-1])
```

There is no one-liner equivalent in bash. The closest you can write is `find ... -printf '%T@ %p\n' | sort -n | head -N | cut -d' ' -f2- | xargs` and pray no filename has a space in it. The zsh form is safe on filenames with any characters (spaces, newlines, quotes) because the shell expands the glob into an argument array before any command sees it.

## The recursive globstar `**/`

Zsh had recursive globbing (`**/`) long before bash did — Falstad's original 1990 release supported it. In zsh it is unconditionally on; in bash you have to `shopt -s globstar` and even then a few edge cases behave differently.

Combined with qualifiers, it becomes the workhorse:

```zsh
# Every regular file under this tree (excluding . files by default).
print -l **/*(.)

# Every .go file in the repo, biggest first.
ls -lh **/*.go(.OL)

# The 50 most recently modified files anywhere in the current tree,
# regardless of type or depth.
ls -tld **/*(om[1,50])

# Every empty directory under a project root.
print -l **/*(/^F)   # / = directory, F = full (has entries), ^F = NOT full = empty
```

The `**/` and the qualifier are orthogonal — the qualifier applies to the full match set, regardless of how deep the glob went.

## Executing predicates: the `e:...:` qualifier

For predicates that don't have a built-in qualifier, `e:'<code>':` runs arbitrary zsh code against each match, with `$REPLY` set to the current filename. It's the escape hatch that makes the qualifier language open-ended without turning it into a general-purpose language.

```zsh
# Every .png file whose width is over 2000 pixels (needs ImageMagick).
print -l **/*.png(.e:'[[ $(magick identify -format "%w" $REPLY) -gt 2000 ]]':)

# Every file whose name is longer than 50 characters.
print -l **/*(.e:'[[ ${#REPLY:t} -gt 50 ]]':)

# Every executable that is a shell script (starts with #!).
print -l **/*(*.e:'read -r line < $REPLY && [[ $line == "#!"* ]]':)
```

`e:...:` is slow — it forks a subshell per match — so it's the qualifier of last resort. When one of the built-in qualifiers does what you want, use it. Save `e:` for the cases where nothing else fits.

## One or two setup notes

Two options are worth knowing before you write your first qualifier in anger:

- **`setopt EXTENDED_GLOB`** turns on additional pattern operators — negation with `^`, alternation with `|`, `!(pattern)`, `~pattern`, `<n-m>` numeric ranges. Some qualifier examples above (`(^U)`, `(^F)`) use the `^` negator, which needs `EXTENDED_GLOB` in some contexts. It's near-universally enabled in real setups; if in doubt, put it in your `.zshrc`.
- **`setopt NULL_GLOB`** changes the behavior when a glob matches nothing. Default zsh errors ("no matches found"), which is safer than bash's "leave the glob literal" behavior and much safer than accidentally passing `*.foo` to `rm` when no `*.foo` exists. `NULL_GLOB` makes an unmatched glob expand to nothing (no error, no arguments). Useful in scripts; slightly riskier interactively.

## What this post does not tell you

- **It does not tell you glob qualifiers are portable.** They are not. Anything past `**/` is zsh-only. `find` is the universal answer for cross-shell scripting; qualifiers are the answer for *your* prompt.
- **It does not tell you every command's flags.** `find(1)`'s and `zshexpn(1)`'s reference pages are still the source of truth for edge cases (symlink-following semantics, cross-device behavior, etc.). This post is a working introduction, not a complete reference.
- **It does not tell you qualifiers are always faster than `find`.** For a single one-shot query over a huge tree, `find` may be faster because it's a specialized binary. For interactive iteration over a project tree of any normal size, the qualifier form dominates because it's already in the shell you're typing at — the win is human latency, not CPU.
- **It does not tell you the `e:...:` predicate is safe on hostile filenames.** It expands `$REPLY` unquoted in many stack-overflow examples; quote it (`"$REPLY"`) and remember that inside `e:...:` you're writing zsh, so `$REPLY:t` and friends are available.
- **It does not tell you which qualifiers `bash` will eventually adopt.** Zero, is my bet. This is the syntax that most makes zsh a different shell rather than an extension of bash — bash's philosophy has been to keep the language close to POSIX. Do not wait for portability.

## The distillation

**Glob qualifiers turn "filter + sort + slice" from a three-tool pipeline into a parenthesized suffix on a filename pattern.** Once they are in your fingers, most of the reasons you reached for `find` in a bash session evaporate — and the ones that remain (cross-device walks, one-off queries in unfamiliar shells) become obvious.

Pick two you'll use daily and put them in your `.zshrc` as helpers: an alias for "delete the N oldest logs" and one for "show me the K most recently modified files under this directory." Once those live in muscle memory, add three more. In a week the shell will feel different — not because you added a plugin, but because the primitives you were reaching for outside the language turned out to already be inside it.

Next in the series: [parameter expansion flags](/posts/zsh-parameter-expansion-flags-the-bash-users-missing-manual/) — the second of the two syntactic features the [overview](/posts/zsh-is-worth-switching-for-two-features-and-one-subsystem/) called out.
