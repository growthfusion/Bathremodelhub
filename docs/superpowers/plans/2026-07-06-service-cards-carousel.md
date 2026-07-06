# Service Cards Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static 2/3-column service-cards grid on `frontend/bath/a/index.html` with a horizontally-scrolling carousel navigated by left/right arrow buttons and page dots.

**Architecture:** A CSS scroll-snap strip (`overflow-x:auto` + `scroll-snap-type`) where each card's width is a CSS percentage matching the current grid's breakpoints (100% under 640px, 50% from 640–1023px, 33.3% at 1024px+). Arrow buttons call `scrollBy()` one page-width at a time; native touch/trackpad scrolling provides swipe. A small JS controller builds page dots per breakpoint (via `matchMedia`) and keeps arrow disabled-state and active-dot in sync with scroll position.

**Tech Stack:** Vanilla HTML/CSS/JS in a single file, no build step, no new dependencies (matches existing codebase style). Manual verification via a headless Microsoft Edge instance driven over the Chrome DevTools Protocol (CDP) from Node — there is no existing test runner in this repo (`package.json` has no `test` script).

## Global Constraints

- Single file only: all changes go in `frontend/bath/a/index.html`. Do not touch `index.html` or `index2.html`.
- No new dependencies, no build step, no external carousel library.
- No autoplay/auto-advance.
- No changes to the 6 services, their copy, or their images.
- Subtitle copy changes from "Select a service to get an instant quote" to "Browse our most-requested services".
- Cards per page must match current grid breakpoints exactly: 1 (<640px), 2 (640–1023px), 3 (≥1024px).
- At the first/last page, the corresponding arrow is `disabled` — no wraparound.

---

### Task 1: Carousel markup, CSS, and static layout verification

**Files:**
- Modify: `frontend/bath/a/index.html:129-143` (CSS — "Service cards" block)
- Modify: `frontend/bath/a/index.html:275-281` (HTML — "What can we help with?" section)

**Interfaces:**
- Produces: DOM elements `#cardsViewport` (scrollable strip), `#cardsPrev` / `#cardsNext` (arrow buttons), `#cardsDots` (empty container, populated in Task 2), `#serviceCards` (unchanged id, still populated by existing JS). Task 2 wires behavior onto exactly these ids.

- [ ] **Step 1: Replace the "Service cards" CSS block**

In `frontend/bath/a/index.html`, find this block (currently lines 129-143):

```css
  /* Service cards */
  .cards{margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media(min-width:640px){.cards{gap:16px}}
  @media(min-width:1024px){.cards{grid-template-columns:repeat(3,1fr)}}
  .card{position:relative;display:flex;flex-direction:column;background:#fff;border:1px solid var(--border);border-radius:16px;padding:16px;cursor:pointer;transition:transform .15s,border-color .15s,box-shadow .15s}
  @media(min-width:640px){.card{padding:20px}}
  .card:hover{transform:translateY(-2px);border-color:var(--brand-accent);box-shadow:0 6px 16px rgba(0,0,0,.08)}
  .card:focus-visible{outline:2px solid var(--brand-accent);outline-offset:2px}
  .card.active{border:2px solid var(--brand);background:var(--brand-soft)}
  .card-check{position:absolute;top:12px;right:12px;width:24px;height:24px;border-radius:50%;background:var(--brand);color:#fff;display:none;align-items:center;justify-content:center}
  .card.active .card-check{display:flex}
  .card-img{margin-bottom:12px;width:80px;height:80px;border-radius:12px;overflow:hidden;background:var(--brand-soft)}
  .card-img img{width:100%;height:100%;object-fit:cover}
  .card-name{font-size:.95rem;font-weight:600;color:var(--brand)}
  .card-desc{margin:4px 0 0;font-size:.82rem;color:var(--brand-muted)}
```

Replace it with:

