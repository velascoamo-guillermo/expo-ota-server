# expo-ota-server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A self-hosted Over-The-Air (OTA) updates server for Expo/React Native applications. Built with Next.js and TypeScript, implementing the expo-updates protocol with channel support, MAU tracking, and a redesigned admin dashboard.

> This project is based on [xavia-ota](https://github.com/xavia-io/xavia-ota) with additional features. Credit to the original authors.

## Table of Contents <!-- omit in toc -->

- [Overview](#overview)
- [What's new in v3](#whats-new-in-v3)
- [Key Features](#key-features)
- [Deployment](#deployment)
- [Local Development](#local-development)
- [Database Migration from v2](#database-migration-from-v2)
- [Code Signing](#code-signing)
- [React Native app configuration](#react-native-app-configuration)
- [Publish App Update](#publish-app-update)
- [Rollbacks](#rollbacks)
- [Admin Dashboard](#admin-dashboard)
- [Technical Stack](#technical-stack)
- [FAQ](#faq)
- [License](#license)

## Overview

expo-ota-server provides a complete OTA update infrastructure with these key components:

1. **Updates Server**: A Next.js application handling OTA update distribution.
2. **Admin Dashboard**: Web interface for update management with per-channel views.
3. **Blob Storage**: Flexible and extensible blob storage support.
4. **Database Layer**: PostgreSQL for tracking releases, downloads, and monthly active users.

## What's new in v3

- **Channel support** — Separate update streams per channel (production, staging, development, or any custom channel). Each channel has its own dashboard with releases and analytics.
- **Monthly Active Users (MAU)** — Track unique devices per channel per month with an area chart.
- **Downloads per release** — See how many times each release has been downloaded.
- **Backwards compatible** — If you're migrating from v2, existing releases without a channel are automatically served under the `production` channel. No data loss.
- **Improved layout** — Sticky topbar with navigation and logout button.
- **Bug fixes** — Rollback dialog now works correctly; active release updates properly after a rollback.

## Key Features

- ✨ Full compatibility with `expo-updates` protocol
- 🔀 Channel-based update distribution (production, staging, development...)
- 🔄 Runtime version management and rollback support
- 🐳 Docker support for easy deployment
- 🗄️ Multiple blob storage backends (Supabase, S3, GCS, local)
- 📈 Release history with commit hash and message tracking
- 📊 MAU analytics and download counts per release

## Deployment

1. Copy the `docker-compose.yml` file from `containers/prod` and set the environment variables.
2. Or pull and run manually:

   ```bash
   docker run -d -p 3000:3000 expo-ota-server -e HOST=http://localhost:3000 ...
   ```

## Local Development

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/velascoamo-guillermo/expo-ota-server.git
   cd expo-ota-server
   npm install
   ```

2. Copy the example env file:
   ```bash
   cp .env.example.local .env.local
   ```

3. Configure your environment variables in `.env.local`:
   ```env
   HOST=http://localhost:3000
   BLOB_STORAGE_TYPE=local
   DB_TYPE=postgres
   ADMIN_PASSWORD=your-admin-password
   PRIVATE_KEY_BASE_64=your-base64-encoded-private-key
   UPLOAD_KEY=abc123def456
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=postgres
   POSTGRES_DB=releases_db
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

The server and admin dashboard will be available at `http://localhost:3000`.

Refer to [Storage & Database Configuration](./docs/supportedStorageAlternatives.md) for more configuration options.

## Database Migration from v2

If you're coming from v2 (xavia-ota), run the following SQL migrations against your existing database:

```sql
-- Add channel support to releases
ALTER TABLE releases ADD COLUMN IF NOT EXISTS channel VARCHAR(255) NOT NULL DEFAULT 'production';

-- Add file size tracking
ALTER TABLE releases ADD COLUMN IF NOT EXISTS size INTEGER;

-- Add device tracking for MAU
ALTER TABLE releases_tracking ADD COLUMN IF NOT EXISTS device_id VARCHAR(255);
```

Existing releases without a channel will automatically be served under `production`. No data migration needed for release files — the server falls back to legacy storage paths transparently.

## Code Signing

The code signing is done using a private key used to sign the updates. The client uses a certificate to verify the signature.

Refer to the [expo code signing documentation](https://docs.expo.dev/eas-update/code-signing/) for generating the required secrets.

## React Native app configuration

Configure `expo-updates` in your app and point `updates.url` to `https://your-domain/api/manifest`.

To use channels, set the `expo-channel-name` header in your app config:

```json
{
  "updates": {
    "url": "https://your-domain/api/manifest",
    "requestHeaders": {
      "expo-channel-name": "production"
    }
  }
}
```

## Publish App Update

Copy `scripts/build-and-publish-app-release.sh` to your React Native app root and run it from there:

```shell
./build-and-publish-app-release.sh [channel]
```

`channel` defaults to `development`. Valid values: `development`, `preview`, `production`.

The script reads `OTA_URL` and `UPLOAD_KEY` from your app's `.env.local`, and `runtimeVersion` from `app.json` automatically.

Example:
```shell
./build-and-publish-app-release.sh production
```

This script will:
1. Export your app using `expo export`
2. Package the update with metadata
3. Upload it to your expo-ota-server

> **Note**: Make sure the script is executable (`chmod +x build-and-publish-app-release.sh`)

## Rollbacks

Rollbacks use a rollback-forward mechanism. Clicking "Rollback to this release" in the dashboard copies the selected release with a new timestamp, making it the new active release for that channel.

## Admin Dashboard

The dashboard shows a list of channels. Each channel has:
- Release history with commit hash, message, timestamp, and file size
- MAU chart (monthly active users)
- Download count per release
- One-click rollback

## Technical Stack

### Core Technologies
- **Framework**: Next.js 15+
- **Language**: TypeScript
- **Database**: PostgreSQL 14
- **UI**: Chakra UI v2, Tailwind CSS, Recharts
- **Container**: Docker & Docker Compose

### Storage Options
- Local filesystem (development)
- Supabase Storage
- AWS S3 Compatible
- Google Cloud Storage

### Development Tools
- ESLint, Prettier
- Jest
- Docker & Docker Compose
- Husky + commitlint

## FAQ

<details>
<summary>

### How is this different from EAS Updates?
</summary>

expo-ota-server is a free, self-hosted alternative to EAS Updates. Both implement the same expo-updates protocol. You keep full control over your update distribution without paying for a managed service.
</details>

<details>
<summary>

### How is this different from xavia-ota?
</summary>

This project is based on xavia-ota and adds: channel support, MAU analytics, download tracking, improved UI layout, and bug fixes for rollback functionality. It also includes a DB migration path for existing xavia-ota users.
</details>

<details>
<summary>

### What blob storage options are supported?
</summary>

- Supabase Storage
- Local filesystem
- Google Cloud Storage
- AWS S3 Compatible
</details>

<details>
<summary>

### What database options are supported?
</summary>

Currently PostgreSQL only. The `DatabaseInterface` is simple to extend for other databases.
</details>

<details>
<summary>

### Is this production-ready?
</summary>

Yes. The server implements the complete expo-updates protocol including rollbacks, code signing, and channel-based distribution.
</details>

## License

MIT License. See [LICENSE](./LICENSE) for details.

Original work Copyright (c) 2015-present 650 Industries, Inc. (aka Expo) and Copyright (c) 2024-present Xavia.
