import { createMocks } from 'node-mocks-http';
import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import adoptionHandler from '../pages/api/tracking/adoption';

jest.mock('../apiUtils/database/DatabaseFactory');

describe('Adoption Tracking API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 405 for non-GET requests', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await adoptionHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Method not allowed' });
  });

  it('should return 400 when channel is missing', async () => {
    const mockDatabase = { getAdoptionStats: jest.fn() };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await adoptionHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({ error: 'channel is required' });
    expect(mockDatabase.getAdoptionStats).not.toHaveBeenCalled();
  });

  it('should return adoption stats for the requested channel', async () => {
    const stats = [
      {
        updateId: 'upd-1',
        releaseId: 'rel-1',
        releasePath: 'updates/production/1',
        ios: 3,
        android: 2,
      },
      { updateId: null, releaseId: null, releasePath: null, ios: 1, android: 0 },
    ];
    const mockDatabase = { getAdoptionStats: jest.fn().mockResolvedValue(stats) };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET', query: { channel: 'production' } });
    await adoptionHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ stats });
    expect(mockDatabase.getAdoptionStats).toHaveBeenCalledWith('production');
  });

  it('should handle DB errors gracefully', async () => {
    const mockDatabase = {
      getAdoptionStats: jest.fn().mockRejectedValue(new Error('DB error')),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET', query: { channel: 'production' } });
    await adoptionHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Failed to fetch adoption stats' });
  });
});
