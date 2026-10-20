+++
title = "GitHub Projects automation in plain language"
date = "2026-10-20T05:58:00-04:00"
draft = false
description = "A plain-language tour of GitHub Projects (v2) and the three overlapping layers of automation that keep a project board in sync with issues and pull requests — built-in workflows, GitHub Actions, and the GraphQL API."
summary = "A plain-language tour of GitHub Projects (v2) and the three overlapping layers of automation that keep a project board in sync with issues and pull requests — built-in workflows, GitHub Actions, and the GraphQL API."
tags = ["github", "github-projects", "project-management", "workflow-automation", "automation", "fundamentals"]
categories = ["Fundamentals"]
series = ["GitHub in Plain Language"]
ShowToc = true

[cover]
image = "/images/og/github-projects-automation-in-plain-language.png"
hiddenInList = true
hiddenInSingle = true
+++

*Part 4 of a four-part series. Previously: [Repository settings](/posts/github-repository-settings-in-plain-language/), [Rulesets](/posts/github-rulesets-in-plain-language/), and [GitHub Actions workflows](/posts/github-actions-workflows-in-plain-language/).*

A team I was helping had set up a GitHub Project to track their quarterly roadmap. Three columns — **Backlog**, **In progress**, **Done** — and twenty open issues scattered across them. On week four, their standup had drifted into a weekly ritual of someone saying "wait, didn't we ship that already" and someone else dragging a card to **Done** on screen share. The board was out of date because every status change required a human to remember to move a card after merging a PR, and humans forget.

The problem is as old as project boards. The GitHub-shaped answer to it is three overlapping systems of automation that together keep a board in sync with the actual state of the issues and PRs it represents. Each layer has a tighter fit for a different problem, and most teams get the most leverage from a combination. *The single most useful question to ask about a GitHub Project board that is drifting is: which column transition should have happened automatically, and which layer of automation would have made it happen?* This post is the map that lets you answer.

A note on terminology: when GitHub Projects (v2) launched in 2022, it replaced the older "Projects classic" board that had its own built-in automations ("Move to Done when closed" style). This post is entirely about the new, v2 Projects, which is also called **GitHub Projects** or **the new Projects** depending on which doc page you landed on. The old classic Projects is being wound down in favor of v2 — the [current docs for v2 Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects) are authoritative; every automation idea below is in the v2 world.

## What a GitHub Project actually is

A **Project** is a board (or a table, or a roadmap view) that pulls in issues and pull requests from one or more repositories and lets you track them against custom fields — status, priority, iteration, estimate, custom text and number columns, custom single-select enums. Each item on the board is a *reference* to an issue or PR; the item still lives in its source repository, and anything you do to it (close it, label it, comment on it) propagates both ways.

Projects can be scoped to a user or to an organization, and a single project can draw items from any number of repositories. That matters because it is the only built-in way to get a single view across multiple repos — issue search is close but not the same thing.

The thing most teams want from a Project is for the board to be *the truth* — if a card says **In Progress**, there is an active PR; if a card says **Done**, the work shipped. That is the state automation keeps you in. Without automation, cards drift from the underlying state within a sprint.

## The three layers of automation

GitHub exposes automation for Projects through three mechanisms, each with its own ergonomics ([GitHub Docs: Automating your project](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project)).

1. **Built-in workflows** — a short list of pre-built automations configured in the project's settings. No code, no YAML. The right tool for the common cases.
2. **GitHub Actions** — a repository workflow that uses the GraphQL API (via the `actions/github-script` action or a dedicated action like `actions/add-to-project`) to manipulate the project when events fire. The right tool for conditional logic the built-ins do not cover.
3. **GraphQL API** — direct calls against GitHub's GraphQL endpoint, usually from a separate script or application. The right tool for backfills, bulk edits, and integrations with systems outside GitHub.

Pick the lightest layer that solves the problem. Most teams end up using the first two and never need to touch GraphQL directly.

## Layer 1 — the built-in workflows

