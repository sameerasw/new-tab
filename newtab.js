// newtab.js
// Handles loading bookmarks, rendering grid, user settings, and custom CSS

const bookmarksGrid = document.getElementById("bookmarks-grid");
const backgroundDiv = document.getElementById("background");

// Default settings
let settings = {
  iconsPerRow: 6,
  folderId: "1",
  customCss: "",
  maxEntries: 100,
  clockWeight: 300,
  clockWidth: 100,
  clockRound: 0,
  clockSize: 55
};

// Load settings from storage
function loadSettings() {
  chrome.storage.local.get(null, (data) => {
    settings = { ...settings, ...data };
    loadAndRenderBookmarks();
    loadCustomCss();
    applyClockSettings();
    initSettingsUI();
  });
}

function loadCustomCss() {
  chrome.storage.local.get(null, (data) => {
    if (data.customCss) {
      let style = document.getElementById("user-css");
      if (!style) {
        style = document.createElement("style");
        style.id = "user-css";
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
  const container = document.getElementById("bookmarks-grid");
  container.innerHTML = "";
  const maxEntries = settings.maxEntries || 100;
  const limited = bookmarks.slice(0, maxEntries);
  limited.forEach((bm) => {
    const icon = document.createElement("a");
    icon.className = "bookmark-icon";
    // Always set the title to the bookmark/folder text (not URL)
    icon.title = bm.title || (bm.url ? "" : "Folder");
    // Bookmark folder
    const insideIcon = document.createElement("div");
    insideIcon.className = "bookmark-icon-inner";
    if (!bm.url || bm.url.startsWith("chrome://bookmarks")) {
      icon.href = "#";
      icon.title = bm.title || "Open in Bookmark Manager";
      const img = document.createElement("img");
      img.src = "bookmark_folder.svg";
      img.alt = "";
      // Open bookmark folder in a new tab
      icon.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: bm.url }, () => {
          window.close();
        });
      });
      insideIcon.appendChild(img);
    }
    // chrome internals
    else if (bm.url.startsWith("chrome://")) {
      icon.href = "#";
      icon.title = bm.title || "Chrome internal page";
      const img = document.createElement("img");
      img.src = "internals.svg";
      img.alt = "";
      // Open chrome:// url in a new tab
      icon.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: bm.url }, () => {
          window.close();
        });
      });
      insideIcon.appendChild(img);
    }
    // file access
    else if (bm.url.startsWith("file:///")) {
      icon.href = bm.url;
      icon.target = "_self";
      const img = document.createElement("img");
      img.src = "file.svg";
      img.alt = "";
      // Optionally open in new tab (remove if not wanted)
      icon.addEventListener("click", (e) => {
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
      icon.target = "_self";
      const img = document.createElement("img");
      img.alt = "";
      loadFaviconWithFallbacks(img, bm.url);
      insideIcon.appendChild(img);
    }
    icon.appendChild(insideIcon);
    container.appendChild(icon);
  });
  applyStaggeredRowAnimations();
}

function applyStaggeredRowAnimations() {
  const icons = document.querySelectorAll(".bookmark-icon");
  const rows = new Map();

  // Group icons by their vertical position (offsetTop relative to parent grid)
  icons.forEach((icon) => {
    icon.style.animationDelay = ""; // Reset inline style
    const top = icon.offsetTop;
    if (!rows.has(top)) {
      rows.set(top, []);
    }
    rows.get(top).push(icon);
  });

  // Sort rows vertically and apply staggered animation delay per row
  const sortedTops = Array.from(rows.keys()).sort((a, b) => a - b);
  sortedTops.forEach((top, rowIndex) => {
    const rowIcons = rows.get(top);
    const delay = 350 + rowIndex * 120; // 350ms delay for first row, +120ms for subsequent rows
    rowIcons.forEach((icon) => {
      icon.style.animationDelay = `${delay}ms`;
    });
  });
}

window.addEventListener("resize", () => {
  applyStaggeredRowAnimations();
});

function loadFaviconWithFallbacks(img, url, cacheBuster = false) {
  const cb = cacheBuster ? `?cb=${Date.now()}` : "";
  let hostname = "";
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
    hostname ? `https://icons.duckduckgo.com/ip3/${hostname}.ico` : null,
  ].filter(Boolean);

  let index = 0;

  function tryNext() {
    if (index < fallbacks.length) {
      const nextSrc = fallbacks[index++];
      img.src = nextSrc;
    } else {
      img.onerror = null;
      img.src = "default_url.svg";
    }
  }

  img.onerror = tryNext;
  tryNext();
}

