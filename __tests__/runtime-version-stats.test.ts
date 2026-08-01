import type { IMemoryDb } from 'pg-mem';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

// Backs the `pg` module with an in-memory Postgres (pg-mem) so the runtime version
// distribution SQL is exercised behaviorally: DISTINCT ON latest-check-in-wins,
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

describe('SupabaseDatabase.getRuntimeVersionDistribution', () => {
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

  it('aggregates server-side via the get_runtime_version_distribution RPC (no raw row fetch)', async () => {
    const rpc = setupClient({ data: [], error: null });

    const db = new SupabaseDatabase();
    await db.getRuntimeVersionDistribution('production');

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_runtime_version_distribution', {
      p_channel: 'production',
    });
  });

  it('maps RPC rows to RuntimeVersionStat with numeric counts', async () => {
    setupClient({
      data: [
        { runtime_version: '2.0.0', ios: '3', android: 2 },
        { runtime_version: '1.0.0', ios: 1, android: '0' },
      ],
      error: null,
    });

    const db = new SupabaseDatabase();
    const stats = await db.getRuntimeVersionDistribution('production');

    expect(stats).toEqual([
      { runtimeVersion: '2.0.0', ios: 3, android: 2 },
      { runtimeVersion: '1.0.0', ios: 1, android: 0 },
    ]);
  });

  it('returns an empty array when the RPC yields no rows', async () => {
    setupClient({ data: null, error: null });

    const db = new SupabaseDatabase();
    const stats = await db.getRuntimeVersionDistribution('production');

    expect(stats).toEqual([]);
  });

  it('throws when the RPC fails', async () => {
    setupClient({ data: null, error: { message: 'boom' } });

    const db = new SupabaseDatabase();
    await expect(db.getRuntimeVersionDistribution('production')).rejects.toThrow('boom');
  });
});

describe('PostgresDatabase.getRuntimeVersionDistribution (behavioral, pg-mem)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PostgresDatabase: any;

  let schemaCreated = false;

  function resetSchema() {
    const db = getMemDb();
    if (schemaCreated) {
      db.public.none('DELETE FROM check_ins;');
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
    `);
  }

  function insertCheckIn(
    id: string,
    deviceId: string,
    platform: string,
    channel: string,
    runtimeVersion: string,
    ageDays: number
  ) {
    getMemDb().public.none(`
      INSERT INTO check_ins (id, device_id, platform, channel, runtime_version, current_update_id, day, last_seen)
      VALUES ('${id}', '${deviceId}', '${platform}', '${channel}',
              '${runtimeVersion}', NULL,
              (now() - interval '${ageDays} days')::date, now() - interval '${ageDays} days')
    `);
  }

  beforeEach(() => {
    resetSchema();
    ({ PostgresDatabase } = jest.requireActual('../apiUtils/database/LocalDatabase'));
  });

  it('counts each device once, using its latest check-in', async () => {
    // dev-1 checked in on 1.0.0 two days ago, then on 2.0.0 yesterday:
    // only the latest check-in must count.
    insertCheckIn('c1', 'dev-1', 'ios', 'production', '1.0.0', 2);
    insertCheckIn('c2', 'dev-1', 'ios', 'production', '2.0.0', 1);

    const db = new PostgresDatabase();
    const stats = await db.getRuntimeVersionDistribution('production');

    expect(stats).toEqual([{ runtimeVersion: '2.0.0', ios: 1, android: 0 }]);
  });

  it('groups by runtime version and counts platforms independently', async () => {
    insertCheckIn('c1', 'dev-a', 'ios', 'production', '2.0.0', 1);
    insertCheckIn('c2', 'dev-b', 'ios', 'production', '2.0.0', 2);
    insertCheckIn('c3', 'dev-c', 'android', 'production', '2.0.0', 1);
    insertCheckIn('c4', 'dev-d', 'android', 'production', '1.0.0', 1);

    const db = new PostgresDatabase();
    const stats = await db.getRuntimeVersionDistribution('production');

    expect(stats).toEqual([
      { runtimeVersion: '2.0.0', ios: 2, android: 1 },
      { runtimeVersion: '1.0.0', ios: 0, android: 1 },
    ]);
  });

  it('orders runtime versions descending', async () => {
    insertCheckIn('c1', 'dev-a', 'ios', 'production', '1.0.0', 1);
    insertCheckIn('c2', 'dev-b', 'ios', 'production', '3.0.0', 1);
    insertCheckIn('c3', 'dev-c', 'android', 'production', '2.0.0', 1);

    const db = new PostgresDatabase();
    const stats = await db.getRuntimeVersionDistribution('production');

    expect(stats.map((s: { runtimeVersion: string }) => s.runtimeVersion)).toEqual([
      '3.0.0',
      '2.0.0',
      '1.0.0',
    ]);
  });

  it('only counts devices of the requested channel', async () => {
    insertCheckIn('c1', 'dev-prod', 'ios', 'production', '1.0.0', 1);
    insertCheckIn('c2', 'dev-staging', 'android', 'staging', '1.0.0', 1);

    const db = new PostgresDatabase();
    const stats = await db.getRuntimeVersionDistribution('production');

    expect(stats).toEqual([{ runtimeVersion: '1.0.0', ios: 1, android: 0 }]);
  });

  it('ignores check-ins outside the 30-day window', async () => {
    insertCheckIn('c1', 'dev-recent', 'ios', 'production', '1.0.0', 5);
    insertCheckIn('c2', 'dev-stale', 'android', 'production', '1.0.0', 45);

    const db = new PostgresDatabase();
    const stats = await db.getRuntimeVersionDistribution('production');

    expect(stats).toEqual([{ runtimeVersion: '1.0.0', ios: 1, android: 0 }]);
  });
});
