import { createMocks } from 'node-mocks-http';
import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import mauHandler from '../pages/api/tracking/mau';

jest.mock('../apiUtils/database/DatabaseFactory');

describe('MAU Tracking API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 405 for non-GET requests', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await mauHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });

  it('should return MAU stats for all channels', async () => {
    const mockDatabase = {
      getMAUStats: jest.fn().mockResolvedValue([
        { month: '2026-01', mau: 100 },
        { month: '2026-02', mau: 120 },
        { month: '2026-03', mau: 95 },
      ]),
    };

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await mauHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.stats).toHaveLength(3);
    expect(data.stats[0]).toEqual({ month: '2026-01', mau: 100 });
    expect(mockDatabase.getMAUStats).toHaveBeenCalledWith(undefined);
  });

  it('should filter MAU stats by channel', async () => {
    const mockDatabase = {
      getMAUStats: jest.fn().mockResolvedValue([
        { month: '2026-02', mau: 50 },
        { month: '2026-03', mau: 60 },
      ]),
    };

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET', query: { channel: 'staging' } });
    await mauHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.stats).toHaveLength(2);
    expect(mockDatabase.getMAUStats).toHaveBeenCalledWith('staging');
  });

  it('should return empty stats when no data', async () => {
    const mockDatabase = {
      getMAUStats: jest.fn().mockResolvedValue([]),
    };

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await mauHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.stats).toHaveLength(0);
  });

  it('should handle DB errors gracefully', async () => {
    const mockDatabase = {
      getMAUStats: jest.fn().mockRejectedValue(new Error('DB error')),
    };

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await mauHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });
});
