import { NextApiRequest, NextApiResponse } from 'next';
import { DatabaseFactory } from '../../../apiUtils/database/DatabaseFactory';

export default async function releasePatchHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // If x-upload-key header is present (CLI usage), it must be correct.
  // Omitting the header (dashboard usage) is allowed — matching rollback.ts pattern.
  const uploadKey = req.headers['x-upload-key'];
  if (uploadKey && uploadKey !== process.env.UPLOAD_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Missing release id' });
    return;
  }

  const { canaryPercentage } = req.body;
  if (canaryPercentage === undefined || canaryPercentage === null) {
    res.status(400).json({ error: 'Missing canaryPercentage' });
    return;
  }

  const pct = Number(canaryPercentage);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
    res.status(400).json({ error: 'canaryPercentage must be an integer between 0 and 100' });
    return;
  }

  try {
    const release = await DatabaseFactory.getDatabase().updateCanaryPercentage(id, pct);
    if (!release) {
      res.status(404).json({ error: 'Release not found' });
      return;
    }
    res.status(200).json({ release });
  } catch (error) {
    console.error('Failed to update canary percentage:', error);
    res.status(500).json({ error: 'Failed to update canary percentage' });
  }
}
