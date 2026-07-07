#!/usr/bin/env python3
"""Sync recipe list from github.com/ocrosby/recipes into data/recipes.yaml.

Reads the recipes repo, extracts (title, description, path, added, category)
per markdown file, and writes a YAML data file that layouts/section/recipes.html
renders. Links point out to the source markdown on GitHub — no content is copied.

Stdlib only. Depends on `git` being on PATH.

Usage: scripts/sync-recipes.py [--repo <owner/name>] [--out data/recipes.yaml]
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

DEFAULT_REPO = "ocrosby/recipes"
DEFAULT_OUT = Path("data/recipes.yaml")
DEFAULT_BRANCH = "main"

# Skip the repo's own README (metadata, not a recipe). Nested README.md files
# are kept — for a single-file dir like sinigang/, README.md IS the recipe.
SKIP_PATHS = {"README.md"}


@dataclass
class Recipe:
    path: str          # relative path in the source repo, e.g. "chicken/kfc.md"
    title: str
    description: str
    added: str         # ISO-8601 date (YYYY-MM-DD)
    category: str      # top-level dir, or "General" for repo-root files
    url: str = field(init=False)

    def __post_init__(self) -> None:
        # Blob URL is what a human wants when they click "read the recipe".
        self.url = f"https://github.com/{ARGS.repo}/blob/{ARGS.branch}/{self.path}"


ARGS: argparse.Namespace  # populated in main()


# --------------------------------------------------------------------------- #
# Extraction
# --------------------------------------------------------------------------- #

_FRONTMATTER_RE = re.compile(r"^(?:---|\+\+\+)\s*\n(.*?)\n(?:---|\+\+\+)\s*\n", re.DOTALL)
_H1_RE = re.compile(r"^\s*#\s+(.+?)\s*$", re.MULTILINE)
# Markdown structural markers we do NOT want as fallback titles: ##+
# headings, bullet lists, numbered lists. Plain-prose first lines
# (including emoji-prefixed ones like "🥗 Chicken Salad") do NOT match
# and remain eligible as titles when no H1 is present. The trailing
# ``(?:\s|$)`` catches bare markers left by ``strip()`` — e.g. a source
# line of ``"- "`` becomes ``"-"`` after stripping and still needs to
# be recognized as a bullet.
_STRUCTURE_LINE_RE = re.compile(r"^(?:#+|[-*•]|\d+[.)])(?:\s|$)")
# Filenames that mean "the recipe is named after its parent directory",
# not after the file itself — e.g. sinigang/README.md, trout/index.md.
_CONTAINER_FILENAMES = frozenset({"index", "readme"})


def _extract_frontmatter_field(fm: str, field_name: str) -> str | None:
    """Extract a single scalar field from a TOML/YAML frontmatter block.

    Handles both `key = value` (TOML) and `key: value` (YAML) — good enough
    for our two-field extraction. Prefer this over pulling in `tomllib` or
    `yaml` for what remains a stdlib-only script.

    Args:
        fm: Raw frontmatter text (already stripped of delimiter lines).
        field_name: Field to extract, case-sensitive.

    Returns:
        The unquoted, stripped value, or None if the field is absent.
    """
    pattern = re.compile(rf'^\s*{field_name}\s*[:=]\s*"?([^"\n]+?)"?\s*$', re.MULTILINE)
    m = pattern.search(fm)
    return m.group(1).strip() if m else None


def _first_content_line(text: str) -> str:
    """Return the first line that looks like a title, not markdown structure.

    Skips (in order, per line):
      * blank lines
      * ##+ headings, bullet lists, numbered lists (``_STRUCTURE_LINE_RE``)
      * lines ending with ``:`` — section headers like ``Ingredients:`` and
        ``Directions:`` that upstream recipes sometimes use as plain text
        without a ``#`` prefix. No real recipe title ends with a colon.
      * lines starting with a lowercase letter — sentences and recipe
        steps, not titles. Real titles begin with an uppercase letter or a
        symbol (emoji, digit).

    Emoji-prefixed prose (``🥗 Chicken Salad``) and other plain-text first
    lines survive this filter and become the title when no H1 is present.

    Args:
        text: Body text with frontmatter already stripped.

    Returns:
        The first title-like line, or "" if none found.
    """
    for line in text.splitlines():
        s = line.strip()
        if not s or _STRUCTURE_LINE_RE.match(s) or s.endswith(":"):
            continue
        if s[0].islower():
            continue
        return s
    return ""


def _title_from_path(rel_path: str) -> str:
    """Derive a Title-Cased title from the file path.

    For files named ``index.md`` or ``README.md``, uses the parent directory
    name so ``trout/index.md`` becomes ``Trout`` (not ``Index``) and
    ``sinigang/README.md`` becomes ``Sinigang`` (not ``Readme``). Regular
    files use their own filename stem.

    Args:
        rel_path: Path relative to the recipes repo root.

    Returns:
        Title-Cased string. Underscores and hyphens become spaces.
    """
    p = Path(rel_path)
    stem = p.parent.name if p.stem.lower() in _CONTAINER_FILENAMES else p.stem
    return stem.replace("-", " ").replace("_", " ").title()


def _derive_title(body: str, frontmatter_title: str | None, rel_path: str) -> str:
    """Derive a recipe title from the best-available source.

    Precedence (highest first):
      1. Frontmatter ``title`` field
      2. First H1 (``# Title``) in the body
      3. First content line — the first line that isn't blank, a ##+ heading,
         or a list marker. Preserves emoji-prefixed titles like
         ``🥗 Chicken Salad`` when the author didn't use an H1.
      4. Path-based fallback: parent-dir name for ``index.md``/``README.md``,
         otherwise the filename stem.

    Step 3 skipping ##+ headings and list markers is the fix for the
    ``Ingredients:`` and ``Index`` regressions — files that lead with
    ``## Foo`` followed by a bulleted list now fall all the way through to
    step 4 instead of picking up ``Foo`` as the title.

    Args:
        body: Body text (frontmatter already stripped).
        frontmatter_title: Value of the ``title`` field, or None.
        rel_path: Path relative to the recipes repo root.

    Returns:
        The derived title with common markdown noise stripped.
    """
    if frontmatter_title:
        raw = frontmatter_title
    else:
        m = _H1_RE.search(body)
        if m:
            raw = m.group(1).strip()
        else:
            first = _first_content_line(body)
            raw = first or _title_from_path(rel_path)

    # Strip leading "#" and collapse whitespace for anything that slipped
    # through with heading noise.
    cleaned = raw.lstrip("# ").strip()
    return re.sub(r"\s+", " ", cleaned)


def _first_paragraph_after_title(text: str, title_line: str) -> str:
    """Return the first non-empty paragraph after the title line.

    Skips list bullets and other structural markers so the description is
    prose-ish. Truncates at 200 chars with an ellipsis if needed.
    """
    lines = text.splitlines()
    start = 0
    for i, line in enumerate(lines):
        if line.strip() == title_line.strip():
            start = i + 1
            break

    # Match any heading (# through ######), common bullets, and numbered lists
    # ("1.", "42.", "1)"). All require whitespace after the marker.
    list_marker_re = re.compile(r"^(?:#+|[-*•]|\d+[.)])\s")

    para: list[str] = []
    for line in lines[start:]:
        stripped = line.strip()
        if not stripped:
            if para:
                break
            continue
        if list_marker_re.match(stripped):
            if para:
                break
            continue
        para.append(stripped)

    text_out = " ".join(para)
    if len(text_out) > 200:
        text_out = text_out[:197].rstrip() + "…"
    return text_out


def parse_recipe(md_path: Path, rel_path: str) -> Recipe | None:
    raw = md_path.read_text(encoding="utf-8", errors="replace")

    # 1. Strip TOML/YAML frontmatter but capture title/description if declared.
    title: str | None = None
    description: str | None = None
    body = raw
    fm_match = _FRONTMATTER_RE.match(raw)
    if fm_match:
        fm = fm_match.group(1)
        title = _extract_frontmatter_field(fm, "title")
        description = _extract_frontmatter_field(fm, "description")
        body = raw[fm_match.end():]

    # 2. Title derivation delegated to _derive_title so its precedence and
    #    cleanup rules are testable in isolation from I/O.
    title = _derive_title(body, title, rel_path)

    # 3. Description: frontmatter > first paragraph after title > blank.
    if not description:
        description = _first_paragraph_after_title(body, title)

    # 4. Category: top-level dir, else "General".
    parts = rel_path.split("/")
    category = parts[0].replace("-", " ").replace("_", " ").title() if len(parts) > 1 else "General"

    # 5. Added date via git log (ISO 8601, author date, ascending → first hit is add).
    added = _git_first_added(md_path, rel_path)

    return Recipe(
        path=rel_path,
        title=title,
        description=description or "",
        added=added,
        category=category,
    )


def _git_first_added(md_path: Path, rel_path: str) -> str:
    """Return YYYY-MM-DD of the commit that first introduced this file.

    Runs `git log` in the process's cwd — the caller chdirs into the clone
    before parsing, so relative paths resolve correctly.
    """
    try:
        out = subprocess.check_output(
            ["git", "log", "--diff-filter=A", "--follow", "--format=%aI", "--reverse", "--", rel_path],
            text=True,
        ).strip()
    except subprocess.CalledProcessError:
        return ""
    # First line is the earliest add commit's author-date.
    first_line = out.splitlines()[0] if out else ""
    return first_line[:10]  # ISO date portion only.


# --------------------------------------------------------------------------- #
# YAML emission (stdlib-only)
# --------------------------------------------------------------------------- #

def _yaml_escape(s: str) -> str:
    # Always emit as a JSON-quoted string; YAML accepts it and it handles every
    # awkward character (colons, emojis, backslashes) without hand-rolled rules.
    return json.dumps(s, ensure_ascii=False)


def emit_yaml(recipes: list[Recipe]) -> str:
    lines = [
        "# Auto-generated by scripts/sync-recipes.py — do not edit by hand.",
        f"# Source: https://github.com/{ARGS.repo}",
        "recipes:",
    ]
    for r in recipes:
        lines.append(f"  - title:       {_yaml_escape(r.title)}")
        lines.append(f"    description: {_yaml_escape(r.description)}")
        lines.append(f"    category:    {_yaml_escape(r.category)}")
        lines.append(f"    path:        {_yaml_escape(r.path)}")
        lines.append(f"    url:         {_yaml_escape(r.url)}")
        lines.append(f"    added:       {_yaml_escape(r.added)}")
    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #

def _shallow_clone(repo: str, branch: str, dest: Path) -> None:
    # Full clone (not shallow) so `git log --diff-filter=A` sees the first
    # commit that added each file. Small repo (~60KB), the extra cost is nil.
    url = f"https://github.com/{repo}.git"
    subprocess.check_call(
        ["git", "clone", "--quiet", "--branch", branch, url, str(dest)],
        stderr=subprocess.DEVNULL,
    )


def collect_markdown_files(repo_dir: Path) -> list[str]:
    files: list[str] = []
    for p in sorted(repo_dir.rglob("*.md")):
        if ".git" in p.parts:
            continue
        rel = p.relative_to(repo_dir).as_posix()
        if rel in SKIP_PATHS:
            continue
        files.append(rel)
    return files


def main(argv: Iterable[str] | None = None) -> int:
    global ARGS
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", default=DEFAULT_REPO,
                    help=f"GitHub owner/name (default: {DEFAULT_REPO})")
    ap.add_argument("--branch", default=DEFAULT_BRANCH,
                    help=f"Branch to sync from (default: {DEFAULT_BRANCH})")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT,
                    help=f"Output YAML path (default: {DEFAULT_OUT})")
    ap.add_argument("--dry-run", action="store_true",
                    help="Print the YAML to stdout instead of writing to --out")
    ARGS = ap.parse_args(list(argv) if argv is not None else None)

    with tempfile.TemporaryDirectory(prefix="recipes-sync-") as tmp:
        repo_dir = Path(tmp) / "repo"
        _shallow_clone(ARGS.repo, ARGS.branch, repo_dir)

        # Change into the repo so _git_first_added's git log runs there.
        import os
        os.chdir(repo_dir)

        rels = collect_markdown_files(repo_dir)
        recipes: list[Recipe] = []
        for rel in rels:
            r = parse_recipe(repo_dir / rel, rel)
            if r is not None:
                recipes.append(r)

    # Sort: category asc, then title asc within category.
    recipes.sort(key=lambda r: (r.category.lower(), r.title.lower()))

    yaml_text = emit_yaml(recipes)

    if ARGS.dry_run:
        sys.stdout.write(yaml_text)
        return 0

    out = ARGS.out
    # Resolve --out relative to the repo root, not the temp clone we chdir'd into.
    if not out.is_absolute():
        # Best effort: assume this script lives in <repo>/scripts/.
        script_root = Path(__file__).resolve().parent.parent
        out = script_root / out
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(yaml_text, encoding="utf-8")
    sys.stderr.write(f"Wrote {len(recipes)} recipes to {out}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
