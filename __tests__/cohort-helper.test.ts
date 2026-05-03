import { CohortHelper } from '../apiUtils/helpers/CohortHelper';
import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { Release } from '../apiUtils/database/DatabaseInterface';

jest.mock('../apiUtils/database/DatabaseFactory');

const makeRelease = (overrides: Partial<Release> = {}): Release => ({
  id: 'rel-1',
  runtimeVersion: '1.0.0',
  channel: 'production',
  path: 'updates/production/1.0.0/20260101.zip',
  timestamp: '2026-01-01T00:00:00Z',
  commitHash: 'abc123',
  commitMessage: 'feat: new version',
  updateId: 'update-uuid-1',
  canaryPercentage: 100,
  ...overrides,
});

describe('CohortHelper.getBucket', () => {
  it('returns a number between 0 and 99', () => {
    const bucket = CohortHelper.getBucket('device-abc', 'production');
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThan(100);
  });

  it('is deterministic — same input always gives same bucket', () => {
    const a = CohortHelper.getBucket('device-abc', 'production');
    const b = CohortHelper.getBucket('device-abc', 'production');
    expect(a).toBe(b);
  });

  it('different device IDs get different buckets (distribution check)', () => {
    const buckets = new Set(
      Array.from({ length: 1000 }, (_, i) =>
        CohortHelper.getBucket(`device-${i}`, 'production')
      )
    );
    // With 1000 devices and 100 buckets, expect near-full coverage
    expect(buckets.size).toBeGreaterThan(90);
  });

  it('same device, different channel → different bucket', () => {
    const a = CohortHelper.getBucket('device-abc', 'production');
    const b = CohortHelper.getBucket('device-abc', 'staging');
    expect(a).not.toBe(b);
  });
});

describe('CohortHelper.resolveRelease', () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      getLatestReleaseRecordForRuntimeVersionAndChannel: jest.fn(),
      getLatestFullyRolledOutRelease: jest.fn(),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDb);
  });

  it('returns null when no release exists', async () => {
    mockDb.getLatestReleaseRecordForRuntimeVersionAndChannel.mockResolvedValue(null);
    const result = await CohortHelper.resolveRelease({
      runtimeVersion: '1.0.0',
      channel: 'production',
      deviceId: 'device-abc',
    });
    expect(result).toBeNull();
  });

  it('returns the release directly when canaryPercentage is 100', async () => {
    const release = makeRelease({ canaryPercentage: 100 });
    mockDb.getLatestReleaseRecordForRuntimeVersionAndChannel.mockResolvedValue(release);
    const result = await CohortHelper.resolveRelease({
      runtimeVersion: '1.0.0',
      channel: 'production',
      deviceId: 'device-abc',
    });
    expect(result).toBe(release);
    expect(mockDb.getLatestFullyRolledOutRelease).not.toHaveBeenCalled();
  });

  it('returns null when canary < 100 and no deviceId', async () => {
    const release = makeRelease({ canaryPercentage: 10 });
    mockDb.getLatestReleaseRecordForRuntimeVersionAndChannel.mockResolvedValue(release);
    const result = await CohortHelper.resolveRelease({
      runtimeVersion: '1.0.0',
      channel: 'production',
      deviceId: null,
    });
    expect(result).toBeNull();
  });

  it('returns canary release when device bucket falls within percentage', async () => {
    const spy = jest.spyOn(CohortHelper, 'getBucket').mockReturnValue(5);
    const latest = makeRelease({ canaryPercentage: 10 });
    mockDb.getLatestReleaseRecordForRuntimeVersionAndChannel.mockResolvedValue(latest);

    const result = await CohortHelper.resolveRelease({
      runtimeVersion: '1.0.0',
      channel: 'production',
      deviceId: 'device-abc',
    });
    expect(result).toBe(latest);
    expect(mockDb.getLatestFullyRolledOutRelease).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('returns stable release when device bucket is >= canaryPercentage', async () => {
    const spy = jest.spyOn(CohortHelper, 'getBucket').mockReturnValue(50);
    const latest = makeRelease({ canaryPercentage: 10 });
    const stable = makeRelease({ id: 'rel-stable', canaryPercentage: 100 });
    mockDb.getLatestReleaseRecordForRuntimeVersionAndChannel.mockResolvedValue(latest);
    mockDb.getLatestFullyRolledOutRelease.mockResolvedValue(stable);

    const result = await CohortHelper.resolveRelease({
      runtimeVersion: '1.0.0',
      channel: 'production',
      deviceId: 'device-abc',
    });
    expect(result).toBe(stable);
    spy.mockRestore();
  });

  it('returns null when outside canary and no stable release exists', async () => {
    const spy = jest.spyOn(CohortHelper, 'getBucket').mockReturnValue(50);
    const latest = makeRelease({ canaryPercentage: 10 });
    mockDb.getLatestReleaseRecordForRuntimeVersionAndChannel.mockResolvedValue(latest);
    mockDb.getLatestFullyRolledOutRelease.mockResolvedValue(null);

    const result = await CohortHelper.resolveRelease({
      runtimeVersion: '1.0.0',
      channel: 'production',
      deviceId: 'device-abc',
    });
    expect(result).toBeNull();
    spy.mockRestore();
  });
});