```css
  /* Service cards carousel */
  .cards-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px}
  .cards-head .section-title{text-align:left;margin:0}
  .cards-head .section-sub{text-align:left;margin:4px 0 0}
  .cards-arrows{display:flex;gap:8px;flex-shrink:0}
  .cards-arrow{width:40px;height:40px;border-radius:50%;border:1px solid var(--border);background:#fff;color:var(--brand);display:inline-flex;align-items:center;justify-content:center;font-size:1.25rem;line-height:1;flex-shrink:0;transition:border-color .15s,color .15s,opacity .15s}
  .cards-arrow:hover:not(:disabled){border-color:var(--brand-accent);color:var(--brand-accent)}
  .cards-arrow:focus-visible{outline:2px solid var(--brand-accent);outline-offset:2px}
  .cards-arrow:disabled{opacity:.35;cursor:default}

  .cards-viewport{margin-top:32px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;scrollbar-width:none;-ms-overflow-style:none}
  .cards-viewport::-webkit-scrollbar{display:none}
  .cards{display:grid;grid-auto-flow:column;grid-auto-columns:100%;gap:12px}
  @media(min-width:640px){.cards{grid-auto-columns:calc(50% - 8px);gap:16px}}
  @media(min-width:1024px){.cards{grid-auto-columns:calc(33.333% - 11px)}}

  .card{scroll-snap-align:start;position:relative;display:flex;flex-direction:column;background:#fff;border:1px solid var(--border);border-radius:16px;padding:16px}
  @media(min-width:640px){.card{padding:20px}}
  .card-img{margin-bottom:12px;width:80px;height:80px;border-radius:12px;overflow:hidden;background:var(--brand-soft)}
  .card-img img{width:100%;height:100%;object-fit:cover}
  .card-name{font-size:.95rem;font-weight:600;color:var(--brand)}
  .card-desc{margin:4px 0 0;font-size:.82rem;color:var(--brand-muted)}

  .cards-dots{margin-top:16px;display:flex;justify-content:center;gap:6px}
  .cards-dot{width:8px;height:8px;padding:0;border-radius:4px;background:var(--border);transition:background .15s,width .15s}
  .cards-dot.active{background:var(--brand-accent);width:20px}
```

Note what's gone: `cursor:pointer`, the hover-lift transform, `:focus-visible` outline, `.active`/`.card-check` — cards are no longer interactive, so these are dead weight.

- [ ] **Step 2: Replace the "What can we help with?" section markup**

Find this block (currently lines 275-281):

```html
<section class="section warm">
  <div class="wrap">
    <h2 class="section-title font-display">What can we help with?</h2>
    <p class="section-sub">Select a service to get an instant quote</p>
    <div class="cards" id="serviceCards"></div>
  </div>
</section>
```

Replace it with:

```html
<section class="section warm">
  <div class="wrap">
    <div class="cards-head">
      <div>
        <h2 class="section-title font-display">What can we help with?</h2>
        <p class="section-sub">Browse our most-requested services</p>
      </div>
      <div class="cards-arrows">
        <button type="button" class="cards-arrow" id="cardsPrev" aria-label="Previous services">‹</button>
        <button type="button" class="cards-arrow" id="cardsNext" aria-label="Next services">›</button>
      </div>
    </div>
    <div class="cards-viewport" id="cardsViewport">
      <div class="cards" id="serviceCards"></div>
    </div>
    <div class="cards-dots" id="cardsDots"></div>
  </div>
</section>
```

At this point the arrows and dots are inert (Task 2 wires their behavior) — `#serviceCards` is still populated by the existing, unmodified JS, so cards render exactly as before but inside the new scroll strip. This is expected and fine for this checkpoint.

- [ ] **Step 3: Start the dev server**

```bash
cd "c:\Users\growt\OneDrive - GrowthFusion\Desktop\Bathremodelhub"
(node backend/server.js > /tmp/server.log 2>&1 &)
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/bath/a/
```

Expected output: `200`

- [ ] **Step 4: Find the Microsoft Edge executable**

```bash
powershell -NoProfile -Command "Get-ChildItem -Path 'C:\Program Files*' -Filter msedge.exe -Recurse -ErrorAction SilentlyContinue -Depth 3 | Select-Object -First 1 -ExpandProperty FullName"
```

Copy the printed path — it's referenced as `$EDGE` in the next step (the version-numbered folder name varies by machine/update, so this must be discovered fresh, not hardcoded).

- [ ] **Step 5: Launch headless Edge with an isolated profile and remote debugging**

Do NOT omit `--user-data-dir` — without it, headless Edge launches against the real signed-in browser profile and extensions.

