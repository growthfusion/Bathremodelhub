'use strict';
const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');

const dir = path.join(__dirname, '../frontend/bath/images');
const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg)$/i.test(f));

(async () => {
    for (const file of files) {
        const input  = path.join(dir, file);
        const output = path.join(dir, file.replace(/\.(png|jpg|jpeg)$/i, '.webp'));
        if (fs.existsSync(output)) { console.log('skip (exists):', file); continue; }
        try {
            await sharp(input).webp({ quality: 82 }).toFile(output);
            const kb  = s => (fs.statSync(s).size / 1024).toFixed(0) + 'KB';
            const pct = Math.round((1 - fs.statSync(output).size / fs.statSync(input).size) * 100);
            console.log(`✓ ${file} → ${kb(input)} → ${kb(output)} (${pct}% smaller)`);
        } catch (e) {
            console.error('✗', file, e.message);
        }
    }
    console.log('\nDone.');
})();
