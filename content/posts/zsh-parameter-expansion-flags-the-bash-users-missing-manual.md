+++
title = "Zsh parameter expansion flags: the bash user's missing manual"
date = "2026-09-22T15:02:01-04:00"
draft = false
description = "A tour of zsh's parameter expansion flags — the expressive superset of bash's parameter expansion that most switching guides never mention. Case flags, split/join flags, indirect expansion, hash key/value extraction, and the csh-derived path modifiers, with the bash equivalent for each so the delta is concrete."
summary = "A tour of zsh's parameter expansion flags — the expressive superset of bash's parameter expansion that most switching guides never mention. Case flags, split/join flags, indirect expansion, hash key/value extraction, and the csh-derived path modifiers, with the bash equivalent for each so the delta is concrete."
tags = ["zsh", "shell", "terminal", "bash", "unix", "parameter-expansion", "productivity"]
categories = ["Terminal Tooling"]
ShowToc = true

[cover]
image = "/images/og/zsh-parameter-expansion-flags-the-bash-users-missing-manual.png"
hiddenInList = true
hiddenInSingle = true
+++

You have a filename in a variable. You want everything up to and including the directory, and separately, the extension. In bash you write:

```bash
file="/etc/nginx/nginx.conf"
dir="${file%/*}"           # /etc/nginx
ext="${file##*.}"           # conf
```

That works. Every time you write it, you re-derive which anchor (`%` or `##`) you needed and which glob (`/*` or `*.`). In zsh you write:

```zsh
file=/etc/nginx/nginx.conf
print ${file:h}             # /etc/nginx
print ${file:e}             # conf
```

`:h` (head, the directory) and `:e` (extension) are two of a family of one-character path modifiers zsh inherited from csh. They read the way you'd say the operation out loud, which is why you don't re-derive them.

*Zsh's parameter expansion is a much larger language than bash's. The difference isn't a couple of extra features — it's a small set of orthogonal **flags** that apply to any expansion, transforming the value on the way out. Once you know the flags, most of the multi-step shell code you were writing collapses into one expansion, and the resulting scripts read very differently.*

This is the third post in a small zsh series. Read the [overview](/posts/zsh-is-worth-switching-for-two-features-and-one-subsystem/) for why zsh is worth switching to; the [glob-qualifier post](/posts/zsh-extended-glob-qualifiers-a-language-inside-pathnames/) for the first payoff feature. This one is the second. All examples run in an unmodified zsh — no plugins, no framework. The reference is `zshexpn(1)`, section *Parameter Expansion*.

## The shape of a parameter expansion in zsh

Bash's parameter expansion looks like `${var}`, `${var:-default}`, `${var%pattern}`, `${var/from/to}`. Everything inside the braces is either the variable name, an operator, and its arguments. That's the whole language.

Zsh keeps every one of those (with the same syntax) and adds two more places to put things:

```zsh
${(flags)var}         # apply flags to the expansion of var
${(flags)var:mod}     # apply flags AND path-modifier `mod`
```

The `(flags)` group goes right after the opening `${`. Each flag is a single character (occasionally with a numeric or string argument). Multiple flags stack — `${(kU)hash}` means "the keys of `hash`, uppercased." The `:mod` suffix is a colon followed by a modifier letter — one of the csh-inherited operators (`h`, `t`, `r`, `e`, `l`, `u`, `s`).

The rest of this post is a tour of the flags and modifiers grouped by what they do. For each family, I include the bash equivalent — usually several lines longer, sometimes not achievable without an external tool.

## Case flags

`(U)` uppercases the value, `(L)` lowercases it, `(C)` capitalizes each word:

```zsh
name="omar crosby"
print ${(U)name}       # OMAR CROSBY
print ${(L)name}       # omar crosby
print ${(C)name}       # Omar Crosby
```

Bash's equivalent, since bash 4.0, is `${name^^}`, `${name,,}`, `${name~~}`. The zsh forms compose with everything else — you can uppercase the head of a path, or the keys of a hash, in one expansion.

## Split / join flags

This is where the delta with bash starts to matter. `(f)` splits on newlines, `(s:sep:)` splits on an arbitrary separator, `(F)` joins on newlines, `(j:sep:)` joins on a separator.

```zsh
# Read a file into an array of lines, no IFS mucking, no while-read loop.
lines=(${(f)"$(< /etc/hosts)"})
print ${#lines}                     # number of lines

# Split PATH into an array on colons.
parts=(${(s.:.)PATH})
print -l $parts                      # each path entry on its own line

# Join an array back with a comma.
fruits=(apple banana cherry)
print ${(j:, :)fruits}               # apple, banana, cherry
```

Bash's equivalent for splitting on newlines is roughly:

