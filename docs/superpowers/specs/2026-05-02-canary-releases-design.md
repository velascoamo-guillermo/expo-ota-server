# Canary Releases — Design Spec

**Date:** 2026-05-02
**Sub-project:** 1 of 4 (OTA Server Staff-level features)
**Status:** Approved

---

## Context

expo-ota-server currently serves the latest release for a given `runtimeVersion + channel` to 100% of devices. This spec adds canary release support: a release can be assigned a `canary_percentage` (1–100) so only a deterministic subset of devices receives it. The remaining devices receive the last fully-rolled-out release.

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Canary scope | Per-release | Granular control per deploy; hotfixes can be 100%, experiments can be 5% |
| Cohort assignment | Hash-based deterministic | No DB write needed; same device always lands in same bucket; same pattern as LaunchDarkly/Unleash |
| Progression | Manual via dashboard/API | Sub-project 3 (auto-rollback) will add automatic triggers on top |
| Percentage location | Column on `releases` table | Single source of truth; backwards compatible (DEFAULT 100) |
| Architecture | CohortHelper class | Follows existing Helper pattern; reusable by sub-project 2 (A/B testing) |

---

## Database

### Migration

```sql
ALTER TABLE releases
  ADD COLUMN canary_percentage INTEGER NOT NULL DEFAULT 100;
```

All existing records default to 100 — no behavioral change on deploy.

### Release interface update

```typescript
// DatabaseInterface.ts — add field to Release
export interface Release {
  // ... existing fields ...
  canaryPercentage: number; // maps to canary_percentage column, default 100
}
```

Both `LocalDatabase.ts` and `SupabaseDatabase.ts` must include `canary_percentage as "canaryPercentage"` in all SELECT queries that return Release objects.

### New DB method

```typescript
// DatabaseInterface addition
getLatestFullyRolledOutRelease(
  runtimeVersion: string,
  channel: string
): Promise<Release | null>

// Query: most recent release WHERE canary_percentage = 100
// for the given runtimeVersion + channel, ordered by timestamp DESC LIMIT 1
```

---

## CohortHelper

**File:** `apiUtils/helpers/CohortHelper.ts`

```typescript
import crypto from 'crypto';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { Release } from '../database/DatabaseInterface';

export class CohortHelper {
  // Returns deterministic bucket 0–99 for a device+channel pair
  static getBucket(deviceId: string, channel: string): number {
    const hash = crypto
      .createHash('sha256')
      .update(deviceId + channel)
      .digest('hex');
    return parseInt(hash.slice(0, 8), 16) % 100;
  }

  // Returns the correct release for this device, or null if no update available
  static async resolveRelease(args: {
    runtimeVersion: string;
    channel: string;
    deviceId: string | null;
  }): Promise<Release | null> {
    const db = DatabaseFactory.getDatabase();
    const latest = await db.getLatestReleaseRecordForRuntimeVersionAndChannel(
      args.runtimeVersion,
      args.channel
    );
    if (!latest) return null;
    if (latest.canaryPercentage === 100) return latest;
    if (!args.deviceId) return null; // no device_id → withhold canary
    const bucket = CohortHelper.getBucket(args.deviceId, args.channel);
    if (bucket < latest.canaryPercentage) return latest;
    return db.getLatestFullyRolledOutRelease(args.runtimeVersion, args.channel);
  }
}
```

**Bucket logic:** `hash(deviceId + channel)` using SHA-256, take first 8 hex chars as uint32, modulo 100. Same device+channel always produces the same bucket (0–99). If `bucket < canaryPercentage`, device is in canary.

---

## manifest.ts changes

`manifest.ts` currently makes two independent queries for the same release:
1. **DB** (lines 67–70): `getLatestReleaseRecordForRuntimeVersionAndChannel` — used only for `updateId` early-exit check
2. **Storage** (line 88): `UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync` — determines which bundle is actually served

With canary, `CohortHelper.resolveRelease` replaces **both** by returning a `Release` with `path`. The `updateBundlePath` is derived as `release.path.replace('.zip', '')`.

```typescript
// Before (two separate queries)
const releaseRecord = await database.getLatestReleaseRecordForRuntimeVersionAndChannel(
  runtimeVersion, channel
);
// ... updateId check ...
const updateBundlePath = await UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync(
  runtimeVersion, channel
);

// After (one CohortHelper call covers both)
const deviceIdHeader = req.headers['eas-client-id']; // already sent by Expo — no client change needed
const deviceId = Array.isArray(deviceIdHeader) ? deviceIdHeader[0] : deviceIdHeader;
const release = await CohortHelper.resolveRelease({
  runtimeVersion,
  channel,
  deviceId: deviceId ?? null,
});
if (!release) {
  await putNoUpdateAvailableInResponseAsync(req, res, protocolVersion);
  return;
}
// updateId check
if (req.headers['expo-current-update-id'] === release.updateId) {
  await putNoUpdateAvailableInResponseAsync(req, res, protocolVersion);
  return;
}
const updateBundlePath = release.path.replace('.zip', '');
```

The post-response tracking (line 258) already has the `release` object — no second `getReleaseByPath` call needed.

---

## Upload script

Add optional `--canary-percentage` flag to the existing release script:

- Default: `100`
- Passed as body parameter to `POST /api/upload`
- `upload.ts` stores it in `db.createRelease({ ..., canaryPercentage })`

---

## New API endpoint

```
PATCH /api/releases
Body: { releaseId: string, canaryPercentage: number }
Auth: upload key header (same as existing endpoints)
Returns: updated Release
```

Allows updating the canary percentage post-deploy from the dashboard without re-uploading.

---

## Dashboard UI

Changes to the releases table in the admin dashboard:

1. New **Rollout** column showing percentage as a badge:
   - `canary_percentage < 100` → amber badge `🐤 10%`
   - `canary_percentage === 100` → green badge `✓ 100%`
2. **Edit %** action on canary releases — opens inline input, calls `PATCH /api/releases`

---

## App RN configuration

**No change required.** The `eas-client-id` header is already sent automatically by the Expo updates client. The server already reads it at line 261 of `manifest.ts` for tracking purposes. `CohortHelper` reuses this same header for cohort assignment.

---

## Error handling

| Scenario | Behavior |
|---|---|
| `expo-device-id` header missing | `resolveRelease` returns `null` for canary releases → app receives no update |
| No fully-rolled-out release exists | `resolveRelease` returns `null` → no update (correct: user stays on embedded) |
| `canary_percentage = 0` | No device qualifies; all get stable release |
| `canary_percentage = 100` | CohortHelper short-circuits, no bucket computation |

---

## Testing

- Unit: `CohortHelper.getBucket` — verify uniform distribution across 1000 random device IDs
- Unit: `CohortHelper.resolveRelease` — mock DB, test all 4 edge cases from error table
- Integration: `manifest.ts` with `expo-device-id` header present/absent
- E2E: Maestro flow — device receives canary; device without header receives stable

---

## ADR reference

See `docs/adr/` (to be written as part of implementation):
- ADR-001: Why hash-based cohort assignment over DB-stored assignments
- ADR-002: Why canary_percentage lives on the release, not on a channel config table

---

## What this enables for sub-projects 2 and 3

- **Sub-project 2 (A/B testing):** `CohortHelper.getBucket` is reused directly. Experiments add a variant layer on top of the same bucket number.
- **Sub-project 3 (auto-rollback):** When crash rate for a canary release exceeds threshold, the system calls `PATCH /api/releases` with `canaryPercentage: 0` — same endpoint built here.
