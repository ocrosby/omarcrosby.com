// Music page — featured video player + history list with filters, search,
// shuffle, and transport controls. Extracted from layouts/section/music.html
// via Hugo's js.Build (esbuild) so we get real editor support, type checking
// on data-* attributes, and sourcemaps in development.
//
// The template still owns the DOM shape and the data-* attributes on each
// item; this module is only the runtime behavior. Any HTML/data-* change
// needs to be mirrored in MusicItemDataset below or TypeScript will surface
// the divergence.

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
  embedQuery?: string;
  initialQuery?: string;
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

// Minimal ambient model of the YouTube IFrame Player API — we use only the
// handful of methods below, so declaring the surface locally is cheaper than
// pulling in @types/youtube and adding a package.json to the repo.
interface YTPlayerLike {
  playVideo(): void;
  unMute(): void;
  loadVideoById(opts: { videoId: string }): void;
  seekTo(seconds: number): void;
  unloadModule(name: string): void;
}

interface YTPlayerEvent {
  target: YTPlayerLike;
  data: number;
}

interface YTPlayerOptions {
  events: {
    onReady: (event: YTPlayerEvent) => void;
    onStateChange: (event: YTPlayerEvent) => void;
  };
}

declare const YT: {
  Player: new (id: string, opts: YTPlayerOptions) => YTPlayerLike;
  PlayerState: { ENDED: number };
};

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
  }
}

