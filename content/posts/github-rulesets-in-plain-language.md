+++
title = "GitHub rulesets in plain language — every option explained"
date = "2026-10-20T05:56:00-04:00"
draft = false
description = "A plain-language, option-by-option tour of GitHub Rulesets — what each rule actually blocks, how multiple rulesets layer on the same branch, how Evaluate mode lets you preview a rule before enforcing it, and the gotchas most teams only find out about the hard way."
summary = "A plain-language, option-by-option tour of GitHub Rulesets — what each rule actually blocks, how multiple rulesets layer on the same branch, how Evaluate mode lets you preview a rule before enforcing it, and the gotchas most teams only find out about the hard way."
tags = ["github", "rulesets", "branch-protection", "devops", "security", "workflow-automation"]
categories = ["Fundamentals"]
series = ["GitHub in Plain Language"]
ShowToc = true

[cover]
image = "/images/og/github-rulesets-in-plain-language.png"
hiddenInList = true
hiddenInSingle = true
+++

*Part 2 of a four-part series. Start with [Repository settings in plain language](/posts/github-repository-settings-in-plain-language/); continue with [GitHub Actions workflows in plain language](/posts/github-actions-workflows-in-plain-language/) and [GitHub Projects automation in plain language](/posts/github-projects-automation-in-plain-language/).*

A platform engineer I know turned on **Require signed commits** across every production repo one Friday afternoon. He had done it on his own test repo first, confirmed his commits still worked, confirmed the GitHub Actions-generated commits still worked, and merged his first PR against the newly-protected `main` without incident. On Monday morning, four other engineers could not push, two automation accounts had locked themselves out, and the Dependabot bot had opened eleven PRs that none of them could merge because the Dependabot commits were "verified by GitHub" rather than signed. The feature worked exactly as advertised. The configuration was correct. The team was still blocked for most of a day sorting it out.

That is the characteristic shape of a ruleset mistake: nothing is broken, nothing is wrong, and nothing — in isolation — is misconfigured. A rule just blocks a workflow nobody thought to check. *The single most useful question to ask about any rule you are about to turn on is: which of the pushes, PRs, merges, or automation runs that currently succeed would this have blocked yesterday?* Every option in this post answers that question for a specific class of push.

GitHub introduced **Rulesets** in 2023 ([GitHub Docs: About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)) as the successor to the older **Branch protection rules**. Both still exist; both still work. Rulesets are more flexible — multiple of them can apply to the same branch, they can target several branches at once, they can be put into a *dry-run* mode called **Evaluate**, and they live under the newer **Rules** section of the repository Settings tab, rather than the **Branches** section where branch protection rules live. This post walks through every option in a ruleset in the order the UI presents them, in plain language, with the common mistake flagged for each.

If you have never clicked **Settings → Rules → New ruleset** before, that is the right place to open now. The rest of this post is a reading map for that page.

## What a ruleset actually is

A **ruleset** is a *named* set of restrictions that applies to one or more branches, tags, or push targets in a repository (or across many repositories, if you configure it at the organization level). From the outside, it looks like a form with a dozen checkboxes. The useful mental model is three layers stacked on top of each other:

1. **Target** — which branches, tags, or pushes does this ruleset apply to.
2. **Enforcement status** — is the ruleset active, logging-only, or off.
3. **Rules** — the list of individual restrictions that fire when the target matches.

Any one of those three layers can neutralize the ruleset. A ruleset with the right rules but no target does nothing. A ruleset with the right target but **Disabled** does nothing. A ruleset in **Evaluate** mode does something — it writes an audit log line — but it does not actually *block* anyone. Teams who adopt rulesets without understanding the layer-stack often spend the first week debugging a ruleset that is "on" but silent, or "configured" but off.

Three structural properties of rulesets, each of which differs from the older branch protection system:

