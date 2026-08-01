import { Tables } from '../apiUtils/database/DatabaseFactory';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('pg', () => {
  const query = jest.fn();
  return { Pool: jest.fn(() => ({ query })), _query: query };
});

interface QueryResult {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
}

interface MockBuilder extends PromiseLike<QueryResult> {
  select: jest.Mock;
  not: jest.Mock;
  gte: jest.Mock;
  eq: jest.Mock;
}

function createBuilder(result: QueryResult): MockBuilder {
  const builder = {
    select: jest.fn(),
    not: jest.fn(),
    gte: jest.fn(),
    eq: jest.fn(),
    then: <T>(resolve: (value: QueryResult) => T | PromiseLike<T>): PromiseLike<T> =>
      Promise.resolve(result).then(resolve),
  } as unknown as MockBuilder;
  builder.select.mockReturnValue(builder);
  builder.not.mockReturnValue(builder);
  builder.gte.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

describe('SupabaseDatabase.getMAUStats', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let SupabaseDatabase: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let createClient: jest.Mock;

  function setupClient(builders: Partial<Record<string, MockBuilder>>) {
    const from = jest.fn((table: string) => {
      const builder = builders[table];
      if (!builder) throw new Error(`Unexpected table: ${table}`);
      return builder;
    });
    createClient.mockReturnValue({ from });
    return from;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_API_KEY = 'test-key';
    ({ createClient } = jest.requireMock('@supabase/supabase-js'));
    ({ SupabaseDatabase } = jest.requireActual('../apiUtils/database/SupabaseDatabase'));
  });

  it('counts a device that only checked in (no download) toward MAU', async () => {
    setupClient({
      [Tables.RELEASES_TRACKING]: createBuilder({ data: [], error: null }),
      [Tables.CHECK_INS]: createBuilder({
        data: [{ device_id: 'device-1', platform: 'ios', day: '2026-07-03' }],
        error: null,
      }),
    });

    const db = new SupabaseDatabase();
    const stats = await db.getMAUStats();

    expect(stats).toEqual([{ month: '2026-07', ios: 1, android: 0 }]);
  });

  it('counts a device present in both sources the same month only once', async () => {
    setupClient({
      [Tables.RELEASES_TRACKING]: createBuilder({
        data: [
          {
            device_id: 'device-1',
            platform: 'ios',
            download_timestamp: '2026-07-10T12:00:00.000Z',
          },
        ],
        error: null,
      }),
      [Tables.CHECK_INS]: createBuilder({
        data: [{ device_id: 'device-1', platform: 'ios', day: '2026-07-05' }],
        error: null,
      }),
    });

    const db = new SupabaseDatabase();
    const stats = await db.getMAUStats();

    expect(stats).toEqual([{ month: '2026-07', ios: 1, android: 0 }]);
  });

  it('merges distinct devices from both sources per platform and month', async () => {
    setupClient({
      [Tables.RELEASES_TRACKING]: createBuilder({
        data: [
          {
            device_id: 'device-1',
            platform: 'ios',
            download_timestamp: '2026-06-20T09:00:00.000Z',
          },
        ],
        error: null,
      }),
      [Tables.CHECK_INS]: createBuilder({
        data: [
          { device_id: 'device-2', platform: 'ios', day: '2026-06-21' },
          { device_id: 'device-3', platform: 'android', day: '2026-07-01' },
        ],
        error: null,
      }),
    });

    const db = new SupabaseDatabase();
    const stats = await db.getMAUStats();

    expect(stats).toEqual([
      { month: '2026-06', ios: 2, android: 0 },
      { month: '2026-07', ios: 0, android: 1 },
    ]);
  });

  it('applies the channel filter to both sources', async () => {
    const trackingBuilder = createBuilder({ data: [], error: null });
    const checkInsBuilder = createBuilder({ data: [], error: null });
    setupClient({
      [Tables.RELEASES_TRACKING]: trackingBuilder,
      [Tables.CHECK_INS]: checkInsBuilder,
    });

    const db = new SupabaseDatabase();
    await db.getMAUStats('staging');

    expect(trackingBuilder.eq).toHaveBeenCalledWith(`${Tables.RELEASES}.channel`, 'staging');
    expect(checkInsBuilder.eq).toHaveBeenCalledWith('channel', 'staging');
  });

  it('throws when either source query fails', async () => {
    setupClient({
      [Tables.RELEASES_TRACKING]: createBuilder({ data: [], error: null }),
      [Tables.CHECK_INS]: createBuilder({ data: null, error: { message: 'boom' } }),
    });

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
