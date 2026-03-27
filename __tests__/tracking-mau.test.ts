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
        { month: '2026-01', ios: 80, android: 20 },
        { month: '2026-02', ios: 90, android: 30 },
        { month: '2026-03', ios: 70, android: 25 },
      ]),
    };

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await mauHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.stats).toHaveLength(3);
    expect(data.stats[0]).toEqual({ month: '2026-01', ios: 80, android: 20 });
    expect(mockDatabase.getMAUStats).toHaveBeenCalledWith(undefined);
  });

  it('should filter MAU stats by channel', async () => {
    const mockDatabase = {
      getMAUStats: jest.fn().mockResolvedValue([
        { month: '2026-02', ios: 40, android: 10 },
        { month: '2026-03', ios: 50, android: 10 },
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
