-- Migration 028: Cleanup function for old rate limit records
-- Cleans up api_usage_rate_limits table records older than specified days
-- Should be called by a cron job (e.g., weekly or monthly)

CREATE OR REPLACE FUNCTION cleanup_old_rate_limits(retention_days INTEGER DEFAULT 30)
RETURNS TABLE(
  deleted_count BIGINT,
  cutoff_date DATE,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cutoff DATE;
  deleted BIGINT;
BEGIN
  -- Calculate cutoff date
  cutoff := CURRENT_DATE - retention_days;
  
  -- Delete old records
  DELETE FROM api_usage_rate_limits
  WHERE date < cutoff;
  
  GET DIAGNOSTICS deleted = ROW_COUNT;
  
  RETURN QUERY SELECT 
    deleted,
    cutoff,
    format('Deleted %s rate limit records older than %s days (cutoff: %s)', deleted, retention_days, cutoff);
END;
$$;

COMMENT ON FUNCTION cleanup_old_rate_limits IS 'Cleans up old api_usage_rate_limits records. Retention period defaults to 30 days. Should be called by cron job.';

-- Example cron job configuration (add to vercel.json or cron service):
-- {
--   "path": "/api/cron/cleanup-rate-limits",
--   "schedule": "0 6 * * 0"  // Weekly on Sunday at 6 AM UTC
-- }
