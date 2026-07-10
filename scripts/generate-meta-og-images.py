#!/usr/bin/env python3
"""Generate site-wide + top-level-page OpenGraph preview images.

Renders 1200x630 branded cards for the four meta surfaces that used to
fall back to the plain site-wide og.png:

- Site-wide fallback (`static/images/og.jpg`) — anything without a
  per-page cover. Home page and any other page whose layout doesn't
  set `.Params.cover.image`.
- `/about/` (`static/images/og/meta/about.jpg`)
- `/uses/`  (`static/images/og/meta/uses.jpg`)
- `/now/`   (`static/images/og/meta/now.jpg`)

Each image composites the author's cropped headshot (already
face-centered at static/images/omar.jpg) into a circle on the left,
plus a text stack on the right — label, title, subtitle, site mark.

Design tokens match scripts/generate-og-images.py (posts) and
scripts/generate-music-og-images.py (music) so the four families of
OG images read as one site brand.
"""

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PHOTO_SRC = REPO_ROOT / "static" / "images" / "omar.jpg"
STATIC_IMAGES = REPO_ROOT / "static" / "images"
META_DIR = STATIC_IMAGES / "og" / "meta"

# Design tokens — echo the site's dark theme (--theme rgb(29, 30, 32))
# and match generate-og-images.py + generate-music-og-images.py.
WIDTH = 1200
HEIGHT = 630
BG = "#1d1e20"
FG = "#ffffff"
MUTED_STRONG = "#c4c4c5"
MUTED = "#8a8a8a"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"

PHOTO_SIZE = 400
PAD = 80
PHOTO_X = PAD
PHOTO_Y = (HEIGHT - PHOTO_SIZE) // 2  # vertically centered — 115

TEXT_X = PHOTO_X + PHOTO_SIZE + 60   # 540
TEXT_MAX_W = WIDTH - TEXT_X - PAD    # 580

LABEL_PT = 28
LABEL_Y = 140

TITLE_PT = 60
TITLE_Y = 200
TITLE_LINE_H = 72
# Meta-page titles are short ("Omar Crosby", "What I'm doing now", etc.)
# Two-line reserve keeps the subtitle close to the title without leaving
# a big gap when the title is a single line.
TITLE_MAX_LINES = 2

SUBTITLE_PT = 32
SUBTITLE_Y_OFFSET = 20
SUBTITLE_LINE_H = 42
# Three lines of subtitle ends at y=490 (with title 2-line reserve),
# leaving a 30 px gap above the site mark at y=520. Four lines would
# overlap the mark.
SUBTITLE_MAX_LINES = 3

MARK_PT = 28
MARK_Y = HEIGHT - PAD - 30           # 520


def make_circle(src: Path, size: int, dst: Path) -> None:
    """Crop `src` to a circular PNG at `size` px, saved to `dst`.

    Two-stage: resize+square-crop to `size x size`, then mask with a
    filled white circle whose alpha becomes the composite's alpha.
    """
    subprocess.run(
        [
            "magick",
            str(src),
            "-resize", f"{size}x{size}^",
            "-gravity", "Center",
            "-crop", f"{size}x{size}+0+0",
            "+repage",
            "(", "-size", f"{size}x{size}", "xc:none",
            "-fill", "white",
            "-draw", f"circle {size // 2},{size // 2} {size // 2},0",
            ")",
            "-alpha", "off",
            "-compose", "CopyOpacity",
            "-composite",
            str(dst),
        ],
        check=True,
    )


