const { app, BrowserWindow, WebContentsView, dialog, ipcMain, session, Tray, Menu, Notification } = require("electron");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { version: APP_VERSION } = require("../package.json");

if (process.env.TB_USER_DATA_ROOT) {
  app.setPath("userData", path.resolve(process.env.TB_USER_DATA_ROOT));
}

const APP_PORT = String(process.env.PORT || "4327").trim() || "4327";
const APP_URL = `http://127.0.0.1:${APP_PORT}/`;
const RUNTIME_ROOT = process.env.TEAMBUILDING_DASHBOARD_RUNTIME || "D:\\AICode\\运行数据\\江湖有旅人\\图文生产控制台";
const DESKTOP_LOG_FILE = path.join(RUNTIME_ROOT, "desktop.log");
const GPT_LOGIN_RECOVERY_ROOT = path.join(RUNTIME_ROOT, "gpt-login-recovery");
const GPT_PENDING_BACKUP_FILE = path.join(GPT_LOGIN_RECOVERY_ROOT, "pending-backup.json");
const GPT_PENDING_RESTORE_FILE = path.join(GPT_LOGIN_RECOVERY_ROOT, "pending-restore.json");
let serverProcess = null;
let mainWindow = null;
let tray = null;
let isExplicitQuit = false;
let productionTaskActive = false;
const gptAccounts = new Map();
let activeGptAccountId = "account-1";

const GPT_PARTITION_PREFIX = "persist:teambuilding-gpt-production";
const WORKBENCH_PARTITION = "persist:teambuilding-workbench-0.12.2";
const GPT_URL = "https://chatgpt.com/";
const GPT_BROWSER_PROFILES_FILE = "gpt-browser-profiles.json";

function gptBrowserProfilesFile() {
  return path.join(app.getPath("userData"), GPT_BROWSER_PROFILES_FILE);
}

function defaultBrowserProfiles() {
  return {
    version: 1,
    activeId: "account-1",
    profiles: [{
      id: "account-1",
      name: "浏览器 1",
      quotaGroup: "account-1",
      hidden: false,
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString()
    }]
  };
}

function readBrowserProfiles() {
  try {
    const parsed = JSON.parse(fs.readFileSync(gptBrowserProfilesFile(), "utf8").replace(/^\uFEFF/, ""));
    const profiles = Array.isArray(parsed.profiles)
      ? parsed.profiles.filter((profile) => profile && safeGptAccountId(profile.id)).map((profile, index) => ({
        id: safeGptAccountId(profile.id),
        name: String(profile.name || `浏览器 ${index + 1}`).slice(0, 24),
        quotaGroup: safeGptAccountId(profile.quotaGroup || profile.id),
        hidden: Boolean(profile.hidden),
        createdAt: String(profile.createdAt || new Date().toISOString()),
        lastOpenedAt: String(profile.lastOpenedAt || "")
      })).slice(0, 8)
      : [];
    if (!profiles.length) return writeBrowserProfiles(defaultBrowserProfiles());
    return {
      version: 1,
      activeId: profiles.some((profile) => profile.id === parsed.activeId) ? parsed.activeId : profiles[0].id,
      profiles
    };
  } catch {
    return writeBrowserProfiles(defaultBrowserProfiles());
  }
}

function writeBrowserProfiles(value) {
  const file = gptBrowserProfilesFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
  return value;
}

function safeGptAccountId(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(0, 48) || "account-1";
}

function gptPartitionDirectory(accountId = activeGptAccountId) {
  const id = safeGptAccountId(accountId);
  return path.join(app.getPath("userData"), "Partitions", `teambuilding-gpt-production-${id}`);
}

function gptRecoveryDirectory(accountId = activeGptAccountId) {
  return path.join(GPT_LOGIN_RECOVERY_ROOT, safeGptAccountId(accountId), "profile");
}

function recoveryMetadataFile(accountId = activeGptAccountId) {
  return path.join(GPT_LOGIN_RECOVERY_ROOT, safeGptAccountId(accountId), "recovery.json");
}

function isInsideDirectory(parent, target) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function copyDirectorySnapshot(source, target) {
  if (!fs.existsSync(source)) throw new Error("当前账号还没有可备份的本机登录档案");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    if (!isInsideDirectory(GPT_LOGIN_RECOVERY_ROOT, target)) throw new Error("恢复点目录不安全");
    fs.rmSync(target, { recursive: true, force: true });
  }
  fs.cpSync(source, target, { recursive: true, force: true, errorOnExist: false });
}

