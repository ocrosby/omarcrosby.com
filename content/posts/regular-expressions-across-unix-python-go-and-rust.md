+++
title = "Regular expressions across Unix, Python, Go, and Rust"
date = "2026-07-20T08:49:53-04:00"
draft = false
description = "A tour of regular expressions shallow enough to onboard a beginner and deep enough to refresh an expert — literals, quantifiers, groups, lookaround, and the engine differences between PCRE-family backtrackers and RE2-family linear-time engines that power grep, Python, Go, and Rust."
summary = "A tour of regular expressions shallow enough to onboard a beginner and deep enough to refresh an expert — literals, quantifiers, groups, lookaround, and the engine differences between PCRE-family backtrackers and RE2-family linear-time engines that power grep, Python, Go, and Rust."
tags = ["regex", "unix", "python", "go", "rust", "text-processing", "fundamentals"]
categories = ["Fundamentals"]
ShowToc = true

[cover]
image = "/images/og/regular-expressions-across-unix-python-go-and-rust.png"
hiddenInList = true
hiddenInSingle = true
+++

Regular expressions are one of those tools nearly every developer has used and nearly no developer feels confident about. You write one, it works, you move on. Three months later you need to modify it and you're right back on Stack Overflow copying the exact same incantation and wondering why nobody remembers this stuff.

This post is a tour of regex that tries to solve that problem — shallow enough that a beginner can follow every example, deep enough that an experienced developer gets the "oh, that's *why*" moment on the gotchas. It covers Unix tooling (`grep`, `sed`, `awk`) and the three language ecosystems most modern developers write in — Python, Go, and Rust — and it spends real time on the piece that most tutorials skip: *how* the engine actually matches, why that matters, and why Go and Rust reject features that Python and Perl accept.

If you learn nothing else, learn this: **there are two families of regex engines, they perform differently in fundamental ways, and knowing which one you're writing against is more important than any specific syntax detail.** The rest of the post is context around that fact.

## What regular expressions actually are

A regular expression is a small language for describing the *shape* of text. You write a pattern; an **engine** compares that pattern against a string and reports whether it matched, where it matched, and — if you asked — what substrings it captured along the way.

That's the whole idea. Everything else — the syntax, the flags, the differences between languages — is variation on that theme.

The uses fall into four buckets, in rough order of frequency:

- **Search.** "Does this string contain a phone number?" "Which lines of this log file mention `ERROR`?"
- **Extraction.** "Pull the version number out of `v1.42.3-beta.5`."
- **Validation.** "Is this input a well-formed email address?" (Spoiler: use a real parser instead — but the *shape* check is a regex.)
- **Substitution.** "Replace every `2026-07-20` with `20 July 2026`."

You'll see regex show up almost anywhere text moves: `grep`, `sed`, `awk`, log parsers, code editors (search-and-replace), form validators, URL routers, syntax highlighters, linters, and — increasingly — the shape checks in front of large language models. It is worth the investment.

## Testing along with this post

Before you go further, open one of these in a tab. Every example below is a paste-and-poke experiment.

