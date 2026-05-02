# Canary Releases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `canary_percentage` to releases so a configurable subset of devices receives a new bundle while the rest stay on the last fully-rolled-out release.

**Architecture:** A new `CohortHelper` class performs hash-based deterministic bucket assignment (`hash(eas-client-id + channel) % 100`) and picks the right release. `manifest.ts` delegates all release resolution to `CohortHelper`, replacing the existing dual DB+storage query. The dashboard gains a Rollout column and an inline editor.

**Tech Stack:** TypeScript, Next.js API routes, Chakra UI, PostgreSQL (`pg`), Supabase client, Node.js `crypto` (built-in), Jest + `node-mocks-http`.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `scripts/migrations/001_add_canary_percentage.sql` | DB migration |
| Modify | `apiUtils/database/DatabaseInterface.ts` | Add `canaryPercentage` to `Release`; add `getLatestFullyRolledOutRelease` to interface |
| Modify | `apiUtils/database/LocalDatabase.ts` | Implement new method; update all SELECT/INSERT queries |
| Modify | `apiUtils/database/SupabaseDatabase.ts` | Same for Supabase |
| Create | `apiUtils/helpers/CohortHelper.ts` | Hash-based cohort assignment |
| Create | `__tests__/cohort-helper.test.ts` | Unit tests for CohortHelper |
| Modify | `__tests__/manifest.test.ts` | Mock CohortHelper; update mock Release objects |
| Modify | `pages/api/manifest.ts` | Replace dual query with CohortHelper |
| Modify | `pages/api/upload.ts` | Accept `canaryPercentage` form field |
| Create | `pages/api/releases/[id].ts` | `PATCH` endpoint to update canary percentage |
| Create | `__tests__/releases-patch.test.ts` | Unit tests for PATCH endpoint |
| Modify | `pages/releases.tsx` | Rollout badge column + inline edit UI |
| Modify | `scripts/build-and-publish-app-release.sh` | Add `--canary-percentage` flag |
| Create | `docs/adr/001-hash-based-cohort-assignment.md` | ADR |
| Create | `docs/adr/002-canary-percentage-on-release.md` | ADR |

---

## Task 1: DB Migration File

**Files:**
- Create: `scripts/migrations/001_add_canary_percentage.sql`

- [ ] **Step 1: Create migration file**

```sql
-- scripts/migrations/001_add_canary_percentage.sql
-- Adds canary_percentage to releases table.
-- DEFAULT 100 means all existing records behave as full rollout.
ALTER TABLE releases
  ADD COLUMN canary_percentage INTEGER NOT NULL DEFAULT 100;
```

- [ ] **Step 2: Run migration against local DB (if using Postgres)**

```bash
psql -U postgres -d releases_db -f scripts/migrations/001_add_canary_percentage.sql
```

Expected output: `ALTER TABLE`

For Supabase: run the SQL in the Supabase dashboard SQL editor.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrations/001_add_canary_percentage.sql docs/adr docs/superpowers/plans
git commit -m "chore: add DB migration for canary_percentage and create plan dirs"
```

---

## Task 2: DatabaseInterface — Add Types and Method

**Files:**
- Modify: `apiUtils/database/DatabaseInterface.ts`

- [ ] **Step 1: Add `canaryPercentage` to the `Release` interface and `getLatestFullyRolledOutRelease` to `DatabaseInterface`**

Open `apiUtils/database/DatabaseInterface.ts`. Replace the full file with:

```typescript
export interface Release {
  id: string;
  runtimeVersion: string;
  channel: string;
  path: string;
  timestamp: string;
  commitHash: string;
  commitMessage: string;
  updateId?: string;
  size?: number;
  downloadCount?: number;
  canaryPercentage: number;
}

export interface Tracking {
  id: string;
  releaseId: string;
  downloadTimestamp: string;
  platform: string;
  deviceId?: string;
}

export interface TrackingMetrics {
  platform: string;
  count: number;
}

export interface MAUStat {
  month: string;
  ios: number;
  android: number;
}

