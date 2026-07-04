---
description: "Build the site in Docker and serve it locally on http://localhost:8080."
argument-hint: ""
---

# Preview

Builds the production container and runs it locally. This is the **canonical local preview** for this repo — the local Homebrew Hugo (0.160+) does not work with the pinned theme (see `.claude/rules/hugo-version-lock.md`).

## Steps

1. Confirm the theme submodule is initialized:
   ```bash
   if [ ! -f themes/puppet/theme.toml ]; then
     git submodule update --init --recursive
   fi
   ```
2. Build the image:
   ```bash
   docker build -t omarcrosby-com:preview .
   ```
   If the build fails, surface the Hugo error output and stop — do not attempt to run a stale image.
3. Stop any previous preview container:
   ```bash
   docker rm -f omarcrosby-com-preview 2>/dev/null || true
   ```
4. Start the container in the background:
   ```bash
   docker run -d --rm --name omarcrosby-com-preview -p 8080:8080 omarcrosby-com:preview
   ```
5. Smoke-test:
   ```bash
   sleep 1 && curl -sf -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8080/
   ```
   If not `HTTP 200`, run `docker logs omarcrosby-com-preview` and report.
6. Report to the caller:
   ```
   Preview running at http://localhost:8080 — stop with:
     docker rm -f omarcrosby-com-preview
   ```

## Notes

- Drafts (`draft: true`) are **not** shown by this command — the production build excludes them. To preview drafts, run `hugo server -D` with a pinned Hugo 0.127.x installed, or temporarily flip the draft flag.
- The container binds port 8080 on the host. If it's in use, stop the conflicting process or edit the `-p` mapping.
- To rebuild after content changes, re-run this command — Docker's layer cache makes rebuilds fast (only the `RUN hugo` layer re-runs).
