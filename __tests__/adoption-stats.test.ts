import type { IMemoryDb } from 'pg-mem';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

// Backs the `pg` module with an in-memory Postgres (pg-mem) so the adoption SQL
// is exercised behaviorally: DISTINCT ON latest-check-in-wins, LEFT JOIN bucketing,
// channel filtering and the 30-day window all run for real.
jest.mock('pg', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { newDb } = require('pg-mem');
  const db = newDb();
  (globalThis as { __pgMemDb?: unknown }).__pgMemDb = db;
  return db.adapters.createPg();
});

function getMemDb(): IMemoryDb {
  return (globalThis as { __pgMemDb?: IMemoryDb }).__pgMemDb as IMemoryDb;
}

interface RpcResult {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
}

describe('SupabaseDatabase.getAdoptionStats', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let SupabaseDatabase: any;
  let createClient: jest.Mock;
  const originalEnv = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_API_KEY };

  function setupClient(result: RpcResult): jest.Mock {
    const rpc = jest.fn().mockResolvedValue(result);
    createClient.mockReturnValue({ rpc });
    return rpc;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_API_KEY = 'test-key';
    ({ createClient } = jest.requireMock('@supabase/supabase-js'));
    ({ SupabaseDatabase } = jest.requireActual('../apiUtils/database/SupabaseDatabase'));
  });

  afterAll(() => {
    process.env.SUPABASE_URL = originalEnv.url;
    process.env.SUPABASE_API_KEY = originalEnv.key;
  });

  it('aggregates server-side via the get_adoption_stats RPC (no raw row fetch)', async () => {
    const rpc = setupClient({ data: [], error: null });

    const db = new SupabaseDatabase();
    await db.getAdoptionStats('production');

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_adoption_stats', { p_channel: 'production' });
  });

  it('maps RPC rows to AdoptionStat with numeric counts', async () => {
    setupClient({
      data: [
        {
          update_id: 'upd-1',
          release_id: 'rel-1',
          release_path: 'updates/production/1',
          ios: '3',
          android: 2,
        },
        { update_id: null, release_id: null, release_path: null, ios: 1, android: '0' },
      ],
      error: null,
    });

    const db = new SupabaseDatabase();
    const stats = await db.getAdoptionStats('production');

    expect(stats).toEqual([
      {
        updateId: 'upd-1',
        releaseId: 'rel-1',
        releasePath: 'updates/production/1',
        ios: 3,
        android: 2,
      },
      { updateId: null, releaseId: null, releasePath: null, ios: 1, android: 0 },
    ]);
  });

  it('returns an empty array when the RPC yields no rows', async () => {
    setupClient({ data: null, error: null });

    const db = new SupabaseDatabase();
    const stats = await db.getAdoptionStats('production');

    expect(stats).toEqual([]);
  });

  it('throws when the RPC fails', async () => {
    setupClient({ data: null, error: { message: 'boom' } });

    const db = new SupabaseDatabase();
    await expect(db.getAdoptionStats('production')).rejects.toThrow('boom');
  });
});