(function () {
  const featured = document.querySelector<HTMLElement>(".music-featured");
  if (!featured) return;
  const meta = featured.querySelector<FeaturedMetaElement>(".music-featured-meta");
  const iframe = document.getElementById("music-featured-iframe") as HTMLIFrameElement | null;
  const titleEl = featured.querySelector<HTMLElement>(".music-featured-title");
  const artistEl = featured.querySelector<HTMLElement>(".music-featured-artist");
  const extraEl = featured.querySelector<HTMLElement>(".music-featured-extra");
  const noteEl = featured.querySelector<HTMLElement>(".music-featured-note");
  const addedEl = featured.querySelector<HTMLElement>(".music-featured-added");
  const genreWrapEl = featured.querySelector<HTMLElement>(".music-featured-genre");
  const genreLinkEl = featured.querySelector<GenreLinkElement>(".music-genre-link");
  if (!iframe || !meta) return;

  // Fallback URL query for the iframe.src reload path — used only if
  // the IFrame Player API fails to load (network error, ad-blocker, etc.).
  const fallbackQuery =
    meta.dataset.embedQuery ||
    "autoplay=1&playsinline=1&rel=0&cc_load_policy=0&iv_load_policy=3&enablejsapi=1";
  // Initial (no-autoplay) query — used by the deep-link iframe.src rewrite
  // so the target video loads paused under the "Play with sound" overlay,
  // same UX as the server-rendered items[0] embed.
  const initialQuery =
    meta.dataset.initialQuery ||
    "playsinline=1&rel=0&cc_load_policy=0&iv_load_policy=3&enablejsapi=1";

  // Desktop viewers get muted autoplay instead of the "Play with sound"
  // overlay — browsers universally allow muted autoplay, and unmuting is
  // one click on YouTube's own volume control. Touch-only devices keep the
  // overlay because mobile browsers block even muted autoplay in many
  // conditions and the explicit gesture is the reliable path.
  //
  // (hover: none) + (pointer: coarse) targets touch-primary devices; a
  // touchscreen laptop with a mouse reports (hover: hover) and gets the
  // desktop path, which is what we want.
  const isTouchOnly =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const desktopBootQuery =
    "autoplay=1&mute=1&playsinline=1&rel=0&cc_load_policy=0&iv_load_policy=3&enablejsapi=1";
  const bootQuery = isTouchOnly ? initialQuery : desktopBootQuery;

  if (!isTouchOnly) {
    // Rewrite the server-rendered query wholesale rather than string-matching
    // the existing one — Hugo's HTML/URL escaping percent-encodes the `&`
    // and `=` characters in the src attribute, so a literal `.indexOf` of
    // `initialQuery` misses.
    iframe.src = iframe.src.replace(/\?[^#]*/, "?" + desktopBootQuery);
  }

  // The full playlist, in DOM order (which matches data/music.yaml — newest first).
  const items = Array.from(
    document.querySelectorAll<MusicItemElement>(".music-item"),
  );
  // Index of the featured / currently-playing video. Server-side the
  // featured slot may be items[0] (the newest song, on /music/) or an
  // arbitrary item (on /music/<id>/ shared-song pages emitted by
  // content/music/_content.gotmpl). Read the featured id from the meta
  // block's data-featured-youtube-id attribute (case-preserved) and
  // find its index in the DOM-rendered items list. Falls back to 0 if
  // the attribute is missing or matches nothing.
  const featuredMeta = document.querySelector<HTMLElement>(".music-featured-meta");
  const featuredYoutubeId = featuredMeta?.dataset.featuredYoutubeId || "";
  let currentIndex = 0;
  if (featuredYoutubeId) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].dataset.youtubeId === featuredYoutubeId) {
        currentIndex = i;
        break;
      }
    }
  }

  // Filter state — the two dropdowns and the search input above the list.
  // Empty string means "no filter" (the sentinel "All artists" / "All genres"
  // option value, or an empty query). Auto-advance walks *visible* items
  // (see matchesFilter + findNext).
  let currentArtist = "";
  let currentGenre = "";
  let currentQuery = "";
  const emptyEl = document.querySelector<HTMLElement>(".music-empty");
  const clearBtn = document.querySelector<HTMLButtonElement>(".music-filter-clear");
  const searchInput = document.querySelector<HTMLInputElement>(".music-filter-search");
  // Selects only — the search input is a separate control with its own
  // event handling and URL sync path.
  const filterSelects = Array.from(
    document.querySelectorAll<FilterSelectElement>("select.music-filter"),
  );

  // Subsequence match — the "fuzzy finder" flavor. Characters of `needle`
  // must appear in `haystack` in order but not necessarily contiguous.
  // Case-insensitive. O(len(haystack)) per call, so applyFilter is O(n·L)
  // for n items and L = max haystack length — fine at ~200 items.
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

  // Transport controls — previous / replay / next / shuffle. Declared
  // here (ahead of the initial applyFilter() call below) so their
  // disabled state is correct from the very first render, including a
  // deep-linked filter that starts out matching nothing.
  const prevBtn = document.querySelector<HTMLButtonElement>(".music-control-prev");
  const nextBtn = document.querySelector<HTMLButtonElement>(".music-control-next");
  const replayBtn = document.querySelector<HTMLButtonElement>(".music-control-replay");
  const shuffleBtn = document.querySelector<HTMLButtonElement>(".music-control-shuffle");

  // Shuffle is a persistent mode (like Spotify), not a one-off action.
  // shuffleOrder holds a randomized permutation of the *matching* item
  // indices; shufflePos is where currentIndex sits within that order.
  // Both are rebuilt whenever shuffle turns on or the active filter
  // changes while shuffle is already on — see regenerateShuffleOrder().
  let shuffleOn = true;
  let shuffleOrder: number[] = [];
  let shufflePos = -1;

  function matchesFilter(item: MusicItemElement): boolean {
    if (currentArtist && item.dataset.artist !== currentArtist) return false;
    if (currentGenre && item.dataset.genre !== currentGenre) return false;
    if (!matchesSearch(item)) return false;
    return true;
  }

  // Positive-result modulo — JS's native % can return negative values
  // for a negative dividend, which breaks wraparound on Previous/shuffle
  // stepping backward past index 0.
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

  // Rebuilds the shuffled play order from the currently-matching items
  // and repositions shufflePos at currentIndex (or -1 if the featured
  // item doesn't match the active filter — the next shuffle step then
  // starts cleanly at the beginning of the new order).
  function regenerateShuffleOrder(): void {
    const matching: number[] = [];
    for (let i = 0; i < items.length; i++) {
      if (matchesFilter(items[i])) matching.push(i);
    }
    shuffleOrder = shuffleArray(matching);
    shufflePos = shuffleOrder.indexOf(currentIndex);
  }

  // Normal-order stepping — scans from currentIndex in `direction`,
  // wrapping around the full list, and returns the first item matching
  // the active filter. O(n) worst case; n is a personal music list
  // (dozens to low hundreds), same bound the prior auto-advance loop
  // already relied on.
  function stepItem(direction: number): MusicItemElement | null {
    for (let step = 1; step <= items.length; step++) {
      const idx = mod(currentIndex + direction * step, items.length);
      if (matchesFilter(items[idx])) return items[idx];
    }
    return null;
  }

  // Shuffle-order stepping — walks shuffleOrder instead of DOM order.
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

  // Hide items that don't match — including the currently-playing one, so
  // a filter that excludes the featured song hides it from the list too.
  // Also updates the "no matches" empty-state message, toggles the Clear
  // button's visibility, and disables the transport controls when
  // nothing in the current filter can be played.
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

  // Shared by the dropdown change handler and the Clear button: re-render
  // visibility, keep the shuffle order in sync with the new filter (only
  // meaningful while shuffle is on), and sync the URL.
  function onFilterChanged(): void {
    applyFilter();
    if (shuffleOn) regenerateShuffleOrder();
    syncFilterUrl();
  }

  // Reflect filter state in the URL so any filtered view is shareable and
  // survives reload. replaceState (not pushState) keeps back-button clean.
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

  // Visual highlight in the history list — mark the currently-playing item so
  // viewers can see which song they are hearing when they scroll the list.
  // Initial state matches the server-rendered iframe (items[0]).
  function setPlayingHighlight(index: number): void {
    for (let i = 0; i < items.length; i++) {
      if (i === index) {
        items[i].classList.add("is-playing");
      } else {
        items[i].classList.remove("is-playing");
      }
    }
  }
  if (items.length > 0) setPlayingHighlight(currentIndex);

  // Initial filter values from the URL — read once at load, before the
  // deep-link (?v=) handler runs so both filter and target video apply.
  // Artist and genre are mutually exclusive (see the dropdown handler
  // below) — an old shared link carrying both prefers genre, since
  // genre is the primary filter.
  try {
    const params0 = new URLSearchParams(window.location.search);
    const a0 = params0.get("artist");
    const g0 = params0.get("genre");
    // Artist/genre stay mutually exclusive (see setFilter below) so an old
    // shared link carrying both prefers genre — genre is the primary filter.
    // Search (q) is orthogonal: it cross-cuts whichever artist/genre is set.
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

  // Sets one filter dimension and keeps everything else in sync: the
  // sibling dropdown (artist and genre are mutually exclusive — picking
  // one clears the other so the two filters never silently combine into
  // an AND that hides everything), both <select> elements' displayed
  // value (so a programmatic call, e.g. from the genre link, reflects in
  // the UI exactly like a manual dropdown pick), and the filtered view.
  // Shared by the dropdown 'change' handler and the featured genre link.
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

  // Dropdown handlers — delegate to setFilter so manual picks and the
  // genre link go through identical logic.
  for (const sel of filterSelects) {
    sel.addEventListener("change", () => {
      setFilter(sel.dataset.filter, sel.value);
    });
  }

  // Featured genre link — clicking it selects that genre in the history
  // filter, surfacing similar songs. dataset.genre is kept current by
  // updateMeta() on every swap, so this always reflects whatever is
  // actually playing.
  if (genreLinkEl) {
    genreLinkEl.addEventListener("click", (e) => {
      e.preventDefault();
      const genre = genreLinkEl.dataset.genre;
      if (genre) setFilter("genre", genre);
    });
  }

  // Search input — apply on every keystroke. n·L is trivial at this scale;
  // no debounce needed. `input` covers typing, paste, and the browser's
  // built-in <input type="search"> clear affordance.
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

  // Deep-link: /music/?v=<youtube_id> loads with that song featured instead
  // of items[0]. If the id doesn't match anything in the current playlist
  // (song rolled off, typo), fall through silently — the page still opens
  // on the newest item.
  //
  // Rewrite iframe.src to point at the requested video before the YouTube
  // IFrame API wraps it, using the initial (no-autoplay) query so the
  // video sits paused under the "Play with sound" overlay — same UX as
  // the server-rendered items[0] embed.
  try {
    const requestedId = new URLSearchParams(window.location.search).get("v");
    if (requestedId) {
      for (let j = 0; j < items.length; j++) {
        if (items[j].dataset.youtubeId === requestedId) {
          if (j !== 0) {
            iframe.src =
              "https://www.youtube-nocookie.com/embed/" +
              requestedId +
              "?" +
              bootQuery;
            iframe.title =
              (items[j].dataset.title || "") +
              (items[j].dataset.artist ? " — " + items[j].dataset.artist : "");
            updateMeta(items[j]);
            currentIndex = j;
            setPlayingHighlight(j);
            try {
              // Upgrade legacy ?v=<id> URLs to the path-based /music/<id>/
              // form on arrival — see swap() for why. This keeps old
              // bookmarks working while ensuring any subsequent copy-share
              // from the address bar lands on the per-song OG URL.
              const shareUrl = new URL(window.location.href);
              shareUrl.pathname = "/music/" + requestedId.toLowerCase() + "/";
              shareUrl.searchParams.delete("v");
              window.history.replaceState({}, "", shareUrl.toString());
            } catch (e) {
              /* noop */
            }
          }
          break;
        }
      }
    }
  } catch (e) {
    /* URLSearchParams unavailable on very old browsers */
  }

  let player: YTPlayerLike | null = null;
  // Tracks whether the viewer has clicked "Play with sound". If they click
  // before the YouTube API finishes loading, the request is deferred to
  // onReady below.
  let pendingPlay = false;

  // Wire the "Play with sound" overlay — user click satisfies the browser
  // autoplay gesture requirement, so the video plays *with sound* from
  // the first second. Hide the button after the click so the video is
  // unobstructed.
  const playBtn = featured.querySelector<HTMLButtonElement>(".music-play-with-sound");
  if (playBtn && !isTouchOnly) {
    // Desktop path: muted autoplay is already running via bootQuery, so the
    // overlay is redundant. Hide it and skip wiring the click handler.
    playBtn.classList.add("is-hidden");
  } else if (playBtn) {
    playBtn.addEventListener("click", () => {
      playBtn.classList.add("is-hidden");
      if (player && typeof player.playVideo === "function") {
        try {
          player.unMute();
        } catch (e) {
          /* noop */
        }
        try {
          player.playVideo();
        } catch (e) {
          /* noop */
        }
      } else {
        pendingPlay = true;
      }
    });
  }

  // Wire the transport controls. Previous/Next respect the active filter
  // and shuffle mode via prevItem()/nextItem() (see their definitions
  // above); Replay restarts the currently-loaded video from 0:00.
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
      if (player && typeof player.seekTo === "function") {
        try {
          player.unMute();
        } catch (e) {
          /* noop */
        }
        try {
          player.seekTo(0);
        } catch (e) {
          /* noop */
        }
        try {
          player.playVideo();
        } catch (e) {
          /* noop */
        }
      } else {
        const id = items[currentIndex] && items[currentIndex].dataset.youtubeId;
        if (id)
          iframe.src =
            "https://www.youtube-nocookie.com/embed/" + id + "?" + fallbackQuery;
      }
    });
  }

  if (shuffleBtn) {
    shuffleBtn.addEventListener("click", () => {
      shuffleOn = !shuffleOn;
      shuffleBtn.setAttribute("aria-pressed", String(shuffleOn));
      // Keep the hover tooltip and accessible name describing the action
      // the *next* click will take, not the current state — matches how
      // "Play with sound" style toggle labels read elsewhere on the page.
      const label = shuffleOn ? "Turn shuffle off" : "Turn shuffle on";
      shuffleBtn.title = label;
      shuffleBtn.setAttribute("aria-label", label);
      if (shuffleOn) regenerateShuffleOrder();
    });
  }

  // Inject the YouTube IFrame API script.
  const apiTag = document.createElement("script");
  apiTag.src = "https://www.youtube.com/iframe_api";
  apiTag.async = true;
  document.head.appendChild(apiTag);

  // cc_load_policy in the URL is only a hint tied to the viewer's account
  // preference. unloadModule is the enforcement — but it can only unload
  // captions that have already been loaded, so we call it on every state
  // transition (initial load, click-swap, auto-advance all funnel through
  // onStateChange) rather than once at onReady.
  function killCaptions(p: YTPlayerLike | null | undefined): void {
    if (!p) return;
    try {
      p.unloadModule("captions");
    } catch (e) {
      /* noop */
    }
    try {
      p.unloadModule("cc");
    } catch (e) {
      /* noop */
    }
  }

  // The IFrame API calls this global when it is ready.
  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player("music-featured-iframe", {
      events: {
        onReady: (event) => {
          killCaptions(event.target);
          // Deep-link is handled by the iframe.src rewrite earlier in the
          // script — the YouTube API wraps whatever video the iframe is
          // currently pointing at, so no runtime video swap is needed here.

          // If the viewer clicked "Play with sound" before the API loaded,
          // fulfill the deferred request now that the player is ready.
          if (pendingPlay) {
            pendingPlay = false;
            try {
              event.target.unMute();
            } catch (e) {
              /* noop */
            }
            try {
              event.target.playVideo();
            } catch (e) {
              /* noop */
            }
          }
        },
        onStateChange: (event) => {
          // Every state transition is another chance for captions to have
          // slipped back in (new video's metadata loaded, account preference
          // re-applied, etc.). Cheaper to re-unload than to guess when.
          killCaptions(event.target);

          // Auto-advance: when the current video ends, play the next item —
          // same nextItem() the Next button uses, so this follows shuffle
          // order when shuffle is on and wraps around the filtered list
          // either way. The viewer's earlier click on "Play with sound" is
          // the gesture context that carries — the next video plays with
          // sound.
          if (event.data === YT.PlayerState.ENDED && items.length > 0) {
            const next = nextItem();
            if (next) swap(next);
          }
        },
      },
    });
  };

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

  function swap(item: MusicItemElement): void {
    const id = item.dataset.youtubeId;
    if (!id) return;
    updateMeta(item);

    // Notify the persistent mini-player of the new song. It writes to
    // localStorage and mirrors the video in a small always-on iframe
    // that survives Turbo navigation via data-turbo-permanent — that's
    // what keeps the song audible after the user leaves /music/.
    // On /music/ itself the mini-player mutes so we don't get double
    // audio; the mute switch happens in assets/js/persistent-player.ts.
    const w = window as unknown as {
      persistentMusicPlayer?: {
        notify: (song: { youtubeId: string; title: string; artist: string; ts: number }) => void;
      };
    };
    if (w.persistentMusicPlayer) {
      w.persistentMusicPlayer.notify({
        youtubeId: id,
        title: item.dataset.title || "",
        artist: item.dataset.artist || "",
        ts: Date.now(),
      });
    }

    // Track which item is now featured so onStateChange knows what comes next.
    const idx = items.indexOf(item);
    if (idx >= 0) {
      currentIndex = idx;
      setPlayingHighlight(idx);
      // The new current item may sit outside the active filter (e.g. user
      // filtered by Rock but clicked a Pop item from the featured player's
      // deep link). Re-apply so the list reflects the filter accurately —
      // the newly-playing item is hidden from the list if it doesn't match.
      applyFilter();
      // Keep shuffle's position pointer aligned with wherever playback
      // actually landed (list click, deep link, Next/Previous, or
      // auto-advance) — every swap() caller funnels through here, so this
      // is the one place that needs to know. Only meaningful while
      // shuffle is on; a miss (item not in the current shuffled order)
      // leaves shufflePos as-is, same as the mismatched-filter case above.
      if (shuffleOn) {
        const shufflePosHit = shuffleOrder.indexOf(idx);
        if (shufflePosHit !== -1) shufflePos = shufflePosHit;
      }
    }

    // Reflect the current song in the URL as a path — /music/<id>/ — so
    // the address bar is a shareable "play this song" link that carries
    // per-song og:image, og:title, twitter:card tags in the rendered
    // <head>. Query-string URLs (?v=<id>) don't get their own OG scrape:
    // social crawlers (LinkedIn, iMessage, Slack, Facebook, X) strip the
    // query string and hit /music/ bare, which falls back to the
    // site-wide /images/og.png — same generic preview for every song.
    //
    // The path must match what content/music/_content.gotmpl generated
    // for this song. Hugo's content adapter lowercases URL slugs even
    // though youtube_id is case-sensitive, so lowercase here too. The
    // og:image on the lowercased page URL still points at the case-
    // preserved static/images/og/music/<youtube_id>.jpg file — Hugo
    // renders Params.cover.image verbatim without touching case.
    //
    // replaceState (not pushState) keeps the back button clean while
    // clicking through the history list.
    try {
      const shareUrl = new URL(window.location.href);
      shareUrl.pathname = "/music/" + id.toLowerCase() + "/";
      // Strip any legacy ?v= state carried over from older shared URLs
      // or from the deep-link init below — the id now lives in the path.
      shareUrl.searchParams.delete("v");
      window.history.replaceState({}, "", shareUrl.toString());
    } catch (e) {
      /* URL API unavailable — silent fallback */
    }

    if (player && typeof player.loadVideoById === "function") {
      // Player API path — the existing YT.Player instance holds the user
      // gesture context established by the "Play with sound" overlay click,
      // so unmuted playback carries across every load (user click, auto-
      // advance, and deep-link routes all end here). Explicitly unMute
      // because loadVideoById doesn't reliably inherit the previous
      // video's mute state on some browsers.
      try {
        player.unMute();
      } catch (e) {
        /* noop */
      }
      player.loadVideoById({ videoId: id });
      // onStateChange re-kills captions on every transition, so no extra
      // timer is needed here.
    } else {
      // Fallback — iframe.src reload. Only reached if the Player API
      // failed to load (network error, ad-blocker). fallbackQuery carries
      // autoplay=1; the user's click is a fresh gesture so unmuted
      // playback is allowed.
      iframe.src =
        "https://www.youtube-nocookie.com/embed/" + id + "?" + fallbackQuery;
      iframe.title =
        (item.dataset.title || "") +
        (item.dataset.artist ? " — " + item.dataset.artist : "");
    }

    // Scroll to the top of the page (not just the top of the featured
    // element) so the site header, breadcrumbs, and page title are all
    // visible after a song swap. featured.scrollIntoView({block: "start"})
    // would land the featured video's top edge at the viewport top and
    // hide the site chrome above it — visually reads as "the player is
    // the whole page." The window scroll makes the swap feel like a
    // fresh page load without actually reloading.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  for (const item of items) {
    item.addEventListener("click", (e) => {
      // Modifier / non-primary clicks fall through to the underlying
      // <a href> so cmd/ctrl-click opens the per-song page in a new tab
      // and middle-click / shift-click behave as expected. Only plain
      // primary-button clicks trigger the in-place featured-player swap.
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