// Initial load
loadSettings();

// Keyboard shortcut Ctrl+Shift+R to refetch missing favicons, and Ctrl+, to open settings
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "r") {
    e.preventDefault();
    refetchFavicons();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === ",") {
    e.preventDefault();
    toggleSettings();
  }
});

function refetchFavicons() {
  const images = document.querySelectorAll(".bookmark-icon img");
  images.forEach((img) => {
    if (img.src.includes("default_url.svg")) {
      const anchor = img.closest(".bookmark-icon");
      if (
        anchor &&
        anchor.href &&
        !anchor.href.startsWith("#") &&
        !anchor.href.startsWith("chrome://") &&
        !anchor.href.startsWith("file:///")
      ) {
        loadFaviconWithFallbacks(img, anchor.href, true);
      }
    }
  });
}

function updateClock() {
  const clockElement = document.getElementById("clock");
  if (!clockElement) return;
  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");

  // 12h format with leading 0
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12
  const hoursStr = String(hours).padStart(2, "0");

  clockElement.textContent = `${hoursStr}:${minutes}`;
}
setInterval(updateClock, 1000);
updateClock();

const SLIDER_MAP = [
  { sliderId: "axis-weight", settingKey: "clockWeight", default: 300 },
  { sliderId: "axis-width",  settingKey: "clockWidth",  default: 100 },
  { sliderId: "axis-round",  settingKey: "clockRound",  default: 0   },
  { sliderId: "axis-size",   settingKey: "clockSize",   default: 55  },
];

function updateCustomSlider(inputEl) {
  const slider = inputEl.parentElement.querySelector(".m3-slider");
  if (!slider) return;
  const fill  = slider.querySelector(".m3-slider-fill");
  const thumb = slider.querySelector(".m3-slider-thumb");
  const min   = parseFloat(inputEl.min);
  const max   = parseFloat(inputEl.max);
  const val   = parseFloat(inputEl.value);
  const pct   = ((val - min) / (max - min)) * 100;
  fill.style.width  = `${pct}%`;
  thumb.style.left  = `${pct}%`;
}

function initCustomSlider(inputEl, settingKey) {
  const slider = inputEl.parentElement.querySelector(".m3-slider");
  if (!slider) return;

  const getValueFromEvent = (e) => {
    const rect = slider.getBoundingClientRect();
    const x    = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const pct  = Math.max(0, Math.min(1, x / rect.width));
    const min  = parseFloat(inputEl.min);
    const max  = parseFloat(inputEl.max);
    return Math.round(min + pct * (max - min));
  };

  const onMove = (e) => {
    const val = getValueFromEvent(e);
    inputEl.value = val;
    updateCustomSlider(inputEl);
    settings[settingKey] = val;
    chrome.storage.local.set({ [settingKey]: val });
    applyClockSettings();
  };

  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup",   onUp);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend",  onUp);
  };

  slider.addEventListener("mousedown", (e) => {
    onMove(e);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  });
  slider.addEventListener("touchstart", (e) => {
    onMove(e);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend",  onUp);
  }, { passive: true });
}

function applyClockSettings() {
  const clock = document.getElementById("clock");
  if (!clock) return;

  clock.style.fontWeight = settings.clockWeight ?? 300;
  clock.style.fontVariationSettings = `"slnt" 0, "wdth" ${settings.clockWidth ?? 100}, "GRAD" 0, "ROND" ${settings.clockRound ?? 0}`;
  clock.style.fontSize = `${(settings.clockSize ?? 55) / 10}rem`;

  SLIDER_MAP.forEach(({ sliderId, settingKey, default: def }) => {
    const input = document.getElementById(sliderId);
    if (input) {
      input.value = settings[settingKey] ?? def;
      updateCustomSlider(input);
    }
  });
}

function initSettingsUI() {
  const modal = document.getElementById("settings-modal");

  document.addEventListener("click", (e) => {
    if (modal && modal.classList.contains("show")) {
      if (!modal.contains(e.target)) {
        modal.classList.remove("show");
      }
    }
  });

  SLIDER_MAP.forEach(({ sliderId, settingKey }) => {
    const input = document.getElementById(sliderId);
    if (input) initCustomSlider(input, settingKey);
  });
}

function toggleSettings() {
  const modal = document.getElementById("settings-modal");
  if (modal) {
    modal.classList.toggle("show");
    if (modal.classList.contains("show")) {
      applyClockSettings();
    }
  }
}
