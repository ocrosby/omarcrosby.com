---
description: "Run every CI quality gate locally (build, links, markdownlint, typos) before pushing."
argument-hint: ""
---

# Verify

Runs the same four checks that `.github/workflows/ci.yml` runs on PRs — locally, sequentially, on the current working tree.

Stops at the first failure. Exit status matches CI: if `/verify` passes locally, the PR's CI job should pass too (barring flakiness).

## Steps

1. **Ensure submodule is initialized:**

   ```bash
   git submodule update --init --recursive
   ```

2. **Hugo build validation** (matches `ci.yml`'s `build` job):

   ```bash
   docker build -t omarcrosby-com:verify . || { echo "FAIL: hugo build"; exit 1; }
   ```

   Rationale for using Docker rather than local Hugo: the pinned 0.127.0 in the image is the actual version CI uses. Local Homebrew Hugo 0.160+ fails on this repo.

3. **Broken link check** — extract `public/` from the built image, then run lychee:

   ```bash
   docker create --name omarcrosby-verify-tmp omarcrosby-com:verify >/dev/null
   docker cp omarcrosby-verify-tmp:/usr/share/nginx/html ./public-verify
   docker rm omarcrosby-verify-tmp >/dev/null
   docker run --rm -v "$PWD:/w" -w /w lycheeverse/lychee:latest \
     --no-progress --base https://omarcrosby.com --accept 200,203,204,206,999 \
     --exclude-file .lycheeignore './public-verify/**/*.html' \
     || { echo "FAIL: broken links"; rm -rf ./public-verify; exit 1; }
   rm -rf ./public-verify
   ```

4. **Markdown lint:**

   ```bash
   docker run --rm -v "$PWD:/w" -w /w davidanson/markdownlint-cli2 \
     "**/*.md" "#CHANGELOG.md" "#themes/**" "#public/**" "#resources/**" "#node_modules/**" \
     || { echo "FAIL: markdownlint"; exit 1; }
   ```

5. **Typo scan:**

   ```bash
   docker run --rm -v "$PWD:/w" -w /w ghcr.io/crate-ci/typos:latest \
     || { echo "FAIL: typos"; exit 1; }
   ```

6. **Report:**

   ```text
   All four gates passed — safe to push.
   ```

## Notes

- If Docker is not running, stop immediately and tell the caller to start Docker Desktop.
- Each step is dockerized so the exact tool version matches CI (no "works on my machine" drift).
- The commands above assume Bash; adapt for other shells if needed.
- To run only one gate, invoke the corresponding step directly — this command is the full sweep.
