-- Server-side update-adoption aggregation (avoids PostgREST max-rows truncation).
-- For each device with a check-in in the channel over the trailing 30 days, its
-- latest check-in wins (DISTINCT ON device_id, last_seen DESC) so every device is
-- counted exactly once. Counts are grouped per current update and platform, with
-- release info attached via LEFT JOIN; NULL or unmatched update ids collapse into
-- a single unknown/embedded bucket (update_id NULL).

CREATE OR REPLACE FUNCTION get_adoption_stats(p_channel VARCHAR)
RETURNS TABLE(update_id TEXT, release_id TEXT, release_path TEXT, ios BIGINT, android BIGINT)
LANGUAGE sql
STABLE
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (ci.device_id) ci.device_id, ci.platform, ci.current_update_id
    FROM check_ins ci
    WHERE ci.channel = p_channel
      AND ci.day >= CURRENT_DATE - INTERVAL '29 days'
    ORDER BY ci.device_id, ci.last_seen DESC, ci.day DESC
  ),
  channel_releases AS (
    SELECT DISTINCT ON (r.update_id) r.id, r.path, r.update_id
    FROM releases r
    WHERE r.channel = p_channel AND r.update_id IS NOT NULL
    ORDER BY r.update_id, r.timestamp DESC
  )
  SELECT cr.update_id::text AS update_id,
         cr.id::text AS release_id,
         cr.path::text AS release_path,
         COUNT(CASE WHEN l.platform = 'ios' THEN 1 END) AS ios,
         COUNT(CASE WHEN l.platform = 'android' THEN 1 END) AS android
  FROM latest l
  LEFT JOIN channel_releases cr ON cr.update_id = l.current_update_id
  GROUP BY cr.update_id, cr.id, cr.path
  ORDER BY (cr.update_id IS NULL) ASC, COUNT(*) DESC;
$$;