- **[regex101.com](https://regex101.com/)** — the reference tool. Supports PCRE (the family Perl, PHP, and most editors use), JavaScript, Python, Go (RE2), and Rust. Shows a live match display, explains every part of your pattern in the sidebar, and even generates code snippets in each language.
- **[regexr.com](https://regexr.com/)** — friendlier UI, JavaScript-flavored. Good for beginners; less depth on flavor differences.
- **[rustexp.lpil.uk](https://rustexp.lpil.uk/)** — Rust-specific tester using the exact `regex` crate. Useful for confirming a pattern before pasting it into Rust code.
- **[The Go Playground](https://go.dev/play/)** — for Go's RE2 flavor, the shortest path to "will my program actually accept this" is to paste a five-line `regexp.MustCompile` snippet into the playground and hit Run. Real compiler, real error messages, no third-party tester needed.

For any Unix pattern in this post, `echo "input" | grep -E 'pattern'` works. For Python, drop into `python3 -c "import re; print(re.findall(r'pattern', 'input'))"`. That's often faster than the browser.

## The mental model

A regex is compiled to a **state machine**. The engine walks the input string one character at a time; at each step it asks "given where I am in the pattern, is this character consistent with continuing?" If yes, advance both. If no, the engine either fails or — depending on which family — tries an alternative.

Two flavors of engine handle the "or tries an alternative" part very differently. We'll get to that. For now: think of the pattern as a shape, and the engine as sliding the shape along the input looking for a place it fits.

## Literals and escapes

Most characters in a pattern match themselves.

```regex
cat
```

Matches the three-character sequence `c`, `a`, `t` — in "cat", in "catch", in "concatenate", anywhere those three characters appear in order.

A handful of characters have special meaning and must be **escaped** with a backslash to match literally:

```text
.  *  +  ?  (  )  [  ]  {  }  |  ^  $  \
```

To match a literal period, write `\.`. To match a literal backslash, write `\\`. Inside a character class (see below) most of these lose their meaning and don't need escaping — a common source of confusion.

## The dot: any single character

```regex
c.t
```

Matches `cat`, `cot`, `cut`, `c t`, `c9t`, and — critically — *only three characters at a time*. The dot matches exactly one character. **It does not match newlines by default** in most engines. That is one of the top three gotchas in this post; we'll return to it.

## Character classes

Brackets define a set of acceptable characters at one position:

```regex
[aeiou]     matches any single vowel
[0-9]       matches any single digit
[a-zA-Z]    matches any single letter
[^0-9]      matches any single non-digit (the leading ^ negates the class)
```

Ranges use `-`. If you want a literal `-`, put it first or last: `[-a-z]` or `[a-z-]`. Same with `]` — put it first (or escape it).

The shorthand classes are more concise:

| Shorthand | Meaning | Equivalent |
|---|---|---|
| `\d` | digit | `[0-9]` (ASCII) or `[\p{Nd}]` (Unicode-aware engines) |
| `\D` | non-digit | `[^\d]` |
| `\w` | word character | `[A-Za-z0-9_]` (ASCII) or Unicode letters + digits + `_` |
| `\W` | non-word | `[^\w]` |
| `\s` | whitespace | `[ \t\n\r\f\v]` |
| `\S` | non-whitespace | `[^\s]` |

**Unicode subtlety**: `\d` in Python 3 matches Unicode digits (Arabic-Indic, Devanagari, etc.) unless you pass `re.ASCII`. In Go and Rust it depends on the flags; the default in Rust's `regex` crate is Unicode-aware. If you specifically want ASCII digits, write `[0-9]` — it's shorter and unambiguous.

### POSIX and Unicode classes

Two more class systems exist:

- **POSIX bracket classes** — `[[:alpha:]]`, `[[:digit:]]`, `[[:alnum:]]`, `[[:space:]]`, etc. Supported by `grep`, `sed`, Python's `re`, Go's `regexp`, and most others. Verbose but unambiguous.
- **Unicode property escapes** — `\p{L}` (any letter), `\p{N}` (any number), `\p{Greek}`, `\p{Emoji}`. Supported by Python's third-party `regex` module, Go's `regexp`, Rust's `regex`, PCRE, and Java. *Not* in most Unix `grep`s without `-P`.

`\p{Sc}` matches any currency symbol. `\p{Emoji_Presentation}` matches every character the Unicode standard says renders as an emoji. That's the level of expressive power available if your engine supports it.

## Quantifiers: how many

Quantifiers say how many times the preceding element must occur:

```regex
a?          zero or one 'a'
a*          zero or more 'a'
a+          one or more 'a'
a{3}        exactly three 'a's
a{3,}       three or more 'a's
a{3,5}      three to five 'a's
```

A concrete example. To match a US ZIP code, either five digits or five-digits-hyphen-four-digits:

```regex
\d{5}(-\d{4})?
```

That reads: five digits, then optionally (a hyphen followed by four digits). Progressively more complicated patterns are just this: composing the atomic pieces.

To match a hex color like `#ff8800` or `#f80`:

```regex
#([0-9a-fA-F]{3}){1,2}
```

Three hex digits, occurring once or twice. That correctly matches both the short and long forms and rejects `#ffff` (four digits).

## Anchors: where in the input

By default, a pattern matches anywhere in the input. Anchors pin it to a position:

- `^` — start of the string (or start of a line in multiline mode)
- `$` — end of the string (or end of a line in multiline mode)
- `\b` — word boundary (between `\w` and `\W`)
- `\B` — not a word boundary
- `\A` — start of the entire string, always (Python, Go, Rust, PCRE — *not* JavaScript)
- `\z` — end of the entire string, always (same support set)

The distinction between `^`/`$` and `\A`/`\z` is subtle and important. In **multiline mode**, `^` and `$` match at every line boundary in the input; `\A` and `\z` still match only at the extreme ends. When you're validating a whole string — an email address, a version number — you almost certainly want `\A...\z`, not `^...$`. The latter will pass "1.2.3\nrm -rf /" as a valid semver.

`\b` deserves its own paragraph. It matches a position, not a character — specifically, a position where a `\w` character sits next to a `\W` character (or the start/end of the string). This is how you write "the word `cat` but not the word `catch`":

```regex
\bcat\b
```

Without the boundaries, `cat` would match inside `catch`, `concatenate`, `scattered`, etc.

## Groups and capturing

Parentheses do two things at once: they **group** (so a quantifier can apply to a multi-character unit) and they **capture** (so you can retrieve what matched).

```regex
(https?)://(\S+)
```

Matches `http://foo.com` or `https://foo.com/bar`. After the match, the engine hands back **group 1** (`http` or `https`) and **group 2** (the rest of the URL). Groups are numbered left-to-right by their opening parenthesis, starting at 1. Group 0 is the whole match.

Three variants matter:

- **Capturing group** — `(...)`. Numbered. The default.
- **Non-capturing group** — `(?:...)`. Groups without allocating a capture slot. Cheaper, and cleaner when you're only using the group for a quantifier. `(?:abc)+` matches one or more `abc`s without giving you back the `abc`.
- **Named group** — `(?P<name>...)` in Python and Go; `(?<name>...)` in Rust, PCRE, and JavaScript. Referred to by name instead of number. If your pattern has more than two or three captures, use named groups — the numbered ones are unreadable within a month.

```regex
(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})
```

In Python, `m.group("year")` returns the year. In Go, `m.SubexpIndex("year")` gives the index. In Rust, `caps.name("year")` returns an `Option<Match>`.

## Alternation

The `|` operator means "or". It has the **lowest precedence** of any regex operator, which trips people up constantly:

```regex
cat|dog        matches "cat" or "dog" (correct)
gr(a|e)y       matches "gray" or "grey" (correct — parentheses scope the alternation)
gray|ey        matches "gray" or "ey"  (probably not what you wanted)
```

When you want alternation scoped to a subexpression, use a group. If you don't need the capture, use `(?:a|b)` to avoid burning a capture slot.

Order matters in backtracking engines (Python, PCRE, JS): the engine tries the left-hand alternative first. `cat|catalog` will match `cat` in `catalog` and leave the `alog` unmatched. Reverse the order to `catalog|cat` if you want the longer form to win when both apply. In Thompson-NFA engines (Go, Rust), the leftmost-longest rule can be different — see the engines section below.

## Backreferences

A backreference matches whatever a previous group already matched:

```regex
(\w+) \1
```

Matches the same word twice in a row: `hello hello`, `the the`. `\1` refers to what group 1 captured. Named backreferences use `(?P=name)` in Python, `\k<name>` in most other flavors.

**Backreferences are one of two features that split the engine family in half.** They require memory — the engine has to remember what group 1 matched to check `\1` — and they make the matching problem NP-hard in the worst case. That's why Go's `regexp` and Rust's `regex` crate simply don't support them. If you need backreferences in Rust, reach for the `fancy-regex` crate. If you're using Go, the answer is "restructure the problem" — usually you can capture the first match, then do a second, cheaper string comparison in code.

## Greedy, lazy, and possessive quantifiers

This is the section that makes the biggest practical difference in real patterns.

By default, quantifiers are **greedy** — they match as much as they possibly can while still letting the rest of the pattern succeed.

```regex
<.*>
```

Applied to the input `<a>text<b>`, this matches the entire `<a>text<b>` — the `.*` swallows everything up through the last `>`. That is almost never what someone writing `<.*>` intended.

Appending `?` to a quantifier makes it **lazy** (also called non-greedy or reluctant) — matches as *little* as possible:

```regex
<.*?>
```

Applied to the same input, this matches `<a>` and then, on a second call, `<b>`. Each match takes only as many characters as it needs to succeed.

A third form, **possessive**, matches greedily and *refuses to give characters back* when the rest of the pattern fails:

```regex
<.*+>
```

Applied to `<a>text<b>`, this fails — the `.*+` swallows everything including the final `>`, then can't back up to let the closing `>` match. Possessive quantifiers exist in PCRE, Java, and Python's third-party `regex` module — *not* in the standard Python `re`, not in JavaScript, not in Go, not in Rust.

Possessive quantifiers exist because they defuse a specific performance problem — catastrophic backtracking — that greedy quantifiers combined with alternation can cause. In engines without them, the fix is either to restructure the pattern or to switch to a non-backtracking engine.

## Lookaround

Lookaround assertions check whether a pattern matches at the current position **without consuming any characters**.

- `(?=...)` — positive lookahead. "The next characters must match this, but don't include them in the result."
- `(?!...)` — negative lookahead. "The next characters must *not* match this."
- `(?<=...)` — positive lookbehind. Same idea, but backward.
- `(?<!...)` — negative lookbehind.

An example: match a number that is followed by "USD" but don't include "USD" in the match:

```regex
\d+(?= USD)
```

Applied to `100 USD`, this matches `100`. The `USD` had to be there, but wasn't consumed.

Lookbehind classically requires a fixed-width pattern — you can't put `.*` inside `(?<=...)` in older PCRE and older Python. Python's `regex` third-party module supports variable-length lookbehind; so does PCRE2 with certain flags. Go and Rust have **no lookaround at all** in their standard regex engines, for the same reason they have no backreferences: variable-width lookbehind is exponential in the worst case and the whole point of RE2-family engines is to guarantee linear time.

If you find yourself reaching for lookaround in Go or Rust, restructure. Nine times out of ten, you can capture the surrounding context in a regular group and slice it out in code.

## The engines: this is the part that matters

Everything above is syntax. Syntax varies mildly between engines. What varies *radically* between engines is the algorithm the engine uses to match — and that determines both which features are available and how the engine performs on pathological input.

There are two dominant families.

### Backtracking NFA (PCRE family)

**Used by**: Perl, PCRE / PCRE2, Python's built-in `re`, Ruby, PHP, Java's `Pattern`, JavaScript.

The engine treats the pattern as a **non-deterministic finite automaton** — a graph of possible states — and explores possibilities by trying one, and *backtracking* to the last choice point when it fails. It supports the full feature set: backreferences, lookaround (including lookbehind), possessive quantifiers, subroutine calls, and recursive patterns.

The cost: **catastrophic backtracking**. A pattern like `(a+)+b` on the input `aaaaaaaaaaaaaaaX` has exponentially many ways the engine can partition those `a`s across the outer group's iterations. Each fails; the engine tries the next. For 20 `a`s and no closing `b`, PCRE will spin for minutes. This is not a theoretical concern — it is the mechanism behind [ReDoS (Regular Expression Denial of Service)](https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS) attacks, and it has taken down Cloudflare and Stack Overflow in the wild.

The fix is to know the shape of catastrophically-bad patterns:

- Nested quantifiers on overlapping alternatives (`(a+)+`, `(a|a)+`, `(.*)*`)
- Alternation where the branches share a prefix (`(cat|car)+` on long input)
- Overly permissive parts (`.*`, `\w+`) inside a larger repeated group

Restructure to eliminate the ambiguity, use possessive quantifiers where available, or add anchors that prevent partial re-matching.

### Thompson NFA / DFA-hybrid (RE2 family)

**Used by**: Go's `regexp`, Rust's `regex`, RE2 itself (the C++ library), Google's various regex-using services, ripgrep.

Ken Thompson's 1968 algorithm — with modern refinements from Russ Cox — treats the pattern as an NFA and simulates *every possible state simultaneously*, one input character at a time. There is no backtracking. The runtime is **O(n × m)** where n is the input length and m is the pattern length. It does not blow up. There is no ReDoS.

The tradeoff: **no backreferences, no lookaround.** Both features fundamentally require backtracking or exponential state, and the whole guarantee of the engine is that it doesn't do those things. If your problem needs one of those features, you don't get it here.

Russ Cox's [Regular Expression Matching Can Be Simple And Fast](https://swtch.com/~rsc/regexp/regexp1.html) is the definitive read on this. It's from 2007, still current, and every developer should read it once.

### POSIX BRE and ERE

**Used by**: `grep` (default is BRE), `grep -E` / `egrep` (ERE), `sed`, `awk`.

Two older standards. The main practical difference from the modern flavors is escaping:

- In **BRE (Basic Regular Expressions)**, `+`, `?`, `|`, `(`, `)`, `{`, `}` are literal by default. To get their special meaning you write `\+`, `\?`, `\|`, `\(`, `\)`, `\{`, `\}`. Awful.
- In **ERE (Extended Regular Expressions)**, they work naked, like every other modern flavor.

**Recommendation**: always use `grep -E`, never plain `grep`. And know that `grep -P` on GNU `grep` gives you PCRE — different flavor entirely.

POSIX engines guarantee **leftmost-longest** matching semantics, which is also RE2's default. Backtracking engines give **leftmost-first** — the first alternative that succeeds wins, even if a later one would have matched more input. This difference explains why `cat|catalog` behaves differently between `grep -E` (matches `catalog`) and Python (matches `cat`).

### The practical implication

When you write a pattern, know which family the target engine belongs to. That decides:

1. Whether backreferences are available.
2. Whether lookaround is available.
3. Whether your pattern is safe against pathological input.
4. Whether `cat|catalog` matches `cat` or `catalog`.

Cross-engine regex is possible for the subset both families agree on — but the moment you use a feature from either half, your pattern isn't portable.

## Unix: grep, sed, awk

The tooling every Unix user is going to reach for.

### grep

```bash
grep 'pattern' file          # BRE — historical default, avoid
grep -E 'pattern' file       # ERE — the modern flavor
grep -P 'pattern' file       # PCRE — GNU grep only, supports backrefs and lookaround
grep -F 'literal' file       # Fixed string — no regex at all, fastest
```

Add `-i` for case-insensitive, `-v` to invert (lines that don't match), `-c` to count, `-o` to print only the matched text, `-n` for line numbers, `-r` to recurse, `-l` to print only filenames.

For anything performance-sensitive over a large tree, use **[ripgrep](https://github.com/BurntSushi/ripgrep)** (`rg`) — a Rust rewrite that uses the `regex` crate and is 10–50× faster than `grep` on typical workloads. Same core syntax, better defaults, ships with `.gitignore` awareness.

### sed

`sed` is the streaming editor. Its bread-and-butter is substitution:

```bash
sed 's/foo/bar/'      # first match per line
sed 's/foo/bar/g'     # every match per line
sed 's/foo/bar/gi'    # case-insensitive, every match
sed -E 's/foo/bar/'   # use ERE (avoid BRE's backslash-everything)
```

Backreferences use `\1`, `\2`, etc. To swap two words:

```bash
echo "hello world" | sed -E 's/(\w+) (\w+)/\2 \1/'
# -> "world hello"
```

BSD sed (macOS's default) and GNU sed have small but real differences — the `-E` flag works on both modern versions; the `-i` (in-place edit) flag needs an empty string argument on BSD (`sed -i '' 's/x/y/' file`) but not on GNU. If your script needs to run on both, prefer `sed -E` and test both.

### awk

`awk` is a full language for line-oriented text processing, and its regex support is ERE. Its most common regex usage is in the pattern part of a pattern-action rule:

```bash
awk '/ERROR/ { print $0 }' logfile
awk '$3 ~ /^[0-9]+$/ { sum += $3 } END { print sum }' file
```

The `~` operator is "matches regex"; `!~` is "does not match". `$0` is the whole line; `$1`, `$2`, ... are the space-separated fields.

## Python: the `re` module

```python
import re

# One-off match
m = re.search(r"(\d{4})-(\d{2})-(\d{2})", "Date: 2026-07-20")
if m:
    print(m.group(0))  # "2026-07-20"
    print(m.group(1))  # "2026"

# Compile once, reuse
date_re = re.compile(r"(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})")
for line in log:
    if m := date_re.search(line):
        print(m.group("year"))

# Find every match
years = re.findall(r"\d{4}", text)

# Substitute
cleaned = re.sub(r"\s+", " ", text)  # collapse whitespace
```

Always use **raw strings** (`r"..."`) for patterns. Otherwise `\d` becomes an escape sequence Python doesn't understand, and it silently degrades to just `d`. This is the single most common Python regex bug.

Key flags: `re.IGNORECASE` (`re.I`), `re.MULTILINE` (`re.M` — makes `^` and `$` match at line boundaries), `re.DOTALL` (`re.S` — makes `.` match newlines), `re.VERBOSE` (`re.X` — allows whitespace and comments in the pattern for readability).

For features `re` doesn't support — variable-width lookbehind, atomic groups, fuzzy matching, more Unicode properties — install the third-party [`regex`](https://pypi.org/project/regex/) package. Drop-in replacement, superset API, no reason not to use it if you're doing anything sophisticated.

## Go: the `regexp` package

```go
import "regexp"

// Compile once
var dateRe = regexp.MustCompile(`(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})`)

// Search
m := dateRe.FindStringSubmatch("Date: 2026-07-20")
if m != nil {
    yearIdx := dateRe.SubexpIndex("year")
    fmt.Println(m[yearIdx])
}

// Find all
years := regexp.MustCompile(`\d{4}`).FindAllString(text, -1)

// Substitute
cleaned := regexp.MustCompile(`\s+`).ReplaceAllString(text, " ")
```

Go's `regexp` is RE2. Linear time, guaranteed. **No backreferences, no lookaround, no possessive quantifiers.** Unicode support is on by default.

Pattern strings should almost always be **raw strings** (backtick-delimited): `` `\d+` `` rather than `"\\d+"`. Same reason as Python — the shell character `\` fights the regex character `\`.

Flags go inside the pattern, prefixed with `(?...)`:

- `(?i)` — case-insensitive
- `(?m)` — multiline (`^` and `$` match line boundaries)
- `(?s)` — dotall (`.` matches newlines)
- `(?U)` — swap greedy/lazy defaults (rarely useful; makes the language surprising)

Combine them: `(?is)pattern` for case-insensitive dotall. Compile with `regexp.MustCompile` at package init if the pattern is a constant — that panics loudly at startup if the pattern is malformed, instead of silently returning an error later. In library code, prefer `regexp.Compile` and return the error.

## Rust: the `regex` crate

```rust
use regex::Regex;

let date_re = Regex::new(r"(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})").unwrap();

if let Some(caps) = date_re.captures("Date: 2026-07-20") {
    println!("{}", &caps["year"]);
}

// Find all
let re = Regex::new(r"\d{4}").unwrap();
let years: Vec<&str> = re.find_iter(text).map(|m| m.as_str()).collect();

// Substitute
let cleaned = Regex::new(r"\s+").unwrap().replace_all(text, " ");
```

Rust's `regex` crate is RE2-derived. Same guarantees as Go: linear time, no backreferences, no lookaround, no catastrophic backtracking. Unicode-aware by default.

For patterns compiled from string literals, prefer **raw string literals** — `r"..."` — for the same reason as everywhere else. For patterns that themselves contain a double quote, use `r#"..."#` (Rust's raw string syntax supports arbitrary levels of `#` for escaping).

The [`OnceLock`](https://doc.rust-lang.org/std/sync/struct.OnceLock.html) or `once_cell::sync::Lazy` idioms are the standard way to compile a regex once and reuse it:

```rust
use std::sync::OnceLock;

fn date_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\d{4}-\d{2}-\d{2}").unwrap())
}
```

If you need backreferences or lookaround, reach for the [`fancy-regex`](https://crates.io/crates/fancy-regex) crate. It layers a backtracking engine on top of `regex-syntax`, gives you the full PCRE-ish feature set, and accepts that it can no longer promise linear time. That's an honest, well-documented tradeoff — but the moment you use `fancy-regex`, you're paying the ReDoS-vulnerability tax that the standard crate exists to avoid. Reserve it for cases where you *know* the input is bounded.

## Gotchas — the section worth bookmarking

Every one of these has bitten every developer at least once.

### 1. The dot doesn't match newlines

`.` matches any character *except newline* by default. In multi-line input, `<.*>` on `<a\n<b>` matches nothing that spans the newline. Enable "dotall" mode (`(?s)` inline, `re.DOTALL` in Python, `(?s)` in Go/Rust, `s` flag in PCRE) if that's what you meant.

### 2. `^` and `$` match line boundaries only in multiline mode

Without the multiline flag, `^` matches the start of the *entire string* and `$` matches the end. With it, they match at every `\n`. If you want unambiguous full-string anchoring regardless of flags, use `\A` and `\z`.

### 3. Ranges in character classes are ASCII-ordered

`[A-z]` includes six characters between `Z` and `a`: `[`, `\`, `]`, `^`, `_`, `` ` ``. You almost never want that. Write `[A-Za-z]`.

### 4. `\d` isn't always `[0-9]`

In Unicode-aware modes (Python 3 default, Rust default, Go with the appropriate flag), `\d` matches every Unicode digit — including U+0660 (Arabic-Indic zero) and U+06F0 (Extended Arabic-Indic zero). If you're validating US-style input, write `[0-9]` explicitly.

### 5. Greedy matching runs past what you meant

`<.*>` matches too much. Use `<.*?>` (lazy) or `<[^>]*>` (character class that can't include `>`). The character-class form is faster because it doesn't require any backtracking.

### 6. Raw strings are non-negotiable

Every regex example in this post has been written with the assumption that you'll use raw strings. In Python: `r"..."`. In Go: backtick-delimited. In Rust: `r"..."` or `r#"..."#`. Without them, backslashes fight the host language's own string escaping and your pattern silently loses its metacharacters.

### 7. Look at your capturing groups

Every unnamed group allocates a numbered capture slot. If you're only using the group for a quantifier, write `(?:...)` — non-capturing. This matters for performance in tight loops and for readability in patterns with many groups.

### 8. Anchor validation patterns, always

A pattern like `\d{5}` will match "12345" — and also "12345 abc def" and "one one two three four five". If the whole string should be exactly five digits, you want `\A\d{5}\z` (or `^\d{5}$` if you're sure multiline mode is off). This is the source of countless "why did my email validator accept `foo@bar.com; rm -rf /`" bugs.

### 9. Timeout guardrails on user-supplied input

In backtracking engines, running a user-supplied regex against user-supplied input is a live weapon. Either use an RE2-family engine (Go, Rust, or PCRE2 with the JIT-off unlimited-match-limit flag) or wrap the match in a hard timeout at the language level. Python's `re` doesn't have a built-in timeout; the third-party `regex` package does (`regex.match(pat, s, timeout=1.0)`).

### 10. The `.` inside a character class is literal

`[a.b]` matches `a`, `.`, or `b` — not any character or `a` or `b`. Inside `[...]`, most metacharacters lose their meaning. `[.*]` matches only the two literal characters `.` and `*`. This one confuses beginners in both directions — they either over-escape (needless `\.`) or under-escape (assume the meta meaning persists).

## Where to go next

- **[Russ Cox's regex series](https://swtch.com/~rsc/regexp/)** — the canonical explanation of why RE2 exists and what its algorithm looks like. Start with `regexp1.html`. Read all of them if you'll be doing this professionally.
- **[Mastering Regular Expressions (Jeffrey Friedl)](https://openlibrary.org/works/OL2807549W)** — the O'Reilly book. Exhaustive. Older, but the mental models don't age.
- **[regex101 examples library](https://regex101.com/library)** — thousands of user-contributed patterns you can dissect and learn from. Filtering by flavor is a good way to see how the same problem is solved across engines.
- **[Go's `regexp/syntax` package docs](https://pkg.go.dev/regexp/syntax)** — the authoritative reference for the exact RE2 dialect Go and Rust use.
- **[The `regex` crate docs](https://docs.rs/regex/)** — same story for Rust, with additional notes on Unicode handling.

Once you outgrow regex — when your pattern is a nested tree with hierarchical rules, or you want to build an AST rather than extract substrings — reach for a proper parser. PEG parsers (`pest` in Rust, `pyparsing` in Python) or parser combinators are the next tool up. Regex is a hammer; some problems are screws.

For everything else — searching, extracting, validating shape, substituting — regex is one of the most durable and portable skills in a developer's toolkit. Fifty years old, still first-choice for a large fraction of text problems, still worth the hour it takes to actually understand.