```bash
EDGE="<path from Step 4>"
SCRATCH="<your scratchpad directory>"
mkdir -p "$SCRATCH/edge-profile"
"$EDGE" --headless=new --disable-gpu --no-sandbox --remote-debugging-port=9333 --user-data-dir="$SCRATCH\edge-profile" --no-first-run --disable-extensions "http://localhost:8080/bath/a/" > /tmp/edge.log 2>&1 &
sleep 3
curl -s http://localhost:9333/json | node -e "
let data='';process.stdin.on('data',d=>data+=d).on('end',()=>{
  const arr = JSON.parse(data);
  const p = arr.find(x=>x.url && x.url.includes('localhost:8080/bath/a'));
  console.log(p.webSocketDebuggerUrl);
});"
```

Expected output: a line like `ws://localhost:9333/devtools/page/<id>` — save it as `$WS` for the next step.

- [ ] **Step 6: Write the layout verification script**

Save this to `<your scratchpad directory>/verify-cards-layout.mjs`:

```js
const wsUrl = process.argv[2];
const url = process.argv[3];
const width = parseInt(process.argv[4], 10);

const ws = new WebSocket(wsUrl);
let id = 1;
const pending = new Map();
function send(method, params) {
  const myId = id++;
  ws.send(JSON.stringify({ id: myId, method, params }));
  return new Promise((resolve) => pending.set(myId, resolve));
}
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id !== undefined && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
});
ws.addEventListener('open', async () => {
  await send('Page.enable', {});
  await send('Runtime.enable', {});
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 2, mobile: width < 768 });
  await send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, 2000));
  const result = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      viewportScrollWidth: document.getElementById('cardsViewport').scrollWidth,
      viewportClientWidth: document.getElementById('cardsViewport').clientWidth,
      cardCount: document.querySelectorAll('#serviceCards .card').length
    })`,
    returnByValue: true
  });
  console.log(result.value);
  process.exit(0);
});
setTimeout(() => { console.error('timeout'); process.exit(1); }, 15000);
```

- [ ] **Step 7: Run the layout verification at three breakpoints**

```bash
SCRATCH="<your scratchpad directory>"
for w in 375 700 1200; do
  echo "--- width $w ---"
  node "$SCRATCH/verify-cards-layout.mjs" "$WS" "http://localhost:8080/bath/a/" "$w"
done
```

Expected for **every** width (375, 700, 1200):
- `docScrollWidth` equals `innerWidth` (no page-wide horizontal overflow — this is the same class of bug fixed earlier in the hero section; the carousel's `overflow-x:auto` must stay contained to `.cards-viewport`, not leak to the page)
- `cardCount` is `6`
- `viewportScrollWidth` is greater than `viewportClientWidth` (the strip is actually scrollable — confirms the percentage-width columns are working at each breakpoint)

If `viewportScrollWidth` equals `viewportClientWidth` at any width, the `grid-auto-columns` percentage math is wrong for that breakpoint — re-check Step 1.

- [ ] **Step 8: Stop the headless browser and server**

```bash
taskkill //F //IM msedge.exe //T 2>/dev/null
ps -W | grep -i node.exe | awk '{print $2}' | while read pid; do taskkill //F //PID "$pid" 2>/dev/null; done
echo done
```

- [ ] **Step 9: Commit**

```bash
git add frontend/bath/a/index.html
git commit -m "$(cat <<'EOF'
Add carousel shell (markup + CSS) for service cards on /bath/a/

Static layout only -- arrows and dots are wired up in the next commit.
EOF
)"
```

---

### Task 2: Carousel JS behavior

**Files:**
- Modify: `frontend/bath/a/index.html:373-436` (JS — `state` init, card rendering, remove `selectService`)

**Interfaces:**
- Consumes: `#cardsViewport`, `#cardsPrev`, `#cardsNext`, `#cardsDots`, `#serviceCards` (all produced by Task 1's markup); `SERVICE_CARDS` array (already defined earlier in the same script, unchanged).
- Produces: no new ids consumed elsewhere — this is the last task.

- [ ] **Step 1: Simplify card rendering — remove click-to-select wiring**

Find this block (currently lines 377-394):

