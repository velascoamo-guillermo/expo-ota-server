import { Pool } from 'pg';

import { DatabaseInterface, Release, Tracking, TrackingMetrics } from './DatabaseInterface';
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

  async getLatestReleaseRecordForRuntimeVersionAndChannel(runtimeVersion: string, channel: string): Promise<Release | null> {
    const query = `
      SELECT id, runtime_version as "runtimeVersion", channel, path, timestamp, commit_hash as "commitHash", update_id as "updateId"
      FROM ${Tables.RELEASES} WHERE runtime_version = $1 AND channel = $2
      ORDER BY timestamp DESC
      LIMIT 1
    `;

    const { rows } = await this.pool.query(query, [runtimeVersion, channel]);
    return rows[0] || null;
  }
  async getReleaseByPath(path: string): Promise<Release | null> {
    const query = `
      SELECT id, runtime_version as "runtimeVersion", path, timestamp, commit_hash as "commitHash"
      FROM ${Tables.RELEASES} WHERE path = $1
    `;
    const { rows } = await this.pool.query(query, [path]);
    return rows[0] || null;
  }

  async createTracking(tracking: Omit<Tracking, 'id'>): Promise<Tracking> {
    const query = `
      INSERT INTO ${Tables.RELEASES_TRACKING} (release_id, platform)
      VALUES ($1, $2)
      RETURNING id, release_id as "releaseId", download_timestamp as "downloadTimestamp", platform
    `;
    const values = [tracking.releaseId, tracking.platform];
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
      INSERT INTO ${Tables.RELEASES} (runtime_version, channel, path, timestamp, commit_hash, commit_message, update_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, runtime_version as "runtimeVersion", channel, path, timestamp, commit_hash as "commitHash", update_id as "updateId"
    `;

    const values = [
      release.runtimeVersion,
      release.channel,
      release.path,
      release.timestamp,
      release.commitHash,
      release.commitMessage,
      release.updateId,
    ];
    const { rows } = await this.pool.query(query, values);
    return rows[0];
  }

  async getRelease(id: string): Promise<Release | null> {
    const query = `
      SELECT id, runtime_version as "runtimeVersion", path, timestamp, commit_hash as "commitHash"
      FROM ${Tables.RELEASES} WHERE id = $1
    `;

    const { rows } = await this.pool.query(query, [id]);
    return rows[0] || null;
  }

  async listReleases(): Promise<Release[]> {
    const query = `
      SELECT id, runtime_version as "runtimeVersion", channel, path, timestamp, commit_hash as "commitHash", commit_message as "commitMessage"
      FROM ${Tables.RELEASES}
      ORDER BY timestamp DESC
    `;

    const { rows } = await this.pool.query(query);
    return rows;
  }
}
