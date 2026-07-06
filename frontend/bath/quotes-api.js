'use strict';

// Auto-detect ZIP from GPS or IP and pre-fill any empty ZIP inputs on the page.
// Caches result in sessionStorage so the API is only called once per session.
window.detectAndFillZip = async function (fieldIds) {
    var ids    = fieldIds || ['landingZipInput', 'sticky-zip-input'];
    var fields = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
    var empty  = fields.filter(function (el) { return !el.value; });
    if (!empty.length) return;

    var zip = sessionStorage.getItem('brh_zip');
    if (!zip) {
        zip = await new Promise(function (resolve) {
            function fetchByIp() {
                fetch('/api/location')
                    .then(function (r) { return r.json(); })
                    .then(function (d) { resolve((d.zip && d.zip.trim()) ? d.zip.trim() : null); })
                    .catch(function () { resolve(null); });
            }
            if (!navigator.geolocation) { fetchByIp(); return; }
            navigator.geolocation.getCurrentPosition(
                function (pos) {
                    fetch('/api/location?lat=' + pos.coords.latitude + '&lng=' + pos.coords.longitude)
                        .then(function (r) { return r.json(); })
                        .then(function (d) {
                            if (d.zip && d.zip.trim()) { resolve(d.zip.trim()); }
                            else { fetchByIp(); }
                        })
                        .catch(function () { fetchByIp(); });
                },
                function () { fetchByIp(); },
                { timeout: 10000, maximumAge: 300000 }
            );
        });
        if (zip) sessionStorage.setItem('brh_zip', zip);
    }

    if (!zip) return;
    empty.forEach(function (el) { if (!el.value) el.value = zip; });
};