```js
  // Render service cards
  var cardsWrap = document.getElementById("serviceCards");
  SERVICE_CARDS.forEach(function(c){
    var el = document.createElement("div");
    el.className = "card";
    el.setAttribute("role","button");
    el.setAttribute("tabindex","0");
    el.setAttribute("data-id",c.id);
    el.innerHTML =
      '<span class="card-check"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M4 10.5l4 4 8-9"/></svg></span>' +
      '<div class="card-img"><img src="'+c.img+'" alt="" loading="lazy" decoding="async" width="160" height="160" /></div>' +
      '<div class="card-name">'+c.name+'</div>' +
      '<p class="card-desc">'+c.desc+'</p>';
    var activate = function(){ selectService(c.id); };
    el.addEventListener("click", activate);
    el.addEventListener("keydown", function(e){ if(e.key==="Enter"||e.key===" "){e.preventDefault();activate();} });
    cardsWrap.appendChild(el);
  });
```

Replace it with:

```js
  // Render service cards
  var cardsWrap = document.getElementById("serviceCards");
  SERVICE_CARDS.forEach(function(c){
    var el = document.createElement("div");
    el.className = "card";
    el.innerHTML =
      '<div class="card-img"><img src="'+c.img+'" alt="" loading="lazy" decoding="async" width="160" height="160" /></div>' +
      '<div class="card-name">'+c.name+'</div>' +
      '<p class="card-desc">'+c.desc+'</p>';
    cardsWrap.appendChild(el);
  });

  // Cards carousel
  var cardsViewport = document.getElementById("cardsViewport");
  var cardsPrevBtn = document.getElementById("cardsPrev");
  var cardsNextBtn = document.getElementById("cardsNext");
  var cardsDotsWrap = document.getElementById("cardsDots");
  var cardsPerPage = 1;

  function getCardsPerPage(){
    if (window.matchMedia("(min-width:1024px)").matches) return 3;
    if (window.matchMedia("(min-width:640px)").matches) return 2;
    return 1;
  }

  function updateCardsControls(){
    var maxScroll = cardsViewport.scrollWidth - cardsViewport.clientWidth;
    var atStart = cardsViewport.scrollLeft <= 1;
    var atEnd = cardsViewport.scrollLeft >= maxScroll - 1;
    cardsPrevBtn.disabled = atStart;
    cardsNextBtn.disabled = maxScroll <= 1 ? true : atEnd;

    var activeIndex = cardsViewport.clientWidth
      ? Math.round(cardsViewport.scrollLeft / cardsViewport.clientWidth)
      : 0;
    Array.prototype.forEach.call(cardsDotsWrap.children, function(dot, i){
      var isActive = i === activeIndex;
      dot.classList.toggle("active", isActive);
      if (isActive) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  }

  function renderCardsDots(){
    cardsPerPage = getCardsPerPage();
    var pageCount = Math.ceil(SERVICE_CARDS.length / cardsPerPage);
    cardsDotsWrap.innerHTML = "";
    for (var i = 0; i < pageCount; i++){
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "cards-dot";
      dot.setAttribute("aria-label", "Go to page " + (i + 1));
      dot.addEventListener("click", function(){
        var idx = Array.prototype.indexOf.call(cardsDotsWrap.children, this);
        cardsViewport.scrollTo({ left: idx * cardsViewport.clientWidth, behavior: "smooth" });
      });
      cardsDotsWrap.appendChild(dot);
    }
    updateCardsControls();
  }

  cardsPrevBtn.addEventListener("click", function(){
    cardsViewport.scrollBy({ left: -cardsViewport.clientWidth, behavior: "smooth" });
  });
  cardsNextBtn.addEventListener("click", function(){
    cardsViewport.scrollBy({ left: cardsViewport.clientWidth, behavior: "smooth" });
  });

  var cardsScrollTimer;
  cardsViewport.addEventListener("scroll", function(){
    clearTimeout(cardsScrollTimer);
    cardsScrollTimer = setTimeout(updateCardsControls, 100);
  });

  var cardsResizeTimer;
  window.addEventListener("resize", function(){
    clearTimeout(cardsResizeTimer);
    cardsResizeTimer = setTimeout(function(){
      if (getCardsPerPage() !== cardsPerPage) renderCardsDots();
      else updateCardsControls();
    }, 150);
  });

  renderCardsDots();
```

