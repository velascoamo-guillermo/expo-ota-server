import { NextApiRequest, NextApiResponse } from 'next';
import { DatabaseFactory } from '../../../apiUtils/database/DatabaseFactory';
import { DAUStat } from '../../../apiUtils/database/DatabaseInterface';
import { zeroFillDAUStats } from '../../../apiUtils/helpers/DAUHelper';

export interface DAUResponse {
  stats: DAUStat[];
}

export default async function dauHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const channel = (req.query.channel as string) ?? undefined;
    const stats = await DatabaseFactory.getDatabase().getDAUStats(channel);
    res.status(200).json({ stats: zeroFillDAUStats(stats) });
  } catch (error) {
    console.error('Failed to fetch DAU stats:', error);
    res.status(500).json({ error: 'Failed to fetch DAU stats' });
  }
}
