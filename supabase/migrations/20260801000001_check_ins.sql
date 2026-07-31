-- Device check-ins for real analytics (one row per device+channel+day).
-- Written by the manifest endpoint on every update check carrying an eas-client-id.

CREATE TABLE IF NOT EXISTS check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(255) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  channel VARCHAR(255) NOT NULL,
  runtime_version VARCHAR(255) NOT NULL,
  current_update_id VARCHAR(255),
  day DATE NOT NULL,
  last_seen TIMESTAMP NOT NULL,
  UNIQUE(device_id, channel, day)
);

CREATE INDEX IF NOT EXISTS idx_check_ins_day ON check_ins(day);
CREATE INDEX IF NOT EXISTS idx_check_ins_channel_day ON check_ins(channel, day);
