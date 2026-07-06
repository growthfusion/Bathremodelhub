# Service Cards Carousel — Design

**Page**: `frontend/bath/a/index.html`
**Section**: "What can we help with?" (service cards, `#serviceCards`)
**Date**: 2026-07-06

## Problem

The service cards section renders as a static CSS grid (2 columns on mobile, 3 on desktop). On mobile this pushes the section to ~3 full screens of vertical scroll before a visitor reaches the next section. The request is to turn it into a horizontally-paged carousel with left/right arrow navigation, on all screen sizes.

## Approach

CSS scroll-snap carousel: a horizontally-scrolling strip (`overflow-x:auto` + `scroll-snap-type:x mandatory`) where each card's width is a CSS percentage of the strip (100% under 640px, 50% from 640–1023px, 33.3% at 1024px+) — mirroring the current grid's column breakpoints. Arrow buttons call `scrollBy()` by one viewport-width; native touch/trackpad scrolling provides swipe support with no custom drag logic.

Rejected alternatives:
- **JS transform slider** (manual `currentPage` state + `transform: translateX`) — needs hand-rolled touch/swipe handling and re-grouping cards into pages on resize. More code, more edge cases, for no real UX benefit over native scrolling.
- **Third-party carousel library** — this page is a single self-contained HTML file with zero build step and zero frontend dependencies. Adding a library for a 6-item carousel breaks that pattern for no real gain.

## Layout

Section head becomes a flex row: title + subtitle on the left, two round arrow buttons (‹ ›) on the right. Below it, the horizontally-scrollable card strip. Dots are centered below the strip.

```
What can we help with?              (‹) (›)
Browse our most-requested services

┌──────────┐ ┌──────────┐ ┌──────────┐
│  Card 1  │ │  Card 2  │ │  Card 3  │   (however many fit per breakpoint)
└──────────┘ └──────────┘ └──────────┘
        ●  ○  ○
```

## Copy change

Subtitle changes from "Select a service to get an instant quote" → **"Browse our most-requested services"**, since cards are no longer tappable/selectable.

## Paging behavior

- Cards per page matches the current grid breakpoints exactly: 1 under 640px, 2 from 640–1023px, 3 at 1024px+.
- Right arrow scrolls exactly one page-width right; left arrow scrolls one page-width left (`scrollBy({left: ±viewport.clientWidth, behavior:'smooth'})`).
- At the first page, the left arrow is `disabled`. At the last page, the right arrow is `disabled`. No wraparound.
- Arrow disabled state is recomputed on scroll (debounced) and on resize.

## Dots

- Dots represent **pages**, not individual cards, so the dot count changes with breakpoint: 6 dots on mobile (6 cards / 1 per page), 3 on tablet (6/2), 2 on desktop (6/3).
- Current breakpoint is detected via `matchMedia` (`(min-width:640px)`, `(min-width:1024px)`), matching the CSS breakpoints above. Dots are rebuilt when the breakpoint changes (e.g. device rotation, window resize across a breakpoint), not on every resize pixel.
- The active dot is derived from scroll position: `Math.round(scrollLeft / clientWidth)`.
- Dots are real `<button>` elements; clicking one scrolls directly to that page (`scrollTo({left: index * clientWidth, behavior:'smooth'})`).

## Swipe / touch

No custom gesture code — native browser touch/trackpad scrolling on the strip provides swipe, with `scroll-snap-align` on each card ensuring it settles cleanly. Arrow-button clicks always land on a page boundary since a page width is an exact multiple of the scroll container's `clientWidth`.

## Removed behavior

The existing click-to-select interaction is removed entirely:
- `.card.active` state, the checkmark badge (`.card-check`), and `selectService()` (which scrolled to and pulsed the ZIP input) are deleted.
- `role="button"`, `tabindex="0"`, and the click/keydown handlers on each card are removed — cards are now purely informational (image, name, description).
- `cursor:pointer` and the hover-lift (`transform:translateY(-2px)` on hover) are removed from `.card`, since the card no longer responds to interaction.

## Accessibility

- Arrow buttons: `aria-label="Previous services"` / `aria-label="Next services"`, native `disabled` attribute at edges (so they're skipped by keyboard/AT navigation and visually greyed out via `:disabled` styling).
- Dots: native `<button>` with `aria-label="Go to page N"`; the active dot gets `aria-current="true"`.
- The scroll strip itself remains natively keyboard-scrollable (arrow keys / tab-then-scroll) since it's a regular scrollable container, not a custom widget.

## Out of scope

- No changes to card content, images, or the 6 services listed.
- No changes to any other page (`index.html`, `index2.html`) — this is scoped to `frontend/bath/a/index.html` only.
- No autoplay/auto-advance.