async function releaseGptAccountView(accountId = activeGptAccountId) {
  const id = safeGptAccountId(accountId);
  const account = gptAccounts.get(id);
  if (!account) return;
  await account.session?.flushStorageData?.().catch(() => {});
  if (account.view && !account.view.webContents.isDestroyed()) {
    account.view.setVisible(false);
    try {
      mainWindow?.contentView.removeChildView(account.view);
    } catch {
      // The view may already have been detached.
    }
    account.view.webContents.close();
  }
  gptAccounts.delete(id);
}

function applyPendingGptLoginRestore() {
  if (!fs.existsSync(GPT_PENDING_RESTORE_FILE)) return;
  const pending = JSON.parse(fs.readFileSync(GPT_PENDING_RESTORE_FILE, "utf8").replace(/^\uFEFF/, ""));
  const accountId = safeGptAccountId(pending.accountId);
  const source = gptRecoveryDirectory(accountId);
  const target = gptPartitionDirectory(accountId);
  if (!isInsideDirectory(GPT_LOGIN_RECOVERY_ROOT, source)
    || !isInsideDirectory(path.join(app.getPath("userData"), "Partitions"), target)) {
    throw new Error("登录档案恢复路径不安全");
  }
  if (!fs.existsSync(source)) throw new Error("没有找到这个账号的本机恢复点");
  const rollback = path.join(GPT_LOGIN_RECOVERY_ROOT, accountId, `rollback-${Date.now()}`);
  if (fs.existsSync(target)) fs.cpSync(target, rollback, { recursive: true, force: true, errorOnExist: false });
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true, errorOnExist: false });
  fs.rmSync(GPT_PENDING_RESTORE_FILE, { force: true });
  appendDesktopLog("gpt-login-recovery-restored", accountId);
}

