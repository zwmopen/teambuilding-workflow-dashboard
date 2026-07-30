const { app, BrowserWindow, WebContentsView, dialog, ipcMain, session } = require("electron");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { version: APP_VERSION } = require("../package.json");

const APP_PORT = String(process.env.PORT || "4327").trim() || "4327";
const APP_URL = `http://127.0.0.1:${APP_PORT}/`;
const RUNTIME_ROOT = process.env.TEAMBUILDING_DASHBOARD_RUNTIME || "D:\\AICode\\运行数据\\江湖有旅人\\图文生产控制台";
const DESKTOP_LOG_FILE = path.join(RUNTIME_ROOT, "desktop.log");
let serverProcess = null;
let mainWindow = null;
const gptAccounts = new Map();
let activeGptAccountId = "account-1";

const GPT_PARTITION_PREFIX = "persist:teambuilding-gpt-production";
const GPT_URL = "https://chatgpt.com/";

function safeGptAccountId(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(0, 48) || "account-1";
}

function resolveGptExtensionPath() {
  const configured = String(process.env.TEAMBUILDING_GPT_EXTENSION || "").trim();
  const bundled = path.resolve(__dirname, "..", "integrations", "gpt-production-extension");
  const development = path.resolve(__dirname, "..", "..", "..", "teambuilding-gpt-production-extension", "src");
  const candidates = configured
    ? [configured, bundled, development]
    : (app.isPackaged ? [bundled, development] : [development, bundled]);
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "manifest.json"))) || candidates[0];
}

function safeGptBounds(input = {}) {
  const width = Math.max(320, Math.round(Number(input.width) || 320));
  const height = Math.max(320, Math.round(Number(input.height) || 320));
  return {
    x: Math.max(0, Math.round(Number(input.x) || 0)),
    y: Math.max(0, Math.round(Number(input.y) || 0)),
    width,
    height
  };
}

async function initializeEmbeddedGptPage(account) {
  const view = account?.view;
  if (!view || view.webContents.isDestroyed()) return;
  const apiRoot = new URL(APP_URL).origin;
  await view.webContents.executeJavaScript(`(() => {
    localStorage.setItem("tb-workbench-embedded", "1");
    localStorage.setItem("tb-workbench-api-root", ${JSON.stringify(apiRoot)});
    localStorage.setItem("tb-workbench-account-id", ${JSON.stringify(account.id)});
    return true;
  })()`, true).catch((error) => appendDesktopLog("gpt-init-failed", error.message));
}

