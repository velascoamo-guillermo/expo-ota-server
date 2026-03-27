import { createMocks } from 'node-mocks-http';
import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import allTrackingHandler from '../pages/api/tracking/all';

jest.mock('../apiUtils/database/DatabaseFactory');

const mockReleases = [
  { id: '1', channel: 'production', runtimeVersion: '1.0.0', path: 'updates/production/1.0.0/a.zip', timestamp: '2024-03-20T00:00:00Z', commitHash: 'abc', commitMessage: 'prod' },
  { id: '2', channel: 'staging', runtimeVersion: '1.0.0', path: 'updates/staging/1.0.0/b.zip', timestamp: '2024-03-19T00:00:00Z', commitHash: 'def', commitMessage: 'staging' },
];

describe('Tracking All API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 405 for non-GET requests', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await allTrackingHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });

  it('should return all tracking metrics without channel filter', async () => {
    const mockDatabase = {
      getReleaseTrackingMetricsForAllReleases: jest.fn().mockResolvedValue([
        { platform: 'ios', count: 20 },
        { platform: 'android', count: 10 },
      ]),
      listReleases: jest.fn().mockResolvedValue(mockReleases),
      listChannels: jest.fn().mockResolvedValue(['production', 'staging']),
    };

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await allTrackingHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.trackings).toHaveLength(2);
    expect(data.totalReleases).toBe(2);
    expect(data.channels).toEqual(['production', 'staging']);
    expect(mockDatabase.getReleaseTrackingMetricsForAllReleases).toHaveBeenCalled();
  });

  it('should filter tracking metrics by channel', async () => {
    const mockDatabase = {
      getReleaseTrackingMetricsByChannel: jest.fn().mockResolvedValue([
        { platform: 'ios', count: 5 },
      ]),
      listReleases: jest.fn().mockResolvedValue(mockReleases),
      listChannels: jest.fn().mockResolvedValue(['production', 'staging']),
    };

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET', query: { channel: 'production' } });
    await allTrackingHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.trackings).toHaveLength(1);
    expect(data.totalReleases).toBe(1);
    expect(mockDatabase.getReleaseTrackingMetricsByChannel).toHaveBeenCalledWith('production');
  });

  it('should handle DB errors gracefully', async () => {
    const mockDatabase = {
      getReleaseTrackingMetricsForAllReleases: jest.fn().mockRejectedValue(new Error('DB error')),
      listReleases: jest.fn().mockResolvedValue([]),
      listChannels: jest.fn().mockResolvedValue([]),
    };

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await allTrackingHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });
});
