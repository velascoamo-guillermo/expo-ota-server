import { createMocks } from 'node-mocks-http';
import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import channelsHandler from '../pages/api/channels';

jest.mock('../apiUtils/database/DatabaseFactory');

const mockRelease = {
  id: '1',
  path: 'updates/production/1.0.0/update.zip',
  runtimeVersion: '1.0.0',
  channel: 'production',
  timestamp: '2024-03-20T00:00:00Z',
  commitHash: 'abc123',
  commitMessage: 'Test commit',
  size: 1024,
};

describe('Channels API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 405 for non-GET requests', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await channelsHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });

  it('should return channels with summary data', async () => {
    const mockDatabase = {
      listReleases: jest.fn().mockResolvedValue([mockRelease]),
      listChannels: jest.fn().mockResolvedValue(['production']),
      getReleaseTrackingMetricsByChannel: jest.fn().mockResolvedValue([
        { platform: 'ios', count: 10 },
        { platform: 'android', count: 5 },
      ]),
    };

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await channelsHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.channels).toHaveLength(1);
    expect(data.channels[0].name).toBe('production');
    expect(data.channels[0].totalReleases).toBe(1);
    expect(data.channels[0].totalDownloads).toBe(15);
    expect(data.channels[0].iosDownloads).toBe(10);
    expect(data.channels[0].androidDownloads).toBe(5);
    expect(data.channels[0].activeRelease.id).toBe('1');
  });

  it('should return multiple channels', async () => {
    const stagingRelease = { ...mockRelease, id: '2', channel: 'staging', path: 'updates/staging/1.0.0/update.zip' };
    const mockDatabase = {
      listReleases: jest.fn().mockResolvedValue([mockRelease, stagingRelease]),
      listChannels: jest.fn().mockResolvedValue(['production', 'staging']),
      getReleaseTrackingMetricsByChannel: jest.fn().mockResolvedValue([]),
    };

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await channelsHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.channels).toHaveLength(2);
    expect(data.channels.map((c: any) => c.name)).toEqual(['production', 'staging']);
  });

  it('should return empty channels when no releases exist', async () => {
    const mockDatabase = {
      listReleases: jest.fn().mockResolvedValue([]),
      listChannels: jest.fn().mockResolvedValue([]),
      getReleaseTrackingMetricsByChannel: jest.fn().mockResolvedValue([]),
    };

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await channelsHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.channels).toHaveLength(0);
  });

  it('should handle DB errors gracefully', async () => {
    const mockDatabase = {
      listReleases: jest.fn().mockRejectedValue(new Error('DB error')),
      listChannels: jest.fn().mockRejectedValue(new Error('DB error')),
      getReleaseTrackingMetricsByChannel: jest.fn().mockResolvedValue([]),
    };

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await channelsHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });
});
