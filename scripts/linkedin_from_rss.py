#!/usr/bin/env python3
"""
linkedin_from_rss.py — turn Hugo RSS entries into ready-to-paste LinkedIn posts.

Stdlib only. Works with Hugo's built-in RSS template (PaperMod included).

Examples
--------
  # Latest post from your site, printed to stdout
  ./linkedin_from_rss.py https://omarcrosby.com/index.xml

  # Last 3 posts, each written to its own .txt file
  ./linkedin_from_rss.py https://omarcrosby.com/index.xml -n 3 -o drafts/

  # Only posts published since a date
  ./linkedin_from_rss.py https://omarcrosby.com/index.xml --since 2026-06-01

  # Works on a local file too (e.g. Hugo's public/index.xml before deploy)
  ./linkedin_from_rss.py public/index.xml
"""

import argparse
import html
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

try:
    import tomllib  # Python 3.11+
except ImportError:  # pragma: no cover
    tomllib = None  # local front-matter lookup silently disabled

NS = {"content": "http://purl.org/rss/1.0/modules/content/"}

# LinkedIn truncates the post body behind a "…see more" fold at roughly this
# many characters, and hard-caps the whole post at 3000.
FOLD_CHARS = 210
MAX_CHARS = 3000


class Entry:
    def __init__(self, title, link, summary, published, tags):
        self.title = title
        self.link = link
        self.summary = summary
        self.published = published
        self.tags = tags


def strip_html(raw: str) -> str:
    """Hugo puts HTML-escaped markup in <description>. Unescape, then de-tag."""
    text = html.unescape(raw or "")
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<br\s*/?>|</p>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)  # entities can survive one pass
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def sentences(text: str):
    """Cheap sentence split. Good enough for a lede; not a linguistics project."""
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", text.replace("\n", " "))
    return [p.strip() for p in parts if p.strip()]


def to_hashtag(term: str) -> str:
    # Split on any non-alphanumeric run so `developer-tools`, `ci_cd`,
    # and `getting started` all end up as CamelCase — hyphenated tags
    # were previously fused (`Developertools`) because the strip
    # happened before the word split.
    words = [w for w in re.split(r"[^A-Za-z0-9]+", term) if w]
    if not words:
        return ""
    return "#" + "".join(w.capitalize() for w in words)


