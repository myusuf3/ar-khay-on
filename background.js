// Keep — one-click "send to Karakeep" for https://keep.booq.cc
const SERVER = "https://keep.booq.cc";
const API = `${SERVER}/api/v1`;

// ---------------------------------------------------------------- setup

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install" && !(await getApiKey())) {
    chrome.runtime.openOptionsPage();
  }
});

// ---------------------------------------------------------------- triggers

chrome.action.onClicked.addListener((tab) => {
  save(tab, { type: "link", url: tab.url, title: tab.title });
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
      return notify(tabId, "setup", { message: "API key rejected" });
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

// Feedback via the toolbar badge.
async function notify(tabId, state) {
  if (tabId == null) return;
  badge(tabId, state);
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
