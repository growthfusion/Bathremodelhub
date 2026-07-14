'use strict';

const express = require('express');
const { getToken, API_BASE } = require('../lib/auth');
const { chInsert }           = require('../lib/clickhouse');

const router = express.Router();

// ── Search tracking → ClickHouse (utm_subid + ZIP captured at Thumbtack search time) ──
// Fire-and-forget: callers don't await this, so a slow/failed insert never
// delays the /businesses response. Failures are caught and logged only.
function logSearchTracking(entry) {
    return chInsert(
        'hc_search_tracking',
        ['zip_code', 'utm_subid', 'search_query', 'utm_source', 'utm_campaign', 'utm_content'],
        [
            String(entry.zipCode      || '').slice(0, 10),
            String(entry.utmSubid     || '').slice(0, 200),
            String(entry.searchQuery  || '').slice(0, 200),
            String(entry.utmSource    || '').slice(0, 60),
            String(entry.utmCampaign  || '').slice(0, 60),
            String(entry.utmContent   || '').slice(0, 60),
        ]
    )
        .then(function () { console.log('[search-tracking] logged →', entry.zipCode, entry.utmSubid || '(no subid)'); })
        .catch(function (err) { console.error('[search-tracking]', err.message); });
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
    const { searchQuery, zipCode, utmData } = req.body;
    const cleanZip = String(zipCode || '').trim();

    console.log('[businesses] received →', { searchQuery, zipCode: cleanZip });

    if (!searchQuery || !cleanZip) {
        return res.status(400).json({ error: 'searchQuery and zipCode are required' });
    }
    if (!/^\d{5}$/.test(cleanZip)) {
        return res.status(400).json({ error: 'zipCode must be a 5-digit US ZIP code' });
    }

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
            utmData:     cleanUtm
        };
        console.log('[businesses] → upstream:', JSON.stringify(payload));

        // Fire-and-forget: log the ZIP + utm_subid sent to Thumbtack for this search.
        logSearchTracking({
            zipCode:     cleanZip,
            searchQuery: payload.searchQuery,
            utmSubid:    cleanUtm.utm_subid,
            utmSource:   cleanUtm.utm_source,
            utmCampaign: cleanUtm.utm_campaign,
            utmContent:  cleanUtm.utm_content,
        });

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
            let errMsg = `Upstream error ${upstream.status}`;
            try {
                const parsed = JSON.parse(rawBody);
                errMsg = parsed.detail || parsed.error || parsed.message || parsed.title || errMsg;
            } catch { errMsg = rawBody || errMsg; }
            return res.status(upstream.status).json({ error: errMsg });
        }

        res.json(JSON.parse(rawBody));
    } catch (err) {
        console.error('[businesses]', err.message);
        res.status(502).json({ error: err.message });
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
