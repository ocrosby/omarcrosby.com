+++
title = "GitHub repository settings in plain language"
date = "2026-10-20T05:55:00-04:00"
draft = false
description = "A jargon-free walkthrough of every section under a GitHub repository's Settings tab — what each option actually controls, which ones most teams get wrong, and the ones that matter more than they look."
summary = "A plain-language walkthrough of every section under a GitHub repository's Settings tab — what each option actually controls, which ones most teams get wrong, and the ones that matter more than they look."
tags = ["github", "repository-settings", "devops", "fundamentals", "workflow-automation"]
categories = ["Fundamentals"]
series = ["GitHub in Plain Language"]
ShowToc = true

[cover]
image = "/images/og/github-repository-settings-in-plain-language.png"
hiddenInList = true
hiddenInSingle = true
+++

*Part 1 of a four-part series. Up next: [Rulesets in plain language — every option explained](/posts/github-rulesets-in-plain-language/), then [GitHub Actions workflows in plain language](/posts/github-actions-workflows-in-plain-language/), and [GitHub Projects automation in plain language](/posts/github-projects-automation-in-plain-language/).*

The first time a teammate asked me *"how do I make this branch undeletable"*, I opened the repository's Settings tab, scrolled, scrolled again, got distracted by **Danger Zone**, scrolled back up, and finally found what I was looking for three menus deep under a heading I had never read before. The feature had been there the whole time. I had just never looked.

That is the shape of GitHub's Settings tab for most people. It is a wall of sections, each of them meaningful, most of them unexamined, and the ones that get the most clicks — *rename repository, change visibility, add a collaborator* — are not the ones that compound a team's workflow over a quarter. *The single most useful question to ask about repository settings is: which of these controls would prevent a real incident I've already had, and which are vanity knobs?* Teams that walk through the tab once, deliberately, with that question in mind end up turning on four or five things that pay for themselves within a month.

This post is a plain-language tour of the whole tab, section by section, in the order GitHub itself lists them. For each one I will say what it controls, who typically owns the decision, and the one thing people most often get wrong about it. The deepest section — **Rules** — gets its own post, because it deserves one.

A note on scope: GitHub's Settings UI differs slightly depending on whether the repository is owned by a user or an organization, and some sections only appear on Team, Enterprise, or GitHub Advanced Security plans. I will call those out as we go, but if a section is not in your sidebar, that is usually why.

## Where to find the Settings tab

