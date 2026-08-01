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

describe('SupabaseDatabase.getMAUStats', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let SupabaseDatabase: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  it('aggregates server-side via the get_mau_stats RPC (no raw row fetch)', async () => {
    const rpc = setupClient({ data: [], error: null });

    const db = new SupabaseDatabase();
    await db.getMAUStats();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_mau_stats', { p_channel: null });
  });

  it('passes the channel through to the RPC', async () => {
    const rpc = setupClient({ data: [], error: null });

    const db = new SupabaseDatabase();
    await db.getMAUStats('staging');

    expect(rpc).toHaveBeenCalledWith('get_mau_stats', { p_channel: 'staging' });
  });

  it('maps RPC rows to numeric MAU stats in ascending month order', async () => {
    setupClient({
      data: [
        { month: '2026-06', ios: '2', android: '0' },
        { month: '2026-07', ios: 1, android: 1 },
      ],
      error: null,
    });

    const db = new SupabaseDatabase();
    const stats = await db.getMAUStats();

    expect(stats).toEqual([
      { month: '2026-06', ios: 2, android: 0 },
      { month: '2026-07', ios: 1, android: 1 },
    ]);
  });

  it('returns an empty array when the RPC yields no rows', async () => {
    setupClient({ data: null, error: null });

    const db = new SupabaseDatabase();
    const stats = await db.getMAUStats();

    expect(stats).toEqual([]);
  });

  it('throws when the RPC fails', async () => {
    setupClient({ data: null, error: { message: 'boom' } });

    const db = new SupabaseDatabase();
    await expect(db.getMAUStats()).rejects.toThrow('boom');
  });
});

describe('PostgresDatabase.getMAUStats', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PostgresDatabase: any;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ _query: mockQuery } = jest.requireMock('pg'));
    ({ PostgresDatabase } = jest.requireActual('../apiUtils/database/LocalDatabase'));
  });

  it('unions check_ins with releases_tracking and dedups devices per month', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const db = new PostgresDatabase();
    await db.getMAUStats();

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/UNION ALL/i);
    expect(sql).toContain(Tables.CHECK_INS);
    expect(sql).toContain(Tables.RELEASES_TRACKING);
    expect(sql).toMatch(/COUNT\(DISTINCT/i);
  });

  it('keeps the 12-month window on both arms of the union', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const db = new PostgresDatabase();
    await db.getMAUStats();

    const [sql] = mockQuery.mock.calls[0];
    const windowClauses = sql.match(/INTERVAL '12 months'/g) ?? [];
    expect(windowClauses.length).toBe(2);
  });

  it('applies the channel filter to both arms of the union', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const db = new PostgresDatabase();
    await db.getMAUStats('staging');

    const [sql, values] = mockQuery.mock.calls[0];
    expect(values).toEqual(['staging']);
    const channelClauses = sql.match(/\$1/g) ?? [];
    expect(channelClauses.length).toBe(2);
  });

  it('omits the channel parameter when no channel is given', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const db = new PostgresDatabase();
    await db.getMAUStats();

    const [sql, values] = mockQuery.mock.calls[0];
    expect(values).toEqual([]);
    expect(sql).not.toContain('$1');
  });

  it('maps rows to numeric MAU stats', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { month: '2026-06', ios: '2', android: '1' },
        { month: '2026-07', ios: '3', android: '0' },
      ],
    });

    const db = new PostgresDatabase();
    const stats = await db.getMAUStats();

    expect(stats).toEqual([
      { month: '2026-06', ios: 2, android: 1 },
      { month: '2026-07', ios: 3, android: 0 },
    ]);
  });
});