def load_feed(src: str) -> bytes:
    if src.startswith(("http://", "https://")):
        req = urllib.request.Request(
            src, headers={"User-Agent": "linkedin-from-rss/1.0"}
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.read()
    with open(src, "rb") as fh:
        return fh.read()


def parse_feed(blob: bytes):
    root = ET.fromstring(blob)
    channel = root.find("channel")
    if channel is None:
        raise SystemExit("Not an RSS 2.0 feed (no <channel>). Atom isn't supported.")

    entries = []
    for item in channel.findall("item"):
        title = (item.findtext("title") or "Untitled").strip()
        link = (item.findtext("link") or "").strip()

        # Prefer the full body if the feed carries it, else the summary.
        body = item.findtext("content:encoded", namespaces=NS) or item.findtext(
            "description"
        )
        summary = strip_html(body)

        pub_raw = item.findtext("pubDate")
        try:
            published = parsedate_to_datetime(pub_raw) if pub_raw else None
            if published and published.tzinfo is None:
                published = published.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            published = None

        tags = [c.text.strip() for c in item.findall("category") if c.text]
        entries.append(Entry(title, link, summary, published, tags))

    entries.sort(key=lambda e: e.published or datetime.min.replace(tzinfo=timezone.utc),
                 reverse=True)
    return entries


def read_local_tags(entry_link: str, content_root: str) -> list:
    """Map an entry's URL back to its content/*.md file and pull tags +
    categories from TOML front matter. Returns [] on any miss — missing
    file, non-TOML front matter, absent taxonomies, etc. — because
    hashtags are a nice-to-have, not a blocker.

    URL → path convention (Hugo default):
      https://<site>/posts/foo/  → <content_root>/posts/foo.md
                                or <content_root>/posts/foo/index.md
    Music pages and other generated content have no source file and
    fall through to []."""
    if not content_root or not entry_link or tomllib is None:
        return []

    m = re.match(r"^https?://[^/]+(/.*)$", entry_link)
    if not m:
        return []
    url_path = m.group(1).strip("/")
    if not url_path:
        return []

    candidates = [
        os.path.join(content_root, url_path + ".md"),
        os.path.join(content_root, url_path, "index.md"),
    ]
    md_path = next((p for p in candidates if os.path.isfile(p)), None)
    if not md_path:
        return []

    with open(md_path, "rb") as fh:
        raw = fh.read()

    # TOML front matter is delimited by `+++` lines. Anything else
    # (YAML `---`, JSON) → skip; this repo uses TOML.
    parts = raw.split(b"+++\n", 2)
    if len(parts) < 3 or parts[0].strip():
        return []

    try:
        fm = tomllib.loads(parts[1].decode("utf-8"))
    except (tomllib.TOMLDecodeError, UnicodeDecodeError):
        return []

    # Tags first (more specific → wins the hashtag cap), then categories.
    tags = [t for t in fm.get("tags", []) if isinstance(t, str)]
    cats = [c for c in fm.get("categories", []) if isinstance(c, str)]
    return tags + cats


def compose(entry: Entry, max_hashtags: int = 4, lede_sentences: int = 2) -> str:
    lede = " ".join(sentences(entry.summary)[:lede_sentences])

    tags = [to_hashtag(t) for t in entry.tags][:max_hashtags]
    tags = [t for t in tags if t]

    blocks = [entry.title]
    if lede:
        blocks.append(lede)
    blocks.append(f"Full post: {entry.link}")
    if tags:
        blocks.append(" ".join(tags))

    return "\n\n".join(blocks)


def slugify(entry: Entry) -> str:
    tail = entry.link.rstrip("/").rsplit("/", 1)[-1]
    if tail and tail not in ("", "index.xml"):
        return tail
    return re.sub(r"[^a-z0-9]+", "-", entry.title.lower()).strip("-") or "post"


def report(post: str) -> str:
    n = len(post)
    first_line = post.split("\n", 1)[0]
    notes = [f"{n}/{MAX_CHARS} chars"]
    if n > MAX_CHARS:
        notes.append("OVER LIMIT — trim before posting")
    if len(first_line) > FOLD_CHARS:
        notes.append(f"hook is {len(first_line)} chars, past the ~{FOLD_CHARS} fold")
    return " | ".join(notes)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("feed", help="Feed URL or local path (e.g. public/index.xml)")
    ap.add_argument("-n", "--limit", type=int, default=1,
                    help="How many recent entries to render (default: 1)")
    ap.add_argument("--since", metavar="YYYY-MM-DD",
                    help="Only entries published on or after this date")
    ap.add_argument("-o", "--outdir",
                    help="Write each post to OUTDIR/<slug>.txt instead of stdout")
    ap.add_argument("--sentences", type=int, default=2,
                    help="Sentences to pull for the lede (default: 2)")
    ap.add_argument("--hashtags", type=int, default=4,
                    help="Max hashtags from the post's tags/categories (default: 4)")
    ap.add_argument("--content-root", metavar="DIR",
                    help="Read tags/categories from TOML front matter under DIR "
                         "when the RSS feed has no <category> elements "
                         "(e.g. --content-root content)")
    args = ap.parse_args()

    entries = parse_feed(load_feed(args.feed))

    if args.since:
        cutoff = datetime.strptime(args.since, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        entries = [e for e in entries if e.published and e.published >= cutoff]

    entries = entries[: args.limit]
    if not entries:
        print("No matching entries.", file=sys.stderr)
        return 1

    if args.outdir:
        os.makedirs(args.outdir, exist_ok=True)

    for i, entry in enumerate(entries):
        # If the RSS feed carries no <category> elements (Hugo's default
        # doesn't emit them from front-matter taxonomies), fall back to
        # reading tags/categories directly from the post's source file.
        if not entry.tags and args.content_root:
            entry.tags = read_local_tags(entry.link, args.content_root)

        post = compose(entry, max_hashtags=args.hashtags, lede_sentences=args.sentences)

        if args.outdir:
            path = os.path.join(args.outdir, f"{slugify(entry)}.txt")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(post + "\n")
            print(f"{path}  ({report(post)})")
        else:
            if i:
                print("\n" + "=" * 60 + "\n")
            print(post)
            print(f"\n--- {report(post)}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
