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
  clockSize: 55,
  bookmarkMaxWidth: 80,
  bookmarkButtonSize: 56,
  bookmarkIconSize: 28,
  bookmarkSpacing: 5,
  topSitesCount: 5,
  showRecents: true,
  backgroundSource: "default",
  bingResolution: "1920x1080",
  bgOpacity: 100,
  bgBlur: 0,
  clockFormat: "12h",
  clockLeadingZero: true,
  clockSeparator: ":"
};

// Load settings from storage
function loadSettings() {
  chrome.storage.local.get(null, (data) => {
    settings = { ...settings, ...data };
    loadAndRenderBookmarks();
    loadCustomCss();
    applyClockSettings();
    initSettingsUI();
    applyBackground();
    updateBingImageIfNeeded();
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

    if (settings.showRecents) {
      if (typeof chrome !== "undefined" && chrome.topSites && chrome.topSites.get) {
        chrome.topSites.get((mostVisited) => {
          const count = settings.topSitesCount ?? 5;
          const topToShow = (mostVisited || []).slice(0, count);

          // Normalize function to match urls
          const normalizeUrl = (url) => {
            try {
              const u = new URL(url);
              let host = u.hostname.toLowerCase();
              if (host.startsWith("www.")) host = host.substring(4);
              let path = u.pathname.toLowerCase();
              if (path.endsWith("/")) path = path.slice(0, -1);
              return host + path + u.search.toLowerCase();
            } catch (e) {
              return url.toLowerCase();
            }
          };

          const topUrls = new Set(topToShow.map((site) => normalizeUrl(site.url)));

          // Filter out bookmarks that are already showing in Top/Recent Sites
          const filteredBookmarks = nodes.filter((bm) => {
            if (!bm.url) return true; // Keep folders
            return !topUrls.has(normalizeUrl(bm.url));
          });

          // Map top sites to matching structure
          const topItems = topToShow.map((site) => ({
            title: site.title,
            url: site.url,
            isTopSite: true
          }));

          // Combine them (recents first, then remaining bookmarks)
          const combined = [...topItems, ...filteredBookmarks];
          renderBookmarks(combined);
        });
      } else {
        renderBookmarks(nodes);
      }
    } else {
      // Pick top N selected bookmarks from the folder instead of recents
      const count = settings.topSitesCount ?? 5;
      
      const topItems = nodes.slice(0, count).map((bm) => ({
        ...bm,
        isTopSite: true
      }));
      
      const remainingBookmarks = nodes.slice(count);
      const combined = [...topItems, ...remainingBookmarks];
      renderBookmarks(combined);
    }
  });
}

function renderBookmarks(bookmarks) {
  const container = document.getElementById("bookmarks-grid");
  container.innerHTML = "";
  const maxEntries = settings.maxEntries || 100;
  const limited = bookmarks.slice(0, maxEntries);
  
  let renderedTopSites = false;
  let renderedDivider = false;
  let standardContainer = null;

  limited.forEach((bm) => {
    // If we transition from top sites to standard bookmarks/folders, add a line break and container
    if (!bm.isTopSite && !renderedDivider) {
      if (renderedTopSites) {
        const gridBreak = document.createElement("div");
        gridBreak.className = "grid-break";
        container.appendChild(gridBreak);
      }
      standardContainer = document.createElement("div");
      standardContainer.id = "standard-bookmarks-container";
      container.appendChild(standardContainer);
      renderedDivider = true;
    }
    if (bm.isTopSite) {
      renderedTopSites = true;
    }

    const icon = document.createElement("a");
    icon.className = "bookmark-icon";
    if (bm.isTopSite) {
      icon.classList.add("top-site");
    }
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
    
    if (bm.isTopSite) {
      container.appendChild(icon);
    } else {
      if (standardContainer) {
        standardContainer.appendChild(icon);
      } else {
        container.appendChild(icon);
      }
    }
  });
  applyStaggeredRowAnimations();
  resetScrollProgress();
}

function applyStaggeredRowAnimations() {
  const icons = document.querySelectorAll(".bookmark-icon.top-site");
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

  let hoursStr;
  if (settings.clockFormat === "24h") {
    hoursStr = String(hours).padStart(2, "0");
  } else {
    // 12h
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 becomes 12
    if (settings.clockLeadingZero) {
      hoursStr = String(hours).padStart(2, "0");
    } else {
      hoursStr = String(hours);
    }
  }

  const separator = settings.clockSeparator !== undefined ? settings.clockSeparator : ":";
  clockElement.textContent = `${hoursStr}${separator}${minutes}`;
}
setInterval(updateClock, 1000);
updateClock();

