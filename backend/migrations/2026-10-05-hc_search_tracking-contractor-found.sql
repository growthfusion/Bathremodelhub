-- Add contractor_found to hc_search_tracking.
-- Values: 'Yes' (upstream returned >=1 contractor), 'No' (empty list),
--         ''    (unknown — upstream call failed). Existing rows get ''.
-- Run BEFORE deploying the backend change.

ALTER TABLE hc_search_tracking
    ADD COLUMN IF NOT EXISTS contractor_found String DEFAULT '' AFTER phone;

-- Verify
-- SELECT zip_code, utm_subid, contractor_found FROM hc_search_tracking ORDER BY 1 DESC LIMIT 10;
