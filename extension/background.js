const NATIVE_HOST_NAME = "com.agy.brave_cowork";
const DEFAULT_SETTINGS = {
  autoCollapse: true,
  showIndicator: true,
};
const VALID_COLORS = new Set([
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
]);

let nativePort = null;
let connected = false;
let reconnectTimer = null;

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

async function getAgentGroups() {
  const { agentGroups } = await chrome.storage.local.get("agentGroups");
  return agentGroups || {};
}

async function saveAgentGroups(agentGroups) {
  await chrome.storage.local.set({ agentGroups });
  await updateBadge(agentGroups);
}

async function updateBadge(agentGroups) {
  const count = Object.keys(agentGroups || {}).length;
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  await chrome.action.setBadgeBackgroundColor({
    color: connected ? "#7c3aed" : "#6b7280",
  });
}

async function pruneStaleGroups() {
  const agentGroups = await getAgentGroups();
  const existing = await chrome.tabGroups.query({});
  const existingIds = new Set(existing.map((g) => String(g.id)));
  let changed = false;
  for (const id of Object.keys(agentGroups)) {
    if (!existingIds.has(id)) {
      delete agentGroups[id];
      changed = true;
    }
  }
  if (changed) {
    await saveAgentGroups(agentGroups);
  }
  return agentGroups;
}

