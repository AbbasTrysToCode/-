document.addEventListener('DOMContentLoaded', () => {
    // State
    const state = {
        novel: null,
        chaptersList: [], // flattened list of chapters for prev/next
        currentChapterIndex: -1,
        theme: localStorage.getItem('theme') || 'dark'
    };

    // DOM Elements
    const elements = {
        themeToggle: document.getElementById('theme-toggle'),
        themeIcon: document.querySelector('#theme-toggle i'),
        body: document.body,
        tocContainer: document.getElementById('toc-container'),
        chapterTitle: document.getElementById('chapter-title'),
        chapterContent: document.getElementById('chapter-content'),
        breadcrumbs: document.getElementById('breadcrumbs'),
        prevBtn: document.getElementById('prev-btn'),
        nextBtn: document.getElementById('next-btn'),
        sidebar: document.getElementById('sidebar'),
        openSidebarBtn: document.getElementById('open-sidebar'),
        closeSidebarBtn: document.getElementById('close-sidebar'),
        downloadBtn: document.getElementById('download-btn')
    };

    // Initialize Theme
    function initTheme() {
        if (state.theme === 'light') {
            elements.body.classList.replace('theme-dark', 'theme-light');
            elements.themeIcon.classList.replace('fa-sun', 'fa-moon');
        }
    }
    initTheme();

    // Toggle Theme
    elements.themeToggle.addEventListener('click', () => {
        if (elements.body.classList.contains('theme-dark')) {
            elements.body.classList.replace('theme-dark', 'theme-light');
            elements.themeIcon.classList.replace('fa-sun', 'fa-moon');
            state.theme = 'light';
        } else {
            elements.body.classList.replace('theme-light', 'theme-dark');
            elements.themeIcon.classList.replace('fa-moon', 'fa-sun');
            state.theme = 'dark';
        }
        localStorage.setItem('theme', state.theme);
    });

    // Mobile Sidebar
    elements.openSidebarBtn.addEventListener('click', () => {
        elements.sidebar.classList.add('open');
    });

    elements.closeSidebarBtn.addEventListener('click', () => {
        elements.sidebar.classList.remove('open');
    });

    // Simple Markdown Parser (supports Bold, Italic, Underline)
    function parseMarkdown(text) {
        // Escape HTML to prevent XSS
        let html = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        
        // Restore <u> and </u> tags safely
        html = html
            .replace(/&lt;u&gt;/gi, "<u>")
            .replace(/&lt;\/u&gt;/gi, "</u>");

        // Bold: **text**
        html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

        // Bold alternative: __text__
        html = html.replace(/__(.*?)__/g, "<strong>$1</strong>");

        // Italic: *text*
        html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

        // Italic alternative: _text_
        html = html.replace(/_(.*?)_/g, "<em>$1</em>");

        // Underline custom: ++text++
        html = html.replace(/\+\+(.*?)\+\+/g, "<u>$1</u>");

        return html;
    }

    // Try to scan local directory for instant live updates (runs on local servers)
    async function tryLocalDirectoryListing() {
        try {
            // Fetch the /content/ folder URL (many dev servers return HTML index)
            const response = await fetch('content/?t=' + Date.now());
            if (!response.ok) return null;
            
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('text/html')) return null;
            
            const htmlText = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');
            const links = Array.from(doc.querySelectorAll('a'))
                .map(a => decodeURIComponent(a.getAttribute('href')))
                .filter(href => href && (href.endsWith('.md') || href.endsWith('.txt')))
                .map(href => {
                    const parts = href.split('/');
                    return parts[parts.length - 1];
                });
            
            const uniqueFiles = Array.from(new Set(links));
            return uniqueFiles.length > 0 ? uniqueFiles : null;
        } catch (e) {
            console.log('Dynamic directory listing not available (falling back to manifest.json):', e);
            return null;
        }
    }

    // Compile chapters directly from the list of scanned local files
    async function loadNovelFromLocalFiles(filenames) {
        const rawChapters = [];
        
        for (const filename of filenames) {
            try {
                const fileResponse = await fetch(`content/${filename}?t=${Date.now()}`);
                if (!fileResponse.ok) continue;
                const content = await fileResponse.text();
                
                const match = filename.match(/^([\d.]+)\s*-\s*(.+)$/);
                if (!match) continue;

                const numStr = match[1];
                const id = match[2].replace(/\.(md|txt)$/, '');
                const sortKey = numStr.split('.').map(n => parseInt(n, 10));
                
                const n = sortKey[0];
                const m = sortKey[1] !== undefined ? sortKey[1] : 0;

                const lines = content.split('\n');
                let arcTitle = null;
                let partTitle = null;
                let textContent = '';

                if (n > 0 && m === 0) {
                    let line1 = lines[0] ? lines[0].trim() : '';
                    if (line1.startsWith('#')) {
                        arcTitle = line1.replace(/^#+\s*/, '');
                    } else {
                        arcTitle = line1;
                    }

                    let line2 = lines[1] ? lines[1].trim() : '';
                    if (line2.startsWith('#')) {
                        partTitle = line2.replace(/^#+\s*/, '');
                    } else {
                        partTitle = line2;
                    }

                    textContent = lines.slice(2).join('\n').trim();
                } else {
                    let line1 = lines[0] ? lines[0].trim() : '';
                    if (line1.startsWith('#')) {
                        partTitle = line1.replace(/^#+\s*/, '');
                    } else {
                        partTitle = line1;
                    }

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
            } catch (err) {
                console.error(`Error loading local file ${filename}:`, err);
            }
        }
        
        // Sort chapters numerically (version-style)
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

        // Build hierarchical tree
        const structuredToc = [];
        const arcsMap = {};

        rawChapters.forEach(ch => {
            if (ch.n === 0) {
                structuredToc.push({
                    type: 'chapter',
                    id: ch.id,
                    title: ch.title,
                    path: ch.path,
                    content: ch.content
                });
            } else {
                if (ch.m === 0) {
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

        return {
            title: "غوامر",
            author: "المؤلف",
            description: "قصة ملحمية في عالم غامض...",
            toc: structuredToc
        };
    }

    // Fetch and Parse JSON Manifest (with local dynamic scanning fallback)
    async function loadNovelData() {
        try {
            // 1. Try to scan local content folder first for fluid, zero-build live updates
            const localFiles = await tryLocalDirectoryListing();
            let data = null;

            if (localFiles) {
                console.log("Loading live updates directly from local files...");
                data = await loadNovelFromLocalFiles(localFiles);
            } else {
                // 2. Fall back to manifest.json (bypassing browser cache with timestamp query)
                console.log("Loading from manifest.json...");
                const response = await fetch('manifest.json?t=' + Date.now());
                if (!response.ok) throw new Error('فشل في تحميل فهرس الرواية');
                data = await response.json();
            }
            
            parseNovel(data);
            renderTOC();
            
            // Check hash for chapter, else load first chapter
            const hash = window.location.hash.substring(1);
            let targetIndex = 0;
            if (hash) {
                const foundIndex = state.chaptersList.findIndex(ch => ch.id === hash);
                if (foundIndex !== -1) targetIndex = foundIndex;
            }
            
            if (state.chaptersList.length > 0) {
                loadChapter(targetIndex);
            } else {
                elements.chapterTitle.textContent = "لا توجد فصول";
                elements.chapterContent.innerHTML = "";
            }
            
        } catch (error) {
            console.error('Error loading novel:', error);
            elements.chapterTitle.textContent = "حدث خطأ";
            elements.chapterContent.innerHTML = `<p>${error.message}</p>`;
            elements.tocContainer.innerHTML = '<p style="padding:1rem;color:red;">تعذر تحميل الفهرس</p>';
        }
    }

    function parseNovel(data) {
        state.novel = {
            metadata: {
                title: data.title || 'غوامر',
                author: data.author || 'المؤلف',
                description: data.description || ''
            },
            toc: data.toc || []
        };

        // Update Document Title
        document.title = `${state.novel.metadata.title} - رواية ويب`;

        // Flatten chapters for navigation
        state.chaptersList = [];
        
        function flatten(items, parentArc = null) {
            for (const item of items) {
                if (item.type === 'chapter') {
                    const chapterObj = { 
                        id: item.id, 
                        title: item.title, 
                        content: item.content, 
                        path: item.path,
                        parentArc 
                    };
                    state.chaptersList.push(chapterObj);
                } else if (item.type === 'arc') {
                    flatten(item.children || [], item);
                }
            }
        }
        
        flatten(state.novel.toc);
    }

    function renderTOC() {
        let html = '<ul>';
        
        for (const item of state.novel.toc) {
            if (item.type === 'arc') {
                html += `<li><div class="toc-arc">${item.title}</div><ul>`;
                for (const child of item.children) {
                    html += `<li><a href="#${child.id}" class="toc-item" data-id="${child.id}">${child.title}</a></li>`;
                }
                html += `</ul></li>`;
            } else {
                html += `<li><a href="#${item.id}" class="toc-item" data-id="${item.id}">${item.title}</a></li>`;
            }
        }
        
        html += '</ul>';
        elements.tocContainer.innerHTML = html;

        // Add click listeners
        const links = elements.tocContainer.querySelectorAll('.toc-item');
        links.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const id = link.getAttribute('data-id');
                const index = state.chaptersList.findIndex(ch => ch.id === id);
                if (index !== -1) {
                    loadChapter(index);
                    // Close sidebar on mobile after clicking
                    if (window.innerWidth <= 900) {
                        elements.sidebar.classList.remove('open');
                    }
                }
            });
        });
    }

    function loadChapter(index) {
        if (index < 0 || index >= state.chaptersList.length) return;
        
        state.currentChapterIndex = index;
        const chapter = state.chaptersList[index];
        
        // Update URL hash without jumping
        history.pushState(null, null, `#${chapter.id}`);
        
        // Update Content
        elements.chapterTitle.textContent = chapter.title;
        
        // Format content paragraphs and parse markdown inside each
        const paragraphs = chapter.content.split(/\n\s*\n/).map(p => p.trim()).filter(p => p);
        elements.chapterContent.innerHTML = paragraphs.map(p => `<p>${parseMarkdown(p)}</p>`).join('');
        
        // Update Breadcrumbs
        if (chapter.parentArc) {
            elements.breadcrumbs.innerHTML = `<span>${chapter.parentArc.title}</span> / ${chapter.title}`;
        } else {
            elements.breadcrumbs.innerHTML = `${chapter.title}`;
        }
        
        // Update Nav Buttons
        elements.prevBtn.disabled = index === 0;
        elements.nextBtn.disabled = index === state.chaptersList.length - 1;

        // Update Active state in TOC
        document.querySelectorAll('.toc-item').forEach(el => el.classList.remove('active'));
        const activeLink = document.querySelector(`.toc-item[data-id="${chapter.id}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
            activeLink.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        
        // Scroll top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Navigation Listeners
    elements.prevBtn.addEventListener('click', () => {
        loadChapter(state.currentChapterIndex - 1);
    });

    elements.nextBtn.addEventListener('click', () => {
        loadChapter(state.currentChapterIndex + 1);
    });

    // EPUB Generation using JSZip and Native HTML5 Downloads
    elements.downloadBtn.addEventListener('click', async () => {
        if (!state.novel || state.chaptersList.length === 0) {
            alert('الرواية غير جاهزة للتحميل بعد.');
            return;
        }

        const originalBtnText = elements.downloadBtn.innerHTML;
        elements.downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التجهيز...';
        elements.downloadBtn.disabled = true;

        try {
            const zip = new JSZip();
            
            // 1. mimetype file
            zip.file('mimetype', 'application/epub+zip');
            
            // 2. META-INF/container.xml
            const metaInf = zip.folder("META-INF");
            metaInf.file("container.xml", `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
   <rootfiles>
      <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
   </rootfiles>
</container>`);

            // 3. OEBPS folder
            const oebps = zip.folder("OEBPS");
            
            // Style
            oebps.file("style.css", `
body { font-family: sans-serif; direction: rtl; text-align: right; }
h1, h2 { text-align: center; color: #b71c1c; }
p { line-height: 1.6; margin-bottom: 1em; }
strong { font-weight: bold; color: #b71c1c; }
em { font-style: italic; }
u { text-decoration: underline; }
            `);

            // Generate Chapters HTML
            let manifestItems = '';
            let spineItems = '';
            let navMapItems = '';
            let playOrder = 1;

            state.chaptersList.forEach((chapter, index) => {
                const chapterId = `chapter_${index}`;
                const filename = `${chapterId}.html`;
                
                // HTML Content (with markdown formatting preserved)
                const paragraphs = chapter.content.split(/\n\s*\n/).map(p => p.trim()).filter(p => p);
                const htmlContent = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ar" dir="rtl">
<head>
    <title>${chapter.title}</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
    <h1>${chapter.title}</h1>
    ${paragraphs.map(p => `<p>${parseMarkdown(p)}</p>`).join('\n')}
</body>
</html>`;
                oebps.file(filename, htmlContent);

                // Add to manifest, spine, navMap
                manifestItems += `<item id="${chapterId}" href="${filename}" media-type="application/xhtml+xml"/>\n`;
                spineItems += `<itemref idref="${chapterId}"/>\n`;
                
                navMapItems += `
    <navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
        <navLabel><text>${chapter.title}</text></navLabel>
        <content src="${filename}"/>
    </navPoint>`;
                playOrder++;
            });

            // content.opf
            const opfContent = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
        <dc:title>${state.novel.metadata.title}</dc:title>
        <dc:language>ar</dc:language>
        <dc:identifier id="BookId">urn:uuid:12345678-1234-1234-1234-123456789012</dc:identifier>
        <dc:creator opf:role="aut">${state.novel.metadata.author}</dc:creator>
    </metadata>
    <manifest>
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
        <item id="style" href="style.css" media-type="text/css"/>
        ${manifestItems}
    </manifest>
    <spine toc="ncx">
        ${spineItems}
    </spine>
</package>`;
            oebps.file("content.opf", opfContent);

            // toc.ncx
            const ncxContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
    <head>
        <meta name="dtb:uid" content="urn:uuid:12345678-1234-1234-1234-123456789012"/>
        <meta name="dtb:depth" content="1"/>
        <meta name="dtb:totalPageCount" content="0"/>
        <meta name="dtb:maxPageNumber" content="0"/>
    </head>
    <docTitle><text>${state.novel.metadata.title}</text></docTitle>
    <navMap>
        ${navMapItems}
    </navMap>
</ncx>`;
            oebps.file("toc.ncx", ncxContent);

            // Generate ZIP and download natively using browser API
            const blob = await zip.generateAsync({type:"blob", mimeType: "application/epub+zip"});
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `${state.novel.metadata.title || 'novel'}.epub`;
            document.body.appendChild(a);
            a.click();
            
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error("Error generating EPUB:", error);
            alert('حدث خطأ أثناء محاولة إنشاء الملف.');
        } finally {
            elements.downloadBtn.innerHTML = '<i class="fas fa-download"></i> <span class="hide-mobile">تحميل الرواية</span>';
            elements.downloadBtn.disabled = false;
        }
    });

    // Start App
    loadNovelData();
});
