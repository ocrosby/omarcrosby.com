// Persistent music player controller.
//
// Runs on every page (loaded via layouts/_partials/extend_footer.html).
// The persistent iframe is a real always-loaded YouTube embed. It:
//
//   1. Starts playing (muted) the moment a song is selected on /music/.
//      Marked data-turbo-permanent so the element (and its
//      contentWindow, and its playback position) survives every Turbo
//      body swap.
//   2. Is visually hidden on /music/ (via visibility+opacity, NOT
//      display:none — Chromium pauses iframe media when the parent
//      is display:none; visibility keeps playback alive so we can
//      just unmute on navigate-away with no restart).
//   3. Off /music/, is a small bottom-right card. Auto-unmuted via
//      YouTube postMessage API (no user click needed — the tab has
//      autoplay engagement from the initial song-play click on
//      /music/, which propagates to iframe playback control).
//   4. Only reloads iframe.src for a genuinely new video ID. Mute
//      state changes go through postMessage against the already-
//      playing iframe. This is what keeps playback smooth across
//      navigation and prevents the "restarts from 0:00" behavior.
//
// State-of-iframe checks read directly from iframe.src (via regex),
// not from element.dataset. The browser is authoritative about iframe
// src; dataset survival across Turbo's data-turbo-permanent handling
// is undocumented (works in practice but not guaranteed).

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

// Read the currently-loaded video ID directly from iframe.src. Browser
// is authoritative here — after a Turbo permanent-element preservation,
// iframe.src still reflects whatever URL was set on it. Regex tolerates
// both youtube.com/embed/<id> and youtube-nocookie.com/embed/<id>.
function getLoadedVideoId(iframe: HTMLIFrameElement): string {
    const match = iframe.src.match(/\/embed\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : "";
}

// YouTube IFrame API command via postMessage. Requires enablejsapi=1
// in the iframe URL (buildEmbedUrl sets this). Works after the iframe
// has finished loading; earlier sends are silently ignored — the
// state is idempotent and we resend on every turbo:load.
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

// Send a command a few times with escalating delays to catch the
// iframe both while it's loading and after it's ready. Cheap — each
// message is a postMessage, effectively free. Handles the race
// between turbo:load firing (fast) and YouTube's iframe becoming
// ready to receive commands (100-500 ms typically).
function sendYouTubeCommandWithRetry(iframe: HTMLIFrameElement, func: string): void {
    sendYouTubeCommand(iframe, func);
    setTimeout(() => sendYouTubeCommand(iframe, func), 100);
    setTimeout(() => sendYouTubeCommand(iframe, func), 500);
    setTimeout(() => sendYouTubeCommand(iframe, func), 1200);
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

// CSS hides/shows the player based on body.on-music-page. persistent-
// music-player.css uses visibility+opacity for the hidden case (not
// display:none) so the iframe keeps playing while invisible.
function updateBodyMusicClass(): void {
    document.body.classList.toggle("on-music-page", isMusicPage());
}

// Core "sync state to page" operation. Called from notify() (song
// changes on /music/) and boot() (turbo:load, initial DOMContentLoaded).
//
// Reloads iframe.src ONLY when the video ID actually changes. Every
// other case flips mute state via postMessage against the already-
// playing iframe — preserves playback position, satisfies Chrome's
// autoplay-with-sound policy (the video is already playing muted, so
// unmuting doesn't require a fresh gesture context).
function syncPlayer(song: StoredSong): void {
    const els = ensurePlayerElements();
    if (!els) return;
    const { root, iframe, title, artist } = els;

    title.textContent = song.title || "";
    artist.textContent = song.artist || "";

    const wantMuted = isMusicPage();
    const currentId = getLoadedVideoId(iframe);

    if (currentId !== song.youtubeId) {
        // New video — reloading iframe.src is the only way to switch
        // videos on a non-API-controlled embed. Muted autoplay is
        // universally allowed by browsers.
        iframe.src = buildEmbedUrl(song.youtubeId, wantMuted);
    } else {
        // Same video — flip mute state via postMessage. Retries handle
        // the "iframe not yet ready to receive commands" race on
        // fresh turbo:load events.
        sendYouTubeCommandWithRetry(iframe, wantMuted ? "mute" : "unMute");
    }

    root.hidden = false;
}

function hidePlayer(clearState: boolean): void {
    const els = ensurePlayerElements();
    if (!els) return;
    els.iframe.src = "about:blank";
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
    // listeners.
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
