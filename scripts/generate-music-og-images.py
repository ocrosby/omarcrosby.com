#!/usr/bin/env python3
"""Generate per-song OpenGraph preview images for /music/<youtube_id>/ pages.

Reads data/music.yaml, downloads each song's YouTube thumbnail (cached
under scripts/.thumbnail-cache/), and shells out to ImageMagick to
composite a 1200x630 PNG per song into static/images/og/music/<id>.png.

Design tokens match scripts/generate-og-images.py (post OG generator)
so both families of OG images look like they came from the same site.

Modes:
    --all              Regenerate images for every entry in data/music.yaml
    --only <id> ...    Regenerate only the specified youtube_id(s)

Re-runnable: overwrites existing images. Skips network fetch when the
thumbnail is already cached.

Requires: `magick` (ImageMagick 7) on PATH. Uses stdlib only.
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MUSIC_YAML = REPO_ROOT / "data" / "music.yaml"
OUT_DIR = REPO_ROOT / "static" / "images" / "og" / "music"
CACHE_DIR = REPO_ROOT / "scripts" / ".thumbnail-cache"

# Design tokens — echo the site's dark theme (--theme rgb(29, 30, 32))
# and match scripts/generate-og-images.py so the two OG families look
# like the same site.
WIDTH = 1200
HEIGHT = 630
BG = "#201d1b"          # warm brown-black — matches site --theme dark
FG = "#f0e8dc"          # cream — matches site --primary dark
MUTED_STRONG = "#c4c4c5"  # artist text
MUTED = "#b4a898"       # warm secondary — matches site --secondary dark
ACCENT = "#c26a5a"      # terracotta — matches site --accent dark
FONT_BOLD = str(REPO_ROOT / "scripts" / "fonts" / "fraunces-v38-latin-700.ttf")
FONT_REGULAR = str(REPO_ROOT / "scripts" / "fonts" / "fraunces-v38-latin-regular.ttf")

# Layout constants — thumbnail on the left, text stack on the right.
PAD = 80
LABEL_Y = 60           # "MUSIC" section label
THUMB_W = 480
THUMB_H = 270
THUMB_X = PAD
THUMB_Y = 180          # vertically centered-ish (leaves room for label above, mark below)
TEXT_X = PAD + THUMB_W + 60
TEXT_MAX_W = WIDTH - TEXT_X - PAD
TITLE_Y = 180
ARTIST_Y_OFFSET = 20   # gap below the (auto-wrapped) title block
ALBUM_Y_OFFSET = 16    # gap below artist
LABEL_PT = 26
TITLE_PT = 44
TITLE_LINE_H = 54      # ImageMagick caption line height for the title box
TITLE_MAX_LINES = 4    # cap at 4 lines (216px). At 4 lines, artist+album still clears the site mark by ~50px.
ARTIST_PT = 32
ALBUM_PT = 24
MARK_PT = 28
MARK_Y = HEIGHT - PAD - 30   # bottom-left, aligned with padding


def load_music() -> list[dict]:
    """Parse data/music.yaml with stdlib only.

    The file is intentionally simple (a flat list of `- youtube_id: "..."`
    blocks with 7 known scalar fields), so a tiny state machine is enough.
    Avoids adding a PyYAML dependency for a single-purpose script.
    """
    entries = []
    current = None
    for raw in MUSIC_YAML.read_text().splitlines():
        line = raw.rstrip()
        if not line:
            continue
        m = re.match(r"^-\s+youtube_id:\s*\"([^\"]+)\"\s*$", line)
        if m:
            if current is not None:
                entries.append(current)
            current = {"youtube_id": m.group(1)}
            continue
        if current is None:
            continue
        m = re.match(r"^\s+(\w+):\s*\"?(.*?)\"?\s*$", line)
        if m:
            key = m.group(1)
            val = m.group(2)
            current[key] = val
    if current is not None:
        entries.append(current)
    return entries


def fetch_thumbnail(youtube_id: str) -> Path | None:
    """Download the best-available YouTube thumbnail for `youtube_id`.

    Tries maxresdefault (1280x720, 16:9) first, falls back to hqdefault
    (480x360, 4:3 letterboxed, always exists). Cached to
    scripts/.thumbnail-cache/<id>.jpg — subsequent runs are network-free.

    Uses `curl` rather than stdlib urllib because the system Python on
    macOS is regularly missing a CA bundle (SSL: CERTIFICATE_VERIFY_FAILED
    for i.ytimg.com). curl is guaranteed present on macOS + Fly builders.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = CACHE_DIR / f"{youtube_id}.jpg"
    if cached.exists() and cached.stat().st_size > 5000:
        return cached

    for variant in ("maxresdefault", "hqdefault"):
        url = f"https://i.ytimg.com/vi/{youtube_id}/{variant}.jpg"
        result = subprocess.run(
            [
                "curl",
                "-sLf",           # silent, follow redirects, fail on 4xx/5xx
                "--max-time", "15",
                "-A", "omarcrosby.com/og-image-generator",
                "-o", str(cached),
                url,
            ],
            capture_output=True,
        )
        # YouTube returns a 120x90 grey placeholder for missing maxresdefault
        # via HTTP 404, which -f above already rejects. hqdefault is always
        # present, so it should not hit this branch — but guard anyway.
        if result.returncode == 0 and cached.exists() and cached.stat().st_size > 5000:
            return cached
        cached.unlink(missing_ok=True)
    return None


