-- Atomic rate limit increment function
-- This function atomically increments the request count or creates a new record
-- Prevents race conditions when multiple requests hit simultaneously

CREATE OR REPLACE FUNCTION increment_rate_limit(
  p_key_hash TEXT,
  p_route_path TEXT,
  p_date DATE,
  p_max_requests INTEGER
) RETURNS TABLE(
  allowed BOOLEAN,
  remaining INTEGER,
  limit_count INTEGER,
  count_after INTEGER
) AS $$
DECLARE
  v_current_count INTEGER;
  v_allowed BOOLEAN;
  v_remaining INTEGER;
BEGIN
  -- Insert or update atomically using INSERT ... ON CONFLICT ... DO UPDATE
  INSERT INTO api_usage_rate_limits (key_hash, route_path, date, request_count, updated_at)
  VALUES (p_key_hash, p_route_path, p_date, 1, NOW())
  ON CONFLICT (key_hash, route_path, date)
  DO UPDATE SET
    request_count = api_usage_rate_limits.request_count + 1,
    updated_at = NOW()
  RETURNING request_count INTO v_current_count;

  -- Check if limit exceeded
  IF v_current_count > p_max_requests THEN
    v_allowed := FALSE;
    v_remaining := 0;
  ELSE
    v_allowed := TRUE;
    v_remaining := GREATEST(0, p_max_requests - v_current_count);
  END IF;

  RETURN QUERY SELECT v_allowed, v_remaining, p_max_requests, v_current_count;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users (or service role)
-- Note: This function should only be called from server-side code with service role
COMMENT ON FUNCTION increment_rate_limit IS 'Atomically increments rate limit counter. Returns whether request is allowed, remaining count, limit, and current count.';
