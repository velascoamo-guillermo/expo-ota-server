# Expo OTA Server

Self-hosted Over-The-Air update server for Expo / React Native apps.

## Features

- Push OTA updates to iOS and Android without App Store review
- Multiple channels (`production`, `preview`, `development`, or custom)
- Canary releases — gradual rollout by percentage with deterministic device bucketing
- Rollback to any previous release in one click
- Download tracking per release and platform (iOS / Android)
- Monthly Active Users (MAU) stats
- Web dashboard with channel overview

## Quick Start

```bash
docker run -d \
  -p 3000:3000 \
  -e DB_TYPE=postgres \
  -e POSTGRES_HOST=your-db-host \
  -e POSTGRES_PORT=5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=releases_db \
  -e UPLOAD_KEY=your-secret-upload-key \
  -e HOST=http://your-server-ip:3000 \
  -v /data/releases:/app/local-releases \
  gvelascoamo/expo-ota-server:latest
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_TYPE` | Yes | `postgres` or `supabase` |
| `POSTGRES_HOST` | Yes (postgres) | Database host |
| `POSTGRES_PORT` | No | Database port (default: 5432) |
| `POSTGRES_USER` | Yes (postgres) | Database user |
| `POSTGRES_PASSWORD` | Yes (postgres) | Database password |
| `POSTGRES_DB` | Yes (postgres) | Database name |
| `UPLOAD_KEY` | Yes | Secret key for uploading releases |
| `HOST` | Yes | Public URL of this server |

## Uploading Updates

```bash
curl -X POST http://your-server:3000/api/upload \
  -F "file=@update.zip" \
  -F "uploadKey=your-secret-upload-key" \
  -F "runtimeVersion=1.0.0" \
  -F "commitHash=$(git rev-parse HEAD)" \
  -F "commitMessage=$(git log -1 --pretty=%B)" \
  -F "channel=production" \
  -F "canaryPercentage=100"
```

## Expo App Configuration

```json
{
  "expo": {
    "updates": {
      "url": "http://your-server:3000/api/manifest",
      "enabled": true,
      "fallbackToCacheTimeout": 0
    },
    "runtimeVersion": {
      "policy": "appVersion"
    }
  }
}
```

## Source

[github.com/velascoamo-guillermo/expo-ota-server](https://github.com/velascoamo-guillermo/expo-ota-server)
