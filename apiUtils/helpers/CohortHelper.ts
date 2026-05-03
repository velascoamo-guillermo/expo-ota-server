import crypto from 'crypto';

import { DatabaseFactory } from '../database/DatabaseFactory';
import { Release } from '../database/DatabaseInterface';

export class CohortHelper {
  static getBucket(deviceId: string, channel: string): number {
    const hash = crypto.createHash('sha256').update(deviceId + channel).digest('hex');
    return parseInt(hash.slice(0, 8), 16) % 100;
  }

  static async resolveRelease(args: {
    runtimeVersion: string;
    channel: string;
    deviceId: string | null;
  }): Promise<Release | null> {
    const db = DatabaseFactory.getDatabase();
    const latest = await db.getLatestReleaseRecordForRuntimeVersionAndChannel(
      args.runtimeVersion,
      args.channel
    );
    if (!latest) return null;
    if (latest.canaryPercentage === 100) return latest;
    if (!args.deviceId) return null;
    const bucket = CohortHelper.getBucket(args.deviceId, args.channel);
    if (bucket < latest.canaryPercentage) return latest;
    return db.getLatestFullyRolledOutRelease(args.runtimeVersion, args.channel);
  }
}
