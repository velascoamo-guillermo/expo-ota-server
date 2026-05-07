import { createMocks } from 'node-mocks-http';
import AdmZip from 'adm-zip';

import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { StorageFactory } from '../apiUtils/storage/StorageFactory';
import rollbackHandler from '../pages/api/rollback';

function makeFakeZip(): Buffer {
  const zip = new AdmZip();
  zip.addFile('metadata.json', Buffer.from(JSON.stringify({ version: 0, bundler: 'metro', fileMetadata: {} }), 'utf-8'));
  return zip.toBuffer();
}

jest.mock('../apiUtils/database/DatabaseFactory');
jest.mock('../apiUtils/storage/StorageFactory');

describe('Rollback API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 405 for non-POST requests', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await rollbackHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });

  it('should return 400 for missing required fields', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {},
    });
    await rollbackHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });

  it('should handle rollback successfully', async () => {
    const fakeZip = makeFakeZip();
    const mockStorage = {
      copyFile: jest.fn().mockResolvedValue(true),
      downloadFile: jest.fn().mockResolvedValue(fakeZip),
      uploadFile: jest.fn().mockResolvedValue('updates/production/1.0.0/new.zip'),
    };

    const mockDatabase = {
      createRelease: jest.fn().mockResolvedValue(true),
    };

    (StorageFactory.getStorage as jest.Mock).mockReturnValue(mockStorage);
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    Date.now = jest.fn(() => new Date('2020-05-13T12:33:37.000Z').getTime());

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        path: 'updates/production/1.0.0/old.zip',
        runtimeVersion: '1.0.0',
        channel: 'production',
        commitHash: 'abc123',
      },
    });

    await rollbackHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getData()).toMatchSnapshot();
    expect(mockStorage.copyFile).toHaveBeenCalled();
    expect(mockDatabase.createRelease).toHaveBeenCalled();
  });
});
