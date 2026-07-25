const shellRoot = document.querySelector("#desktopShell");
const workspace = document.querySelector("#workspaceView");
const profileSelect = document.querySelector("#gptProfile");
const gptWebviews = document.querySelector("#gptWebviews");
const profiles = new Map();
const gptStatus = document.querySelector("#gptStatus");
let activeProfile = "1";

function ensureGptProfile(id) {
  if (profiles.has(id)) return profiles.get(id);
  const view = document.createElement("webview");
  view.src = "https://chatgpt.com/";
  view.partition = `persist:gpt-${id}`;
  view.setAttribute("allowpopups", "");
  view.className = "gpt-view";
  gptWebviews.appendChild(view);
  profiles.set(id, view);
  return view;
}

function activateGptProfile(id) {
  activeProfile = id;
  profiles.forEach((view, key) => view.classList.toggle("active", key === id));
  ensureGptProfile(id).classList.add("active");
}

async function syncWorkspaceMode() {
  try {
    const tab = await workspace.executeJavaScript(
      "document.querySelector('.nav.active')?.dataset.tab || document.querySelector('[data-tab].active')?.dataset.tab || ''",
      true
    );
    shellRoot.classList.toggle("is-gpt-visible", tab === "dashboard");
  } catch {
    // The local page can be reloading while this check runs.
  }
}

workspace.addEventListener("dom-ready", async () => {
  await workspace.insertCSS(`
    #dashboardView .material-dual-pane { grid-template-columns: minmax(0, 1fr) !important; }
    #dashboardView .gpt-connection-panel { display: none !important; }
  `);
  syncWorkspaceMode();
});
workspace.addEventListener("did-navigate", syncWorkspaceMode);
workspace.addEventListener("did-navigate-in-page", syncWorkspaceMode);
workspace.addEventListener("ipc-message", syncWorkspaceMode);
workspace.addEventListener("ipc-message", async (event) => {
  if (event.channel !== "gpt-transfer") return;
  const payload = event.args?.[0] || {};
  const view = ensureGptProfile(activeProfile);
  activateGptProfile(activeProfile);
  gptStatus.textContent = "正在把本地素材放入当前 ChatGPT 会话…";
  try {
    const result = await window.desktopShellBridge.prepareGptTransfer({
      targetId: view.getWebContentsId(),
      files: payload.files || [],
      instruction: payload.instruction || ""
    });
    gptStatus.textContent = result.filesAttached
      ? `已放入 ${result.fileCount} 个文件与生产指令，请在网页确认发送`
      : "生产指令已填入；当前网页还未出现上传入口，请打开一个对话后重试";
    await workspace.executeJavaScript(`window.dispatchEvent(new CustomEvent("desktop-gpt-transfer-result", { detail: ${JSON.stringify(result)} }))`, true);
  } catch (error) {
    gptStatus.textContent = `素材传送失败：${error.message}`;
    await workspace.executeJavaScript(`window.dispatchEvent(new CustomEvent("desktop-gpt-transfer-result", { detail: ${JSON.stringify({ ok: false, error: "素材传送失败" })} }))`, true);
  }
});
workspace.addEventListener("click", () => window.setTimeout(syncWorkspaceMode, 80));
window.setInterval(syncWorkspaceMode, 1000);

profileSelect.addEventListener("change", () => activateGptProfile(profileSelect.value));
document.querySelector("#reloadGpt").addEventListener("click", () => ensureGptProfile(activeProfile).reload());
activateGptProfile(activeProfile);
