const shellRoot = document.querySelector("#desktopShell");
const workspace = document.querySelector("#workspaceView");
const profileSelect = document.querySelector("#gptProfile");
const gptWebviews = document.querySelector("#gptWebviews");
const profiles = new Map();
let activeProfile = "1";

function ensureGptProfile(id) {
  if (profiles.has(id)) return profiles.get(id);
  const view = document.createElement("webview");
  view.src = "https://chatgpt.com/";
  view.partition = `persist:gpt-${id}`;
  view.setAttribute("allowpopups", "false");
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
workspace.addEventListener("click", () => window.setTimeout(syncWorkspaceMode, 80));
window.setInterval(syncWorkspaceMode, 1000);

profileSelect.addEventListener("change", () => activateGptProfile(profileSelect.value));
document.querySelector("#reloadGpt").addEventListener("click", () => ensureGptProfile(activeProfile).reload());
activateGptProfile(activeProfile);
