+++
title = "Keeping a YouTube iframe playing across every page with Turbo Frames"
date = "2026-07-10T16:31:36-04:00"
draft = false
description = "Turbo Drive's data-turbo-permanent looks like it should preserve iframe playback across page visits, but Chromium reloads the iframe every time. Turbo Frames is what actually works — plus the JS to keep the player visually inline on the page it belongs to."
tags = ["hugo", "turbo", "hotwired", "youtube", "javascript", "iframe", "spa"]
categories = ["Code Quality"]
ShowToc = true

[cover]
image = "/images/og/keeping-a-youtube-iframe-playing-across-every-page-with-turbo-frames.png"
hiddenInList = true
hiddenInSingle = true
+++

I wanted the music player on [my `/music/` page](/music/) to keep playing when a visitor clicks around the rest of the site. No stop, no restart, no auto-mute — just seamless continuous playback while the DOM around it swaps. The obvious approach — the one every blog post about [Turbo](https://turbo.hotwired.dev) tells you to use — didn't work. The one that actually worked took me through three false starts.

If you're building a Hugo (or Jekyll, or Rails) site and you want an audio or video iframe that survives site-wide navigation, this post is what I wish I'd found on day one.

## What "keep playing" actually costs

The problem sounds trivial. Every static site has a `<body>` that gets swapped on each page load. When the swap happens, any `<iframe>` inside `<body>` gets destroyed and rebuilt on the next page — even if the two pages have "the same" iframe. Media playback resets. Volume resets. Position resets. The visitor gets a jarring restart.

For a music player, this is the difference between "cool feature" and "actively annoying." The whole point is that the song plays *while* you read another page. If it stops the moment you click a link, the feature isn't real.

So the goal: keep the same iframe DOM node alive across every navigation, and let the surrounding page content swap normally.

## Attempt 1: `data-turbo-permanent`

The [Hotwired Turbo](https://turbo.hotwired.dev) framework — Rails' SPA-navigation library, usable on any static site — advertises a purpose-built solution:

> Elements with `data-turbo-permanent` will be preserved between page loads, allowing you to maintain state like scroll position, form state, and — the docs imply — active playback.

The setup is one line of markup:

```html
<div id="persistent-music-player" data-turbo-permanent>
  <iframe src="https://www.youtube-nocookie.com/embed/..."></iframe>
</div>
```

Turbo's algorithm on visit: match permanent elements by `id` between the current DOM and the response HTML, "preserve" the current one, and put it in the new page's matching slot.

That last step is what breaks it. **Turbo doesn't preserve the element in place; it moves it into the new response's slot before the body swap.** In Chromium, moving an iframe between DOM parents — even via `Node.replaceChild` to a nearly-identical position — triggers a *reload* of the iframe's `src`. YouTube's embed URL has `autoplay=1&mute=1` (universally allowed muted autoplay), so on reload the iframe starts playing from `0:00`, muted, regardless of what state it was in before.

The observable result for the visitor: **click a link → video restarts from 0, sound cuts to muted, all in the span of one frame**. Not what I wanted.

Firefox happens to be more forgiving here, but "works in Firefox" isn't a fix.

## Attempt 2: Turbo 8's morph render

Turbo 8 shipped a new render mode called "morph" (built on [Idiomorph](https://github.com/bigskysoftware/idiomorph)) that promises to *mutate* the DOM in place instead of swapping `<body>`. If nothing about a persistent element changed between pages, morph leaves it — including its iframe.

Enabling it is one meta tag:

```html
<meta name="turbo-refresh-method" content="morph">
```

I added it. On [refresh](https://turbo.hotwired.dev/reference/streams) — the WebSocket-driven page-refresh mechanism — morph did exactly what it says. Iframes stayed alive.

But **for regular [visits](https://turbo.hotwired.dev/reference/drive#visits)** — plain link clicks, which is 99% of navigation on a personal site — the `turbo-refresh-method` meta tag doesn't apply. Turbo Drive keeps doing the full body swap with the same reparenting behavior as before. To opt individual link clicks into morph rendering, you'd need `data-turbo-action="morph"` on every internal link. Doable but heavyweight, and it's not what the docs suggest is the recommended pattern.

I moved on.

## The actual fix: Turbo Frames

[Turbo Frames](https://turbo.hotwired.dev/handbook/frames) is the underused half of Turbo's story. Where Turbo Drive swaps the whole `<body>` on every visit, Turbo Frames wraps a portion of the page in a `<turbo-frame id="…">` element — and only the frame's *contents* get swapped on navigation. Everything outside the frame stays exactly where it is. Untouched. The DOM node isn't reparented, replaced, or cloned. It just... doesn't get involved.

Which is exactly what an iframe you want to keep playing needs.

### The site-level structure

Every page's `<body>` gets restructured. Here's the shape (from my [`layouts/baseof.html`](https://github.com/ocrosby/omarcrosby.com/blob/main/layouts/baseof.html)):

```html
<body data-turbo-frame="content">
    <turbo-frame id="content" data-turbo-action="advance">
        {{ partial "header.html" . }}
        <main>{{ block "main" . }}{{ end }}</main>
        {{ partial "footer.html" . }}
    </turbo-frame>
    {{ partial "persistent-music-player.html" . }}
    <script src="/js/persistent-player.js" defer></script>
</body>
```

Three things doing the work:

- **`<turbo-frame id="content">`** wraps header + main + footer. Navigation targeting this frame swaps its contents but leaves the frame element itself and anything *outside* it alone.
- **`data-turbo-action="advance"`** on the frame makes each frame-navigation push a new browser history entry, so the URL updates and the back button works exactly like a full-page visit.
- **`data-turbo-frame="content"` on `<body>`** cascades to every internal link, telling Turbo to route their clicks to the frame by default. External links (`http://…` on another origin) are still full-page navigations, no attribute needed.

The persistent music player renders *outside* the frame. Its script does too. When a visitor clicks a nav link, Turbo fetches the response, extracts the response's `<turbo-frame id="content">`, and replaces the current frame's contents. The player's iframe is literally the same DOM node it was a moment ago. Playback, mute state, position, YouTube's IFrame Player API instance — all continuous.

### The layout problem this creates

There's a catch. The player lives at the end of `<body>`, but on `/music/` I want it to *appear* inside the featured slot at the top of the page — visually inline with the "Now playing" metadata below it. If I move the DOM node into the featured area, I'm back to reparenting → iframe reload.

The fix is to leave the DOM position alone and use CSS `position: absolute` with coordinates set by JS. In [`layouts/partials/music-page-body.html`](https://github.com/ocrosby/omarcrosby.com/blob/main/layouts/partials/music-page-body.html) the featured section reserves an empty placeholder:

```html
<section class="music-featured">
  <div class="music-featured-slot" aria-hidden="true"></div>
  <div class="music-featured-meta" data-featured-youtube-id="{{ $featured.youtube_id }}">
    <!-- "Now playing" title, artist, controls -->
  </div>
</section>
```

The placeholder is a 16:9 empty box — CSS gives it the aspect ratio, nothing else. Then [`persistent-player.ts`](https://github.com/ocrosby/omarcrosby.com/blob/main/assets/js/persistent-player.ts) reads its bounding rect and positions the player over it:

```typescript
function syncPlayerToSlot(): void {
    const player = document.getElementById("persistent-music-player");
    if (!player) return;
    if (!isMusicPage()) {
        // Off /music/: clear inline coords, let CSS drop it into the
        // bottom-right corner as the mini-player.
        player.style.top = player.style.left = player.style.width = "";
        return;
    }
    const slot = document.querySelector<HTMLElement>(".music-featured-slot");
    if (!slot) return;
    const rect = slot.getBoundingClientRect();
    player.style.top = `${rect.top + window.scrollY}px`;
    player.style.left = `${rect.left + window.scrollX}px`;
    player.style.width = `${rect.width}px`;
}
```

Because the element is `position: absolute` — anchored to the document origin, not the viewport — it scrolls with the page just like an inline element. Visitors on `/music/` see the player where they expect it; visitors on `/about/` see the same iframe as a corner mini-player. The DOM node never moves.

`syncPlayerToSlot()` runs on initial load, on `turbo:frame-load` (fires when a frame finishes navigation), and on `window.resize`.

## Two more gotchas nobody warns you about

### Autoplay + mute preservation

The [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay/) lets you autoplay muted freely but requires a user gesture for audio. YouTube's embed URL respects this: `autoplay=1&mute=1` starts muted; unmuting requires the visitor to click the YouTube player controls (or a "Play with sound" overlay you provide).

The problem shows up on navigation. Even with Turbo Frames keeping the iframe alive, Chromium *sometimes* re-mutes the iframe on frame-content swap — the autoplay policy re-evaluates "is there an active user gesture?" and, if not, mutes for safety.

The fix: track the visitor's most recent mute choice in `sessionStorage`, and restore it on every `turbo:frame-load`:

```typescript
let userWantsUnmuted =
    sessionStorage.getItem("persistent-music:unmuted") === "1";

function rememberUnmutePreference(unmuted: boolean): void {
    userWantsUnmuted = unmuted;
    sessionStorage.setItem("persistent-music:unmuted", unmuted ? "1" : "0");
}

// Every time a frame finishes rendering, restore the last preference.
// The link click that got the visitor here is a fresh user gesture,
// so YouTube's API honors unMute().
document.addEventListener("turbo:frame-load", () => {
    if (player && userWantsUnmuted) {
        try { player.unMute(); } catch {}
    }
});

// Poll once a second so we notice if the visitor uses YouTube's own
// unmute button (which we don't get a direct event for).
setInterval(() => {
    if (player && !player.isMuted() && !userWantsUnmuted) {
        rememberUnmutePreference(true);
    }
}, 1000);
```

This makes the behavior what a visitor would expect: click "Play with sound" once, and the volume stays up for the rest of their session no matter how many pages they visit.

### Subtitle suppression

YouTube's embed accepts a `cc_load_policy=0` URL parameter that *hints* subtitles should be off. It's not enforced — if the visitor's YouTube account has captions enabled, subtitles come on anyway.

The enforcement path is the [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference), specifically `unloadModule("captions")` and `unloadModule("cc")`. It only unloads captions that are already loaded, so calling it once at player-ready isn't enough — the visitor's account preference can re-load them on a video change. The trick is to call it on *every* state transition:

```typescript
function killCaptions(p: YTPlayerLike): void {
    try { p.unloadModule("captions"); } catch {}
    try { p.unloadModule("cc"); } catch {}
}

player = new YT.Player("persistent-music-iframe", {
    events: {
        onReady: (event) => killCaptions(event.target),
        onStateChange: (event) => killCaptions(event.target),
    },
});
```

Cheap, defensive, silent. Every state change is another chance for captions to have slipped back in.

## Files at a glance

The full implementation lives across five files. Here's what each one carries:

| File | Purpose |
|---|---|
| [`layouts/baseof.html`](https://github.com/ocrosby/omarcrosby.com/blob/main/layouts/baseof.html) | Wraps swappable content in `<turbo-frame id="content">`. Renders the player *outside* the frame. |
| [`layouts/_partials/persistent-music-player.html`](https://github.com/ocrosby/omarcrosby.com/blob/main/layouts/_partials/persistent-music-player.html) | The player markup — `<iframe>` + close button + "Play with sound" overlay. |
| [`layouts/_partials/extend_head.html`](https://github.com/ocrosby/omarcrosby.com/blob/main/layouts/_partials/extend_head.html) | Loads Turbo 8 from jsDelivr, sets the morph refresh-method meta tag. |
| [`assets/js/persistent-player.ts`](https://github.com/ocrosby/omarcrosby.com/blob/main/assets/js/persistent-player.ts) | Owns `YT.Player`, positions the player over the featured slot on `/music/`, tracks mute preference, kills captions, exposes a `play(song)` API for the `/music/` page's playlist. |
| [`assets/css/extended/persistent-music-player.css`](https://github.com/ocrosby/omarcrosby.com/blob/main/assets/css/extended/persistent-music-player.css) | The corner-mini styling off-`/music/`, the 16:9 aspect ratio on-`/music/`, the "Play with sound" overlay treatment. |

The full [`assets/js/persistent-player.ts`](https://github.com/ocrosby/omarcrosby.com/blob/main/assets/js/persistent-player.ts) is under 400 lines and is the useful reference implementation if you're building the same thing.

## What I'd tell someone starting from scratch

1. **Skip `data-turbo-permanent` for iframes.** It looks like the right primitive; it isn't. The reparenting semantics that make it work for form state break iframes on any browser that treats DOM-parent changes as a load signal.
2. **Reach for Turbo Frames early.** They're one attribute more than a plain Turbo Drive setup and give you exactly the "some of the page swaps, some doesn't" model persistent media needs.
3. **Keep the persistent DOM position stable.** If you need the player to *look* like it's in a different spot on different pages, use CSS positioning driven by a placeholder, not JS reparenting. Every DOM move is a potential reload.
4. **Assume the browser will re-mute you.** Track the visitor's preferred mute state and restore it on every navigation. `sessionStorage` is enough.
5. **Enforce subtitle state on every YouTube state change.** URL parameters are hints; `unloadModule` is enforcement.

## The result

Load [`/music/`](/music/) on my site, click "Play with sound," and then click your way to [`/about/`](/about/), [`/uses/`](/uses/), [`/now/`](/now/), or any post. The player shrinks to the bottom-right corner, keeps playing at the same volume, at the same position, without a click or a mute. Come back to `/music/` and the player expands to fill the featured slot at the top. Same iframe, same audio, same everything the visitor was hearing a second ago.

That's it. One iframe, one `<turbo-frame>` around the rest of the page, one absolute-positioning helper, and two lines of defense against the browser trying to re-mute you.

## Further reading

- [Turbo Handbook — Frames](https://turbo.hotwired.dev/handbook/frames)
- [Turbo Drive — Advancing or Replacing History](https://turbo.hotwired.dev/reference/drive#advancing-or-replacing-history)
- [Idiomorph](https://github.com/bigskysoftware/idiomorph) (the DOM-diff engine behind Turbo 8's morph render)
- [YouTube IFrame Player API reference](https://developers.google.com/youtube/iframe_api_reference)
- [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay/)
- [PaperMod theme](https://github.com/adityatelange/hugo-PaperMod) (what this site's layouts extend)
