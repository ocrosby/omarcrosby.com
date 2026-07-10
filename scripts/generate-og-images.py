#!/usr/bin/env python3
"""Generate per-post OpenGraph preview images.

Reads every content/posts/*.md, extracts the title and primary category
from TOML front matter, and shells out to ImageMagick to render a
1200x630 PNG per post into static/images/og/<slug>.png.

Each post's front matter should carry:

    [cover]
    image = "/images/og/<slug>.png"

so PaperMod's opengraph.html template emits it as og:image.

Re-runnable: overwrites existing images. Non-destructive to any other
files. Skips _index.md.

Requires: `magick` (ImageMagick 7) on PATH.
"""

import os
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
POSTS_DIR = REPO_ROOT / "content" / "posts"
OUT_DIR = REPO_ROOT / "static" / "images" / "og"

# Design tokens — echo the site's dark theme (--theme rgb(29, 30, 32)).
WIDTH = 1200
HEIGHT = 630
BG = "#201d1b"          # warm brown-black — matches site --theme dark
FG = "#f0e8dc"          # cream — matches site --primary dark
MUTED = "#b4a898"       # warm secondary — matches site --secondary dark
ACCENT = "#c26a5a"      # terracotta — matches site --accent dark
FONT_BOLD = str(REPO_ROOT / "scripts" / "fonts" / "fraunces-v38-latin-700.ttf")
FONT_REGULAR = str(REPO_ROOT / "scripts" / "fonts" / "fraunces-v38-latin-regular.ttf")
TITLE_PT = 60
LABEL_PT = 26
MARK_PT = 28
PAD_X = 80
LABEL_Y = 100
TITLE_Y = 165
TITLE_MAX_W = WIDTH - (2 * PAD_X)
TITLE_MAX_H = 340  # room for 3-4 title lines before the site mark
MARK_Y = HEIGHT - 90  # from the top


def parse_front_matter(text: str) -> dict:
    """Extract title, category, from TOML front matter. Returns {} on failure."""
    m = re.match(r"^\+\+\+\n(.*?)\n\+\+\+", text, re.DOTALL)
    if not m:
        return {}
    fm = m.group(1)
    out = {}
    for key in ("title", "categories"):
        # title = "..."  or  categories = ["..."]
        km = re.search(rf'^{key}\s*=\s*(.+)$', fm, re.MULTILINE)
        if not km:
            continue
        raw = km.group(1).strip()
        if key == "categories":
            # ["Code Quality"] -> Code Quality
            lm = re.match(r'\[\s*"([^"]+)"', raw)
            out[key] = lm.group(1) if lm else ""
        else:
            # "Title text" -> Title text
            sm = re.match(r'"(.+)"$', raw)
            out[key] = sm.group(1) if sm else raw.strip('"')
    return out


def render(slug: str, title: str, category: str) -> Path:
    """Render a single OG image with ImageMagick. Returns the output path."""
    out = OUT_DIR / f"{slug}.png"

    # Two-stage composition:
    # 1. Render the title with caption: which auto-wraps to TITLE_MAX_W.
    # 2. Composite it onto a fresh dark canvas alongside the category
    #    label (top) and site mark (bottom).
    cmd = [
        "magick",
        "-size", f"{WIDTH}x{HEIGHT}",
        f"xc:{BG}",
        # Category label (uppercase, muted, top-left).
        "-fill", ACCENT,
        "-font", FONT_BOLD,
        "-pointsize", str(LABEL_PT),
        "-gravity", "NorthWest",
        "-annotate", f"+{PAD_X}+{LABEL_Y}", category.upper(),
        # Title (auto-wrapped via caption:).
        "(",
        "-background", BG,
        "-fill", FG,
        "-font", FONT_BOLD,
        "-pointsize", str(TITLE_PT),
        "-size", f"{TITLE_MAX_W}x{TITLE_MAX_H}",
        f"caption:{title}",
        ")",
        "-gravity", "NorthWest",
        "-geometry", f"+{PAD_X}+{TITLE_Y}",
        "-composite",
        # Site mark (bottom-left).
        "-fill", MUTED,
        "-font", FONT_REGULAR,
        "-pointsize", str(MARK_PT),
        "-gravity", "NorthWest",
        "-annotate", f"+{PAD_X}+{MARK_Y}", "omarcrosby.com",
        str(out),
    ]
    subprocess.run(cmd, check=True)
    return out


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    posts = sorted(p for p in POSTS_DIR.glob("*.md") if p.name != "_index.md")
    fail = 0
    for post in posts:
        fm = parse_front_matter(post.read_text())
        title = fm.get("title", "").strip()
        category = fm.get("categories", "").strip()
        if not title:
            print(f"SKIP {post.name}: no title in front matter", file=sys.stderr)
            fail += 1
            continue
        slug = post.stem
        try:
            out = render(slug, title, category or "OMARCROSBY.COM")
            size_kb = out.stat().st_size // 1024
            print(f"OK   {slug}.png ({size_kb} KB)  [{category}]  {title}")
        except subprocess.CalledProcessError as e:
            print(f"FAIL {post.name}: {e}", file=sys.stderr)
            fail += 1
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
