import type { IMemoryDb } from 'pg-mem';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

// Backs the `pg` module with an in-memory Postgres (pg-mem) so the downloads
// time-series SQL is exercised behaviorally: per-day bucketing, channel filtering
// through the releases join and the trailing window all run for real. pg-mem does
// not ship DATE_TRUNC/TO_CHAR, so faithful UTC implementations are registered.
jest.mock('pg', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { newDb } = require('pg-mem');
  const db = newDb();
  db.public.registerFunction({
    name: 'date_trunc',
    args: ['text', 'timestamp'],
    returns: 'timestamp',
    implementation: (unit: string, ts: Date) => {
      if (unit !== 'day') throw new Error(`Unsupported date_trunc unit: ${unit}`);
      const d = new Date(ts);
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    },
  });
  db.public.registerFunction({
    name: 'to_char',
    args: ['timestamp', 'text'],
    returns: 'text',
    implementation: (ts: Date, format: string) => {
      if (format !== 'YYYY-MM-DD') throw new Error(`Unsupported to_char format: ${format}`);
      return new Date(ts).toISOString().slice(0, 10);
    },
  });
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

describe('SupabaseDatabase.getDownloadsTimeSeries', () => {
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

  it('aggregates server-side via the get_downloads_time_series RPC (no raw row fetch)', async () => {
    const rpc = setupClient({ data: [], error: null });

    const db = new SupabaseDatabase();
    await db.getDownloadsTimeSeries();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_downloads_time_series', { p_channel: null, p_days: 30 });
  });

  it('passes channel and days through to the RPC', async () => {
    const rpc = setupClient({ data: [], error: null });

    const db = new SupabaseDatabase();
    await db.getDownloadsTimeSeries('staging', 7);

    expect(rpc).toHaveBeenCalledWith('get_downloads_time_series', {
      p_channel: 'staging',
      p_days: 7,
    });
  });

  it('maps RPC rows to numeric download stats', async () => {
    setupClient({
      data: [
        { date: '2026-07-30', count: '2' },
        { date: '2026-07-31', count: 5 },
      ],
      error: null,
    });

    const db = new SupabaseDatabase();
    const stats = await db.getDownloadsTimeSeries();

    expect(stats).toEqual([
      { date: '2026-07-30', count: 2 },
      { date: '2026-07-31', count: 5 },
    ]);
  });

  it('returns an empty array when the RPC yields no rows', async () => {
    setupClient({ data: null, error: null });

    const db = new SupabaseDatabase();
    const stats = await db.getDownloadsTimeSeries();

    expect(stats).toEqual([]);
  });

  it('throws when the RPC fails', async () => {
    setupClient({ data: null, error: { message: 'boom' } });

    const db = new SupabaseDatabase();
    await expect(db.getDownloadsTimeSeries()).rejects.toThrow('boom');
  });
});

describe('PostgresDatabase.getDownloadsTimeSeries (behavioral, pg-mem)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PostgresDatabase: any;

  let schemaCreated = false;

  function resetSchema() {
    const db = getMemDb();
    if (schemaCreated) {
      db.public.none('DELETE FROM releases_tracking; DELETE FROM releases;');
      return;
    }
    schemaCreated = true;
    db.public.none(`
      CREATE TABLE releases (
        id VARCHAR(255) PRIMARY KEY,
        channel VARCHAR(255) NOT NULL
      );
      CREATE TABLE releases_tracking (
        id VARCHAR(255) PRIMARY KEY,
        release_id VARCHAR(255) NOT NULL,
        download_timestamp TIMESTAMP NOT NULL,
        platform VARCHAR(50) NOT NULL
      );
    `);
  }

  function insertRelease(id: string, channel: string) {
    getMemDb().public.none(`INSERT INTO releases (id, channel) VALUES ('${id}', '${channel}')`);
  }

  function insertDownload(id: string, releaseId: string, platform: string, ageDays: number) {
    getMemDb().public.none(`
      INSERT INTO releases_tracking (id, release_id, download_timestamp, platform)
      VALUES ('${id}', '${releaseId}', now() - interval '${ageDays} days', '${platform}')
    `);
  }

  function utcDay(offsetDays: number): string {
    const now = new Date();
    const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return new Date(day + offsetDays * 86_400_000).toISOString().slice(0, 10);
  }

  beforeEach(() => {
    resetSchema();
    ({ PostgresDatabase } = jest.requireActual('../apiUtils/database/LocalDatabase'));
  });

  it('counts downloads per day across platforms in ascending date order', async () => {
    insertRelease('r1', 'production');
    insertDownload('t1', 'r1', 'ios', 2);
    insertDownload('t2', 'r1', 'android', 2);
    insertDownload('t3', 'r1', 'ios', 0);

    const db = new PostgresDatabase();
    const stats = await db.getDownloadsTimeSeries();

    expect(stats).toEqual([
      { date: utcDay(-2), count: 2 },
      { date: utcDay(0), count: 1 },
    ]);
  });

  it('only counts downloads of the requested channel', async () => {
    insertRelease('r-prod', 'production');
    insertRelease('r-staging', 'staging');
    insertDownload('t1', 'r-prod', 'ios', 1);
    insertDownload('t2', 'r-staging', 'android', 1);

    const db = new PostgresDatabase();
    const stats = await db.getDownloadsTimeSeries('production');

    expect(stats).toEqual([{ date: utcDay(-1), count: 1 }]);
  });

  it('counts all channels when no channel is given', async () => {
    insertRelease('r-prod', 'production');
    insertRelease('r-staging', 'staging');
    insertDownload('t1', 'r-prod', 'ios', 1);
    insertDownload('t2', 'r-staging', 'android', 1);

    const db = new PostgresDatabase();
    const stats = await db.getDownloadsTimeSeries();

    expect(stats).toEqual([{ date: utcDay(-1), count: 2 }]);
  });

  it('ignores downloads outside the trailing window', async () => {
    insertRelease('r1', 'production');
    insertDownload('t1', 'r1', 'ios', 5);
    insertDownload('t2', 'r1', 'android', 45);

    const db = new PostgresDatabase();
    const stats = await db.getDownloadsTimeSeries();

    expect(stats).toEqual([{ date: utcDay(-5), count: 1 }]);
  });

  it('respects a custom days window', async () => {
    // Ages avoid the exact window edge (days - 1): pg-mem's CURRENT_DATE keeps the
    // time-of-day instead of truncating to midnight like real Postgres, so a row
    // aged exactly days - 1 would flake on insert/query timing.
    insertRelease('r1', 'production');
    insertDownload('t1', 'r1', 'ios', 0);
    insertDownload('t2', 'r1', 'ios', 5);
    insertDownload('t3', 'r1', 'ios', 8);

    const db = new PostgresDatabase();
    const stats = await db.getDownloadsTimeSeries(undefined, 7);

    expect(stats).toEqual([
      { date: utcDay(-5), count: 1 },
      { date: utcDay(0), count: 1 },
    ]);
  });

  it('returns an empty array when there are no downloads', async () => {
    const db = new PostgresDatabase();
    const stats = await db.getDownloadsTimeSeries();

    expect(stats).toEqual([]);
  });
});
