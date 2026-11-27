async function render() {
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  const dot = document.getElementById("dot");
  const statusText = document.getElementById("statusText");
  dot.className = "dot" + (state.connected ? " on" : "");
  statusText.textContent = state.connected ? "Подключено к agy" : "Ожидание хоста";

  document.getElementById("autoCollapse").checked = Boolean(state.settings?.autoCollapse);
  document.getElementById("showIndicator").checked = Boolean(state.settings?.showIndicator);

  const list = document.getElementById("groupsList");
  const closeAllBtn = document.getElementById("closeAllBtn");
  const agentGroups = (state.groups || []).filter((g) => g.isAgentGroup);

  list.innerHTML = "";
  if (agentGroups.length === 0) {
    list.innerHTML = '<div class="empty">Нет активных задач агента</div>';
    closeAllBtn.style.display = "none";
    return;
  }

  closeAllBtn.style.display = "block";
  for (const g of agentGroups) {
    const el = document.createElement("div");
    el.className = "group";
    el.innerHTML = `
      <div class="group-info">
        <div class="group-name"></div>
        <div class="group-meta">${g.tabs.length} вкл. • ${g.collapsed ? "свёрнута" : "открыта"}</div>
      </div>
      <button class="btn btn-open" data-focus="${g.groupId}">Открыть</button>
      <button class="btn btn-close" data-close="${g.groupId}">✕</button>
    `;
    el.querySelector(".group-name").textContent = g.title || "Без названия";
    el.querySelector("[data-focus]").addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "FOCUS_GROUP", groupId: g.groupId });
      window.close();
    });
    el.querySelector("[data-close]").addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "CLOSE_GROUP", groupId: g.groupId });
      render();
    });
    list.appendChild(el);
  }
}

document.getElementById("closeAllBtn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLOSE_ALL_GROUPS" });
  render();
});

document.getElementById("autoCollapse").addEventListener("change", async (e) => {
  await chrome.runtime.sendMessage({
    type: "UPDATE_SETTINGS",
    settings: { autoCollapse: e.target.checked },
  });
});

document.getElementById("showIndicator").addEventListener("change", async (e) => {
  await chrome.runtime.sendMessage({
    type: "UPDATE_SETTINGS",
    settings: { showIndicator: e.target.checked },
  });
});

render();
