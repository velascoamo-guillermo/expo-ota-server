import { Tables } from '../apiUtils/database/DatabaseFactory';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('pg', () => {
  const query = jest.fn();
  return { Pool: jest.fn(() => ({ query })), _query: query };
});

interface RpcResult {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
}

describe('SupabaseDatabase.getDAUStats', () => {
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

  it('aggregates server-side via the get_dau_stats RPC (no raw row fetch)', async () => {
    const rpc = setupClient({ data: [], error: null });

    const db = new SupabaseDatabase();
    await db.getDAUStats();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_dau_stats', { p_channel: null });
  });

  it('passes the channel through to the RPC', async () => {
    const rpc = setupClient({ data: [], error: null });

    const db = new SupabaseDatabase();
    await db.getDAUStats('staging');

    expect(rpc).toHaveBeenCalledWith('get_dau_stats', { p_channel: 'staging' });
  });

  it('maps RPC rows to numeric DAU stats in ascending date order', async () => {
    setupClient({
      data: [
        { date: '2026-07-30', ios: '2', android: '0' },
        { date: '2026-07-31', ios: 1, android: 1 },
      ],
      error: null,
    });

    const db = new SupabaseDatabase();
    const stats = await db.getDAUStats();

    expect(stats).toEqual([
      { date: '2026-07-30', ios: 2, android: 0 },
      { date: '2026-07-31', ios: 1, android: 1 },
    ]);
  });

  it('returns an empty array when the RPC yields no rows', async () => {
    setupClient({ data: null, error: null });

    const db = new SupabaseDatabase();
    const stats = await db.getDAUStats();

    expect(stats).toEqual([]);
  });

  it('throws when the RPC fails', async () => {
    setupClient({ data: null, error: { message: 'boom' } });

    const db = new SupabaseDatabase();
    await expect(db.getDAUStats()).rejects.toThrow('boom');
  });
});

describe('PostgresDatabase.getDAUStats', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PostgresDatabase: any;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ _query: mockQuery } = jest.requireMock('pg'));
    ({ PostgresDatabase } = jest.requireActual('../apiUtils/database/LocalDatabase'));
  });

  it('aggregates unique devices per day per platform from check_ins only', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const db = new PostgresDatabase();
    await db.getDAUStats();

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain(Tables.CHECK_INS);
    expect(sql).not.toContain(Tables.RELEASES_TRACKING);
    expect(sql).toMatch(/COUNT\(DISTINCT/i);
    expect(sql).toMatch(/GROUP BY/i);
  });

  it('restricts the query to the 30-day window', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const db = new PostgresDatabase();
    await db.getDAUStats();

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INTERVAL '29 days'/);
  });

  it('applies the channel filter when a channel is given', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const db = new PostgresDatabase();
    await db.getDAUStats('staging');

    const [sql, values] = mockQuery.mock.calls[0];
    expect(values).toEqual(['staging']);
    expect(sql).toContain('$1');
  });

  it('omits the channel parameter when no channel is given', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const db = new PostgresDatabase();
    await db.getDAUStats();

    const [sql, values] = mockQuery.mock.calls[0];
    expect(values).toEqual([]);
    expect(sql).not.toContain('$1');
  });

  it('maps rows to numeric DAU stats', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { date: '2026-07-30', ios: '2', android: '1' },
        { date: '2026-07-31', ios: '3', android: '0' },
      ],
    });

    const db = new PostgresDatabase();
    const stats = await db.getDAUStats();

    expect(stats).toEqual([
      { date: '2026-07-30', ios: 2, android: 1 },
      { date: '2026-07-31', ios: 3, android: 0 },
    ]);
  });
});
