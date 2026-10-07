'use strict';

const express = require('express');
const { getToken, API_BASE } = require('../lib/auth');
const { chInsert }           = require('../lib/clickhouse');

const router = express.Router();

// ── Search tracking → ClickHouse (utm_subid + ZIP + email/phone captured at Thumbtack search time) ──
// Waits for p but never longer than ms — tracking must not stall the user's response.
function settleWithin(p, ms) {
    return Promise.race([p, new Promise(function (resolve) { setTimeout(resolve, ms); })]);
}

function logSearchTracking(entry) {
    return chInsert(
        'hc_search_tracking',
        ['zip_code', 'utm_subid', 'search_query', 'utm_source', 'utm_campaign', 'utm_content', 'email', 'phone', 'contractor_found'],
        [
            String(entry.zipCode      || '').slice(0, 10),
            String(entry.utmSubid     || '').slice(0, 200),
            String(entry.searchQuery  || '').slice(0, 200),
            String(entry.utmSource    || '').slice(0, 60),
            String(entry.utmCampaign  || '').slice(0, 60),
            String(entry.utmContent   || '').slice(0, 60),
            String(entry.email        || '').slice(0, 254),
            String(entry.phone        || '').slice(0, 15),
            // 'Yes' = upstream returned >=1 contractor, 'No' = empty list, '' = unknown (upstream error)
            String(entry.contractorFound || '').slice(0, 3),
        ]
    )
        .then(function () { console.log('[search-tracking] logged →', entry.zipCode, entry.utmSubid || '(no subid)'); })
        .catch(function (err) { console.error('[search-tracking] FAILED after retries:', err.message); });
}

// ── Keyword cache (5-minute TTL) ──────────────────────────────────────────────
const kwCache = new Map();
const KW_TTL  = 5 * 60 * 1000;

