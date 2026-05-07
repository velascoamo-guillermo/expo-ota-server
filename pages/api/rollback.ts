import moment from 'moment';
import { NextApiRequest, NextApiResponse } from 'next';

import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';
import { StorageFactory } from '../../apiUtils/storage/StorageFactory';
import { HashHelper } from '../../apiUtils/helpers/HashHelper';
import { ZipHelper } from '../../apiUtils/helpers/ZipHelper';
import AdmZip from 'adm-zip';

export default async function rollbackHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { path, runtimeVersion, commitHash, commitMessage, channel = 'production' } = req.body;

  if (!path) {
    res.status(400).json({ error: 'Missing path' });
    return;
  }

  if (!runtimeVersion) {
    res.status(400).json({ error: 'Missing runtimeVersion' });
    return;
  }

  if (!commitHash) {
    res.status(400).json({ error: 'Missing commitHash' });
    return;
  }

  try {
    const storage = StorageFactory.getStorage();

    const timestamp = moment().utc().format('YYYYMMDDHHmmss');
    const newPath = `updates/${channel}/${runtimeVersion}/${timestamp}.zip`;

    await storage.copyFile(path, newPath);

    const zipBuffer = await storage.downloadFile(newPath);
    const zip = new AdmZip(zipBuffer);

    // Patch metadata.json with a unique rollbackTimestamp so the Expo SDK
    // treats this as a brand-new update (different hash → different updateId).
    // Without this, the SDK recognises the same id from its history and refuses
    // to re-apply what it considers a downgrade.
    const originalMetadata = JSON.parse((await ZipHelper.getFileFromZip(zip, 'metadata.json')).toString('utf-8'));
    const patchedMetadata = Buffer.from(
      JSON.stringify({ ...originalMetadata, rollbackTimestamp: timestamp }),
      'utf-8'
    );
    zip.updateFile('metadata.json', patchedMetadata);
    const patchedZipBuffer = zip.toBuffer();
    await storage.uploadFile(newPath, patchedZipBuffer);

    const updateHash = HashHelper.createHash(patchedMetadata, 'sha256', 'hex');
    const updateId = HashHelper.convertSHA256HashToUUID(updateHash);
    const size = patchedZipBuffer.length;

    await DatabaseFactory.getDatabase().createRelease({
      path: newPath,
      runtimeVersion,
      channel,
      timestamp: moment().utc().toString(),
      commitHash,
      commitMessage,
      updateId,
      size,
    });

    res.status(200).json({ success: true, newPath });
  } catch (error) {
    console.error('Rollback error:', error);
    res.status(500).json({ error: 'Rollback failed' });
  }
}