export interface DatabaseInterface {
  createRelease(release: Omit<Release, 'id'>): Promise<Release>;
  getRelease(id: string): Promise<Release | null>;
  getReleaseByPath(path: string): Promise<Release | null>;
  listReleases(): Promise<Release[]>;
  createTracking(tracking: Omit<Tracking, 'id'>): Promise<Tracking>;
  getReleaseTrackingMetrics(releaseId: string): Promise<TrackingMetrics[]>;
  getReleaseTrackingMetricsForAllReleases(): Promise<TrackingMetrics[]>;
  getReleaseTrackingMetricsByChannel(channel: string): Promise<TrackingMetrics[]>;
  listChannels(): Promise<string[]>;
  getLatestReleaseRecordForRuntimeVersionAndChannel(
    runtimeVersion: string,
    channel: string
  ): Promise<Release | null>;
  getLatestFullyRolledOutRelease(
    runtimeVersion: string,
    channel: string
  ): Promise<Release | null>;
  updateCanaryPercentage(releaseId: string, canaryPercentage: number): Promise<Release | null>;
  getDownloadCountsPerRelease(): Promise<Record<string, number>>;
  getMAUStats(channel?: string): Promise<MAUStat[]>;
}
```

- [ ] **Step 2: Verify TypeScript compiles (type errors expected in DB implementations — fix in next tasks)**

```bash
cd /Users/guillermovelasco/Documents/Projects/Node/expo-ota-server && npx tsc --noEmit 2>&1 | head -30
```

Expected: errors in `LocalDatabase.ts` and `SupabaseDatabase.ts` about missing method and missing property. That's correct — fix in Tasks 3 and 4.

- [ ] **Step 3: Commit**

```bash
git add apiUtils/database/DatabaseInterface.ts
git commit -m "feat(db): add canaryPercentage to Release interface and getLatestFullyRolledOutRelease"
```

---

## Task 3: LocalDatabase (Postgres) — Implement Changes

**Files:**
- Modify: `apiUtils/database/LocalDatabase.ts`

The `LocalDatabase.ts` file contains `PostgresDatabase`. Every method that SELECTs from `releases` must add `canary_percentage as "canaryPercentage"`. The INSERT must include `canary_percentage`. A new method must be added.

- [ ] **Step 1: Update `getLatestReleaseRecordForRuntimeVersionAndChannel`**

Find this method (line ~39) and replace its query:

```typescript
async getLatestReleaseRecordForRuntimeVersionAndChannel(
  runtimeVersion: string,
  channel: string
): Promise<Release | null> {
  const query = `
    SELECT id, runtime_version as "runtimeVersion", channel, path, timestamp,
           commit_hash as "commitHash", commit_message as "commitMessage",
           update_id as "updateId", size, canary_percentage as "canaryPercentage"
    FROM ${Tables.RELEASES} WHERE runtime_version = $1 AND channel = $2
    ORDER BY timestamp DESC
    LIMIT 1
  `;
  const { rows } = await this.pool.query(query, [runtimeVersion, channel]);
  return rows[0] || null;
}
```

- [ ] **Step 2: Update `getReleaseByPath`**

```typescript
async getReleaseByPath(path: string): Promise<Release | null> {
  const query = `
    SELECT id, runtime_version as "runtimeVersion", channel, path, timestamp,
           commit_hash as "commitHash", commit_message as "commitMessage",
           update_id as "updateId", size, canary_percentage as "canaryPercentage"
    FROM ${Tables.RELEASES} WHERE path = $1
  `;
  const { rows } = await this.pool.query(query, [path]);
  return rows[0] || null;
}
```

- [ ] **Step 3: Update `getRelease`**

```typescript
async getRelease(id: string): Promise<Release | null> {
  const query = `
    SELECT id, runtime_version as "runtimeVersion", channel, path, timestamp,
           commit_hash as "commitHash", commit_message as "commitMessage",
           update_id as "updateId", size, canary_percentage as "canaryPercentage"
    FROM ${Tables.RELEASES} WHERE id = $1
  `;
  const { rows } = await this.pool.query(query, [id]);
  return rows[0] || null;
}
```

- [ ] **Step 4: Update `listReleases`**

```typescript
async listReleases(): Promise<Release[]> {
  const query = `
    SELECT id, runtime_version as "runtimeVersion", channel, path, timestamp,
           commit_hash as "commitHash", commit_message as "commitMessage",
           update_id as "updateId", size, canary_percentage as "canaryPercentage"
    FROM ${Tables.RELEASES}
    ORDER BY timestamp DESC
  `;
  const { rows } = await this.pool.query(query);
  return rows;
}
```

- [ ] **Step 5: Update `createRelease` INSERT**

Find `createRelease` and replace:

```typescript
async createRelease(release: Omit<Release, 'id'>): Promise<Release> {
  const query = `
    INSERT INTO ${Tables.RELEASES}
      (runtime_version, channel, path, timestamp, commit_hash, commit_message, update_id, size, canary_percentage)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, runtime_version as "runtimeVersion", channel, path, timestamp,
              commit_hash as "commitHash", commit_message as "commitMessage",
              update_id as "updateId", size, canary_percentage as "canaryPercentage"
  `;
  const values = [
    release.runtimeVersion,
    release.channel,
    release.path,
    release.timestamp,
    release.commitHash,
    release.commitMessage,
    release.updateId,
    release.size ?? null,
    release.canaryPercentage ?? 100,
  ];
  const { rows } = await this.pool.query(query, values);
  return rows[0];
}
```

- [ ] **Step 6: Add `getLatestFullyRolledOutRelease` method**

Add this method to the `PostgresDatabase` class (after `getLatestReleaseRecordForRuntimeVersionAndChannel`):

```typescript
async getLatestFullyRolledOutRelease(
  runtimeVersion: string,
  channel: string
): Promise<Release | null> {
  const query = `
    SELECT id, runtime_version as "runtimeVersion", channel, path, timestamp,
           commit_hash as "commitHash", commit_message as "commitMessage",
           update_id as "updateId", size, canary_percentage as "canaryPercentage"
    FROM ${Tables.RELEASES}
    WHERE runtime_version = $1 AND channel = $2 AND canary_percentage = 100
    ORDER BY timestamp DESC
    LIMIT 1
  `;
  const { rows } = await this.pool.query(query, [runtimeVersion, channel]);
  return rows[0] || null;
}
```

- [ ] **Step 7: Add `updateCanaryPercentage` method**

This method is called by the PATCH endpoint (Task 8). Add it to the class. (`DatabaseInterface` already includes this method from Task 2.)

```typescript
async updateCanaryPercentage(releaseId: string, canaryPercentage: number): Promise<Release | null> {
  const query = `
    UPDATE ${Tables.RELEASES}
    SET canary_percentage = $1
    WHERE id = $2
    RETURNING id, runtime_version as "runtimeVersion", channel, path, timestamp,
              commit_hash as "commitHash", commit_message as "commitMessage",
              update_id as "updateId", size, canary_percentage as "canaryPercentage"
  `;
  const { rows } = await this.pool.query(query, [canaryPercentage, releaseId]);
  return rows[0] || null;
}
```

- [ ] **Step 8: Verify no TypeScript errors in LocalDatabase**

```bash
npx tsc --noEmit 2>&1 | grep LocalDatabase
```

Expected: no output (no errors for this file).

- [ ] **Step 9: Commit**

```bash
git add apiUtils/database/LocalDatabase.ts apiUtils/database/DatabaseInterface.ts
git commit -m "feat(db): update postgres queries for canaryPercentage, add getLatestFullyRolledOutRelease"
```

---

## Task 4: SupabaseDatabase — Implement Changes

**Files:**
- Modify: `apiUtils/database/SupabaseDatabase.ts`

- [ ] **Step 1: Update `getLatestReleaseRecordForRuntimeVersionAndChannel` to map `canary_percentage`**

Find the return block of this method and add the mapping:

```typescript
if (data) {
  return {
    id: data.id,
    runtimeVersion: data.runtime_version,
    channel: data.channel,
    path: data.path,
    timestamp: data.timestamp,
    commitHash: data.commit_hash,
    commitMessage: data.commit_message,
    updateId: data.update_id,
    size: data.size,
    canaryPercentage: data.canary_percentage ?? 100,
  };
}
return null;
```

- [ ] **Step 2: Update `getReleaseByPath` return mapping**

Find its return block and add `canaryPercentage: data.canary_percentage ?? 100` to the returned object.

- [ ] **Step 3: Update `getRelease` return mapping**

Same — add `canaryPercentage: data.canary_percentage ?? 100`.

- [ ] **Step 4: Update `listReleases` return mapping**

Find the `.map()` call and add `canaryPercentage: r.canary_percentage ?? 100` to each mapped object.

- [ ] **Step 5: Update `createRelease` INSERT**

Find the `.insert({...})` call and add `canary_percentage: release.canaryPercentage ?? 100`.

Also update the return mapping to include `canaryPercentage: data.canary_percentage ?? 100`.

- [ ] **Step 6: Add `getLatestFullyRolledOutRelease` method**

```typescript
async getLatestFullyRolledOutRelease(
  runtimeVersion: string,
  channel: string
): Promise<Release | null> {
  const { data, error } = await this.supabase
    .from(Tables.RELEASES)
    .select()
    .eq('runtime_version', runtimeVersion)
    .eq('channel', channel)
    .eq('canary_percentage', 100)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  if (!data) return null;
  return {
    id: data.id,
    runtimeVersion: data.runtime_version,
    channel: data.channel,
    path: data.path,
    timestamp: data.timestamp,
    commitHash: data.commit_hash,
    commitMessage: data.commit_message,
    updateId: data.update_id,
    size: data.size,
    canaryPercentage: data.canary_percentage ?? 100,
  };
}
```

- [ ] **Step 7: Add `updateCanaryPercentage` method**

```typescript
async updateCanaryPercentage(releaseId: string, canaryPercentage: number): Promise<Release | null> {
  const { data, error } = await this.supabase
    .from(Tables.RELEASES)
    .update({ canary_percentage: canaryPercentage })
    .eq('id', releaseId)
    .select()
    .single();

  if (error) return null;
  if (!data) return null;
  return {
    id: data.id,
    runtimeVersion: data.runtime_version,
    channel: data.channel,
    path: data.path,
    timestamp: data.timestamp,
    commitHash: data.commit_hash,
    commitMessage: data.commit_message,
    updateId: data.update_id,
    size: data.size,
    canaryPercentage: data.canary_percentage ?? 100,
  };
}
```

- [ ] **Step 8: Verify full TypeScript compile**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only pre-existing warnings).

- [ ] **Step 9: Run existing tests — they should still pass**

```bash
bun test 2>&1 | tail -10
```

Expected: `Tests: 49 passed`. If snapshots fail due to new `canaryPercentage` field appearing in responses, run `bun test -- --updateSnapshot` and commit the updated snapshots.

- [ ] **Step 10: Commit**

```bash
git add apiUtils/database/SupabaseDatabase.ts
git commit -m "feat(db): update supabase queries for canaryPercentage, add getLatestFullyRolledOutRelease"
```

---

## Task 5: CohortHelper — TDD

**Files:**
- Create: `apiUtils/helpers/CohortHelper.ts`
- Create: `__tests__/cohort-helper.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/cohort-helper.test.ts`:

```typescript
import { CohortHelper } from '../apiUtils/helpers/CohortHelper';
import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { Release } from '../apiUtils/database/DatabaseInterface';

