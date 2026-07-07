#!/usr/bin/env python3
"""Backfill the ``genre`` field on every entry in data/music.yaml.

One-shot: reads the hardcoded ``MAPPING`` (``youtube_id -> genre``) below,
inserts ``genre: "..."`` immediately after each entry's ``album:`` line.

Guards against duplication:

- If an entry already has a ``genre:`` line, the script refuses to run
  (does not silently clobber). Delete existing genre lines by hand if
  a reclassification is needed.
- Every ``youtube_id`` in ``data/music.yaml`` must appear in ``MAPPING``.
- Every ``youtube_id`` in ``MAPPING`` must appear in ``data/music.yaml``.

Both symmetry checks fail loudly so drift between the file and the mapping
surfaces on the next run, not weeks later.

Stdlib only. Format-preserving (regex-based, matches the shape produced
by ``/add-music``).

Usage:
  scripts/backfill-genres.py [--dry-run] [--path PATH]
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys

DEFAULT_PATH = pathlib.Path("data/music.yaml")
ENTRY_MARKER = "- youtube_id:"

# Canonical genre taxonomy — alphabetical. When adding a new value here,
# also add it to the /add-music command's genre step so future entries
# stay inside the same closed set. Keeping the list small is deliberate:
# the /music page filter dropdown becomes noise past ~15 buckets.
GENRES: tuple[str, ...] = (
    "Alternative",
    "Country",
    "Disco",
    "Folk",
    "Funk",
    "Gospel",
    "Hip-Hop",
    "Latin",
    "Pop",
    "R&B",
    "Reggae",
    "Rock",
    "Soul",
    "Soundtrack",
)

# Classification by YouTube video ID. Sourced from song knowledge, not a
# runtime API — chosen once, committed, easy to hand-edit if a call was
# wrong. Order below is the file order at authoring time; the script does
# not depend on any order.
MAPPING: dict[str, str] = {
    "lZABxj718uA": "Folk",         # Harry Belafonte — The Banana Boat Song
    "3n71KUiWn1I": "Hip-Hop",      # Nicki Minaj — Fly ft. Rihanna
    "bnVUHWCynig": "R&B",          # Beyoncé — Halo
    "FTQbiNvZqaY": "Rock",         # Toto — Africa
    "XBZUz4C6kqk": "Pop",          # Go West — King Of Wishful Thinking
    "NHozn0YXAeE": "Pop",          # Hanson — MMMBop
    "dLl4PZtxia8": "Rock",         # Eagles — Hotel California
    "asXau88O5Is": "R&B",          # Monica — Don't Take It Personal
    "rPJz3syNbtE": "R&B",          # The Whispers — Rock Steady
    "Pn8iinkhR3w": "Hip-Hop",      # Nappy Roots — Good Day
    "yge2PqEZZJo": "R&B",          # Brandy — Sittin' Up in My Room
    "LfRNRymrv9k": "R&B",          # Mariah Carey — Always Be My Baby
    "nqAvFx3NxUM": "Pop",          # Lionel Richie — All Night Long
    "cNgVH52EnXQ": "Soundtrack",   # August Rush — Guitar Play
    "IDI2WQJyE7I": "Rock",         # Starship — We Built This City
    "DNggE_hs14g": "Latin",        # Leon Thomas III — La Bamba
    "Jne9t8sHpUc": "Alternative",  # Alanis Morissette — Ironic
    "aJOTlE1K90k": "Pop",          # Maroon 5 — Girls Like You ft. Cardi B
    "WBKnpyoFEBo": "R&B",          # Jordin Sparks, Chris Brown — No Air
    "SwYN7mTi6HM": "Rock",         # Van Halen — Jump
    "TpxwGx5YMgU": "Soundtrack",   # Jem and the Holograms — I'm Still Here
    "O3VPs9b_HZE": "Soundtrack",   # Zendaya — Neverland (Finding Neverland)
    "K9F5xcpjDMU": "Hip-Hop",      # Black Sheep — The Choice Is Yours
    "QlPYub-gTjE": "Hip-Hop",      # 2Pac — Me Against The World
    "YQHsXMglC9A": "Pop",          # Adele — Hello
    "qrO4YZeyl0I": "Pop",          # Lady Gaga — Bad Romance
    "hTWKbfoikeg": "Alternative",  # Nirvana — Smells Like Teen Spirit
    "m3-hY-hlhBg": "Pop",          # Whitney Houston — How Will I Know
    "yv5xonFSC4c": "Reggae",       # Bob Marley & The Wailers — Redemption Song
    "m5RngkQFd4Q": "Country",      # Dixie Chicks + James Taylor — Carolina In My Mind
    "PLDMf5taUD4": "Gospel",       # BeBe & CeCe Winans — Lost Without You
    "oKOtzIo-uYw": "Hip-Hop",      # Fugees — Killing Me Softly
    "GLvohMXgcBo": "Alternative",  # Red Hot Chili Peppers — Under The Bridge
    "CqBtS6BIP1E": "Pop",          # Mariah Carey — Dreamlover
    "eH3giaIzONA": "Pop",          # Whitney Houston — I Wanna Dance With Somebody
    "M11SvDtPBhA": "Pop",          # Miley Cyrus — Party In The U.S.A.
    "MFxqp_wOUx8": "R&B",          # Chloe x Halle — Happy Without Me
    "ZNra8eK0K6k": "Soundtrack",   # Alessia Cara — How Far I'll Go (Moana)
    "2EwViQxSJJQ": "R&B",          # Beyoncé — Irreplaceable
    "qcnPfHS24Pg": "Hip-Hop",      # Arrested Development — Mr Wendal
    "6QBy_Oa5ZmM": "Soul",         # Doug Chapter — Papaoutai (Afro Soul)
    "7SXKHiPQPhk": "Pop",          # Janet Jackson — Together Again
    "79fzeNUqQbQ": "Pop",          # Madonna — Like A Prayer
    "zDo0H8Fm7d0": "Country",      # Bebe Rexha — Meant to Be
    "d-diB65scQU": "Pop",          # Bobby McFerrin — Don't Worry Be Happy
    "X5OqkD2OG-o": "R&B",          # New Edition — You're Not My Kind Of Girl
    "1F76N2R3P9E": "R&B",          # Halle — angel
    "LKaXY4IdZ40": "Soundtrack",   # Whitney + Mariah — When You Believe (Prince of Egypt)
    "3JWTaaS7LdU": "Pop",          # Whitney Houston — I Will Always Love You
    "6NXnxTNIWkc": "Rock",         # 4 Non Blondes — What's Up
    "v2AC41dglnM": "Rock",         # AC/DC — Thunderstruck
    "QUQsqBqxoR4": "Pop",          # Sara Bareilles — Brave
    "vx2u5uUu3DE": "Rock",         # Bon Jovi — It's My Life
    "OpQFFLBMEPI": "Pop",          # P!nk — Just Give Me A Reason
    "eocCPDxKq1o": "Pop",          # P!nk — Please Don't Leave Me
    "J3UjJ4wKLkg": "Pop",          # Rihanna — Take A Bow
    "UrIiLvg58SY": "Rock",         # Extreme — More Than Words
    "t4QK8RxCAwo": "Rock",         # Boston — More Than a Feeling
    "wQFIQwfxja4": "R&B",          # Roberta Flack + Maxi Priest — Set The Night To Music
    "GRz4FY0ZcwI": "Rock",         # Five for Fighting — Superman
    "B9qZz-m6BL4": "Hip-Hop",      # T.I. — Get Back Up ft. Chris Brown
    "zNgcYGgtf8M": "Pop",          # Billy Ocean — Get Outta My Dreams
    "87I2LJvq5XM": "Soundtrack",   # Jem and the Holograms — Alone Together
    "g2gy1Evb1Kg": "R&B",          # TLC — Unpretty
    "BCKna5ZoyN4": "Soundtrack",   # Halle Bailey — Part of Your World
    "sn8KYD1Vco0": "Funk",         # Cameo — Candy
    "P5ZJui3aPoQ": "Rock",         # Kansas — Carry on Wayward Son
    "nlcIKh6sBtc": "Pop",          # Lorde — Royals
    "JgDNFQ2RaLQ": "Pop",          # Ed Sheeran — Sapphire
    "RqQn2ADZE1A": "Rock",         # Aerosmith — Janie's Got A Gun
    "PmvT7B3u7II": "Soundtrack",   # Peabo Bryson + Regina Belle — A Whole New World
    "cAQSZhazYk8": "R&B",          # DeBarge — Rhythm Of The Night
    "GPTK7LOj24k": "R&B",          # Janet Jackson — Let's Wait Awhile
    "2g5Hz17C4is": "Reggae",       # Shaggy — It Wasn't Me
    "zXt56MB-3vc": "Reggae",       # UB40 — Red Red Wine
    "VdQY7BusJNU": "Pop",          # Cyndi Lauper — Time After Time
    "fcnDmrtj6Sk": "Latin",        # Shakira, Burna Boy — Dai Dai
    "3eOuK-pYhy4": "R&B",          # Monica — Angel Of Mine
    "RL2XUKigdWw": "R&B",          # New Edition — I'm Still In Love With You
    "If8by9Df4wM": "Pop",          # Lisa Lisa & Cult Jam — Lost In Emotion
    "Dkk9gvTmCXY": "Pop",          # Taylor Swift — You Need To Calm Down
    "DzwkcbTQ7ZE": "Pop",          # Jessie J — Flashlight
    "j2r2nDhTzO4": "Rock",         # Poison — Every Rose Has Its Thorn
    "uznTHSEgx4U": "R&B",          # Janet Jackson — Got Til It's Gone
    "1w7OgIMMRc4": "Rock",         # Guns N' Roses — Sweet Child O' Mine
    "fKopy74weus": "Rock",         # Imagine Dragons — Thunder
    "b7k0a5hYnSI": "Pop",          # Natasha Bedingfield — Unwritten
    "MrTz5xjmso4": "Pop",          # Sean Kingston — Beautiful Girls
    "koVHN6eO4Xg": "Hip-Hop",      # T.I. — Live Your Life ft. Rihanna
    "1Y3B9uSGBoE": "Soundtrack",   # Jem and the Holograms — The Way I Was
    "8UFIYGkROII": "Hip-Hop",      # Soulja Boy — Crank That
    "5anLPw0Efmo": "Rock",         # Evanescence — My Immortal
    "0hiUuL5uTKc": "R&B",          # Montell Jordan — This Is How We Do It
    "jQY_QL_wvQU": "Pop",          # Michael Jackson — Will You Be There
    "87gWaABqGYs": "Pop",          # Ed Sheeran — Galway Girl
    "j5W73HaVQBg": "Hip-Hop",      # Jermaine Dupri — Welcome To Atlanta
    "Ly_KqRseEug": "R&B",          # Ralph Tresvant — Do What I Gotta Do
    "LjhCEhWiKXk": "Pop",          # Bruno Mars — Just The Way You Are
    "rTVjnBo96Ug": "Soul",         # Otis Redding — (Sittin' On) The Dock Of The Bay
    "I1-Yl50nCX4": "Pop",          # Pink — Perfect (Live Acoustic)
    "lp-EO5I60KA": "Pop",          # Ed Sheeran — Thinking Out Loud
    "wrTuV4Szxzo": "R&B",          # Whitney Houston — Exhale (Shoop Shoop)
    "AGO19YOaw6U": "Disco",        # Diana Ross — I'm Coming Out
    "bWMw4vE3J8s": "Hip-Hop",      # Rich Homie Quan — Flex
    "9N9opF-PK5k": "R&B",          # Boyz II Men — Water Runs Dry
    "QbN6VkleO48": "Hip-Hop",      # Nappy Roots — Po' Folks
    "fUSOZAgl95A": "R&B",          # Boyz II Men — 4 Seasons Of Loneliness
    "AWpsOqh8q0M": "R&B",          # Beyoncé — If I Were A Boy
    "IxszlJppRQI": "R&B",          # Ne-Yo — So Sick
    "G8XwNyCgVqw": "R&B",          # New Edition — Boys To Men
    "aIXyKmElvv8": "Hip-Hop",      # Fugees — Ready Or Not
    "pRpeEdMmmQ0": "Pop",          # Shakira — Waka Waka
    "7flrKMGfwjw": "R&B",          # New Edition — Can You Stand The Rain
    "mgaeGW-2z6w": "R&B",          # Ne-Yo — Sexy Love
    "phaIklEphSM": "Rock",         # John Mayer — Say
    "ysYyCElzB0A": "R&B",          # Shanice — I Love Your Smile
    "buMUMcvYPH4": "Pop",          # Pink — Who Knew (Live Acoustic)
    "BtK_y1n2ERk": "Hip-Hop",      # PM Dawn — Set Adrift On Memory Bliss
    "5HLFBl7aa1A": "Soundtrack",   # Celine Dion — Beauty and the Beast
    "vHwXoY0LiQk": "R&B",          # SWV — Right Here (Human Nature Radio Mix)
    "cM4kqL13jGM": "Hip-Hop",      # Digable Planets — Rebirth of Slick
    "gI7YHZVc7mM": "Pop",          # Deniece Williams — Let's Hear It for the Boy
    "dV3AziKTBUo": "Rock",         # Steve Miller Band — The Joker
    "eXvBjCO19QY": "Hip-Hop",      # 2Pac — Changes
    "ZfGlxqYw56I": "R&B",          # The Jacksons — 2300 Jackson Street
    "tReIHIDX354": "R&B",          # TLC — Diggin' On You
    "SlPhMPnQ58k": "Pop",          # Maroon 5 — Memories
    "lDK9QqIzhwk": "Rock",         # Bon Jovi — Livin' On A Prayer
    "LxLhytQ67fs": "Pop",          # Cyndi Lauper — The Goonies 'R' Good Enough
    "ReI6gvzVP0Y": "R&B",          # New Edition — If It Isn't Love
    "wmDxJrggie8": "R&B",          # Luther Vandross — Dance With My Father
}

_ID_LINE = re.compile(r'^- youtube_id: "([^"]+)"', re.MULTILINE)
_ALBUM_LINE = re.compile(r'^(  album: "[^"]*"\n)', re.MULTILINE)
_HAS_GENRE = re.compile(r'^  genre:', re.MULTILINE)


def _split_entries(text: str) -> tuple[str, list[str]]:
    """Split the file into (preamble, list-of-entries).

    Each entry starts at a ``- youtube_id:`` line and includes everything up
    to but not including the next entry marker.
    """
    parts = [p for p in re.split(r"(?m)^(?=- youtube_id:)", text) if p]
    if not parts:
        return "", []
    if not parts[0].lstrip().startswith(ENTRY_MARKER):
        preamble, entries = parts[0], parts[1:]
    else:
        preamble, entries = "", parts
    return preamble, entries


def _validate_symmetry(entries: list[str]) -> tuple[list[str], list[str]]:
    """Return (missing_in_mapping, extra_in_mapping) — both should be empty."""
    file_ids = {m.group(1) for e in entries for m in _ID_LINE.finditer(e)}
    map_ids = set(MAPPING.keys())
    return sorted(file_ids - map_ids), sorted(map_ids - file_ids)


def backfill(text: str) -> str:
    """Insert a ``genre:`` line into every entry that lacks one.

    Refuses (raises RuntimeError) if any entry already has a genre line or
    if the mapping is out of sync with the file.
    """
    preamble, entries = _split_entries(text)

    missing, extra = _validate_symmetry(entries)
    if missing:
        raise RuntimeError(f"{len(missing)} youtube_id(s) in file missing from MAPPING: {missing[:5]}")
    if extra:
        raise RuntimeError(f"{len(extra)} youtube_id(s) in MAPPING missing from file: {extra[:5]}")

    already_genred = [e for e in entries if _HAS_GENRE.search(e)]
    if already_genred:
        first = _ID_LINE.search(already_genred[0])
        raise RuntimeError(
            f"{len(already_genred)} entry/entries already have a genre line "
            f"(first: {first.group(1) if first else '?'}) — refusing to overwrite"
        )

    unknown_genre = {v for v in MAPPING.values() if v not in GENRES}
    if unknown_genre:
        raise RuntimeError(f"MAPPING uses genre(s) outside GENRES taxonomy: {sorted(unknown_genre)}")

    out_entries: list[str] = []
    for entry in entries:
        id_match = _ID_LINE.search(entry)
        if not id_match:
            out_entries.append(entry)
            continue
        genre = MAPPING[id_match.group(1)]
        genre_line = f'  genre: "{genre}"\n'
        replaced = _ALBUM_LINE.sub(lambda m: m.group(1) + genre_line, entry, count=1)
        if replaced == entry:
            raise RuntimeError(f"entry for {id_match.group(1)} has no album: line — cannot insert genre")
        out_entries.append(replaced)

    return preamble + "".join(out_entries)


def main() -> int:
    """Parse args, run the backfill, write the result unless --dry-run."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the updated content to stdout without writing to disk.",
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
    try:
        output = backfill(text)
    except RuntimeError as exc:
        print(f"backfill refused: {exc}", file=sys.stderr)
        return 2

    if args.dry_run:
        sys.stdout.write(output)
        return 0

    args.path.write_text(output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
