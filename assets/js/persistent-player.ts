// Persistent music player — the single YouTube iframe on the site.
//
// This controller owns:
//   1. The persistent iframe (#persistent-music-iframe), preserved
//      across Turbo navigation via data-turbo-permanent so playback
//      state is never interrupted.
//   2. The YT.Player instance wrapping that iframe — one instance for
//      the life of the tab, reused for every song swap via
//      loadVideoById. No src reloads on same-song sync.
//   3. Song state in localStorage so a fresh tab / cold load can pick
//      up where the previous session left off.
//   4. The "Play with sound" overlay that satisfies the browser
//      autoplay-gesture requirement on first play.
//   5. The body.on-music-page class that drives large-vs-corner CSS
//      layout.
//   6. Captions/subtitles suppression on every state transition —
//      unloadModule("captions") + unloadModule("cc") — so a viewer's
//      account preference can never leak captions back in.
//
// Public API — music.ts calls this to swap songs:
//   window.persistentMusicPlayer.play({ youtubeId, title, artist })
//   window.persistentMusicPlayer.onSongEnded(callback)   // auto-advance hook
//   window.persistentMusicPlayer.getCurrent()             // for /music/ init
//
// Turbo re-executes body scripts on every navigation. The whole
// module is guarded by window.persistentMusicPlayer._initialized so
// listeners aren't stacked and YT.Player isn't re-created. On repeat
// runs we just call _sync() to align with the newly-navigated page.

interface PlaySong {
    youtubeId: string;
    title?: string;
    artist?: string;
}

interface StoredSong {
    youtubeId: string;
    title: string;
    artist: string;
    ts: number;
}

interface YTPlayerLike {
    playVideo(): void;
    pauseVideo(): void;
    mute(): void;
    unMute(): void;
    isMuted(): boolean;
    loadVideoById(opts: { videoId: string }): void;
    seekTo(seconds: number, allowSeekAhead?: boolean): void;
    getCurrentTime(): number;
    getPlayerState(): number;
    unloadModule(name: string): void;
    getVideoData?: () => { video_id?: string };
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
    PlayerState: { ENDED: number; PLAYING: number };
};

interface PersistentMusicPlayerAPI {
    play: (song: PlaySong) => void;
    close: () => void;
    getCurrent: () => StoredSong | null;
    onSongEnded: (cb: () => void) => void;
    _initialized?: boolean;
    _sync?: () => void;
}

declare global {
    interface Window {
        onYouTubeIframeAPIReady?: () => void;
        persistentMusicPlayer?: PersistentMusicPlayerAPI;
    }
}

const STORAGE_KEY = "omarcrosby:persistent-music";
// Matches /music/ and /music/<youtube-id-slug>/ (with or without trailing /).
const MUSIC_ROUTE_RE = /^\/music\/?([A-Za-z0-9_-]{5,}\/?)?$/;

function isMusicPage(): boolean {
    return MUSIC_ROUTE_RE.test(window.location.pathname);
}

function readStored(): StoredSong | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredSong;
        if (!parsed.youtubeId) return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeStored(song: StoredSong): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(song));
    } catch {
        /* quota / private mode — ignore */
    }
}

function clearStored(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
}

// Read the current URL path — if it looks like /music/<youtube_id>/,
// return the id. Content adapter lowercases URL slugs, but YouTube
// IDs are case-sensitive; the DOM's data-featured-youtube-id
// preserves case, so we match case-insensitively against the DOM's
// item list where possible. When we're not on /music/ and only have
// the URL to go on, we return the lowercased id and let the caller
// treat it as opaque — YouTube itself accepts lowercased IDs since
// they're just Base64-URL-safe strings and IDs are usually
// mixed-case, but if this ever fails we fall back to storage/DOM.
function readUrlSongId(): string {
    const m = window.location.pathname.match(/^\/music\/([A-Za-z0-9_-]{5,})\/?$/);
    return m ? m[1] : "";
}

function buildEmbedUrl(youtubeId: string, startAt = 0): string {
    const base = `https://www.youtube-nocookie.com/embed/${youtubeId}`;
    const params = new URLSearchParams({
        autoplay: "1",
        mute: "1",
        playsinline: "1",
        rel: "0",
        cc_load_policy: "0",
        iv_load_policy: "3",
        enablejsapi: "1",
    });
    if (startAt > 0) params.set("start", String(startAt));
    return `${base}?${params.toString()}`;
}