- [ ] **Step 2: Remove the `selectService` function**

Find this block (currently lines 421-436):

```js
  // Service select
  function selectService(id){
    state.activeService = state.activeService === id ? null : id;
    document.querySelectorAll(".card").forEach(function(el){
      el.classList.toggle("active", el.getAttribute("data-id") === state.activeService);
      el.setAttribute("aria-pressed", el.getAttribute("data-id") === state.activeService);
    });
    if(primaryZip){
      primaryZip.scrollIntoView({behavior:"smooth", block:"center"});
      setTimeout(function(){
        primaryZip.focus();
        primaryZip.classList.add("pulse");
        setTimeout(function(){ primaryZip.classList.remove("pulse"); }, 1600);
      }, 400);
    }
  }

```

Delete it entirely (including the blank line after it). Nothing else calls `selectService` — the CTA buttons (`[data-cta]` handler, further down) already inline their own identical scroll+pulse logic and don't depend on it.

- [ ] **Step 3: Remove the now-dead `activeService` state field**

Find:

```js
  var state = { zip:"", activeService:null, submitted:false };
```

Replace with:

```js
  var state = { zip:"", submitted:false };
```

- [ ] **Step 4: Start the dev server** (skip if still running from Task 1)

```bash
cd "c:\Users\growt\OneDrive - GrowthFusion\Desktop\Bathremodelhub"
(node backend/server.js > /tmp/server.log 2>&1 &)
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/bath/a/
```

Expected output: `200`

- [ ] **Step 5: Launch headless Edge with an isolated profile and remote debugging** (skip if still running from Task 1; use the same `--user-data-dir` warning from Task 1 Step 5)

```bash
EDGE="<path from Task 1 Step 4>"
SCRATCH="<your scratchpad directory>"
mkdir -p "$SCRATCH/edge-profile2"
"$EDGE" --headless=new --disable-gpu --no-sandbox --remote-debugging-port=9333 --user-data-dir="$SCRATCH\edge-profile2" --no-first-run --disable-extensions "http://localhost:8080/bath/a/" > /tmp/edge2.log 2>&1 &
sleep 3
curl -s http://localhost:9333/json | node -e "
let data='';process.stdin.on('data',d=>data+=d).on('end',()=>{
  const arr = JSON.parse(data);
  const p = arr.find(x=>x.url && x.url.includes('localhost:8080/bath/a'));
  console.log(p.webSocketDebuggerUrl);
});"
```

Expected output: a `ws://localhost:9333/devtools/page/<id>` line — save as `$WS`.

- [ ] **Step 6: Write the behavior verification script**

Save this to `<your scratchpad directory>/verify-cards-behavior.mjs`:

```js
const wsUrl = process.argv[2];
const url = process.argv[3];
const width = parseInt(process.argv[4], 10);

const ws = new WebSocket(wsUrl);
let id = 1;
const pending = new Map();
function send(method, params) {
  const myId = id++;
  ws.send(JSON.stringify({ id: myId, method, params }));
  return new Promise((resolve) => pending.set(myId, resolve));
}
function evaluate(expression) {
  return send('Runtime.evaluate', { expression, returnByValue: true }).then(r => JSON.parse(r.value));
}
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id !== undefined && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
});
ws.addEventListener('open', async () => {
  await send('Page.enable', {});
  await send('Runtime.enable', {});
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 2, mobile: width < 768 });
  await send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, 2000));

  const dotCount = await evaluate(`JSON.stringify(document.querySelectorAll('#cardsDots .cards-dot').length)`);
  const prevDisabledStart = await evaluate(`JSON.stringify(document.getElementById('cardsPrev').disabled)`);
  const cardHasNoRole = await evaluate(`JSON.stringify(document.querySelector('#serviceCards .card').getAttribute('role'))`);

  await evaluate(`document.getElementById('cardsNext').click(); "ok"`);
  await new Promise(r => setTimeout(r, 600));
  const scrollAfterNext = await evaluate(`JSON.stringify(document.getElementById('cardsViewport').scrollLeft)`);

  for (let i = 0; i < 10; i++) {
    const disabled = await evaluate(`JSON.stringify(document.getElementById('cardsNext').disabled)`);
    if (disabled) break;
    await evaluate(`document.getElementById('cardsNext').click(); "ok"`);
    await new Promise(r => setTimeout(r, 600));
  }
  const nextDisabledAtEnd = await evaluate(`JSON.stringify(document.getElementById('cardsNext').disabled)`);
  const prevDisabledAtEnd = await evaluate(`JSON.stringify(document.getElementById('cardsPrev').disabled)`);

  await evaluate(`document.querySelectorAll('#cardsDots .cards-dot')[0].click(); "ok"`);
  await new Promise(r => setTimeout(r, 600));
  const scrollAfterFirstDot = await evaluate(`JSON.stringify(document.getElementById('cardsViewport').scrollLeft)`);
  const prevDisabledAfterFirstDot = await evaluate(`JSON.stringify(document.getElementById('cardsPrev').disabled)`);

  console.log(JSON.stringify({
    dotCount, prevDisabledStart, cardHasNoRole, scrollAfterNext,
    nextDisabledAtEnd, prevDisabledAtEnd, scrollAfterFirstDot, prevDisabledAfterFirstDot
  }, null, 2));
  process.exit(0);
});
setTimeout(() => { console.error('timeout'); process.exit(1); }, 25000);
```

