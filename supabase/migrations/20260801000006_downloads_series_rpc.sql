-- Server-side downloads time-series aggregation (avoids PostgREST max-rows
-- truncation). Counts download events per day from releases_tracking over the
-- trailing p_days window (inclusive of today), optionally filtered by channel
-- through the releases join. Days without downloads are zero-filled in the API
-- layer.

CREATE OR REPLACE FUNCTION get_downloads_time_series(p_channel VARCHAR DEFAULT NULL, p_days INTEGER DEFAULT 30)
RETURNS TABLE(date TEXT, count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT TO_CHAR(DATE_TRUNC('day', rt.download_timestamp), 'YYYY-MM-DD') AS date,
         COUNT(*) AS count
  FROM releases_tracking rt
  JOIN releases r ON r.id = rt.release_id
  WHERE rt.download_timestamp >= CAST(CURRENT_DATE - (p_days - 1) AS TIMESTAMP)
    AND (p_channel IS NULL OR r.channel = p_channel)
  GROUP BY DATE_TRUNC('day', rt.download_timestamp)
  ORDER BY DATE_TRUNC('day', rt.download_timestamp) ASC;
$$;
