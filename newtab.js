// newtab.js
// Handles loading bookmarks, rendering grid, user settings, and custom CSS

const bookmarksGrid = document.getElementById("bookmarks-grid");
const backgroundDiv = document.getElementById("background");

const PASTEL_COLORS = [
  "rgba(255, 182, 193, 0.15)", // Pink
  "rgba(173, 216, 230, 0.15)", // Blue
  "rgba(152, 251, 152, 0.12)", // Pale Green
  "rgba(221, 160, 221, 0.15)", // Plum/Purple
  "rgba(255, 218, 185, 0.18)", // Peach
  "rgba(240, 230, 140, 0.15)"  // Yellow
];

function getPastelColor(id) {
  const num = parseInt(id, 10) || 0;
  return PASTEL_COLORS[num % PASTEL_COLORS.length];
}

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
  clockSeparator: ":",
  showSettingsEntry: true,
  showDate: true,
  dateFormat: "0",
  datePosition: "below",
  dateSize: 22,
  dateWeight: 400,
  clockColor: "auto",
  dateColor: "auto",
  greetingColor: "auto",
  backgroundColor: "auto",
  bgZoomDuration: 2.5,
  showGreeting: false,
  greetingName: "",
  keepGreetingVisible: false
};

// Load settings from storage
function loadSettings() {
  chrome.storage.local.get(null, (data) => {
    settings = { ...settings, ...data };
    
    // Sanitize datePosition: if "top", change to "below"
    if (settings.datePosition === "top") {
      settings.datePosition = "below";
      chrome.storage.local.set({ datePosition: "below" });
    }

    loadAndRenderBookmarks();
    loadCustomCss();
    applyClockSettings();
    applyDateSettings();
    initSettingsUI();
    applyBackground();
    updateBingImageIfNeeded();
    updateUnsplashImageIfNeeded();

    // Helper to get time-of-day greeting
    const getTimeOfDayGreeting = () => {
      const hour = new Date().getHours();
      if (hour >= 5 && hour < 12) return "Good morning";
      if (hour >= 12 && hour < 17) return "Good afternoon";
      if (hour >= 17 && hour < 22) return "Good evening";
      return "Good night";
    };

    // Greeting timing sequence
    const bookmarksContainer = document.getElementById("bookmarks-container");
    const greetingEl = document.getElementById("greeting");
    if (settings.showGreeting && bookmarksContainer && greetingEl) {
      bookmarksContainer.classList.add("greeting-phase");
      const name = settings.greetingName ? settings.greetingName.trim() : "";
      greetingEl.textContent = name 
        ? `Hi ${name}, ${getTimeOfDayGreeting()}!`
        : `Hi, ${getTimeOfDayGreeting()}!`;
      setTimeout(() => {
        bookmarksContainer.classList.remove("greeting-phase");
        bookmarksContainer.classList.add("main-phase");
      }, 1500);
    } else {
      if (bookmarksContainer) {
        bookmarksContainer.classList.add("main-phase");
      }
    }

    // Check for daily wallpaper updates every hour
    setInterval(() => {
      updateUnsplashImageIfNeeded();
    }, 3600000);
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
  let folderCount = 0;

  if (settings.showSettingsEntry ?? true) {
    limited.push({
      title: "Settings",
      url: "#settings",
      isSettingsEntry: true
    });
  }
  
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
    
    let elementToAppend = icon;
    
    const insideIcon = document.createElement("div");
    insideIcon.className = "bookmark-icon-inner";
    if (bm.isSettingsEntry) {
      icon.href = "#";
      icon.title = "Settings (Ctrl+,)";
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.style.fill = "currentColor";
      svg.style.width = "var(--bookmark-icon-size)";
      svg.style.height = "var(--bookmark-icon-size)";
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z");
      svg.appendChild(path);
      insideIcon.appendChild(svg);
      icon.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleSettings();
      });
    }
    // Bookmark folder
    else if (!bm.url || bm.url.startsWith("chrome://bookmarks")) {
      icon.classList.add("folder-trigger");
      icon.href = "#";
      icon.title = bm.title || "Folder";
      
      const img = document.createElement("img");
      img.src = "bookmark_folder.svg";
      img.alt = "";
      insideIcon.appendChild(img);
      
      const titleSpan = document.createElement("span");
      titleSpan.className = "folder-title";
      titleSpan.textContent = bm.title || "Folder";
      insideIcon.appendChild(titleSpan);
      
      const pastelColor = PASTEL_COLORS[folderCount % PASTEL_COLORS.length];
      folderCount++;
      
      icon.style.backgroundColor = pastelColor;
      icon.style.borderColor = pastelColor.replace(/[\d.]+\)/, '0.35)');
      
      icon.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const isExpanded = icon.classList.contains("expanded");
        
        if (isExpanded) {
          icon.classList.remove("expanded");
          const childrenToCollapse = document.querySelectorAll(`.folder-child-${bm.id}`);
          childrenToCollapse.forEach((child) => {
            child.classList.remove("show");
            setTimeout(() => {
              child.remove();
              calculateNaturalHeight();
            }, 250);
          });
          setTimeout(calculateNaturalHeight, 50);
        } else {
          icon.classList.add("expanded");
          chrome.bookmarks.getChildren(bm.id, (children) => {
            if (children && children.length > 0) {
              let lastInserted = icon;
              const newIcons = [];
              
              children.forEach((child) => {
                const childIcon = document.createElement("a");
                childIcon.className = `bookmark-icon folder-child folder-child-${bm.id}`;
                childIcon.title = child.title || (child.url ? "" : "Folder");
                childIcon.style.backgroundColor = pastelColor;
                childIcon.style.borderColor = pastelColor.replace(/[\d.]+\)/, '0.35)');
                
                const childInner = document.createElement("div");
                childInner.className = "bookmark-icon-inner";
                
                if (!child.url) {
                  childIcon.href = "#";
                  const cImg = document.createElement("img");
                  cImg.src = "bookmark_folder.svg";
                  childInner.appendChild(cImg);
                  childIcon.addEventListener("click", (ce) => {
                    ce.preventDefault();
                    chrome.tabs.create({ url: `chrome://bookmarks/?id=${child.id}` });
                  });
                } else {
                  childIcon.href = child.url;
                  const cImg = document.createElement("img");
                  cImg.alt = "";
                  loadFaviconWithFallbacks(cImg, child.url);
                  childInner.appendChild(cImg);
                }
                
                childIcon.appendChild(childInner);
                
                lastInserted.after(childIcon);
                lastInserted = childIcon;
                newIcons.push(childIcon);
              });
              
              // Force layout calculation and apply transition class on the next frame
              requestAnimationFrame(() => {
                newIcons.forEach((ci) => {
                  ci.offsetHeight; // trigger reflow
                  ci.classList.add("show");
                });
                calculateNaturalHeight();
              });
            }
          });
        }
      });
      
      elementToAppend = icon;
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
      container.appendChild(elementToAppend);
    } else {
      if (standardContainer) {
        standardContainer.appendChild(elementToAppend);
      } else {
        container.appendChild(elementToAppend);
      }
    }
  });

  if (standardContainer) {
    let bgAttr = document.getElementById("bg-attribution");
    if (!bgAttr) {
      bgAttr = document.createElement("div");
      bgAttr.id = "bg-attribution";
    }
    standardContainer.appendChild(bgAttr);
  }

  applyStaggeredRowAnimations();
  calculateNaturalHeight();
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
  calculateNaturalHeight();
  const progress = scrollY / maxScroll;
  applyScrollTransition(progress);
});