// Read the featured song id + metadata from server-rendered DOM on
// /music/ or /music/<id>/. Returns null off /music/. music-item nodes
// carry title/artist as dataset attributes.
function readDomFeatured(): StoredSong | null {
    const meta = document.querySelector<HTMLElement>(".music-featured-meta");
    const id = meta?.dataset.featuredYoutubeId;
    if (!id) return null;
    const item = document.querySelector<HTMLElement>(
        `.music-item[data-youtube-id="${id}"]`,
    );
    return {
        youtubeId: id,
        title: item?.dataset.title || "",
        artist: item?.dataset.artist || "",
        ts: Date.now(),
    };
}

// Look up a specific youtube_id in the /music/ page's item list to
// hydrate title/artist. Returns null if we're not on /music/ or the
// id isn't in the list. Case-insensitive match — content adapter
// lowercases URL slugs, DOM preserves case.
function findItemById(id: string): StoredSong | null {
    if (!id) return null;
    const lower = id.toLowerCase();
    const items = Array.from(
        document.querySelectorAll<HTMLElement>(".music-item"),
    );
    for (const it of items) {
        const itemId = it.dataset.youtubeId || "";
        if (itemId.toLowerCase() === lower) {
            return {
                youtubeId: itemId,
                title: it.dataset.title || "",
                artist: it.dataset.artist || "",
                ts: Date.now(),
            };
        }
    }
    return null;
}

// Resolve which song should be loaded on this page, in priority order:
//   1. /music/<id>/ URL — that's the shared per-song URL.
//   2. localStorage — session continuity from the previous page.
//   3. DOM featured (only on /music/) — server-rendered default items[0].
//   4. null — no song, hide the player.
function resolveCurrentSong(): StoredSong | null {
    const urlId = readUrlSongId();
    if (urlId) {
        const item = findItemById(urlId);
        if (item) return item;
        // URL id not in the DOM's item list — could be an off-music page
        // like /music/history/ that this regex happens to match. Fall
        // through to storage/DOM.
    }
    const stored = readStored();
    if (stored) return stored;
    return readDomFeatured();
}

function updateBodyMusicClass(): void {
    document.body.classList.toggle("on-music-page", isMusicPage());
}

// On /music/, the player's DOM position stays fixed at end of body (so
// Turbo Drive never reparents it — that reload/mute regression is the
// whole reason we can't just move the iframe between DOM slots). To
// make it visually appear inside the featured section instead of the
// corner, we read the placeholder's bounding rect on every layout
// event and set position/size via inline style. Because the player is
// position:absolute (see persistent-music-player.css), the coordinates
// are document-anchored — as the visitor scrolls, the player scrolls
// with the rest of the page.
//
// Off /music/, we clear the inline styles so the CSS-driven bottom-
// right corner treatment takes over.
function syncPlayerToSlot(): void {
    const player = document.getElementById("persistent-music-player");
    if (!player) return;
    const style = player.style;
    if (!isMusicPage()) {
        style.top = "";
        style.left = "";
        style.width = "";
        return;
    }
    const slot = document.querySelector<HTMLElement>(".music-featured-slot");
    if (!slot) return;
    const rect = slot.getBoundingClientRect();
    style.top = `${rect.top + window.scrollY}px`;
    style.left = `${rect.left + window.scrollX}px`;
    style.width = `${rect.width}px`;
}

// Update the small mini-player title/artist labels + the on-/music/
// featured metadata section. Called on every song swap so what's
// displayed matches what's playing.
function updateDisplayedMeta(song: StoredSong): void {
    const persistentTitle = document.getElementById("persistent-music-title");
    const persistentArtist = document.getElementById("persistent-music-artist");
    if (persistentTitle) persistentTitle.textContent = song.title || "";
    if (persistentArtist) persistentArtist.textContent = song.artist || "";

    // On /music/, hand the currently-playing song off to music.ts so
    // it can populate the featured metadata section (title, artist,
    // extra, note, added-timestamp, genre link) from the matching
    // .music-item dataset. music.ts registers this hook once on load.
    const cb = (window as unknown as { __onPersistentSongMeta?: (s: StoredSong) => void })
        .__onPersistentSongMeta;
    if (typeof cb === "function") cb(song);
}

// ─── Initialization guard ─────────────────────────────────────────────
// Turbo re-executes body scripts on every navigation. Everything below
// must run only once per tab. On repeat executions, just re-sync page
// state (updateBodyMusicClass, updateDisplayedMeta) and return.

if (window.persistentMusicPlayer?._initialized) {
    if (typeof window.persistentMusicPlayer._sync === "function") {
        window.persistentMusicPlayer._sync();
    }
} else {
    init();
}