- [ ] **Step 7: Run the behavior verification at three breakpoints**

```bash
SCRATCH="<your scratchpad directory>"
for w in 375 700 1200; do
  echo "--- width $w ---"
  node "$SCRATCH/verify-cards-behavior.mjs" "$WS" "http://localhost:8080/bath/a/" "$w"
done
```

Expected:

| field | width 375 | width 700 | width 1200 |
|---|---|---|---|
| `dotCount` | `6` | `3` | `2` |
| `prevDisabledStart` | `true` | `true` | `true` |
| `cardHasNoRole` | `null` | `null` | `null` |
| `scrollAfterNext` | `> 0` | `> 0` | `> 0` |
| `nextDisabledAtEnd` | `true` | `true` | `true` |
| `prevDisabledAtEnd` | `false` | `false` | `false` |
| `scrollAfterFirstDot` | `< 5` | `< 5` | `< 5` |
| `prevDisabledAfterFirstDot` | `true` | `true` | `true` |

If `dotCount` doesn't match at a given width, `getCardsPerPage()`'s breakpoints don't line up with the CSS `grid-auto-columns` breakpoints from Task 1 — they must match exactly (640px, 1024px). If `nextDisabledAtEnd` is never `true` within 10 clicks, `updateCardsControls()`'s `maxScroll` math is off — check for off-by-one issues against `scrollWidth - clientWidth`.

- [ ] **Step 8: Manually verify swipe still works and no other section broke**

```bash
SCRATCH="<your scratchpad directory>"
node -e "
const wsUrl = '$WS';
const ws = new WebSocket(wsUrl);
ws.addEventListener('open', async () => {
  ws.send(JSON.stringify({id:1, method:'Page.captureScreenshot', params:{format:'png'}}));
});
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id === 1) {
    require('fs').writeFileSync('$SCRATCH/final-check.png', Buffer.from(msg.result.data, 'base64'));
    console.log('saved');
    process.exit(0);
  }
});
setTimeout(() => process.exit(1), 8000);
"
```

Open `<scratchpad>/final-check.png` and confirm: the carousel shows 3 cards (at whatever width `$WS` was last navigated to in Step 7), the header/hero/stats sections above it are unaffected, and nothing looks visually broken.

- [ ] **Step 9: Stop the headless browser and server**

```bash
taskkill //F //IM msedge.exe //T 2>/dev/null
ps -W | grep -i node.exe | awk '{print $2}' | while read pid; do taskkill //F //PID "$pid" 2>/dev/null; done
echo done
```

- [ ] **Step 10: Commit**

```bash
git add frontend/bath/a/index.html
git commit -m "$(cat <<'EOF'
Wire up carousel arrows, dots, and remove card click-to-select on /bath/a/

Cards are now purely informational; navigation is via arrows/dots/swipe
instead of tapping a card to auto-scroll to the ZIP field.
EOF
)"
```
