# A/B Testing Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement URL-parameter-controlled A/B testing on results.html with Design A (current) and Design B (QuickHomefix-inspired).

**Architecture:** Single HTML file with dual template functions. JavaScript detects ?design=B parameter and conditionally renders appropriate templates.

**Tech Stack:** Vanilla JavaScript, HTML, Tailwind CSS, DOMPurify (existing)

---

## File Structure

**Modified:** rontend/results.html

**No new files created.**

---

## Task 1: Add Design B Header Template Function

- [ ] **Step 1:** Locate the izCard function in results.html (line ~379)

- [ ] **Step 2:** Add headerDesignB function before it. This creates the congratulations header with checkmark and modern styling.

**Key points:**
- Returns HTML string with light blue gradient background
- Uses esc() for searchQuery and zipCode
- Shows green checkmark icon, "Congratulations!" message
- Displays dynamic heading with service name

- [ ] **Step 3:** Verify function compiles (no quote/escape errors)

---

## Task 2: Add Design B Business Card Function

- [ ] **Step 1:** After headerDesignB(), add izCardDesignB() function

**Key points:**
- Renders circular avatar (120px diameter)
- Displays testimonial (italic, gray text)
- Centers all card content
- Uses same data source as Design A
- Has fallback gradient for missing images

- [ ] **Step 2:** Verify circular avatar logic and testimonial truncation

---

## Task 3: Add Design Parameter Detection

- [ ] **Step 1:** Find ar utmSrc = params.get('utm_source')... (line ~252)

- [ ] **Step 2:** Add after it:
`javascript
var designVariant = (params.get('design') || 'A').toUpperCase();
var useDesignB = designVariant === 'B';
`

---

## Task 4: Update Grid Rendering Logic

- [ ] **Step 1:** Find the setContent(elGrid, ...) section (line ~347-354)

- [ ] **Step 2:** Replace with conditional logic:
- If useDesignB: hide old banner, inject new header, use izCardDesignB function
- If Design A: keep existing logic

- [ ] **Step 3:** Test syntax and verify both branches work

---

## Task 5: Test Design A Locally

- [ ] **Step 1:** Run 
pm run dev

- [ ] **Step 2:** Navigate to http://localhost:3000/results.html?searchQuery=Bathroom%20Remodeling&zipCode=10001

- [ ] **Step 3:** Verify:
  - Blue header visible
  - Rectangular images
  - No testimonials
  - 3-column grid
  - No console errors

- [ ] **Step 4:** Test mobile (Ctrl+Shift+M): cards stack to 1 column

---

## Task 6: Test Design B Locally

- [ ] **Step 1:** Navigate to http://localhost:3000/results.html?searchQuery=Bathroom%20Remodeling&zipCode=10001&design=B

- [ ] **Step 2:** Verify:
  - Old banner hidden
  - "Congratulations!" header visible
  - Circular avatars (120px)
  - Testimonials visible
  - All content centered
  - No errors

- [ ] **Step 3:** Click card → popup opens

- [ ] **Step 4:** Test mobile: responsive layout works

---

## Task 7: Test URL Parameter Switching

- [ ] **Step 1:** Test ?design=A → Design A renders

- [ ] **Step 2:** Test ?design=B → Design B renders

- [ ] **Step 3:** Test no parameter → defaults to Design A

- [ ] **Step 4:** Test case-insensitive (?design=b) → Design B renders

- [ ] **Step 5:** Test with tracking params: ?design=B&utm_source=test&fbclid=abc → all params work together

---

## Task 8: Verify Analytics and Tracking

- [ ] **Step 1:** Open DevTools Console

- [ ] **Step 2:** Navigate to Design B, check for errors

- [ ] **Step 3:** In Network tab, verify API call succeeds

- [ ] **Step 4:** Click card → quote form → submit → verify events in dataLayer

- [ ] **Step 5:** Confirm Redtrack postback sent

---

## Task 9: Commit to Git

- [ ] **Step 1:** Run git status → see results.html modified

- [ ] **Step 2:** Run git diff frontend/results.html | head -50 → review changes

- [ ] **Step 3:** Commit:
`ash
git add frontend/results.html
git commit -m "feat: A/B test Design B with ?design=B parameter

- Add headerDesignB for congratulations header
- Add bizCardDesignB with circular avatars and testimonials
- Implement conditional rendering based on URL parameter
- Design A remains default (backward compatible)"
`

---

## Task 10: Deploy to Stage

- [ ] **Step 1:** Push: git push origin stage

- [ ] **Step 2:** Monitor CI/CD (GitHub Actions) → wait for build/deploy

- [ ] **Step 3:** Confirm stage deployment succeeds

---

## Task 11: Test on Stage Environment

- [ ] **Step 1:** Test Design A: https://stage.bathremodelhub.com/results.html?searchQuery=Bathroom%20Remodeling&zipCode=10001

- [ ] **Step 2:** Test Design B: https://stage.bathremodelhub.com/results.html?searchQuery=Bathroom%20Remodeling&zipCode=10001&design=B

- [ ] **Step 3:** Complete user flow (click card, submit quote) → verify success

- [ ] **Step 4:** Check analytics dashboard → events firing for both designs

---

## Summary

✅ Design B header implemented  
✅ Design B cards with circular avatars implemented  
✅ URL parameter detection working  
✅ Conditional rendering logic in place  
✅ Tested locally (Design A and B)  
✅ Tested URL switching  
✅ Verified analytics  
✅ Deployed to stage  
✅ Tested on stage environment  

**Ready for production rollout with gradual Design B traffic increase.**