jest.mock('../apiUtils/database/DatabaseFactory');

const makeRelease = (overrides: Partial<Release> = {}): Release => ({
  id: 'rel-1',
  runtimeVersion: '1.0.0',
  channel: 'production',
  path: 'updates/production/1.0.0/20260101.zip',
  timestamp: '2026-01-01T00:00:00Z',
  commitHash: 'abc123',
  commitMessage: 'feat: new version',
  updateId: 'update-uuid-1',
  canaryPercentage: 100,
  ...overrides,
});

describe('CohortHelper.getBucket', () => {
  it('returns a number between 0 and 99', () => {
    const bucket = CohortHelper.getBucket('device-abc', 'production');
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThan(100);
  });

  it('is deterministic — same input always gives same bucket', () => {
    const a = CohortHelper.getBucket('device-abc', 'production');
    const b = CohortHelper.getBucket('device-abc', 'production');
    expect(a).toBe(b);
  });

  it('different device IDs get different buckets (distribution check)', () => {
    const buckets = new Set(
      Array.from({ length: 1000 }, (_, i) =>
        CohortHelper.getBucket(`device-${i}`, 'production')
      )
    );
    // With 1000 devices and 100 buckets, expect near-full coverage
    expect(buckets.size).toBeGreaterThan(90);
  });

  it('same device, different channel → different bucket', () => {
    const a = CohortHelper.getBucket('device-abc', 'production');
    const b = CohortHelper.getBucket('device-abc', 'staging');
    expect(a).not.toBe(b);
  });
});