async function ensureGptAccount(accountId = activeGptAccountId) {
  const id = safeGptAccountId(accountId);
  const existing = gptAccounts.get(id);
  if (existing?.view && !existing.view.webContents.isDestroyed()) return existing;
  if (!mainWindow) throw new Error("工作台窗口尚未就绪");
  const account = {
    id,
    partition: `${GPT_PARTITION_PREFIX}-${id}`,
    session: session.fromPartition(`${GPT_PARTITION_PREFIX}-${id}`),
    view: null,
    extensionInfo: null,
    extensionError: ""
  };
  gptAccounts.set(id, account);
  const extensionPath = resolveGptExtensionPath();
  try {
    if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) throw new Error(`扩展目录不存在：${extensionPath}`);
    account.extensionInfo = await account.session.loadExtension(extensionPath, { allowFileAccess: true });
    appendDesktopLog("gpt-extension-loaded", `${id} ${account.extensionInfo.name} ${account.extensionInfo.version}`);
  } catch (error) {
    account.extensionError = error.message;
    appendDesktopLog("gpt-extension-failed", `${id} ${error.stack || error.message}`);
  }
  account.view = new WebContentsView({
    webPreferences: {
      partition: account.partition,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  const currentUserAgent = account.view.webContents.getUserAgent();
  account.view.webContents.setUserAgent(`${currentUserAgent} TeambuildingWorkbenchGPT/0.2`);
  account.view.setBackgroundColor("#f5f7f5");
  mainWindow.contentView.addChildView(account.view);
  account.view.setVisible(false);
  account.view.webContents.on("did-finish-load", () => initializeEmbeddedGptPage(account));
  account.view.webContents.on("did-fail-load", (_event, code, description, validatedURL, isMainFrame) => {
    appendDesktopLog("gpt-load-failed", `account=${id} code=${code} main=${isMainFrame} url=${validatedURL} ${description}`);
  });
  await account.view.webContents.loadURL(GPT_URL);
  await initializeEmbeddedGptPage(account);
  return account;
}

function activeGptAccount() {
  const account = gptAccounts.get(activeGptAccountId);
  return account?.view && !account.view.webContents.isDestroyed() ? account : null;
}

function hideAllGptViews(exceptId = "") {
  for (const [id, account] of gptAccounts) {
    if (!account.view || account.view.webContents.isDestroyed()) continue;
    account.view.setVisible(Boolean(exceptId && id === exceptId));
  }
}

async function ensureGptView(accountId = activeGptAccountId) {
  const account = await ensureGptAccount(accountId);
  return account.view;
}

async function sendTaskToEmbeddedGpt(task = {}) {
  const accountId = safeGptAccountId(task.accountId || activeGptAccountId);
  const view = await ensureGptView(accountId);
  const requestId = String(task.requestId || `workbench-${Date.now()}`);
  const payload = {
    source: "teambuilding-workbench",
    type: "tb-workbench-upload",
    requestId,
    name: String(task.name || "工作台素材"),
    materialPath: String(task.materialPath || ""),
    attachments: Array.isArray(task.attachments) ? task.attachments.slice(0, 30) : [],
    prompt: String(task.prompt || ""),
    autoRun: Boolean(task.autoRun),
    autoOptions: task.autoOptions && typeof task.autoOptions === "object" ? task.autoOptions : {}
  };
  const script = `new Promise((resolve) => {
    const requestId = ${JSON.stringify(requestId)};
    const timeout = setTimeout(() => {
      window.removeEventListener("message", onResult);
      document.removeEventListener("tb-workbench-task-result", onResult);
      resolve({ ok: false, status: "timeout", requestId, error: "GPT 附件助手响应超时" });
    }, ${65 * 60 * 1000});
    function onResult(event) {
      let data = event?.data;
      if (event?.type === "tb-workbench-task-result") {
        try { data = JSON.parse(document.getElementById("tb-workbench-bridge-result")?.textContent || "{}"); }
        catch { data = {}; }
      }
      if (data?.source !== "tb-gpt-production-extension"
        || data?.type !== "tb-workbench-task-result" || data.requestId !== requestId) return;
      clearTimeout(timeout);
      window.removeEventListener("message", onResult);
      document.removeEventListener("tb-workbench-task-result", onResult);
      resolve({ ok: data.status === "success", ...data });
    }
    window.addEventListener("message", onResult);
    document.addEventListener("tb-workbench-task-result", onResult);
    let bridge = document.getElementById("tb-workbench-bridge-request");
    if (!bridge) {
      bridge = document.createElement("script");
      bridge.id = "tb-workbench-bridge-request";
      bridge.type = "application/json";
      document.documentElement.appendChild(bridge);
    }
    bridge.textContent = ${JSON.stringify(JSON.stringify(payload))};
    document.dispatchEvent(new Event("tb-workbench-upload"));
    window.postMessage(${JSON.stringify(payload)}, "*");
  })`;
  return view.webContents.executeJavaScript(script, true);
}

ipcMain.handle("desktop:pick-folder", async (_event, options = {}) => {
  const dialogOptions = {
    title: String(options.title || "选择文件夹"),
    defaultPath: String(options.defaultPath || "").trim() || undefined,
    buttonLabel: "选择",
    properties: ["openDirectory", "createDirectory", "promptToCreate"]
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  return result.canceled ? "" : String(result.filePaths?.[0] || "");
});

ipcMain.handle("desktop:gpt-status", async (_event, accountId = activeGptAccountId) => {
  const id = safeGptAccountId(accountId);
  const account = gptAccounts.get(id);
  const contents = account?.view && !account.view.webContents.isDestroyed() ? account.view.webContents : null;
  return {
    available: Boolean(WebContentsView),
    accountId: id,
    loaded: Boolean(contents),
    extensionLoaded: Boolean(account?.extensionInfo),
    extensionError: account?.extensionError || "",
    url: contents?.getURL() || GPT_URL,
    canGoBack: Boolean(contents?.canGoBack()),
    canGoForward: Boolean(contents?.canGoForward())
  };
});

ipcMain.handle("desktop:gpt-show", async (_event, input = {}) => {
  const accountId = safeGptAccountId(input.accountId || activeGptAccountId);
  activeGptAccountId = accountId;
  const account = await ensureGptAccount(accountId);
  const view = account.view;
  hideAllGptViews(accountId);
  view.setBounds(safeGptBounds(input.bounds || input));
  view.setVisible(true);
  return {
    ok: true,
    accountId,
    extensionLoaded: Boolean(account.extensionInfo),
    extensionError: account.extensionError,
    url: view.webContents.getURL(),
    canGoBack: view.webContents.canGoBack(),
    canGoForward: view.webContents.canGoForward()
  };
});

ipcMain.handle("desktop:gpt-hide", async () => {
  hideAllGptViews();
  return { ok: true };
});

ipcMain.handle("desktop:gpt-navigate", async (_event, input = {}) => {
  const accountId = safeGptAccountId(input.accountId || activeGptAccountId);
  const account = await ensureGptAccount(accountId);
  const contents = account.view.webContents;
  const action = String(input.action || "reload");
  if (action === "back" && contents.canGoBack()) contents.goBack();
  else if (action === "forward" && contents.canGoForward()) contents.goForward();
  else if (action === "home") await contents.loadURL(GPT_URL);
  else contents.reload();
  return {
    ok: true,
    accountId,
    url: contents.getURL(),
    canGoBack: contents.canGoBack(),
    canGoForward: contents.canGoForward()
  };
});

ipcMain.handle("desktop:gpt-send-task", async (_event, task = {}) => sendTaskToEmbeddedGpt(task));

ipcMain.handle("desktop:gpt-workflow-status", async (_event, accountId = activeGptAccountId) => {
  const account = gptAccounts.get(safeGptAccountId(accountId));
  const contents = account?.view?.webContents;
  if (!contents || contents.isDestroyed()) return null;
  return contents.executeJavaScript(`(() => {
    try { return JSON.parse(document.getElementById("tb-workbench-bridge-progress")?.textContent || "null"); }
    catch { return null; }
  })()`, true).catch(() => null);
});

if (!app.isPackaged || process.env.TB_DESKTOP_SMOKE === "1") {
  app.commandLine.appendSwitch("remote-debugging-port", String(process.env.TB_REMOTE_DEBUGGING_PORT || "9333"));
}

function appendDesktopLog(event, detail = "") {
  try {
    fs.mkdirSync(RUNTIME_ROOT, { recursive: true });
    const safeDetail = String(detail || "").replace(/[\r\n]+/g, " ").slice(0, 2000);
    fs.appendFileSync(DESKTOP_LOG_FILE, `${new Date().toISOString()}\t${event}\t${safeDetail}\n`, "utf8");
  } catch {
    // Diagnostics must never prevent the app from starting.
  }
}


function canReachServer() {
  return new Promise((resolve) => {
    const request = http.get(APP_URL, { timeout: 1200 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

async function ensureServer() {
  if (await canReachServer()) return;
  const serverFile = path.join(__dirname, "..", "server.js");
  const releaseRoot = app.isPackaged
    ? (process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.env.PORTABLE_EXECUTABLE_FILE || process.execPath))
    : path.resolve(__dirname, "..", "..", "releases");
  serverProcess = childProcess.spawn(process.execPath, [serverFile], {
    cwd: path.dirname(serverFile),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: APP_PORT,
      TEAMBUILDING_RELEASE_ROOT: releaseRoot
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  serverProcess.stdout?.on("data", (chunk) => appendDesktopLog("server", chunk));
  serverProcess.stderr?.on("data", (chunk) => appendDesktopLog("server-error", chunk));
  serverProcess.on("exit", (code, signal) => appendDesktopLog("server-exit", `code=${code} signal=${signal || ""}`));
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await canReachServer()) return;
  }
  throw new Error("本地工作台服务未能启动");
}

async function createWindow() {
  appendDesktopLog("desktop-start", `electron=${process.versions.electron} chrome=${process.versions.chrome}`);
  await ensureServer();
  const window = new BrowserWindow({
    width: 1520,
    height: 940,
    minWidth: 1120,
    minHeight: 700,
    title: "团建工作台",
    icon: path.join(__dirname, "团建工作台.ico"),
    show: false,
    backgroundColor: "#e7eee9",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      partition: `persist:teambuilding-workbench-${APP_VERSION.replace(/[^a-z0-9.-]/gi, "-")}`,
      preload: path.join(__dirname, "preload.js")
    }
  });
  mainWindow = window;
  window.on("closed", () => {
    for (const account of gptAccounts.values()) {
      if (account.view && !account.view.webContents.isDestroyed()) account.view.webContents.close();
    }
    gptAccounts.clear();
    mainWindow = null;
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.on("did-fail-load", (_event, code, description, validatedURL, isMainFrame) => {
    appendDesktopLog("shell-load-failed", `code=${code} main=${isMainFrame} url=${validatedURL} ${description}`);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    appendDesktopLog("shell-render-gone", `${details.reason} exitCode=${details.exitCode}`);
  });

  await window.webContents.session.clearCache();
  const versionedUrl = new URL(APP_URL);
  versionedUrl.searchParams.set("appVersion", APP_VERSION);
  await window.loadURL(versionedUrl.toString());
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(createWindow).catch((error) => {
    appendDesktopLog("startup-failed", error.stack || error.message);
    console.error(error);
    app.quit();
  });
}

app.on("window-all-closed", () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
