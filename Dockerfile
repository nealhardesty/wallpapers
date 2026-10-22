# The wallpapers site in a small container, served by tools/serve.mjs
# (Node built-ins only, no npm install). Build and run with:
#   make docker-build && make docker-run      → http://localhost:8000
# Plain http: put TLS in front with your reverse proxy, or use
# `make serve-https` for local https.
FROM node:22-alpine

WORKDIR /app
COPY tools/serve.mjs tools/serve.mjs
COPY web web

ENV HOST=0.0.0.0 \
    PORT=8000
EXPOSE 8000

# The image's unprivileged user; the files stay root-owned and read-only.
USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget -q -O /dev/null http://127.0.0.1:8000/ || exit 1

CMD ["node", "tools/serve.mjs"]
