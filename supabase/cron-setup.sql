-- Supabase pg_cron setup for AutoReview
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Schedule auto-review to run every 5 minutes
SELECT cron.schedule(
  'autoreview-poll',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://autoreview-951159321728.us-central1.run.app/api/cron/auto-review',
    headers := jsonb_build_object('Authorization', 'Bearer ' || 'bc02e71174fc99d1720e04984d12cb82e4e50af8b2fc17c0e7858390db2b03ee')
  );
  $$
);

-- To verify the scheduled job:
-- SELECT * FROM cron.job;

-- To unschedule:
-- SELECT cron.unschedule('autoreview-poll');

-- To check run history:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