function init(): void {
    let player: YTPlayerLike | null = null;
    let pendingPlay = false;
    let currentSong: StoredSong | null = null;
    const endedCallbacks: Array<() => void> = [];
    let playerReady = false;

    // Track the visitor's preferred mute state so we can restore it
    // after Turbo navigation. The browser sometimes re-mutes the
    // iframe during a body-swap (autoplay policy resetting the
    // "user gesture" credit), and we want to re-apply the visitor's
    // last chosen state — same volume they had a moment ago.
    //
    // Set to true when: user clicks a song (play() call), or the
    // polling loop below observes the player is currently unmuted.
    // Persisted in sessionStorage so a hard-refresh preserves it too.
    let userWantsUnmuted = false;
    try {
        userWantsUnmuted =
            sessionStorage.getItem("omarcrosby:persistent-music:unmuted") ===
            "1";
    } catch {
        /* private-mode / quota — default to muted */
    }
    function rememberUnmutePreference(unmuted: boolean): void {
        userWantsUnmuted = unmuted;
        try {
            sessionStorage.setItem(
                "omarcrosby:persistent-music:unmuted",
                unmuted ? "1" : "0",
            );
        } catch {
            /* ignore */
        }
    }

    // Touch-primary devices (mobile Safari, mobile Chrome) block muted
    // autoplay under many conditions, and the "Play with sound"
    // overlay's explicit tap is the reliable gesture context to
    // authorize sound. Desktop browsers universally allow muted
    // autoplay; the overlay would just be visual noise on top of
    // YouTube's own controls, so we hide it there. `hover: none` +
    // `pointer: coarse` targets touch-primary — a touchscreen laptop
    // still reports `hover: hover` and gets the desktop path, which
    // is what we want.
    const isTouchOnly =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(hover: none) and (pointer: coarse)").matches;

    const iframe = document.getElementById(
        "persistent-music-iframe",
    ) as HTMLIFrameElement | null;
    const root = document.getElementById(
        "persistent-music-player",
    ) as HTMLElement | null;
    const closeBtn = document.getElementById(
        "persistent-music-close",
    ) as HTMLButtonElement | null;
    const playBtn = document.getElementById(
        "persistent-music-play-with-sound",
    ) as HTMLButtonElement | null;
    if (!iframe || !root) return;

    // cc_load_policy in the URL is only a hint tied to the viewer's
    // account preference. unloadModule is the enforcement — but it
    // can only unload captions already loaded, so we re-run on every
    // state transition (initial load, song swaps, auto-advance).
    function killCaptions(p: YTPlayerLike | null): void {
        if (!p) return;
        try {
            p.unloadModule("captions");
        } catch {
            /* noop */
        }
        try {
            p.unloadModule("cc");
        } catch {
            /* noop */
        }
    }

    // Read the id currently loaded in the iframe. Prefer the YT.Player
    // API (authoritative once ready); fall back to iframe.src regex.
    function getLoadedVideoId(): string {
        if (player && typeof player.getVideoData === "function") {
            try {
                const data = player.getVideoData();
                if (data && data.video_id) return data.video_id;
            } catch {
                /* fall through */
            }
        }
        const match = iframe.src.match(/\/embed\/([A-Za-z0-9_-]+)/);
        return match ? match[1] : "";
    }

    function loadSong(song: StoredSong): void {
        currentSong = song;
        writeStored(song);
        updateDisplayedMeta(song);

        const loaded = getLoadedVideoId();
        if (loaded === song.youtubeId && player) {
            // Same video is already loaded — nothing to do. Playback
            // continues uninterrupted from wherever it was.
            root.hidden = false;
            return;
        }

        if (player && typeof player.loadVideoById === "function") {
            // Gapless swap via the YT API — no iframe.src reload, so no
            // reset. loadVideoById always starts the new video at 0:00
            // which is the intended UX for a click-swap.
            try {
                player.loadVideoById({ videoId: song.youtubeId });
            } catch {
                iframe.src = buildEmbedUrl(song.youtubeId);
            }
            killCaptions(player);
        } else {
            // Player not ready yet (very first load, YT API still
            // fetching). Prime the iframe.src so autoplay kicks in as
            // soon as the API wraps it.
            iframe.src = buildEmbedUrl(song.youtubeId);
        }
        root.hidden = false;
    }

    // Populate the iframe with the initial song, if any, BEFORE creating
    // the YT.Player. YT.Player wraps whatever URL the iframe currently
    // holds, so we need a valid embed URL in src first — otherwise the
    // wrap succeeds but subsequent loadVideoById calls silently fail on
    // some browsers.
    function primeInitialSong(): void {
        const song = resolveCurrentSong();
        if (!song) {
            root.hidden = true;
            return;
        }
        currentSong = song;
        writeStored(song);
        updateDisplayedMeta(song);
        // Only rewrite iframe.src if it isn't already loaded to this
        // song. Rare — iframe.src is empty at boot — but this covers
        // the case of a hard-refresh with the previous URL intact.
        const loaded = getLoadedVideoId();
        if (loaded !== song.youtubeId) {
            iframe.src = buildEmbedUrl(song.youtubeId);
        }
        root.hidden = false;
    }

    // Show the "Play with sound" overlay only on touch-primary devices
    // where muted autoplay may be blocked. Desktop browsers autoplay
    // muted reliably and expose YouTube's own unmute control — the big
    // click-anywhere overlay is unnecessary visual noise there.
    // Hidden by default via the [hidden] attribute in the partial; we
    // only remove it here on touch-only devices when the player is
    // muted.
    function syncPlayOverlay(): void {
        if (!playBtn) return;
        if (!isTouchOnly) {
            playBtn.hidden = true;
            return;
        }
        if (!player || typeof player.isMuted !== "function") {
            playBtn.hidden = true;
            return;
        }
        try {
            playBtn.hidden = !player.isMuted();
        } catch {
            playBtn.hidden = true;
        }
    }

    // Wire the close button once. Guarded by dataset flag so any
    // accidental re-init doesn't stack listeners.
    if (closeBtn && closeBtn.dataset.wired !== "1") {
        closeBtn.addEventListener("click", () => {
            clearStored();
            if (player && typeof player.pauseVideo === "function") {
                try {
                    player.pauseVideo();
                } catch {
                    /* noop */
                }
            } else {
                iframe.src = "about:blank";
            }
            root.hidden = true;
        });
        closeBtn.dataset.wired = "1";
    }

    // Wire the Play with sound overlay. Click satisfies the browser
    // autoplay gesture requirement, so unMute + playVideo work.
    if (playBtn && playBtn.dataset.wired !== "1") {
        playBtn.addEventListener("click", () => {
            playBtn.hidden = true;
            if (player) {
                try {
                    player.unMute();
                } catch {
                    /* noop */
                }
                try {
                    player.playVideo();
                } catch {
                    /* noop */
                }
            } else {
                pendingPlay = true;
            }
        });
        playBtn.dataset.wired = "1";
    }

    // Inject the YouTube IFrame API script exactly once. Idempotent
    // guard by id so any accidental re-inject is a no-op.
    if (!document.getElementById("youtube-iframe-api-script")) {
        const apiTag = document.createElement("script");
        apiTag.id = "youtube-iframe-api-script";
        apiTag.src = "https://www.youtube.com/iframe_api";
        apiTag.async = true;
        document.head.appendChild(apiTag);
    }

    window.onYouTubeIframeAPIReady = function () {
        player = new YT.Player("persistent-music-iframe", {
            events: {
                onReady: (event) => {
                    playerReady = true;
                    killCaptions(event.target);
                    syncPlayOverlay();
                    // If the user clicked "Play with sound" before the
                    // API loaded, fulfill it now that the player is
                    // ready.
                    if (pendingPlay) {
                        pendingPlay = false;
                        try {
                            event.target.unMute();
                        } catch {
                            /* noop */
                        }
                        try {
                            event.target.playVideo();
                        } catch {
                            /* noop */
                        }
                        syncPlayOverlay();
                    }
                },
                onStateChange: (event) => {
                    // Every state transition is another chance for
                    // captions to have slipped back in. Cheaper to
                    // re-unload than to guess when.
                    killCaptions(event.target);
                    syncPlayOverlay();

                    // Fire song-ended callbacks so music.ts can
                    // advance to the next item. Deferred to microtask
                    // so callback errors don't crash the API handler.
                    if (event.data === YT.PlayerState.ENDED) {
                        for (const cb of endedCallbacks) {
                            try {
                                cb();
                            } catch {
                                /* noop */
                            }
                        }
                    }
                },
            },
        });
    };

    // Initial setup: mark body, prime iframe with the resolved song,
    // then create the YT.Player once the API loads. On a repeat
    // execution (turbo:load), _sync() below re-runs updateBodyMusicClass
    // and re-primes if the current-page song differs.
    updateBodyMusicClass();
    primeInitialSong();
    syncPlayerToSlot();

    function sync(): void {
        updateBodyMusicClass();
        syncPlayerToSlot();
        // Turbo's body-swap can cause the browser to re-mute the
        // iframe (autoplay policy re-evaluating without an active
        // user gesture). If the visitor had previously unmuted, put
        // it back — the click that navigated here is fresh user
        // activation, so unMute() is honored.
        if (player && userWantsUnmuted) {
            try {
                player.unMute();
            } catch {
                /* noop */
            }
            syncPlayOverlay();
        }
        const song = resolveCurrentSong();
        if (!song) return;
        // If the resolved song changed (e.g., navigated to a different
        // /music/<id>/), load it. Otherwise just re-display the meta
        // so the featured section on /music/ gets populated after the
        // body swap.
        if (!currentSong || currentSong.youtubeId !== song.youtubeId) {
            loadSong(song);
        } else {
            updateDisplayedMeta(currentSong);
            root.hidden = false;
        }
    }

    document.addEventListener("turbo:load", sync);
    // Turbo Frames fire `turbo:frame-load` on the frame element when
    // its contents finish rendering. Our layout wraps the swappable
    // content in <turbo-frame id="content" data-turbo-action="advance">
    // so link clicks are frame-nav, not full-page nav — that's what
    // preserves the persistent iframe's live state. Listen on document
    // in the capture phase so the sync fires regardless of which frame
    // just navigated.
    document.addEventListener("turbo:frame-load", sync);

    // Keep the on-/music/ overlay position aligned when the viewport
    // resizes (browser window resize, mobile orientation change). Cheap
    // — reads getBoundingClientRect once and writes three inline style
    // properties. throttled via rAF so a burst of resize events during
    // a drag doesn't queue up excess writes.
    let resizeRafId: number | null = null;
    window.addEventListener("resize", () => {
        if (resizeRafId !== null) return;
        resizeRafId = requestAnimationFrame(() => {
            resizeRafId = null;
            syncPlayerToSlot();
        });
    });

    // Turbo 8's morph renderer preserves the iframe's live playback
    // state (position, volume, mute) across page visits without
    // reparenting the element. No src rewrite is needed here — a
    // rewrite would force the iframe to reload with the mute=1
    // autoplay-safe URL, undoing whatever unmute the visitor had done.
    // If a future browser or Turbo config *does* reload the iframe on
    // navigation, the visible symptom is video restart + auto-mute;
    // fix it there rather than pre-emptively muting on every visit.

    // Watch YouTube's own player controls — when the visitor clicks
    // YouTube's built-in mute/unmute button (not our overlay), we
    // want to remember that preference so navigation-restore honors
    // it. The IFrame API doesn't emit mute-change events, so poll
    // every second. Cheap (one function call) and only meaningful
    // once the player is ready.
    setInterval(() => {
        if (!player) return;
        try {
            const muted = player.isMuted();
            if (!muted && !userWantsUnmuted) {
                rememberUnmutePreference(true);
                syncPlayOverlay();
            }
        } catch {
            /* API may not be ready — ignore */
        }
    }, 1000);

    const api: PersistentMusicPlayerAPI = {
        play(song) {
            const full: StoredSong = {
                youtubeId: song.youtubeId,
                title: song.title || "",
                artist: song.artist || "",
                ts: Date.now(),
            };
            loadSong(full);
            // A play() call always comes from a click — user gesture
            // context — so unMuted playback is allowed. Explicitly
            // unmute here so the overlay path isn't required. Remember
            // the preference so navigation-restore honors it.
            rememberUnmutePreference(true);
            if (player) {
                try {
                    player.unMute();
                } catch {
                    /* noop */
                }
                try {
                    player.playVideo();
                } catch {
                    /* noop */
                }
                syncPlayOverlay();
            }
        },
        close() {
            clearStored();
            if (player && typeof player.pauseVideo === "function") {
                try {
                    player.pauseVideo();
                } catch {
                    /* noop */
                }
            } else {
                iframe.src = "about:blank";
            }
            root.hidden = true;
        },
        getCurrent() {
            return currentSong;
        },
        onSongEnded(cb) {
            endedCallbacks.push(cb);
        },
        _initialized: true,
        _sync: sync,
    };
    // Silence unused-variable warning — playerReady is set on
    // onReady and is available for future gating logic. Kept for
    // readability at the call sites where "ready" is meaningful.
    void playerReady;

    window.persistentMusicPlayer = api;
}
