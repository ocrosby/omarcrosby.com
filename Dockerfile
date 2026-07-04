# syntax=docker/dockerfile:1

# Stage 1: build the Hugo site.
FROM hugomods/hugo:0.160.1 AS builder
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
