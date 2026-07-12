+++
title = "Subscribe"
date = 2026-07-10T06:04:57-04:00
draft = false
description = "Two ways to get new posts from omarcrosby.com — RSS (works today) or email (coming soon)."
+++

Two ways to get new posts:

## RSS

**What is RSS?** Really Simple Syndication is a decades-old open format for following a site without an account, email, or algorithm. You add a feed URL to a reader app; it checks the site for you and shows you what's new. This site publishes a feed for every corner — posts, recipes, music, and each topic pillar — so you can subscribe to only the parts you care about.

The main full-content RSS 2.0 feed is at [omarcrosby.com/index.xml](/index.xml). Any modern feed reader will pick it up.

Recommended readers:

- **[Reeder](https://reederapp.com/)** — polished, quick, macOS/iOS. My pick if you're choosing your first reader.
- **[NetNewsWire](https://netnewswire.com)** — free, open-source, macOS/iOS. What I use day-to-day.
- **[Feedly](https://feedly.com)** — web + mobile, free tier.
- **[Inoreader](https://www.inoreader.com)** — web + mobile, generous free tier.
- **[Miniflux](https://miniflux.app)** — self-hostable, minimalist.

Category-specific feeds are also generated per pillar:

- [Code Quality](/categories/code-quality/index.xml)
- [Distributed Systems](/categories/distributed-systems/index.xml)
- [Neovim](/categories/neovim/index.xml)
- [Sports Data](/categories/sports-data/index.xml)
- [Trading Systems](/categories/trading-systems/index.xml)
- [Engineering Leadership](/categories/engineering-leadership/index.xml)

Point your reader at any of the above to narrow to just that pillar.

Section-specific feeds — separate from posts, if you only want one of these running indices:

- [Recipes](/recipes/index.xml) — recipes added or reorganized under [/recipes/](/recipes/)
- [Music](/music/index.xml) — every song added to the [now-playing log](/music/)

## Email

Coming soon. RSS is the durable option; email is nicer for people who don't want to run a feed reader. Once the newsletter is live, the subscribe form will appear here.

<!--
    Newsletter form — hidden until params.buttondown.username is set in
    hugo.toml. When set, layouts/_partials/newsletter-form.html renders
    an inline subscribe form pointing at Buttondown's embed-subscribe
    endpoint. See the scaffolding PR for setup instructions.
-->
{{< newsletter-form >}}

## Cross-post visibility

Posts are also cross-posted to [LinkedIn](https://www.linkedin.com/in/omarcrosby/) and occasionally [X](https://x.com/crosbyomar). Following either of those is a lightweight way to see new posts land — though the reading experience on this site is better and there are no ads.
