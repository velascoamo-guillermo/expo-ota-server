export interface Release {
  id: string;
  runtimeVersion: string;
  channel: string;
  path: string;
  timestamp: string;
  commitHash: string;
  commitMessage: string;
  updateId?: string;
  size?: number;
  downloadCount?: number;
}

export interface Tracking {
  id: string;
  releaseId: string;
  downloadTimestamp: string;
  platform: string;
  deviceId?: string;
}

export interface TrackingMetrics {
  platform: string;
  count: number;
}

export interface MAUStat {
  month: string;
  ios: number;
  android: number;
}

export interface DatabaseInterface {
  createRelease(release: Omit<Release, 'id'>): Promise<Release>;
  getRelease(id: string): Promise<Release | null>;
  getReleaseByPath(path: string): Promise<Release | null>;
  listReleases(): Promise<Release[]>;
  createTracking(tracking: Omit<Tracking, 'id'>): Promise<Tracking>;
  getReleaseTrackingMetrics(releaseId: string): Promise<TrackingMetrics[]>;
  getReleaseTrackingMetricsForAllReleases(): Promise<TrackingMetrics[]>;
  getReleaseTrackingMetricsByChannel(channel: string): Promise<TrackingMetrics[]>;
  listChannels(): Promise<string[]>;
  getLatestReleaseRecordForRuntimeVersionAndChannel(runtimeVersion: string, channel: string): Promise<Release | null>;
  getDownloadCountsPerRelease(): Promise<Record<string, number>>;
  getMAUStats(channel?: string): Promise<MAUStat[]>;
}
