// Keep — one-click "send to Karakeep" for https://keep.booq.cc
const SERVER = "https://keep.booq.cc";
const API = `${SERVER}/api/v1`;

const MENU_PAGE = "kk-save-page";
const MENU_LINK = "kk-save-link";
const MENU_IMAGE = "kk-save-image";
const MENU_TEXT = "kk-save-text";

// ---------------------------------------------------------------- theme

// Black glyph on light toolbars, white glyph on dark ones.
const ICONS = {
  light: { 16: "icons/logo-16.png", 48: "icons/logo-48.png", 128: "icons/logo-128.png" },
  dark: { 16: "icons/logo-16-darkmode.png", 48: "icons/logo-48-darkmode.png", 128: "icons/logo-128-darkmode.png" },
};

async function ensureThemeWatcher() {
  try {
    const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
    if (existing.length) return;
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["MATCH_MEDIA"],
      justification: "Match the toolbar icon to light/dark mode",
    });
  } catch (e) {
    // Races on startup can throw "only one offscreen document" — harmless.
    if (!String(e).includes("single offscreen")) console.warn(e);
  }
}

chrome.runtime.onStartup.addListener(ensureThemeWatcher);
ensureThemeWatcher();

// ---------------------------------------------------------------- setup

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_PAGE, title: "Save page to Karakeep", contexts: ["page"] });
    chrome.contextMenus.create({ id: MENU_LINK, title: "Save link to Karakeep", contexts: ["link"] });
    chrome.contextMenus.create({ id: MENU_IMAGE, title: "Save image to Karakeep", contexts: ["image"] });
    chrome.contextMenus.create({ id: MENU_TEXT, title: "Save selection to Karakeep", contexts: ["selection"] });
  });
  if (reason === "install" && !(await getApiKey())) {
    chrome.runtime.openOptionsPage();
  }
});

// ---------------------------------------------------------------- triggers

chrome.action.onClicked.addListener((tab) => {
  save(tab, { type: "link", url: tab.url, title: tab.title });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case MENU_PAGE:
      return save(tab, { type: "link", url: info.pageUrl, title: tab?.title });
    case MENU_LINK:
      return save(tab, { type: "link", url: info.linkUrl });
    case MENU_IMAGE:
      return save(tab, { type: "link", url: info.srcUrl });
    case MENU_TEXT:
      return save(tab, { type: "text", text: info.selectionText, sourceUrl: info.pageUrl });
  }
});

// Clicks on the in-page toast.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.kk === "scheme") {
    chrome.action.setIcon({ path: msg.dark ? ICONS.dark : ICONS.light });
  } else if (msg?.kk === "open" && msg.id) {
    chrome.tabs.create({ url: `${SERVER}/dashboard/preview/${encodeURIComponent(msg.id)}` });
  } else if (msg?.kk === "setup") {
    chrome.runtime.openOptionsPage();
  }
});

// ---------------------------------------------------------------- core

async function save(tab, bookmark) {
  const tabId = tab?.id;

  if (bookmark.type === "link" && !isHttpUrl(bookmark.url)) {
    return notify(tabId, "error", { message: "Only http(s) pages can be saved" });
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    await notify(tabId, "setup", { message: "Add your API key to start saving" });
    chrome.runtime.openOptionsPage();
    return;
  }

  await notify(tabId, "saving");

  try {
    const res = await fetch(`${API}/bookmarks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...clean(bookmark), source: "extension" }),
    });

    if (res.status === 401 || res.status === 403) {
      return notify(tabId, "setup", { message: "API key rejected — click to fix" });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("Karakeep error", res.status, text);
      return notify(tabId, "error", { message: `Karakeep returned ${res.status}` });
    }

    const data = await res.json();
    await notify(tabId, data.alreadyExists ? "exists" : "saved", { id: data.id });
  } catch (err) {
    console.warn("Karakeep request failed", err);
    await notify(tabId, "error", { message: "Couldn't reach keep.booq.cc" });
  }
}

// ---------------------------------------------------------------- ui

// Show the in-page toast; fall back to a badge on pages we can't script
// (chrome://, the Web Store, the PDF viewer, etc).
async function notify(tabId, state, opts = {}) {
  if (tabId == null) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["toast.js"] });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (s, o) => globalThis.__karakeepToast?.(s, o),
      args: [state, opts],
    });
  } catch {
    badge(tabId, state);
  }
}

const BADGES = {
  saving: { text: "…", color: "#111111" },
  saved: { text: "✓", color: "#111111" },
  exists: { text: "✓", color: "#111111" },
  error: { text: "!", color: "#d93025" },
  setup: { text: "!", color: "#d93025" },
};

function badge(tabId, state) {
  const b = BADGES[state];
  if (!b) return;
  chrome.action.setBadgeBackgroundColor({ tabId, color: b.color });
  chrome.action.setBadgeText({ tabId, text: b.text });
  if (state !== "saving") {
    setTimeout(() => chrome.action.setBadgeText({ tabId, text: "" }), 2500);
  }
}

// ---------------------------------------------------------------- utils

async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  return apiKey || null;
}

function isHttpUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null && v !== ""));
}
