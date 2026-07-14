'use strict';

const https = require('https');

// Accepts either a bare hostname or a full URL (strips a protocol prefix if
// one is present, since https.request's `hostname` option must be bare).
const CH_HOST     = String(process.env.CH_HOST || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
const CH_PORT     = Number(process.env.CH_PORT) || 8443;
const CH_DATABASE = process.env.CH_DATABASE || 'default';
const CH_USER     = process.env.CH_USER || 'default';
const CH_PASSWORD = process.env.CH_PASSWORD || '';
const CH_AUTH     = Buffer.from(`${CH_USER}:${CH_PASSWORD}`).toString('base64');
const CH_TTL      = 5 * 60 * 1000;
const chCache     = new Map();

// Connection pool — reuses HTTPS sockets instead of opening a new one per query
const chAgent = new https.Agent({
    keepAlive:      true,
    maxSockets:     10,       // max concurrent connections to ClickHouse
    keepAliveMsecs: 30000,    // keep idle sockets alive for 30s
});

function chRequest(body, extraQuery) {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: CH_HOST,
            port:     CH_PORT,
            path:     '/?database=' + encodeURIComponent(CH_DATABASE) + (extraQuery || ''),
            method:   'POST',
            agent:    chAgent,
            headers:  {
                Authorization:    `Basic ${CH_AUTH}`,
                'Content-Type':   'text/plain; charset=utf-8',
                'Content-Length': Buffer.byteLength(body, 'utf8'),
            },
        };
        const req = https.request(opts, (res) => {
            const chunks = [];
            res.on('data', (d) => chunks.push(d));
            res.on('end', () => {
                const buf = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode !== 200) {
                    return reject(new Error(`CH ${res.statusCode}: ${buf.slice(0, 300)}`));
                }
                resolve(buf);
            });
        });
        req.on('error', reject);
        req.write(body, 'utf8');
        req.end();
    });
}

async function chQuery(sql, cacheKey) {
    if (cacheKey) {
        const hit = chCache.get(cacheKey);
        if (hit && Date.now() - hit.ts < CH_TTL) return hit.data;
    }
    const buf = await chRequest(sql.trim() + '\nFORMAT JSON');
    let rows;
    try { rows = JSON.parse(buf).data || []; }
    catch (e) { throw new Error('CH JSON: ' + buf.slice(0, 200)); }
    if (cacheKey) chCache.set(cacheKey, { data: rows, ts: Date.now() });
    return rows;
}

// Inserts one row using ClickHouse's native query-parameter binding
// ({name:Type} placeholders in the query text + param_name=value in the URL
// query string) — user-controlled values are never concatenated into the SQL
// text itself, so there's no injection risk from search/ZIP/UTM input.
async function chInsert(table, columns, values) {
    const placeholders = columns.map((c, i) => `{p${i}:String}`).join(', ');
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    const params = columns
        .map((c, i) => `param_p${i}=${encodeURIComponent(String(values[i] == null ? '' : values[i]))}`)
        .join('&');
    await chRequest(sql, '&' + params);
}

module.exports = { chQuery, chInsert };
