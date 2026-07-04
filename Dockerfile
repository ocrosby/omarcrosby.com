# syntax=docker/dockerfile:1

# Stage 1: build the Hugo site.
# Pinned to 0.127.0 — the puppet theme uses `resources.ToCSS` which was
# removed in Hugo 0.128+. Bumping Hugo requires migrating the theme first.
FROM hugomods/hugo:0.127.0 AS builder
WORKDIR /src
COPY . .
RUN hugo --minify --gc

# Stage 2: serve the built static assets with nginx.
# nginx:alpine is small (~40MB) and runs unprivileged on port 8080 (Fly convention).
FROM nginx:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /src/public /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
