import { Pool } from 'pg';

import {
  AdoptionStat,
  CheckIn,
  DatabaseInterface,
  DAUStat,
  MAUStat,
  Release,
  Tracking,
  TrackingMetrics,
} from './DatabaseInterface';
import { Tables } from './DatabaseFactory';

export class PostgresDatabase implements DatabaseInterface {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
    });
  }
  async listChannels(): Promise<string[]> {
    const query = `SELECT DISTINCT channel FROM ${Tables.RELEASES} ORDER BY channel ASC`;
    const { rows } = await this.pool.query(query);
    return rows.map((row) => row.channel);
  }

  async getReleaseTrackingMetricsByChannel(channel: string): Promise<TrackingMetrics[]> {
    const query = `
      SELECT rt.platform, COUNT(*) as count
      FROM ${Tables.RELEASES_TRACKING} rt
      JOIN ${Tables.RELEASES} r ON r.id = rt.release_id
      WHERE r.channel = $1
      GROUP BY rt.platform
    `;
    const { rows } = await this.pool.query(query, [channel]);
    return rows.map((row) => ({
      platform: row.platform,
      count: Number(row.count),
    }));
  }

  async getLatestReleaseRecordForRuntimeVersionAndChannel(
    runtimeVersion: string,
    channel: string
  ): Promise<Release | null> {
    const query = `
      SELECT id, runtime_version as "runtimeVersion", channel, path, timestamp,
             commit_hash as "commitHash", commit_message as "commitMessage",
             update_id as "updateId", size, canary_percentage as "canaryPercentage"
      FROM ${Tables.RELEASES} WHERE runtime_version = $1 AND channel = $2
      ORDER BY timestamp DESC
      LIMIT 1
    `;
    const { rows } = await this.pool.query(query, [runtimeVersion, channel]);
    return rows[0] || null;
  }

  async getLatestFullyRolledOutRelease(
    runtimeVersion: string,
    channel: string
  ): Promise<Release | null> {
    const query = `
      SELECT id, runtime_version as "runtimeVersion", channel, path, timestamp,
             commit_hash as "commitHash", commit_message as "commitMessage",
             update_id as "updateId", size, canary_percentage as "canaryPercentage"
      FROM ${Tables.RELEASES}
      WHERE runtime_version = $1 AND channel = $2 AND canary_percentage = 100
      ORDER BY timestamp DESC
      LIMIT 1
    `;
    const { rows } = await this.pool.query(query, [runtimeVersion, channel]);
    return rows[0] || null;
  }
  async getReleaseByPath(path: string): Promise<Release | null> {
    const query = `
      SELECT id, runtime_version as "runtimeVersion", channel, path, timestamp,
             commit_hash as "commitHash", commit_message as "commitMessage",
             update_id as "updateId", size, canary_percentage as "canaryPercentage"
      FROM ${Tables.RELEASES} WHERE path = $1
    `;
    const { rows } = await this.pool.query(query, [path]);
    return rows[0] || null;
  }

  async createTracking(tracking: Omit<Tracking, 'id'>): Promise<Tracking> {
    const query = `
      INSERT INTO ${Tables.RELEASES_TRACKING} (release_id, platform, device_id)
      VALUES ($1, $2, $3)
      RETURNING id, release_id as "releaseId", download_timestamp as "downloadTimestamp", platform, device_id as "deviceId"
    `;
    const values = [tracking.releaseId, tracking.platform, tracking.deviceId ?? null];
    const { rows } = await this.pool.query(query, values);
    return rows[0];
  }

  async upsertCheckIn(checkIn: Omit<CheckIn, 'id'>): Promise<CheckIn> {
    const query = `
      INSERT INTO ${Tables.CHECK_INS}
        (device_id, platform, channel, runtime_version, current_update_id, day, last_seen)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (device_id, channel, day) DO UPDATE SET
        platform = EXCLUDED.platform,
        runtime_version = EXCLUDED.runtime_version,
        current_update_id = EXCLUDED.current_update_id,
        last_seen = EXCLUDED.last_seen
      RETURNING id, device_id as "deviceId", platform, channel,
                runtime_version as "runtimeVersion", current_update_id as "currentUpdateId",
                day, last_seen as "lastSeen"
    `;
    const values = [
      checkIn.deviceId,
      checkIn.platform,
      checkIn.channel,
      checkIn.runtimeVersion,
      checkIn.currentUpdateId ?? null,
      checkIn.day,
      checkIn.lastSeen,
    ];
    const { rows } = await this.pool.query(query, values);
    return rows[0];
  }

  async getReleaseTrackingMetrics(releaseId: string): Promise<TrackingMetrics[]> {
    const query = `
      SELECT platform, COUNT(*) as count
      FROM ${Tables.RELEASES_TRACKING}
      WHERE release_id = $1
      GROUP BY platform
    `;
    const { rows } = await this.pool.query(query, [releaseId]);
    return rows.map((row) => ({
      platform: row.platform,
      count: Number(row.count),
    }));
  }

  async getReleaseTrackingMetricsForAllReleases(): Promise<TrackingMetrics[]> {
    const query = `
      SELECT platform, COUNT(*) as count
      FROM ${Tables.RELEASES_TRACKING}
      GROUP BY platform
    `;
    const { rows } = await this.pool.query(query);
    return rows.map((row) => ({
      platform: row.platform,
      count: Number(row.count),
    }));
  }

  async createRelease(release: Omit<Release, 'id'>): Promise<Release> {
    const query = `
      INSERT INTO ${Tables.RELEASES}
        (runtime_version, channel, path, timestamp, commit_hash, commit_message, update_id, size, canary_percentage)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, runtime_version as "runtimeVersion", channel, path, timestamp,
                commit_hash as "commitHash", commit_message as "commitMessage",
                update_id as "updateId", size, canary_percentage as "canaryPercentage"
    `;
    const values = [
      release.runtimeVersion,
      release.channel,
      release.path,
      release.timestamp,
      release.commitHash,
      release.commitMessage,
      release.updateId,
      release.size ?? null,
      release.canaryPercentage ?? 100,
    ];
    const { rows } = await this.pool.query(query, values);
    return rows[0];
  }

  async getRelease(id: string): Promise<Release | null> {
    const query = `
      SELECT id, runtime_version as "runtimeVersion", channel, path, timestamp,
             commit_hash as "commitHash", commit_message as "commitMessage",
             update_id as "updateId", size, canary_percentage as "canaryPercentage"
      FROM ${Tables.RELEASES} WHERE id = $1
    `;
    const { rows } = await this.pool.query(query, [id]);
    return rows[0] || null;
  }

  async listReleases(): Promise<Release[]> {
    const query = `
      SELECT id, runtime_version as "runtimeVersion", channel, path, timestamp,
             commit_hash as "commitHash", commit_message as "commitMessage",
             update_id as "updateId", size, canary_percentage as "canaryPercentage"
      FROM ${Tables.RELEASES}
      ORDER BY timestamp DESC
    `;
    const { rows } = await this.pool.query(query);
    return rows;
  }

  async updateCanaryPercentage(releaseId: string, canaryPercentage: number): Promise<Release | null> {
    const query = `
      UPDATE ${Tables.RELEASES}
      SET canary_percentage = $1
      WHERE id = $2
      RETURNING id, runtime_version as "runtimeVersion", channel, path, timestamp,
                commit_hash as "commitHash", commit_message as "commitMessage",
                update_id as "updateId", size, canary_percentage as "canaryPercentage"
    `;
    const { rows } = await this.pool.query(query, [canaryPercentage, releaseId]);
    return rows[0] || null;
  }

  async getDownloadCountsPerRelease(): Promise<Record<string, number>> {
    const query = `
      SELECT release_id, COUNT(*) as count
      FROM ${Tables.RELEASES_TRACKING}
      GROUP BY release_id
    `;
    const { rows } = await this.pool.query(query);
    return Object.fromEntries(rows.map((r) => [r.release_id, Number(r.count)]));
  }

  async getMAUStats(channel?: string): Promise<MAUStat[]> {
    const baseQuery = `
      SELECT month,
             COUNT(DISTINCT CASE WHEN platform = 'ios' THEN device_id END) as ios,
             COUNT(DISTINCT CASE WHEN platform = 'android' THEN device_id END) as android
      FROM (
        SELECT TO_CHAR(DATE_TRUNC('month', rt.download_timestamp), 'YYYY-MM') as month,
               rt.platform, rt.device_id
        FROM ${Tables.RELEASES_TRACKING} rt
        JOIN ${Tables.RELEASES} r ON r.id = rt.release_id
        WHERE rt.device_id IS NOT NULL
          AND rt.download_timestamp >= NOW() - INTERVAL '12 months'
          ${channel ? 'AND r.channel = $1' : ''}
        UNION ALL
        SELECT TO_CHAR(DATE_TRUNC('month', ci.day), 'YYYY-MM') as month,
               ci.platform, ci.device_id
        FROM ${Tables.CHECK_INS} ci
        WHERE ci.day >= NOW() - INTERVAL '12 months'
          ${channel ? 'AND ci.channel = $1' : ''}
      ) active_devices
      GROUP BY month
      ORDER BY month ASC
    `;
    const { rows } = await this.pool.query(baseQuery, channel ? [channel] : []);
    return rows.map((r) => ({ month: r.month, ios: Number(r.ios), android: Number(r.android) }));
  }

  async getDAUStats(channel?: string): Promise<DAUStat[]> {
    const query = `
      SELECT TO_CHAR(day, 'YYYY-MM-DD') as date,
             COUNT(DISTINCT CASE WHEN platform = 'ios' THEN device_id END) as ios,
             COUNT(DISTINCT CASE WHEN platform = 'android' THEN device_id END) as android
      FROM ${Tables.CHECK_INS}
      WHERE day >= CURRENT_DATE - INTERVAL '29 days'
        ${channel ? 'AND channel = $1' : ''}
      GROUP BY day
      ORDER BY day ASC
    `;
    const { rows } = await this.pool.query(query, channel ? [channel] : []);
    return rows.map((r) => ({ date: r.date, ios: Number(r.ios), android: Number(r.android) }));
  }

  async getAdoptionStats(channel: string): Promise<AdoptionStat[]> {
    // Latest check-in per device wins (DISTINCT ON + last_seen DESC), so each
    // active device of the trailing 30 days is counted exactly once. Devices with
    // a NULL or unmatched current_update_id fall into a single unknown/embedded
    // bucket (updateId null) via the LEFT JOIN.
    const query = `
      WITH latest AS (
        SELECT DISTINCT ON (ci.device_id) ci.device_id, ci.platform, ci.current_update_id
        FROM ${Tables.CHECK_INS} ci
        WHERE ci.channel = $1
          AND ci.day >= CURRENT_DATE - INTERVAL '29 days'
        ORDER BY ci.device_id, ci.last_seen DESC, ci.day DESC
      ),
      channel_releases AS (
        SELECT DISTINCT ON (r.update_id) r.id, r.path, r.update_id
        FROM ${Tables.RELEASES} r
        WHERE r.channel = $1 AND r.update_id IS NOT NULL
        ORDER BY r.update_id, r.timestamp DESC
      )
      SELECT cr.update_id AS "updateId", cr.id AS "releaseId", cr.path AS "releasePath",
             COUNT(CASE WHEN l.platform = 'ios' THEN 1 END) AS ios,
             COUNT(CASE WHEN l.platform = 'android' THEN 1 END) AS android
      FROM latest l
      LEFT JOIN channel_releases cr ON cr.update_id = l.current_update_id
      GROUP BY cr.update_id, cr.id, cr.path
      ORDER BY (cr.update_id IS NULL) ASC, COUNT(*) DESC
    `;
    const { rows } = await this.pool.query(query, [channel]);
    return rows.map((r) => ({
      updateId: r.updateId ?? null,
      releaseId: r.releaseId ?? null,
      releasePath: r.releasePath ?? null,
      ios: Number(r.ios),
      android: Number(r.android),
    }));
  }
}
