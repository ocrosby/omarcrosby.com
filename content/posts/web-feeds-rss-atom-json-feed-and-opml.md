+++
title = "Web feeds: RSS, Atom, JSON Feed, and OPML"
date = "2026-07-20T10:28:06-04:00"
draft = false
description = "A working tour of the web-feed ecosystem — the RSS 2.0 lineage, IETF Atom (RFC 4287), JSON Feed 1.1, and OPML for exchanging subscription lists between readers — with practical guidance on which format to publish and current recommendations for desktop, mobile, and self-hosted readers."
summary = "A working tour of the web-feed ecosystem — the RSS 2.0 lineage, IETF Atom (RFC 4287), JSON Feed 1.1, and OPML for exchanging subscription lists between readers — with practical guidance on which format to publish and current recommendations for desktop, mobile, and self-hosted readers."
tags = ["rss", "atom", "json-feed", "opml", "syndication", "web", "fundamentals"]
categories = ["Fundamentals"]
ShowToc = true

[cover]
image = "/images/og/web-feeds-rss-atom-json-feed-and-opml.png"
hiddenInList = true
hiddenInSingle = true
+++

The modern web has spent twenty years trying to reinvent the *subscribe* button. Newsletters, notification permission popups, "follow us on X, Instagram, TikTok, Bluesky" banners, algorithmic feeds that decide for you what a subscription means — each generation of pattern has been noisier and more account-bound than the last. Meanwhile, the piece of technology that actually does the job — the piece that lets you follow a site without an account, without email, without an algorithm, and without a company standing between you and the content — has quietly kept working, unchanged in shape, since 1999.

That technology is the **web feed**: a file at a well-known URL, updated when the site publishes something new, that any reader app can pull on your behalf. Three formats dominate: **RSS**, **Atom**, and **JSON Feed**. A fourth format, **OPML**, is not a feed but the standard way to move a *collection* of feed subscriptions from one reader to another.

This post is a working tour of all four. It's aimed at developers who haven't yet used feeds, developers who *did* use them a decade ago and want to see what changed, and site publishers deciding which format to serve.

## Why feeds still matter

Three properties keep feeds alive despite twenty years of platforms trying to bury them:

1. **They're pull, not push.** Nothing runs on the publisher's side to send updates. Your reader hits a URL on your schedule and reads what's there. No account, no email address, no user tracking, no ability for the publisher to know you unsubscribed.
2. **They're portable.** Move your subscription list between apps in seconds via OPML export/import. Compare that to migrating fifty email newsletters or fifty Instagram accounts.
3. **They're chronological and complete.** No feed reader hides posts from you or reorders them by engagement. The reader shows every item from every subscription in the order the publisher shipped them.

The trade against social platforms — "I have to add feeds one by one instead of following an account" — sounds like friction until you've spent a month reading through a feed reader instead of a timeline. The signal-to-noise ratio is different in a way that's hard to describe until you experience it. There's no growth-hacking, no engagement-baiting headlines, no ads inserted between items. There's just the writing.

The rest of this post is the mechanics that make that experience possible.

## The mental model, in one paragraph

A **feed** is a static file at a URL. When a publisher adds a new post, they regenerate the file. When your reader wants to know what's new on that site, it fetches the file over HTTP, parses it, and compares the items against what it already showed you. Everything else — the reader UI, the notification, the read/unread state, the archive — is client-side. The publisher does not know your reader exists, and does not need to.

The three feed formats — RSS, Atom, JSON Feed — are just three different ways of writing that file. All three carry the same information (feed metadata + a list of items with titles, links, dates, and content). They differ in syntax, in strictness, and in what a reader has to do to parse them.

## RSS: the original, and the one everyone still supports