// GET /api/keywords?searchQuery=<term>
router.get('/keywords', async function (req, res) {
    const query    = String(req.query.searchQuery || 'bathroom remodeling').slice(0, 100);
    const cacheKey = query.toLowerCase();
    const cached   = kwCache.get(cacheKey);

    if (cached && Date.now() - cached.ts < KW_TTL) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached.data);
    }

    try {
        const token    = await getToken();
        console.log('[keywords] calling', `${API_BASE}/api/v4/keywords/search?searchQuery=${encodeURIComponent(query)}`);
        const upstream = await fetch(
            `${API_BASE}/api/v4/keywords/search?searchQuery=${encodeURIComponent(query)}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!upstream.ok) {
            const body = await upstream.text().catch(() => '');
            console.error('[keywords] upstream error', upstream.status, body);
            return res.status(upstream.status).json({ error: body || 'Upstream keyword service error' });
        }
        const data = await upstream.json();
        kwCache.set(cacheKey, { data, ts: Date.now() });
        res.setHeader('X-Cache', 'MISS');
        res.json(data);
    } catch (err) {
        console.error('[keywords]', err.message);
        res.status(502).json({ error: err.message });
    }
});

// POST /api/businesses  { searchQuery, zipCode, utmData }
router.post('/businesses', async function (req, res) {
    const { searchQuery, zipCode, utmData, email, phone } = req.body;
    const cleanZip = String(zipCode || '').trim();

    // Optional contact details — only stored when well-formed, otherwise dropped.
    // Logged to ClickHouse only; never forwarded to the upstream Thumbtack API.
    const emailTrim  = String(email || '').trim().toLowerCase();
    const cleanEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailTrim) ? emailTrim.slice(0, 254) : '';
    const phoneDigits = String(phone || '').replace(/\D/g, '');
    const cleanPhone = /^[2-9]\d{9}$/.test(phoneDigits) ? phoneDigits : '';

    // Do not log email/phone to the console (PII).
    console.log('[businesses] received →', { searchQuery, zipCode: cleanZip });

    if (!searchQuery || !cleanZip) {
        return res.status(400).json({ error: 'searchQuery and zipCode are required' });
    }
    if (!/^\d{5}$/.test(cleanZip)) {
        return res.status(400).json({ error: 'zipCode must be a 5-digit US ZIP code' });
    }

    // Assigned once the request is validated; declared here so the catch block can call it.
    let track = function () { return Promise.resolve(); };

    try {
        const token = await getToken();

        // Whitelist of keys forwarded to Thumbtack.
        // utm_medium and utm_tt_session are explicitly disallowed by Thumbtack.
        const ALLOWED_UTM_KEYS = [
            'utm_source',
            'utm_campaign',
            'utm_subid',
            'utm_user_hash',
            'utm_facebook_click_id',
            'utm_google_click_id',
            'utm_vertical',
            'rt_ad',
            'source_id'
        ];

        // Always force a valid utm_source (must match ^cma-[a-zA-Z0-9-_]+$, ≤48 chars).
        const cleanUtm = { utm_source: 'cma-growthfusion' };
        if (utmData && typeof utmData === 'object') {
            ALLOWED_UTM_KEYS.forEach(function (k) {
                const v = utmData[k];
                if (typeof v === 'string' && v.trim()) {
                    cleanUtm[k] = v.trim().slice(0, 200);
                }
            });
            // Re-validate utm_source against Thumbtack's pattern; fall back if invalid.
            if (!/^cma-[a-zA-Z0-9-_]{1,44}$/.test(cleanUtm.utm_source)) {
                cleanUtm.utm_source = 'cma-growthfusion';
            }
        }

        const payload = {
            searchQuery: String(searchQuery).slice(0, 200),
            zipCode:     cleanZip,
            utmData:     cleanUtm,
            // Thumbtack: skip pros who are already "overserved" (have enough leads)
            settings:    { excludeOverserved: true }
        };
        console.log('[businesses] → upstream:', JSON.stringify(payload));

        // Logged once per search, after the upstream call, so we know whether
        // any contractors came back. Awaited (bounded) before responding so the
        // insert can't be cut off when the instance is throttled.
        let tracked = false;
        track = function (contractorFound) {
            if (tracked) return Promise.resolve();
            tracked = true;
            return logSearchTracking({
                zipCode:     cleanZip,
                searchQuery: payload.searchQuery,
                utmSubid:    cleanUtm.utm_subid,
                utmSource:   cleanUtm.utm_source,
                utmCampaign: cleanUtm.utm_campaign,
                utmContent:  cleanUtm.utm_content,
                email:       cleanEmail,
                phone:       cleanPhone,
                contractorFound: contractorFound,
            });
        };

        const upstream = await fetch(`${API_BASE}/api/v4/businesses/search`, {
            method:  'POST',
            headers: {
                Authorization:  `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const rawBody = await upstream.text();
        console.log('[businesses] ← upstream:', upstream.status, rawBody.slice(0, 300));

        if (!upstream.ok) {
            await settleWithin(track(''), 3000);   // upstream error — contractor availability unknown
            let errMsg = `Upstream error ${upstream.status}`;
            try {
                const parsed = JSON.parse(rawBody);
                errMsg = parsed.detail || parsed.error || parsed.message || parsed.title || errMsg;
            } catch { errMsg = rawBody || errMsg; }
            return res.status(upstream.status).json({ error: errMsg });
        }

        const result = JSON.parse(rawBody);
        // "data" is the contractor list: non-empty array → Yes, empty/missing → No
        await settleWithin(track(Array.isArray(result.data) && result.data.length > 0 ? 'Yes' : 'No'), 3000);
        res.json(result);
    } catch (err) {
        await settleWithin(track(''), 3000);   // no-op if already logged; keeps failed searches in the table
        console.error('[businesses]', err.message);
        res.status(502).json({ error: err.message });
    }
});

// ── Lead capture → ClickHouse hc_lead_capture ───────────────────────────────
// Written the moment the visitor submits the landing-page form, independent of
// the results page — so email/phone are never lost if sessionStorage is empty,
// the results tab is closed, or the later /businesses call fails.
const leadHits = new Map();   // ip -> { n, reset }  (simple per-IP limiter)
function leadRateLimited(ip) {
    const now = Date.now();
    let h = leadHits.get(ip);
    if (!h || now > h.reset) { h = { n: 0, reset: now + 60000 }; leadHits.set(ip, h); }
    h.n += 1;
    if (leadHits.size > 5000) { leadHits.forEach(function (v, k) { if (now > v.reset) leadHits.delete(k); }); }
    return h.n > 20;   // max 20 submissions / minute / IP
}

