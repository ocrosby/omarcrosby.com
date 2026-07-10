// Persistent music player controller.
//
// Runs on every page (loaded via layouts/_partials/extend_footer.html).
// Coordinates the mini iframe in the persistent bottom-right player with
// the main /music/ featured iframe so that:
//
//   1. When a song plays on /music/, the persistent iframe mirrors it
//      but stays muted (so we don't get double audio).
//   2. When the user navigates away from /music/, Turbo's data-turbo-permanent
//      keeps the persistent iframe alive. This script unmutes it so the
//      music keeps playing audibly in the corner mini player.
//   3. When the user navigates back to /music/, this script mutes the
//      persistent iframe again — the featured iframe handles audio there.
//
// State persistence relies on:
//   - localStorage: last played song (id, title, artist, timestamp of the
//     "started playing" event). Used to restore the mini player on a fresh
//     visit (e.g. reload) that lands on a non-music page.
//   - Turbo's data-turbo-permanent on #persistent-music-player: keeps
//     the DOM element (and its iframe) alive across all Turbo navigations.
//
// The controller is intentionally small — the "real" music player logic
// stays in assets/js/music.ts. This file just handles the mirror/mute
// dance and dismiss button.

interface StoredSong {
    youtubeId: string;
    title: string;
    artist: string;
    ts: number;
}

const STORAGE_KEY = "omarcrosby:persistent-music";
const MUSIC_ROUTE_RE = /^\/music(\/|\/[A-Za-z0-9_-]+\/?)?$/;

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

function ensurePlayerElements(): {
    root: HTMLElement;
    iframe: HTMLIFrameElement;
    title: HTMLElement;
    artist: HTMLElement;
    close: HTMLButtonElement;
} | null {
    const root = document.getElementById("persistent-music-player") as HTMLElement | null;
    const iframe = document.getElementById("persistent-music-iframe") as HTMLIFrameElement | null;
    const title = document.getElementById("persistent-music-title") as HTMLElement | null;
    const artist = document.getElementById("persistent-music-artist") as HTMLElement | null;
    const close = document.getElementById("persistent-music-close") as HTMLButtonElement | null;
    if (!root || !iframe || !title || !artist || !close) return null;
    return { root, iframe, title, artist, close };
}

// Build a YouTube embed URL for a given video id. Off-music-page pages
// play with sound (autoplay=1, mute=0); on /music/ we mute so the
// featured iframe is the audible player.
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

// Persistent state used to decide whether we need to update the iframe
// on a given navigation. Without this we'd rebuild the src on every
// turbo:load even if the same song is playing — restarting playback
// (audio glitch) and losing whatever position the user is at.
let currentLoadedId = "";
let currentLoadedMuted = false;

function syncPlayerFor(song: StoredSong, muted: boolean): void {
    const els = ensurePlayerElements();
    if (!els) return;
    const { root, iframe, title, artist } = els;

    title.textContent = song.title || "";
    artist.textContent = song.artist || "";
    root.hidden = false;

    // Only reload the iframe when either the video id changes or the
    // mute state has to flip. Reloading with the same id + mute state
    // would kill playback and start over from 0:00.
    if (song.youtubeId !== currentLoadedId || muted !== currentLoadedMuted) {
        iframe.src = buildEmbedUrl(song.youtubeId, muted);
        currentLoadedId = song.youtubeId;
        currentLoadedMuted = muted;
    }
}

function hidePlayer(clear = false): void {
    const els = ensurePlayerElements();
    if (!els) return;
    els.iframe.src = "about:blank";
    els.root.hidden = true;
    currentLoadedId = "";
    currentLoadedMuted = false;
    if (clear) clearStored();
}

// Public API — called by music.ts's swap() so the persistent player
// mirrors whatever the featured iframe is currently playing.
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
        // On the music page the featured iframe is audible — mute the
        // mini one so we don't double up. Off /music/ we're the only
        // player, so play with sound.
        syncPlayerFor(song, isMusicPage());
    },
};

// Boot: on every load (initial + Turbo nav), restore the mini player
// state from localStorage if there's a song to resume and mute
// appropriately for the current route.
function boot(): void {
    const els = ensurePlayerElements();
    if (!els) return;

    // Close button: user dismissed the mini player. Clear state, stop
    // playback. Next song-play repopulates.
    els.close.addEventListener("click", () => hidePlayer(true));

    const stored = readStored();
    if (!stored) {
        els.root.hidden = true;
        return;
    }
    syncPlayerFor(stored, isMusicPage());
}

// Runs at both DOMContentLoaded (initial load) and turbo:load (SPA nav).
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
} else {
    boot();
}
document.addEventListener("turbo:load", boot);
