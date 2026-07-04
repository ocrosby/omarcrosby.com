---
paths:
  - "themes/**"
  - "layouts/**"
  - "assets/**"
  - "static/**"
  - "i18n/**"
---

# Theme Immutable — Override at Site Level

`themes/PaperMod/` is a git submodule pointing at [`adityatelange/hugo-PaperMod`](https://github.com/adityatelange/hugo-PaperMod). **Never edit files inside `themes/PaperMod/`.**

## Why

- Any change inside the submodule is a "dirty submodule" — it will not be committed to this repo, `submodule status` will show it as modified, CI will fetch the pristine upstream version, and the change will silently disappear from production.
- The submodule pin is a specific commit. Local changes get discarded on the next `git submodule update`.
- Contributors cloning the repo won't see the change, so behavior diverges between machines.

## The rule

To customize any theme file, **copy it to the same relative path under the site root**. Hugo's lookup order gives site-root files priority over theme files:

| Theme path | Override path |
|---|---|
| `themes/PaperMod/layouts/_default/baseof.html` | `layouts/_default/baseof.html` |
| `themes/PaperMod/layouts/partials/header.html` | `layouts/partials/header.html` |
| `themes/PaperMod/assets/css/extended/blank.css` | `assets/css/extended/custom.css` |
| `themes/PaperMod/static/apple-touch-icon.png` | `static/apple-touch-icon.png` |
| `themes/PaperMod/i18n/en.yaml` | `i18n/en.yaml` |

Verify the override took effect by rebuilding: the modified file's line should appear in the rendered output.

## When this rule fires

- Any `Edit` or `Write` targeting a path under `themes/`.
- Any suggestion to "just change the theme file" during a Hugo customization task.

## Exceptions

- Updating the submodule pin itself (`git submodule update --remote themes/PaperMod && git add themes/PaperMod`) is fine — that's a legitimate upstream bump, not a local edit.
- Reading files under `themes/` (via `Read`, `Grep`) is always fine — that's how you find the file to override.

## Recognition signals

If you see:

- A diff modifying a file under `themes/PaperMod/` — reject; suggest the override path instead.
- `git status` showing `modified: themes/PaperMod (modified content)` — that's a dirty submodule; the edit went to the wrong place. Copy the changed file to the override path, then `git submodule update --force themes/PaperMod` to reset the submodule.