const SLIDER_MAP = [
  { sliderId: "axis-weight", settingKey: "clockWeight", default: 300 },
  { sliderId: "axis-width",  settingKey: "clockWidth",  default: 100 },
  { sliderId: "axis-round",  settingKey: "clockRound",  default: 0   },
  { sliderId: "axis-size",   settingKey: "clockSize",   default: 55  },
  { sliderId: "axis-bm-width", settingKey: "bookmarkMaxWidth", default: 80 },
  { sliderId: "axis-bm-btnsize", settingKey: "bookmarkButtonSize", default: 56 },
  { sliderId: "axis-bm-iconsize", settingKey: "bookmarkIconSize", default: 28 },
  { sliderId: "axis-bm-spacing", settingKey: "bookmarkSpacing", default: 5 },
  { sliderId: "axis-bm-topsites", settingKey: "topSitesCount", default: 5 },
  { sliderId: "axis-bg-opacity", settingKey: "bgOpacity", default: 100 },
  { sliderId: "axis-bg-blur", settingKey: "bgBlur", default: 0 }
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
    if (settingKey === "topSitesCount") {
      loadAndRenderBookmarks();
    }
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

  // Apply Bookmarks settings as CSS custom properties
  const root = document.documentElement;
  root.style.setProperty("--bookmark-max-width", `${settings.bookmarkMaxWidth ?? 80}vw`);
  root.style.setProperty("--bookmark-button-size", `${(settings.bookmarkButtonSize ?? 56) / 16}rem`);
  root.style.setProperty("--bookmark-icon-size", `${(settings.bookmarkIconSize ?? 28) / 16}rem`);
  root.style.setProperty("--bookmark-spacing", `${(settings.bookmarkSpacing ?? 5) / 16}rem`);

  // Apply Background settings as CSS custom properties
  root.style.setProperty("--bg-opacity", `${(settings.bgOpacity ?? 100) / 100}`);
  root.style.setProperty("--bg-blur", `${settings.bgBlur ?? 0}px`);

  // Update Show Recents UI elements
  const recentsCheckbox = document.getElementById("axis-bm-showrecents");
  if (recentsCheckbox) {
    recentsCheckbox.checked = settings.showRecents ?? true;
  }
  const labelTopsites = document.getElementById("label-bm-topsites");
  if (labelTopsites) {
    labelTopsites.textContent = settings.showRecents ? "Recent Sites" : "Top Bookmarks";
  }

  // Update Segmented Controls active buttons
  document.querySelectorAll(".segmented-control").forEach((ctrl) => {
    const settingKey = ctrl.dataset.setting;
    const value = settings[settingKey];
    if (value !== undefined) {
      ctrl.querySelectorAll(".segment-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.value === value);
      });
    }
  });

  // Update Leading Zero element visibility based on clockFormat
  const leadingZeroItem = document.getElementById("setting-item-leading-zero");
  if (leadingZeroItem) {
    leadingZeroItem.style.display = settings.clockFormat === "12h" ? "flex" : "none";
  }
  const leadingZeroCheckbox = document.getElementById("axis-clock-leadingzero");
  if (leadingZeroCheckbox) {
    leadingZeroCheckbox.checked = settings.clockLeadingZero ?? true;
  }

  // Update Bookmarks Limit input
  const bmLimitInput = document.getElementById("axis-bm-limit");
  if (bmLimitInput) {
    bmLimitInput.value = settings.maxEntries ?? 100;
  }

  const bgSection = document.querySelector('.settings-section[data-section="background"]');
  if (bgSection) {
    bgSection.classList.toggle("bing-active", settings.backgroundSource === "bing");
  }

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

  const recentsCheckbox = document.getElementById("axis-bm-showrecents");
  if (recentsCheckbox) {
    recentsCheckbox.addEventListener("change", (e) => {
      const checked = e.target.checked;
      settings.showRecents = checked;
      chrome.storage.local.set({ showRecents: checked });
      
      const labelTopsites = document.getElementById("label-bm-topsites");
      if (labelTopsites) {
        labelTopsites.textContent = checked ? "Recent Sites" : "Top Bookmarks";
      }
      
      loadAndRenderBookmarks();
    });
  }

  const leadingZeroCheckbox = document.getElementById("axis-clock-leadingzero");
  if (leadingZeroCheckbox) {
    leadingZeroCheckbox.addEventListener("change", (e) => {
      const checked = e.target.checked;
      settings.clockLeadingZero = checked;
      chrome.storage.local.set({ clockLeadingZero: checked });
      updateClock();
    });
  }

  const bmLimitInput = document.getElementById("axis-bm-limit");
  if (bmLimitInput) {
    bmLimitInput.addEventListener("change", (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 5) {
        val = 5;
        e.target.value = 5;
      }
      settings.maxEntries = val;
      chrome.storage.local.set({ maxEntries: val });
      loadAndRenderBookmarks();
    });
  }

  // Wire up segmented controls
  document.querySelectorAll(".segmented-control").forEach((ctrl) => {
    const settingKey = ctrl.dataset.setting;
    ctrl.addEventListener("click", (e) => {
      const btn = e.target.closest(".segment-btn");
      if (!btn) return;
      
      const value = btn.dataset.value;
      settings[settingKey] = value;
      chrome.storage.local.set({ [settingKey]: value });
      
      // Update active classes on buttons
      ctrl.querySelectorAll(".segment-btn").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
      
      // Trigger updates
      if (settingKey === "clockFormat" || settingKey === "clockSeparator") {
        applyClockSettings();
        updateClock();
      } else if (settingKey === "backgroundSource") {
        applyClockSettings();
        applyBackground();
        updateBingImageIfNeeded();
      } else if (settingKey === "bingResolution") {
        applyClockSettings();
        updateBingImageIfNeeded();
      }
    });
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

let scrollY = 0;
const maxScroll = 120; // total scroll needed in pixels to fully show bookmarks

function resetScrollProgress() {
  scrollY = 0;
  applyScrollTransition(0);
}

function applyScrollTransition(progress) {
  const standardContainer = document.getElementById("standard-bookmarks-container");
  const topSites = document.querySelectorAll(".bookmark-icon.top-site");
  const items = document.querySelectorAll(".bookmark-icon:not(.top-site)");
  const divider = document.querySelector(".grid-break");

  if (divider) {
    divider.style.opacity = progress;
    divider.style.transform = `scaleX(${progress})`;
    divider.style.transition = "opacity 0.15s ease, transform 0.15s ease";
  }

  // Animate the standard container height to push/pull layout elements in real-time
  if (standardContainer) {
    standardContainer.style.height = "auto";
    const naturalHeight = standardContainer.scrollHeight;
    standardContainer.style.height = `${progress * naturalHeight}px`;
    standardContainer.style.opacity = progress;
  }

  // Slide top sites with a subtle spring
  topSites.forEach((item) => {
    const translateY = (1 - progress) * 15;
    item.style.transform = `translateY(${translateY}px)`;
  });

  items.forEach((item) => {
    // Fade in standard bookmark items and translate them slightly upwards inside the container
    item.style.opacity = progress;
    const translateY = (1 - progress) * 20; 
    item.style.transform = `translateY(${translateY}px)`;

    if (progress < 0.15) {
      item.style.pointerEvents = "none";
    } else {
      item.style.pointerEvents = "auto";
    }
  });
}

// Global scroll event listener driving the transition
window.addEventListener("wheel", (e) => {
  const modal = document.getElementById("settings-modal");
  // Ignore scrolling inside settings modal
  if (modal && modal.classList.contains("show") && modal.contains(e.target)) {
    return;
  }

  scrollY += e.deltaY;
  if (scrollY < 0) scrollY = 0;
  if (scrollY > maxScroll) scrollY = maxScroll;

  const progress = scrollY / maxScroll;
  applyScrollTransition(progress);
}, { passive: false });

function applyBackground() {
  const bgImageEl = document.getElementById("bg-image");
  if (!bgImageEl) return;

  if (settings.backgroundSource === "bing") {
    chrome.storage.local.get(["bingImageBase64"], (data) => {
      if (data.bingImageBase64) {
        bgImageEl.style.backgroundImage = `url(${data.bingImageBase64})`;
        bgImageEl.classList.add("show-image");
      } else {
        bgImageEl.classList.remove("show-image");
      }
    });
  } else {
    bgImageEl.classList.remove("show-image");
  }
}

function updateBingImageIfNeeded() {
  if (settings.backgroundSource !== "bing") return;

  chrome.storage.local.get(["bingImageDate", "bingImageBase64", "bingImageResolution"], (data) => {
    const today = new Date().toDateString();
    const resolution = settings.bingResolution || "1920x1080";
    if (data.bingImageDate !== today || data.bingImageResolution !== resolution || !data.bingImageBase64) {
      fetchAndCacheBingImage(resolution);
    } else {
      applyBackground();
    }
  });
}

function fetchAndCacheBingImage(resolution) {
  const archiveUrl = "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US";
  fetch(archiveUrl)
    .then((res) => res.json())
    .then((data) => {
      if (data.images && data.images[0]) {
        const baseName = data.images[0].urlbase;
        const ext = resolution === "UHD" ? "_UHD.jpg" : "_1920x1080.jpg";
        const imageUrl = "https://www.bing.com" + baseName + ext;

        fetch(imageUrl)
          .then((imgRes) => imgRes.blob())
          .then((blob) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64data = reader.result;
              const today = new Date().toDateString();
              chrome.storage.local.set({
                bingImageBase64: base64data,
                bingImageDate: today,
                bingImageResolution: resolution
              }, () => {
                applyBackground();
              });
            };
            reader.readAsDataURL(blob);
          })
          .catch((err) => console.error("Error reading image data:", err));
      }
    })
    .catch((err) => console.error("Error fetching Bing Image of the Day metadata:", err));
}

// Register browser context menu to open settings
if (typeof chrome !== "undefined" && chrome.contextMenus && chrome.contextMenus.create) {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "open-settings",
      title: "Settings (Ctrl+,)",
      contexts: ["page"]
    });
  });
}

if (typeof chrome !== "undefined" && chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "open-settings" && typeof chrome.tabs !== "undefined" && chrome.tabs.getCurrent) {
      chrome.tabs.getCurrent((currentTab) => {
        if (currentTab && tab && currentTab.id === tab.id) {
          toggleSettings();
        }
      });
    }
  });
}
