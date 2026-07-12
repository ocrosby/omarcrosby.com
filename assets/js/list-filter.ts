// List filter — client-side search filter for /posts/ and /projects/.
//
// Progressive enhancement. When a `<div class="list-filter">` is present
// (rendered by layouts/list.html on section == "posts" | "projects"),
// this controller injects a search input above the list and filters
// article.post-entry elements by title + tags as the user types.
//
// Matching model
// --------------
//   - Case-insensitive.
//   - Substring, tokenized: "rust cli" matches items whose title-plus-
//     tags contains BOTH "rust" AND "cli" (in any order, anywhere).
//     Simple to reason about, no fuzzy-scoring surprise. Suits list
//     sizes in the low tens; if it ever needs true fuzzy semantics,
//     swap the matcher without touching the surrounding code.
//   - Data source: each article carries `data-title` and `data-tags`
//     attributes emitted by the layout. Reading attributes rather than
//     scraping .textContent avoids picking up description text or
//     meta-footer noise as false matches.
//
// Turbo lifecycle
// ---------------
// Turbo Drive fires `turbo:load` on the initial page load and after
// every subsequent Turbo navigation. Also handles the case where Turbo
// is unavailable (CDN blocked) by falling back to DOMContentLoaded.
// The init function is idempotent — a `data-filter-ready` marker on
// the mount point stops repeat runs from stacking listeners or
// re-injecting the input across Turbo's morph-renderer diff cycles.

const TITLE_ATTR = "data-title";
const TAGS_ATTR = "data-tags";

function tokensMatch(haystack: string, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const tokens = q.split(/\s+/);
  for (const t of tokens) {
    if (!haystack.includes(t)) return false;
  }
  return true;
}

function initListFilter(): void {
  const mount = document.querySelector<HTMLDivElement>(".list-filter");
  if (!mount) return;
  if (mount.dataset.filterReady === "true") return;
  mount.dataset.filterReady = "true";

  const articles = Array.from(
    document.querySelectorAll<HTMLElement>("main article.post-entry, main article.first-entry")
  );
  if (articles.length === 0) return;

  // Pre-compute the searchable haystack for each article once. Attribute
  // reads are fast but happen for every keypress otherwise; caching keeps
  // filtering below the input-latency threshold even at hundreds of items.
  const haystacks = articles.map((a) => {
    const title = (a.getAttribute(TITLE_ATTR) ?? "").toLowerCase();
    const tags = (a.getAttribute(TAGS_ATTR) ?? "").toLowerCase();
    return `${title} ${tags}`;
  });

  const input = document.createElement("input");
  input.type = "search";
  input.className = "list-filter-input";
  input.placeholder = "Filter by title or tag…";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Filter list");
  input.setAttribute("aria-controls", "list-filter-status");

  const status = document.createElement("p");
  status.id = "list-filter-status";
  status.className = "list-filter-status";
  status.hidden = true;
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  mount.append(input, status);

  const apply = (): void => {
    const q = input.value;
    let shown = 0;
    for (let i = 0; i < articles.length; i++) {
      const ok = tokensMatch(haystacks[i], q);
      articles[i].hidden = !ok;
      if (ok) shown++;
    }
    if (q.trim() && shown === 0) {
      status.hidden = false;
      status.textContent = `No entries match “${q.trim()}”.`;
    } else {
      status.hidden = true;
      status.textContent = "";
    }
  };

  input.addEventListener("input", apply);
}

// Turbo re-fires body scripts on every navigation; the idempotency guard
// inside initListFilter handles that. On non-Turbo loads (CDN blocked,
// first paint before Turbo boots), DOMContentLoaded provides the fallback
// path.
document.addEventListener("turbo:load", initListFilter);
document.addEventListener("DOMContentLoaded", initListFilter);