Open any repository and look at the tab row above the file list: **Code**, **Issues**, **Pull requests**, **Actions**, **Projects**, **Security**, **Insights**, **Settings**. You need admin permission on the repository to see **Settings** at all — collaborators with only write access do not. If the tab is missing, that is why. (This surprises people who were just added to a repo and expect to turn things on themselves; it is also one of the most common reasons a team's "turn on branch protection" ticket stalls.)

Everything that follows lives under that tab.

## General

The landing page. Four or five visually dense blocks of settings, most of which never need to change after the repository is created.

- **Repository name and description** — the name is the slug in the URL (`github.com/<owner>/<repo>`); the description is the one-liner that appears next to the name in search results and on org pages. Both are editable; renaming the repository auto-redirects the old URL to the new one, which is a lifesaver when the first name was aspirational and the second name is accurate.
- **Social preview** — a 1280×640 image used when someone shares the repository URL on Slack / X / LinkedIn / iMessage. Default is a generic card with the repo name; a custom one is the easiest 30-minute brand win most teams never take.
- **Features** — toggles for Wikis, Issues, Discussions, Projects, and Preserve this repository (Arctic Code Vault). Turning off **Issues** when you track work elsewhere (Linear, Jira) stops a long tail of "I filed a bug in GitHub Issues; nobody saw it" incidents. Turning on **Discussions** is cheap and gives you a long-form forum attached to the repo without wiring any third-party tool.
- **Pull Requests** — merge-button options: **Allow merge commits**, **Allow squash merging**, **Allow rebase merging**. Also the message templates for each (**Default commit message**, **Pull request title and description**, etc.) and the two auto-cleanup toggles **Always suggest updating pull request branches** and **Automatically delete head branches** after merge. The last one is the single most frequently overlooked quality-of-life setting on the entire tab — a repo without it accumulates hundreds of stale feature branches that nobody dares delete.
- **Archives** — **Include Git LFS objects** when the repository is downloaded as a zip. Only relevant if you use Git LFS; harmless to leave at default otherwise.
- **Pushes** — **Limit how many branches and tags can be updated in a single push**, a defense-in-depth against mistakes like `git push --mirror` on the wrong remote.
- **Danger Zone** — the one block most people are afraid of and should be. Change visibility, change default branch, disable features, transfer ownership, archive, and delete. **Archive** marks the repo read-only without deleting it, which is often what people want when they say "retire this repo." **Delete** is final.

## Collaborators (or Collaborators and teams, for org-owned repos)

Who has what level of access to the repository. Personal repos get a simple **Collaborators** list. Organization-owned repos get **Collaborators and teams** with the [five role levels GitHub standardized on in 2020](https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization):

- **Read** — can clone and pull.
- **Triage** — read plus the ability to manage issues and pull requests (label, assign, close) without pushing code.
- **Write** — the default for most team members; push to non-protected branches and open pull requests.
- **Maintain** — write plus the ability to manage *some* repo settings (not security-critical ones).
- **Admin** — the whole tab, including Danger Zone.

The common misunderstanding: **Triage** and **Maintain** exist specifically so you do not have to give someone **Admin** just because they need one extra capability. Over-privilege is cheap to grant and expensive to audit; use the narrower role.

Teams, if your org has them, inherit permission through nesting — a parent team's access cascades to child teams unless overridden. This is helpful once you have more than ten people in a repo, actively confusing before that.

## Code and automation

This is the section the user who asked *"how do I make this branch undeletable"* was looking for, and it has grown considerably over the last three years as GitHub has pulled more platform features into one roof.

### Branches

Legacy branch protection rules. One rule per branch name pattern, several options per rule (require PR, required reviewers, required status checks, require signed commits, require linear history, require conversation resolution, lock branch, block force pushes, restrict who can push). Still fully supported; still what most tutorials and screenshots show.

Branch protection rules do not compose: only *one* rule applies to a given branch at a time, and if two rules both match, the most specific pattern wins. For teams that find this too simple, GitHub introduced a successor — Rulesets — in 2023. The next post in this series is entirely about Rulesets; if you are reading tutorials from before mid-2023, they are all describing this older system.

### Tags

The same idea for Git tags. Who can create or delete tags matching a pattern. The most common use case: lock `v*` tags so only the release workflow (via a GitHub App or a specific user) can push them, preventing a human from accidentally tagging the wrong commit as a release.

### Rules

The newer, more flexible system. **Rulesets** are named restrictions on branches or tags that can target several branches at once, compose with other rulesets, and be put into an **Evaluate** mode that logs what *would* have been blocked without actually blocking anything. The whole next post is about this section — see [Rulesets in plain language](/posts/github-rulesets-in-plain-language/).

### Actions

Everything about how the repository runs GitHub Actions workflows. The two most consequential blocks:

- **General** — whether Actions is enabled at all, whether workflows from forked repositories can run without approval, and the **Workflow permissions** block that controls what the automatically-provided `GITHUB_TOKEN` is allowed to do. The default on repositories created from early 2023 onward is **Read repository contents and packages permissions**, [documented in GitHub's workflow permissions guidance](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#modifying-the-permissions-for-the-github_token), tightened from the previous read-and-write default after a wave of supply-chain incidents where a compromised dependency could push to the repo it ran in. Review this setting on any repo that pre-dates that change; the old default is still live on repos created before it.
- **Runners** — self-hosted runners you have attached to this repo. Only relevant if you run Actions on your own hardware; empty for everyone else.

### Webhooks

HTTP endpoints that GitHub calls when something happens in the repository: push, pull request opened, issue commented, release created, and dozens more. Used to notify Slack / Discord / your own CI system / your deployment tool from outside the GitHub Actions world. Each webhook has a URL, a secret for signature verification, a content type, and a filter for which events to send. Pre-dates GitHub Actions by a decade and is still how most third-party integrations work.

The common misunderstanding: when Actions and a webhook could both do the job, prefer the webhook *out* and the action *in*. Pushing a notification to an external system is a webhook's natural shape. Pulling something external *into* the repository (bump a version, open a PR, update a file) is a workflow's natural shape.

### Environments

Named deployment targets — `production`, `staging`, `preview`, whatever your team names them — each with its own set of secrets, variables, and optional **protection rules**: required reviewers, wait timer, allowed branches. A workflow references an environment with `environment: production`, and the deployment pauses until the protection rules clear.

The most common misunderstanding: environments are not a container concept, a cloud concept, or a Kubernetes concept. They are a *GitHub* concept — a bundle of config and gates that a workflow can declare it is deploying to. The actual deployment target can be AWS, Fly.io, your laptop, or no deploy at all. The environment just names it and gates workflow access to its secrets.

### Codespaces

If your organization uses GitHub Codespaces (cloud dev environments), this is where you set repository-level secrets and machine-type permissions. Skip if you do not.

### Pages

The toggle and configuration for GitHub Pages — static hosting that serves either the `/docs` folder on a branch, a dedicated `gh-pages` branch, or the output of a GitHub Actions workflow. If your project ships documentation on `*.github.io`, this is the page that controls it. Custom domain and HTTPS enforcement are the two settings worth checking.

### Custom properties (org-owned repos only)

Key-value labels an organization administrator defines centrally. Lets ops teams tag repositories by cost center, data classification, service tier, etc., and reference those tags from org-level rulesets ("apply this ruleset to every repo tagged `tier=1`"). Only exists on organization-owned repositories, only visible to admins.

## Security

Everything that would show up on the **Security** tab's dashboard, except configured from the settings side.

### Code security

Umbrella block for GitHub's security features. Which of these show up depends on your plan:

- **Dependency graph** — GitHub parses your lockfiles and tells you which direct and transitive dependencies you have. Free on public repos. The feature everything else here depends on.
- **Dependabot alerts** — GitHub notifies you when a dependency has a known vulnerability. [Free on public and private repos](https://docs.github.com/en/code-security/dependabot/dependabot-alerts/about-dependabot-alerts) as of 2022. Turning this off is almost never the right answer.
- **Dependabot security updates** — automatic PRs that bump vulnerable dependencies to a safe version. Opt-in because the PRs can be noisy; worth the noise for most teams.
- **Dependabot version updates** — automatic PRs that bump dependencies to their latest version on a schedule, independent of any vulnerability. Configured via `.github/dependabot.yml`. Different setting; same bot.
- **Code scanning** — static analysis via CodeQL (or a third-party scanner, configured as a workflow) that flags insecure code patterns on every push and PR. Free on public repos; **requires GitHub Advanced Security** on private repos.
- **Secret scanning** — automatic detection of API keys, tokens, and credentials committed to the repo, with partner notifications so a leaked AWS key can be revoked at AWS before an attacker uses it. Free on public repos; **requires GitHub Advanced Security** or **Secret Protection** on private repos.
- **Push protection** — the preventive form of secret scanning. Instead of alerting after a secret is pushed, it blocks the push at the server. Enable this if your plan supports it; it is the single highest-leverage security switch on the whole tab.

### Deploy keys

SSH keys scoped to a single repository, used by automated systems (CI runners, deploy scripts, servers) that need to pull or push without being tied to a human user's account. Each key is read-only by default; a checkbox grants write access. Mostly a legacy workflow — modern setups use GitHub Apps or OIDC-federated tokens — but deploy keys are still the simplest way to give a server read-only pull access without a Personal Access Token.

### Secrets and variables

Named values your workflows can read. The split between the two matters:

- **Secrets** are redacted from logs and only readable *inside* a workflow run. Appropriate for API tokens, passwords, deploy credentials.
- **Variables** are plain-text, visible to anyone with read access to the repo (via the Settings UI; still only readable inside a workflow run). Appropriate for configuration — region names, feature flags, non-sensitive URLs.

Three scopes exist:

- **Actions** — read by GitHub Actions workflows.
- **Codespaces** — read by Codespaces when it provisions a dev environment.
- **Dependabot** — read by Dependabot when it clones to update dependencies (needed only if your `dependabot.yml` reaches a private registry).

The common misunderstanding: a secret used from a fork pull request will *not* be sent to the workflow by default — this is deliberate, to stop a malicious PR from exfiltrating credentials. If your workflow needs them, use `pull_request_target` carefully and read [GitHub's own security guidance](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions) before you do.

## Integrations

### GitHub Apps

A list of the GitHub Apps installed on this repository — Dependabot, your CI/CD provider, your bug tracker's integration, your Slack bridge, etc. Each one gets a scoped set of permissions when installed; this page lets you review and remove them. If you have ever wondered "what is talking to my repo on my behalf," this is the answer.

### Email notifications (user-owned repos) / Notifications (org-owned repos)

Which commits, pushes, and events generate email to which addresses. Mostly set-and-forget.

### Autolink references

Rules that convert strings in commit messages, PR descriptions, and issue bodies into clickable links. The classic example: `JIRA-123` → `https://yourcompany.atlassian.net/browse/JIRA-123`. One of the quietly most-useful settings for teams that work across GitHub and a ticket tracker.

## Moderation (org-owned public repos)

Mostly relevant for maintainers of open-source projects. **Interaction limits** temporarily restrict who can comment or open issues (useful when a thread goes off the rails). **Code review limits** restrict who can review PRs. **Reported content** shows what has been reported for TOS violations. **Users** lists blocked users. The entire section is "I need to turn down the heat on a hostile thread without closing the repo" — most private corporate repos never touch it.

## What this tab does NOT do, specifically

Being honest about the boundary of a settings page is what makes recommending any of its options trustworthy. The Settings tab is a strong lever for *this repository's configuration* and nothing else. In particular:

- **It does not configure your CI/CD system.** Workflow files in `.github/workflows/` do. The **Actions → General** page lets you *turn Actions on or off*, control what the token can do, and manage runners — but the actual *workflow logic* lives in the YAML, not here. Hunting for a feature flag in Settings when the knob is a `with:` key in a workflow file is a recurring source of confusion.
- **It does not configure your organization.** Many of the settings most teams want ("every repo must require signed commits," "every repo must enable push protection") live at the *organization* level, under the org's Settings tab, not the repo's. The repo's tab only configures *this one repo*. Organization-level rulesets, security policies, and default settings are a different conversation; the GitHub docs on organization management ([Managing organization settings](https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories)) cover them.
- **It does not back up your code.** Archiving a repository marks it read-only on GitHub; it does not take a copy you own. If GitHub is your only copy of a repo, you do not have a backup — you have a hosting provider. Mirror critical repos to a second host or to a scheduled export.
- **It does not stop a repo admin from undoing anything on it.** Every setting on this page is reversible by anyone with the Admin role. Protection against the admin role itself lives at the organization level (via SSO, SCIM, and org-level rulesets), not here.
- **It is not a substitute for a security review.** Flipping switches on the Code security section does not amount to a security review, a threat model, or a compliance audit. These controls raise the floor; they do not raise the ceiling. Teams that treat "turned on all the dots in Settings" as sufficient are often the ones who are most surprised by their first real incident.

## Steelmanning the alternatives

Not every team should spend an hour clicking through Settings.

**"Just use the defaults."** For a public, personal project with no sensitive data and no team, this is often correct. The defaults are safe; the extra work of tuning them is a tax that will not pay back on a one-person side project. The case against this grows the instant a second collaborator joins or any non-public data is in play.

**"Just use Terraform / Pulumi to configure everything as code."** For an organization running more than a dozen repositories, this is the professional answer — [`integrations/terraform-provider-github`](https://registry.terraform.io/providers/integrations/github/latest/docs) treats every setting on this tab as a Terraform resource, which means your repo config is reviewable, auditable, and reversible. The failure mode is the ramp: adopting Terraform for one repo is more work than it saves, and the Terraform provider does not cover every single setting the UI exposes.

**"Just use GitHub Enterprise's policy features and ignore the per-repo tab."** On Enterprise, admins can set org-wide and enterprise-wide policies that pre-empt most of what this post describes. The per-repo tab becomes a view onto a smaller surface. If you are on Enterprise, learn the policy hierarchy *first* and the per-repo tab second; most of the per-repo answers may already be dictated at a higher level.

## The one thing to take away

If you take one idea from this post: **the Settings tab is a layered defense against the mistakes your team hasn't had yet, and the right time to click through it is before the first incident forces you to.** Open any repo you own, open the tab, and spend thirty minutes reading it as if for the first time. Four or five toggles will stand out as free wins; one or two will reveal a mental model you had not realized was wrong.

The post that follows this one walks through **Rules** in the depth it deserves — because the single most valuable section on the whole tab is also the one most teams never fully understand. Continue with [Rulesets in plain language — every option explained](/posts/github-rulesets-in-plain-language/).

## Where to read more

- **[GitHub's own repository settings documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features)** — the authoritative index. Dry, dense, worth it as a reference.
- **[GitHub's security hardening guide for Actions](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)** — the one page every team adopting Actions should read before writing their third workflow.
- **[`integrations/terraform-provider-github`](https://registry.terraform.io/providers/integrations/github/latest/docs)** — the config-as-code path when the UI becomes the bottleneck.
- **[The GitHub Blog](https://github.blog/)** — ongoing commentary from the team that owns these settings, usually explaining *why* the defaults changed when they did.
