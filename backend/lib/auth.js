'use strict';

const API_BASE = (process.env.API_BASE_URL || '').replace(/\/+$/, '');

const TOKEN_URL = process.env.TOKEN_URL
    || `${API_BASE.replace('staging-api.', 'staging-auth.').replace('api.', 'auth.')}/oauth2/token`;

const CLIENT_ID     = process.env.CLIENT_ID     || '';
const CLIENT_SECRET = process.env.CLIENT_SECRET || '';

let _token    = process.env.ACCESS_TOKEN || '';
let _tokenExp = 0;

function jwtExp(token) {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
    } catch { return 0; }
}

if (_token) {
    _tokenExp = jwtExp(_token);
    const secsLeft = Math.round((_tokenExp - Date.now()) / 1000);
    if (secsLeft > 0) {
        console.log(`[auth] env token valid for ${secsLeft}s`);
    } else {
        console.log('[auth] env ACCESS_TOKEN is expired — will fetch a new one on first request');
        _tokenExp = 0;
    }
}

async function fetchNewToken() {
    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('CLIENT_ID and CLIENT_SECRET must be set in .env to refresh the token');
    }
    console.log(`[auth] fetching new token from ${TOKEN_URL}`);
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const res = await fetch(TOKEN_URL, {
        method:  'POST',
        headers: {
            'Content-Type':  'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basic}`
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', audience: 'urn:partner-api' }).toString()
    });
    const text = await res.text().catch(() => '');
    console.log(`[auth] token response ${res.status}:`, text.slice(0, 300));
    if (!res.ok) {
        throw new Error(`Token refresh failed (${res.status}): ${text}`);
    }
    const data = JSON.parse(text);
    _token    = data.access_token;
    _tokenExp = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
    console.log(`[auth] new token acquired, expires in ${Math.round((data.expires_in || 3600) / 60)} min`);
    return _token;
}

async function getToken() {
    if (Date.now() >= _tokenExp - 60_000) return fetchNewToken();
    return _token;
}

module.exports = { getToken, API_BASE };
