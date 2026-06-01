'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express  = require('express');
const path     = require('path');

const { blockSensitiveFiles } = require('./middleware/security');
const apiRouter               = require('./routes/api');

const app      = express();
const PORT     = process.env.PORT || 3000;
const FRONTEND = path.join(__dirname, '..', 'frontend');

// ── Core middleware ───────────────────────────────────────────────────────────
app.use(express.json());
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.use(blockSensitiveFiles);

// ── Default page: redirect root to /bath ─────────────────────────────────────
app.get('/', (req, res) => res.redirect(301, '/bath'));

// ── Strip /index.html → clean URL redirect ────────────────────────────────────
app.use(function (req, res, next) {
    if (req.path.endsWith('/index.html')) {
        return res.redirect(301, req.path.slice(0, -10) || '/');
    }
    next();
});

// ── Static frontend ───────────────────────────────────────────────────────────
app.use(express.static(FRONTEND, {
    setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api', apiRouter);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, function () {
    console.log(`BathRemodelHub listening on http://localhost:${PORT}`);
});
