#!/usr/bin/env python3
"""Generate per-project OpenGraph preview images.

Reads every content/projects/*.md, extracts the title and summary
from TOML front matter, and shells out to ImageMagick to render a
1200x630 PNG per project into static/images/og/projects/<slug>.png.

Design tokens match scripts/generate-og-images.py (posts) — dark
canvas, "PROJECT" label, project title (large white, auto-wrapped),
project summary (muted-normal, auto-wrapped), site mark bottom-left.
No thumbnail — projects are code/tooling, not videos.

Each project's front matter should carry:

    [cover]
    image = "/images/og/projects/<slug>.png"
    hiddenInList = true

so PaperMod's opengraph.html emits it as og:image and the
/projects/ list stays compact.

Re-runnable: overwrites existing images.

Requires: `magick` (ImageMagick 7) on PATH.
"""

import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PROJECTS_DIR = REPO_ROOT / "content" / "projects"
OUT_DIR = REPO_ROOT / "static" / "images" / "og" / "projects"

# Design tokens — same as scripts/generate-og-images.py (posts).
WIDTH = 1200
HEIGHT = 630
BG = "#1d1e20"
FG = "#ffffff"
MUTED = "#8a8a8a"
MUTED_STRONG = "#c4c4c5"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"

PAD = 80
LABEL_PT = 26
LABEL_Y = 100
TITLE_PT = 68
TITLE_Y = 175
TITLE_MAX_W = WIDTH - (2 * PAD)
TITLE_LINE_H = 82
TITLE_MAX_LINES = 2

SUMMARY_PT = 34
SUMMARY_Y_OFFSET = 24
SUMMARY_LINE_H = 46
SUMMARY_MAX_LINES = 4

MARK_PT = 28
MARK_Y = HEIGHT - PAD - 30


def parse_front_matter(text: str) -> dict:
    """Extract title, summary from TOML front matter. Returns {} on failure."""
    m = re.match(r"^\+\+\+\n(.*?)\n\+\+\+", text, re.DOTALL)
    if not m:
        return {}
    fm = m.group(1)
    out = {}
    for key in ("title", "summary"):
        km = re.search(rf'^{key}\s*=\s*"(.+)"\s*$', fm, re.MULTILINE)
        if km:
            out[key] = km.group(1)
    return out


def render(slug: str, title: str, summary: str) -> Path:
    """Composite one project OG PNG."""
    out = OUT_DIR / f"{slug}.png"

    title_box_h = TITLE_LINE_H * TITLE_MAX_LINES
    summary_y = TITLE_Y + title_box_h + SUMMARY_Y_OFFSET
    summary_box_h = SUMMARY_LINE_H * SUMMARY_MAX_LINES

    cmd = [
        "magick",
        # 1. Canvas.
        "-size", f"{WIDTH}x{HEIGHT}",
        f"xc:{BG}",
        # 2. Section label.
        "-fill", MUTED,
        "-font", FONT_BOLD,
        "-pointsize", str(LABEL_PT),
        "-gravity", "NorthWest",
        "-annotate", f"+{PAD}+{LABEL_Y}", "PROJECT",
        # 3. Title (auto-wrap up to TITLE_MAX_LINES).
        "(",
        "-background", "none",
        "-fill", FG,
        "-font", FONT_BOLD,
        "-pointsize", str(TITLE_PT),
        "-size", f"{TITLE_MAX_W}x{title_box_h}",
        f"caption:{title}",
        ")",
        "-gravity", "NorthWest",
        "-geometry", f"+{PAD}+{TITLE_Y}",
        "-composite",
    ]
    if summary:
        cmd += [
            "(",
            "-background", "none",
            "-fill", MUTED_STRONG,
            "-font", FONT_REGULAR,
            "-pointsize", str(SUMMARY_PT),
            "-size", f"{TITLE_MAX_W}x{summary_box_h}",
            f"caption:{summary}",
            ")",
            "-gravity", "NorthWest",
            "-geometry", f"+{PAD}+{summary_y}",
            "-composite",
        ]
    # 4. Site mark.
    cmd += [
        "-fill", MUTED,
        "-font", FONT_REGULAR,
        "-pointsize", str(MARK_PT),
        "-gravity", "NorthWest",
        "-annotate", f"+{PAD}+{MARK_Y}", "omarcrosby.com/projects",
        "-strip",
        "-define", "png:compression-level=9",
        str(out),
    ]
    subprocess.run(cmd, check=True)
    return out


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    projects = sorted(p for p in PROJECTS_DIR.glob("*.md") if p.name != "_index.md")
    fail = 0
    for project in projects:
        fm = parse_front_matter(project.read_text())
        title = fm.get("title", "").strip()
        summary = fm.get("summary", "").strip()
        if not title:
            print(f"SKIP {project.name}: no title in front matter", file=sys.stderr)
            fail += 1
            continue
        slug = project.stem
        try:
            out = render(slug, title, summary)
            size_kb = out.stat().st_size // 1024
            print(f"OK   {slug}.png ({size_kb} KB)  {title}")
        except subprocess.CalledProcessError as e:
            print(f"FAIL {project.name}: {e}", file=sys.stderr)
            fail += 1
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
