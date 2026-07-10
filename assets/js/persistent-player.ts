// Persistent music player controller.
//
// Runs on every page (loaded via layouts/_partials/extend_footer.html).
// Coordinates the persistent iframe with the /music/ featured iframe so
// that:
//
//   1. When a song plays on /music/, the persistent iframe mirrors it
//      but stays muted (so we don't get double audio). Hidden via CSS
//      on /music/ (body.on-music-page rule) — user only sees the big
//      featured player, but the persistent iframe is loaded and
//      playing (muted) in the background.
//   2. When the user navigates away from /music/, Turbo's
//      data-turbo-permanent keeps the persistent iframe alive. This
//      script sends an `unMute` postMessage to the YouTube embed —
//      no URL reload, so playback position is preserved. The player
//      also becomes visible (fixed bottom-right card).
//   3. When the user navigates back to /music/, this script sends
//      `mute` via postMessage. Persistent hides visually; featured
//      iframe carries audio again.
//
// Critical design decisions:
//
//   - iframe.src is only rewritten when the video ID changes (new
//     song). Mute/unmute uses postMessage — reloading with different
//     mute= query param would restart the video from 0:00 AND fail
//     Chrome's autoplay-with-sound policy (fresh iframe = no gesture
//     context propagates).
//   - State is stored on iframe.dataset (survives Turbo body swap
//     because the element itself is data-turbo-permanent) rather than
//     module-scoped vars (which reset when the script re-executes on
//     each turbo:load).
//   - Close button gets its listener attached exactly once, guarded
//     by a data-attribute flag.
//
// The controller stays small. The "real" music player logic remains
// in assets/js/music.ts; this file just handles mirror/mute + close.

interface StoredSong {
    youtubeId: string;
    title: string;
    artist: string;
    ts: number;
}

const STORAGE_KEY = "omarcrosby:persistent-music";
// Match /music/ and /music/<youtube-id-slug>/ (with or without trailing /).
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

interface PlayerEls {
    root: HTMLElement;
    iframe: HTMLIFrameElement;
    title: HTMLElement;
    artist: HTMLElement;
    close: HTMLButtonElement;
}

function ensurePlayerElements(): PlayerEls | null {
    const root = document.getElementById("persistent-music-player") as HTMLElement | null;
    const iframe = document.getElementById("persistent-music-iframe") as HTMLIFrameElement | null;
    const title = document.getElementById("persistent-music-title") as HTMLElement | null;
    const artist = document.getElementById("persistent-music-artist") as HTMLElement | null;
    const close = document.getElementById("persistent-music-close") as HTMLButtonElement | null;
    if (!root || !iframe || !title || !artist || !close) return null;
    return { root, iframe, title, artist, close };
}

// YouTube IFrame API command via postMessage. Requires enablejsapi=1
// in the iframe URL (which buildEmbedUrl below sets). Works after the
// iframe has finished loading; earlier sends are silently ignored,
// which is fine — the state is idempotent and we resend on turbo:load.
function sendYouTubeCommand(iframe: HTMLIFrameElement, func: string): void {
    if (!iframe.contentWindow) return;
    try {
        iframe.contentWindow.postMessage(
            JSON.stringify({ event: "command", func: func, args: [] }),
            "*",
        );
    } catch {
        /* cross-origin restrictions can throw on some browsers — no-op */
    }
}

function buildEmbedUrl(youtubeId: string, muted: boolean): string {
    const base = `https://www.youtube-nocookie.com/embed/${youtubeId}`;
    const params = new URLSearchParams({
        autoplay: "1",
        mute: muted ? "1" : "0",
        playsinline: "1",
        rel: "0",
        cc_load_policy: "0",
        iv_load_policy: "3",
        enablejsapi: "1",
    });
    return `${base}?${params.toString()}`;
}

// Set/remove a body class so CSS can hide the persistent player on
// /music/. Runs on every boot() so Turbo body swaps end up with the
// correct class immediately.
function updateBodyMusicClass(): void {
    document.body.classList.toggle("on-music-page", isMusicPage());
}

// The core "sync state to page" operation. Called from notify() (when
// a song plays on /music/) and from boot() (turbo:load, initial load).
//
// Never reloads the iframe unless the video ID actually changes. Uses
// postMessage for mute state changes so playback position is preserved
// and Chrome's autoplay-with-sound policy doesn't reject a fresh load.
function syncPlayer(song: StoredSong): void {
    const els = ensurePlayerElements();
    if (!els) return;
    const { root, iframe, title, artist } = els;

    title.textContent = song.title || "";
    artist.textContent = song.artist || "";

    const wantMuted = isMusicPage();
    const loadedId = iframe.dataset.loadedId || "";
    const loadedMuted = iframe.dataset.loadedMuted === "1";

    if (loadedId !== song.youtubeId) {
        // New video — must reload iframe.src (postMessage can't switch
        // videos on an unofficial embed, only control the current one).
        iframe.src = buildEmbedUrl(song.youtubeId, wantMuted);
        iframe.dataset.loadedId = song.youtubeId;
        iframe.dataset.loadedMuted = wantMuted ? "1" : "0";
    } else if (loadedMuted !== wantMuted) {
        // Same video, mute state differs — flip via postMessage. This
        // preserves the current playback position AND (going from muted
        // → unmuted) satisfies Chrome's autoplay-with-sound policy
        // because the video is already playing.
        sendYouTubeCommand(iframe, wantMuted ? "mute" : "unMute");
        iframe.dataset.loadedMuted = wantMuted ? "1" : "0";
    }

    iframe.dataset.hasSong = "1";
    // Visibility: CSS drives the hide-on-music-page rule. The `hidden`
    // attribute is only used for the "no song yet" case; once a song is
    // loaded, hidden=false and CSS decides whether to show.
    root.hidden = false;
}

function hidePlayer(clearState: boolean): void {
    const els = ensurePlayerElements();
    if (!els) return;
    els.iframe.src = "about:blank";
    delete els.iframe.dataset.loadedId;
    delete els.iframe.dataset.loadedMuted;
    delete els.iframe.dataset.hasSong;
    els.root.hidden = true;
    if (clearState) clearStored();
}

// Public API — music.ts's swap() calls this on every song change.
declare global {
    interface Window {
        persistentMusicPlayer?: {
            notify: (song: StoredSong) => void;
        };
    }
}

window.persistentMusicPlayer = {
    notify(song: StoredSong): void {
        writeStored(song);
        syncPlayer(song);
    },
};

function boot(): void {
    updateBodyMusicClass();

    const els = ensurePlayerElements();
    if (!els) return;

    // Attach the close-button listener exactly once. Guarded by a
    // data-attribute so subsequent turbo:load fires don't stack
    // listeners (which would call the handler N times per click).
    if (els.close.dataset.wired !== "1") {
        els.close.addEventListener("click", () => hidePlayer(true));
        els.close.dataset.wired = "1";
    }

    const stored = readStored();
    if (!stored) {
        els.root.hidden = true;
        return;
    }
    syncPlayer(stored);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
} else {
    boot();
}
document.addEventListener("turbo:load", boot);
