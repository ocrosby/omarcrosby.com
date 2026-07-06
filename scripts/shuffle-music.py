#!/usr/bin/env python3
"""Shuffle entries in data/music.yaml, keeping entries[0] pinned.

The featured "now playing" entry (position 0) is never moved; entries 1..N
are shuffled in place. Any file preamble (comments or blank lines above the
first ``- youtube_id:`` line) is preserved verbatim.

Shared between two Claude slash-command skills:

- /randomize-music — invokes this script as its only mutation step, then
  handles preconditions, diff check, build verify, commit, and push.
- /add-music — after prepending a freshly-parsed YouTube video to the top
  of the file, invokes this script so the previously-existing entries are
  randomized among themselves (preventing session clumps when several songs
  are added in a row).

Stdlib only. Idempotent on 0-or-1-entry playlists (nothing to shuffle).

Usage:
  scripts/shuffle-music.py [--dry-run] [--path PATH]
"""

from __future__ import annotations

import argparse
import pathlib
import random
import re
import sys

DEFAULT_PATH = pathlib.Path("data/music.yaml")
ENTRY_MARKER = "- youtube_id:"


def shuffle_music_yaml(text: str) -> str:
    """Return ``text`` with entries[1..N] randomized. entries[0] stays pinned.

    Preserves any preamble (content before the first ``- youtube_id:`` line).
    On playlists with fewer than 2 entries the function is a no-op — the
    input text is returned unchanged.
    """
    entries = [e for e in re.split(r"(?m)^(?=- youtube_id:)", text) if e.strip()]
    if len(entries) < 2:
        return text
    idx = text.index(ENTRY_MARKER)
    preamble = text[:idx]
    head, rest = entries[0], entries[1:]
    random.shuffle(rest)
    return preamble + head + "".join(rest)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the shuffled content to stdout without writing to disk.",
    )
    parser.add_argument(
        "--path",
        type=pathlib.Path,
        default=DEFAULT_PATH,
        help=f"Path to the YAML file (default: {DEFAULT_PATH}).",
    )
    args = parser.parse_args()

    if not args.path.exists():
        print(f"file not found: {args.path}", file=sys.stderr)
        return 1

    text = args.path.read_text()
    output = shuffle_music_yaml(text)

    if args.dry_run:
        sys.stdout.write(output)
        return 0

    args.path.write_text(output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