document.addEventListener('DOMContentLoaded', function () {

    // ── Load Material Symbols if not already on this page ────────────────────
    if (!document.querySelector('link[href*="Material+Symbols"]')) {
        var iconLink = document.createElement('link');
        iconLink.rel  = 'stylesheet';
        iconLink.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap';
        document.head.appendChild(iconLink);
        var iconStyle = document.createElement('style');
        iconStyle.textContent = '.material-symbols-outlined{font-variation-settings:"FILL" 0,"wght" 400,"GRAD" 0,"opsz" 24;font-family:"Material Symbols Outlined";font-weight:normal;font-style:normal;line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;direction:ltr;-webkit-font-smoothing:antialiased;}';
        document.head.appendChild(iconStyle);
    }

    // ── Shared helpers ────────────────────────────────────────────────────────
    function parseKeywords(data) {
        var list = Array.isArray(data)          ? data
                 : Array.isArray(data.data)     ? data.data
                 : Array.isArray(data.keywords) ? data.keywords
                 : Array.isArray(data.results)  ? data.results : [];
        return list.map(function (k) {
            return typeof k === 'string' ? k : (k.keyword || k.name || k.label || k.searchQuery || '');
        }).filter(Boolean);
    }

    function show(el) { if (el) el.classList.remove('hidden'); }
    function hide(el) { if (el) el.classList.add('hidden'); }

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Carry tracking/UTM params from the landing URL through to /results.html
    // so utmData can be forwarded to Thumbtack and click attribution is preserved.
    function trackingParams() {
        var p = new URLSearchParams(window.location.search);
        var keys = [
            'sub1', 'sub2', 'sub3', 'sub4', 'sub11',
            'fbclid', 'rt_ad', 'rt_cid', 'zipcode',
            'utm_source', 'utm_campaign', 'utm_content',
            'utm_subid', 'utm_user_hash',
            'utm_facebook_click_id', 'utm_rt_ad',
            'gclid', 'ttclid', 'ScCid', 'source_id'
        ];
        return keys.reduce(function (s, k) {
            var v = p.get(k);
            return v ? s + '&' + k + '=' + encodeURIComponent(v) : s;
        }, '');
    }
    window.hcTrackingParams = trackingParams;

    function setContent(el, html) {
        var clean = window.DOMPurify
            ? window.DOMPurify.sanitize(html, {
                ALLOWED_TAGS: ['div', 'p', 'span', 'button', 'strong', 'br'],
                ALLOWED_ATTR: ['class', 'style', 'data-idx']
              })
            : html.replace(/<script[\s\S]*?<\/script>/gi, '');
        var doc = new DOMParser().parseFromString(clean, 'text/html');
        while (el.firstChild) el.removeChild(el.firstChild);
        Array.from(doc.body.childNodes).forEach(function (n) { el.appendChild(n.cloneNode(true)); });
    }

    function makeEl(tag, attrs) {
        var el = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            if (k === 'text') { el.textContent = attrs[k]; }
            else { el.setAttribute(k, attrs[k]); }
        });
        return el;
    }

    // ── Keyword → Material Symbols icon mapping ───────────────────────────────
    function getServiceIcon(keyword) {
        var k = (keyword || '').toLowerCase();
        if (/bath|shower|tub|vanity|toilet|tile/.test(k))       return 'bathtub';
        if (/fence|gate/.test(k))                               return 'fence';
        if (/paint|painter|stain/.test(k))                      return 'format_paint';
        if (/roof|shingle|gutter/.test(k))                      return 'roofing';
        if (/lawn|grass|turf|mow|landscap|sod/.test(k))         return 'grass';
        if (/plumb|pipe|drain|water heater|leak/.test(k))       return 'plumbing';
        if (/electric|wir|outlet|panel/.test(k))                return 'bolt';
        if (/clean|maid|housekeep|pressure|power wash/.test(k)) return 'cleaning_services';
        if (/deck|patio|pergola/.test(k))                       return 'deck';
        if (/hvac|heat|cool|\bac\b|air cond|furnace/.test(k))   return 'hvac';
        if (/carpet|floor|hardwood|vinyl/.test(k))              return 'floor';
        if (/window/.test(k))                                   return 'window';
        if (/tree|arborist|trimm|shrub|hedge/.test(k))          return 'park';
        if (/pest|termite|insect|rodent/.test(k))               return 'pest_control';
        if (/pool|spa|hot tub/.test(k))                         return 'pool';
        if (/door|garage/.test(k))                              return 'door_front';
        if (/kitchen/.test(k))                                  return 'kitchen';
        if (/drywall|plaster/.test(k))                          return 'home_repair_service';
        if (/concrete|asphalt|paving/.test(k))                  return 'construction';
        if (/solar/.test(k))                                    return 'solar_power';
        return 'home_repair_service';
    }

    function buildHeroKwCard(kw, zip) {
        var card = document.createElement('button');
        card.className = 'hero-kw-card';
        card.type = 'button';

        var iconWrap = document.createElement('div');
        iconWrap.className = 'hero-kw-card__icon';
        var iconSpan = document.createElement('span');
        iconSpan.className = 'material-symbols-outlined';
        iconSpan.textContent = getServiceIcon(kw);
        iconWrap.appendChild(iconSpan);

        var label = document.createElement('span');
        label.className = 'hero-kw-card__label';
        label.textContent = kw;

        card.appendChild(iconWrap);
        card.appendChild(label);

        card.addEventListener('click', function () {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
                event: 'Search',
                question_text: 'What Bathroom Service Do You Need?',
                question_id: 'service_selection',
                answer_text: kw,
                Search: kw
            });
            window.location.href = '/bath/results.html?searchQuery=' + encodeURIComponent(kw)
                + '&zipCode=' + encodeURIComponent(zip) + trackingParams();
        });

        return card;
    }

    // ── Hero form: ZIP → keyword cards ───────────────────────────────────────
    var heroForm = document.getElementById('hero-zip-form');
    var heroZip  = document.getElementById('hero-zip');

    if (heroForm && heroZip) {
        var zipLabel = document.querySelector('label[for="hero-zip"]');
        if (zipLabel) zipLabel.textContent = 'What Is Your ZIP Code?';

        var fieldWrapper = heroZip.closest('.hero-x__field') || heroZip.parentElement;
        if (fieldWrapper && fieldWrapper !== heroZip) {
            fieldWrapper.style.position = 'relative';
            var locSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            locSvg.setAttribute('viewBox', '0 0 24 24');
            locSvg.setAttribute('width', '16');
            locSvg.setAttribute('height', '16');
            locSvg.setAttribute('fill', '#9CA3AF');
            locSvg.setAttribute('aria-hidden', 'true');
            locSvg.style.cssText = 'position:absolute;left:14px;top:50%;transform:translateY(-50%);pointer-events:none;';
            var locPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            locPath.setAttribute('d', 'M12 2C8.686 2 6 4.686 6 8c0 5.5 6 14 6 14s6-8.5 6-14c0-3.314-2.686-6-6-6zm0 8.5A2.5 2.5 0 1 1 12 5.5a2.5 2.5 0 0 1 0 5z');
            locSvg.appendChild(locPath);
            fieldWrapper.appendChild(locSvg);
            heroZip.style.paddingLeft = '38px';
        }

        var heroSearchQuery = heroForm.dataset.searchQuery || 'bathroom remodeling';

        heroForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var zip = heroZip.value.trim();
            if (!/^\d{5}$/.test(zip)) { heroZip.focus(); return; }

            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
                event: 'Search',
                question_text: 'What Is Your ZIP Code?',
                question_id: 'zip_submission',
                answer_text: zip,
                Search: heroSearchQuery
            });

            window.location.href = '/bath/results.html?searchQuery=' + encodeURIComponent(heroSearchQuery)
                + '&zipCode=' + encodeURIComponent(zip) + trackingParams();
        });
    }

    // ── CTA form: ZIP → results ───────────────────────────────────────────────
    var getQuotesBtn = document.getElementById('get-quotes-btn');
    var zipInput     = document.getElementById('zip-input');
    var zipError     = document.getElementById('zip-error');

    if (!zipInput || !getQuotesBtn) return;

    var searchQuery = getQuotesBtn.dataset.searchQuery || 'bathroom remodeling';

    getQuotesBtn.addEventListener('click', function () {
        var zip = zipInput.value.trim();
        if (!/^\d{5}$/.test(zip)) {
            show(zipError);
            if (zipError) zipError.textContent = 'Please enter a valid 5-digit ZIP code.';
            zipInput.focus();
            return;
        }
        hide(zipError);

        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            event: 'Search',
            question_text: 'What Is Your ZIP Code?',
            question_id: 'zip_submission',
            answer_text: zip,
            Search: searchQuery
        });

        window.location.href = '/bath/results.html?searchQuery=' + encodeURIComponent(searchQuery)
            + '&zipCode=' + encodeURIComponent(zip) + trackingParams();
    });

    document.querySelectorAll('.js-scroll-quote').forEach(function (btn) {
        btn.addEventListener('click', function () {
            zipInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(function () { zipInput.focus(); }, 500);
        });
    });

    // Auto-fill empty ZIP fields from geolocation / IP
    window.detectAndFillZip();
});
