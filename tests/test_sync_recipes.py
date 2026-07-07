#!/usr/bin/env python3
"""Tests for the title-derivation logic in scripts/sync-recipes.py.

Run locally with `python3 tests/test_sync_recipes.py`. Stdlib-only —
no pytest, no external dependencies, matching the parent script's
stance. Not wired into CI; run before syncing if you touched the title
extraction.
"""

from __future__ import annotations

import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path

_SCRIPT_PATH = Path(__file__).resolve().parent.parent / "scripts" / "sync-recipes.py"
sync_recipes = SourceFileLoader("sync_recipes", str(_SCRIPT_PATH)).load_module()


class DeriveTitleTests(unittest.TestCase):
    """Title precedence: frontmatter > H1 > first content line > path fallback."""

    def test_frontmatter_title_wins_over_body(self):
        body = "# Overriding H1\n\nBody text."
        self.assertEqual(
            sync_recipes._derive_title(body, "Frontmatter Title", "some/path.md"),
            "Frontmatter Title",
        )

    def test_h1_when_no_frontmatter(self):
        body = "# Beef Stew\n\nServes 6."
        self.assertEqual(
            sync_recipes._derive_title(body, None, "beef/stew.md"),
            "Beef Stew",
        )

    def test_readme_falls_back_to_parent_dir(self):
        # sinigang/README.md has no H1, only "## Ingredients:". The old fallback
        # stripped the "##" and picked up "Ingredients:" as the title. The path
        # fallback should recognize README.md and use the parent dir name.
        body = "## Ingredients:\n\n- tamarind\n- pork"
        self.assertEqual(
            sync_recipes._derive_title(body, None, "sinigang/README.md"),
            "Sinigang",
        )

    def test_index_falls_back_to_parent_dir(self):
        # trout/index.md — same failure class, filed as "Index" in the yaml.
        body = "## Preparation\n\n1. Score the skin."
        self.assertEqual(
            sync_recipes._derive_title(body, None, "trout/index.md"),
            "Trout",
        )

    def test_regular_file_uses_stem_for_path_fallback(self):
        # Files not named index/README, with no H1 and no content line, fall
        # back to their filename stem.
        body = "## Some heading\n\n- bullet item\n- another"
        self.assertEqual(
            sync_recipes._derive_title(body, None, "chicken-marinade.md"),
            "Chicken Marinade",
        )

    def test_emoji_prefixed_first_line_preserved_without_h1(self):
        # Real case: chicken-salad.md leads with "🥗 Gladness's ..." on line
        # 1, no "# " prefix. That's still a legitimate title — it's not a
        # ##+ heading and not a list marker.
        body = "🥗 Gladness's Chicken Salad\n\nBody text."
        self.assertEqual(
            sync_recipes._derive_title(body, None, "chicken-salad.md"),
            "🥗 Gladness's Chicken Salad",
        )

    def test_h1_beats_first_content_line(self):
        # If an H1 exists in the file, it wins over an emoji first line.
        body = "🥗 Emoji Line\n\n# Real Title\n\nBody."
        self.assertEqual(
            sync_recipes._derive_title(body, None, "some/recipe.md"),
            "Real Title",
        )

    def test_h2_headings_and_bullets_skipped_for_content_line(self):
        # Core regression guard: an ##+ heading and following bullet list
        # must NOT be promoted to a title. This is the class of bug that
        # produced "Index" upstream (trout/index.md).
        body = "## Ingredients:\n\n- tamarind\n- pork"
        self.assertEqual(
            sync_recipes._derive_title(body, None, "sinigang/README.md"),
            "Sinigang",
        )

    def test_colon_terminated_line_skipped_as_section_header(self):
        # Real case: sinigang/README.md leads with "Ingredients:" (no ##
        # prefix, just plain text ending in a colon). That's a section
        # header, not a title. Must fall through to path fallback.
        body = "Ingredients:\n- spinach\n- okra\n\npar boil ribs 15 min"
        self.assertEqual(
            sync_recipes._derive_title(body, None, "sinigang/README.md"),
            "Sinigang",
        )

    def test_bare_bullet_marker_skipped(self):
        # A stray line of just "- " (or "-") should not become the title. The
        # real sinigang/README.md contains a bare "- " after its bulleted
        # ingredients, and before the regex fix that got extracted as title.
        body = "Ingredients:\n- spinach\n- okra\n- \n\nHeader Line"
        self.assertEqual(
            sync_recipes._derive_title(body, None, "sinigang/README.md"),
            "Header Line",
        )

    def test_lowercase_first_line_skipped_as_recipe_step(self):
        # Real case: sinigang/README.md has "par boil spare ribs..." as its
        # first prose paragraph after the ingredient bullets. Recipe steps
        # begin with a verb — lowercase — while real titles start with an
        # uppercase letter, emoji, or digit.
        body = "Ingredients:\n- spinach\n\npar boil spare ribs for 15 minutes"
        self.assertEqual(
            sync_recipes._derive_title(body, None, "sinigang/README.md"),
            "Sinigang",
        )


if __name__ == "__main__":
    unittest.main()
