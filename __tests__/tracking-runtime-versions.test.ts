import { createMocks } from 'node-mocks-http';
import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import runtimeVersionsHandler from '../pages/api/tracking/runtime-versions';

jest.mock('../apiUtils/database/DatabaseFactory');

describe('Runtime Versions Tracking API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 405 for non-GET requests', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await runtimeVersionsHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Method not allowed' });
  });

  it('should return 400 when channel is missing', async () => {
    const mockDatabase = { getRuntimeVersionDistribution: jest.fn() };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await runtimeVersionsHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({ error: 'channel is required' });
    expect(mockDatabase.getRuntimeVersionDistribution).not.toHaveBeenCalled();
  });

  it('should return runtime version stats for the requested channel', async () => {
    const stats = [
      { runtimeVersion: '2.0.0', ios: 3, android: 2 },
      { runtimeVersion: '1.0.0', ios: 1, android: 0 },
    ];
    const mockDatabase = {
      getRuntimeVersionDistribution: jest.fn().mockResolvedValue(stats),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET', query: { channel: 'production' } });
    await runtimeVersionsHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ stats });
    expect(mockDatabase.getRuntimeVersionDistribution).toHaveBeenCalledWith('production');
  });

  it('should handle DB errors gracefully', async () => {
    const mockDatabase = {
      getRuntimeVersionDistribution: jest.fn().mockRejectedValue(new Error('DB error')),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET', query: { channel: 'production' } });
    await runtimeVersionsHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Failed to fetch runtime version stats' });
  });
});
