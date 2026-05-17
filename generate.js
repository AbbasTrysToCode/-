const fs = require('fs');
const path = require('path');

const contentDir = path.join(__dirname, 'content');
const manifestPath = path.join(__dirname, 'manifest.json');

// Ensure content directory exists
if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir);
}

// Read markdown/text files in content folder
const files = fs.readdirSync(contentDir)
    .filter(file => file.endsWith('.md') || file.endsWith('.txt'));

const rawChapters = [];

files.forEach(filename => {
    // Parse numeric prefix (e.g. "1.0 - arc1p1.md" -> n = 1, m = 0)
    const match = filename.match(/^([\d.]+)\s*-\s*(.+)$/);
    if (!match) return; // skip files that don't match the pattern

    const numStr = match[1];
    const id = match[2].replace(/\.(md|txt)$/, '');
    const sortKey = numStr.split('.').map(n => parseInt(n, 10));
    
    // n is the integral part (e.g. 1 in 1.0)
    // m is the decimal part (e.g. 0 in 1.0)
    const n = sortKey[0];
    const m = sortKey[1] !== undefined ? sortKey[1] : 0;

    const filePath = path.join(contentDir, filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let arcTitle = null;
    let partTitle = null;
    let textContent = '';

    if (n > 0 && m === 0) {
        // Start of Arc n
        // Line 1 is the Arc Title (e.g., "# الآرك الأول: صحوة الظلال")
        let line1 = lines[0] ? lines[0].trim() : '';
        if (line1.startsWith('#')) {
            arcTitle = line1.replace(/^#+\s*/, '');
        } else {
            arcTitle = line1;
        }

        // Line 2 is the Part Title (e.g., "## الجزء الأول: بداية النهاية")
        let line2 = lines[1] ? lines[1].trim() : '';
        if (line2.startsWith('#')) {
            partTitle = line2.replace(/^#+\s*/, '');
        } else {
            partTitle = line2;
        }

        // Rest of the lines is the content
        textContent = lines.slice(2).join('\n').trim();
    } else {
        // Normal chapter or a standalone chapter (n === 0)
        // Line 1 is the Part/Chapter Title
        let line1 = lines[0] ? lines[0].trim() : '';
        if (line1.startsWith('#')) {
            partTitle = line1.replace(/^#+\s*/, '');
        } else {
            partTitle = line1;
        }

        // Rest of the lines is the content
        textContent = lines.slice(1).join('\n').trim();
    }

    rawChapters.push({
        filename,
        id,
        n,
        m,
        sortKey,
        arcTitle,
        title: partTitle || 'بدون عنوان',
        content: textContent,
        path: `content/${filename}`
    });
});

// Sort chapters numerically (supporting semantic order like 1.2 and 1.10)
rawChapters.sort((a, b) => {
    const len = Math.max(a.sortKey.length, b.sortKey.length);
    for (let i = 0; i < len; i++) {
        const valA = a.sortKey[i] !== undefined ? a.sortKey[i] : 0;
        const valB = b.sortKey[i] !== undefined ? b.sortKey[i] : 0;
        if (valA !== valB) {
            return valA - valB;
        }
    }
    return 0;
});

// Build the hierarchical TOC tree
const structuredToc = [];
const arcsMap = {}; // keep track of created arcs by their 'n'

rawChapters.forEach(ch => {
    if (ch.n === 0) {
        // Standalone chapters (Prologue, Dedication, etc.)
        structuredToc.push({
            type: 'chapter',
            id: ch.id,
            title: ch.title,
            path: ch.path,
            content: ch.content
        });
    } else {
        // Chapters belonging to Arc 'n'
        if (ch.m === 0) {
            // Start of a new Arc
            const arcItem = {
                type: 'arc',
                id: `arc_${ch.n}`,
                title: ch.arcTitle || `الآرك ${ch.n}`,
                children: [
                    {
                        type: 'chapter',
                        id: ch.id,
                        title: ch.title,
                        path: ch.path,
                        content: ch.content
                    }
                ]
            };
            structuredToc.push(arcItem);
            arcsMap[ch.n] = arcItem;
        } else {
            // Subsequent chapters under Arc 'n'
            const chapterItem = {
                type: 'chapter',
                id: ch.id,
                title: ch.title,
                path: ch.path,
                content: ch.content
            };
            
            if (arcsMap[ch.n]) {
                arcsMap[ch.n].children.push(chapterItem);
            } else {
                // If m > 0 appeared before m === 0 (safety fallback)
                const virtualArc = {
                    type: 'arc',
                    id: `arc_${ch.n}`,
                    title: `الآرك ${ch.n}`,
                    children: [chapterItem]
                };
                structuredToc.push(virtualArc);
                arcsMap[ch.n] = virtualArc;
            }
        }
    }
});

const manifest = {
    title: "غوامر",
    author: "المؤلف",
    description: "قصة ملحمية في عالم غامض...",
    toc: structuredToc
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
console.log(`Successfully generated manifest.json with ${rawChapters.length} files parsed.`);
