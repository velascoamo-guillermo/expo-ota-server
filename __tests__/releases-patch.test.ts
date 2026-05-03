import { createMocks } from 'node-mocks-http';
import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { Release } from '../apiUtils/database/DatabaseInterface';
import releasePatchHandler from '../pages/api/releases/[id]';

jest.mock('../apiUtils/database/DatabaseFactory');

const makeRelease = (overrides: Partial<Release> = {}): Release => ({
  id: 'rel-1',
  runtimeVersion: '1.0.0',
  channel: 'production',
  path: 'updates/production/1.0.0/20260101.zip',
  timestamp: '2026-01-01T00:00:00Z',
  commitHash: 'abc123',
  commitMessage: 'feat: test',
  updateId: 'uuid-1',
  canaryPercentage: 100,
  ...overrides,
});

describe('PATCH /api/releases/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.UPLOAD_KEY = 'test-key';
  });

  it('returns 405 for non-PATCH requests', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await releasePatchHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it('allows call without upload key (dashboard usage)', async () => {
    const updated = makeRelease({ canaryPercentage: 50 });
    const mockDb = { updateCanaryPercentage: jest.fn().mockResolvedValue(updated) };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDb);

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'rel-1' },
      body: { canaryPercentage: 50 },
    });
    await releasePatchHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  it('returns 401 when upload key is present but wrong', async () => {
    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'rel-1' },
      headers: { 'x-upload-key': 'wrong-key' },
      body: { canaryPercentage: 50 },
    });
    await releasePatchHandler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 400 when canaryPercentage is missing', async () => {
    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'rel-1' },
      body: {},
    });
    await releasePatchHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 400 when canaryPercentage is out of range', async () => {
    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'rel-1' },
      body: { canaryPercentage: 150 },
    });
    await releasePatchHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 404 when release does not exist', async () => {
    const mockDb = { updateCanaryPercentage: jest.fn().mockResolvedValue(null) };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDb);

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'nonexistent' },
      body: { canaryPercentage: 50 },
    });
    await releasePatchHandler(req, res);
    expect(res._getStatusCode()).toBe(404);
  });

  it('returns updated release on success', async () => {
    const updated = makeRelease({ canaryPercentage: 50 });
    const mockDb = { updateCanaryPercentage: jest.fn().mockResolvedValue(updated) };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDb);

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'rel-1' },
      headers: { 'x-upload-key': 'test-key' },
      body: { canaryPercentage: 50 },
    });
    await releasePatchHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).release.canaryPercentage).toBe(50);
    expect(mockDb.updateCanaryPercentage).toHaveBeenCalledWith('rel-1', 50);
  });
});
