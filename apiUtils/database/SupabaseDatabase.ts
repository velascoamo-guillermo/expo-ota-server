import { createClient } from '@supabase/supabase-js';

import {
  CheckIn,
  DatabaseInterface,
  MAUStat,
  Release,
  Tracking,
  TrackingMetrics,
} from './DatabaseInterface';
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
        canaryPercentage: data.canary_percentage ?? 100,
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

    if (!data) return null;
    return {
      id: data.id,
      runtimeVersion: data.runtime_version,
      channel: data.channel,
      path: data.path,
      timestamp: data.timestamp,
      commitHash: data.commit_hash,
      commitMessage: data.commit_message,
      updateId: data.update_id,
      size: data.size,
      canaryPercentage: data.canary_percentage ?? 100,
    };
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
  async upsertCheckIn(checkIn: Omit<CheckIn, 'id'>): Promise<CheckIn> {
    const { data, error } = await this.supabase
      .from(Tables.CHECK_INS)
      .upsert(
        {
          device_id: checkIn.deviceId,
          platform: checkIn.platform,
          channel: checkIn.channel,
          runtime_version: checkIn.runtimeVersion,
          current_update_id: checkIn.currentUpdateId ?? null,
          day: checkIn.day,
          last_seen: checkIn.lastSeen,
        },
        { onConflict: 'device_id,channel,day' }
      )
      .select()
      .single();

    if (error) throw new Error(error.message);
    return {
      id: data.id,
      deviceId: data.device_id,
      platform: data.platform,
      channel: data.channel,
      runtimeVersion: data.runtime_version,
      currentUpdateId: data.current_update_id,
      day: data.day,
      lastSeen: data.last_seen,
    };
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
        canary_percentage: release.canaryPercentage ?? 100,
      })
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error('No data returned from createRelease');
    return {
      id: data.id,
      runtimeVersion: data.runtime_version,
      channel: data.channel,
      path: data.path,
      timestamp: data.timestamp,
      commitHash: data.commit_hash,
      commitMessage: data.commit_message,
      updateId: data.update_id,
      size: data.size,
      canaryPercentage: data.canary_percentage ?? 100,
    };
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
      updateId: data.update_id,
      size: data.size,
      canaryPercentage: data.canary_percentage ?? 100,
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
      canaryPercentage: release.canary_percentage ?? 100,
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

  async getLatestFullyRolledOutRelease(
    runtimeVersion: string,
    channel: string
  ): Promise<Release | null> {
    const { data, error } = await this.supabase
      .from(Tables.RELEASES)
      .select()
      .eq('runtime_version', runtimeVersion)
      .eq('channel', channel)
      .eq('canary_percentage', 100)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (error) return null;
    if (!data) return null;
    return {
      id: data.id,
      runtimeVersion: data.runtime_version,
      channel: data.channel,
      path: data.path,
      timestamp: data.timestamp,
      commitHash: data.commit_hash,
      commitMessage: data.commit_message,
      updateId: data.update_id,
      size: data.size,
      canaryPercentage: data.canary_percentage ?? 100,
    };
  }

  async updateCanaryPercentage(releaseId: string, canaryPercentage: number): Promise<Release | null> {
    const { data, error } = await this.supabase
      .from(Tables.RELEASES)
      .update({ canary_percentage: canaryPercentage })
      .eq('id', releaseId)
      .select()
      .single();

    if (error) return null;
    if (!data) return null;
    return {
      id: data.id,
      runtimeVersion: data.runtime_version,
      channel: data.channel,
      path: data.path,
      timestamp: data.timestamp,
      commitHash: data.commit_hash,
      commitMessage: data.commit_message,
      updateId: data.update_id,
      size: data.size,
      canaryPercentage: data.canary_percentage ?? 100,
    };
  }

  async getMAUStats(channel?: string): Promise<MAUStat[]> {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    let trackingQuery = this.supabase
      .from(Tables.RELEASES_TRACKING)
      .select(`device_id, platform, download_timestamp, ${Tables.RELEASES}!inner(channel)`)
      .not('device_id', 'is', null)
      .gte('download_timestamp', twelveMonthsAgo.toISOString());

    if (channel) {
      trackingQuery = trackingQuery.eq(`${Tables.RELEASES}.channel`, channel);
    }

    let checkInQuery = this.supabase
      .from(Tables.CHECK_INS)
      .select('device_id, platform, day')
      .gte('day', twelveMonthsAgo.toISOString().slice(0, 10));

    if (channel) {
      checkInQuery = checkInQuery.eq('channel', channel);
    }

    const [trackingResult, checkInResult] = await Promise.all([trackingQuery, checkInQuery]);
    if (trackingResult.error) throw new Error(trackingResult.error.message);
    if (checkInResult.error) throw new Error(checkInResult.error.message);

    const byMonth = new Map<string, { ios: Set<string>; android: Set<string> }>();
    const addDevice = (month: string, platform: string, deviceId: string): void => {
      if (!byMonth.has(month)) byMonth.set(month, { ios: new Set(), android: new Set() });
      const bucket = byMonth.get(month)!;
      if (platform === 'ios') bucket.ios.add(deviceId);
      else if (platform === 'android') bucket.android.add(deviceId);
    };

    for (const row of trackingResult.data) {
      addDevice(row.download_timestamp.slice(0, 7), row.platform, row.device_id);
    }
    for (const row of checkInResult.data) {
      addDevice(row.day.slice(0, 7), row.platform, row.device_id);
    }

    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { ios, android }]) => ({ month, ios: ios.size, android: android.size }));
  }
}
