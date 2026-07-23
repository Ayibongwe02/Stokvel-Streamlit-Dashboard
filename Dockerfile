# ════════════════════════════════════════════════════════════════
# Stokvel Analytics Dashboard — production image
#
#   Stage 1 (data-builder): runs the existing Python ETL pipeline
#     (scripts/generate_data.py) against data/raw/*.csv to produce
#     data/dashboard_data.json — baked into the image as a sane
#     default / offline fallback.
#
#   Stage 2 (web): a small nginx:alpine image serving the static
#     frontend (no build step needed — it's vanilla JS/CSS/HTML).
#
# The final image needs no Python, no Node, and no external network
# access at runtime (Chart.js is vendored locally in src/js/vendor/).
# ════════════════════════════════════════════════════════════════

# ── Stage 1: generate dashboard_data.json ──────────────────────────
FROM python:3.11-slim AS data-builder

WORKDIR /build
COPY scripts/ ./scripts/
COPY data/raw/ ./data/raw/

RUN pip install --no-cache-dir "pandas>=2.0,<3" \
 && python scripts/generate_data.py

# ── Stage 2: static site served by nginx ───────────────────────────
FROM nginx:1.27-alpine AS web

# App files
COPY index.html /usr/share/nginx/html/index.html
COPY src/       /usr/share/nginx/html/src/
COPY data/raw/  /usr/share/nginx/html/data/raw/

# Generated data (baked-in default — overridden at runtime if you
# bind-mount ./data over /usr/share/nginx/html/data, see docker-compose.yml)
COPY --from=data-builder /build/data/dashboard_data.json /usr/share/nginx/html/data/dashboard_data.json

# Custom nginx config: correct caching behaviour for dashboard_data.json,
# gzip, and static-asset cache headers.
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
