+++
title = "GitHub Actions workflows in plain language"
date = "2026-10-20T05:57:00-04:00"
draft = false
description = "A jargon-free introduction to GitHub Actions — what a workflow is, how it differs from an action, what every top-level YAML key does, which events can trigger a workflow, how jobs and steps compose, and the gotchas most teams only discover in production."
summary = "A jargon-free introduction to GitHub Actions — what a workflow is, how it differs from an action, every top-level YAML key, every trigger, how jobs and steps compose, and the failure modes you only find out about in production."
tags = ["github", "github-actions", "ci-cd", "workflow-automation", "devops", "fundamentals"]
categories = ["Fundamentals"]
series = ["GitHub in Plain Language"]
ShowToc = true

[cover]
image = "/images/og/github-actions-workflows-in-plain-language.png"
hiddenInList = true
hiddenInSingle = true
+++

*Part 3 of a four-part series. Previously: [Repository settings in plain language](/posts/github-repository-settings-in-plain-language/) and [Rulesets in plain language — every option explained](/posts/github-rulesets-in-plain-language/). Up next: [GitHub Projects automation in plain language](/posts/github-projects-automation-in-plain-language/).*

The first GitHub Actions workflow I ever wrote was 400 lines long. It had seven jobs, three of them with the same `steps:` block copy-pasted word-for-word, no `needs:` dependency between any of them, no caching, no concurrency control, and it ran on every push to every branch regardless of whether any file it cared about had changed. It worked. It also took eight minutes per push on a free-tier runner and I was pleased with myself.

The second workflow I wrote was 90 lines, used a reusable workflow for the shared steps, used a `paths:` filter to skip pushes that only touched the README, used `concurrency:` to cancel the previous run when I pushed again, and ran in two minutes. I did not understand what I had done wrong the first time until I understood what the YAML keys were actually for. *The single most useful question to ask about any GitHub Actions workflow is: what event triggers it, and what work does it do that would not be done if the event had not happened?* Half of the YAML in most workflows is the answer to those two questions. The other half is the specific *how*.

This post is a plain-language tour of GitHub Actions — the vocabulary, the file structure, every top-level key, every trigger event worth knowing about, and the handful of advanced features (matrices, reusable workflows, concurrency, environments) that pay back their learning cost on the first repo that uses them well.

## The vocabulary, defined without hand-waving

