-- Create table for scheduled test runs
CREATE TABLE IF NOT EXISTS ai_test_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'custom')),
  cron_expression text, -- For custom schedules
  test_case_ids uuid[], -- Specific test cases to run, or null for all
  validation_options jsonb DEFAULT '{}'::jsonb,
  alert_threshold numeric DEFAULT 70, -- Alert if pass rate drops below this
  alert_email text,
  enabled boolean DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for finding schedules that need to run
CREATE INDEX IF NOT EXISTS idx_ai_test_schedules_next_run ON ai_test_schedules(next_run_at) WHERE enabled = true;

-- RLS policies
ALTER TABLE ai_test_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage test schedules"
  ON ai_test_schedules
  FOR ALL
  USING (
    auth.uid()::text IN (
      SELECT unnest(string_to_array(current_setting('app.settings.admin_user_ids', true), ','))
    )
    OR
    auth.email() IN (
      SELECT unnest(string_to_array(current_setting('app.settings.admin_emails', true), ','))
    )
  );



