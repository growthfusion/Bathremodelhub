-- Add contact columns to hc_search_tracking.
-- Run this BEFORE deploying the backend change: the INSERT now includes
-- email and phone, and will fail (logged only, fire-and-forget) if the columns are missing.
-- Existing rows get '' for both columns.

ALTER TABLE hc_search_tracking
    ADD COLUMN IF NOT EXISTS email String DEFAULT '' AFTER utm_content,
    ADD COLUMN IF NOT EXISTS phone String DEFAULT '' AFTER email;

-- Verify
-- DESCRIBE TABLE hc_search_tracking;
-- SELECT zip_code, utm_subid, email, phone FROM hc_search_tracking ORDER BY 1 DESC LIMIT 10;
