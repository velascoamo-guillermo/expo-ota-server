import AdmZip from 'adm-zip';
import FormData from 'form-data';
import { createMocks } from 'node-mocks-http';

import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { DatabaseInterface, Release } from '../apiUtils/database/DatabaseInterface';
import { CohortHelper } from '../apiUtils/helpers/CohortHelper';
import { ConfigHelper } from '../apiUtils/helpers/ConfigHelper';
import { HashHelper } from '../apiUtils/helpers/HashHelper';
import { UpdateHelper } from '../apiUtils/helpers/UpdateHelper';
import { ZipHelper } from '../apiUtils/helpers/ZipHelper';
import manifestEndpoint from '../pages/api/manifest';

jest.mock('../apiUtils/helpers/UpdateHelper');
jest.mock('../apiUtils/helpers/ZipHelper');
jest.mock('../apiUtils/helpers/ConfigHelper');
jest.mock('../apiUtils/helpers/HashHelper');
jest.mock('../apiUtils/database/DatabaseFactory');
jest.mock('../apiUtils/helpers/CohortHelper');
jest.mock('form-data');

const DEVICE_ID = '8FC8EFE3-B0DF-4F27-9D2A-F2BFDDA540AC';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function mockFormDataInstance() {
  const mockFormData = {
    append: jest.fn(),
    getBoundary: jest.fn().mockReturnValue('boundary'),
    getBuffer: jest.fn().mockReturnValue(Buffer.from('mock-form-data')),
  };
  (FormData as unknown as jest.Mock).mockImplementation(() => mockFormData);
  return mockFormData;
}

function mockDatabase(overrides: Partial<Record<string, jest.Mock>> = {}): {
  upsertCheckIn: jest.Mock;
  createTracking: jest.Mock;
} {
  const db = {
    upsertCheckIn: jest.fn().mockResolvedValue(undefined),
    createTracking: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(db as unknown as DatabaseInterface);
  return db;
}

const baseRelease: Release = {
  id: 'release-id',
  runtimeVersion: '1.0.0',
  channel: 'production',
  path: 'path/to/update.zip',
  timestamp: '2024-03-20T00:00:00Z',
  commitHash: 'abc123',
  commitMessage: 'Test commit',
  updateId: 'latest-update-id',
  canaryPercentage: 100,
};

describe('Manifest check-ins', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upserts a check-in on the NoUpdateAvailable path (no release resolved)', async () => {
    const db = mockDatabase();
    (CohortHelper.resolveRelease as jest.Mock).mockResolvedValue(null);
    (UpdateHelper.createNoUpdateAvailableDirectiveAsync as jest.Mock).mockResolvedValue({
      type: 'noUpdateAvailable',
    });
    mockFormDataInstance();

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': '1.0.0',
        'expo-protocol-version': '1',
        'expo-channel-name': 'staging',
        'eas-client-id': DEVICE_ID,
      },
    });

    await manifestEndpoint(req, res);
    await flushPromises();

    expect(res._getStatusCode()).toBe(200);
    expect(db.upsertCheckIn).toHaveBeenCalledTimes(1);
    expect(db.upsertCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: DEVICE_ID,
        platform: 'ios',
        channel: 'staging',
        runtimeVersion: '1.0.0',
        currentUpdateId: null,
        day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        lastSeen: expect.any(String),
      })
    );
  });

  it('upserts a check-in when the client already runs the latest release', async () => {
    const db = mockDatabase();
    (CohortHelper.resolveRelease as jest.Mock).mockResolvedValue(baseRelease);
    (UpdateHelper.createNoUpdateAvailableDirectiveAsync as jest.Mock).mockResolvedValue({
      type: 'noUpdateAvailable',
    });
    mockFormDataInstance();

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'expo-platform': 'android',
        'expo-runtime-version': '2.0.0',
        'expo-protocol-version': '1',
        'expo-current-update-id': 'latest-update-id',
        'eas-client-id': DEVICE_ID,
      },
    });

    await manifestEndpoint(req, res);
    await flushPromises();

    expect(res._getStatusCode()).toBe(200);
    expect(db.upsertCheckIn).toHaveBeenCalledTimes(1);
    expect(db.upsertCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: DEVICE_ID,
        platform: 'android',
        channel: 'production',
        runtimeVersion: '2.0.0',
        currentUpdateId: 'latest-update-id',
      })
    );
  });

  it('upserts a check-in on the normal update path', async () => {
    const db = mockDatabase();
    (CohortHelper.resolveRelease as jest.Mock).mockResolvedValue({
      ...baseRelease,
      updateId: 'different-update-id',
    });

    (HashHelper.convertSHA256HashToUUID as jest.Mock).mockReturnValue('some-uuid');
    (UpdateHelper.getMetadataAsync as jest.Mock).mockResolvedValue({
      metadataJson: {
        fileMetadata: { ios: { assets: [], bundle: 'bundle.js' } },
      },
      createdAt: '2024-03-20T00:00:00Z',
      id: 'test-id',
    });
    (UpdateHelper.getAssetMetadataAsync as jest.Mock).mockResolvedValue({
      hash: 'hash',
      key: 'key',
      fileExtension: '.js',
      contentType: 'application/javascript',
      url: 'url',
    });
    (ConfigHelper.getExpoConfigAsync as jest.Mock).mockResolvedValue({});
    (ZipHelper.getZipFromStorage as jest.Mock).mockResolvedValue({
      getEntry: jest.fn().mockReturnValue(null),
    } as unknown as AdmZip);
    mockFormDataInstance();

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': '1.0.0',
        'expo-protocol-version': '1',
        'expo-current-update-id': 'current-update-id',
        'eas-client-id': DEVICE_ID,
      },
    });

    await manifestEndpoint(req, res);
    await flushPromises();

    expect(res._getStatusCode()).toBe(200);
    expect(db.upsertCheckIn).toHaveBeenCalledTimes(1);
    expect(db.upsertCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: DEVICE_ID,
        platform: 'ios',
        channel: 'production',
        runtimeVersion: '1.0.0',
        currentUpdateId: 'current-update-id',
      })
    );
  });

  it('skips the check-in entirely when eas-client-id header is absent', async () => {
    const db = mockDatabase();
    (CohortHelper.resolveRelease as jest.Mock).mockResolvedValue(null);
    (UpdateHelper.createNoUpdateAvailableDirectiveAsync as jest.Mock).mockResolvedValue({
      type: 'noUpdateAvailable',
    });
    mockFormDataInstance();

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': '1.0.0',
        'expo-protocol-version': '1',
      },
    });

    await manifestEndpoint(req, res);
    await flushPromises();

    expect(res._getStatusCode()).toBe(200);
    expect(db.upsertCheckIn).not.toHaveBeenCalled();
  });

  it('still returns 200 when the check-in upsert fails', async () => {
    const db = mockDatabase({
      upsertCheckIn: jest.fn().mockRejectedValue(new Error('db down')),
    });
    (CohortHelper.resolveRelease as jest.Mock).mockResolvedValue(null);
    (UpdateHelper.createNoUpdateAvailableDirectiveAsync as jest.Mock).mockResolvedValue({
      type: 'noUpdateAvailable',
    });
    mockFormDataInstance();

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': '1.0.0',
        'expo-protocol-version': '1',
        'eas-client-id': DEVICE_ID,
      },
    });

    await manifestEndpoint(req, res);
    await flushPromises();

    expect(db.upsertCheckIn).toHaveBeenCalledTimes(1);
    expect(res._getStatusCode()).toBe(200);
  });
});
