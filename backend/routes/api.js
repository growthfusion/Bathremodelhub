'use strict';

const express = require('express');
const { getToken, API_BASE } = require('../lib/auth');

const router = express.Router();

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

        // Whitelist of UTM keys Thumbtack accepts.
        // utm_medium and utm_tt_session are explicitly disallowed by Thumbtack.
        const ALLOWED_UTM_KEYS = [
            'utm_source',
            'utm_campaign',
            'utm_content',
            'utm_subid',
            'utm_facebook_click_id',
            'utm_google_click_id'
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

module.exports = router;