Open any Project, click the **...** menu in the top-right of the board, select **Workflows**. You get a list of pre-built automations, each a toggle plus a configuration form. The ones you get out of the box ([GitHub Docs: Using the built-in automations](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations)):

### Item added to project

Fires when a new item (issue or PR) is added to the project. Sets a configurable **Status** value — most teams set this to `Backlog` or `Todo` so freshly-added items land in a predictable column.

The common misunderstanding: this does not *add* items to the project — it only sets fields when something else adds an item. For automatic adding, use the next workflow.

### Auto-add to project

Fires when an issue or PR *in a chosen repository* matches a filter you specify (open issues, closed PRs, issues with a certain label, items assigned to a user). Automatically adds the matching item to the project.

The filter uses the same mini-DSL as the issue-search bar — `is:issue is:open label:bug`, `is:pr is:closed`. Each project can watch several repositories at once.

Use this when a project is the view of a repo (or a few repos) and you want new items to land on the board without a human dragging them.

### Item reopened

Fires when an issue or PR tied to a project item is reopened. Sets Status back to a value you configure — usually `In Progress` or `Needs Review`.

### Item closed

Fires when an issue or PR tied to a project item is closed. Sets Status (and optionally other fields) to a value you configure. The default is `Done`, and this is the workflow that handles 80% of the "card still says In Progress but we shipped it" drift.

### Pull request merged

Fires specifically when a PR is *merged* (not just closed). Lets you distinguish merged PRs from closed-without-merging ones — the former usually means Done, the latter usually means Not Doing. Important when your Status enum distinguishes those two outcomes.

### Auto-archive items

Fires on a schedule the project configures. Archives items that match a filter — the typical pattern is "archive items that have been in **Done** for 30 days" so the active board does not accumulate every shipped item of the quarter.

### Code review-related automations

A smaller family for the sub-states of PR review. Workflows for setting Status when a PR is marked ready-for-review, when reviews are requested, and when the PR is approved. Fine-grained; useful on teams that have review-state columns on the board.

### Scope and configuration — the one thing to know

Every built-in workflow is **project-level** — it is configured on the project, not on a repository. Workflows apply to every item in the project regardless of which repo it came from. That is the right scope for most status rules (a merged PR is Done, no matter which repo it was in) and the wrong scope for anything repo-specific.

**When to reach for a built-in workflow:** the automation is about a *status transition* driven by a GitHub event (added, closed, merged, reopened, labeled). Which covers more cases than most teams realize before they look at the list. The complete current list is in the live docs; GitHub adds built-in workflows faster than most blog posts can keep up with.

**When a built-in workflow is not enough:** the trigger involves a *non-GitHub* event (someone replied in Slack, a deployment succeeded in your tool), or the action needs *custom logic* (set Status to X unless the item also has label Y), or the mapping depends on data not surfaced in the workflow form (set Priority based on a field on a *linked* item). Those are jobs for layer two.

## Layer 2 — GitHub Actions

The second layer is a workflow in `.github/workflows/` that reacts to a repository event and manipulates the project in response. The two most common patterns:

### Pattern A — `actions/add-to-project`

