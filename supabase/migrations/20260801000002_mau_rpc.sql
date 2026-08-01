-- Server-side MAU aggregation (avoids PostgREST max-rows truncation on raw fetches).
-- Mirrors the UNION ALL + COUNT(DISTINCT device_id) query used by the Postgres backend:
-- devices active via releases_tracking or check_ins in the last 12 months, deduped
-- across both sources per month, optionally filtered by channel.

CREATE OR REPLACE FUNCTION get_mau_stats(p_channel VARCHAR DEFAULT NULL)
RETURNS TABLE(month TEXT, ios BIGINT, android BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT active_devices.month,
         COUNT(DISTINCT CASE WHEN active_devices.platform = 'ios' THEN active_devices.device_id END) AS ios,
         COUNT(DISTINCT CASE WHEN active_devices.platform = 'android' THEN active_devices.device_id END) AS android
  FROM (
    SELECT TO_CHAR(DATE_TRUNC('month', rt.download_timestamp), 'YYYY-MM') AS month,
           rt.platform, rt.device_id
    FROM releases_tracking rt
    JOIN releases r ON r.id = rt.release_id
    WHERE rt.device_id IS NOT NULL
      AND rt.download_timestamp >= NOW() - INTERVAL '12 months'
      AND (p_channel IS NULL OR r.channel = p_channel)
    UNION ALL
    SELECT TO_CHAR(DATE_TRUNC('month', ci.day), 'YYYY-MM') AS month,
           ci.platform, ci.device_id
    FROM check_ins ci
    WHERE ci.day >= NOW() - INTERVAL '12 months'
      AND (p_channel IS NULL OR ci.channel = p_channel)
  ) active_devices
  GROUP BY active_devices.month
  ORDER BY active_devices.month ASC;
$$;
