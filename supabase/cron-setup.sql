-- Supabase pg_cron setup for AutoReview
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Grant permissions to the postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT USAGE ON SCHEMA net TO postgres;

-- 3. Schedule auto-review to run every 5 minutes
-- Replace <YOUR_APP_URL> with your Cloud Run URL
-- Replace <YOUR_CRON_SECRET> with a secure random string (same as CRON_SECRET env var)
--
-- Example:
--   SELECT cron.schedule(
--     'autoreview-poll',
--     '*/5 * * * *',
--     $$
--     SELECT net.http_post(
--       url := 'https://autoreview-xxxxx-uc.a.run.app/api/cron/auto-review',
--       headers := '{"Authorization": "Bearer your-cron-secret-here"}'::jsonb
--     );
--     $$
--   );

-- Uncomment and fill in your values below:

-- SELECT cron.schedule(
--   'autoreview-poll',
--   '*/5 * * * *',
--   $$
--   SELECT net.http_post(
--     url := '<YOUR_APP_URL>/api/cron/auto-review',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || '<YOUR_CRON_SECRET>')
--   );
--   $$
-- );

-- To verify the scheduled job:
-- SELECT * FROM cron.job;

-- To unschedule:
-- SELECT cron.unschedule('autoreview-poll');

-- To check run history:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