The simplest Actions-based automation. [`actions/add-to-project`](https://github.com/actions/add-to-project) is a maintained action that adds the triggering issue or PR to a specified project. Use it when the built-in **Auto-add to project** filter does not express the condition you need — for example, "add issues to the project only if they are opened by someone outside the maintainer team."

```yaml
on:
  issues:
    types: [opened]
jobs:
  add-to-project:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/add-to-project@v1
        with:
          project-url: https://github.com/orgs/your-org/projects/42
          github-token: ${{ secrets.PROJECT_TOKEN }}
```

The `github-token` here cannot be the default `GITHUB_TOKEN`, because projects live at the user or organization level, not the repository level, and `GITHUB_TOKEN`'s permissions are repo-scoped. You need a Personal Access Token or a GitHub App with the right `projects` scope. This is the single friction point every team hits the first time they wire up an Actions-driven project workflow.

### Pattern B — GraphQL via `actions/github-script`

For logic the maintained action does not express, write a short script. The `actions/github-script` action gives you a pre-authenticated Octokit client and lets you call the GraphQL API directly. The typical use: *set a specific field* on an item based on event context.

```yaml
on:
  pull_request:
    types: [opened]
jobs:
  tag-pr:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.PROJECT_TOKEN }}
          script: |
            // Find the project item for this PR, set its Priority field.
            // Full example in the GitHub docs linked at the bottom of this post.
```

GitHub's docs have a worked example for setting fields on a project item from an Actions workflow; see the [GitHub Docs: Automating Projects using Actions](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions) page for the current syntax, which has shifted at least twice since v2 Projects launched.

### When to reach for layer 2

- The trigger is a repository event that the built-in workflows do not cover (a label added, a specific status check succeeded, a release created).
- The action needs *conditional logic* that cannot be expressed in a filter string.
- The automation needs to *read* data from the project to inform its action (set the next iteration based on the current one; move the item only if its priority is already a certain value).
- You need the automation to live in version control, be code-reviewable, and have a change history. YAML in `.github/workflows/` beats clicking in a settings UI for anything you have to explain to a future teammate.

### Where this trips teams up

- **Token scoping.** The default workflow token cannot touch projects. Minting a long-lived PAT and storing it in `secrets.PROJECT_TOKEN` is the quick fix; using a GitHub App with narrow project permissions is the better one for anything production-shaped.
- **Rate limiting.** GitHub's GraphQL API has rate limits per token. Workflows that run on every push to every PR and make several GraphQL calls per run can exhaust them on a busy day. Batch or debounce.
- **Project field IDs are opaque.** When you want to set the Priority field to "High," the GraphQL mutation does not accept the string "High" — it accepts the UUID of the option. These IDs do not change often, but they *are* opaque, and the first version of your script usually includes a lookup step to discover them.

## Layer 3 — the GraphQL API directly

The third layer is calling GitHub's GraphQL API from outside a workflow — from a script, a dashboard, a scheduled job on your own hardware, an external system. The API is the same one layer 2 uses; the layer-3 distinction is "the automation lives outside GitHub."

Common use cases:

- **Backfills.** Set the Priority field on 400 existing items based on a label mapping — a one-off bulk edit a workflow would be overkill for.
- **Reports.** Pull the current state of a project into a spreadsheet, a dashboard, or a weekly email.
- **Cross-system integrations.** Sync a project with a Linear instance, a Jira board, a customer-facing public roadmap, or an internal tool that is the source of truth for roadmap items.
- **Scheduled operations that are not well-fit to Actions.** "Every Monday at 7am, archive every item that has been in Done for 30 days and post a Slack summary." You *can* do this in Actions; many teams prefer a script running on existing infrastructure where they already have the Slack and secret plumbing.

Projects v2 is GraphQL-only — there is no REST API for it, which caught a lot of early adopters off-guard who had automated Projects classic through REST. The GraphQL schema is documented at [GitHub's GraphQL API reference](https://docs.github.com/en/graphql); the specific types you care about are `ProjectV2`, `ProjectV2Item`, `ProjectV2Field`, and the mutations under `addProjectV2ItemById`, `updateProjectV2ItemFieldValue`, and `archiveProjectV2Item`.

## The decision table

In order of cost: pick the lightest layer that solves the problem.

| Use case | Layer |
|---|---|
| Status should change when an item is closed, merged, or reopened | **Built-in workflow** |
| Items from a repo should land on the board automatically | **Built-in** (Auto-add) |
| Items should auto-archive after a Status transition | **Built-in** (Auto-archive) |
| An item needs a field set based on who opened it | **Actions** (conditional in `actions/github-script`) |
| A field needs to be set from external data (deploy succeeded, Slack reply) | **Actions** (triggered by `repository_dispatch`) |
| A bulk edit across hundreds of items | **GraphQL script** |
| A scheduled job you already run elsewhere | **GraphQL script** |
| A read-only report / dashboard | **GraphQL script** |

## What Projects automation does NOT solve

- **It does not plan the work.** A board can be perfectly in sync and still represent nothing useful. The automation keeps columns truthful; the thinking about what should be in which column is work no automation substitutes for.
- **It does not fix a bad field schema.** A project with twenty custom single-select fields and no clear convention for which to set when is a mess no automation can rescue. Settle the schema first, automate second. The classic failure mode is adding one more automation to paper over a status enum that has four values none of which quite fit the state the team actually works in.
- **It is not real-time.** Built-in workflows run within seconds of the triggering event; Actions-driven workflows run with the usual queuing delay (typically under a minute); GraphQL scripts run when you tell them to. If you need "the board is updated the instant the webhook fires," none of these are strictly real-time, and some are decidedly not.
- **It does not back-fill history.** A new built-in workflow does not retroactively apply to already-closed items. Backfill is a layer-3 job: write the script, run it once, move on.
- **It does not replace a ticketing system you have outgrown.** Projects v2 is good for engineering and roadmap-adjacent work. For customer support ticketing, help-desk SLAs, incident management, or anything with a service-level contract to a non-GitHub audience, it is the wrong shape. Teams that try to make it do everything end up with a very fancy board that still cannot be shown to anyone outside engineering.

## Steelmanning the alternatives

**"Just use Linear / Jira / Shortcut."** For a team that lives in Linear and ships through GitHub, the native Linear-GitHub integration is tighter than any Projects-based setup, and most teams who have adopted Linear are not going back. The case for Projects over Linear is "the work is engineering-shaped, we live in GitHub, and we would rather not add a vendor." That is a legitimate case; it is also a smaller surface area than Linear covers.

**"Just use GitHub Issues alone."** For a repository where the entire team already lives on `/issues`, labels, milestones, and a saved search can produce most of what a Projects board would. The failure mode is any work that spans repositories — labels and milestones do not cross repo boundaries. If your scope is one repo, Issues alone is often enough.

**"Just use a spreadsheet."** For small teams and short projects, this is sometimes the right answer. The failure mode is drift and the lack of two-way sync with the underlying issues. You get a spreadsheet.

**"Just build a Backstage plugin / internal tool / dashboard."** For large organizations that already have an internal developer portal, surfacing project state inside the portal is often more useful than another GitHub view. The GraphQL API makes this cheap; the question is whether the integration cost pays back. Usually: yes, if the portal already exists; no, if the portal is itself the project you are trying to deliver.

## The one thing to take away

If you take one idea from this post: **a Project board is only as trustworthy as the automation that keeps it in sync — pick the lightest layer that handles the transition, and let the humans spend their standup discussing the work, not the cards.** Open any project you own, click **Workflows**, and turn on **Item closed** and **Pull request merged** if they are not already on. The drift you had last week will be most of the way gone by next week.

That closes the series. Across four posts we have walked the shape of GitHub beyond the file list: the [Settings tab](/posts/github-repository-settings-in-plain-language/), the [Rulesets system](/posts/github-rulesets-in-plain-language/) that governs what gets merged, the [Actions workflows](/posts/github-actions-workflows-in-plain-language/) that produce the gates and ship the code, and this post on the automation layer that keeps the human-facing project board honest. The platform is not small; the right time to read through it deliberately is before an incident forces you to.

## Where to read more

- **[GitHub Docs: About Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects)** — the authoritative concept primer. Short, worth starting here.
- **[GitHub Docs: Automating your project](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project)** — the index page for all three layers.
- **[GitHub Docs: Using the built-in automations](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations)** — the exact list of built-in workflows, kept current by GitHub.
- **[GitHub Docs: Automating Projects using Actions](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions)** — worked examples of the Actions-based pattern, including token setup.
- **[`actions/add-to-project`](https://github.com/actions/add-to-project)** — the maintained action for the Auto-add use case, when the built-in filter is not enough.
- **[GitHub GraphQL API reference](https://docs.github.com/en/graphql)** — the full schema. The types to search for are `ProjectV2`, `ProjectV2Item`, and `ProjectV2Field`.
