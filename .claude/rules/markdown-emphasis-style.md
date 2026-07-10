---
paths:
  - "**/*.md"
---

# Markdown Emphasis Style

When adding or editing italic emphasis in an existing markdown file, use the **same delimiter** (`*` or `_`) that the file's body already uses. Never introduce a different italic style than the one in place — even for a one-line note at the top of a file whose body sits far below.

## Why

The project's `.markdownlint.yaml` runs `default: true` with no override for `MD049/emphasis-style`. That means MD049 is enabled in its default `consistent` mode: whichever italic style appears **first** in a file becomes the enforced style for the rest of the file. Mixing styles fails the whole file, not just the offending line.

The failure surfaces on every open PR because `markdownlint` scans the entire repo tree, not just the diff. So a single mismatched emphasis in one file is a **repo-wide CI failure** that inherits into every unrelated PR until it's fixed. The blast radius is bigger than "the file with the change."

## The incident this rule prevents

PR #68 added `_Companion to the [X project page](...)._` (underscore italic) as a top-of-body callout to seven posts whose bodies use `*asterisk*` italic throughout. Result: 36 MD049 errors across 7 files — every asterisk-italic phrase in each body was flagged as inconsistent with the new underscore-italic line at the top. The fix was to change the added lines to `*asterisk*` to match the body convention. See the commit history of PR #68 for the recovery.

## The rule

Before adding italic emphasis in an existing markdown file:

1. **Grep for existing style** in the same file:

   ```bash
   grep -oE '\*[^\*][^*]*\*|_[^_][^_]*_' <file>.md | head -5
   ```

   If output shows `*...*` patterns → use `*asterisk*` for new italics.
   If output shows `_..._` patterns → use `_underscore_` for new italics.
   If output shows both → the file is already broken; fix the pre-existing inconsistency before adding new content.

2. **When authoring a new markdown file**: use `*asterisk*` italic. This matches the codebase's dominant convention (verified against every existing post + content file as of 2026-07-10) and stays consistent with what future editors will encounter.

3. **Bold emphasis (`**text**` vs `__text__`) is a separate rule (`MD050`)** — the emphasis-style constraint applies to *italic* only. But the same convention applies: check the file, use the same delimiter, and default to `**asterisk**` for new content.

## Signals

| Signal | Fix |
|---|---|
| Diff adds `_italic text_` in a file whose body uses `*italic text*` | Change `_italic_` → `*italic*` to match |
| Diff adds `*italic text*` in a file whose body uses `_italic text_` | Change `*italic*` → `_italic_` to match |
| New markdown file mixes both styles | Pick asterisk (the codebase default) and rewrite the underscore instances |
| Pre-existing file already mixes both (from an older commit) | Normalize to the majority style in the same PR before adding new content |
| Markdownlint MD049 fires on a file the current diff doesn't touch | Check `git diff main..<branch> --stat` — if the failing file isn't in the diff, it's pre-existing debt on `main`; fix in its own `fix(ci)` PR, then rebase |

## When this rule fires

- Any `Write` creating a new markdown file (in `content/`, `.claude/`, root, anywhere).
- Any `Edit` to an existing markdown file that adds or changes italic emphasis.
- Any `hugo-reviewer` invocation whose diff touches a markdown file.
- Any `/verify` run that reports MD049 errors — the fix is to normalize the offending file's emphasis to a single style.

## Report as

- **Must Fix** — the diff introduces mixed emphasis that fails MD049 on the file. The CI failure isn't just "your change is broken" — it's "every open PR now inherits this failure" until it's normalized.
- **Should Fix** — the file already had mixed emphasis from an older commit; the current diff didn't introduce the mismatch but is a good opportunity to normalize.

## Exceptions

None. If in doubt, use `*asterisk*` italic and `**asterisk**` bold — that's the codebase-wide default.

## Not covered by this rule

- **Bold vs italic choice** — that's an authoring decision, not a delimiter-consistency concern.
- **Code emphasis** (`` `code` ``) — a separate concern from MD049.
- **Underscore in identifiers inside code spans** (`` `my_var` ``) — MD049 does not apply inside code spans; leave verbatim.