def render(label: str, title: str, subtitle: str, out: Path) -> None:
    """Composite one OG image with the headshot + text stack."""
    tmp_photo = out.parent / f".{out.stem}.circle.png"
    make_circle(PHOTO_SRC, PHOTO_SIZE, tmp_photo)

    title_box_h = TITLE_LINE_H * TITLE_MAX_LINES
    subtitle_y = TITLE_Y + title_box_h + SUBTITLE_Y_OFFSET
    subtitle_box_h = SUBTITLE_LINE_H * SUBTITLE_MAX_LINES

    cmd = [
        "magick",
        # 1. Canvas.
        "-size", f"{WIDTH}x{HEIGHT}",
        f"xc:{BG}",
        # 2. Composite circular photo, left-centered.
        str(tmp_photo),
        "-geometry", f"+{PHOTO_X}+{PHOTO_Y}",
        "-compose", "Over",
        "-composite",
        # 3. Section label.
        "-fill", MUTED,
        "-font", FONT_BOLD,
        "-pointsize", str(LABEL_PT),
        "-gravity", "NorthWest",
        "-annotate", f"+{TEXT_X}+{LABEL_Y}", label.upper(),
        # 4. Title (auto-wrap up to TITLE_MAX_LINES).
        "(",
        "-background", "none",
        "-fill", FG,
        "-font", FONT_BOLD,
        "-pointsize", str(TITLE_PT),
        "-size", f"{TEXT_MAX_W}x{title_box_h}",
        f"caption:{title}",
        ")",
        "-gravity", "NorthWest",
        "-geometry", f"+{TEXT_X}+{TITLE_Y}",
        "-composite",
    ]
    if subtitle:
        cmd += [
            "(",
            "-background", "none",
            "-fill", MUTED_STRONG,
            "-font", FONT_REGULAR,
            "-pointsize", str(SUBTITLE_PT),
            "-size", f"{TEXT_MAX_W}x{subtitle_box_h}",
            f"caption:{subtitle}",
            ")",
            "-gravity", "NorthWest",
            "-geometry", f"+{TEXT_X}+{subtitle_y}",
            "-composite",
        ]
    # 5. Site mark bottom-left, aligned with the text stack.
    cmd += [
        "-fill", MUTED,
        "-font", FONT_REGULAR,
        "-pointsize", str(MARK_PT),
        "-gravity", "NorthWest",
        "-annotate", f"+{TEXT_X}+{MARK_Y}", "omarcrosby.com",
        # 6. JPEG output. Same tokens as generate-music-og-images.py.
        "-strip",
        "-quality", "90",
        "-sampling-factor", "4:2:0",
        "-interlace", "Plane",
        str(out),
    ]
    subprocess.run(cmd, check=True)
    tmp_photo.unlink(missing_ok=True)


# Copy shape carried in this dict:
#   slug        — printed in the log line
#   label       — small caps label above the title
#   title       — main headline
#   subtitle    — supporting one-liner (auto-wraps)
#   out         — output path relative to REPO_ROOT
META_PAGES = [
    {
        "slug": "site",
        "label": "omarcrosby.com",
        "title": "Omar Crosby",
        "subtitle": "Software engineer building distributed systems, Neovim developer tooling, and code-quality analyzers.",
        "out": STATIC_IMAGES / "og.jpg",
    },
    {
        "slug": "about",
        "label": "About",
        "title": "Omar Crosby",
        "subtitle": "Software engineer at The Weather Company. Sports data, distributed systems, Neovim.",
        "out": META_DIR / "about.jpg",
    },
    {
        "slug": "uses",
        "label": "Uses",
        "title": "What I actually use",
        "subtitle": "Editor, shell, languages, hosting, and release stack — the tools I reach for day to day.",
        "out": META_DIR / "uses.jpg",
    },
    {
        "slug": "now",
        "label": "Now",
        "title": "What I'm doing now",
        "subtitle": "Current focus — updated monthly. Following the nownownow.com convention.",
        "out": META_DIR / "now.jpg",
    },
]


def main() -> int:
    if not PHOTO_SRC.exists():
        print(f"FAIL: {PHOTO_SRC} not found", file=sys.stderr)
        return 1
    META_DIR.mkdir(parents=True, exist_ok=True)

    fail = 0
    for page in META_PAGES:
        out = page["out"]
        try:
            render(page["label"], page["title"], page["subtitle"], out)
            size_kb = out.stat().st_size // 1024
            print(f"OK   {out.relative_to(REPO_ROOT)} ({size_kb} KB)  [{page['slug']}]")
        except subprocess.CalledProcessError as e:
            print(f"FAIL {page['slug']}: {e}", file=sys.stderr)
            fail += 1
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
