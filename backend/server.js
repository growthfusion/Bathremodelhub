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

// ── PostHog init script (key injected server-side, never hardcoded) ──────────
app.get('/js/posthog-init.js', function (req, res) {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    const key = process.env.POSTHOG_KEY || '';
    res.send(
        '!function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="Ji Yi init fn mn Hr pn bn cn capture calculateEventProperties Sn register register_once register_for_session unregister unregister_for_session In getFeatureFlag getFeatureFlagPayload getFeatureFlagResult getAllFeatureFlags isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync Mn identify setPersonProperties unsetPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset shutdown setIdentity clearIdentity get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException addExceptionStep captureLog startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty Cn xn createPersonProfile setInternalOrTestUser Tn hn Pn opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing debug Ur wt getPageViewId captureTraceFeedback captureTraceMetric an".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);\n' +
        'posthog.init(' + JSON.stringify(key) + ', {\n' +
        '    api_host: \'https://us.i.posthog.com\',\n' +
        '    defaults: \'2026-05-30\',\n' +
        '    person_profiles: \'identified_only\',\n' +
        '})\n'
    );
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