describe('CohortHelper.resolveRelease', () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      getLatestReleaseRecordForRuntimeVersionAndChannel: jest.fn(),
      getLatestFullyRolledOutRelease: jest.fn(),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDb);
  });

  it('returns null when no release exists', async () => {
    mockDb.getLatestReleaseRecordForRuntimeVersionAndChannel.mockResolvedValue(null);
    const result = await CohortHelper.resolveRelease({
      runtimeVersion: '1.0.0',
      channel: 'production',
      deviceId: 'device-abc',
    });
    expect(result).toBeNull();
  });

  it('returns the release directly when canaryPercentage is 100', async () => {
    const release = makeRelease({ canaryPercentage: 100 });
    mockDb.getLatestReleaseRecordForRuntimeVersionAndChannel.mockResolvedValue(release);
    const result = await CohortHelper.resolveRelease({
      runtimeVersion: '1.0.0',
      channel: 'production',
      deviceId: 'device-abc',
    });
    expect(result).toBe(release);
    expect(mockDb.getLatestFullyRolledOutRelease).not.toHaveBeenCalled();
  });

  it('returns null when canary < 100 and no deviceId', async () => {
    const release = makeRelease({ canaryPercentage: 10 });
    mockDb.getLatestReleaseRecordForRuntimeVersionAndChannel.mockResolvedValue(release);
    const result = await CohortHelper.resolveRelease({
      runtimeVersion: '1.0.0',
      channel: 'production',
      deviceId: null,
    });
    expect(result).toBeNull();
  });

  it('returns canary release when device bucket falls within percentage', async () => {
    const canaryRelease = makeRelease({ canaryPercentage: 100 }); // we'll force bucket to 0
    // Find a deviceId that hashes to bucket 0 (below any canaryPercentage > 0)
    // Use a known deterministic value: we'll test the logic by mocking getBucket
    const spy = jest.spyOn(CohortHelper, 'getBucket').mockReturnValue(5);
    const latest = makeRelease({ canaryPercentage: 10 });
    mockDb.getLatestReleaseRecordForRuntimeVersionAndChannel.mockResolvedValue(latest);

    const result = await CohortHelper.resolveRelease({
      runtimeVersion: '1.0.0',
      channel: 'production',
      deviceId: 'device-abc',
    });
    expect(result).toBe(latest);
    expect(mockDb.getLatestFullyRolledOutRelease).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('returns stable release when device bucket is >= canaryPercentage', async () => {
    const spy = jest.spyOn(CohortHelper, 'getBucket').mockReturnValue(50);
    const latest = makeRelease({ canaryPercentage: 10 });
    const stable = makeRelease({ id: 'rel-stable', canaryPercentage: 100 });
    mockDb.getLatestReleaseRecordForRuntimeVersionAndChannel.mockResolvedValue(latest);
    mockDb.getLatestFullyRolledOutRelease.mockResolvedValue(stable);

    const result = await CohortHelper.resolveRelease({
      runtimeVersion: '1.0.0',
      channel: 'production',
      deviceId: 'device-abc',
    });
    expect(result).toBe(stable);
    spy.mockRestore();
  });

  it('returns null when outside canary and no stable release exists', async () => {
    const spy = jest.spyOn(CohortHelper, 'getBucket').mockReturnValue(50);
    const latest = makeRelease({ canaryPercentage: 10 });
    mockDb.getLatestReleaseRecordForRuntimeVersionAndChannel.mockResolvedValue(latest);
    mockDb.getLatestFullyRolledOutRelease.mockResolvedValue(null);

    const result = await CohortHelper.resolveRelease({
      runtimeVersion: '1.0.0',
      channel: 'production',
      deviceId: 'device-abc',
    });
    expect(result).toBeNull();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
bun test __tests__/cohort-helper.test.ts 2>&1 | tail -5
```

Expected: `Cannot find module '../apiUtils/helpers/CohortHelper'`

- [ ] **Step 3: Create CohortHelper**

Create `apiUtils/helpers/CohortHelper.ts`:

```typescript
import crypto from 'crypto';

import { DatabaseFactory } from '../database/DatabaseFactory';
import { Release } from '../database/DatabaseInterface';

export class CohortHelper {
  static getBucket(deviceId: string, channel: string): number {
    const hash = crypto.createHash('sha256').update(deviceId + channel).digest('hex');
    return parseInt(hash.slice(0, 8), 16) % 100;
  }

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
    if (!args.deviceId) return null;
    const bucket = CohortHelper.getBucket(args.deviceId, args.channel);
    if (bucket < latest.canaryPercentage) return latest;
    return db.getLatestFullyRolledOutRelease(args.runtimeVersion, args.channel);
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
bun test __tests__/cohort-helper.test.ts 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 5: Run full test suite**

```bash
bun test 2>&1 | tail -5
```

Expected: all 49 tests + new cohort-helper tests pass.

- [ ] **Step 6: Commit**

```bash
git add apiUtils/helpers/CohortHelper.ts __tests__/cohort-helper.test.ts
git commit -m "feat: add CohortHelper with hash-based canary bucket assignment"
```

---

## Task 6: Update manifest.ts

**Files:**
- Modify: `pages/api/manifest.ts`
- Modify: `__tests__/manifest.test.ts`

The existing `manifest.ts` has two queries that must be replaced:
1. Lines 66–84: DB query for `releaseRecord` (updateId early-exit check)
2. Lines 86–104: `UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync` (storage query for bundle path)

Both are replaced by `CohortHelper.resolveRelease`. The `updateBundlePath` is derived from `release.path.replace('.zip', '')`.

The post-response tracking inside `putUpdateInResponseAsync` (line 258) calls `database.getReleaseByPath`. We'll pass the already-resolved `release` to skip that DB call.

- [ ] **Step 1: Update manifest tests to mock CohortHelper**

Open `__tests__/manifest.test.ts`. Add the CohortHelper mock at the top (with other `jest.mock` calls):

```typescript
import { CohortHelper } from '../apiUtils/helpers/CohortHelper';
jest.mock('../apiUtils/helpers/CohortHelper');
```

Update the `makeRelease` helper (or update each mock inline) to include `canaryPercentage`:

Find every object literal that looks like `{ id: 'release-id', runtimeVersion: '1.0.0', ... }` in this test file and add `canaryPercentage: 100` to each.

For the test `'should return NoUpdateAvailable when user is already running the latest release'`:

Replace the `mockDatabase` mock with a `CohortHelper.resolveRelease` mock:

```typescript
it('should return NoUpdateAvailable when user is already running the latest release', async () => {
  const mockRelease: Release = {
    id: 'release-id',
    runtimeVersion: '1.0.0',
    channel: 'production',
    path: 'path/to/update.zip',
    timestamp: '2024-03-20T00:00:00Z',
    commitHash: 'abc123',
    commitMessage: 'Test commit',
    updateId: 'test-update-id',
    canaryPercentage: 100,
  };

  (CohortHelper.resolveRelease as jest.Mock).mockResolvedValue(mockRelease);

  const mockNoUpdateDirective = { type: 'noUpdateAvailable' };
  (UpdateHelper.createNoUpdateAvailableDirectiveAsync as jest.Mock).mockResolvedValue(
    mockNoUpdateDirective
  );

  // ... rest of test unchanged
});
```

For all other tests that previously set up `mockDatabase.getLatestReleaseRecordForRuntimeVersionAndChannel`, replace with the appropriate `(CohortHelper.resolveRelease as jest.Mock).mockResolvedValue(...)` call.

- [ ] **Step 2: Run manifest tests — verify they fail (because manifest.ts not updated yet)**

```bash
bun test __tests__/manifest.test.ts 2>&1 | tail -10
```

Expected: failures because `CohortHelper` is imported but `manifest.ts` doesn't use it yet.

- [ ] **Step 3: Update manifest.ts**

Replace the block from line 66 to line 104 (the DB query + storage query block). Also update `putUpdateInResponseAsync` signature and the call site.

**Replace lines 66–104** with:

```typescript
const deviceIdHeader = req.headers['eas-client-id'];
const deviceId = Array.isArray(deviceIdHeader) ? deviceIdHeader[0] : deviceIdHeader;

const release = await CohortHelper.resolveRelease({
  runtimeVersion,
  channel,
  deviceId: deviceId ?? null,
});

if (!release) {
  logger.info('No update available (canary withheld or no release)', { runtimeVersion, channel });
  await putNoUpdateAvailableInResponseAsync(req, res, protocolVersion);
  return;
}

const currentUpdateId = req.headers['expo-current-update-id'];
if (currentUpdateId === release.updateId) {
  logger.info('User is already running the latest release. Returning NoUpdateAvailable.', {
    runtimeVersion,
    channel,
  });
  await putNoUpdateAvailableInResponseAsync(req, res, protocolVersion);
  return;
}

const updateBundlePath = release.path.replace('.zip', '');
const updateType = await getTypeOfUpdateAsync(updateBundlePath);
```

**Replace the try/catch block** (lines 108–137) with:

```typescript
try {
  if (updateType === UpdateType.NORMAL_UPDATE) {
    logger.info('Found a normal update available.');
    await putUpdateInResponseAsync(
      req,
      res,
      updateBundlePath,
      runtimeVersion,
      platform,
      protocolVersion,
      channel,
      release
    );
  } else if (updateType === UpdateType.ROLLBACK) {
    logger.info('Rollback is available.');
    await putRollBackInResponseAsync(req, res, updateBundlePath, protocolVersion);
  }
} catch (maybeNoUpdateAvailableError) {
  if (maybeNoUpdateAvailableError instanceof NoUpdateAvailableError) {
    logger.info('psych!! User already running latest available update');
    await putNoUpdateAvailableInResponseAsync(req, res, protocolVersion);
    return;
  }
  logger.error(maybeNoUpdateAvailableError);
  res.statusCode = 404;
  res.json({ error: maybeNoUpdateAvailableError });
}
```

**Add the import** at the top of `manifest.ts` (after existing imports):

```typescript
import { CohortHelper } from '../../apiUtils/helpers/CohortHelper';
import { Release } from '../../apiUtils/database/DatabaseInterface';
```

**Remove** the `DatabaseFactory` import if it's no longer used directly (it's used inside CohortHelper now). Check — if the only usage was lines 66–70 and the tracking call, check whether the tracking call still needs it.

**Update `putUpdateInResponseAsync` signature** — add the optional `resolvedRelease` parameter and use it to skip the `getReleaseByPath` call:

```typescript
async function putUpdateInResponseAsync(
  req: NextApiRequest,
  res: NextApiResponse,
  updateBundlePath: string,
  runtimeVersion: string,
  platform: string,
  protocolVersion: number,
  channel: string,
  resolvedRelease?: Release
): Promise<void> {
  // ... existing code unchanged until line 257 ...

  // Replace lines 257–269 (tracking block) with:
  const release = resolvedRelease ?? await DatabaseFactory.getDatabase().getReleaseByPath(updateBundlePath + '.zip');

  if (release) {
    const deviceIdHeader = req.headers['eas-client-id'];
    const deviceId = Array.isArray(deviceIdHeader) ? deviceIdHeader[0] : deviceIdHeader;
    logger.info(`Tracking download for release.`, { releaseId: release.id, deviceId });
    await DatabaseFactory.getDatabase().createTracking({
      platform,
      releaseId: release.id,
      downloadTimestamp: moment().utc().toISOString(),
      deviceId,
    });
  }
}
```

- [ ] **Step 4: Run manifest tests**

```bash
bun test __tests__/manifest.test.ts 2>&1 | tail -10
```

Expected: all manifest tests pass. If snapshot tests fail, update them:

```bash
bun test __tests__/manifest.test.ts -- --updateSnapshot
```

- [ ] **Step 5: Run full test suite**

```bash
bun test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add pages/api/manifest.ts __tests__/manifest.test.ts
git commit -m "feat: integrate CohortHelper into manifest endpoint for canary routing"
```

---

## Task 7: Upload Endpoint — Accept canaryPercentage

**Files:**
- Modify: `pages/api/upload.ts`
- Modify: `scripts/build-and-publish-app-release.sh`

- [ ] **Step 1: Update upload.ts to read and pass canaryPercentage**

In `upload.ts`, after line `const channel = fields.channel?.[0] || 'production';` add:

```typescript
const canaryPercentage = parseInt(fields.canaryPercentage?.[0] ?? '100', 10);
if (isNaN(canaryPercentage) || canaryPercentage < 0 || canaryPercentage > 100) {
  res.status(400).json({ error: 'canaryPercentage must be an integer between 0 and 100' });
  return;
}
```

In the `createRelease` call, add `canaryPercentage` to the object:

```typescript
await DatabaseFactory.getDatabase().createRelease({
  path,
  runtimeVersion,
  channel,
  timestamp: moment().utc().toString(),
  commitHash,
  commitMessage,
  updateId,
  size: zipContent.length,
  canaryPercentage,
});
```

- [ ] **Step 2: Update build-and-publish-app-release.sh to accept --canary-percentage flag**

After the `CHANNEL="${1:-development}"` line, add:

```bash
CANARY_PERCENTAGE="${2:-100}"

# Validate canary percentage
if ! [[ "$CANARY_PERCENTAGE" =~ ^[0-9]+$ ]] || [ "$CANARY_PERCENTAGE" -lt 0 ] || [ "$CANARY_PERCENTAGE" -gt 100 ]; then
  echo "ERROR: canary percentage must be 0-100, got '$CANARY_PERCENTAGE'"
  exit 1
fi
```

Update the usage comment at the top:

```bash
# Uso:
#   ./scripts/build-and-publish-app-release.sh [channel] [canary-percentage]
#
# Examples:
#   ./scripts/build-and-publish-app-release.sh production 10   # 10% canary
#   ./scripts/build-and-publish-app-release.sh production      # 100% full rollout
```

Update the info block to show canary percentage:

```bash
echo "  Canary:          $CANARY_PERCENTAGE%"
```

Add `-F "canaryPercentage=$CANARY_PERCENTAGE"` to the `curl` command (after `-F "channel=$CHANNEL"`).

- [ ] **Step 3: Run upload tests**

```bash
bun test __tests__/upload.test.ts 2>&1 | tail -5
```

Expected: all pass. If snapshots fail due to the new field in responses, update them:

```bash
bun test __tests__/upload.test.ts -- --updateSnapshot
```

- [ ] **Step 4: Commit**

```bash
git add pages/api/upload.ts scripts/build-and-publish-app-release.sh
git commit -m "feat: accept canaryPercentage in upload endpoint and publish script"
```

---

## Task 8: PATCH /api/releases/[id] Endpoint

**Files:**
- Create: `pages/api/releases/[id].ts`
- Create: `__tests__/releases-patch.test.ts`

**Note:** The existing `pages/api/releases.ts` handles GET. The PATCH lives in `pages/api/releases/[id].ts` (dynamic route) so the URL is `PATCH /api/releases/:releaseId`.

- [ ] **Step 1: Write failing tests**

Create `__tests__/releases-patch.test.ts`:

```typescript
import { createMocks } from 'node-mocks-http';
import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { Release } from '../apiUtils/database/DatabaseInterface';
import releasePatchHandler from '../pages/api/releases/[id]';

jest.mock('../apiUtils/database/DatabaseFactory');

const makeRelease = (overrides: Partial<Release> = {}): Release => ({
  id: 'rel-1',
  runtimeVersion: '1.0.0',
  channel: 'production',
  path: 'updates/production/1.0.0/20260101.zip',
  timestamp: '2026-01-01T00:00:00Z',
  commitHash: 'abc123',
  commitMessage: 'feat: test',
  updateId: 'uuid-1',
  canaryPercentage: 100,
  ...overrides,
});

describe('PATCH /api/releases/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.UPLOAD_KEY = 'test-key';
  });

  it('returns 405 for non-PATCH requests', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await releasePatchHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it('allows call without upload key (dashboard usage)', async () => {
    const updated = makeRelease({ canaryPercentage: 50 });
    const mockDb = { updateCanaryPercentage: jest.fn().mockResolvedValue(updated) };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDb);

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'rel-1' },
      body: { canaryPercentage: 50 },
      // no x-upload-key header — dashboard usage
    });
    await releasePatchHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  it('returns 401 when upload key is present but wrong', async () => {
    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'rel-1' },
      headers: { 'x-upload-key': 'wrong-key' },
      body: { canaryPercentage: 50 },
    });
    await releasePatchHandler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 400 when canaryPercentage is missing', async () => {
    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'rel-1' },
      headers: { 'x-upload-key': 'test-key' },
      body: {},
    });
    await releasePatchHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 400 when canaryPercentage is out of range', async () => {
    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'rel-1' },
      headers: { 'x-upload-key': 'test-key' },
      body: { canaryPercentage: 150 },
    });
    await releasePatchHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 404 when release does not exist', async () => {
    const mockDb = { updateCanaryPercentage: jest.fn().mockResolvedValue(null) };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDb);

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'nonexistent' },
      headers: { 'x-upload-key': 'test-key' },
      body: { canaryPercentage: 50 },
    });
    await releasePatchHandler(req, res);
    expect(res._getStatusCode()).toBe(404);
  });

  it('returns updated release on success', async () => {
    const updated = makeRelease({ canaryPercentage: 50 });
    const mockDb = { updateCanaryPercentage: jest.fn().mockResolvedValue(updated) };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDb);

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'rel-1' },
      headers: { 'x-upload-key': 'test-key' },
      body: { canaryPercentage: 50 },
    });
    await releasePatchHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).release.canaryPercentage).toBe(50);
    expect(mockDb.updateCanaryPercentage).toHaveBeenCalledWith('rel-1', 50);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
bun test __tests__/releases-patch.test.ts 2>&1 | tail -5
```

Expected: `Cannot find module '../pages/api/releases/[id]'`

- [ ] **Step 3: Create the endpoint**

Create directory `pages/api/releases/` and file `pages/api/releases/[id].ts`:

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import { DatabaseFactory } from '../../../apiUtils/database/DatabaseFactory';

export default async function releasePatchHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // If x-upload-key header is present (CLI usage), it must be correct.
  // Omitting the header (dashboard usage) is allowed — matching rollback.ts pattern.
  const uploadKey = req.headers['x-upload-key'];
  if (uploadKey && uploadKey !== process.env.UPLOAD_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Missing release id' });
    return;
  }

  const { canaryPercentage } = req.body;
  if (canaryPercentage === undefined || canaryPercentage === null) {
    res.status(400).json({ error: 'Missing canaryPercentage' });
    return;
  }

  const pct = Number(canaryPercentage);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
    res.status(400).json({ error: 'canaryPercentage must be an integer between 0 and 100' });
    return;
  }

  try {
    const release = await DatabaseFactory.getDatabase().updateCanaryPercentage(id, pct);
    if (!release) {
      res.status(404).json({ error: 'Release not found' });
      return;
    }
    res.status(200).json({ release });
  } catch (error) {
    console.error('Failed to update canary percentage:', error);
    res.status(500).json({ error: 'Failed to update canary percentage' });
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
bun test __tests__/releases-patch.test.ts 2>&1 | tail -5
```

Expected: all 7 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
bun test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add pages/api/releases/__tests__/releases-patch.test.ts
git commit -m "feat: add PATCH /api/releases/:id endpoint for canary percentage updates"
```

---

## Task 9: Dashboard UI — Rollout Column and Edit

**Files:**
- Modify: `pages/releases.tsx`

- [ ] **Step 1: Add `canaryPercentage` to the local `Release` interface in releases.tsx**

Find the `interface Release` at the top of `releases.tsx` and add:

```typescript
interface Release {
  path: string;
  runtimeVersion: string;
  channel: string;
  timestamp: string;
  size: number;
  commitHash: string | null;
  commitMessage: string | null;
  id: string;
  canaryPercentage: number;
}
```

- [ ] **Step 2: Add state for inline editing**

In the `ReleasesPage` function, after the existing `useState` calls, add:

```typescript
const [editingReleaseId, setEditingReleaseId] = useState<string | null>(null);
const [editingPercentage, setEditingPercentage] = useState<string>('');
const [savingId, setSavingId] = useState<string | null>(null);
```

- [ ] **Step 3: Add save handler**

```typescript
const saveCanaryPercentage = async (releaseId: string) => {
  const pct = parseInt(editingPercentage, 10);
  if (isNaN(pct) || pct < 0 || pct > 100) {
    showToast('Percentage must be 0–100', 'error');
    return;
  }
  setSavingId(releaseId);
  try {
    const response = await fetch(`/api/releases/${releaseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canaryPercentage: pct }),
    });
    if (!response.ok) throw new Error('Failed to update');
    await fetchReleases();
    setEditingReleaseId(null);
    showToast('Rollout updated', 'success');
  } catch {
    showToast('Failed to update rollout', 'error');
  } finally {
    setSavingId(null);
  }
};
```

**Note:** The dashboard does not send the upload key — matching the pattern of `rollback.ts` which also has no auth for dashboard-originated calls. The PATCH endpoint only requires the upload key for CLI/script usage (`x-upload-key` header). Update `pages/api/releases/[id].ts` to make the auth check: require key only if the header is present (and reject if present but wrong). Calls without the header are allowed from the dashboard.

- [ ] **Step 4: Add Rollout column header**

In the `<Thead>` block, add `<Th>Rollout</Th>` after `<Th>File Size</Th>`.

Add `<Th>Edit Rollout</Th>` after `<Th>Actions</Th>` (or replace — check existing Actions column).

- [ ] **Step 5: Add Rollout badge and inline edit to each row**

In the `<Tbody>` map, after the File Size `<Td>`, add:

```tsx
<Td>
  <Tag
    colorScheme={release.canaryPercentage < 100 ? 'orange' : 'green'}
    borderRadius="full"
    size="sm"
  >
    {release.canaryPercentage < 100 ? `🐤 ${release.canaryPercentage}%` : `✓ 100%`}
  </Tag>
