// Static Tailwind build for frontend/bath/results.html (replaces the Tailwind CDN script).
// Rebuild after adding or changing Tailwind classes on that page:  see CLAUDE.md → "Rebuilding results-tw.css".
const path = require('path');

module.exports = {
    content: [path.join(__dirname, '..', '..', 'frontend', 'bath', 'results.html')],
    theme: {
        extend: {
            colors: {
                'brand-navy':   '#1a3a5c',
                'brand-violet': '#3b82f6',
                'brand-orange': '#ff6b35',
                'brand-light':  '#f0f7ff',
            },
            fontFamily: {
                headline: ['Inter', 'sans-serif'],
                body:     ['Inter', 'sans-serif'],
            },
        },
    },
};
