import { UpdateHelper, NoUpdateAvailableError } from '../apiUtils/helpers/UpdateHelper';
import { StorageFactory } from '../apiUtils/storage/StorageFactory';

jest.mock('../apiUtils/storage/StorageFactory');

const mockStorage = {
  fileExists: jest.fn(),
  listFiles: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (StorageFactory.getStorage as jest.Mock).mockReturnValue(mockStorage);
});

describe('UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync', () => {
  it('returns path from channel directory when it exists', async () => {
    mockStorage.fileExists.mockImplementation((path: string) =>
      Promise.resolve(path === 'updates/production/1.0.0')
    );
    mockStorage.listFiles.mockResolvedValue([{ name: '20260101120000.zip' }]);

    const result = await UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync('1.0.0', 'production');

    expect(result).toBe('updates/production/1.0.0/20260101120000');
  });

  it('falls back to legacy directory when channel directory does not exist', async () => {
    mockStorage.fileExists.mockImplementation((path: string) =>
      Promise.resolve(path === 'updates/1.0.0')
    );
    mockStorage.listFiles.mockResolvedValue([{ name: '20260101120000.zip' }]);

    const result = await UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync('1.0.0', 'production');

    expect(result).toBe('updates/1.0.0/20260101120000');
  });

  it('prefers channel directory over legacy when both exist', async () => {
    mockStorage.fileExists.mockResolvedValue(true);
    mockStorage.listFiles.mockResolvedValue([{ name: '20260301120000.zip' }]);

    const result = await UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync('1.0.0', 'production');

    expect(result).toBe('updates/production/1.0.0/20260301120000');
  });

  it('throws NoUpdateAvailableError when neither directory exists', async () => {
    mockStorage.fileExists.mockResolvedValue(false);

    await expect(
      UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync('1.0.0', 'production')
    ).rejects.toThrow(NoUpdateAvailableError);
  });

  it('throws NoUpdateAvailableError when directory exists but has no zip files', async () => {
    mockStorage.fileExists.mockResolvedValue(true);
    mockStorage.listFiles.mockResolvedValue([]);

    await expect(
      UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync('1.0.0', 'production')
    ).rejects.toThrow(NoUpdateAvailableError);
  });

  it('returns the latest zip when multiple files exist', async () => {
    mockStorage.fileExists.mockImplementation((path: string) =>
      Promise.resolve(path === 'updates/production/1.0.0')
    );
    mockStorage.listFiles.mockResolvedValue([
      { name: '20260101120000.zip' },
      { name: '20260315120000.zip' },
      { name: '20260201120000.zip' },
    ]);

    const result = await UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync('1.0.0', 'production');

    expect(result).toBe('updates/production/1.0.0/20260315120000');
  });
});