function applyPendingGptLoginBackup() {
  if (!fs.existsSync(GPT_PENDING_BACKUP_FILE)) return;
  const pending = JSON.parse(fs.readFileSync(GPT_PENDING_BACKUP_FILE, "utf8").replace(/^\uFEFF/, ""));
  const accountId = safeGptAccountId(pending.accountId);
  const source = gptPartitionDirectory(accountId);
  const target = gptRecoveryDirectory(accountId);
  if (!isInsideDirectory(path.join(app.getPath("userData"), "Partitions"), source)
    || !isInsideDirectory(GPT_LOGIN_RECOVERY_ROOT, target)) {
    throw new Error("登录档案备份路径不安全");
  }
  copyDirectorySnapshot(source, target);
  const metadata = {
    accountId,
    createdAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    machineOnly: true
  };
  fs.mkdirSync(path.dirname(recoveryMetadataFile(accountId)), { recursive: true });
  fs.writeFileSync(recoveryMetadataFile(accountId), JSON.stringify(metadata, null, 2), "utf8");
  fs.rmSync(GPT_PENDING_BACKUP_FILE, { force: true });
  appendDesktopLog("gpt-login-recovery-created", accountId);
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
  if (existing?.initializing) return existing.initializing;
  if (!mainWindow) throw new Error("工作台窗口尚未就绪");
  const account = {
    id,
    partition: `${GPT_PARTITION_PREFIX}-${id}`,
    session: session.fromPartition(`${GPT_PARTITION_PREFIX}-${id}`),
    view: null,
    extensionInfo: null,
    extensionError: "",
    lastUsedAt: Date.now(),
    initializing: null
  };
  gptAccounts.set(id, account);
  account.initializing = (async () => {
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
  })();
  try {
    return await account.initializing;
  } finally {
    account.initializing = null;
  }
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
  const account = gptAccounts.get(accountId);
  if (account) account.lastUsedAt = Date.now();
  const requestId = String(task.requestId || `workbench-${Date.now()}`);
  const payload = {
    source: "teambuilding-workbench",
    type: "tb-workbench-upload",
    requestId,
    name: String(task.name || "工作台素材"),
    materialPath: String(task.materialPath || ""),
    attachments: Array.isArray(task.attachments) ? task.attachments.slice(0, 30) : [],
    prompt: String(task.prompt || ""),
    taskType: String(task.taskType || "material"),
    templateId: String(task.templateId || ""),
    accountId,
    quotaAccountId: String(task.quotaAccountId || accountId),
    autoRun: Boolean(task.autoRun),
    autoOptions: task.autoOptions && typeof task.autoOptions === "object" ? task.autoOptions : {},
    retryOf: String(task.retryOf || ""),
    retryFromStage: String(task.retryFromStage || ""),
    retryFromPercent: Math.max(0, Math.min(100, Number(task.retryFromPercent || 0))),
    expectedImages: Math.max(0, Number(task.expectedImages || task.expectedImageCount || 0))
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

ipcMain.handle("desktop:gpt-profiles", async () => readBrowserProfiles());

ipcMain.handle("desktop:gpt-profile-save", async (_event, input = {}) => {
  const state = readBrowserProfiles();
  const id = safeGptAccountId(input.id);
  const existing = state.profiles.find((profile) => profile.id === id);
  const profile = {
    id,
    name: String(input.name || existing?.name || `浏览器 ${state.profiles.length + 1}`).trim().slice(0, 24),
    quotaGroup: safeGptAccountId(input.quotaGroup || existing?.quotaGroup || id),
    hidden: Boolean(input.hidden ?? existing?.hidden),
    createdAt: existing?.createdAt || new Date().toISOString(),
    lastOpenedAt: String(input.lastOpenedAt || existing?.lastOpenedAt || new Date().toISOString())
  };
  if (existing) Object.assign(existing, profile);
  else if (state.profiles.length < 8) state.profiles.push(profile);
  else throw new Error("最多保留 8 个浏览器档案");
  state.activeId = input.active === false ? state.activeId : id;
  writeBrowserProfiles(state);
  return state;
});

ipcMain.handle("desktop:gpt-profile-hide", async (_event, input = {}) => {
  const state = readBrowserProfiles();
  const id = safeGptAccountId(input.id);
  const profile = state.profiles.find((item) => item.id === id);
  if (!profile) throw new Error("没有找到浏览器档案");
  profile.hidden = Boolean(input.hidden);
  if (state.activeId === id && profile.hidden) {
    state.activeId = state.profiles.find((item) => !item.hidden)?.id || id;
  }
  writeBrowserProfiles(state);
  if (profile.hidden) hideAllGptViews();
  return state;
});

ipcMain.handle("desktop:gpt-profile-remove", async (_event, accountId = "") => {
  const state = readBrowserProfiles();
  const id = safeGptAccountId(accountId);
  if (state.profiles.length <= 1) throw new Error("至少保留一个浏览器档案");
  state.profiles = state.profiles.filter((profile) => profile.id !== id);
  if (state.activeId === id) state.activeId = state.profiles.find((profile) => !profile.hidden)?.id || state.profiles[0].id;
  writeBrowserProfiles(state);
  await releaseGptAccountView(id);
  return state;
});

ipcMain.handle("desktop:gpt-profile-delete-login", async (_event, accountId = "") => {
  const id = safeGptAccountId(accountId);
  await releaseGptAccountView(id);
  const profileSession = session.fromPartition(gptPartition(id));
  await profileSession.clearStorageData();
  return { ok: true, id };
});

ipcMain.handle("desktop:production-active", async (_event, active = false) => {
  productionTaskActive = Boolean(active);
  refreshTrayMenu();
  return { ok: true, active: productionTaskActive };
});

ipcMain.handle("desktop:notify", async (_event, input = {}) => {
  if (!Notification.isSupported()) return { ok: false };
  new Notification({
    title: String(input.title || "团建工作台"),
    body: String(input.body || "").slice(0, 300)
  }).show();
  return { ok: true };
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
  account.lastUsedAt = Date.now();
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

ipcMain.handle("desktop:gpt-release-idle", async (_event, input = {}) => {
  if (productionTaskActive) return { ok: true, released: [] };
  const idleMs = Math.max(5, Number(input.minutes || 30)) * 60 * 1000;
  const released = [];
  for (const [id, account] of [...gptAccounts]) {
    if (id === activeGptAccountId || Date.now() - Number(account.lastUsedAt || Date.now()) < idleMs) continue;
    await releaseGptAccountView(id);
    released.push(id);
  }
  return { ok: true, released };
});

ipcMain.handle("desktop:gpt-navigate", async (_event, input = {}) => {
  const accountId = safeGptAccountId(input.accountId || activeGptAccountId);
  const account = await ensureGptAccount(accountId);
  const contents = account.view.webContents;
  const action = String(input.action || "reload");
  if (action === "back" && contents.canGoBack()) contents.goBack();
  else if (action === "forward" && contents.canGoForward()) contents.goForward();
  else if (action === "home" || action === "new-chat") await contents.loadURL(GPT_URL);
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

ipcMain.handle("desktop:gpt-login-recovery-status", async (_event, accountId = activeGptAccountId) => {
  const id = safeGptAccountId(accountId);
  const metadataFile = recoveryMetadataFile(id);
  let metadata = null;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
  } catch {
    metadata = null;
  }
  return {
    ok: true,
    accountId: id,
    exists: fs.existsSync(gptRecoveryDirectory(id)),
    createdAt: metadata?.createdAt || "",
    machineOnly: true
  };
});

ipcMain.handle("desktop:gpt-login-recovery-create", async (_event, accountId = activeGptAccountId) => {
  const id = safeGptAccountId(accountId);
  const account = await ensureGptAccount(id);
  await account.session.flushStorageData();
  hideAllGptViews();
  await releaseGptAccountView(id);
  const request = {
    accountId: id,
    requestedAt: new Date().toISOString()
  };
  fs.mkdirSync(GPT_LOGIN_RECOVERY_ROOT, { recursive: true });
  fs.writeFileSync(GPT_PENDING_BACKUP_FILE, JSON.stringify(request, null, 2), "utf8");
  appendDesktopLog("gpt-login-recovery-scheduled", id);
  app.relaunch();
  app.exit(0);
  return { ok: true, restarting: true, ...request };
});

ipcMain.handle("desktop:gpt-login-recovery-restore", async (_event, accountId = activeGptAccountId) => {
  const id = safeGptAccountId(accountId);
  if (!fs.existsSync(gptRecoveryDirectory(id))) throw new Error("这个账号还没有本机 GPT 登录恢复点");
  await releaseGptAccountView(id);
  fs.mkdirSync(GPT_LOGIN_RECOVERY_ROOT, { recursive: true });
  fs.writeFileSync(GPT_PENDING_RESTORE_FILE, JSON.stringify({
    accountId: id,
    requestedAt: new Date().toISOString()
  }, null, 2), "utf8");
  appendDesktopLog("gpt-login-recovery-scheduled", id);
  app.relaunch();
  app.exit(0);
  return { ok: true, restarting: true };
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

function restoreMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function requestExplicitQuit() {
  if (productionTaskActive && mainWindow) {
    const result = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "自动生产仍在运行",
      message: "彻底退出会中断当前自动生产任务。",
      detail: "普通关闭窗口只会退到后台。确定仍要彻底退出吗？",
      buttons: ["留在后台", "彻底退出"],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    if (result.response !== 1) return;
  }
  isExplicitQuit = true;
  app.quit();
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开团建工作台", click: restoreMainWindow },
    {
      label: productionTaskActive ? "暂停自动生产" : "当前没有自动任务",
      enabled: productionTaskActive,
      click: () => mainWindow?.webContents.send("desktop:pause-production")
    },
    { type: "separator" },
    { label: "彻底退出", click: () => requestExplicitQuit() }
  ]));
  tray.setToolTip(productionTaskActive ? "团建工作台 · 自动生产中" : "团建工作台 · 后台运行");
}

function createTray() {
  if (tray) return tray;
  tray = new Tray(path.join(__dirname, "团建工作台.ico"));
  tray.on("click", restoreMainWindow);
  tray.on("double-click", restoreMainWindow);
  refreshTrayMenu();
  return tray;
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
      partition: WORKBENCH_PARTITION,
      preload: path.join(__dirname, "preload.js")
    }
  });
  mainWindow = window;
  window.on("minimize", () => hideAllGptViews());
  window.on("hide", () => hideAllGptViews());
  window.on("close", (event) => {
    if (isExplicitQuit) return;
    event.preventDefault();
    hideAllGptViews();
    window.hide();
    appendDesktopLog("desktop-background", productionTaskActive ? "production-active" : "idle");
    if (Notification.isSupported()) {
      new Notification({
        title: "团建工作台仍在后台运行",
        body: productionTaskActive ? "自动生产没有中断，可从右下角托盘重新打开。" : "可从右下角托盘重新打开或彻底退出。"
      }).show();
    }
  });
  window.on("closed", () => {
    for (const account of gptAccounts.values()) {
      if (account.view && !account.view.webContents.isDestroyed()) account.view.webContents.close();
    }
    gptAccounts.clear();
    mainWindow = null;
  });

  window.once("ready-to-show", () => {
    if (process.env.TB_DESKTOP_HIDDEN !== "1") window.show();
  });
  window.webContents.on("did-fail-load", (_event, code, description, validatedURL, isMainFrame) => {
    appendDesktopLog("shell-load-failed", `code=${code} main=${isMainFrame} url=${validatedURL} ${description}`);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    appendDesktopLog("shell-render-gone", `${details.reason} exitCode=${details.exitCode}`);
  });

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
  app.whenReady().then(() => {
    applyPendingGptLoginBackup();
    applyPendingGptLoginRestore();
    createTray();
    return createWindow();
  }).catch((error) => {
    appendDesktopLog("startup-failed", error.stack || error.message);
    console.error(error);
    app.quit();
  });
}

app.on("window-all-closed", () => {
  if (isExplicitQuit && serverProcess && !serverProcess.killed) serverProcess.kill();
});

app.on("before-quit", () => {
  isExplicitQuit = true;
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