async function injectIndicator(tabId, active, label = "Antigravity работает") {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (isActive, text) => {
        const ROOT_ID = "__agy_cowork_indicator__";
        const STYLE_ID = "__agy_cowork_style__";
        const existing = document.getElementById(ROOT_ID);
        if (!isActive) {
          if (typeof window.__agyCoworkCleanup === "function") {
            window.__agyCoworkCleanup();
            delete window.__agyCoworkCleanup;
          }
          if (existing) existing.remove();
          const st = document.getElementById(STYLE_ID);
          if (st) st.remove();
          return;
        }
        if (existing) {
          const span = existing.querySelector("[data-agy-label]");
          if (span) span.textContent = text;
          return;
        }

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
          @keyframes __agyRipple {
            0% { transform: translate(-50%, -50%) scale(0.25); opacity: 0.9; }
            100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0; }
          }
          @keyframes __agyPulseDot {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.45; transform: scale(0.8); }
          }
        `;
        document.documentElement.appendChild(style);

        const host = document.createElement("div");
        host.id = ROOT_ID;
        host.style.cssText =
          "position:fixed;inset:0;pointer-events:none;z-index:2147483647;box-sizing:border-box;border:3px solid rgba(124,58,237,0.75);box-shadow:inset 0 0 18px rgba(124,58,237,0.35);";

        // Floating status pill with Stop button
        const pill = document.createElement("div");
        pill.style.cssText =
          "position:fixed;top:10px;right:14px;pointer-events:auto;display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:rgba(17,17,27,0.92);color:#f3f4f6;font:600 12px/1.2 system-ui,-apple-system,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,0.35);border:1px solid rgba(167,139,250,0.5);backdrop-filter:blur(6px);";
        const dot = document.createElement("span");
        dot.style.cssText =
          "width:8px;height:8px;border-radius:50%;background:#a78bfa;display:inline-block;animation:__agyPulseDot 1.6s ease-in-out infinite;";
        const span = document.createElement("span");
        span.setAttribute("data-agy-label", "1");
        span.textContent = text;
        const btn = document.createElement("button");
        btn.textContent = "Стоп";
        btn.style.cssText =
          "margin-left:4px;padding:2px 8px;border-radius:999px;border:none;background:#ef4444;color:#fff;font:600 11px/1.2 system-ui,sans-serif;cursor:pointer;";
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          chrome.runtime.sendMessage({ type: "STOP_CURRENT_GROUP" });
        });
        pill.append(dot, span, btn);

        // Claude-style flying agent cursor
        const cursor = document.createElement("div");
        cursor.setAttribute("data-agy-cursor", "1");
        cursor.style.cssText =
          "position:fixed;top:0;left:0;pointer-events:none;z-index:2147483647;opacity:0;transform:translate3d(-100px,-100px,0);transition:transform 320ms cubic-bezier(0.22,1,0.36,1),opacity 220ms ease;will-change:transform;";
        cursor.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" style="display:block;filter:drop-shadow(0 2px 6px rgba(124,58,237,0.55));">
            <path d="M4 2.5L20.5 11.2L13.2 13.4L9.8 20.5L4 2.5Z" fill="#7c3aed" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
          <div style="position:absolute;left:18px;top:16px;padding:2px 7px;border-radius:999px;background:rgba(124,58,237,0.95);color:#fff;font:700 10px/1.2 system-ui,-apple-system,sans-serif;letter-spacing:0.03em;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.28);">AGY</div>
        `;

        host.append(pill, cursor);
        document.documentElement.appendChild(host);

        let curX = window.innerWidth * 0.5;
        let curY = window.innerHeight * 0.5;
        let idleTimer = null;
        let lastRippleAt = 0;

        function moveCursor(x, y, squish = false) {
          if (!Number.isFinite(x) || !Number.isFinite(y)) return;
          curX = x;
          curY = y;
          cursor.style.opacity = "1";
          cursor.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)${squish ? " scale(0.84)" : ""}`;
          if (squish) {
            setTimeout(() => {
              cursor.style.transform = `translate3d(${Math.round(curX)}px,${Math.round(curY)}px,0)`;
            }, 140);
          }
          clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            cursor.style.opacity = "0.28";
          }, 4000);
        }

        function spawnRipple(x, y) {
          const now = Date.now();
          if (now - lastRippleAt < 90) return;
          lastRippleAt = now;
          const ring = document.createElement("div");
          ring.style.cssText = `position:fixed;left:${Math.round(x)}px;top:${Math.round(y)}px;width:22px;height:22px;border-radius:50%;border:2.5px solid #a78bfa;background:rgba(124,58,237,0.22);pointer-events:none;z-index:2147483647;animation:__agyRipple 520ms cubic-bezier(0.22,1,0.36,1) forwards;`;
          host.appendChild(ring);
          setTimeout(() => ring.remove(), 550);
        }

        function coordsFromEvent(e) {
          if (typeof e.clientX === "number" && typeof e.clientY === "number" && (e.clientX !== 0 || e.clientY !== 0)) {
            return { x: e.clientX, y: e.clientY };
          }
          if (e.target && typeof e.target.getBoundingClientRect === "function") {
            const rect = e.target.getBoundingClientRect();
            if (rect.width > 0 || rect.height > 0) {
              return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            }
          }
          return null;
        }

        function onMove(e) {
          if (pill.contains(e.target)) return;
          const pt = coordsFromEvent(e);
          if (pt) moveCursor(pt.x, pt.y, false);
        }

        function onPress(e) {
          if (pill.contains(e.target)) return;
          const pt = coordsFromEvent(e);
          if (!pt) return;
          moveCursor(pt.x, pt.y, true);
          spawnRipple(pt.x, pt.y);
        }

        function onFocusOrInput(e) {
          if (pill.contains(e.target)) return;
          if (!e.target || typeof e.target.getBoundingClientRect !== "function") return;
          const rect = e.target.getBoundingClientRect();
          if (rect.width <= 0 && rect.height <= 0) return;
          moveCursor(rect.left + Math.min(rect.width * 0.5, 48), rect.top + rect.height / 2, false);
        }

        const opts = { capture: true, passive: true };
        window.addEventListener("pointermove", onMove, opts);
        window.addEventListener("mousemove", onMove, opts);
        window.addEventListener("pointerdown", onPress, opts);
        window.addEventListener("click", onPress, opts);
        window.addEventListener("focusin", onFocusOrInput, opts);
        window.addEventListener("input", onFocusOrInput, opts);

        window.__agyCoworkCleanup = () => {
          clearTimeout(idleTimer);
          window.removeEventListener("pointermove", onMove, opts);
          window.removeEventListener("mousemove", onMove, opts);
          window.removeEventListener("pointerdown", onPress, opts);
          window.removeEventListener("click", onPress, opts);
          window.removeEventListener("focusin", onFocusOrInput, opts);
          window.removeEventListener("input", onFocusOrInput, opts);
        };
      },
      args: [active, label],
    });
  } catch {
    // Ignore chrome://, brave:// or restricted pages
  }
}

