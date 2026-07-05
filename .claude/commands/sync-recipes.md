---
description: Regenerate data/recipes.yaml from github.com/ocrosby/recipes, direct-commit to main, and push. Semantic-release will cut a patch bump and Fly will redeploy. No PR, no branch — this is data churn.
argument-hint: "[--dry-run]"
---

# /sync-recipes

Syncs the recipe index at `/recipes/` with `github.com/ocrosby/recipes`. Reads every `.md` file in the source repo, extracts (title, description, category, added-date), writes `data/recipes.yaml`, and direct-commits to `main` if anything changed. No PR, no branch — same data-churn model as `/add-music`.

## Arguments

- `--dry-run` (optional) — print the regenerated YAML to stdout and exit without touching disk or git. Nothing else runs.

## Workflow

### 1. Preconditions — stop before touching anything if any of these fail

- Working directory must be the `omarcrosby.com` repo root (`hugo.toml` exists at cwd).
- `scripts/sync-recipes.py` must exist.
- `git status --porcelain` must be empty. If not, stop and ask the user to stash/commit first.
- Current branch must be `main`. If not, `git checkout main && git pull --ff-only` before continuing.

### 2. Dry-run branch (if `--dry-run` was passed)

Run:

```bash
python3 scripts/sync-recipes.py --dry-run
```

Print stdout and stop. Do not touch `data/recipes.yaml`, do not commit.

### 3. Regenerate `data/recipes.yaml`

Run:

```bash
python3 scripts/sync-recipes.py
```

The script clones `ocrosby/recipes` to a temp dir, extracts metadata, and writes `data/recipes.yaml`. It prints the count of recipes written to stderr.

### 4. Diff check

If `git diff --quiet data/recipes.yaml`, nothing changed — report `No changes — recipe index is already up to date.` and stop. Do not commit an empty change.

If there is a diff, show a compact summary of what changed:

```bash
git diff --stat data/recipes.yaml
```

### 5. Verify the site still builds

Run `hugo --gc --minify --panicOnWarning` from the repo root. If it exits non-zero, `git restore data/recipes.yaml` and stop — do not commit a broken build.

### 6. Direct-commit to main and push

Build the commit message from the diff — count how many recipes were added, removed, or modified:

```bash
git add data/recipes.yaml
ALLOW_MAIN_COMMIT=1 git commit -m 'fix(recipes): sync from ocrosby/recipes (<N> total)'
git push origin main
```

Use `fix(recipes):` intentionally — semantic-release maps this to a patch bump, matching `/add-music`'s cadence discipline.

### 7. Report

Print:

- The commit SHA (`git log -1 --format=%H`)
- The recipe count from step 3's stderr
- A short note that semantic-release + Fly deploy will run in the background
- The live URL: `https://omarcrosby.com/recipes/`

Do **not** watch the release workflow — the user checks it themselves.

## Rules

- **No PR, no branch.** Same rationale as `/add-music`: data churn on a single-author site.
- **Never `--force` push.** If push is rejected because someone else pushed, `git pull --rebase` first, then push.
- **Never skip hooks** (`--no-verify`).
- **The script is the source of truth.** Do not hand-edit `data/recipes.yaml` — the next `/sync-recipes` will overwrite any manual changes. To adjust a recipe's title or description, edit the source markdown in `ocrosby/recipes` (add a frontmatter `title:` / `description:` field — the script picks those up).
- **Do not touch anything outside `data/recipes.yaml`.** Menu, layout, and `content/recipes/_index.md` are shipped once and stable; this command only refreshes data.
- If any step from 4 onward fails after `data/recipes.yaml` is modified, `git restore data/recipes.yaml` before stopping.

## Example

```text
/sync-recipes
```

→ Script clones `ocrosby/recipes`, finds 31 `.md` files (was 30 last time)
→ `data/recipes.yaml` gains one entry: `Grilled Pork Chops` under `Pork`
→ `hugo --gc --minify --panicOnWarning` passes
→ Commit `fix(recipes): sync from ocrosby/recipes (31 total)`
→ Push to main → semantic-release patches → Fly deploys
→ `https://omarcrosby.com/recipes/` shows the new entry within ~2 min