```bash
IFS=$'\n' read -d '' -r -a lines < /etc/hosts    # requires bash 4+, subtle edge cases
# or the more common:
mapfile -t lines < /etc/hosts
```

`mapfile` (aka `readarray`) is fine, but it only reads a stream, not a captured command output. Once you need the equivalent of `${(f)"$(some-command)"}` — split the output of a subshell by lines into an array — bash requires a temp variable, an `IFS` dance, and a `read -a`. In zsh the split is a flag on the expansion.

## Indirect expansion

`(P)` treats the value as a variable name and expands *that* variable. Bash has `${!var}` for the same operation, but only for scalars — not arrays, not associative arrays, not with modifiers.

```zsh
HOME_ALIAS=HOME
print ${(P)HOME_ALIAS}       # /Users/omar (whatever $HOME is)

# Works on arrays too.
typeset -a fruit=(apple banana)
ptr=fruit
print ${(P)ptr}              # apple banana
```

This is niche but load-bearing when you write shell libraries that take variable names as arguments — the caller says "put your result in `MY_ARRAY`" and the library uses `(P)` to write to whatever name they passed. Bash's `${!var}` is read-only; assignment through indirection requires `eval`, which brings its own set of hazards.

## Associative array flags

Bash 4+ has associative arrays but the introspection surface is thin. `${!hash[@]}` gets the keys, `${hash[@]}` gets the values. That's the API.

Zsh has the same, and adds flags that let you compose:

```zsh
typeset -A colors=(red '#f00' green '#0f0' blue '#00f')

print ${(k)colors}           # keys:   red green blue     (unordered)
print ${(v)colors}           # values: #f00 #0f0 #00f     (unordered)
print ${(kv)colors}          # key value key value key value pairs

# Sort keys alphabetically as you extract them.
print ${(ko)colors}          # blue green red

# Uppercase the values as you extract them.
print ${(vU)colors}          # #F00 #0F0 #00F
```

`(o)` sorts ascending, `(O)` sorts descending, `(i)` and `(I)` do case-insensitive versions. The composition works because flags stack in order — `(ko)` is "keys, then order them."

## Path modifiers (from csh)

These live in the `:mod` suffix rather than the `(flags)` group, because they modify the *value* of the variable rather than the *expansion* of it. Every one of them treats the value as a path or a list of paths:

| Modifier | Meaning | Example (`file=/etc/nginx/nginx.conf`) |
|---|---|---|
| `:h` | head — the directory component | `/etc/nginx` |
| `:t` | tail — the basename | `nginx.conf` |
| `:r` | root — the value without its extension | `/etc/nginx/nginx` |
| `:e` | extension — everything after the last dot | `conf` |
| `:l` | lowercase | `/etc/nginx/nginx.conf` |
| `:u` | uppercase | `/ETC/NGINX/NGINX.CONF` |
| `:a` | absolute path (resolves `..`, `.`) | `/etc/nginx/nginx.conf` |
| `:A` | absolute path AND resolves symlinks | `/etc/nginx/nginx.conf` |
| `:s/old/new/` | substitute — first match | `/etc/nginx/apache.conf` (if `s/nginx/apache/`) |
| `:gs/old/new/` | substitute — all matches | `/etc/apache/apache.conf` |

Modifiers stack, left-to-right:

```zsh
file=/etc/nginx/nginx.conf
print ${file:t:r}            # nginx     (tail, then strip extension)
print ${file:h:t}            # nginx     (head — dir — then tail of that)
```

These apply to any variable that holds a path — including array elements and command substitutions:

```zsh
# The extensions of every .py file under this tree, deduplicated and sorted.
print -l **/*(:e) | sort -u

# Just the basenames of every entry in PATH.
print -l ${path:t}

# Every argument to the current function, with its extension stripped.
for arg in $argv; do
    print ${arg:r}
done
```

Bash's equivalent for `${file:t}` is `$(basename "$file")` — a fork per invocation. For `${file:h}` it's `$(dirname "$file")` — another fork. In a script that processes thousands of paths, the fork cost is visible; in an interactive prompt, the human latency is what matters — one keystroke per modifier vs seven keystrokes for `basename "..."`.

## The width/pad flags

Rarely needed, but a real time-saver when they apply:

```zsh
name=omar

# Left-pad with spaces to width 10.
print "[${(l:10:)name}]"           # [      omar]

# Right-pad with a specified character.
print "[${(r:10::.:)name}]"        # [omar......]
```

The forms are `(l:width::string:)` for left-pad-to-width using `string` as the fill, and `(r:width::string:)` for right-pad. Omit the fill string and it defaults to a space. If you routinely build tabular output in shell (a thing you should probably not do — but if you do), this saves a lot of `printf` gymnastics.

## Array-only flags

A few flags are meaningful only on arrays:

