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

            // Use Google's favicon service
            img.src = `https://t3.gstatic.com/faviconV2?client=chrome&size=32&url=${encodeURIComponent(bm.url)}`;
            img.alt = '';
            // If favicon fails, use default_url.svg
            img.onerror = function () {
                img.onerror = null;
                img.src = 'default_url.svg';
            };
            insideIcon.appendChild(img);
        }
        icon.appendChild(insideIcon);
        container.appendChild(icon);
    });
}

// Initial load
loadSettings();
