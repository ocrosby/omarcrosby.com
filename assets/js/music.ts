// Music page — featured metadata + history list with filters, search,
// shuffle, and transport controls. Playback itself is owned by
// assets/js/persistent-player.ts, which wraps the ONE YouTube iframe
// (#persistent-music-iframe) that lives at the end of every page's
// body and survives Turbo navigation via data-turbo-permanent.
//
// This module talks to the persistent player through:
//   window.persistentMusicPlayer.play({youtubeId, title, artist})
//   window.persistentMusicPlayer.onSongEnded(cb)   // auto-advance
//   window.persistentMusicPlayer.getCurrent()      // hydrate featured
//   window.__onPersistentSongMeta = updateMeta     // persistent → us
//
// Single-iframe was the fix for a whole family of sync bugs the old
// two-iframe design produced: position drift, mute drift, and the
// "different song plays on /music/ than off /music/" case. There's
// nothing to keep in sync anymore — same iframe, same playback state,
// everywhere.

interface MusicItemDataset extends DOMStringMap {
  title?: string;
  artist?: string;
  genre?: string;
  album?: string;
  year?: string;
  note?: string;
  youtubeId?: string;
  addedTitle?: string;
  addedFeatured?: string;
}

interface MusicItemElement extends HTMLElement {
  dataset: MusicItemDataset;
}

interface FeaturedMetaDataset extends DOMStringMap {
  featuredYoutubeId?: string;
}

interface FeaturedMetaElement extends HTMLElement {
  dataset: FeaturedMetaDataset;
}

interface FilterSelectDataset extends DOMStringMap {
  filter?: FilterKind;
}

interface FilterSelectElement extends HTMLSelectElement {
  dataset: FilterSelectDataset;
}

interface GenreLinkDataset extends DOMStringMap {
  genre?: string;
}

interface GenreLinkElement extends HTMLAnchorElement {
  dataset: GenreLinkDataset;
}

type FilterKind = "artist" | "genre";

interface StoredSong {
  youtubeId: string;
  title: string;
  artist: string;
  ts: number;
}

interface PersistentAPI {
  play: (song: { youtubeId: string; title?: string; artist?: string }) => void;
  onSongEnded: (cb: () => void) => void;
  getCurrent: () => StoredSong | null;
}

declare global {
  interface Window {
    persistentMusicPlayer?: PersistentAPI;
    __onPersistentSongMeta?: (song: StoredSong) => void;
  }
}