</Td>
<Td>
  {editingReleaseId === release.id ? (
    <HStack spacing={1}>
      <Input
        size="xs"
        w="60px"
        value={editingPercentage}
        onChange={(e) => setEditingPercentage(e.target.value)}
        type="number"
        min={0}
        max={100}
      />
      <Button
        size="xs"
        colorScheme="blue"
        isLoading={savingId === release.id}
        onClick={() => saveCanaryPercentage(release.id)}
      >
        Save
      </Button>
      <Button size="xs" variant="ghost" onClick={() => setEditingReleaseId(null)}>
        Cancel
      </Button>
    </HStack>
  ) : (
    <Button
      size="xs"
      variant="ghost"
      onClick={() => {
        setEditingReleaseId(release.id);
        setEditingPercentage(String(release.canaryPercentage));
      }}
    >
      Edit %
    </Button>
  )}
</Td>
```

Add `Input` to the Chakra UI imports at the top.

- [ ] **Step 6: Build check**

```bash
bun run build 2>&1 | tail -10
```

Expected: successful build with no type errors.

- [ ] **Step 7: Commit**

```bash
git add pages/releases.tsx
git commit -m "feat(ui): add Rollout column and inline canary percentage editor to releases page"
```

---

## Task 10: ADR Documents

**Files:**
- Create: `docs/adr/001-hash-based-cohort-assignment.md`
- Create: `docs/adr/002-canary-percentage-on-release.md`

- [ ] **Step 1: Write ADR-001**

Create `docs/adr/001-hash-based-cohort-assignment.md`:

```markdown
# ADR-001: Hash-based cohort assignment over DB-stored assignments