describe('PostgresDatabase.getAdoptionStats (behavioral, pg-mem)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PostgresDatabase: any;

  let schemaCreated = false;

  function resetSchema() {
    const db = getMemDb();
    if (schemaCreated) {
      db.public.none('DELETE FROM check_ins; DELETE FROM releases;');
      return;
    }
    schemaCreated = true;
    db.public.none(`
      CREATE TABLE check_ins (
        id VARCHAR(255) PRIMARY KEY,
        device_id VARCHAR(255) NOT NULL,
        platform VARCHAR(50) NOT NULL,
        channel VARCHAR(255) NOT NULL,
        runtime_version VARCHAR(255) NOT NULL,
        current_update_id VARCHAR(255),
        day DATE NOT NULL,
        last_seen TIMESTAMP NOT NULL
      );
      CREATE TABLE releases (
        id VARCHAR(255) PRIMARY KEY,
        runtime_version VARCHAR(255) NOT NULL,
        channel VARCHAR(255) NOT NULL,
        path VARCHAR(255) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        update_id VARCHAR(255)
      );
    `);
  }

  function insertRelease(id: string, channel: string, path: string, updateId: string | null, ageDays = 10) {
    getMemDb().public.none(`
      INSERT INTO releases (id, runtime_version, channel, path, timestamp, update_id)
      VALUES ('${id}', '1.0.0', '${channel}', '${path}', now() - interval '${ageDays} days', ${updateId === null ? 'NULL' : `'${updateId}'`})
    `);
  }

  function insertCheckIn(
    id: string,
    deviceId: string,
    platform: string,
    channel: string,
    updateId: string | null,
    ageDays: number
  ) {
    getMemDb().public.none(`
      INSERT INTO check_ins (id, device_id, platform, channel, runtime_version, current_update_id, day, last_seen)
      VALUES ('${id}', '${deviceId}', '${platform}', '${channel}',
              '1.0.0', ${updateId === null ? 'NULL' : `'${updateId}'`},
              (now() - interval '${ageDays} days')::date, now() - interval '${ageDays} days')
    `);
  }

  beforeEach(() => {
    resetSchema();
    ({ PostgresDatabase } = jest.requireActual('../apiUtils/database/LocalDatabase'));
  });

  it('counts each device once, using its latest check-in', async () => {
    insertRelease('rel-old', 'production', 'updates/production/old', 'upd-old');
    insertRelease('rel-new', 'production', 'updates/production/new', 'upd-new');
    // dev-1 checked in on upd-old two days ago, then on upd-new yesterday:
    // only the latest check-in must count.
    insertCheckIn('c1', 'dev-1', 'ios', 'production', 'upd-old', 2);
    insertCheckIn('c2', 'dev-1', 'ios', 'production', 'upd-new', 1);

    const db = new PostgresDatabase();
    const stats = await db.getAdoptionStats('production');

    expect(stats).toEqual([
      {
        updateId: 'upd-new',
        releaseId: 'rel-new',
        releasePath: 'updates/production/new',
        ios: 1,
        android: 0,
      },
    ]);
  });

  it('groups NULL and unmatched update ids into a single unknown bucket', async () => {
    insertRelease('rel-1', 'production', 'updates/production/1', 'upd-1');
    insertCheckIn('c1', 'dev-embedded', 'ios', 'production', null, 1);
    insertCheckIn('c2', 'dev-ghost', 'android', 'production', 'upd-unknown', 1);
    insertCheckIn('c3', 'dev-current', 'ios', 'production', 'upd-1', 1);

    const db = new PostgresDatabase();
    const stats = await db.getAdoptionStats('production');

    expect(stats).toEqual([
      {
        updateId: 'upd-1',
        releaseId: 'rel-1',
        releasePath: 'updates/production/1',
        ios: 1,
        android: 0,
      },
      { updateId: null, releaseId: null, releasePath: null, ios: 1, android: 1 },
    ]);
  });

  it('only counts devices and matches releases of the requested channel', async () => {
    insertRelease('rel-prod', 'production', 'updates/production/1', 'upd-1');
    insertRelease('rel-staging', 'staging', 'updates/staging/1', 'upd-staging');
    insertCheckIn('c1', 'dev-prod', 'ios', 'production', 'upd-1', 1);
    insertCheckIn('c2', 'dev-staging', 'android', 'staging', 'upd-staging', 1);

    const db = new PostgresDatabase();
    const stats = await db.getAdoptionStats('production');

    expect(stats).toEqual([
      {
        updateId: 'upd-1',
        releaseId: 'rel-prod',
        releasePath: 'updates/production/1',
        ios: 1,
        android: 0,
      },
    ]);
  });

  it('ignores check-ins outside the 30-day window', async () => {
    insertRelease('rel-1', 'production', 'updates/production/1', 'upd-1');
    insertCheckIn('c1', 'dev-recent', 'ios', 'production', 'upd-1', 5);
    insertCheckIn('c2', 'dev-stale', 'android', 'production', 'upd-1', 45);

    const db = new PostgresDatabase();
    const stats = await db.getAdoptionStats('production');

    expect(stats).toEqual([
      {
        updateId: 'upd-1',
        releaseId: 'rel-1',
        releasePath: 'updates/production/1',
        ios: 1,
        android: 0,
      },
    ]);
  });

  it('counts platforms independently within a bucket', async () => {
    insertRelease('rel-1', 'production', 'updates/production/1', 'upd-1');
    insertCheckIn('c1', 'dev-a', 'ios', 'production', 'upd-1', 1);
    insertCheckIn('c2', 'dev-b', 'ios', 'production', 'upd-1', 2);
    insertCheckIn('c3', 'dev-c', 'android', 'production', 'upd-1', 1);

    const db = new PostgresDatabase();
    const stats = await db.getAdoptionStats('production');

    expect(stats).toEqual([
      {
        updateId: 'upd-1',
        releaseId: 'rel-1',
        releasePath: 'updates/production/1',
        ios: 2,
        android: 1,
      },
    ]);
  });
});