def _tight_crop_16x9(src: Path, dst: Path) -> None:
    """Crop-and-fit `src` into a 480x270 16:9 image, saved to `dst`.

    hqdefault is 4:3 (480x360) — a naive resize would squish. Crop the
    center to 16:9 and resize. maxresdefault is already 16:9 so this is
    effectively a resize.
    """
    subprocess.run(
        [
            "magick",
            str(src),
            "-resize", f"{THUMB_W}x^",
            "-gravity", "Center",
            "-crop", f"{THUMB_W}x{THUMB_H}+0+0",
            "+repage",
            str(dst),
        ],
        check=True,
    )


def render(entry: dict, thumb: Path) -> Path:
    """Composite a single OG image for `entry`. Returns the output path.

    Output is JPEG (not PNG) because these images embed a photograph —
    lossless PNG bloats to 250-400 KB each; JPEG at quality 90 lands
    at 80-140 KB with imperceptible loss on both the photograph and
    the flat-background text. Facebook / Twitter / LinkedIn all accept
    JPEG for og:image.
    """
    youtube_id = entry["youtube_id"]
    out = OUT_DIR / f"{youtube_id}.jpg"
    tmp_thumb = CACHE_DIR / f"{youtube_id}.cropped.png"
    _tight_crop_16x9(thumb, tmp_thumb)

    title = entry.get("title", "").strip() or "Untitled"
    artist = entry.get("artist", "").strip() or "Unknown artist"
    album = entry.get("album", "").strip()
    year = str(entry.get("year", "")).strip()
    album_line_parts = [p for p in (album, year) if p]
    album_line = " · ".join(album_line_parts)

    # Title height governs where the artist row lands. cap at 3 lines.
    title_box_h = TITLE_LINE_H * TITLE_MAX_LINES
    artist_y = TITLE_Y + title_box_h + ARTIST_Y_OFFSET
    album_y = artist_y + ARTIST_PT + ALBUM_Y_OFFSET

    cmd = [
        "magick",
        # 1. Base canvas.
        "-size", f"{WIDTH}x{HEIGHT}",
        f"xc:{BG}",
        # 2. Section label ("MUSIC") top-left.
        "-fill", ACCENT,
        "-font", FONT_BOLD,
        "-pointsize", str(LABEL_PT),
        "-gravity", "NorthWest",
        "-annotate", f"+{PAD}+{LABEL_Y + 30}", "MUSIC",
        # 3. Composite the cropped thumbnail at THUMB_X, THUMB_Y.
        str(tmp_thumb),
        "-geometry", f"+{THUMB_X}+{THUMB_Y}",
        "-composite",
        # 4. Song title (auto-wrapped) top of the right column.
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
        # 5. Artist line.
        "-fill", MUTED_STRONG,
        "-font", FONT_REGULAR,
        "-pointsize", str(ARTIST_PT),
        "-gravity", "NorthWest",
        "-annotate", f"+{TEXT_X}+{artist_y}", artist,
    ]
    if album_line:
        cmd += [
            "-fill", MUTED,
            "-font", FONT_REGULAR,
            "-pointsize", str(ALBUM_PT),
            "-annotate", f"+{TEXT_X}+{album_y}", album_line,
        ]
    # 6. Site mark bottom-left, then JPEG-encode with quality 90 +
    # 4:2:0 chroma subsampling + progressive scan. -strip drops the
    # EXIF/color-profile bytes IM would otherwise embed.
    cmd += [
        "-fill", MUTED,
        "-font", FONT_REGULAR,
        "-pointsize", str(MARK_PT),
        "-annotate", f"+{PAD}+{MARK_Y}", "omarcrosby.com/music",
        "-strip",
        "-quality", "90",
        "-sampling-factor", "4:2:0",
        "-interlace", "Plane",
        str(out),
    ]
    subprocess.run(cmd, check=True)
    tmp_thumb.unlink(missing_ok=True)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true", help="regenerate all entries")
    group.add_argument("--only", nargs="+", metavar="ID", help="regenerate only these youtube_ids")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    entries = load_music()
    entries_by_id = {e["youtube_id"]: e for e in entries}

    if args.all:
        targets = entries
    else:
        targets = []
        for wanted in args.only:
            if wanted not in entries_by_id:
                print(f"FAIL {wanted}: not found in data/music.yaml", file=sys.stderr)
                return 1
            targets.append(entries_by_id[wanted])

    fail = 0
    for entry in targets:
        youtube_id = entry["youtube_id"]
        thumb = fetch_thumbnail(youtube_id)
        if thumb is None:
            print(f"FAIL {youtube_id}: no thumbnail available", file=sys.stderr)
            fail += 1
            continue
        try:
            out = render(entry, thumb)
            size_kb = out.stat().st_size // 1024
            print(f"OK   {youtube_id}.jpg ({size_kb} KB)  {entry.get('title', '')} — {entry.get('artist', '')}")
        except subprocess.CalledProcessError as e:
            print(f"FAIL {youtube_id}: {e}", file=sys.stderr)
            fail += 1
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