**Date:** 2026-05-02
**Status:** Accepted

## Context

To route devices to canary or stable releases, the server must decide which "bucket" a device belongs to. Two approaches were considered:

1. **DB-stored assignments:** When a device first requests an update, assign it a cohort, write the assignment to a `cohorts` table, and look it up on subsequent requests.
2. **Hash-based deterministic:** Compute `hash(device_id + channel) % 100` on every request. No DB write needed.

## Decision

Use hash-based deterministic assignment.

## Rationale

- **No DB write per device:** The cohort is computed in microseconds from data already in the request. Zero additional latency, zero additional storage.
- **Stateless and scalable:** Any server instance computes the same result. No shared cache needed for horizontal scaling.
- **Same pattern as industry tools:** LaunchDarkly, Unleash, and Flipt all use hash-based assignment for the same reason.
- **Stable per device:** `hash(device_id + channel)` always produces the same bucket for the same device+channel pair. The user experience is consistent.

## Consequences

- Changing the hash input format (e.g., adding a salt) would reassign all devices to new buckets — this is a breaking change and must not be done while a canary is active.
- The distribution is not perfectly uniform at small scale (< 100 devices), but is statistically uniform at production scale.
```

- [ ] **Step 2: Write ADR-002**

Create `docs/adr/002-canary-percentage-on-release.md`:

```markdown
# ADR-002: canary_percentage lives on the release record, not on a channel config table

