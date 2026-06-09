-- Consolidated schema for expo-ota-server on Supabase.
-- Mirrors containers/database/schema/* plus scripts/migrations/001_add_canary_percentage.sql.

CREATE TABLE IF NOT EXISTS releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  runtime_version VARCHAR(255) NOT NULL,
  channel VARCHAR(255) NOT NULL DEFAULT 'production',
  path VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  commit_hash VARCHAR(255) NOT NULL,
  commit_message VARCHAR(255) NOT NULL,
  update_id VARCHAR(255),
  size INTEGER,
  canary_percentage INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS releases_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  download_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  platform VARCHAR(50) NOT NULL,
  device_id VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_tracking_release_id ON releases_tracking(release_id);
CREATE INDEX IF NOT EXISTS idx_tracking_platform ON releases_tracking(platform);
