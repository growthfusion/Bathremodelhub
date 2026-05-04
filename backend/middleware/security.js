'use strict';

function blockSensitiveFiles(req, res, next) {
    const p = req.path;
    if (/^\/\./.test(p) || /^\/(server\.js|package(-lock)?\.json)$/.test(p)) {
        return res.status(403).end();
    }
    next();
}

module.exports = { blockSensitiveFiles };
