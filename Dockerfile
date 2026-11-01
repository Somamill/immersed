# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS app-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci
COPY . .
RUN npm run build:hosted

FROM python:3.12-slim-bookworm AS runtime
WORKDIR /app
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export CURL_CA_BUNDLE=/run/secrets/proxy_ca; fi; \
    apt-get update && apt-get install -y --no-install-recommends ffmpeg curl bzip2 git libgomp1 && rm -rf /var/lib/apt/lists/*
COPY --from=app-build /usr/local/bin/node /usr/local/bin/node
COPY server/requirements*.txt ./server/
COPY scripts/setup-alignment.cjs ./scripts/
ENV PIP_NO_CACHE_DIR=1
RUN --mount=type=secret,id=system_ca \
    if [ -f /run/secrets/system_ca ]; then export PIP_CERT=/run/secrets/system_ca REQUESTS_CA_BUNDLE=/run/secrets/system_ca GIT_SSL_CAINFO=/run/secrets/system_ca; fi; \
    python -m venv .venv && .venv/bin/pip install -r server/requirements.txt
ENV IMMERSED_ALIGNMENT_ENV=/opt/immersed-alignment IMMERSED_PYTHON=/opt/immersed-alignment/bin/python
RUN --mount=type=secret,id=system_ca \
    if [ -f /run/secrets/system_ca ]; then export PIP_CERT=/run/secrets/system_ca REQUESTS_CA_BUNDLE=/run/secrets/system_ca GIT_SSL_CAINFO=/run/secrets/system_ca; fi; \
    node scripts/setup-alignment.cjs
COPY --from=app-build /app /app
ENV PORT=8080 HF_HOME=/models IMMERSED_FORCE_ALIGNMENT=1 IMMERSED_PERSISTENT_MODELS=1
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["sh", "deploy/entrypoint.sh"]