// POST /api/lead  { zipCode, email, phone, searchQuery, utmData, page }
router.post('/lead', async function (req, res) {
    if (leadRateLimited(req.ip)) return res.status(429).json({ error: 'Too many requests' });

    const b = req.body || {};
    const zip   = String(b.zipCode || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const phone = String(b.phone || '').replace(/\D/g, '');

    if (!/^\d{5}$/.test(zip)) return res.status(400).json({ error: 'zipCode must be 5 digits' });
    const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    const okPhone = /^[2-9]\d{9}$/.test(phone);
    if (!okEmail && !okPhone) return res.status(400).json({ error: 'email or phone required' });

    const u = (b.utmData && typeof b.utmData === 'object') ? b.utmData : {};
    const str = function (v, n) { return typeof v === 'string' ? v.trim().slice(0, n) : ''; };

    try {
        await chInsert(
            'hc_lead_capture',
            ['zip_code', 'email', 'phone', 'search_query', 'utm_subid', 'utm_source', 'utm_campaign', 'utm_content', 'page'],
            [zip, okEmail ? email.slice(0, 254) : '', okPhone ? phone : '',
             str(b.searchQuery, 200), str(u.utm_subid, 200), str(u.utm_source, 60),
             str(u.utm_campaign, 60), str(u.utm_content, 60), str(b.page, 200)]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('[lead-capture] FAILED after retries:', err.message);
        res.status(503).json({ error: 'Could not save' });
    }
});

// GET /api/info  — prints current API config to browser console (no secrets exposed)
router.get('/info', function (req, res) {
    const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
    const apiBase = process.env.API_BASE_URL || '';
    const envName = nodeEnv === 'production' ? 'Production'
                  : nodeEnv === 'staging'    ? 'Stage'
                  : apiBase.indexOf('staging') !== -1 ? 'Stage'
                  : apiBase ? 'Production'
                  : 'Local';
    const looksLikeAuthHost = !!apiBase && /(^|\/\/|\.)auth[.-]/i.test(apiBase);
    res.json({
        envName:     envName,
        environment: process.env.NODE_ENV || 'development',
        apiBaseUrl:  apiBase || '(not set)',
        configError: looksLikeAuthHost
            ? 'API_BASE_URL points at the AUTH host. It must be the API host (e.g. staging-api.thumbtack.com).'
            : null
    });
});

// GET /api/location  — returns ZIP from GPS coords (Google Geocoding) or IP (ipapi.co)
router.get('/location', async function (req, res) {
    var lat = req.query.lat ? parseFloat(req.query.lat) : null;
    var lng = req.query.lng ? parseFloat(req.query.lng) : null;

    // GPS path: coordinates provided → Google Geocoding API
    if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
        try {
            var geocodeUrl = 'https://maps.googleapis.com/maps/api/geocode/json' +
                '?latlng=' + lat + ',' + lng +
                '&result_type=postal_code' +
                '&key=' + encodeURIComponent(process.env.GOOGLE_GEOCODING_KEY || '');
            var geocodeRes = await fetch(geocodeUrl, {
                headers: { 'User-Agent': 'bathremodelhub/1.0' },
                signal: AbortSignal.timeout(4000)
            });
            if (!geocodeRes.ok) return res.json({ zip: null });
            var geocodeData = await geocodeRes.json();
            if (geocodeData.status === 'OK' && geocodeData.results && geocodeData.results.length) {
                var components = geocodeData.results[0].address_components || [];
                for (var i = 0; i < components.length; i++) {
                    if (components[i].types.indexOf('postal_code') !== -1) {
                        return res.json({ zip: components[i].long_name });
                    }
                }
            }
            return res.json({ zip: null });
        } catch (err) {
            console.error('[location/google]', err.message);
            return res.json({ zip: null });
        }
    }

    // IP fallback: no coordinates → ipapi.co
    var ip = String(req.ip || '');
    var isPrivate = !ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|^$)/.test(ip);
    var ipapiUrl  = isPrivate
        ? 'https://ipapi.co/json/'
        : 'https://ipapi.co/' + encodeURIComponent(ip) + '/json/';
    try {
        var ipapiRes = await fetch(ipapiUrl, {
            headers: { 'User-Agent': 'bathremodelhub/1.0' },
            signal: AbortSignal.timeout(4000)
        });
        if (!ipapiRes.ok) return res.json({ zip: null });
        var ipapiData = await ipapiRes.json();
        var zip = (ipapiData.postal && ipapiData.postal.trim()) ? ipapiData.postal.trim() : null;
        return res.json({ zip: zip });
    } catch (err) {
        console.error('[location/ipapi]', err.message);
        return res.json({ zip: null });
    }
});

module.exports = router;
