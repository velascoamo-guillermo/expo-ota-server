import { createMocks } from 'node-mocks-http';
import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { DAU_WINDOW_DAYS } from '../apiUtils/helpers/DAUHelper';
import dauHandler from '../pages/api/tracking/dau';

jest.mock('../apiUtils/database/DatabaseFactory');

function utcDay(offsetDays: number): string {
  const now = new Date();
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(day + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

describe('DAU Tracking API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 405 for non-GET requests', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await dauHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Method not allowed' });
  });

  it('should return a zero-filled 30-day window when there is no data', async () => {
    const mockDatabase = { getDAUStats: jest.fn().mockResolvedValue([]) };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await dauHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.stats).toHaveLength(DAU_WINDOW_DAYS);
    expect(data.stats[0]).toEqual({ date: utcDay(-(DAU_WINDOW_DAYS - 1)), ios: 0, android: 0 });
    expect(data.stats[DAU_WINDOW_DAYS - 1]).toEqual({ date: utcDay(0), ios: 0, android: 0 });
  });

  it('should merge DB stats into the zero-filled window', async () => {
    const mockDatabase = {
      getDAUStats: jest.fn().mockResolvedValue([
        { date: utcDay(-1), ios: 4, android: 2 },
        { date: utcDay(0), ios: 7, android: 3 },
      ]),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await dauHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.stats).toHaveLength(DAU_WINDOW_DAYS);
    expect(data.stats[DAU_WINDOW_DAYS - 2]).toEqual({ date: utcDay(-1), ios: 4, android: 2 });
    expect(data.stats[DAU_WINDOW_DAYS - 1]).toEqual({ date: utcDay(0), ios: 7, android: 3 });
    expect(data.stats[0]).toEqual({ date: utcDay(-(DAU_WINDOW_DAYS - 1)), ios: 0, android: 0 });
    expect(mockDatabase.getDAUStats).toHaveBeenCalledWith(undefined);
  });

  it('should filter DAU stats by channel', async () => {
    const mockDatabase = { getDAUStats: jest.fn().mockResolvedValue([]) };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET', query: { channel: 'staging' } });
    await dauHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockDatabase.getDAUStats).toHaveBeenCalledWith('staging');
  });

  it('should handle DB errors gracefully', async () => {
    const mockDatabase = {
      getDAUStats: jest.fn().mockRejectedValue(new Error('DB error')),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await dauHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Failed to fetch DAU stats' });
  });
});
