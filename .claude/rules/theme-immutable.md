---
paths:
  - "themes/**"
  - "layouts/**"
  - "assets/**"
  - "static/**"
  - "i18n/**"
---

# Theme Immutable — Override at Site Level

`themes/puppet/` is a git submodule pointing at [`roninro/hugo-theme-puppet`](https://github.com/roninro/hugo-theme-puppet). **Never edit files inside `themes/puppet/`.**

## Why

- Any change inside the submodule is a "dirty submodule" — it will not be committed to this repo, `submodule status` will show it as modified, CI will fetch the pristine upstream version, and the change will silently disappear from production.
- The submodule pin is a specific commit (`71e55a8…`). Local changes get discarded on the next `git submodule update`.
- Contributors cloning the repo won't see the change, so behavior diverges between machines.

## The rule

To customize any theme file, **copy it to the same relative path under the site root**. Hugo's lookup order gives site-root files priority over theme files:

| Theme path | Override path |
|---|---|
| `themes/puppet/layouts/_default/baseof.html` | `layouts/_default/baseof.html` |
| `themes/puppet/layouts/partials/header.html` | `layouts/partials/header.html` |
| `themes/puppet/assets/sass/main.scss` | `assets/sass/main.scss` |
| `themes/puppet/static/img/home-bg.jpg` | `static/img/home-bg.jpg` |
| `themes/puppet/i18n/en.toml` | `i18n/en.toml` |

Verify the override took effect by rebuilding: the modified file's line should appear in the rendered output.

## When this rule fires

- Any `Edit` or `Write` targeting a path under `themes/`.
- Any suggestion to "just change the theme file" during a Hugo customization task.

## Exceptions

- Updating the submodule pin itself (`git submodule update --remote themes/puppet && git add themes/puppet`) is fine — that's a legitimate upstream bump, not a local edit.
- Reading files under `themes/` (via `Read`, `Grep`) is always fine — that's how you find the file to override.

## Recognition signals

If you see:

- A diff modifying a file under `themes/puppet/` — reject; suggest the override path instead.
- `git status` showing `modified: themes/puppet (modified content)` — that's a dirty submodule; the edit went to the wrong place. Copy the changed file to the override path, then `git submodule update --force themes/puppet` to reset the submodule.
