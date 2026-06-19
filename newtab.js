// newtab.js
// Handles loading bookmarks, rendering grid, user settings, and custom CSS

const bookmarksGrid = document.getElementById('bookmarks-grid');
const backgroundDiv = document.getElementById('background');

// Default settings
let settings = {
    iconsPerRow: 6,
    // bgUrl: '',
    folderId: '1', // '1' is usually the bookmarks bar in Chrome
    customCss: '',
    maxEntries: 100
};

// Load settings from storage
function loadSettings() {
    chrome.storage.local.get(null, (data) => {
        settings = { ...settings, ...data };
        // if (settings.bgUrl) backgroundDiv.style.backgroundImage = `url('${settings.bgUrl}')`;
        // else backgroundDiv.style.backgroundImage = '';
        loadAndRenderBookmarks();
        loadCustomCss();
    });
}

function loadCustomCss() {
    chrome.storage.local.get(null, (data) => {
        if (data.customCss) {
            let style = document.getElementById('user-css');
            if (!style) {
                style = document.createElement('style');
                style.id = 'user-css';
                document.head.appendChild(style);
            }
            style.textContent = data.customCss;
        }
    });
}

// Load bookmarks from the chosen folder and render
function loadAndRenderBookmarks() {
    chrome.bookmarks.getChildren(settings.folderId, (nodes) => {
        // Sort by index (same as bookmark manager)
        nodes.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        renderBookmarks(nodes);
    });
}


function renderBookmarks(bookmarks) {
    const container = document.getElementById('bookmarks-grid');
    container.innerHTML = '';
    const maxEntries = settings.maxEntries || 100;
    const limited = bookmarks.slice(0, maxEntries);
    limited.forEach(bm => {
        const icon = document.createElement('a');
        icon.className = 'bookmark-icon';
        // Always set the title to the bookmark/folder text (not URL)
        icon.title = bm.title || (bm.url ? '' : 'Folder');
        // Bookmark folder
        const insideIcon = document.createElement('div');
        insideIcon.className = 'bookmark-icon-inner';
        if (!bm.url || bm.url.startsWith('chrome://bookmarks')) {
            icon.href = '#';
            icon.title = bm.title || 'Open in Bookmark Manager';
            const img = document.createElement('img');
            img.src = 'bookmark_folder.svg';
            img.alt = '';
            // Open bookmark folder in a new tab
            icon.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.tabs.create({ url: bm.url }, () => {
                    window.close();
                });
            });
            insideIcon.appendChild(img);
        }
        // chrome internals
        else if (bm.url.startsWith('chrome://')) {
            icon.href = '#';
            icon.title = bm.title || 'Chrome internal page';
            const img = document.createElement('img');
            img.src = 'internals.svg';
            img.alt = '';
            // Open chrome:// url in a new tab
            icon.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.tabs.create({ url: bm.url }, () => {
                    window.close();
                });
            });
            insideIcon.appendChild(img);
        }
        // file access
        else if (bm.url.startsWith('file:///')) {
            icon.href = bm.url;
            icon.target = '_self';
            const img = document.createElement('img');
            img.src = 'file.svg';
            img.alt = '';
            // Optionally open in new tab (remove if not wanted)
            icon.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.tabs.create({ url: bm.url }, () => {
                    window.close();
                });
            });
            insideIcon.appendChild(img);
        }
        // normal bookmarks/urls
        else {
            icon.href = bm.url;
            icon.target = '_self';
            const img = document.createElement('img');
            img.alt = '';
            loadFaviconWithFallbacks(img, bm.url);
            insideIcon.appendChild(img);
        }
        icon.appendChild(insideIcon);
        container.appendChild(icon);
    });
}

function loadFaviconWithFallbacks(img, url, cacheBuster = false) {
    const cb = cacheBuster ? `?cb=${Date.now()}` : '';
    let hostname = '';
    try {
        hostname = new URL(url).hostname;
    } catch (e) {}

    // Fallback list:
    // 1. Chrome's native local favicon cache (32px / 64px)
    // 2. Classic Google s2 service (32px)
    // 3. DuckDuckGo favicon service
    const fallbacks = [
        `chrome://favicon/size/64/${url}`,
        `chrome://favicon/${url}`,
        `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(url)}`,
        hostname ? `https://icons.duckduckgo.com/ip3/${hostname}.ico` : null
    ].filter(Boolean);

    let index = 0;

    function tryNext() {
        if (index < fallbacks.length) {
            const nextSrc = fallbacks[index++];
            img.src = nextSrc;
        } else {
            img.onerror = null;
            img.src = 'default_url.svg';
        }
    }

    img.onerror = tryNext;
    tryNext();
}

// Initial load
loadSettings();

// Keyboard shortcut Ctrl+Shift+R (or Cmd+Shift+R) to refetch missing favicons
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        refetchFavicons();
    }
});

function refetchFavicons() {
    const images = document.querySelectorAll('.bookmark-icon img');
    images.forEach(img => {
        if (img.src.includes('default_url.svg')) {
            const anchor = img.closest('.bookmark-icon');
            if (anchor && anchor.href && !anchor.href.startsWith('#') && !anchor.href.startsWith('chrome://') && !anchor.href.startsWith('file:///')) {
                loadFaviconWithFallbacks(img, anchor.href, true);
            }
        }
    });
}
