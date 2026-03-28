# Changelog

All notable changes to this project will be documented in this file.

---

## [v3.1.0](https://github.com/velascoamo-guillermo/expo-ota-server/compare/v3.0.3...v3.1.0) — 2026-03-28

### Features

- **Dark mode** — Full dark/light mode support with automatic system preference detection. Toggle available in the navbar. All pages, cards, tables, and charts adapt to the selected theme.
- **Kubernetes deployment templates** — Kustomize-based manifests for deploying on AWS EKS, Azure AKS, and GCP GKE. Includes base manifests (Deployment, Service, Secret) and cloud-specific Ingress overlays. See [`k8s/README.md`](k8s/README.md) for setup instructions.

---

## [v3.0.3](https://github.com/velascoamo-guillermo/expo-ota-server/compare/v3.0.2...v3.0.3) — 2026-03-27

### Bug Fixes

- **Docker build** — Added `public/.gitkeep` so the Docker multi-stage `COPY public ./public` step does not fail on an empty directory.

---

## [v3.0.2](https://github.com/velascoamo-guillermo/expo-ota-server/compare/v3.0.1...v3.0.2) — 2026-03-27

### Bug Fixes

- **Docker build** — Renamed `dockerfile` → `Dockerfile` (case-sensitive fix for Linux CI). Updated multi-stage build to use `oven/bun:1-alpine` and `bun install --frozen-lockfile` after npm→bun migration.

---

## [v3.0.1](https://github.com/velascoamo-guillermo/expo-ota-server/compare/v3.0.0...v3.0.1) — 2026-03-27

### Features

- **MAU split by platform** — Monthly Active Users chart now shows iOS and Android as separate series, giving a clearer picture of your user base breakdown.
- **UI rebrand** — Replaced Xavia OTA branding with a neutral "OTA Server" identity (icon + wordmark). No vendor lock-in in the UI.
- **Bun** — Migrated from npm to [Bun](https://bun.sh/) as package manager and runtime. Faster installs, single lockfile (`bun.lock`). All scripts and CI workflows updated.

### Bug Fixes

- Upgraded TypeScript to v5 to fix `react-icons` JSX compatibility errors in CI.
- Fixed `SupabaseStorage` null type errors (`updated_at`, `created_at` fields).
- Fixed channels dashboard crash when API response returned `undefined` for the channels array.
- Fixed MAU chart YAxis to always start from 0.

---

## [v3.0.0](https://github.com/velascoamo-guillermo/expo-ota-server/compare/v2.0.3...v3.0.0) — 2026-03-27

> **expo-ota-server v3** is a fork of [xavia-ota](https://github.com/xavia-io/xavia-ota) (MIT). All prior work is credited to the Xavia team. This release introduces channel-based OTA distribution and a redesigned admin dashboard.

### Features

- **Channel support** — Publish updates to named channels (`production`, `staging`, `development`, or any custom name). Clients subscribe to a specific channel; the server serves the correct release per channel.
- **Channel dashboard** — New channel-based UI. The main view lists all active channels as cards. Each channel page shows its releases, download stats, and MAU chart.
- **Monthly Active Users (MAU) tracking** — Tracks unique device downloads per month using the `eas-client-id` header as a device identifier. Displayed as an area chart per channel.
- **Per-release download count** — Each release tracks how many times it has been downloaded.
- **Release size** — Bundle size is stored and displayed in the releases table.
- **Rollback** — Promote any previous release to active with a confirmation dialog.
- **Legacy storage path fallback** — Backwards-compatible with the old storage path format from xavia-ota, so existing deployments can upgrade without re-uploading bundles.
- **Docker image** — Published to Docker Hub as [`gvelascoamo/expo-ota-server`](https://hub.docker.com/r/gvelascoamo/expo-ota-server).

### Infrastructure

- Multi-stage `Dockerfile` using `oven/bun:1-alpine` (non-root user, standalone Next.js output).
- GitHub Actions CI: lint, type-check, and test on every push and pull request.
- GitHub Actions release: automatic Docker build and push to Docker Hub on version tags.
- Updated `containers/prod/docker-compose.yml` with new image name and environment variable documentation.

---

## Prior releases (xavia-ota)

Versions v1.x and v2.x were released under the [xavia-ota](https://github.com/xavia-io/xavia-ota) project. See the [original changelog](https://github.com/xavia-io/xavia-ota/blob/main/CHANGELOG.md) for details.