- **Rulesets stack.** You can have up to 75 rulesets per repository, and more than one of them can match the same branch at the same time. When they do, their rules are *combined*, and if the same rule is defined in two different ways (one requires 1 approval, another requires 2), **the most restrictive version wins** ([GitHub Docs: About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)). Branch protection rules do not do this — only *one* branch protection rule applies to a branch at a time, and if two match, the most-specific pattern takes over and the other is ignored.
- **Rulesets have an Evaluate mode.** You can turn one on without blocking anything, let it run for a week, read the audit log to see what *would* have been blocked, and then flip it to **Active** once you are confident. Branch protection rules have no equivalent.
- **Rulesets are visible to non-admins.** Anyone with read access on a repo can view the active rulesets in the Rules UI. On branch protection rules, only admins can see the configuration. This is why rulesets are the better default for teams that want contributors to understand *why* their push was rejected.

A ruleset is also *typed* — the first choice when you create one is between a **Branch ruleset**, a **Tag ruleset**, and a **Push ruleset**. Different types expose different rules, and the targeting form is slightly different for each. Everything that follows is in the order the UI presents.

## Ruleset Name, Target, and Enforcement — the top of the form

Before you get to any individual rule, three fields set up the whole thing.

### Ruleset name

Just a label. Chosen so a future reader of the Rules tab can tell at a glance what the ruleset is for. Teams often default to the targeted branch (`main`) — this is a mistake once you have more than one ruleset. Prefer "require review and tests on main," "signed commits only for release branches," "block large binary pushes." Names are free; collisions with other rulesets are not.

### Enforcement status

Three options, and the difference between them is the entire difference between a ruleset that works and one that silently does nothing.

- **Active** — the ruleset is enforced. A push or PR that violates any of its rules is rejected at the server. This is the production setting.
- **Evaluate** — the ruleset is logged but not enforced. Pushes and PRs that *would* have been rejected are instead recorded in the repository's audit log as evaluation events. The push still succeeds. This is the dry-run / observation mode, and it is the right default for every ruleset you have never deployed before. Watch the audit log for a week, see what you catch, then flip to Active once the surprises are gone. ([GitHub Docs: Managing rulesets for a repository](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/managing-rulesets-for-a-repository))
- **Disabled** — off. Still present in the Rules list, still editable, but doing nothing. Useful for parking a ruleset you plan to turn back on later without re-creating it.

The common misunderstanding: **Evaluate** is not the same as **Disabled**. Evaluate still *writes to the audit log* for every match. If you want to know which of your historical pushes would have violated a proposed rule, Evaluate for a week is the cheapest answer you will ever get.

### Bypass list

Who is allowed to break the rules in this ruleset. You can grant bypass to users with specific repository roles (write, maintain, admin), to specific GitHub Teams, to specific GitHub Apps, or to **repository admin** as a group. For each entry you also pick a bypass *mode*:

- **Always** — the entry can bypass the rules on any push, directly.
- **For pull requests only** — the entry can bypass the rules *through a pull request* (the PR shows a "bypass requested" button), but cannot bypass on a direct push. This lets reviewers approve an exception without granting a standing "push to main whenever you like" permission.

The common misunderstanding: adding yourself to the bypass list is almost never the right fix for "the rule blocked my push." If a rule needs to block *most* pushes but allow a specific class of push (a release-automation account, Dependabot, a scheduled Action), bypass is the right tool. If a rule is blocking a kind of push you actually wanted to allow, the rule itself is wrong, not the bypass list.

### Target branches / tags / pushes

For branch and tag rulesets, this is the pattern-match that decides which refs the ruleset covers. The UI gives you three options:

- **All branches** / **All tags** — every branch or tag in the repo.
- **Default branch** — a convenience shortcut for the branch that `HEAD` points at. The ruleset follows if the default branch is later renamed.
- **Include by pattern** / **Exclude by pattern** — [fnmatch](https://docs.python.org/3/library/fnmatch.html)-style patterns, so `main`, `releases/**`, `v*.*.*`. You can combine includes and excludes to carve out exceptions.

For push rulesets, there is no target to pick — a push ruleset applies to every push to the repo, which is the whole point of its type. (Push rulesets are only available for private and internal repositories, and when configured at the organization level they apply across every forked copy of a repo, which is a separate feature worth knowing about.)

The common misunderstanding: patterns are *globs*, not regular expressions. `release.*` means "a branch literally named `release.`something" (dot is literal), not "a branch starting with `release`." Use `release*` or `release/**`. People familiar with regex trip on this every time; the official docs call it out explicitly.

## The branch and tag rules, in the order the UI shows them

What follows is the full list of rule checkboxes you see when you click **Add rule** on a branch or tag ruleset. Each one has a one-line what it does, a sentence or two on how to think about it, and the common misunderstanding flagged.

### Restrict creations

**What it does:** Only users on the bypass list can *create* a new branch or tag whose name matches the target pattern.

**When to use it:** Lock down the shape of your branch namespace. A common pattern: a ruleset targeting `releases/**` with Restrict creations on, so only your release workflow can open a new release branch — nobody is going to accidentally `git push origin releases/wrong-name` and mint a half-configured release branch.

**Misunderstanding to flag:** This rule does not prevent updates to an existing branch. If `releases/v1` already exists, Restrict creations does not stop anyone from pushing to it — that is **Restrict updates**, below.

### Restrict updates

**What it does:** Only users on the bypass list can *push to* an existing branch or tag whose name matches the pattern.

**When to use it:** Fully lock a branch — e.g., `releases/v*` branches once a release is cut, so no further commits can be added to a shipped release line. Also the right rule for "nobody can push directly to main; everyone must go through a PR" — in that configuration, the merge is itself an update, but you also set up a PR requirement (below) to allow it in that one shape.

**Misunderstanding to flag:** On its own, Restrict updates blocks *all* pushes including PR merges. You almost always pair it with a bypass permission for your merge automation, or with a different rule like **Require a pull request before merging**, which permits the specific shape of update you *do* want.

### Restrict deletions

**What it does:** Only users on the bypass list can delete a branch or tag matching the pattern.

**When to use it:** Prevent accidental `git push origin --delete main`. On by default for new branch rulesets; worth leaving on for every production branch regardless of what else the ruleset does.

**Misunderstanding to flag:** Deleting a branch locally and failing to push the deletion is unrelated — this rule governs the server-side deletion, not what you do in your own clone.

### Require linear history

**What it does:** Rejects any merge *commit* on the targeted branch. Only squash merges and rebase merges are accepted; "Create a merge commit" from the PR UI is refused.

**When to use it:** When you want `git log --oneline main` to read as a single straight line of commits with no fork-join points. Teams that use `main` as a shippable, bisectable history love this; teams that treat `main` as an archive of every merge do not.

**Misunderstanding to flag:** This rule does not forbid *merging*. It forbids one specific *shape* of merge — the two-parent merge commit. Squash and rebase merges are allowed because they produce a single-parent commit on the target branch. The option **Allowed merge methods** on **Require a pull request before merging** is a different control; the two interact and you often configure both.

### Require merge queue

**What it does:** Changes merging on the branch from "whoever hits the button" to "the GitHub-managed queue decides." The queue picks the next PR in line, re-runs the required status checks against the *merged* state (your PR plus any PR that was merged ahead of it), and only merges if the checks pass. Also lets you merge PRs in small batches.

**When to use it:** On high-traffic branches where PRs are passing CI individually but breaking main because they interact. The classic "A and B each pass tests, but merging A then B produces a conflict or regression" problem; the merge queue serializes the risky part. Became [generally available in 2023](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/managing-rulesets-for-a-repository).

**Misunderstanding to flag:** The merge queue is not free. It serializes merges, which caps your throughput at "one PR every (longest-required-check) minutes" unless you configure the group-size option. For most teams, below a hundred-ish PRs per day on a given branch, the queue is overkill — the first time it is clearly worth it is when you can measure the "pass individually, break together" failure.

### Require deployments to succeed before merging

**What it does:** Blocks a PR merge until the PR has been successfully deployed to one or more named **environments** (configured on the Environments page under Settings).

**When to use it:** When your workflow is "deploy to staging first, then merge to main." The rule enforces that the PR has actually hit staging and the staging deployment succeeded, not just that the PR's tests passed. Pairs naturally with environments that have manual-approval protection rules.

**Misunderstanding to flag:** This rule depends on your deployment job writing a GitHub Deployment record (via the Deployments API or the `actions/github-script` action) and marking it successful. Teams who deploy out-of-band (a shell script on a laptop) and never write a Deployment record will find this rule blocks their PRs forever with no obvious error. Wire the deployment event into the workflow before turning this rule on.

### Require signed commits

**What it does:** Every commit pushed to the branch must have a verified cryptographic signature (GPG, S/MIME, or SSH signing via Git 2.34+).

**When to use it:** When your threat model takes commit authenticity seriously — regulated industries, open-source projects that have been targets of commit-impersonation attacks, any repo where the identity on `git log` has to be trustworthy without further verification. The feature itself is explained in GitHub's [signing-commits docs](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits).

**Misunderstanding to flag:** This is the rule from the opening of this post. Automation accounts (bots, CI runners, Dependabot) need to be set up to sign too, or they stop working the day you turn the rule on. GitHub's own browser-generated commits ("verified by GitHub") *are* considered signed and will pass; locally-generated commits from someone without GPG or SSH signing configured will not. The right rollout is: **Evaluate** mode for a week, read the audit log, make sure every account that commits to the branch has signing set up, *then* flip to **Active**.

### Require a pull request before merging

**What it does:** Blocks every direct push to the branch. Changes only land via a merged pull request. This is the rule that implements "no commits straight to main."

Sub-options once you check the parent box:

- **Required approvals** — number of approving reviews required. Zero is allowed, which may surprise you — zero approvals plus the parent rule still means every change goes through a PR, but with no human having to approve it; useful for solo repos where you want PR hygiene without blocking yourself.
- **Dismiss stale pull request approvals when new commits are pushed** — if the author pushes a new commit after the review, the previous approval is dismissed. Prevents the "approve the clean version, then sneak a change in" pattern.
- **Require review from Code Owners** — if a PR touches files owned by someone in `.github/CODEOWNERS`, that owner must approve. If `CODEOWNERS` is missing or malformed, this rule is a silent no-op; verify the file renders in the UI before relying on this.
- **Require approval of the most recent reviewable push** — the most recent change pushed to the PR must itself be approved by someone *other than the author*. Prevents a reviewer from approving an early version and the author sneaking in a different one.
- **Require conversation resolution before merging** — every PR comment thread must be marked "resolved" before merge. Reviewers who leave a comment and then approve without resolving it will block the merge; some teams love this, some teams find it annoying for drive-by nitpicks.
- **Require even number of approving reviews** / **Request pull request review from Copilot** — newer options that may or may not be in your plan. The Copilot one asks GitHub's AI to pre-review each PR; whether it is useful or noise depends on the kind of code you ship.
- **Allowed merge methods** — tick the ones you want (**Merge commit**, **Squash**, **Rebase**). Teams that have decided on "squash only" lock the method here instead of relying on reviewer discipline.
- **Automatically request review from the last pusher's team** — if someone pushes a new commit, a review request goes out automatically. One of those small quality-of-life gains that only matters once you have a few hundred PRs a month.

**Misunderstanding to flag:** This rule does not require tests to pass. For that, you want **Require status checks**, below. The two are nearly always configured together, but they are separate checkboxes; turning on only the PR requirement will give you an audit trail without a correctness gate.

### Require status checks to pass

**What it does:** Named CI checks must have reported "success" on the PR's head commit before the merge is allowed. The list of required checks is a hand-picked set — you add them by their *name* (as reported in the Checks tab), not by workflow file name.

Sub-options:

- **Require branches to be up to date before merging** — the PR branch has to have the latest commits from the base branch merged in, so the checks are running against a state that reflects what would land. This is the "strict" option. If the base branch moves quickly, this creates a treadmill where every PR needs a merge-forward before merging. The non-strict version runs the checks against the PR's current state and is more lenient.
- **Do not require status checks on creation** — a PR's checks are not required on the first commit (because nothing has run yet), only once the checks have reported in. Mostly a quality-of-life setting; the main case where it matters is new-branch rulesets.

**Misunderstanding to flag:** A required status check that *never runs* will block merges forever. If you require `test` as a status check and your workflow does not produce a job named `test` (or does, but only on specific paths that this PR did not touch), the merge will wait on a check that will never report. Verify every required check actually fires on at least one PR before you add it.

### Block force pushes

**What it does:** Rejects any push with `--force` or `--force-with-lease` on the targeted branch.

**When to use it:** Always, for every production branch. Enabled by default on new branch rulesets. Force pushes rewrite history, which breaks any ref pinned to a commit that was in the old history (deployment, cache, downstream clone).

**Misunderstanding to flag:** Force-pushing to your own PR branch is fine and does not touch this rule — this rule governs force pushes to the *targeted* branches. If your target is `main`, developers can still rebase and force-push their feature branches. If your target is `releases/**`, developers lose the ability to rebase release branches, which is usually the desired outcome.

## The code-security rules — only visible if your plan includes them

These rules sit alongside the branch-and-tag rules in the same UI, but they only appear on repositories where the relevant GitHub Advanced Security features are available (free on public repos, additional cost on private repos). Each one gates merges on the output of a GitHub-managed analysis.

### Require code scanning results

**What it does:** Blocks a PR merge if the configured code scanner (CodeQL by default, or a third-party scanner configured as a workflow) has not completed, has failed to run, or has reported alerts at or above a severity threshold you choose.

**When to use it:** When your team has committed to "no critical static-analysis finding ships to main" and you want that commitment enforced at the merge button, not just as a nag on the PR. You pick which tools' output counts and which severity bar triggers the block.

**Misunderstanding to flag:** Code scanning is not a replacement for a human review; it finds specific pattern-matched issues, not design problems. Treating "code scanning passed" as "the code is safe to ship" is the exact failure mode this rule is accused of enabling by its critics — see the limitations section below.

### Require secret scanning alerts are resolved

**What it does:** Blocks merges when GitHub's secret scanner has detected an open alert of a type you configure, or when secret scanning has not completed.

**When to use it:** On repos where accidentally-committed API keys, tokens, and credentials are an active risk (which is every repo, in truth — see 2018 Capital One incident retrospectives for the paradigm case). Combined with **Push protection** on the main Code Security page, the two make a double gate: push protection catches the secret on the way in; this rule catches it if it slipped through.

**Misunderstanding to flag:** Secret scanning only catches secrets whose format it knows how to recognize. A GitHub token, AWS key, Stripe key, Slack webhook — yes. An internal service API token with your company's custom shape — only if you have added a custom pattern. Do not confuse "no secret-scanning alert" with "no secret in the repo."

### Require code quality / coverage / license compliance results

**What it does:** Three separate rules in the same family: block merges when a configured code-quality analysis fails, when test coverage drops below a threshold (or falls more than a specified number of points relative to the base branch), or when the PR adds a dependency whose license is not on your allow-list.

**When to use it:** On repos where you have already made the organizational decision that these are gates, not reports. Each one requires separate feature licensing and a corresponding analyzer in your workflow.

**Misunderstanding to flag:** These rules make the merge button a *compliance checkpoint*, not an advisory. If your organization is not sure whether a 2% coverage drop should block a PR, do not turn on the rule — argue about the policy first, codify it second. Teams who flip these on without a prior policy discussion end up with their senior engineers routinely in the bypass list.

## The push rules — for push rulesets specifically

Push rulesets have a different list of rules, because they fire *before* the push ever gets to a branch — they inspect the commits in-flight.

### Restrict file paths

**What it does:** Any commit that modifies a file matching a given path pattern is rejected at push.

**When to use it:** Keep a directory out of a repo. Classic example: `**/*.env` to make sure environment files never land. Also useful for enforcing "secret keys don't live in this repo, config directory does" boundaries.

### Restrict file path length

**What it does:** Rejects commits containing files whose full path exceeds a configurable character count.

**When to use it:** Mostly a defense against Windows path-length limits for teams that have Windows users. 260 characters is the historical Windows ceiling for non-opt-in applications.

### Restrict file extensions

**What it does:** Rejects commits containing files with the listed extensions. `.exe`, `.dll`, `.jar`, `.zip` are the typical candidates.

**When to use it:** Keep binaries out of source control. Pairs well with Git LFS where you *do* want some binaries but checked into a different storage path.

### Restrict file size

**What it does:** Rejects commits that add or modify a file over a configurable size (default is 100 MiB, matching GitHub's hard upper limit).

**When to use it:** Match GitHub's actual push limit before the push gets there. A rejected-at-your-ruleset push with a clear error is better than a rejected-at-GitHub push with a terser one. Also catches "accidentally committed a 2 GB test fixture" before it hits the server.

## The metadata rules — commit shape

These sit in the "Metadata restrictions" group inside branch and tag rulesets. They enforce patterns on the *content* of each commit's metadata, not on which files it touches. GitHub lets you require a given pattern on four fields:

- **Commit message** — regex-matched against the full commit message. The classic use: enforce Conventional Commits (`^(feat|fix|docs|style|refactor|perf|test|build|ci|chore)(\(.+\))?!?: .+`).
- **Commit author email** — regex-matched against the `Author:` email in each commit. Enforce "only `@yourcompany.com` emails land on main."
- **Committer email** — same, but on the `Committer:` field. Author and committer are often the same person; they diverge for cherry-picks, rebases, and commits produced by a bot that signed on someone else's behalf.
- **Branch name** / **Tag name** — regex-matched against the ref name being created. Enforce a naming convention (`^(main|develop|release/.+|feature/.+)$`) at the ref-creation layer, not just via a style guide.

For each pattern you pick a match mode — "Must start with," "Must contain," "Must match a pattern" (regex), or "Must not match a pattern." The regex engine is Rust's regex syntax, which is close to PCRE but with specific differences; the GitHub docs on [metadata rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) list the exact subset.

**Common misunderstanding:** Metadata rules evaluate at *push time*, not at commit time. A badly-messaged commit will still get recorded in your local history; it just will not land on the server. Developers who assume "the server will tell me as I commit" are confused; the server only tells them when they push.

## How multiple rulesets stack

Three rulesets can all target the same branch, and all three can be active. GitHub combines them, and if the same rule is defined differently in two of them, **the most restrictive wins** ([GitHub Docs: About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)). This matters more than it looks:

- An organization-level ruleset can set a floor ("every repo must require signed commits") that an individual repo's ruleset can only *add to*, not weaken.
- A repo-level ruleset can require 1 approval; a second repo-level ruleset on the same branch can require 2; the effective requirement is 2.
- A bypass granted in one ruleset does *not* grant bypass to the rules defined in another. Each ruleset's bypass list only covers its own rules.
- The audit log records which specific ruleset blocked a given push, so when a push is rejected and the error is confusing, the log tells you which rule in which ruleset to look at.

Teams that run multiple rulesets end up with a hierarchy that looks like: an **org-wide floor** (every production repo must do X, Y, Z); a **tier floor** (every tier-1 repo must do more); a **per-repo customization**. This is the shape rulesets were designed around. Branch protection rules do not accommodate it; rulesets do.

## Steelmanning the alternatives

Rulesets are one tool among several and should not be treated as the only answer.

**"Just use branch protection rules."** For a single repo with a straightforward "require PR, require tests, done" setup, branch protection rules are faster to configure and easier to explain to a reviewer. The feature set is a strict subset of rulesets, but the UI is older and more widely documented, which is itself a signal in favor of using it when nothing in your setup needs the newer features. The case against them grows the moment you need two rules on the same branch, the moment you want a dry-run mode, or the moment you want the configuration visible to contributors.

**"Just use pre-commit hooks."** For enforcing *authorship-side* conventions (commit message format, lint, format), [pre-commit](https://pre-commit.com/) runs on the developer's machine before the commit is made and gives a faster feedback loop than a server-side rejection. The failure mode is that it is bypassable (`git commit --no-verify`) and relies on every developer installing it. Pre-commit is a *soft* enforcement; rulesets are a *hard* one. The two combine well — fast feedback on the dev's laptop; backstop at the server.

**"Just use a CI gate."** For enforcing almost anything a status check can model, a workflow in `.github/workflows/` is more flexible than a ruleset. You can do custom checks, write your own messages, and version-control the policy itself. Rulesets then wire the CI gate into the merge button via **Require status checks**. The two systems are complementary; rulesets provide the enforcement surface, workflows provide the arbitrary logic. The common mistake is trying to do policy work in a ruleset that would be clearer as a workflow, or trying to do enforcement in a workflow that is more at home in a ruleset.

**"Just use the Terraform GitHub provider."** For an organization with dozens of repositories, configuring rulesets through the UI gets expensive. The [terraform-provider-github](https://registry.terraform.io/providers/integrations/github/latest/docs) resource `github_repository_ruleset` makes rulesets reviewable, auditable, and reversible. The failure mode is the usual Terraform ramp — one repo is more work than it saves, ten repos is where it starts paying.

## What rulesets do NOT solve

Being honest about the limits is what makes recommending the tool trustworthy.

- **A ruleset does not stop someone with bypass permission.** It stops everyone else. If every repo admin is on the bypass list, every repo admin can route around every rule. This is intended behavior — someone has to be able to fix the branch when the rule itself is wrong — but it means a ruleset is not a boundary against the people inside it.
- **A ruleset does not verify the correctness of what passed.** A PR that satisfies "two approvals + required checks pass" still ships whatever the PR contained; the ruleset guarantees the *process*, not the *outcome*. Treating "the branch is protected" as "the code is reviewed" is the oldest failure mode in change management; rulesets inherit it from everything that came before them.
- **A ruleset does not provide identity.** Rules that depend on commit metadata — author email, committer email, signatures — are only as reliable as the identity model underneath them. GPG keys can be shared; email addresses can be spoofed in commits without a signature. See GitHub's own [commit signature verification docs](https://docs.github.com/en/authentication/managing-commit-signature-verification) for what verification actually proves.
- **A ruleset's regex engine is specific.** Rust-regex semantics are close to PCRE but not identical — no lookaround, specific character-class behavior, specific anchoring rules. Testing a complicated regex against representative branch names and commit messages before enabling the rule is cheap; discovering the regex is wrong on your fifth production push is not.
- **A ruleset can create a merge-queue bottleneck.** On a branch with 100 PRs/day and a 5-minute test suite, a merge queue requires 100 \* 5 = 500 minutes of serial merging per day; if your tests take longer, the queue can starve. Measure before enabling.
- **A ruleset does not back-fill historical state.** Turning on **Require signed commits** today does not sign your previous commits. Turning on **Restrict file paths** does not remove files already in the tree. Rulesets govern *new* activity; cleaning historical state is a separate `git filter-repo` conversation.

## The one thing to take away

If you take one idea from this post: **a ruleset is a stackable, dry-run-capable restriction that applies to a branch, a tag, or a push — and the most important choice is not which rules you turn on, but whether you turn them on in Evaluate mode first.** Every production incident I have seen from a ruleset rollout would have shown up in the audit log on day one of an Evaluate run. The feature exists specifically to prevent the Monday-morning class of surprise.

Pick one branch — your repo's `main` — and open **Settings → Rules → New branch ruleset**. Set the target to the default branch, add **Block force pushes** and **Require a pull request before merging** with one required approval, flip the status to **Evaluate**, and leave it for a week. Then read the audit log. Whatever you find there is a shorter and more valuable list than any blog post can give you.

In the next post, [GitHub Actions workflows in plain language](/posts/github-actions-workflows-in-plain-language/), we move from the merge gate to the thing that produces the required status checks in the first place.

## Where to read more

- **[GitHub Docs: About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)** — the authoritative concept primer. Short, worth reading before you create your first one.
- **[GitHub Docs: Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)** — the full reference of every option. Dry; use as a lookup when the UI label is ambiguous.
- **[GitHub Docs: Managing rulesets for a repository](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/managing-rulesets-for-a-repository)** — the operational guide, including the Evaluate workflow.
- **[GitHub Docs: Managing rulesets for an organization](https://docs.github.com/en/organizations/managing-organization-settings/managing-rulesets-for-repositories-in-your-organization)** — the org-level view, which is what you need once more than one repo should share a floor.
- **[`terraform-provider-github` ruleset resource](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/repository_ruleset)** — rulesets as code, for when the UI stops scaling.