GitHub Actions has grown a specific vocabulary over seven years (it [reached general availability in November 2019](https://docs.github.com/en/actions) after a 2018 beta), and most of the confusion newcomers hit is linguistic. Here are the terms in the order you meet them:

- **Action** — a *reusable building block*. A small, self-contained unit that does one thing: checkout the repository, set up Python, upload a build artifact, cache a directory. Actions are published separately from any workflow that uses them, usually as their own Git repository, and they are the units you `uses:` from a workflow step. [`actions/checkout`](https://github.com/actions/checkout), [`actions/setup-node`](https://github.com/actions/setup-node), [`actions/cache`](https://github.com/actions/cache) — these are *actions*.
- **Workflow** — a *configurable automated process* that runs one or more jobs. A workflow is a YAML file in `.github/workflows/`. It defines what event triggers it, which jobs to run, in what order, on what kind of machine, and which actions and `run:` steps make up each job. The workflow is the choreography; the actions are the dancers.
- **Job** — a group of steps that execute together on one *runner*. A single workflow can define many jobs, which by default run in parallel. Jobs can declare dependencies on each other via `needs:` so later jobs wait for earlier ones.
- **Step** — a single unit of work inside a job. Either a shell command (`run: npm test`) or a call to an action (`uses: actions/checkout@v4`). Steps run sequentially inside the job and share a workspace.
- **Runner** — the machine that executes a job. Can be a **GitHub-hosted runner** (an ephemeral VM GitHub provisions for the job and discards after) or a **self-hosted runner** (a machine you operate, enrolled in your repository or organization).
- **Event** — the thing that triggers a workflow run. A `push`, a `pull_request`, a scheduled time, a manual click, a webhook from an external system. Every workflow run exists because one of these fired.
- **Artifact** — a file (or directory of files) produced by a job and uploaded for later use by a different job or a human downloading from the UI. Artifacts persist for the retention period of the workflow run (90 days by default).
- **Secret** — a redacted-from-logs variable your workflows can read, scoped to the repo, environment, or organization. Covered in the previous post on [repository settings](/posts/github-repository-settings-in-plain-language/#secrets-and-variables).
- **Variable** — a plain-text variable your workflows can read, scoped the same way. Used for non-sensitive config.
- **Environment** — a named deployment target (`production`, `staging`) with its own secrets, variables, and gates. A job that declares `environment: production` cannot start until the environment's protection rules are satisfied.
- **GITHUB_TOKEN** — an automatically-provided, short-lived token GitHub injects into every workflow run. It can read and write things in the repository (based on the workflow's `permissions:` block) without needing a human-owned Personal Access Token. The single most important thing a new workflow author should learn to use safely.

Everything else is a variation on one of these.

## Where workflow files live

Every workflow is a YAML file inside `.github/workflows/` in the repository root. One file per workflow; GitHub picks up every file in that directory that matches `*.yml` or `*.yaml` and treats it as a candidate workflow. Workflow files are *committed to the repository*, which means they are version-controlled, PR-reviewable, and visible to anyone with read access.

The filename is informational — GitHub uses the `name:` key inside the file for the UI label if one is set, and falls back to the filename otherwise. Teams usually pick names that match the workflow's purpose: `ci.yml`, `release.yml`, `deploy-staging.yml`.

## The top-level YAML keys

A workflow file is a YAML document with these top-level keys. Every one of them is optional except `on:` and `jobs:`, but each one does something you probably want to know about.

```yaml
name: CI
run-name: CI for ${{ github.event.pull_request.title }}

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: write

env:
  NODE_VERSION: '20'

defaults:
  run:
    shell: bash

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
```

Walking through them, in roughly the order you meet them in a growing workflow:

- **`name`** — the workflow's display name in the Actions tab UI. Optional; the filename is used if omitted.
- **`run-name`** — a per-run name, templated with [workflow expressions](https://docs.github.com/en/actions/learn-github-actions/expressions). Lets you label individual runs so the Actions tab reads as "CI for *PR title*" instead of just "CI." Added in 2023.
- **`on`** — which events trigger this workflow. The one key you cannot omit. Covered in depth below.
- **`permissions`** — what the auto-provided `GITHUB_TOKEN` is allowed to do during this run. Granularity is per-scope (`contents: read`, `issues: write`, `pull-requests: read`, etc.). The default is whatever the repo's **Actions → Workflow permissions** setting dictates, which has been read-only since early 2023; set this key explicitly when a job needs to write.
- **`env`** — a map of environment variables available to every step in every job. Overridable at the job and step level.
- **`defaults`** — default settings for all `run:` steps across all jobs. The two keys that matter are `shell:` (default is `bash` on Linux and macOS, PowerShell on Windows) and `working-directory:` (default is the repo root). Useful when every one of your steps needs to run from a subdirectory.
- **`concurrency`** — ensures only one workflow run with the same `group` key is in flight at a time. If a new run arrives while one is active, the new run queues; if `cancel-in-progress: true`, the active run is cancelled first. Prevents double-deploys and lets you cancel outdated CI runs when a PR gets a fresh push.
- **`jobs`** — the actual work. One or more named jobs. Covered in depth below.

## The `on:` key — every event, briefly

A workflow runs when one of its triggering events fires. GitHub lets you declare several, in several flavors. The authoritative list is in GitHub's [Events that trigger workflows](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows) reference; here they are grouped by shape so you can keep the taxonomy in your head.

### Repository webhook events

These fire when something happens in the repository.

- **`push`** — someone pushed one or more commits. Filterable by `branches:`, `branches-ignore:`, `tags:`, `tags-ignore:`, and `paths:` / `paths-ignore:` (file-glob filters, so a push that only touched the README skips a workflow with `paths: ['src/**']`). The most common trigger in all of GitHub Actions.
- **`pull_request`** — a PR was opened, synchronized (new commit pushed), reopened, closed, labeled, etc. Filterable by the same keys plus `types:` for which sub-events count. Workflows triggered by `pull_request` run with the PR branch checked out and *do not* get secrets from the base repo when the PR is from a fork — this is a deliberate security boundary.
- **`pull_request_target`** — the same event, but the workflow runs against the *base* branch's workflow file with full secret access. Useful for workflows that need to label or comment on fork PRs; dangerous when combined with "check out the PR's code and run it," because you have just handed the fork author shell access to your secrets. The GitHub security team has written on this specifically; read [their guidance](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/) before using it.
- **`issues`**, **`issue_comment`**, **`pull_request_review`**, **`pull_request_review_comment`** — the issue and review events. Used for workflows that triage, label, auto-assign, or react to review activity.
- **`release`** — a GitHub Release was published, created, edited, deleted, prereleased, or released. The canonical trigger for release workflows that build and upload artifacts.
- **`workflow_run`** — another workflow run started or completed. Lets one workflow chain to another; useful when a Build workflow succeeds and a Deploy workflow should pick up its artifacts.
- **`check_run`** / **`check_suite`** — a check completed. Used by workflows that react to CI results produced by *another* system.
- **`discussion`** / **`discussion_comment`** — a GitHub Discussion was created or commented on.
- **`gollum`** — a wiki page was created or updated.
- **`create`** / **`delete`** — a Git ref (branch or tag) was created or deleted.
- **`fork`**, **`watch`**, **`public`** — the repo was forked, starred, or made public. Useful for integrations; not usually for CI.
- **`label`**, **`milestone`**, **`page_build`**, **`status`**, **`branch_protection_rule`**, **`registry_package`**, **`deployment`**, **`deployment_status`** — the less common events. Each triggers on a specific repository-level event; you reach for them by name when the use case calls.

### Scheduled events

- **`schedule`** — fires on a cron schedule, specified in POSIX cron syntax (`cron: '0 */6 * * *'`). The runner is still ephemeral; GitHub provisions it when the time matches. The schedule is skipped if the repo has been inactive for 60 days, which is one of the few GitHub Actions behaviors that surprises people in production.

### Manual events

- **`workflow_dispatch`** — a human (or script via the API or `gh workflow run`) manually triggers the workflow. The one you use when you want a button in the UI. Supports `inputs:` so you can parameterize the run from a form in the Actions tab.

### Cross-workflow events

- **`workflow_call`** — declares that *this* workflow can be called by *another* workflow. The entry point for reusable workflows, covered below.
- **`repository_dispatch`** — a webhook from outside GitHub (or from inside a workflow via the API) requests a workflow run. Lets external systems kick off CI.
- **`merge_group`** — a PR was added to the merge queue. The event that fires when the merge queue (covered in the [Rulesets post](/posts/github-rulesets-in-plain-language/#require-merge-queue)) wants to run checks on the queued state.

A workflow can declare many triggers at once:

```yaml
on:
  push:
    branches: [main]
    paths: ['src/**']
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch:
```

That workflow runs on pushes to `main` that touch `src/`, on every PR targeting `main`, every six hours, and on a manual button click. All four triggers compose; each fires independently.

## Jobs and steps

Underneath `jobs:` you declare one or more named jobs, each a map of its own keys:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: []
    if: ${{ github.event_name == 'push' }}
    strategy:
      matrix:
        node: ['18', '20', '22']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm ci
      - run: npm test
```

- **`runs-on`** — which runner this job executes on. Standard values are `ubuntu-latest`, `ubuntu-24.04`, `windows-latest`, `macos-latest`; self-hosted runners are referenced by their labels (`self-hosted`, or custom labels you have set).
- **`needs`** — a list of other job IDs this job depends on. Those jobs must succeed (or at minimum complete, with `if: always()`) before this job starts. The way you declare a DAG of jobs.
- **`if`** — a conditional expression. The job is skipped if it evaluates to false. Common patterns: `if: github.ref == 'refs/heads/main'` to run only on main, `if: github.event_name == 'pull_request'` to run only on PRs.
- **`timeout-minutes`** — kill the job after this many minutes. Default is 360 (six hours). Set a tighter value — most jobs that run for an hour are stuck, not slow.
- **`strategy`** — defines a *matrix* (see below) and controls parallelism (`fail-fast:` cancels sibling matrix jobs if one fails; `max-parallel:` caps simultaneous matrix jobs).
- **`environment`** — the named environment this job deploys to; gates on the environment's protection rules.
- **`concurrency`** — a job-level version of the top-level key; useful for serializing deploys without affecting the whole workflow.
- **`outputs`** — a map of outputs this job produces, which later jobs can reference via `${{ needs.<job-id>.outputs.<name> }}`. The idiomatic way to pass a value — a built version number, a container image tag — from one job to a dependent job.
- **`env`** — environment variables for every step in this job.
- **`defaults`** — defaults for every `run:` step in this job (shell, working directory).
- **`container`** — runs every step inside a container image you specify. Useful when every step needs the same custom toolchain and you do not want to install it in each step.
- **`services`** — additional containers to run alongside the job's primary runner (classic use: a Postgres service for integration tests).
- **`steps`** — the actual sequence of work.
- **`uses`** (as a job-level key) — call a *reusable workflow* instead of defining steps. The job's shape changes entirely; see below.

Inside `steps`, each item is either a `uses:` (an action) or a `run:` (a shell command). Their keys:

- **`id`** — a step identifier. Used so a later step can reference `${{ steps.<id>.outputs.<key> }}`.
- **`if`** — step-level conditional. Lets you skip a step without skipping the job.
- **`name`** — display name in the UI.
- **`uses`** — the action to run, versioned by tag, branch, or commit SHA (`uses: actions/checkout@v4` or `uses: actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675`). Pinning by SHA is more secure; pinning by major tag is more convenient; teams land on one convention and keep it.
- **`run`** — a shell command. Executed in the shell set by the step's `shell:` key (bash by default on Linux/macOS).
- **`shell`** — override the default shell for this step (bash, sh, pwsh, powershell, cmd, python).
- **`with`** — input parameters passed to the action in `uses:`.
- **`env`** — environment variables for this step only.
- **`continue-on-error`** — if true, failure of this step does not fail the job. The job's overall status becomes "success with issues," not "failure."
- **`timeout-minutes`** — per-step timeout.

A step runs; the job's workspace persists between steps; the runner is torn down between jobs unless they are matrix siblings sharing a strategy.

## The matrix strategy — one job, many configurations

A matrix lets you declare "run this job once per combination of these variables." The classic use is testing against multiple runtime versions:

```yaml
strategy:
  matrix:
    node: ['18', '20', '22']
    os: [ubuntu-latest, macos-latest]
```

That strategy produces six jobs — three node versions × two operating systems. Each job gets `${{ matrix.node }}` and `${{ matrix.os }}` set to its specific combination, and GitHub schedules them in parallel up to the account's concurrency limit.

Two keys most matrix workflows need:

- **`fail-fast`** — if true (the default), one failing matrix job cancels the siblings. Faster feedback, but you lose the signal of *which* configurations fail. Teams testing against many runtimes often set `fail-fast: false` so a Node 18 regression doesn't mask a Node 22 regression.
- **`include`** / **`exclude`** — tweaks that add specific combinations or remove them. "Also test Windows on Node 20 but not on 18 or 22" is an `include` entry; "skip macOS on 18" is an `exclude`.

The common misunderstanding: matrix jobs don't share state. Each one is a separate runner with a separate workspace. If your workflow needs the matrix jobs to produce a combined artifact, you have to upload per-matrix-job artifacts and have a *downstream* job (via `needs:`) download and combine them.

## Reusable workflows

A reusable workflow is a workflow that another workflow calls. The *called* workflow declares `on: workflow_call:` and lists its inputs and secrets; the *calling* workflow invokes it from a job via `uses:`.

```yaml
# .github/workflows/reusable-ci.yml
on:
  workflow_call:
    inputs:
      node-version:
        required: true
        type: string
    secrets:
      npm-token:
        required: true

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm test
        env:
          NPM_TOKEN: ${{ secrets.npm-token }}

# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  call-ci:
    uses: ./.github/workflows/reusable-ci.yml
    with:
      node-version: '20'
    secrets:
      npm-token: ${{ secrets.NPM_TOKEN }}
```

Reusable workflows live in the same repo (referenced by path) or in another repo (referenced by `uses: owner/repo/.github/workflows/name.yml@ref`). They are the right pattern once you have more than one workflow that would otherwise copy-paste the same jobs. The failure mode is over-abstraction: a reusable workflow with twelve inputs becomes harder to read than two duplicate workflows that each clearly state what they do. GitHub introduced these as a response to teams who were building their own templating layers on top of Actions ([GitHub Docs: reusing workflows](https://docs.github.com/en/actions/sharing-automations/reusing-workflows)); the right time to reach for one is the second time you catch yourself copying job YAML.

## Concurrency — one at a time, please

Concurrency controls how many copies of a workflow run can be in flight. Two typical shapes:

**Cancel outdated PR runs.** You push a new commit; the previous run on the same PR is now obsolete; concurrency cancels it. Save CI minutes and get fresh results.

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

**Serialize deploys without cancelling.** Only one deploy to production at a time, queued but not cancelled.

```yaml
jobs:
  deploy:
    concurrency:
      group: production-deploy
      cancel-in-progress: false
    ...
```

The common misunderstanding: concurrency groups are *strings*, not identifiers. If two different workflows accidentally use the same group name (`ci`), they will serialize across workflows, which is almost never what you want. Prefix with the workflow name or event: `${{ github.workflow }}-${{ github.ref }}`.

## Environments and protection rules

An **environment** is a named deployment target configured under **Settings → Environments**. A job declares `environment: production`, and the job cannot start until the environment's protection rules clear:

- **Required reviewers** — a specific person or team has to approve the deployment in the Actions UI before the job proceeds.
- **Wait timer** — the job waits a configurable number of minutes before starting, giving an on-caller time to abort.
- **Deployment branches and tags** — only workflows running from specific branches or tags can target this environment.
- **Allow administrators to bypass configured protection rules** — the familiar bypass toggle.

Environments also hold their own **secrets** and **variables**, available to jobs targeting them. The combination gives you the pattern most production teams want: *staging has no human gate, production requires a reviewer, each has its own set of credentials, and only the release branch can deploy to production*.

## What GitHub Actions does NOT solve

- **It is not free at scale.** Public repositories get unlimited minutes on standard runners. Private repositories get a monthly allowance that depends on the plan ([GitHub Billing: About billing for Actions](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions)). Teams who adopt Actions for everything and then self-host nothing often get surprised by the first invoice when they add a matrix of six OS × four runtime × fifteen integration tests × forty PRs a day.
- **It does not replace observability for your deployments.** A green workflow run means the workflow succeeded, not that the deployment is healthy. Logs disappear on the retention schedule; metrics do not exist unless you ship them somewhere; traces have to be instrumented separately. Treat workflow runs as *events*, not as the whole picture.
- **It does not solve supply-chain security by itself.** `uses: someone/action@v1` executes someone else's code in your repository with your `GITHUB_TOKEN`. Pinning by SHA, auditing the actions you depend on, and using `permissions:` to narrow the token are the baseline; see GitHub's [security hardening guide for Actions](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions) for the longer list.
- **It cannot run arbitrarily long jobs.** Six hours is the hard upper bound on a job on a GitHub-hosted runner. Workflows that train models, build large monoliths, or do multi-hour integration suites need self-hosted runners or a different pattern (break the work up, use a cloud batch system).
- **It is not an orchestrator.** Jobs run; the workflow completes; the runner is thrown away. If you need "a workflow that watches a queue and runs forever," you want a different tool. GitHub Actions is a *per-event* automation system, not a daemon.
- **It is not reproducible by default.** `ubuntu-latest` means "whatever Ubuntu GitHub decides to pin to this week." Images get updated, tools get bumped, defaults change. If a build must be reproducible, pin the runner image (`ubuntu-24.04` instead of `ubuntu-latest`), pin every action by SHA, and pin every language toolchain version. Otherwise your workflow's behavior drifts out from under you.

## Steelmanning the alternatives

**"Just use Jenkins / Buildkite / CircleCI."** For a team already running Jenkins with mature pipelines, migrating to Actions is a six-month project nobody asked for. These systems have more flexible scheduling, better self-hosted runner management (Jenkins especially), and in some cases better observability. The case for Actions is tightest-integration-with-GitHub, cheap-start, and no infrastructure to run. The case against is "we already have one working, and the migration cost is real."

**"Just use GitLab CI."** GitLab's CI story is in some ways tighter than GitHub's — the configuration lives at the project root, the UI is less busy, and `include:` beats `uses:` for everyday composition. If your code is on GitHub, this is a non-option. If you have a choice of forge, GitLab CI is a legitimate alternative that newcomers often prefer the ergonomics of.

**"Just use a shell script in a cron job."** For a workflow that runs on your own hardware once a day and does not need to react to repo events, this is often the right answer. The friction of writing a workflow for "cron this" has not fallen below the friction of writing a crontab line. Reach for Actions when the trigger is a repository event; stick with cron when the trigger is a wall-clock time *and* the host already exists.

**"Just use someone else's released binary."** For many of the things workflows do — formatting, linting, release-cutting — a well-maintained CLI (`golangci-lint`, `prettier`, `goreleaser`) is more portable than a workflow that invokes it. The workflow is still the right place for the orchestration; it just does not need to re-implement what the tool already does. One frequent anti-pattern is a 200-line workflow that is really "install Node, call `npx release-it`" with everything else being ceremony.

## The one thing to take away

If you take one idea from this post: **a workflow is a declarative description of what to do when a specific event happens, and the hard parts are picking the right event and keeping the YAML short enough that someone six months from now can read it.** Open any workflow in any repository you own and read it top-to-bottom asking "what event, what work, what permission." If you cannot answer those three in one sentence per job, the workflow is too long.

The next and final post in this series moves away from CI and over to GitHub Projects — specifically, the three overlapping layers of automation that keep a project board in sync with the issues and PRs it is supposed to reflect. Continue with [GitHub Projects automation in plain language](/posts/github-projects-automation-in-plain-language/).

## Where to read more

- **[GitHub Docs: Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions)** — the full YAML reference. Dense; the right place to look up a specific key.
- **[GitHub Docs: Events that trigger workflows](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows)** — every trigger with its payload shape. Essential when you are not sure which filter keys an event supports.
- **[GitHub Docs: Security hardening for GitHub Actions](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)** — the page every team adopting Actions should read before writing their third workflow.
- **[GitHub Blog: Keeping your GitHub Actions and workflows secure](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/)** — the specific attack class around `pull_request_target`, explained by the GitHub security team.
- **[GitHub Marketplace](https://github.com/marketplace?type=actions)** — the catalog of published actions. Useful; also a reminder that you are executing other people's code in your workflow and should pin accordingly.