(function () {
  const featured = document.querySelector<HTMLElement>(".music-featured");
  if (!featured) return;
  const meta = featured.querySelector<FeaturedMetaElement>(".music-featured-meta");
  const titleEl = featured.querySelector<HTMLElement>(".music-featured-title");
  const artistEl = featured.querySelector<HTMLElement>(".music-featured-artist");
  const extraEl = featured.querySelector<HTMLElement>(".music-featured-extra");
  const noteEl = featured.querySelector<HTMLElement>(".music-featured-note");
  const addedEl = featured.querySelector<HTMLElement>(".music-featured-added");
  const genreWrapEl = featured.querySelector<HTMLElement>(".music-featured-genre");
  const genreLinkEl = featured.querySelector<GenreLinkElement>(".music-genre-link");
  if (!meta) return;

  // The full playlist, in DOM order (which matches data/music.yaml — newest first).
  const items = Array.from(
    document.querySelectorAll<MusicItemElement>(".music-item"),
  );

  // Index of the featured / currently-playing video. Server-side the
  // featured slot may be items[0] (the newest song, on /music/) or an
  // arbitrary item (on /music/<id>/ shared-song pages emitted by
  // content/music/_content.gotmpl). Reconciled with whatever the
  // persistent player is currently playing once we know its state.
  let currentIndex = 0;
  const featuredYoutubeId = meta.dataset.featuredYoutubeId || "";
  if (featuredYoutubeId) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].dataset.youtubeId === featuredYoutubeId) {
        currentIndex = i;
        break;
      }
    }
  }

  // Filter state — the two dropdowns and the search input above the list.
  // Empty string means "no filter". Auto-advance walks *visible* items
  // (see matchesFilter + stepItem/shuffleStep).
  let currentArtist = "";
  let currentGenre = "";
  let currentQuery = "";
  const emptyEl = document.querySelector<HTMLElement>(".music-empty");
  const clearBtn = document.querySelector<HTMLButtonElement>(".music-filter-clear");
  const searchInput = document.querySelector<HTMLInputElement>(".music-filter-search");
  const filterSelects = Array.from(
    document.querySelectorAll<FilterSelectElement>("select.music-filter"),
  );

  // Subsequence match — the "fuzzy finder" flavor. Characters of `needle`
  // must appear in `haystack` in order but not necessarily contiguous.
  // Case-insensitive. O(len(haystack)) per call.
  function subseq(needle: string, haystack: string | undefined): boolean {
    if (!needle) return true;
    const n = needle.toLowerCase();
    const h = (haystack || "").toLowerCase();
    let i = 0;
    let j = 0;
    while (i < n.length && j < h.length) {
      if (n.charCodeAt(i) === h.charCodeAt(j)) i++;
      j++;
    }
    return i === n.length;
  }

  function matchesSearch(item: MusicItemElement): boolean {
    if (!currentQuery) return true;
    return (
      subseq(currentQuery, item.dataset.title) ||
      subseq(currentQuery, item.dataset.artist)
    );
  }

  const prevBtn = document.querySelector<HTMLButtonElement>(".music-control-prev");
  const nextBtn = document.querySelector<HTMLButtonElement>(".music-control-next");
  const replayBtn = document.querySelector<HTMLButtonElement>(".music-control-replay");
  const shuffleBtn = document.querySelector<HTMLButtonElement>(".music-control-shuffle");

  // Shuffle is a persistent mode (like Spotify), not a one-off action.
  let shuffleOn = true;
  let shuffleOrder: number[] = [];
  let shufflePos = -1;

  function matchesFilter(item: MusicItemElement): boolean {
    if (currentArtist && item.dataset.artist !== currentArtist) return false;
    if (currentGenre && item.dataset.genre !== currentGenre) return false;
    if (!matchesSearch(item)) return false;
    return true;
  }

  function mod(n: number, m: number): number {
    return ((n % m) + m) % m;
  }

  function shuffleArray(arr: number[]): number[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function regenerateShuffleOrder(): void {
    const matching: number[] = [];
    for (let i = 0; i < items.length; i++) {
      if (matchesFilter(items[i])) matching.push(i);
    }
    shuffleOrder = shuffleArray(matching);
    shufflePos = shuffleOrder.indexOf(currentIndex);
  }

  function stepItem(direction: number): MusicItemElement | null {
    for (let step = 1; step <= items.length; step++) {
      const idx = mod(currentIndex + direction * step, items.length);
      if (matchesFilter(items[idx])) return items[idx];
    }
    return null;
  }

  function shuffleStep(direction: number): MusicItemElement | null {
    if (!shuffleOrder.length) regenerateShuffleOrder();
    if (!shuffleOrder.length) return null;
    shufflePos = mod(shufflePos + direction, shuffleOrder.length);
    return items[shuffleOrder[shufflePos]];
  }

  function nextItem(): MusicItemElement | null {
    return shuffleOn ? shuffleStep(1) : stepItem(1);
  }

  function prevItem(): MusicItemElement | null {
    return shuffleOn ? shuffleStep(-1) : stepItem(-1);
  }

  function applyFilter(): void {
    let visibleCount = 0;
    for (let i = 0; i < items.length; i++) {
      const keep = matchesFilter(items[i]);
      items[i].classList.toggle("is-filtered-out", !keep);
      if (keep) visibleCount++;
    }
    const filterActive = !!(currentArtist || currentGenre || currentQuery);
    if (clearBtn) clearBtn.hidden = !filterActive;
    if (emptyEl) emptyEl.hidden = !(filterActive && visibleCount === 0);
    const noMatches = visibleCount === 0;
    if (prevBtn) prevBtn.disabled = noMatches;
    if (nextBtn) nextBtn.disabled = noMatches;
    if (shuffleBtn) shuffleBtn.disabled = noMatches;
  }

  function onFilterChanged(): void {
    applyFilter();
    if (shuffleOn) regenerateShuffleOrder();
    syncFilterUrl();
  }

  function syncFilterUrl(): void {
    try {
      const u = new URL(window.location.href);
      if (currentArtist) u.searchParams.set("artist", currentArtist);
      else u.searchParams.delete("artist");
      if (currentGenre) u.searchParams.set("genre", currentGenre);
      else u.searchParams.delete("genre");
      if (currentQuery) u.searchParams.set("q", currentQuery);
      else u.searchParams.delete("q");
      window.history.replaceState({}, "", u.toString());
    } catch (e) {
      /* URL API unavailable — silent fallback */
    }
  }

  function setPlayingHighlight(index: number): void {
    for (let i = 0; i < items.length; i++) {
      if (i === index) {
        items[i].classList.add("is-playing");
      } else {
        items[i].classList.remove("is-playing");
      }
    }
  }

  // Populate the featured metadata section — title, artist, extras,
  // note, added timestamp, genre link — from a music-item element.
  // Called from swap() and from the persistent-player-driven meta
  // hook so the featured slot always reflects what the single iframe
  // is actually playing.
  function updateMeta(item: MusicItemElement): void {
    if (titleEl) titleEl.textContent = item.dataset.title || "";
    if (artistEl) artistEl.textContent = item.dataset.artist || "";
    if (extraEl) {
      const parts: string[] = [];
      if (item.dataset.album) parts.push(item.dataset.album);
      if (item.dataset.year) parts.push(item.dataset.year);
      extraEl.textContent = parts.join(" · ");
    }
    if (noteEl) noteEl.textContent = item.dataset.note || "";
    if (addedEl) {
      addedEl.textContent = item.dataset.addedFeatured || "";
      if (item.dataset.addedTitle) addedEl.title = item.dataset.addedTitle;
    }
    if (genreLinkEl && genreWrapEl) {
      const genre = item.dataset.genre || "";
      genreWrapEl.hidden = !genre;
      if (genre) {
        genreLinkEl.textContent = genre;
        genreLinkEl.dataset.genre = genre;
        genreLinkEl.href = "?genre=" + encodeURIComponent(genre);
      }
    }
  }

  function findItemByYoutubeId(id: string): MusicItemElement | null {
    if (!id) return null;
    const lower = id.toLowerCase();
    for (const it of items) {
      if ((it.dataset.youtubeId || "").toLowerCase() === lower) return it;
    }
    return null;
  }

  // Persistent-player → us: on turbo:load and initial page render,
  // the persistent player tells us what's currently playing so the
  // featured metadata section aligns with it. If the item is in the
  // list, update currentIndex + highlight + metadata.
  window.__onPersistentSongMeta = function (song: StoredSong): void {
    const item = findItemByYoutubeId(song.youtubeId);
    if (!item) {
      // Song isn't in the DOM's item list (unlikely — every yaml
      // entry renders a music-item). Still update the featured meta
      // from what the persistent player knows.
      if (titleEl) titleEl.textContent = song.title || "";
      if (artistEl) artistEl.textContent = song.artist || "";
      return;
    }
    const idx = items.indexOf(item);
    if (idx >= 0) {
      currentIndex = idx;
      setPlayingHighlight(idx);
    }
    updateMeta(item);
  };

  // Initial hydration — if the persistent player already has a
  // current song (set before music.ts loaded, which is the normal
  // case since persistent-player.ts ships from extend_footer.html
  // ahead of us), align our featured slot with it now.
  const initialCurrent = window.persistentMusicPlayer?.getCurrent();
  if (initialCurrent) {
    const item = findItemByYoutubeId(initialCurrent.youtubeId);
    if (item) {
      const idx = items.indexOf(item);
      if (idx >= 0) currentIndex = idx;
      updateMeta(item);
    }
  }
  if (items.length > 0) setPlayingHighlight(currentIndex);

  // Initial filter values from the URL — read once at load.
  try {
    const params0 = new URLSearchParams(window.location.search);
    const a0 = params0.get("artist");
    const g0 = params0.get("genre");
    if (g0) {
      currentGenre = g0;
    } else if (a0) {
      currentArtist = a0;
    }
    const q0 = params0.get("q");
    if (q0) {
      currentQuery = q0;
    }
    for (const sel of filterSelects) {
      if (sel.dataset.filter === "artist" && currentArtist) sel.value = currentArtist;
      if (sel.dataset.filter === "genre" && currentGenre) sel.value = currentGenre;
    }
    if (searchInput && currentQuery) searchInput.value = currentQuery;
    applyFilter();
  } catch (e) {
    /* URLSearchParams unavailable — no initial filter */
  }

  function setFilter(kind: FilterKind | undefined, value: string): void {
    if (kind === "artist") {
      currentArtist = value;
      if (currentArtist) currentGenre = "";
    } else if (kind === "genre") {
      currentGenre = value;
      if (currentGenre) currentArtist = "";
    }
    for (const sel of filterSelects) {
      if (sel.dataset.filter === "artist") sel.value = currentArtist;
      if (sel.dataset.filter === "genre") sel.value = currentGenre;
    }
    onFilterChanged();
  }

  for (const sel of filterSelects) {
    sel.addEventListener("change", () => {
      setFilter(sel.dataset.filter, sel.value);
    });
  }

  if (genreLinkEl) {
    genreLinkEl.addEventListener("click", (e) => {
      e.preventDefault();
      const genre = genreLinkEl.dataset.genre;
      if (genre) setFilter("genre", genre);
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      currentQuery = searchInput.value.trim();
      onFilterChanged();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      currentArtist = "";
      currentGenre = "";
      currentQuery = "";
      for (const sel of filterSelects) sel.value = "";
      if (searchInput) searchInput.value = "";
      onFilterChanged();
    });
  }

  // Deep-link backward-compat: /music/?v=<youtube_id> upgrades to
  // /music/<id>/ path form on arrival and plays that song. Query-param
  // links exist in old bookmarks — path form is required for social
  // preview OG scraping (see .claude/rules/per-song-og-image.md).
  try {
    const requestedId = new URLSearchParams(window.location.search).get("v");
    if (requestedId) {
      const item = findItemByYoutubeId(requestedId);
      if (item) {
        // Route through swap() so the persistent player gets the song
        // and the URL bar is rewritten to the path form.
        swap(item);
      }
    }
  } catch (e) {
    /* URLSearchParams unavailable on very old browsers */
  }

  // Transport buttons — all funnel through swap() (Prev/Next) or
  // through the persistent player's API (Replay).
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      const item = prevItem();
      if (item) swap(item);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      const item = nextItem();
      if (item) swap(item);
    });
  }

  if (replayBtn) {
    replayBtn.addEventListener("click", () => {
      // Re-play the currently-loaded song from the top. Simplest
      // route through the play() API — same song id reloads at 0:00
      // by nature of loadVideoById.
      const item = items[currentIndex];
      if (item) swap(item);
    });
  }

  if (shuffleBtn) {
    shuffleBtn.addEventListener("click", () => {
      shuffleOn = !shuffleOn;
      shuffleBtn.setAttribute("aria-pressed", String(shuffleOn));
      const label = shuffleOn ? "Turn shuffle off" : "Turn shuffle on";
      shuffleBtn.title = label;
      shuffleBtn.setAttribute("aria-label", label);
      if (shuffleOn) regenerateShuffleOrder();
    });
  }

  function swap(item: MusicItemElement): void {
    const id = item.dataset.youtubeId;
    if (!id) return;
    updateMeta(item);

    if (window.persistentMusicPlayer) {
      window.persistentMusicPlayer.play({
        youtubeId: id,
        title: item.dataset.title || "",
        artist: item.dataset.artist || "",
      });
    }

    const idx = items.indexOf(item);
    if (idx >= 0) {
      currentIndex = idx;
      setPlayingHighlight(idx);
      applyFilter();
      if (shuffleOn) {
        const shufflePosHit = shuffleOrder.indexOf(idx);
        if (shufflePosHit !== -1) shufflePos = shufflePosHit;
      }
    }

    // Reflect current song in URL as /music/<id>/ path. See the
    // per-song-og-image rule for why the path form matters: social
    // crawlers scrape OG metadata per exact URL, and query strings
    // are stripped for that discovery.
    try {
      const shareUrl = new URL(window.location.href);
      shareUrl.pathname = "/music/" + id.toLowerCase() + "/";
      shareUrl.searchParams.delete("v");
      window.history.replaceState({}, "", shareUrl.toString());
    } catch (e) {
      /* URL API unavailable — silent fallback */
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Auto-advance: when the current song ends, play the next item.
  // Same nextItem() the Next button uses, so this follows shuffle
  // order when shuffle is on and wraps around the filtered list.
  // Only wire once — persistent-player.ts's onSongEnded is
  // pushed into a callback array that lives for the tab's lifetime,
  // so we guard by a window flag.
  const w = window as unknown as { __musicAutoAdvanceWired?: boolean };
  if (window.persistentMusicPlayer && !w.__musicAutoAdvanceWired) {
    window.persistentMusicPlayer.onSongEnded(() => {
      if (items.length === 0) return;
      const next = nextItem();
      if (next) swap(next);
    });
    w.__musicAutoAdvanceWired = true;
  }

  for (const item of items) {
    item.addEventListener("click", (e) => {
      if (
        (e as MouseEvent).button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      e.preventDefault();
      swap(item);
    });
  }
})();