**Date:** 2026-05-02
**Status:** Accepted

## Context

The canary percentage (what % of devices receive a new release) could live in two places:

1. **On the release record:** `releases.canary_percentage` — set at upload time, updatable via API.
2. **On a channel config:** A separate `canary_config` table mapping `channel → percentage` — all new releases inherit the channel's configured percentage.

## Decision

Store `canary_percentage` on the `releases` table.

## Rationale

- **Granular control:** A hotfix can be deployed at 100% while an experimental feature ships at 5%, even within the same channel.
- **Backwards compatible:** `DEFAULT 100` means existing releases and tooling require no changes.
- **Simpler schema:** One column addition vs a new table with foreign keys and join logic.
- **Audit trail:** The percentage for each release is recorded in the releases table alongside the commit hash and timestamp. No separate config history needed.

## Consequences

- There is no concept of "this channel always uses 10% canary by default." Each release must explicitly set `--canary-percentage` when a partial rollout is wanted. This is intentional — default is full rollout.
- Sub-project 3 (auto-rollback) will update `canary_percentage` to 0 via the PATCH endpoint when the crash rate threshold is exceeded, which uses the same mechanism built here.
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/
git commit -m "docs: add ADR-001 (hash cohort) and ADR-002 (canary_percentage on release)"
```

---

## Self-Review Checklist

After all tasks are complete:

- [ ] Run full test suite: `bun test`
- [ ] Run TypeScript check: `npx tsc --noEmit`
- [ ] Run lint: `bun run lint`
- [ ] Run build: `bun run build`
- [ ] Verify the DB migration has been run against local/staging DB
- [ ] Verify `NEXT_PUBLIC_UPLOAD_KEY` is documented in `.env.example.local` for the dashboard PATCH to work
