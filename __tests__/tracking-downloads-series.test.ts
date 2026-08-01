import { createMocks } from 'node-mocks-http';
import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { DOWNLOADS_WINDOW_DAYS } from '../apiUtils/helpers/DownloadsHelper';
import downloadsSeriesHandler from '../pages/api/tracking/downloads-series';

jest.mock('../apiUtils/database/DatabaseFactory');

function utcDay(offsetDays: number): string {
  const now = new Date();
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(day + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

describe('Downloads Series Tracking API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 405 for non-GET requests', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await downloadsSeriesHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Method not allowed' });
  });

  it('should return a zero-filled 30-day window when there is no data', async () => {
    const mockDatabase = { getDownloadsTimeSeries: jest.fn().mockResolvedValue([]) };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await downloadsSeriesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.stats).toHaveLength(DOWNLOADS_WINDOW_DAYS);
    expect(data.stats[0]).toEqual({ date: utcDay(-(DOWNLOADS_WINDOW_DAYS - 1)), count: 0 });
    expect(data.stats[DOWNLOADS_WINDOW_DAYS - 1]).toEqual({ date: utcDay(0), count: 0 });
    expect(mockDatabase.getDownloadsTimeSeries).toHaveBeenCalledWith(
      undefined,
      DOWNLOADS_WINDOW_DAYS
    );
  });

  it('should merge DB stats into the zero-filled window', async () => {
    const mockDatabase = {
      getDownloadsTimeSeries: jest.fn().mockResolvedValue([
        { date: utcDay(-1), count: 4 },
        { date: utcDay(0), count: 7 },
      ]),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await downloadsSeriesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.stats).toHaveLength(DOWNLOADS_WINDOW_DAYS);
    expect(data.stats[DOWNLOADS_WINDOW_DAYS - 2]).toEqual({ date: utcDay(-1), count: 4 });
    expect(data.stats[DOWNLOADS_WINDOW_DAYS - 1]).toEqual({ date: utcDay(0), count: 7 });
    expect(data.stats[0]).toEqual({ date: utcDay(-(DOWNLOADS_WINDOW_DAYS - 1)), count: 0 });
  });

  it('should filter download stats by channel', async () => {
    const mockDatabase = { getDownloadsTimeSeries: jest.fn().mockResolvedValue([]) };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET', query: { channel: 'staging' } });
    await downloadsSeriesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockDatabase.getDownloadsTimeSeries).toHaveBeenCalledWith(
      'staging',
      DOWNLOADS_WINDOW_DAYS
    );
  });

  it('should honor a custom days window', async () => {
    const mockDatabase = { getDownloadsTimeSeries: jest.fn().mockResolvedValue([]) };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET', query: { days: '7' } });
    await downloadsSeriesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.stats).toHaveLength(7);
    expect(data.stats[0]).toEqual({ date: utcDay(-6), count: 0 });
    expect(data.stats[6]).toEqual({ date: utcDay(0), count: 0 });
    expect(mockDatabase.getDownloadsTimeSeries).toHaveBeenCalledWith(undefined, 7);
  });

  it.each(['0', '366', '-1', '1.5', 'abc', ''])(
    'should return 400 for invalid days value %p',
    async (days) => {
      const mockDatabase = { getDownloadsTimeSeries: jest.fn() };
      (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

      const { req, res } = createMocks({ method: 'GET', query: { days } });
      await downloadsSeriesHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'days must be an integer between 1 and 365',
      });
      expect(mockDatabase.getDownloadsTimeSeries).not.toHaveBeenCalled();
    }
  );

  it('should accept the window bounds 1 and 365', async () => {
    const mockDatabase = { getDownloadsTimeSeries: jest.fn().mockResolvedValue([]) };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    for (const days of [1, 365]) {
      const { req, res } = createMocks({ method: 'GET', query: { days: String(days) } });
      await downloadsSeriesHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData()).stats).toHaveLength(days);
      expect(mockDatabase.getDownloadsTimeSeries).toHaveBeenCalledWith(undefined, days);
    }
  });

  it('should handle DB errors gracefully', async () => {
    const mockDatabase = {
      getDownloadsTimeSeries: jest.fn().mockRejectedValue(new Error('DB error')),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await downloadsSeriesHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Failed to fetch download stats' });
  });
});
