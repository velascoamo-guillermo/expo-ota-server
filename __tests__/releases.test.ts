import { createMocks } from 'node-mocks-http';

import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import releasesHandler from '../pages/api/releases';

jest.mock('../apiUtils/database/DatabaseFactory');

describe('Releases API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 405 for non-GET requests', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await releasesHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });

  it('should return releases successfully', async () => {
    const mockDatabase = {
      listReleases: jest.fn().mockResolvedValue([
        {
          id: '1',
          path: 'updates/production/1.0.0/update.zip',
          runtimeVersion: '1.0.0',
          channel: 'production',
          timestamp: '2024-03-20T00:00:00Z',
          commitHash: 'abc123',
          commitMessage: 'Test commit',
        },
      ]),
      getDownloadCountsPerRelease: jest.fn().mockResolvedValue({ '1': 5 }),
    };

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await releasesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });

  it('should filter releases by channel', async () => {
    const mockDatabase = {
      listReleases: jest.fn().mockResolvedValue([
        { id: '1', path: 'updates/production/1.0.0/a.zip', runtimeVersion: '1.0.0', channel: 'production', timestamp: '2024-03-20T00:00:00Z', commitHash: 'abc', commitMessage: 'prod' },
        { id: '2', path: 'updates/staging/1.0.0/b.zip', runtimeVersion: '1.0.0', channel: 'staging', timestamp: '2024-03-20T00:00:00Z', commitHash: 'def', commitMessage: 'staging' },
      ]),
      getDownloadCountsPerRelease: jest.fn().mockResolvedValue({}),
    };

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET', query: { channel: 'staging' } });
    await releasesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.releases).toHaveLength(1);
    expect(data.releases[0].channel).toBe('staging');
  });

  it('should handle errors gracefully', async () => {
    const mockDatabase = {
      listReleases: jest.fn().mockRejectedValue(new Error('DB error')),
      getDownloadCountsPerRelease: jest.fn().mockResolvedValue({}),
    };

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await releasesHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });
});
