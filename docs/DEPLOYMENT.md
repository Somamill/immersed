# Persistent hosting

> Legacy community-preview notes: Expo Go delivery and hosted update/tunnel instructions below are retired. Use the [native Xcode/TestFlight guide](../TESTFLIGHT.md) for Apple releases. The Store edition is self-contained and excludes the experimental streaming/capture backend.

Status: the standalone server and native export are implemented. **No permanent host is deployed by this change.** This workspace and its Expo tunnel are temporary. Restarting a process cannot keep a stopped workspace online.

## Requirements

Use a persistent Linux amd64 host with Docker Compose, a domain pointing at its public IP, ports 80/443, persistent disk and outbound model/data downloads. Start with at least 8 GB RAM and 20 GB free disk; measure actual memory and latency before promising capacity. Multiple CPU recognizers plus alignment are expensive to run even when their weights have no API fee. This is not a guaranteed real-time service. Sleeping free tiers cannot provide continuous availability.

No suitable persistent compute account is connected to the current session. The connected edge-site hosting cannot fit the parser and Python speech models. No hosting bill has been started. Connect a suitable host before deployment; do not put account credentials in this repository or chat.

## Build and serve

On that host:

```sh
git clone https://github.com/Somamill/immersed.git
cd immersed
cp deploy/.env.example deploy/.env
# Set DOMAIN to your real domain in deploy/.env.
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
docker compose --env-file deploy/.env -f deploy/compose.yaml logs -f app
```

The first startup builds dictionary/context indexes. Speech model weights download on first use. The alignment runtime lives outside the data volume; indexes and model caches survive container replacements. Caddy obtains HTTPS certificates; restart policies recover exited containers, but host outages still require monitoring/recovery. Docker health checks report health; they do not themselves restart an unhealthy container.

Visit `https://YOUR_DOMAIN/` on iPhone and open its Expo Go link. The same HTTPS origin serves the native JavaScript bundle, assets and language API. There is no Metro development server or Expo tunnel in this deployment. The manifest retains the app's existing Expo Go storage scope. HTTP tests cover manifests/assets and stable addresses across process restarts; **opening this self-hosted production manifest on a physical iPhone remains unverified**. Expo Go must support SDK 58; future SDK upgrades still require maintenance. This is not TestFlight or an App Store install.

For an existing Node/Python host, install the dependencies in `server/requirements.txt`, run `npm ci`, `npm run language:setup`, `npm run context:setup`, `npm run alignment:setup`, and `npm run build:hosted`. Run `PUBLIC_ORIGIN=https://YOUR_DOMAIN npm run start:hosted` under its process manager with an HTTPS reverse proxy. Do not use a development tunnel as a permanent origin.

## Deployment acceptance checks

- `/healthz` must show the expected version and `nativeBundle: true` over public HTTPS.
- Open the app on a real iPhone; verify dictionary search, saved vocabulary and video playback after a server restart.
- Test a permitted captionless Japanese video on the actual host. The current workspace gets HTTP 403 acquiring YouTube audio; moving the server does **not** establish that a different data-center IP can acquire it. If audio cannot be acquired, fresh captions cannot be generated. No proxy bypass is provided.
- Confirm generated results report `aligned` when the acoustic timing pass succeeds. They report `estimated` if the optional runtime/model fails; that fallback is not exact timing.
- Measure recognition errors and timing on conversational recordings, not just read-speech benchmarks. Follow [the measured upgrade report](RECOGNITION_UPGRADE.md).

For updates, pull the reviewed tag and rebuild/recreate the app container. Keep the data/model volumes. Never use `down -v` if you intend to preserve these volumes. Back up saved data and monitor disk, memory, health and certificate renewal before calling this a reliable public service.
