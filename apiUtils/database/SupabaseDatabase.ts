import { createClient } from '@supabase/supabase-js';

import { DatabaseInterface, MAUStat, Release, Tracking, TrackingMetrics } from './DatabaseInterface';
import { Tables } from './DatabaseFactory';

export class SupabaseDatabase implements DatabaseInterface {
  private supabase;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async listChannels(): Promise<string[]> {
    const { data, error } = await this.supabase
      .from(Tables.RELEASES)
      .select('channel')
      .order('channel', { ascending: true });

    if (error) throw new Error(error.message);
    const unique = data.map((r) => r.channel as string).filter((v, i, a) => a.indexOf(v) === i);
    return unique;
  }

  async getReleaseTrackingMetricsByChannel(channel: string): Promise<TrackingMetrics[]> {
    const { data: releases, error: releasesError } = await this.supabase
      .from(Tables.RELEASES)
      .select('id')
      .eq('channel', channel);

    if (releasesError) throw new Error(releasesError.message);
    if (!releases.length) return [];

    const releaseIds = releases.map((r) => r.id);

    const { count: iosCount, error: iosError } = await this.supabase
      .from(Tables.RELEASES_TRACKING)
      .select('platform', { count: 'estimated', head: true })
      .in('release_id', releaseIds)
      .eq('platform', 'ios');

    const { count: androidCount, error: androidError } = await this.supabase
      .from(Tables.RELEASES_TRACKING)
      .select('platform', { count: 'estimated', head: true })
      .in('release_id', releaseIds)
      .eq('platform', 'android');

    if (iosError || androidError) throw new Error(iosError?.message || androidError?.message);

    return [
      { platform: 'ios', count: Number(iosCount) },
      { platform: 'android', count: Number(androidCount) },
    ];
  }

  async getLatestReleaseRecordForRuntimeVersionAndChannel(runtimeVersion: string, channel: string): Promise<Release | null> {
    const { data, error } = await this.supabase
      .from(Tables.RELEASES)
      .select()
      .eq('runtime_version', runtimeVersion)
      .eq('channel', channel)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (error) throw new Error(error.message);

    if (data) {
      return {
        id: data.id,
        runtimeVersion: data.runtime_version,
        channel: data.channel,
        path: data.path,
        timestamp: data.timestamp,
        commitHash: data.commit_hash,
        commitMessage: data.commit_message,
        updateId: data.update_id,
      };
    }

    return null;
  }

  async getReleaseByPath(path: string): Promise<Release | null> {
    const { data, error } = await this.supabase
      .from(Tables.RELEASES)
      .select()
      .eq('path', path)
      .single();

    if (error) throw new Error(error.message);

    return data || null;
  }

  async getReleaseTrackingMetricsForAllReleases(): Promise<TrackingMetrics[]> {
    const { count: iosCount, error: iosError } = await this.supabase
      .from(Tables.RELEASES_TRACKING)
      .select('platform', { count: 'estimated', head: true })
      .eq('platform', 'ios');

    const { count: androidCount, error: androidError } = await this.supabase
      .from(Tables.RELEASES_TRACKING)
      .select('platform', { count: 'estimated', head: true })
      .eq('platform', 'android');

    if (iosError || androidError) throw new Error(iosError?.message || androidError?.message);
    return [
      {
        platform: 'ios',
        count: Number(iosCount),
      },
      {
        platform: 'android',
        count: Number(androidCount),
      },
    ];
  }
  async createTracking(tracking: Omit<Tracking, 'id'>): Promise<Tracking> {
    const { data, error } = await this.supabase
      .from(Tables.RELEASES_TRACKING)
      .insert({
        release_id: tracking.releaseId,
        platform: tracking.platform,
        download_timestamp: tracking.downloadTimestamp,
        device_id: tracking.deviceId ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }
  async getReleaseTrackingMetrics(releaseId: string): Promise<TrackingMetrics[]> {
    const { count: iosCount, error: iosError } = await this.supabase
      .from(Tables.RELEASES_TRACKING)
      .select('platform', { count: 'estimated', head: true })
      .eq('release_id', releaseId)
      .eq('platform', 'ios');

    const { count: androidCount, error: androidError } = await this.supabase
      .from(Tables.RELEASES_TRACKING)
      .select('platform', { count: 'estimated', head: true })
      .eq('release_id', releaseId)
      .eq('platform', 'android');

    if (iosError || androidError) throw new Error(iosError?.message || androidError?.message);

    return [
      {
        platform: 'ios',
        count: Number(iosCount),
      },
      {
        platform: 'android',
        count: Number(androidCount),
      },
    ];
  }

  async createRelease(release: Omit<Release, 'id'>): Promise<Release> {
    const { data, error } = await this.supabase
      .from(Tables.RELEASES)
      .insert({
        path: release.path,
        runtime_version: release.runtimeVersion,
        channel: release.channel,
        timestamp: release.timestamp,
        commit_hash: release.commitHash,
        commit_message: release.commitMessage,
        update_id: release.updateId,
        size: release.size ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getRelease(id: string): Promise<Release | null> {
    const { data, error } = await this.supabase
      .from(Tables.RELEASES)
      .select()
      .eq('id', id)
      .single();

    if (error) throw error;

    return {
      id: data.id,
      path: data.path,
      runtimeVersion: data.runtime_version,
      channel: data.channel ?? 'production',
      timestamp: data.timestamp,
      commitHash: data.commit_hash,
      commitMessage: data.commit_message,
    };
  }

  async listReleases(): Promise<Release[]> {
    const { data, error } = await this.supabase
      .from(Tables.RELEASES)
      .select()
      .order('timestamp', { ascending: false });

    if (error) throw error;
    return data.map((release) => ({
      id: release.id,
      path: release.path,
      runtimeVersion: release.runtime_version,
      channel: release.channel ?? 'production',
      timestamp: release.timestamp,
      size: release.size,
      commitHash: release.commit_hash,
      commitMessage: release.commit_message,
    }));
  }

  async getDownloadCountsPerRelease(): Promise<Record<string, number>> {
    const { data, error } = await this.supabase
      .from(Tables.RELEASES_TRACKING)
      .select('release_id');

    if (error) throw new Error(error.message);

    return data.reduce<Record<string, number>>((acc, row) => {
      acc[row.release_id] = (acc[row.release_id] ?? 0) + 1;
      return acc;
    }, {});
  }

  async getMAUStats(channel?: string): Promise<MAUStat[]> {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    let query = this.supabase
      .from(Tables.RELEASES_TRACKING)
      .select(`device_id, platform, download_timestamp, ${Tables.RELEASES}!inner(channel)`)
      .not('device_id', 'is', null)
      .gte('download_timestamp', twelveMonthsAgo.toISOString());

    if (channel) {
      query = query.eq(`${Tables.RELEASES}.channel`, channel);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const byMonth = new Map<string, { ios: Set<string>; android: Set<string> }>();
    for (const row of data) {
      const month = row.download_timestamp.slice(0, 7);
      if (!byMonth.has(month)) byMonth.set(month, { ios: new Set(), android: new Set() });
      const bucket = byMonth.get(month)!;
      if (row.platform === 'ios') bucket.ios.add(row.device_id);
      else if (row.platform === 'android') bucket.android.add(row.device_id);
    }

    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { ios, android }]) => ({ month, ios: ios.size, android: android.size }));
  }
}
