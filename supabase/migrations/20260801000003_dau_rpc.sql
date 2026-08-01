-- Server-side DAU aggregation (avoids PostgREST max-rows truncation on raw fetches).
-- Unique devices per day per platform over the trailing 30 days, from check_ins only,
-- optionally filtered by channel. Days without check-ins are zero-filled in the API layer.

CREATE OR REPLACE FUNCTION get_dau_stats(p_channel VARCHAR DEFAULT NULL)
RETURNS TABLE(date TEXT, ios BIGINT, android BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT TO_CHAR(ci.day, 'YYYY-MM-DD') AS date,
         COUNT(DISTINCT CASE WHEN ci.platform = 'ios' THEN ci.device_id END) AS ios,
         COUNT(DISTINCT CASE WHEN ci.platform = 'android' THEN ci.device_id END) AS android
  FROM check_ins ci
  WHERE ci.day >= CURRENT_DATE - INTERVAL '29 days'
    AND (p_channel IS NULL OR ci.channel = p_channel)
  GROUP BY ci.day
  ORDER BY ci.day ASC;
$$;