function loadFaviconWithFallbacks(img, url, cacheBuster = false) {
  const cb = cacheBuster ? `&cb=${Date.now()}` : "";
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch (e) {}

  const mv3Favicon = (u, size) => {
    try {
      const urlObj = new URL(chrome.runtime.getURL("/_favicon/"));
      urlObj.searchParams.set("pageUrl", u);
      urlObj.searchParams.set("size", size.toString());
      return urlObj.toString() + cb;
    } catch (e) {
      return null;
    }
  };

  // Fallback list:
  // 1. Chrome's native local favicon cache (32px / 64px) via virtual MV3 path
  // 2. Classic Google s2 service (32px)
  // 3. DuckDuckGo favicon service
  const fallbacks = [
    mv3Favicon(url, 64),
    mv3Favicon(url, 32),
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

  updateDate();
}
setInterval(updateClock, 1000);
updateClock();

function updateDate() {
  const dateElement = document.getElementById("date");
  if (!dateElement) return;

  if (!settings.showDate) {
    dateElement.style.display = "none";
    return;
  }
  dateElement.style.display = "";

  const now = new Date();
  
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const shortDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const dayName = days[now.getDay()];
  const shortDayName = shortDays[now.getDay()];
  const monthName = months[now.getMonth()];
  const shortMonthName = shortMonths[now.getMonth()];
  const dateNum = now.getDate();
  const year = now.getFullYear();
  
  const pad = (n) => String(n).padStart(2, "0");

  let formattedDate = "";
  const formatIndex = String(settings.dateFormat);

  switch (formatIndex) {
    case "0": // Thursday, June 25, 2026
      formattedDate = `${dayName}, ${monthName} ${dateNum}, ${year}`;
      break;
    case "1": // June 25, 2026
      formattedDate = `${monthName} ${dateNum}, ${year}`;
      break;
    case "2": // 2026-06-25
      formattedDate = `${year}-${pad(now.getMonth() + 1)}-${pad(dateNum)}`;
      break;
    case "3": // 25/06/2026
      formattedDate = `${pad(dateNum)}/${pad(now.getMonth() + 1)}/${year}`;
      break;
    case "4": // 06/25/2026
      formattedDate = `${pad(now.getMonth() + 1)}/${pad(dateNum)}/${year}`;
      break;
    case "5": // Thu, Jun 25
      formattedDate = `${shortDayName}, ${shortMonthName} ${dateNum}`;
      break;
    case "6": // Thursday, 25 June
      formattedDate = `${dayName}, ${dateNum} ${monthName}`;
      break;
    case "7": // June 25
      formattedDate = `${monthName} ${dateNum}`;
      break;
    case "8": // 25 June 2026
      formattedDate = `${dateNum} ${monthName} ${year}`;
      break;
    case "9": // Thu, 25 Jun 2026
      formattedDate = `${shortDayName}, ${dateNum} ${shortMonthName} ${year}`;
      break;
    case "10": // 2026.06.25
      formattedDate = `${year}.${pad(now.getMonth() + 1)}.${pad(dateNum)}`;
      break;
    default:
      formattedDate = `${dayName}, ${monthName} ${dateNum}, ${year}`;
  }

  dateElement.textContent = formattedDate;
}

function applyDateSettings() {
  const dateElement = document.getElementById("date");
  if (!dateElement) return;

  dateElement.style.display = settings.showDate ? "" : "none";
  dateElement.style.fontSize = `${settings.dateSize ?? 22}px`;
  dateElement.style.fontWeight = settings.dateWeight ?? 400;
  dateElement.style.fontVariationSettings = `"slnt" 0, "wdth" 100, "GRAD" 0, "ROND" 100, "wght" ${settings.dateWeight ?? 400}`;
  dateElement.style.color = settings.dateColor === "auto" ? "" : settings.dateColor;

  const dateColorInput = document.getElementById("axis-date-color");
  if (dateColorInput) {
    dateColorInput.value = settings.dateColor === "auto" ? "#ffffff" : settings.dateColor;
  }

  const clockContainer = document.getElementById("clock-container");
  const clockElement = document.getElementById("clock");

  dateElement.classList.remove("pos-above", "pos-below");

  if (settings.datePosition === "above") {
    dateElement.classList.add("pos-above");
    if (clockContainer && clockElement) {
      if (dateElement.nextSibling !== clockElement) {
        clockContainer.insertBefore(dateElement, clockElement);
      }
    }
  } else {
    dateElement.classList.add("pos-below");
    if (clockContainer) {
      if (dateElement.previousSibling !== clockElement) {
        clockContainer.appendChild(dateElement);
      }
    }
  }

  updateDate();
}

const SLIDER_MAP = [
  { sliderId: "axis-weight", settingKey: "clockWeight", default: 300 },
  { sliderId: "axis-width",  settingKey: "clockWidth",  default: 100 },
  { sliderId: "axis-round",  settingKey: "clockRound",  default: 0   },
  { sliderId: "axis-size",   settingKey: "clockSize",   default: 55  },
  { sliderId: "axis-date-size", settingKey: "dateSize", default: 22 },
  { sliderId: "axis-date-weight", settingKey: "dateWeight", default: 400 },
  { sliderId: "axis-bm-width", settingKey: "bookmarkMaxWidth", default: 80 },
  { sliderId: "axis-bm-btnsize", settingKey: "bookmarkButtonSize", default: 56 },
  { sliderId: "axis-bm-iconsize", settingKey: "bookmarkIconSize", default: 28 },
  { sliderId: "axis-bm-spacing", settingKey: "bookmarkSpacing", default: 5 },
  { sliderId: "axis-bm-topsites", settingKey: "topSitesCount", default: 5 },
  { sliderId: "axis-bg-opacity", settingKey: "bgOpacity", default: 100 },
  { sliderId: "axis-bg-blur",    settingKey: "bgBlur",    default: 0   },
  { sliderId: "axis-bg-zoom-duration", settingKey: "bgZoomDuration", default: 2.5 }
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
    applyDateSettings();
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
  clock.style.color = settings.clockColor === "auto" ? "" : settings.clockColor;

  const clockColorInput = document.getElementById("axis-clock-color");
  if (clockColorInput) {
    clockColorInput.value = settings.clockColor === "auto" ? "#ffffff" : settings.clockColor;
  }

  // Apply Bookmarks settings as CSS custom properties
  const root = document.documentElement;
  root.style.setProperty("--bookmark-max-width", `${settings.bookmarkMaxWidth ?? 80}vw`);
  root.style.setProperty("--bookmark-button-size", `${(settings.bookmarkButtonSize ?? 56) / 16}rem`);
  root.style.setProperty("--bookmark-icon-size", `${(settings.bookmarkIconSize ?? 28) / 16}rem`);
  root.style.setProperty("--bookmark-spacing", `${(settings.bookmarkSpacing ?? 5) / 16}rem`);

  // Apply Background settings as CSS custom properties
  root.style.setProperty("--bg-opacity", `${(settings.bgOpacity ?? 100) / 100}`);
  root.style.setProperty("--bg-blur", `${settings.bgBlur ?? 0}px`);
  root.style.setProperty("--bg-zoom-duration", `${settings.bgZoomDuration ?? 2.5}s`);

  // Update Show Recents UI elements
  const recentsCheckbox = document.getElementById("axis-bm-showrecents");
  if (recentsCheckbox) {
    recentsCheckbox.checked = settings.showRecents ?? true;
  }
  const labelTopsites = document.getElementById("label-bm-topsites");
  if (labelTopsites) {
    labelTopsites.textContent = settings.showRecents ? "Recent Sites" : "Top Bookmarks";
  }

  // Update Show Settings Entry UI elements
  const settingsCheckbox = document.getElementById("axis-bm-showsettings");
  if (settingsCheckbox) {
    settingsCheckbox.checked = settings.showSettingsEntry ?? true;
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
    bgSection.classList.toggle("unsplash-active", settings.backgroundSource === "unsplash");
    bgSection.classList.toggle("default-active", settings.backgroundSource === "default");
  }

  const bgColorInput = document.getElementById("axis-bg-color");
  if (bgColorInput) {
    bgColorInput.value = settings.backgroundColor === "auto" ? "#222222" : settings.backgroundColor;
  }

  SLIDER_MAP.forEach(({ sliderId, settingKey, default: def }) => {
    const input = document.getElementById(sliderId);
    if (input) {
      input.value = settings[settingKey] ?? def;
      updateCustomSlider(input);
    }
  });

  // Update greeting settings in UI
  const greetingShowCheckbox = document.getElementById("axis-greeting-show");
  if (greetingShowCheckbox) {
    greetingShowCheckbox.checked = !!settings.showGreeting;
  }
  const greetingNameInput = document.getElementById("axis-greeting-name");
  if (greetingNameInput) {
    greetingNameInput.value = settings.greetingName || "";
  }
  const greetingVisibleCheckbox = document.getElementById("axis-greeting-visible");
  if (greetingVisibleCheckbox) {
    greetingVisibleCheckbox.checked = !!settings.keepGreetingVisible;
  }
  document.body.classList.toggle("keep-greeting-visible", !!settings.keepGreetingVisible);

  const greetingEl = document.getElementById("greeting");
  if (greetingEl) {
    greetingEl.style.color = settings.greetingColor === "auto" ? "" : settings.greetingColor;
  }
  const greetingColorInput = document.getElementById("axis-greeting-color");
  if (greetingColorInput) {
    greetingColorInput.value = settings.greetingColor === "auto" ? "#ffffff" : settings.greetingColor;
  }

  calculateNaturalHeight();
}

function initSettingsUI() {
  const modal = document.getElementById("settings-modal");

  // Load and apply collapsed sections state
  chrome.storage.local.get(["collapsedSections"], (data) => {
    const collapsed = data.collapsedSections || {};
    document.querySelectorAll(".settings-section").forEach((section) => {
      const sectionId = section.dataset.section;
      if (sectionId && collapsed[sectionId]) {
        section.classList.add("collapsed");
      }
    });
  });

  // Toggle collapsible settings sections
  document.querySelectorAll(".settings-section-header").forEach((header) => {
    header.addEventListener("click", () => {
      const section = header.closest(".settings-section");
      if (!section) return;
      const sectionId = section.dataset.section;
      if (!sectionId) return;
      const isCollapsed = section.classList.toggle("collapsed");
      
      chrome.storage.local.get(["collapsedSections"], (data) => {
        const collapsed = data.collapsedSections || {};
        collapsed[sectionId] = isCollapsed;
        chrome.storage.local.set({ collapsedSections: collapsed });
      });
    });
  });

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

  const settingsCheckbox = document.getElementById("axis-bm-showsettings");
  if (settingsCheckbox) {
    settingsCheckbox.addEventListener("change", (e) => {
      const checked = e.target.checked;
      settings.showSettingsEntry = checked;
      chrome.storage.local.set({ showSettingsEntry: checked });
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

  const dateCheckbox = document.getElementById("axis-date-show");
  if (dateCheckbox) {
    dateCheckbox.addEventListener("change", (e) => {
      const checked = e.target.checked;
      settings.showDate = checked;
      chrome.storage.local.set({ showDate: checked });
      applyDateSettings();
    });
  }

  const dateFormatSelect = document.getElementById("axis-date-format");
  if (dateFormatSelect) {
    dateFormatSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      settings.dateFormat = val;
      chrome.storage.local.set({ dateFormat: val });
      applyDateSettings();
    });
  }

  const clockColorInput = document.getElementById("axis-clock-color");
  if (clockColorInput) {
    clockColorInput.addEventListener("input", (e) => {
      const val = e.target.value;
      settings.clockColor = val;
      chrome.storage.local.set({ clockColor: val });
      applyClockSettings();
    });
    clockColorInput.addEventListener("click", () => {
      document.body.classList.add("color-picker-open");
    });
    clockColorInput.addEventListener("focus", () => {
      document.body.classList.add("color-picker-open");
    });
    clockColorInput.addEventListener("change", () => {
      document.body.classList.remove("color-picker-open");
    });
    clockColorInput.addEventListener("blur", () => {
      setTimeout(() => {
        document.body.classList.remove("color-picker-open");
      }, 150);
    });
  }

  const clockColorAutoBtn = document.getElementById("axis-clock-color-auto");
  if (clockColorAutoBtn) {
    clockColorAutoBtn.addEventListener("click", () => {
      settings.clockColor = "auto";
      chrome.storage.local.set({ clockColor: "auto" });
      applyClockSettings();
    });
  }

  const dateColorInput = document.getElementById("axis-date-color");
  if (dateColorInput) {
    dateColorInput.addEventListener("input", (e) => {
      const val = e.target.value;
      settings.dateColor = val;
      chrome.storage.local.set({ dateColor: val });
      applyDateSettings();
    });
    dateColorInput.addEventListener("click", () => {
      document.body.classList.add("color-picker-open");
    });
    dateColorInput.addEventListener("focus", () => {
      document.body.classList.add("color-picker-open");
    });
    dateColorInput.addEventListener("change", () => {
      document.body.classList.remove("color-picker-open");
    });
    dateColorInput.addEventListener("blur", () => {
      setTimeout(() => {
        document.body.classList.remove("color-picker-open");
      }, 150);
    });
  }

  const dateColorAutoBtn = document.getElementById("axis-date-color-auto");
  if (dateColorAutoBtn) {
    dateColorAutoBtn.addEventListener("click", () => {
      settings.dateColor = "auto";
      chrome.storage.local.set({ dateColor: "auto" });
      applyDateSettings();
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
        updateUnsplashImageIfNeeded();
      } else if (settingKey === "bingResolution") {
        applyClockSettings();
        updateBingImageIfNeeded();
      } else if (settingKey === "datePosition") {
        applyDateSettings();
      }
    });
  });

  SLIDER_MAP.forEach(({ sliderId, settingKey }) => {
    const input = document.getElementById(sliderId);
    if (input) initCustomSlider(input, settingKey);
  });

  const devToggle = document.getElementById("toggle-developer");
  if (devToggle) {
    devToggle.addEventListener("click", () => {
      const devContent = document.getElementById("developer-content");
      if (devContent) {
        devContent.classList.toggle("collapsed");
        devToggle.classList.toggle("active");
        if (!devContent.classList.contains("collapsed")) {
          setTimeout(() => {
            devContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 150);
        }
      }
    });
  }

  const unsplashCheckBtn = document.getElementById("unsplash-check-now");
  if (unsplashCheckBtn) {
    unsplashCheckBtn.addEventListener("click", () => {
      const svg = unsplashCheckBtn.querySelector("svg");
      if (svg) svg.style.animation = "spin 1s linear infinite";
      const textSpan = unsplashCheckBtn.querySelector(".btn-text");
      if (textSpan) textSpan.textContent = "Checking...";
      updateUnsplashImageIfNeeded(true);
    });
  }

  // Greeting setting event listeners
  const greetingShowCheckbox = document.getElementById("axis-greeting-show");
  if (greetingShowCheckbox) {
    greetingShowCheckbox.checked = !!settings.showGreeting;
    greetingShowCheckbox.addEventListener("change", (e) => {
      const checked = e.target.checked;
      settings.showGreeting = checked;
      chrome.storage.local.set({ showGreeting: checked });
    });
  }

  const greetingNameInput = document.getElementById("axis-greeting-name");
  if (greetingNameInput) {
    greetingNameInput.value = settings.greetingName || "";
    greetingNameInput.addEventListener("input", (e) => {
      const val = e.target.value;
      settings.greetingName = val;
      chrome.storage.local.set({ greetingName: val });
    });
  }

  const greetingVisibleCheckbox = document.getElementById("axis-greeting-visible");
  if (greetingVisibleCheckbox) {
    greetingVisibleCheckbox.checked = !!settings.keepGreetingVisible;
    greetingVisibleCheckbox.addEventListener("change", (e) => {
      const checked = e.target.checked;
      settings.keepGreetingVisible = checked;
      chrome.storage.local.set({ keepGreetingVisible: checked });
      applyClockSettings();
    });
  }

  const greetingColorInput = document.getElementById("axis-greeting-color");
  if (greetingColorInput) {
    greetingColorInput.addEventListener("input", (e) => {
      const val = e.target.value;
      settings.greetingColor = val;
      chrome.storage.local.set({ greetingColor: val });
      applyClockSettings();
    });
    greetingColorInput.addEventListener("click", () => {
      document.body.classList.add("color-picker-open");
    });
    greetingColorInput.addEventListener("focus", () => {
      document.body.classList.add("color-picker-open");
    });
    greetingColorInput.addEventListener("change", () => {
      document.body.classList.remove("color-picker-open");
    });
    greetingColorInput.addEventListener("blur", () => {
      setTimeout(() => {
        document.body.classList.remove("color-picker-open");
      }, 150);
    });
  }

  const greetingColorAutoBtn = document.getElementById("axis-greeting-color-auto");
  if (greetingColorAutoBtn) {
    greetingColorAutoBtn.addEventListener("click", () => {
      settings.greetingColor = "auto";
      chrome.storage.local.set({ greetingColor: "auto" });
      applyClockSettings();
    });
  }

  const bgColorInput = document.getElementById("axis-bg-color");
  if (bgColorInput) {
    bgColorInput.addEventListener("input", (e) => {
      const val = e.target.value;
      settings.backgroundColor = val;
      chrome.storage.local.set({ backgroundColor: val });
      applyBackground();
    });
    bgColorInput.addEventListener("click", () => {
      document.body.classList.add("color-picker-open");
    });
    bgColorInput.addEventListener("focus", () => {
      document.body.classList.add("color-picker-open");
    });
    bgColorInput.addEventListener("change", () => {
      document.body.classList.remove("color-picker-open");
    });
    bgColorInput.addEventListener("blur", () => {
      setTimeout(() => {
        document.body.classList.remove("color-picker-open");
      }, 150);
    });
  }

  const bgColorAutoBtn = document.getElementById("axis-bg-color-auto");
  if (bgColorAutoBtn) {
    bgColorAutoBtn.addEventListener("click", () => {
      settings.backgroundColor = "auto";
      chrome.storage.local.set({ backgroundColor: "auto" });
      applyBackground();
      applyClockSettings();
    });
  }
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
let standardContainerNaturalHeight = 0;

function calculateNaturalHeight() {
  const standardContainer = document.getElementById("standard-bookmarks-container");
  if (standardContainer) {
    const origHeight = standardContainer.style.height;
    const origOpacity = standardContainer.style.opacity;
    
    standardContainer.style.height = "auto";
    standardContainer.style.opacity = "1";
    
    standardContainerNaturalHeight = standardContainer.scrollHeight;
    
    standardContainer.style.height = origHeight;
    standardContainer.style.opacity = origOpacity;
  }
}

function resetScrollProgress() {
  scrollY = 0;
  applyScrollTransition(0);
}

function applyScrollTransition(progress) {
  const standardContainer = document.getElementById("standard-bookmarks-container");
  const topSites = document.querySelectorAll(".bookmark-icon.top-site");
  const items = document.querySelectorAll(".bookmark-icon:not(.top-site)");
  const divider = document.querySelector(".grid-break");

  if (progress > 0) {
    topSites.forEach((item) => {
      item.style.animation = "none";
      item.style.opacity = "1";
    });
    const clockContainer = document.getElementById("clock-container");
    if (clockContainer) {
      clockContainer.style.animation = "none";
      clockContainer.style.opacity = "1";
    }
  }

  if (divider) {
    divider.style.opacity = progress;
    divider.style.transform = `scaleX(${progress})`;
    divider.style.transition = "opacity 0.15s ease, transform 0.15s ease";
  }

  // Animate the standard container height to push/pull layout elements in real-time
  if (standardContainer) {
    standardContainer.style.height = `${progress * standardContainerNaturalHeight}px`;
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

// Scroll event listener on background driving the transition
if (backgroundDiv) {
  backgroundDiv.addEventListener("wheel", (e) => {
    e.preventDefault();
    scrollY += e.deltaY;
    if (scrollY < 0) scrollY = 0;
    if (scrollY > maxScroll) scrollY = maxScroll;

    const progress = scrollY / maxScroll;
    applyScrollTransition(progress);
  }, { passive: false });
}

function applyBackground() {
  const bgImageEl = document.getElementById("bg-image");
  const bgAttrEl = document.getElementById("bg-attribution");
  if (!bgImageEl) return;

  const root = document.documentElement;
  if (settings.backgroundSource === "default" && settings.backgroundColor !== "auto") {
    root.style.setProperty("--bg-color", settings.backgroundColor);
  } else {
    root.style.removeProperty("--bg-color");
  }

  if (settings.backgroundSource === "bing") {
    chrome.storage.local.get(["bingImageBase64", "bingImageCopyright", "bingImageCopyrightLink"], (data) => {
      if (data.bingImageBase64) {
        bgImageEl.style.backgroundImage = `url(${data.bingImageBase64})`;
        bgImageEl.classList.add("show-image");
      } else {
        bgImageEl.classList.remove("show-image");
      }
      if (bgAttrEl) {
        if (data.bingImageCopyright) {
          const cleanLink = data.bingImageCopyrightLink || "";
          if (cleanLink) {
            bgAttrEl.innerHTML = `<a href="${cleanLink}" target="_blank">${data.bingImageCopyright}</a>`;
          } else {
            bgAttrEl.textContent = data.bingImageCopyright;
          }
        } else {
          bgAttrEl.innerHTML = "";
        }
      }
    });
  } else if (settings.backgroundSource === "unsplash") {
    chrome.storage.local.get(["unsplashImageBase64", "unsplashImageAuthor", "unsplashImageAuthorLink", "unsplashImageLink"], (data) => {
      if (data.unsplashImageBase64) {
        bgImageEl.style.backgroundImage = `url(${data.unsplashImageBase64})`;
        bgImageEl.classList.add("show-image");
      } else {
        bgImageEl.classList.remove("show-image");
      }

      if (bgAttrEl) {
        if (data.unsplashImageAuthor && data.unsplashImageAuthorLink) {
          bgAttrEl.innerHTML = `Photo by <a href="${data.unsplashImageAuthorLink}" target="_blank">${data.unsplashImageAuthor}</a> on <a href="${data.unsplashImageLink || 'https://unsplash.com/?utm_source=Glance&utm_medium=referral'}" target="_blank">Unsplash</a>`;
        } else {
          bgAttrEl.innerHTML = "";
        }
      }
    });
  } else {
    bgImageEl.classList.remove("show-image");
    if (bgAttrEl) bgAttrEl.innerHTML = "";
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
        const copyright = data.images[0].copyright || "";
        const copyrightLink = data.images[0].copyrightlink ?
          (data.images[0].copyrightlink.startsWith("http") ? data.images[0].copyrightlink : "https://www.bing.com" + data.images[0].copyrightlink) : "";

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
                bingImageResolution: resolution,
                bingImageCopyright: copyright,
                bingImageCopyrightLink: copyrightLink
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

function updateUnsplashImageIfNeeded(force = false) {
  if (settings.backgroundSource !== "unsplash") return;

  chrome.storage.local.get(["unsplashImageDate", "unsplashImageId", "unsplashImageBase64", "lastUnsplashCheckTime"], (data) => {
    const today = new Date().toDateString();
    const oneHour = 3600000;
    const now = Date.now();
    const lastCheck = data.lastUnsplashCheckTime || 0;

    if (force || data.unsplashImageDate !== today || !data.unsplashImageBase64 || (now - lastCheck) > oneHour) {
      fetchAndCacheUnsplashImage(force);
    } else {
      applyBackground();
    }
  });
}

function fetchAndCacheUnsplashImage(force = false) {
  const jsonUrl = "https://sameerasw.com/unsplash-today.json";
  
  fetch(jsonUrl)
    .then((res) => {
      if (!res.ok) throw new Error("Failed to fetch daily Unsplash metadata");
      return res.json();
    })
    .then((data) => {
      const targetUrl = data.url_full || data.url;
      if (data && targetUrl) {
        chrome.storage.local.get(["unsplashImageId", "unsplashImageBase64"], (cached) => {
          const now = Date.now();
          const today = new Date().toDateString();
          
          if (!force && cached.unsplashImageId === data.id && cached.unsplashImageBase64) {
            chrome.storage.local.set({ 
              unsplashImageDate: today,
              lastUnsplashCheckTime: now
            }, () => {
              applyBackground();
            });
            return;
          }
          


          fetch(targetUrl)
            .then((imgRes) => imgRes.blob())
            .then((blob) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64data = reader.result;
                chrome.storage.local.set({
                  unsplashImageBase64: base64data,
                  unsplashImageDate: today,
                  unsplashImageId: data.id,
                  unsplashImageAuthor: data.author ? data.author.name : "",
                  unsplashImageAuthorLink: data.author ? data.author.link : "",
                  unsplashImageLink: data.link || "",
                  lastUnsplashCheckTime: now
                }, () => {
                  applyBackground();
                  const btn = document.getElementById("unsplash-check-now");
                  if (btn) {
                    const svg = btn.querySelector("svg");
                    if (svg) svg.style.animation = "";
                    const textSpan = btn.querySelector(".btn-text");
                    if (textSpan) {
                      const origText = textSpan.textContent;
                      textSpan.textContent = "Updated!";
                      btn.style.color = "#41f7b6";
                      setTimeout(() => {
                        textSpan.textContent = origText;
                        btn.style.color = "";
                      }, 2000);
                    }
                  }
                });
              };
              reader.readAsDataURL(blob);
            })
            .catch((err) => {
              console.error("Error reading Unsplash image data:", err);
              resetCheckButton();
            });
        });
      }
    })
    .catch((err) => {
      console.error("Error fetching daily Unsplash image metadata:", err);
      resetCheckButton();
    });
}

function resetCheckButton() {
  const btn = document.getElementById("unsplash-check-now");
  if (btn) {
    const svg = btn.querySelector("svg");
    if (svg) svg.style.animation = "";
    const textSpan = btn.querySelector(".btn-text");
    if (textSpan) {
      const origText = textSpan.textContent;
      textSpan.textContent = "Error!";
      btn.style.color = "#ff4a4a";
      setTimeout(() => {
        textSpan.textContent = origText;
        btn.style.color = "";
      }, 2000);
    }
  }
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
