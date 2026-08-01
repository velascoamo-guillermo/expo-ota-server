-- Server-side runtime version distribution aggregation (avoids PostgREST
-- max-rows truncation). For each device with a check-in in the channel over the
-- trailing 30 days, its latest check-in wins (DISTINCT ON device_id, last_seen
-- DESC) so every device is counted exactly once. Counts are grouped per
-- runtime_version and platform, ordered by runtime version descending.

CREATE OR REPLACE FUNCTION get_runtime_version_distribution(p_channel VARCHAR)
RETURNS TABLE(runtime_version TEXT, ios BIGINT, android BIGINT)
LANGUAGE sql
STABLE
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (ci.device_id) ci.device_id, ci.platform, ci.runtime_version
    FROM check_ins ci
    WHERE ci.channel = p_channel
      AND ci.day >= CURRENT_DATE - INTERVAL '29 days'
    ORDER BY ci.device_id, ci.last_seen DESC, ci.day DESC
  )
  SELECT l.runtime_version::text AS runtime_version,
         COUNT(CASE WHEN l.platform = 'ios' THEN 1 END) AS ios,
         COUNT(CASE WHEN l.platform = 'android' THEN 1 END) AS android
  FROM latest l
  GROUP BY l.runtime_version
  ORDER BY l.runtime_version DESC;
$$;