**RSS** stands for *Really Simple Syndication* (as of 2.0 — earlier versions expanded it as *RDF Site Summary* or *Rich Site Summary*, depending on which faction of the format war you asked). The current specification is **RSS 2.0.11**, maintained by the [RSS Advisory Board](https://www.rssboard.org/rss-specification), and functionally frozen — the spec explicitly commits to no further breaking changes.

The version lineage is worth naming because you will occasionally see the older ones in the wild:

- **RSS 0.9** (1999) — Netscape, for MyNetscape.
- **RSS 0.91 / 0.92** (2000) — Dave Winer / UserLand. The "Really Simple Syndication" branch.
- **RSS 1.0** (2000) — a separate specification built on RDF; still used but never dominant.
- **RSS 2.0** (2002) — the version that won. Extended via XML namespaces rather than replaced.

An RSS 2.0 feed is an XML document with this shape:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Site</title>
    <link>https://example.com/</link>
    <description>A blog about interesting things.</description>

    <item>
      <title>My First Post</title>
      <link>https://example.com/posts/first/</link>
      <description>A short summary or the full content.</description>
      <pubDate>Sat, 20 Jul 2026 10:00:00 -0400</pubDate>
      <guid isPermaLink="true">https://example.com/posts/first/</guid>
    </item>

    <!-- More <item> elements ... -->
  </channel>
</rss>
```

The `<channel>` element requires three children: `<title>`, `<link>`, and `<description>`. Each `<item>` must include at least one of `<title>` or `<description>` — everything else on the item (`<link>`, `<pubDate>`, `<guid>`, `<author>`, `<category>`, `<enclosure>`, `<source>`, `<comments>`) is optional but almost always present.

**`<enclosure>` is worth calling out**: it's the RSS mechanism for attaching media — an MP3 for a podcast, a video, a PDF. Every podcast client in the world is fundamentally an RSS reader that renders `<enclosure>` differently. When Apple, Google, and Spotify let you subscribe to a podcast, they're subscribing to an RSS feed.

**Extensions live in XML namespaces.** The `dc:` namespace (Dublin Core) adds `dc:creator` for author information. The `content:` namespace adds `content:encoded` for full HTML content (RSS 2.0's own `<description>` is technically supposed to be a plain-text summary; `content:encoded` was invented to carry full HTML properly). The `atom:` namespace adds Atom elements into RSS documents — most notably `atom:link rel="self"` to declare the feed's own URL. Almost every RSS feed you'll see in the wild uses at least one namespace.

**MIME type**: `application/rss+xml`. In practice, `text/xml` and `application/xml` are also served frequently, and every reader accepts all three.

## Atom: the IETF standard that fixed RSS's ambiguities

RSS 2.0's success also exposed its edges. The spec was written informally, several elements were under-specified (the `<description>` plain-text-vs-HTML ambiguity above; the `<guid>` "isPermaLink" boolean confusion; the `<pubDate>` RFC 822 date format that no library parsed identically), and the standardization process — one person committing to a "frozen" spec — didn't scale. In 2003, a group of implementers started work on a replacement: a strictly-specified, IETF-standardized syndication format called **Atom**.

Atom was published as [**RFC 4287**](https://datatracker.ietf.org/doc/html/rfc4287) in **December 2005**. It defines a companion publishing protocol as [**RFC 5023 (AtomPub)**](https://datatracker.ietf.org/doc/html/rfc5023) — a REST-style API for editing feed entries remotely, published in 2007 — but the syndication format is what matters here.

An Atom feed looks similar in structure to RSS but with tighter rules:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Site</title>
  <link href="https://example.com/"/>
  <link rel="self" href="https://example.com/feed.atom"/>
  <id>https://example.com/</id>
  <updated>2026-07-20T14:00:00Z</updated>
  <author>
    <name>Jane Smith</name>
  </author>

  <entry>
    <title>My First Post</title>
    <link href="https://example.com/posts/first/"/>
    <id>https://example.com/posts/first/</id>
    <updated>2026-07-20T10:00:00-04:00</updated>
    <content type="html"><![CDATA[<p>Full post content here.</p>]]></content>
  </entry>
</feed>
```

The tightening compared to RSS:

- **Required elements are actually required.** Every `<feed>` MUST have `<title>`, `<id>`, and `<updated>`. Every `<entry>` MUST have `<title>`, `<id>`, and `<updated>`. An RSS `<item>` can legally omit both `<title>` *and* `<link>` — an Atom `<entry>` cannot.
- **IDs are permanent and universally unique.** An Atom `<id>` is a canonical URI (often the entry's URL, but the spec is explicit that it need not be resolvable). RSS's `<guid>` mixes "permalink" and "opaque identifier" semantics behind a Boolean flag.
- **Dates are RFC 3339, not RFC 822.** `2026-07-20T14:00:00Z` is unambiguous; `Sat, 20 Jul 2026 10:00:00 -0400` has three or four dialects. Every date library in every language parses RFC 3339 the same way.
- **Content type is explicit.** An `<entry>` uses `<content type="html">`, `<content type="text">`, or `<content type="xhtml">`. Readers know exactly what to render without heuristics.
- **`<link rel="self">` is standard.** The feed knows its own URL and includes it. This is the mechanism that lets a reader detect the feed has moved (`301 Moved Permanently` + a new `<link rel="self">`) and update its subscription automatically.

**MIME type**: `application/atom+xml`.

Atom is what I'd write if I were building a new site today and picking one format. In practice, every serious static-site generator (including Hugo, which powers this site) will output whichever format you configure — RSS is still the more common publishing default because it's what podcast clients require and it has the largest install base, but Atom is what powers most large-scale news feeds behind the scenes.

## JSON Feed: the modern rewrite for developers who dislike XML

By the mid-2010s, XML had lost the ecosystem war to JSON almost everywhere except syndication. Server-to-server APIs were JSON. Configuration files were JSON. The people writing feed *readers* were fluent in JSON parsers and reaching for XML libraries reluctantly. Two prominent developers — Manton Reece (Micro.blog) and Brent Simmons (NetNewsWire, and a co-designer of the original RSS 2.0) — set out to solve that.

**[JSON Feed 1.0](https://www.jsonfeed.org/version/1/)** shipped in May 2017. **[JSON Feed 1.1](https://www.jsonfeed.org/version/1.1/)** followed in August 2020, adding an `authors` array (per feed and per item), a `language` field (RFC 5646 language tags), and clarifying that item `id`s are strings.

The shape is exactly what you'd expect:

```json
{
  "version": "https://jsonfeed.org/version/1.1",
  "title": "Example Site",
  "home_page_url": "https://example.com/",
  "feed_url": "https://example.com/feed.json",
  "description": "A blog about interesting things.",
  "authors": [{"name": "Jane Smith", "url": "https://example.com/about/"}],
  "language": "en-US",
  "items": [
    {
      "id": "https://example.com/posts/first/",
      "url": "https://example.com/posts/first/",
      "title": "My First Post",
      "content_html": "<p>Full post content here.</p>",
      "date_published": "2026-07-20T10:00:00-04:00"
    }
  ]
}
```

Required top-level fields: `version`, `title`, `items`. Optional but conventional: `home_page_url`, `feed_url`, `description`, `authors`, `language`, `icon`, `favicon`.

Item requirements: `id` is the only mandatory field. In practice items always carry `url`, `title`, one of `content_html`/`content_text`, and a `date_published`. Attachments — the JSON Feed equivalent of RSS `<enclosure>` for podcast media — are an optional array on each item: `{"url": "...", "mime_type": "audio/mpeg", "size_in_bytes": ..., "duration_in_seconds": ...}`.

**MIME type**: `application/feed+json` (preferred by the 1.1 spec) or `application/json`.

JSON Feed's practical advantages are exactly what you'd predict: JSON parsers are ubiquitous, the format is easier to inspect visually, and generating one in a language that doesn't have first-class XML support is straightforward. Its disadvantage is smaller install base — most readers accept it, but "most" here means "if you serve *only* JSON Feed and no XML variant, some readers will not find you." The pragmatic answer is to serve both an RSS or Atom variant *and* a JSON Feed variant; every static-site generator can output all three.

## Which format to publish

If you're a publisher deciding what to put on your site, the practical guidance:

- **Serve at least one of RSS 2.0 or Atom.** Every reader accepts both. If you have to pick one, serve RSS if you produce audio (`<enclosure>` for podcasts) and Atom if you produce anything else. If you have the option, serve *both*.
- **Serve JSON Feed as a supplementary format.** Cheap to generate, appreciated by developers subscribing to your feed via a script or a self-hosted reader they wrote themselves.
- **Include auto-discovery links in your HTML.** In `<head>` of every page:

  ```html
  <link rel="alternate" type="application/rss+xml"  title="Site Posts" href="/index.xml">
  <link rel="alternate" type="application/atom+xml" title="Site Posts" href="/feed.atom">
  <link rel="alternate" type="application/feed+json" title="Site Posts" href="/feed.json">
  ```

  When a user pastes your homepage URL into a feed reader, the reader parses your HTML, finds the `<link rel="alternate">` tags, and offers your feeds. Without this, the user has to hunt for a feed URL in your footer or copy-paste `/index.xml` from memory.
- **Serve category- or section-specific feeds** if your site is broad enough to have distinct audiences. This site publishes a feed per topic pillar (`/categories/fundamentals/index.xml`, `/categories/release-tooling/index.xml`, etc.) so readers can subscribe only to the parts they care about. Cheap to add; genuinely appreciated by subscribers.

## Discovering feeds on someone else's site

The pattern above cuts both ways. When you land on a site and want to subscribe, four things to try in order:

1. **Look for the RSS icon** — that orange square with the radio-wave curve. It's usually in the footer, sometimes in the header. Click it, copy the URL, paste into your reader.
2. **Paste the site's homepage URL into your reader.** Modern readers auto-detect the `<link rel="alternate">` tags I just described. NetNewsWire, Reeder, Feedly, and Inoreader all do this well.
3. **Try `example.com/index.xml`, `example.com/feed`, `example.com/rss`, `example.com/atom.xml`.** Static-site defaults tend to cluster around one of those paths.
4. **View source.** Ctrl-F for `rel="alternate"` in the HTML. Every self-respecting publisher puts feed links in `<head>`.

## OPML: how you move your subscriptions between readers

The moment you've been in a feed reader for a year, you've built a subscription list you don't want to re-enter by hand. **OPML** — *Outline Processor Markup Language* — is the interchange format for that list. Every serious reader can export your subscriptions to an `.opml` file and import from one.

OPML was designed by [Dave Winer](https://en.wikipedia.org/wiki/Dave_Winer) as a general-purpose outlining format; **OPML 1.0** shipped in 2000, **OPML 2.0** in 2006. The subscription-list-exchange use case is one of several defined in the spec — but it's overwhelmingly the format's dominant role in the modern web.

An OPML subscription list looks like this:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Jane's Feeds</title>
    <dateCreated>Sat, 20 Jul 2026 14:00:00 GMT</dateCreated>
  </head>
  <body>
    <outline text="Tech" title="Tech">
      <outline type="rss"
               text="Julia Evans"
               title="Julia Evans"
               xmlUrl="https://jvns.ca/atom.xml"
               htmlUrl="https://jvns.ca/"/>
      <outline type="rss"
               text="Hillel Wayne"
               title="Hillel Wayne"
               xmlUrl="https://buttondown.com/hillelwayne/rss"
               htmlUrl="https://buttondown.com/hillelwayne"/>
    </outline>
    <outline text="Cooking" title="Cooking">
      <outline type="rss"
               text="Serious Eats"
               title="Serious Eats"
               xmlUrl="https://www.seriouseats.com/rss.xml"
               htmlUrl="https://www.seriouseats.com/"/>
    </outline>
  </body>
</opml>
```

The `<outline>` elements nest to represent folders (or "categories") in a reader. For a subscription list, each leaf outline carries four attributes:

- **`type="rss"`** — the type marker for a feed subscription. Yes, the value is `rss` even if the feed is Atom or JSON Feed; the attribute is legacy nomenclature and every reader accepts any feed URL under it.
- **`text`** — display label in the reader (required by the OPML spec on every outline).
- **`title`** — usually the same as `text`. Legacy conventions differ.
- **`xmlUrl`** — the feed URL. This is the one the reader actually subscribes to.
- **`htmlUrl`** — the site's homepage. Optional but conventional; some readers use it as a fallback "open in browser" link.

**Using OPML in practice:**

- **Exporting**: your reader has a menu option — usually *File → Export → OPML* or *Settings → Import/Export → Export OPML*. It writes a `.opml` file. Back that file up somewhere; it's your reading identity.
- **Importing**: point the new reader at the file. Every reader imports OPML on setup; folders are preserved, subscriptions come across intact, unread state usually does not (that's local to each reader).
- **Sharing**: OPML files are trivially portable. Publish an OPML file on your own site to share your reading list — "here are the feeds I read, add all of them at once." That was a common practice in the early blogging era and it's making a comeback.
- **Programmatic**: because OPML is XML, generating one from a script is straightforward. If you maintain your subscription list in a static file (git repo, spreadsheet, database), you can produce an OPML export on demand.

**MIME type / extension**: no MIME type was ever registered formally. `text/x-opml`, `application/xml`, and `text/xml` all appear in the wild. The file extension `.opml` is universal.

## Reader recommendations

The reader market has consolidated to a stable set over the last few years. Here are the ones worth trying, categorized by platform. This list intentionally excludes discontinued services (Google Reader, Bloglines, The Old Reader has become spotty) and dead-Simple wrappers around Feedly's API.

### Desktop / mobile — polished commercial

- **[Reeder](https://reederapp.com/)** — macOS and iOS. Elegant reading experience, iCloud sync, works with iCloud accounts or your own feeds. The version formerly known as *Reeder 5* is now split from a newer *Reeder* app that supports timelines beyond RSS (Mastodon, Bluesky). Both are excellent. Paid, one-time purchase.
- **[NetNewsWire](https://netnewswire.com/)** — macOS and iOS. Free and open source, maintained by Brent Simmons (yes, the same person). Feels native, syncs via iCloud or Feedbin. What I use day-to-day.
- **[Feedly](https://feedly.com/)** — web, iOS, Android. The default choice for cross-platform. Generous free tier, paid tiers unlock AI features and unlimited feeds.
- **[Inoreader](https://www.inoreader.com/)** — web, iOS, Android. Power-user features (rules, filters, full-text search across your archive), generous free tier, good paid tier for heavy users.

### Self-hosted

- **[Miniflux](https://miniflux.app/)** — minimalist, single Go binary, PostgreSQL backend. Sub-100 MB memory footprint. What I'd recommend if you want to run your own reader on a small VPS and forget about it. Open source, no ads, no telemetry.
- **[FreshRSS](https://freshrss.org/)** — PHP-based, wider feature set than Miniflux, extension ecosystem, easy to run under any LAMP host. Open source.
- **[Tiny Tiny RSS](https://tt-rss.org/)** — older, still maintained, mature. Considered by many the reference self-hosted reader.

### Android-specific

- **[Feeder](https://f-droid.org/en/packages/com.nononsenseapps.feeder/)** — free, open source, on F-Droid and Google Play. Simple and durable.
- **[Read You](https://github.com/Ashinch/ReadYou)** — Material You design, open source, actively developed. Beautiful on modern Android.

### CLI

- **[newsboat](https://newsboat.org/)** — a terminal-based feed reader. Written in C++/Rust, keyboard-driven, ideal if you already live in tmux. Not a beginner's tool, but delightful if you're the target audience.

Pick one and try it for a week. The muscle memory transfers between readers — the OPML export path means you're never locked in.

## The self-referential ending

This site publishes six feeds: a main site feed at [`/index.xml`](/index.xml), one feed per topic pillar (fundamentals, release tooling, code quality, Neovim, etc.), a recipes feed, and a per-song feed for the now-playing music log. The full list — with the specific URLs and one-line descriptions — is at [/subscribe/]({{< ref "subscribe.md" >}}). Every feed is RSS 2.0 (Hugo's default output format) with auto-discovery `<link rel="alternate">` tags in every page's `<head>`. Point any of the readers above at any of those URLs, or paste the site's homepage into your reader and let it discover the feeds itself.

Web feeds are a small, mature, boring technology, and boring technology is a compliment. They do their one job, they have done it since 1999, and they will keep doing it long after the current generation of algorithm-driven timelines has been renamed and forgotten. The install cost — pick a reader, paste in some URLs, export your OPML for backup — is thirty minutes. The dividend is a reading experience the web hasn't offered in most other channels for a long time.
