-- New table: one row per landing-page form submission (email / phone / ZIP).
-- Written by POST /api/lead at submit time, independent of the results page,
-- so contact details are kept even if the later /api/businesses call never happens.
-- Join to hc_search_tracking on utm_subid / email when you need contractor_found.
-- Run BEFORE deploying the backend change.

CREATE TABLE IF NOT EXISTS default.hc_lead_capture
(
    event_time    DateTime DEFAULT now(),
    zip_code      String,
    email         String DEFAULT '',
    phone         String DEFAULT '',
    search_query  String DEFAULT '',
    utm_subid     String DEFAULT '',
    utm_source    String DEFAULT '',
    utm_campaign  String DEFAULT '',
    utm_content   String DEFAULT '',
    page          String DEFAULT ''
)
ENGINE = MergeTree
ORDER BY (event_time, zip_code);

-- Verify
-- SELECT event_time, zip_code, email, phone, utm_subid FROM default.hc_lead_capture ORDER BY event_time DESC LIMIT 5;
