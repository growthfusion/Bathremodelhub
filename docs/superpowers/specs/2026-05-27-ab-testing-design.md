# A/B Testing Design Specification
**Date:** 2026-05-27  
**Project:** BathRemodelHub Results Page  
**Objective:** Implement A/B testing with two distinct design variants to measure conversion improvements

---

## 1. Overview

Implement A/B testing on `results.html` with:
- **Design A (Current):** Existing stacked-layout business cards with rectangular hero banner
- **Design B (New):** QuickHomefix-inspired design with circular avatars, visible testimonials, and modern aesthetic

Switching controlled via URL parameter: `?design=B`

---

## 2. Technical Architecture

### 2.1 URL Parameter Detection
```
?design=A  → Load Design A (default)
?design=B  → Load Design B
No param   → Default to Design A
```

### 2.2 Implementation Approach: Conditional Rendering
- Single HTML file with two complete template sets
- JavaScript detects URL parameter on page load
- Dynamically injects correct template into DOM
- No layout/CSS conflicts between designs

### 2.3 Data Flow
```
Page Load
  ↓
Detect ?design parameter
  ↓
Fetch /api/businesses (same API, same data)
  ↓
Parse business data
  ↓
Render Design A or Design B card template
  ↓
Display results grid
```

---

## 3. Design A (Current) — Reference

**Header:**
- Blue gradient progress bar (top)
- Heading: "Local Bathroom Pros Near You"
- Subheading: "Showing results near [ZIP]"
- Location badge (right side)

**Business Card:**
- Rectangular image (400×182px) with optional overlay badge
- Stacked layout (image on top, info below)
- Business name, star rating, badges
- Address, years, hires meta
- Brief intro text (truncated to 140 chars)
- Purple gradient CTA button: "Compare Free Quote"

**Grid:** 3 columns on desktop, 2 on tablet, 1 on mobile

---

## 4. Design B (New) — QuickHomefix-Inspired

### 4.1 Header Section
```
✓ Congratulations!

We Found Trusted [Service] Pros Near You

Compare local pros and get your best quote in minutes.

[Location Badge]
```

**Visual Elements:**
- Green checkmark icon (instead of search icon)
- Larger, bolder heading
- Light blue background gradient (similar to QuickHomefix)
- Illustration/hero image on right (optional for now, can be background)

### 4.2 Business Card Layout

**Image:**
- Circular avatar (120-140px diameter, centered at top of card)
- Fallback: circular gradient background with icon

**Card Structure:**
```
┌─────────────────┐
│   [Avatar]      │  ← Circular image
├─────────────────┤
│ Business Name   │  ← Bold headline
│ ★ Top Pro       │  ← Badge
├─────────────────┤
│ ★★★★★ 4.69     │  ← Rating + count
│ Brooklyn, NY    │  ← Location
│ 5 years in biz  │  ← Meta
│ Hired 119 times │
├─────────────────┤
│ "Keon advised   │  ← Customer testimonial
│ us on several   │     (new in Design B)
│ options..."     │
├─────────────────┤
│ [CTA Button]    │
└─────────────────┘
```

**Visual Styling:**
- White card with subtle shadow
- Rounded corners (16-18px)
- Circular avatar with border
- Customer testimonial in italics, gray text
- Button: Purple gradient (same as Design A)

### 4.3 Grid Layout
- Same responsive behavior as Design A (3→2→1 columns)
- Slightly wider cards for circular avatar emphasis
- Gap between cards: 24px

---

## 5. Data Requirements

### Business Data (from API)
Currently available:
- `businessName`
- `businessImageURL`
- `rating`, `numberOfReviews`
- `businessLocation`
- `yearsInBusiness`, `numberOfHires`
- `businessIntroduction`
- `isTopPro`
- `opinionatedSignal`

### New Data Needed for Design B
- **Customer testimonial/review quote** → `customerTestimonial` field
  - If not provided by API, use `businessIntroduction` as fallback
  - If `businessIntroduction` is long, truncate first 120 chars for testimonial display

---

## 6. Implementation Details

### 6.1 HTML Structure
Two separate template functions:
- `bizCardDesignA(biz, cardIndex)` → existing card HTML
- `bizCardDesignB(biz, cardIndex)` → new QuickHomefix-style card HTML

Header sections:
- `headerDesignA()` → existing banner
- `headerDesignB()` → congratulations header with checkmark

### 6.2 CSS Changes
- Add `.design-b` class to body or container for scoping
- New styles for:
  - Circular avatar images (border-radius, sizing)
  - Centered layout within cards
  - Testimonial styling (italic, smaller font)
  - Updated card spacing

### 6.3 JavaScript Logic
```javascript
const params = new URLSearchParams(window.location.search);
const designVariant = params.get('design') || 'A';
const useDesignB = designVariant.toUpperCase() === 'B';

// Switch rendering functions based on variant
const renderHeader = useDesignB ? headerDesignB : headerDesignA;
const renderCard = useDesignB ? bizCardDesignB : bizCardDesignA;
```

---

## 7. Tracking & Analytics

Both designs track the same events:
- Page view (includes ?design parameter in URL)
- Card clicks
- Quote submission
- All existing GTM tags fire regardless of design

**Analytics Insights:**
- Compare CTR, quote submissions, and conversion rates between designs
- URL parameter preserved in UTM data for attribution

---

## 8. Testing Checklist

**Design A:**
- ✓ Existing functionality unchanged
- ✓ Cards render correctly
- ✓ Popups work
- ✓ Mobile responsive

**Design B:**
- ✓ Circular avatars display correctly
- ✓ Testimonials visible and styled
- ✓ Cards responsive (mobile: single column)
- ✓ Popups work from Design B cards
- ✓ Missing testimonial data handled gracefully

**A/B Testing:**
- ✓ URL parameter detection works
- ✓ Switching between ?design=A and ?design=B
- ✓ Default to Design A (no param)
- ✓ Both track analytics correctly

---

## 9. Rollout Strategy

1. **Local Testing:** Test both designs locally with sample data
2. **Stage Deployment:** Deploy to staging, test with real API
3. **Production Gradual Rollout:**
   - Start with ?design=B shared with select users
   - Monitor conversion metrics
   - Gradually increase traffic to Design B
   - Keep Design A as control group

---

## 10. Fallback Handling

**If `businessImageURL` is missing:**
- Design A: Purple gradient background with bathtub icon
- Design B: Circular gradient background with bathtub icon (centered)

**If `customerTestimonial` is missing:**
- Use first 120 characters of `businessIntroduction`
- If that's missing too, omit testimonial section

---

## 11. Success Criteria

- Both designs fully functional and accessible
- URL parameter switching works reliably
- Analytics correctly attributed to each design variant
- No performance regression
- Mobile experience optimized for both designs