```zsh
files=(a.txt b.txt a.txt c.txt b.txt)

print ${(u)files}            # a.txt b.txt c.txt — unique (dedup, order-preserving)
print ${#files}              # 5                  — count
print ${(w)files}            # 5                  — word count of joined string

# Sort — the whole array, not per-element.
print ${(o)files}            # a.txt a.txt b.txt b.txt c.txt
print ${(oi)files}           # same, case-insensitive
```

`(u)` — uniquify — is the one you'll reach for daily. In bash the equivalent is a `sort -u` pipeline, which reorders your array. `(u)` preserves the original order and just drops duplicates.

## Combining flags

Because flags stack, real expressions often chain several:

```zsh
# Read /etc/hosts, split into lines, keep only comment lines, uppercase them.
typeset -a hostlines
hostlines=(${(f)"$(< /etc/hosts)"})
comments=(${(M)hostlines:#\#*})
print -l ${(U)comments}

# The unique file extensions in this repo, sorted.
print ${(uo)$(print -l **/*(.:e))}
```

The right way to read `${(uo)$(print -l **/*(.:e))}` is: run `print -l **/*(.:e)` (list every regular file's extension, one per line); capture the output as a scalar; the `(u)` flag deduplicates; the `(o)` flag sorts. Every one of those is a separate word in the bash version, connected by pipes.

## Flags that modify the pattern

A quick sidebar: bash's pattern operators (`${var#pattern}`, `${var/from/to}`) exist in zsh with the same syntax. Zsh adds a few flag modifiers that change *how* the pattern is interpreted:

```zsh
str="hello world hello zsh"

# Default substitution replaces the first match.
print ${str:s/hello/HI/}         # HI world hello zsh

# (I:n:) picks the nth match instead of the first.
print ${(I:2:)str:s/hello/HI/}   # hello world HI zsh

# (S) makes pattern-anchored operators use the shortest match instead of the greediest.
str="/etc/nginx/nginx.conf"
print ${str##*/}                 # nginx.conf   (##: greediest left match — everything up to and including the last /)
print ${(S)str##*/}              # etc/nginx/nginx.conf  (shortest match — just the leading /)
```

The full list — `(I)`, `(S)` for shortest-match, `(B)` and `(E)` for begin/end positions — lives in `zshexpn(1)` under *Parameter Expansion Flags*. You will use `(I)` and `(S)` occasionally and probably never the others.

## What this post does not tell you

- **It does not tell you every flag.** `zshexpn(1)` documents about thirty; this post covers the ones that come up in real interactive and scripting work. The ones I skipped (`(#)`, `(z)`, `(qq)`, `(D)`, `(V)`) exist for specific niches — respectively, math-context expansion, tokenized parsing, shell-quoting, directory-name substitution, and visible-character rendering. Read the manual when you hit the niche.
- **It does not tell you these flags are portable.** They are not. Anything past `${var}` and the POSIX `${var%pattern}` family is zsh-only. Do not use them in scripts you plan to run under bash or `sh`.
- **It does not tell you when to prefer a flag over a full command.** Some things — parsing JSON, doing arithmetic on floats, formatting dates — are still cleanly done with `jq`, `bc`, or `date`. Flags shine when the operation is on the *shape* of a value: case, split, join, path-component, dedup, sort. Reach for external tools when the operation is *content*-shaped.
- **It does not tell you the syntax is easy to remember.** It is not. `(f)` (split on newlines), `(F)` (join on newlines), `(s:sep:)` (split), `(j:sep:)` (join) form a consistent family once you notice the pattern (lowercase splits, uppercase joins, colon-delimited argument for the separator). Until then, keep this post open in a tab.
- **It does not describe how flags interact with `$IFS`.** Short version: they usually don't. Flags produce or consume arrays directly and bypass most of the word-splitting behavior that makes shell scripting brittle. That's a feature — it's the reason zsh scripts are less full of `IFS=$'\n'` incantations than bash ones.

## The distillation

**Zsh's parameter expansion flags collapse "extract, transform, format" into a single expression that reads left-to-right the way you'd say the operation out loud.** Once the syntax is in your fingers, most of the multi-step shell code you were writing becomes a `${(...)var}` expression, and the resulting scripts and one-liners read very differently than their bash equivalents.

Pick three flags to internalize this week: `(f)` for splitting captured output into an array of lines, `(u)` for dedup, and `:h` / `:t` / `:e` for path components. Those three cover roughly half of what you're doing with pipelines today. Add `(P)`, `(k)/(v)`, and the case flags in week two. In a month the language will feel like the one you were trying to write in bash all along.

Next in the series: [writing a custom completion function](/posts/writing-a-custom-zsh-completion-function-end-to-end/) — the one subsystem the [overview](/posts/zsh-is-worth-switching-for-two-features-and-one-subsystem/) argued was worth switching for on its own.