async function handleCommand(action, params = {}) {
  const settings = await getSettings();

  switch (action) {
    case "ping": {
      const groups = await pruneStaleGroups();
      return {
        pong: true,
        extensionId: chrome.runtime.id,
        activeAgentGroups: Object.keys(groups).length,
      };
    }

    case "create_task_group": {
      const title = String(params.title || "Antigravity Task").slice(0, 60);
      const color = VALID_COLORS.has(params.color) ? params.color : "purple";
      const collapsed =
        typeof params.collapsed === "boolean"
          ? params.collapsed
          : settings.autoCollapse;
      const urls =
        Array.isArray(params.urls) && params.urls.length > 0
          ? params.urls
          : [params.url || "about:blank"];

      const currentWin = await chrome.windows.getLastFocused({
        windowTypes: ["normal"],
      });
      const createdTabs = [];
      for (const url of urls) {
        const tab = await chrome.tabs.create({
          windowId: currentWin?.id,
          url,
          active: false,
        });
        createdTabs.push(tab);
      }

      const tabIds = createdTabs.map((t) => t.id);
      const groupId = await chrome.tabs.group({
        createProperties: currentWin?.id ? { windowId: currentWin.id } : undefined,
        tabIds,
      });

      await chrome.tabGroups.update(groupId, { title, color, collapsed });

      const agentGroups = await pruneStaleGroups();
      agentGroups[String(groupId)] = {
        groupId,
        title,
        color,
        createdAt: Date.now(),
      };
      await saveAgentGroups(agentGroups);

      if (settings.showIndicator) {
        for (const t of createdTabs) {
          if (t.url && /^https?:\/\//.test(t.url)) {
            setTimeout(() => injectIndicator(t.id, true, title), 800);
          }
        }
      }

      return {
        groupId,
        title,
        color,
        collapsed,
        tabs: createdTabs.map((t) => ({
          id: t.id,
          url: t.pendingUrl || t.url,
          title: t.title || "",
        })),
      };
    }

    case "open_tab_in_group": {
      const groupId = Number(params.groupId);
      if (!Number.isFinite(groupId)) {
        throw new Error("groupId is required");
      }
      const url = String(params.url || "about:blank");
      const active = Boolean(params.active);

      const group = await chrome.tabGroups.get(groupId);
      const tab = await chrome.tabs.create({
        windowId: group.windowId,
        url,
        active,
      });
      await chrome.tabs.group({ groupId, tabIds: [tab.id] });

      // Preserve collapsed state when opening in background
      if (!active && group.collapsed) {
        await chrome.tabGroups.update(groupId, { collapsed: true });
      }

      if (settings.showIndicator && /^https?:\/\//.test(url)) {
        setTimeout(() => injectIndicator(tab.id, true, group.title || "Antigravity"), 800);
      }

      return {
        groupId,
        tab: {
          id: tab.id,
          url: tab.pendingUrl || tab.url,
          title: tab.title || "",
        },
      };
    }

    case "group_existing_tabs": {
      const tabIds = (params.tabIds || []).map(Number).filter(Number.isFinite);
      if (tabIds.length === 0) {
        throw new Error("tabIds must be a non-empty array of tab IDs");
      }
      const title = String(params.title || "Antigravity Task").slice(0, 60);
      const color = VALID_COLORS.has(params.color) ? params.color : "purple";
      const collapsed =
        typeof params.collapsed === "boolean"
          ? params.collapsed
          : settings.autoCollapse;

      const groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, { title, color, collapsed });

      const agentGroups = await pruneStaleGroups();
      agentGroups[String(groupId)] = {
        groupId,
        title,
        color,
        createdAt: Date.now(),
      };
      await saveAgentGroups(agentGroups);

      return { groupId, title, color, collapsed, tabIds };
    }

    case "list_task_groups": {
      const agentGroups = await pruneStaleGroups();
      const allGroups = await chrome.tabGroups.query({});
      const allTabs = await chrome.tabs.query({});
      const tabsByGroup = new Map();
      for (const tab of allTabs) {
        if (tab.groupId >= 0) {
          if (!tabsByGroup.has(tab.groupId)) tabsByGroup.set(tab.groupId, []);
          tabsByGroup.get(tab.groupId).push({
            id: tab.id,
            title: tab.title || "",
            url: tab.url || tab.pendingUrl || "",
            active: tab.active,
          });
        }
      }

      const groups = allGroups.map((g) => ({
        groupId: g.id,
        title: g.title || "",
        color: g.color,
        collapsed: g.collapsed,
        isAgentGroup: Boolean(agentGroups[String(g.id)]),
        tabs: tabsByGroup.get(g.id) || [],
      }));

      return { groups };
    }

    case "update_task_group": {
      const groupId = Number(params.groupId);
      if (!Number.isFinite(groupId)) {
        throw new Error("groupId is required");
      }
      const update = {};
      if (typeof params.title === "string") update.title = params.title.slice(0, 60);
      if (typeof params.color === "string" && VALID_COLORS.has(params.color)) {
        update.color = params.color;
      }
      if (typeof params.collapsed === "boolean") update.collapsed = params.collapsed;

      const updated = await chrome.tabGroups.update(groupId, update);
      const agentGroups = await getAgentGroups();
      if (agentGroups[String(groupId)]) {
        agentGroups[String(groupId)] = {
          ...agentGroups[String(groupId)],
          title: updated.title,
          color: updated.color,
        };
        await saveAgentGroups(agentGroups);
      }
      return {
        groupId: updated.id,
        title: updated.title,
        color: updated.color,
        collapsed: updated.collapsed,
      };
    }

    case "close_task_group": {
      const groupId = Number(params.groupId);
      if (!Number.isFinite(groupId)) {
        throw new Error("groupId is required");
      }
      const tabs = await chrome.tabs.query({ groupId });
      const tabIds = tabs.map((t) => t.id);
      if (tabIds.length > 0) {
        await chrome.tabs.remove(tabIds);
      }
      const agentGroups = await getAgentGroups();
      delete agentGroups[String(groupId)];
      await saveAgentGroups(agentGroups);
      return { groupId, closedTabs: tabIds.length };
    }

    case "close_all_task_groups": {
      const agentGroups = await pruneStaleGroups();
      let closedGroups = 0;
      let closedTabs = 0;
      for (const idStr of Object.keys(agentGroups)) {
        const groupId = Number(idStr);
        const tabs = await chrome.tabs.query({ groupId });
        if (tabs.length > 0) {
          await chrome.tabs.remove(tabs.map((t) => t.id));
          closedTabs += tabs.length;
        }
        closedGroups += 1;
      }
      await saveAgentGroups({});
      return { closedGroups, closedTabs };
    }

    case "set_tab_indicator": {
      const tabId = Number(params.tabId);
      if (!Number.isFinite(tabId)) {
        throw new Error("tabId is required");
      }
      await injectIndicator(
        tabId,
        params.active !== false,
        String(params.label || "Antigravity работает")
      );
      return { tabId, active: params.active !== false };
    }

    case "search_history": {
      const query = String(params.query || "");
      const maxResults = Math.min(Number(params.maxResults) || 20, 100);
      const items = await chrome.history.search({ text: query, maxResults });
      return {
        items: items.map((i) => ({
          title: i.title || "",
          url: i.url || "",
          lastVisitTime: i.lastVisitTime,
          visitCount: i.visitCount,
        })),
      };
    }

    case "search_bookmarks": {
      const query = String(params.query || "");
      const items = query
        ? await chrome.bookmarks.search(query)
        : await chrome.bookmarks.getRecent(30);
      return {
        items: items
          .filter((b) => b.url)
          .map((b) => ({
            id: b.id,
            title: b.title || "",
            url: b.url,
          })),
      };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

function connectNative() {
  if (nativePort) return;
  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    connected = true;
    pruneStaleGroups().then(updateBadge);

    nativePort.onMessage.addListener(async (msg) => {
      if (!msg || typeof msg !== "object") return;
      const { id, action, params } = msg;
      try {
        const result = await handleCommand(action, params);
        nativePort?.postMessage({ id, ok: true, result });
      } catch (err) {
        nativePort?.postMessage({
          id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    nativePort.onDisconnect.addListener(() => {
      nativePort = null;
      connected = false;
      pruneStaleGroups().then(updateBadge);
      scheduleReconnect();
    });
  } catch {
    nativePort = null;
    connected = false;
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNative();
  }, 3000);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("keepalive", { periodInMinutes: 0.5 });
  connectNative();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("keepalive", { periodInMinutes: 0.5 });
  connectNative();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepalive") {
    if (!nativePort) connectNative();
  }
});

chrome.tabGroups.onRemoved.addListener(async (group) => {
  const agentGroups = await getAgentGroups();
  if (agentGroups[String(group.id)]) {
    delete agentGroups[String(group.id)];
    await saveAgentGroups(agentGroups);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || tab.groupId < 0) return;
  const settings = await getSettings();
  if (!settings.showIndicator) return;
  const agentGroups = await getAgentGroups();
  const meta = agentGroups[String(tab.groupId)];
  if (meta && tab.url && /^https?:\/\//.test(tab.url)) {
    injectIndicator(tabId, true, meta.title || "Antigravity");
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "GET_STATE") {
      const { groups } = await handleCommand("list_task_groups");
      const settings = await getSettings();
      sendResponse({ connected, groups, settings });
      return;
    }
    if (msg?.type === "UPDATE_SETTINGS") {
      const current = await getSettings();
      const next = { ...current, ...(msg.settings || {}) };
      await chrome.storage.local.set({ settings: next });
      sendResponse({ ok: true, settings: next });
      return;
    }
    if (msg?.type === "CLOSE_GROUP") {
      const res = await handleCommand("close_task_group", { groupId: msg.groupId });
      sendResponse({ ok: true, res });
      return;
    }
    if (msg?.type === "CLOSE_ALL_GROUPS") {
      const res = await handleCommand("close_all_task_groups");
      sendResponse({ ok: true, res });
      return;
    }
    if (msg?.type === "FOCUS_GROUP") {
      await chrome.tabGroups.update(msg.groupId, { collapsed: false });
      const tabs = await chrome.tabs.query({ groupId: msg.groupId });
      if (tabs[0]) {
        await chrome.tabs.update(tabs[0].id, { active: true });
      }
      sendResponse({ ok: true });
      return;
    }
    if (msg?.type === "STOP_CURRENT_GROUP" && sender.tab?.groupId >= 0) {
      await handleCommand("close_task_group", { groupId: sender.tab.groupId });
      sendResponse({ ok: true });
      return;
    }
    if (msg?.type === "RECONNECT") {
      connectNative();
      sendResponse({ ok: true, connected });
      return;
    }
  })();
  return true;
});

// Connect immediately when service worker loads
chrome.alarms.create("keepalive", { periodInMinutes: 0.5 });
connectNative();
