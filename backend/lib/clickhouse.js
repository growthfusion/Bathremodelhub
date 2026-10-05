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
const CH_TIMEOUT  = 10000;   // ms, per request
const chCache     = new Map();

// Connection pool — reuses HTTPS sockets instead of opening a new one per query
const chAgent = new https.Agent({
    keepAlive:      true,
    maxSockets:     10,       // max concurrent connections to ClickHouse
    keepAliveMsecs: 30000,    // keep idle sockets alive for 30s
});

function chRequest(body, extraQuery, timeoutMs) {
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
                    const err = new Error(`CH ${res.statusCode}: ${buf.slice(0, 300)}`);
                    err.status = res.statusCode;
                    return reject(err);
                }
                resolve(buf);
            });
        });
        req.on('error', reject);
        // Fail fast instead of hanging forever on a stuck connection
        req.setTimeout(timeoutMs || CH_TIMEOUT, () => req.destroy(new Error('CH timeout')));
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
//
// Reliability:
//  - async_insert=1 lets ClickHouse batch many single-row inserts server-side
//    (avoids "too many parts" under load); wait_for_async_insert=1 makes the
//    call resolve only once the row is durably flushed, so success means saved.
//  - Network errors, timeouts and 5xx are retried (3 attempts, short backoff).
//    4xx (bad column, auth, syntax) will not succeed on retry, so they fail fast.
const INSERT_ATTEMPTS = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function chInsert(table, columns, values) {
    const placeholders = columns.map((c, i) => `{p${i}:String}`).join(', ');
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    const params = columns
        .map((c, i) => `param_p${i}=${encodeURIComponent(String(values[i] == null ? '' : values[i]))}`)
        .join('&');
    const query = '&async_insert=1&wait_for_async_insert=1&' + params;

    let lastErr;
    for (let attempt = 1; attempt <= INSERT_ATTEMPTS; attempt++) {
        try {
            await chRequest(sql, query);
            return;
        } catch (err) {
            // Node's AggregateError (e.g. ECONNREFUSED) can have an empty message
            if (!err.message) err.message = err.code || (err.errors && err.errors[0] && err.errors[0].code) || 'connection error';
            lastErr = err;
            const retryable = !err.status || err.status >= 500 || err.status === 429;
            if (!retryable || attempt === INSERT_ATTEMPTS) break;
            await sleep(attempt * 300);
        }
    }
    throw lastErr;
}

module.exports = { chQuery, chInsert };
