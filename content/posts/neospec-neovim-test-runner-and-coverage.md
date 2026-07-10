+++
title = "neospec: a self-contained test runner and coverage tool for Neovim plugins"
date = 2026-07-05T07:45:00-04:00
draft = false
summary = "One Go binary that manages its own Neovim, runs Lua tests inside the real editor, and emits LCOV/Cobertura/JUnit — no system install, no vendored framework, no shell-script gymnastics."
tags = ["neovim", "lua", "testing", "coverage", "go", "ci-cd", "github-actions"]
categories = ["Neovim"]
ShowToc = true

[cover]
image = "/images/og/neospec-neovim-test-runner-and-coverage.png"
hiddenInList = true
hiddenInSingle = true
+++

*Companion to the [Yoda project page]({{< ref "projects/yoda-nvim.md" >}}) — neospec is the test-runner half of that ecosystem.*

Testing a Neovim plugin in CI is one of those problems that looks like it should be solved and isn't. If you're writing a Vim plugin — or worse, a Neovim distribution — you have three choices today, and every one of them has a sharp edge:

1. **Install Neovim system-wide on the runner** and shell out to `nvim --headless -c 'PlenaryBustedDirectory ...'`. Works, but you own the install/update dance, and the runner OS decides which Neovim you get.
2. **Vendor [plenary.nvim](https://github.com/nvim-lua/plenary.nvim) into every plugin repo** so its test harness is present at test time. That means a submodule (or a lazy clone in CI) for every project, plus you still have to install Neovim itself.
3. **Ship [busted](https://lunarmodules.github.io/busted/) as your Lua test framework.** Now you need a matching Lua interpreter that isn't Neovim's LuaJIT, and your tests can't call Neovim APIs directly — they need shims. If your plugin *is* Neovim code, half the reason to have tests just went away.

[neospec](https://github.com/jedi-knights/neospec) is the tool I wanted for exactly this problem. It's a single Go binary that manages its own Neovim, runs Lua tests inside the real editor, and emits reports in the formats your CI already parses.

## The self-contained Neovim story

The load-bearing idea in neospec is that the tool itself owns the Neovim binary. You point it at your test files; it downloads the version you asked for from [neovim/neovim releases](https://github.com/neovim/neovim/releases), caches it under `~/.cache/neospec/<version>/<os>/<arch>/`, and runs your tests inside that. First run is one HTTPS download (~28 MB per version). Every subsequent run is instant — the binary is on disk and the version-pin means you get the same one every time.

That single decision knocks out a whole class of "works on my machine" bugs:

- **Runner OS drift** — an Ubuntu runner's `apt install neovim` and a macOS runner's `brew install neovim` do not give you the same version. neospec's cached binary does.
- **Nightly-vs-stable drift** — pin `--neovim-version=v0.10.4` in `neospec.toml` and stop worrying about a nightly upgrade breaking your tests without your commit.
- **Ephemeral CI cache invalidations** — the download is cheap enough that missing the cache one build in ten is not a real cost.

```bash
neospec run --neovim-version=v0.10.4
neospec cache list      # what's on disk
neospec cache clean     # free the ~28 MB × N
```

## Test isolation via a clean XDG env

Every neospec run spins up Neovim with a fresh `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, and `XDG_STATE_HOME` under a temp directory. Your tests cannot read or mutate your real `~/.config/nvim` — which is exactly what you want when the plugin under test is one you also use as a human. It also means the same test suite runs identically on a fresh CI runner and on your laptop, because both start from an empty Neovim state.

## Why not just use busted?

Busted is a good tool. It's also solving a slightly different problem — it's a Lua test framework, not a Neovim test framework. Two consequences follow from that:

- **You need a matching Lua runtime.** Neovim uses LuaJIT with a specific set of embedded APIs. `lua5.1` on your PATH isn't the same runtime. When your test does `require("myplugin")` and the plugin calls `vim.api.nvim_buf_get_lines(...)`, that call has to hit the *real* Neovim, not a shim.
- **Vendoring is the ergonomic price.** Every plugin repo that uses busted-based testing (e.g. via plenary.nvim's `PlenaryBustedDirectory`) needs plenary reachable at test time — as a submodule, as a lazy clone, or as a package that the runner installs. neospec is a single binary; there is nothing to vendor.

The neospec harness reads like busted on purpose — `describe` / `it` / `before_each` / `after_each` / `pending` all mean what a busted user would expect them to mean — so a plugin author already fluent in busted doesn't have to relearn anything. What changes is *what runs the tests*.

```lua
-- test/parser_spec.lua
describe("parser", function()
  local subject
  before_each(function() subject = require("myplugin.parser").new() end)

  it("tokenizes identifiers", function()
    local tokens = subject.tokenize("foo bar")
    assert.equals(2, #tokens)
    assert.equals("foo", tokens[1].value)
  end)

  it("rejects invalid syntax", function()
    assert.has_error(function() subject.parse("!!!invalid") end)
  end)
end)
```

Standard assertion set — `equals`, `not_equals`, `is_true`/`is_false`, `is_nil`/`is_not_nil`, `has_error`, `matches`. Each takes an optional final `msg` for a custom failure line.

## Coverage without source rewriting

The coverage story is where neospec earns the "innovative" label. Most language coverage tools instrument source — you install a plugin, or your test runner rewrites the file on the way in. That approach has real costs: your line numbers can drift, tools that read your source (LSPs, other coverage tools) get confused by the rewritten output, and you have to trust the rewrite to be correct.

neospec uses Lua's built-in [`debug.sethook`](https://www.lua.org/manual/5.1/manual.html#pdf-debug.sethook) API. The hook fires on every executed line, records the hit count, and gets uninstalled at the end of the run. Your source is not touched. Line numbers are the ones you see in your editor. Your LSP is not confused.

Reports come out in the formats CI already accepts:

| Format | Where it plugs in |
|---|---|
| **LCOV** | Codecov, Coveralls, most editor coverage overlays |
| **Cobertura XML** | GitLab CI, Jenkins, GitHub's `MishaKav/jest-coverage-comment` and friends |
| **Coveralls JSON** | Coveralls direct upload |
| **JUnit XML** | GitHub Actions test-report annotations, GitLab test tab |
| **Console** | Human-readable summary at the bottom of the terminal output |

```bash
neospec run --format=console --format=lcov --format=junit
# reports land in coverage/lcov.info, coverage/junit.xml, and stdout
```

## The threshold gate

A one-line CI merge gate:

```bash
neospec run --threshold=80
# exits non-zero if coverage < 80%
```

That's how you keep coverage from silently drifting down. Every PR either holds the line or explains why the number moved. The gate isn't opinionated about *how* you get there — the failure message is just "coverage 76.3% < 80.0% threshold" and it's on the author to decide whether that's a fix-it-in-this-PR situation or a shifting-goalposts situation.

## GitHub Action

The action shape mirrors the CLI one-to-one, so what you validate locally is what runs in CI:

```yaml
- uses: jedi-knights/neospec@v0
  with:
    neovim-version: stable          # or nightly, or v0.10.4
    formats: console,lcov,junit
    threshold: "80"

- uses: jedi-knights/coverage-badge@v1
  # reads coverage/lcov.info and updates the README badge on push
```

Two things worth flagging about the CI story:

- **The action installs nothing on the runner** except the neospec binary itself. It does not `apt install neovim`. It does not clone plenary. The runner ends the job with the same package state it started with, minus a temp directory neospec cleaned up.
- **JUnit output surfaces per-test detail in the GitHub Actions summary.** You do not need a separate test-report action to see which spec failed and why — the annotations attach to the workflow run directly.

## Where this fits

If you write Neovim plugins and you've been putting off writing tests because the setup felt like it wasn't worth it — this is the tool that changes that math. One binary. One config file. One Action. No system-nvim install, no vendored plenary, no headless shell scripts. Your Lua code runs against a real, version-pinned Neovim, with coverage, in every runner, every time.

That's the piece I want more Neovim authors to internalize: **the testing infrastructure is no longer the reason not to test your plugin.**

## Where to find it

- **Repo:** [github.com/jedi-knights/neospec](https://github.com/jedi-knights/neospec)
- **Releases:** [github.com/jedi-knights/neospec/releases](https://github.com/jedi-knights/neospec/releases)
- **Coverage badge companion Action:** [github.com/jedi-knights/coverage-badge](https://github.com/jedi-knights/coverage-badge)
- **Neovim upstream releases:** [github.com/neovim/neovim/releases](https://github.com/neovim/neovim/releases)
- **Comparison — plenary.nvim's test harness:** [github.com/nvim-lua/plenary.nvim](https://github.com/nvim-lua/plenary.nvim)
- **Comparison — busted:** [lunarmodules.github.io/busted](https://lunarmodules.github.io/busted/)
