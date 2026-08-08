const { app, BrowserWindow, WebContentsView, dialog, ipcMain, session, Tray, Menu, Notification, screen } = require("electron");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { version: APP_VERSION } = require("../package.json");
const {
  classifyWorkbenchPortProbe,
  formatPortInUseMessage
} = require("../lib/workbench-port");

// Use the unified userData directory.  The environment variable is set by
// start.ps1, but if it is missing (e.g. launched via a shortcut that loses
// the variable), fall back to the canonical path so account profiles and
// login state are never silently lost.
const TB_USER_DATA_ROOT = process.env.TB_USER_DATA_ROOT
  || "D:\\AICode\\运行数据\\江湖有旅人\\团建工作台\\electron-userdata";
app.setPath("userData", path.resolve(TB_USER_DATA_ROOT));

const APP_PORT = String(process.env.PORT || "4327").trim() || "4327";
const APP_URL = `http://127.0.0.1:${APP_PORT}/`;
const RUNTIME_ROOT = process.env.TEAMBUILDING_DASHBOARD_RUNTIME || "D:\\AICode\\运行数据\\江湖有旅人\\团建工作台";
const DESKTOP_LOG_FILE = path.join(RUNTIME_ROOT, "desktop.log");
const GPT_LOGIN_RECOVERY_ROOT = path.join(RUNTIME_ROOT, "gpt-login-recovery");
const GPT_PENDING_BACKUP_FILE = path.join(GPT_LOGIN_RECOVERY_ROOT, "pending-backup.json");
const GPT_PENDING_RESTORE_FILE = path.join(GPT_LOGIN_RECOVERY_ROOT, "pending-restore.json");
let serverProcess = null;
let mainWindow = null;
let assistantOverlayWindow = null;
let assistantOverlayState = { message: "", visible: true, theme: "neo" };
let tray = null;
let isExplicitQuit = false;
let quitFlushStarted = false;
let quitFlushCompleted = false;
let productionTaskActive = false;
let gptThemeName = "neo";
const gptAccounts = new Map();
let activeGptAccountId = "account-1";

const GPT_PARTITION_PREFIX = "persist:teambuilding-gpt-production";
const WORKBENCH_PARTITION = "persist:teambuilding-workbench-0.12.2";
const GPT_URL = "https://chatgpt.com/";
const GPT_BROWSER_PROFILES_FILE = "gpt-browser-profiles.json";
const ASSISTANT_OVERLAY_POSITION_FILE = "assistant-overlay-position.json";
const ASSISTANT_OVERLAY_SIZE = { width: 420, height: 190 };
const ASSISTANT_OVERLAY_CAT_BOUNDS = {
  width: 96,
  height: 116,
  top: 37,
  leftWhenBubbleRight: 4,
  leftWhenBubbleLeft: 320
};

function assistantOverlayPositionFile() {
  return path.join(app.getPath("userData"), ASSISTANT_OVERLAY_POSITION_FILE);
}

function defaultAssistantOverlayBounds() {
  const parent = mainWindow?.getBounds() || { x: 0, y: 0, width: 1520, height: 940 };
  return { ...ASSISTANT_OVERLAY_SIZE, x: parent.x + parent.width - 438, y: parent.y + 54 };
}

function readAssistantOverlayBounds() {
  try {
    const parsed = JSON.parse(fs.readFileSync(assistantOverlayPositionFile(), "utf8"));
    if ([parsed.x, parsed.y].every(Number.isFinite)) return { ...defaultAssistantOverlayBounds(), x: parsed.x, y: parsed.y };
  } catch {}
  return defaultAssistantOverlayBounds();
}

function clampAssistantOverlayBounds(bounds) {
  const parent = mainWindow?.getBounds() || { x: 0, y: 0, width: 1520, height: 940 };
  const { width, height } = ASSISTANT_OVERLAY_SIZE;
  const workArea = screen.getDisplayMatching(parent)?.workArea || parent;
  const rawX = Number(bounds.x);
  const rawY = Number(bounds.y);
  const fallbackX = parent.x + parent.width - width - 18;
  const fallbackY = parent.y + 54;
  const requestedX = Number.isFinite(rawX) ? rawX : fallbackX;
  const dockSide = requestedX + width / 2 < workArea.x + workArea.width / 2 ? "right" : "left";
  const catLeft = dockSide === "right" ? ASSISTANT_OVERLAY_CAT_BOUNDS.leftWhenBubbleRight : ASSISTANT_OVERLAY_CAT_BOUNDS.leftWhenBubbleLeft;
  const catTop = ASSISTANT_OVERLAY_CAT_BOUNDS.top;
  const catWidth = ASSISTANT_OVERLAY_CAT_BOUNDS.width;
  const catHeight = ASSISTANT_OVERLAY_CAT_BOUNDS.height;
  return {
    width,
    height,
    x: Math.max(workArea.x - catLeft, Math.min(workArea.x + workArea.width - (catLeft + catWidth), requestedX)),
    y: Math.max(workArea.y - catTop, Math.min(workArea.y + workArea.height - (catTop + catHeight), Number.isFinite(rawY) ? rawY : fallbackY))
  };
}

function assistantOverlayDockSide(bounds) {
  const workArea = screen.getDisplayMatching(bounds)?.workArea || mainWindow?.getBounds() || { x: 0, width: 1520 };
  return bounds.x + bounds.width / 2 < workArea.x + workArea.width / 2 ? "right" : "left";
}

function sendAssistantOverlayState() {
  if (!assistantOverlayWindow || assistantOverlayWindow.isDestroyed()) return;
  assistantOverlayWindow.webContents.send("assistant-overlay:state", assistantOverlayState);
}

async function ensureAssistantOverlay() {
  if (!mainWindow || assistantOverlayWindow && !assistantOverlayWindow.isDestroyed()) return assistantOverlayWindow;
  const initialBounds = clampAssistantOverlayBounds(readAssistantOverlayBounds());
  assistantOverlayState = { ...assistantOverlayState, dockSide: assistantOverlayDockSide(initialBounds) };
  const overlay = new BrowserWindow({
    ...initialBounds,
    parent: mainWindow,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    show: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, "assistant-overlay-preload.js")
    }
  });
  assistantOverlayWindow = overlay;
  overlay.setMenuBarVisibility(false);
  // 透明区域点击穿透：初始忽略鼠标事件，只有鼠标进入小猫/气泡时才恢复
  overlay.setIgnoreMouseEvents(true, { forward: true });
  // WebContentsView is composited above the renderer DOM and therefore cannot
  // be ordered with CSS z-index.  Keep the native assistant as a child-level
  // floating window so it stays above the embedded GPT surface while the
  // workbench is visible.  It is still hidden together with the main window
  // (minimize/background/quit handlers below), so it does not become a global
  // desktop widget.
  overlay.setAlwaysOnTop(true, "floating", 1);
  overlay.on("close", (event) => {
    if (isExplicitQuit) return;
    event.preventDefault();
    overlay.hide();
  });
  overlay.on("closed", () => { assistantOverlayWindow = null; });
  await overlay.loadURL(`${APP_URL}assistant-overlay.html?appVersion=${encodeURIComponent(APP_VERSION)}`);
  sendAssistantOverlayState();
  if (mainWindow.isVisible()) overlay.showInactive();
  return overlay;
}

function durableRuntimeAppRoot() {
  return path.join(RUNTIME_ROOT, "runtime-builds", APP_VERSION, "app");
}

function isDevMode() {
  // app.isPackaged 在 Electron 43.x 中通过 execPath 是否为 electron.exe 来判断
  // 但当我们直接用 node_modules/electron/dist/electron.exe 运行 main.js 时仍然返回 true
  // 更可靠的方式：检查可执行文件名是否为 electron.exe
  return path.basename(process.execPath).toLowerCase() === "electron.exe";
}

function ensureDurableRuntimeResources() {
  if (isDevMode()) return path.resolve(__dirname, "..");
  const source = path.resolve(__dirname, "..");
  const target = durableRuntimeAppRoot();
  const manifestFile = path.join(target, "runtime-manifest.json");
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    if (manifest.version === APP_VERSION && fs.existsSync(path.join(target, "server.js"))) return target;
  } catch {
    // First launch or an interrupted older copy: refresh this version in place.
  }
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true, errorOnExist: false });
  fs.writeFileSync(manifestFile, JSON.stringify({ version: APP_VERSION, copiedAt: new Date().toISOString(), source }, null, 2), "utf8");
  appendDesktopLog("durable-runtime-ready", target);
  return target;
}

function runtimeAppRoot() {
  if (isDevMode()) return path.resolve(__dirname, "..");
  const durable = durableRuntimeAppRoot();
  return fs.existsSync(path.join(durable, "runtime-manifest.json")) ? durable : ensureDurableRuntimeResources();
}

function gptBrowserProfilesFile() {
  return path.join(app.getPath("userData"), GPT_BROWSER_PROFILES_FILE);
}

function defaultBrowserProfiles() {
  return {
    version: 1,
    activeId: "account-1",
    profiles: [{
      id: "account-1",
      name: "账号窗口 1",
      quotaGroup: "account-1",
      hidden: false,
      disabled: false,
      lastUrl: GPT_URL,
      lastBrowserUrl: GPT_URL,
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
        name: (/^浏览器\s*\d+$/i.test(String(profile.name || "")) ? `账号窗口 ${index + 1}` : String(profile.name || `账号窗口 ${index + 1}`)).slice(0, 24),
        quotaGroup: safeGptAccountId(profile.quotaGroup || profile.id),
        hidden: Boolean(profile.hidden),
        ...(Object.prototype.hasOwnProperty.call(profile, "disabled")
          ? { disabled: Boolean(profile.disabled) }
          : {}),
        lastUrl: safeGptUrl(profile.lastUrl),
        lastBrowserUrl: safeBrowserUrlOrDefault(profile.lastBrowserUrl || profile.lastUrl || GPT_URL),
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

function safeGptUrl(value = "") {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol !== "https:" || !["chatgpt.com", "www.chatgpt.com", "chat.openai.com"].includes(parsed.hostname)) return GPT_URL;
    if (/^\/(?:auth|login|logout)(?:\/|$)/i.test(parsed.pathname)) return GPT_URL;
    return parsed.href;
  } catch {
    return GPT_URL;
  }
}

// The embedded GPT surface is also a real browser tab.  Keep navigation
// limited to normal web URLs so an address pasted into the workbench cannot
// execute javascript, open local files, or jump into a privileged Electron
// scheme.  The persistent account partition is intentionally reused by the
// caller, so visiting another site does not create a second login session.
function safeBrowserUrl(value = "") {
  let raw = String(value || "").trim();
  if (!raw) throw new Error("请输入要访问的网址");
  if (!/^[a-z][a-z\d+.-]*:/i.test(raw)) {
    raw = /^(?:localhost|127(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2})(?::\d+)?(?:\/|$)/i.test(raw)
      ? `http://${raw}`
      : `https://${raw}`;
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("网址格式不正确，请输入 http:// 或 https:// 地址");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("只允许访问 http:// 或 https:// 网页");
  }
  if (parsed.username || parsed.password) {
    throw new Error("为保护账号安全，不允许在网址中携带用户名或密码");
  }
  return parsed.href;
}

function safeBrowserUrlOrDefault(value = "", fallback = GPT_URL) {
  try {
    return safeBrowserUrl(value || fallback);
  } catch {
    return fallback;
  }
}

function rememberGptUrl(accountId, value) {
  const nextUrl = safeGptUrl(value);
  if (nextUrl === GPT_URL && String(value || "").trim() !== GPT_URL) return;
  const state = readBrowserProfiles();
  const profile = state.profiles.find((item) => item.id === safeGptAccountId(accountId));
  if (!profile || profile.lastUrl === nextUrl) return;
  profile.lastUrl = nextUrl;
  profile.lastOpenedAt = new Date().toISOString();
  writeBrowserProfiles(state);
}

function rememberBrowserUrl(accountId, value) {
  const nextUrl = safeBrowserUrlOrDefault(value, "");
  if (!nextUrl) return;
  const state = readBrowserProfiles();
  const profile = state.profiles.find((item) => item.id === safeGptAccountId(accountId));
  if (!profile || profile.lastBrowserUrl === nextUrl) return;
  profile.lastBrowserUrl = nextUrl;
  if (/^https:\/\/(?:chatgpt\.com|chat\.openai\.com)(?:\/|$)/i.test(nextUrl)) {
    profile.lastUrl = safeGptUrl(nextUrl);
  }
  profile.lastOpenedAt = new Date().toISOString();
  writeBrowserProfiles(state);
  // Navigation can also happen inside the embedded browser itself (clicking a
  // conversation, a shared template, or an external page), without going
  // through the renderer's address-bar handler. Push the live URL back to the
  // workbench so the visible address bar follows the active account window.
  mainWindow?.webContents.send("desktop:gpt-url-changed", {
    accountId: safeGptAccountId(accountId),
    url: nextUrl
  });
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
  try {
    await Promise.resolve(account.session?.flushStorageData?.());
  } catch {
    // Releasing a view must continue even when Chromium cannot flush one store.
  }
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
  const bundled = path.join(runtimeAppRoot(), "integrations", "gpt-production-extension");
  const candidates = configured
    ? [configured, bundled]
    : [bundled];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "manifest.json"))) || candidates[0];
}

// --- Auto-reload GPT views when extension source files change ---
let extensionWatcher = null;
let extensionReloadTimer = null;
const activeGptTaskAccounts = new Set();
let extensionReloadPending = false;

function reloadAllGptViewsForExtensionChange() {
  if (activeGptTaskAccounts.size > 0) {
    extensionReloadPending = true;
    appendDesktopLog(
      "gpt-extension-auto-reload-deferred",
      `activeAccounts=${Array.from(activeGptTaskAccounts).join(",")}`
    );
    return;
  }
  extensionReloadPending = false;
  for (const [id, account] of gptAccounts) {
    if (!account.view || account.view.webContents.isDestroyed()) continue;
    if (!account.view.webContents.getURL?.().startsWith("https://")) continue;
    appendDesktopLog("gpt-extension-auto-reload", `account=${id} reason=extension-file-changed`);
    account.view.webContents.reload();
  }
}

function watchExtensionForChanges() {
  if (extensionWatcher) return;
  const extensionPath = resolveGptExtensionPath();
  if (!fs.existsSync(extensionPath)) return;
  try {
    extensionWatcher = fs.watch(extensionPath, { recursive: true }, (_eventType, filename) => {
      if (!filename || !/\.(?:js|json|css)$/i.test(filename)) return;
      // Debounce: wait 800ms after the last change before reloading,
      // so a multi-file save doesn't trigger multiple reloads.
      if (extensionReloadTimer) clearTimeout(extensionReloadTimer);
      extensionReloadTimer = setTimeout(() => {
        extensionReloadTimer = null;
        reloadAllGptViewsForExtensionChange();
      }, 800);
    });
    extensionWatcher.on("error", () => {
      // Watcher may fail if the directory is recreated; retry once.
      try { extensionWatcher?.close(); } catch {}
      extensionWatcher = null;
    });
    appendDesktopLog("gpt-extension-watcher-started", extensionPath);
  } catch (error) {
    appendDesktopLog("gpt-extension-watcher-failed", error.message);
  }
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
  await applyEmbeddedGptTheme(account, gptThemeName);
}

function embeddedGptPalette(theme = "neo") {
  const palettes = {
    neo: {
      dark: false, main: "#e9f0f6", sidebar: "#dce7f0", secondary: "#f4f7fa", tertiary: "#e2ebf2", composer: "#f7f9fb"
    },
    glass: {
      dark: false, main: "#edf4f8", sidebar: "#dfeaf1", secondary: "#f7fafc", tertiary: "#e5eef4", composer: "#f8fbfc"
    },
    midnight: {
      dark: true, main: "#0b1925", sidebar: "#07131e", secondary: "#142a3a", tertiary: "#1b3445", composer: "#173042"
    },
    "midnight-glass": {
      dark: true, main: "#091722", sidebar: "#06111b", secondary: "#12293a", tertiary: "#19364a", composer: "#163246"
    }
  };
  return palettes[theme] || palettes.neo;
}

async function applyEmbeddedGptTheme(account, theme = "neo") {
  const view = account?.view;
  if (!view || view.webContents.isDestroyed()) return false;
  const palette = embeddedGptPalette(theme);
  const isDark = palette.dark;
  view.setBackgroundColor(palette.main);
  return view.webContents.executeJavaScript(`(() => {
    const root = document.documentElement;
    const palette = ${JSON.stringify(palette)};
    root.dataset.tbWorkbenchTheme = ${JSON.stringify(theme)};
    root.dataset.tbWorkbenchColorScheme = ${JSON.stringify(isDark ? "dark" : "light")};
    const apply = () => {
      const dark = root.dataset.tbWorkbenchColorScheme === "dark";
      root.classList.toggle("dark", dark);
      root.style.colorScheme = dark ? "dark" : "light";
      document.body?.style.setProperty("background-color", palette.main, "important");
      document.body?.style.setProperty("color-scheme", dark ? "dark" : "light");
      const values = {
        "--main-surface-primary": palette.main,
        "--sidebar-surface-primary": palette.sidebar,
        "--sidebar-surface": palette.sidebar,
        "--bg-secondary-surface": palette.sidebar,
        "--main-surface-secondary": palette.secondary,
        "--main-surface-secondary-selected": palette.tertiary,
        "--main-surface-tertiary": palette.tertiary,
        "--main-surface-background": palette.secondary,
        "--composer-surface-primary": palette.composer,
        "--composer-surface": palette.composer
      };
      Object.entries(values).forEach(([name, value]) => root.style.setProperty(name, value));
    };
    window.__tbWorkbenchThemeObserver?.disconnect?.();
    window.__tbWorkbenchThemeObserver = new MutationObserver(() => queueMicrotask(apply));
    window.__tbWorkbenchThemeObserver.observe(root, { attributes: true, attributeFilter: ["class"] });
    apply();
    return root.dataset.tbWorkbenchColorScheme;
  })()`, true).then(() => true).catch((error) => {
    appendDesktopLog("gpt-theme-sync-failed", `${account.id} ${error.message}`);
    return false;
  });
}

function waitForExtensionReady(profileSession, extensionId, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      profileSession.off("extension-ready", onReady);
      resolve(Boolean(ready));
    };
    const onReady = (_event, extension) => {
      if (!extensionId || extension?.id === extensionId) finish(true);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    profileSession.on("extension-ready", onReady);
    const alreadyLoaded = profileSession.extensions?.getAllExtensions?.()
      ?.some((extension) => extension?.id === extensionId);
    if (alreadyLoaded) finish(true);
  });
}

async function readEmbeddedExtensionState(account, attempts = 12, intervalMs = 250) {
  const contents = account?.view?.webContents;
  if (!contents || contents.isDestroyed()) return { ready: false, version: "", source: "" };
  for (let index = 0; index < attempts; index += 1) {
    const state = await contents.executeJavaScript(`({
      ready: document.documentElement.dataset.tbGptProductionExtension === "ready" || Boolean(document.getElementById("tb-gpt-production-extension-marker")),
      version: document.documentElement.dataset.tbGptProductionExtensionVersion || document.getElementById("tb-gpt-production-extension-marker")?.content || "",
      source: document.documentElement.dataset.tbGptProductionExtensionSource || ""
    })`, true).catch(() => ({ ready: false, version: "", source: "" }));
    if (state.ready) return state;
    if (index + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { ready: false, version: "", source: "" };
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
    extensionPath: "",
    extensionRuntimeReady: false,
    extensionError: "",
    pageState: {
      loading: true,
      domReady: false,
      finished: false,
      extensionReady: false,
      error: "",
      startedAt: new Date().toISOString(),
      finishedAt: ""
    },
    lastUsedAt: Date.now(),
    initializing: null
  };
  gptAccounts.set(id, account);
  account.initializing = (async () => {
  const extensionPath = resolveGptExtensionPath();
  account.extensionPath = extensionPath;
  try {
    if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) throw new Error(`扩展目录不存在：${extensionPath}`);
    account.extensionInfo = await account.session.extensions.loadExtension(extensionPath, { allowFileAccess: true });
    account.extensionRuntimeReady = await waitForExtensionReady(account.session, account.extensionInfo.id);
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
      nodeIntegration: false,
      // Automatic production must continue while the workbench is minimized
      // to the tray. Chromium otherwise heavily throttles or suspends timers
      // in this hidden WebContentsView and the workflow appears stuck after 1.
      backgroundThrottling: false
    }
  });
  const currentUserAgent = account.view.webContents.getUserAgent();
  account.view.webContents.setUserAgent(`${currentUserAgent} TeambuildingWorkbenchGPT/0.2`);
  account.view.setBackgroundColor(embeddedGptPalette(gptThemeName).main);
  account.view.setBorderRadius(16);
  mainWindow.contentView.addChildView(account.view);
  account.view.setVisible(false);
  account.view.webContents.on("did-start-loading", () => {
    Object.assign(account.pageState, { loading: true, domReady: false, finished: false, extensionReady: false, error: "", startedAt: new Date().toISOString(), finishedAt: "" });
  });
  account.view.webContents.on("dom-ready", () => {
    account.pageState.domReady = true;
  });
  account.view.webContents.on("did-finish-load", async () => {
    Object.assign(account.pageState, { loading: false, domReady: true, finished: true, finishedAt: new Date().toISOString() });
    await initializeEmbeddedGptPage(account);
    const embeddedExtension = await readEmbeddedExtensionState(account);
    account.pageState.extensionReady = embeddedExtension.ready;
    account.pageState.extensionVersion = embeddedExtension.version;
    account.pageState.extensionSource = embeddedExtension.source;
    if (!embeddedExtension.ready) {
      account.pageState.error = "生产扩展未注入，已停止自动生产；可刷新网页重试";
      appendDesktopLog("gpt-extension-not-injected", `account=${id} path=${account.extensionPath}`);
    }
  });
  account.view.webContents.on("did-navigate", (_event, url) => rememberBrowserUrl(id, url));
  account.view.webContents.on("did-navigate-in-page", (_event, url) => rememberBrowserUrl(id, url));
  account.view.webContents.on("did-fail-load", (_event, code, description, validatedURL, isMainFrame) => {
    if (isMainFrame) Object.assign(account.pageState, { loading: false, finished: false, error: `${code}: ${description}` });
    appendDesktopLog("gpt-load-failed", `account=${id} code=${code} main=${isMainFrame} url=${validatedURL} ${description}`);
  });
  const savedProfile = readBrowserProfiles().profiles.find((profile) => profile.id === id);
  await account.view.webContents.loadURL(safeBrowserUrlOrDefault(savedProfile?.lastBrowserUrl || savedProfile?.lastUrl || GPT_URL));
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

function waitForGptPageLoad(contents, timeoutMs = 120000) {
  if (!contents || contents.isDestroyed()) return Promise.resolve({ ok: false, error: "GPT 网页视图不可用" });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      contents.removeListener("did-finish-load", onFinish);
      contents.removeListener("did-fail-load", onFail);
      resolve(result);
    };
    const onFinish = () => finish({ ok: true, url: contents.getURL() });
    const onFail = (_event, code, description, validatedURL, isMainFrame) => {
      if (isMainFrame) finish({ ok: false, error: `${code}: ${description}`, url: validatedURL });
    };
    const timer = setTimeout(() => finish({ ok: false, error: "GPT 网页刷新超时", url: contents.getURL() }), Math.max(5000, timeoutMs));
    contents.once("did-finish-load", onFinish);
    contents.on("did-fail-load", onFail);
  });
}

async function refreshGptAccountSession(accountId = activeGptAccountId, options = {}) {
  const id = safeGptAccountId(accountId);
  const account = await ensureGptAccount(id);
  const contents = account?.view?.webContents;
  if (!contents || contents.isDestroyed()) return { ok: false, accountId: id, error: "GPT 网页视图不可用" };
  if (account.maintenancePromise) return account.maintenancePromise;
  const clearTemporaryCache = Boolean(options.clearTemporaryCache || options.clearCache);
  const reason = String(options.reason || (clearTemporaryCache ? "3h-temporary-cache" : "production-complete")).slice(0, 80);
  account.maintenancePromise = (async () => {
    let cacheError = "";
    if (clearTemporaryCache) {
      try {
        // Safe maintenance boundary: clear Chromium's HTTP/media cache only.
        // Never call clearStorageData here; cookies, localStorage and the
        // account partition contain the user's GPT/Google login state.
        await account.session.clearCache();
      } catch (error) {
        cacheError = String(error?.message || error);
        appendDesktopLog("gpt-cache-clear-failed", `account=${id} reason=${reason} ${cacheError}`);
      }
    }
    const load = waitForGptPageLoad(contents);
    if (clearTemporaryCache && typeof contents.reloadIgnoringCache === "function") contents.reloadIgnoringCache();
    else contents.reload();
    const result = await load;
    Object.assign(account.pageState, {
      loading: !result.ok,
      domReady: result.ok,
      finished: result.ok,
      error: result.ok ? "" : String(result.error || "GPT 网页刷新失败")
    });
    appendDesktopLog("gpt-page-maintenance", `account=${id} reason=${reason} cacheCleared=${clearTemporaryCache} ok=${result.ok}${cacheError ? ` cacheError=${cacheError}` : ""}`);
    return {
      ok: Boolean(result.ok),
      accountId: id,
      url: result.url || contents.getURL(),
      cacheCleared: clearTemporaryCache && !cacheError,
      cacheError,
      error: result.ok ? "" : String(result.error || "GPT 网页刷新失败")
    };
  })().finally(() => {
    account.maintenancePromise = null;
  });
  return account.maintenancePromise;
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
    reconcileAction: String(task.reconcileAction || ""),
    forceUpload: Boolean(task.forceUpload),
    resumePlanSubmitted: Boolean(task.workflow?.planSubmitted),
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
  activeGptTaskAccounts.add(accountId);
  try {
    return await view.webContents.executeJavaScript(script, true);
  } finally {
    activeGptTaskAccounts.delete(accountId);
    if (activeGptTaskAccounts.size === 0 && extensionReloadPending) {
      if (extensionReloadTimer) clearTimeout(extensionReloadTimer);
      extensionReloadTimer = setTimeout(() => {
        extensionReloadTimer = null;
        reloadAllGptViewsForExtensionChange();
      }, 1000);
    }
  }
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
  // Keep the browser's live address separate from the last ChatGPT
  // conversation URL. Renderer-side profile saves often only update the
  // label or quota group; they must never reset an external page to GPT.
  const lastBrowserUrl = safeBrowserUrlOrDefault(
    input.lastBrowserUrl || existing?.lastBrowserUrl || input.lastUrl || existing?.lastUrl || GPT_URL,
    GPT_URL
  );
  const profile = {
    id,
    name: String(input.name || existing?.name || `账号窗口 ${state.profiles.length + 1}`).trim().slice(0, 24),
    quotaGroup: safeGptAccountId(input.quotaGroup || existing?.quotaGroup || id),
    hidden: Boolean(input.hidden ?? existing?.hidden),
    disabled: Boolean(input.disabled ?? existing?.disabled),
    lastUrl: safeGptUrl(input.lastUrl || existing?.lastUrl),
    lastBrowserUrl,
    createdAt: existing?.createdAt || new Date().toISOString(),
    lastOpenedAt: String(input.lastOpenedAt || existing?.lastOpenedAt || new Date().toISOString())
  };
  if (existing) Object.assign(existing, profile);
  else if (state.profiles.length < 8) state.profiles.push(profile);
  else throw new Error("最多保留 8 个账号窗口档案");
  state.activeId = input.active === false ? state.activeId : id;
  writeBrowserProfiles(state);
  return state;
});

ipcMain.handle("desktop:gpt-profile-reorder", async (_event, accountIds = []) => {
  const state = readBrowserProfiles();
  const requested = Array.isArray(accountIds)
    ? accountIds.map(safeGptAccountId).filter(Boolean)
    : [];
  const byId = new Map(state.profiles.map((profile) => [profile.id, profile]));
  const ordered = requested.map((id) => byId.get(id)).filter(Boolean);
  const seen = new Set(ordered.map((profile) => profile.id));
  ordered.push(...state.profiles.filter((profile) => !seen.has(profile.id)));
  state.profiles = ordered;
  writeBrowserProfiles(state);
  return state;
});

ipcMain.handle("desktop:gpt-profile-hide", async (_event, input = {}) => {
  const state = readBrowserProfiles();
  const id = safeGptAccountId(input.id);
  const profile = state.profiles.find((item) => item.id === id);
  if (!profile) throw new Error("没有找到账号窗口档案");
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
  if (state.profiles.length <= 1) throw new Error("至少保留一个账号窗口档案");
  state.profiles = state.profiles.filter((profile) => profile.id !== id);
  if (state.activeId === id) state.activeId = state.profiles.find((profile) => !profile.hidden)?.id || state.profiles[0].id;
  writeBrowserProfiles(state);
  await releaseGptAccountView(id);
  return state;
});

ipcMain.handle("desktop:gpt-profile-delete-login", async (_event, accountId = "") => {
  const id = safeGptAccountId(accountId);
  await releaseGptAccountView(id);
  const profileSession = session.fromPartition(`${GPT_PARTITION_PREFIX}-${id}`);
  await profileSession.clearStorageData();
  return { ok: true, id };
});

ipcMain.handle("desktop:production-active", async (_event, active = false) => {
  productionTaskActive = Boolean(active);
  refreshTrayMenu();
  return { ok: true, active: productionTaskActive };
});

function launchAtLoginOptions(openAtLogin) {
  if (app.isPackaged) return { openAtLogin: Boolean(openAtLogin) };
  return {
    openAtLogin: Boolean(openAtLogin),
    path: process.execPath,
    args: [path.resolve(__dirname, "..")]
  };
}

ipcMain.handle("desktop:launch-at-login-get", async () => {
  if (process.platform !== "win32") return { supported: false, enabled: false };
  const options = launchAtLoginOptions(true);
  const state = app.getLoginItemSettings({ path: options.path, args: options.args });
  return { supported: true, enabled: Boolean(state.openAtLogin) };
});

ipcMain.handle("desktop:launch-at-login-set", async (_event, enabled = false) => {
  if (process.platform !== "win32") return { supported: false, enabled: false };
  app.setLoginItemSettings(launchAtLoginOptions(enabled));
  const state = app.getLoginItemSettings(launchAtLoginOptions(enabled));
  appendDesktopLog("launch-at-login", `enabled=${Boolean(state.openAtLogin)}`);
  return { supported: true, enabled: Boolean(state.openAtLogin) };
});

ipcMain.handle("desktop:notify", async (_event, input = {}) => {
  if (!Notification.isSupported()) return { ok: false };
  new Notification({
    title: String(input.title || "团建工作台"),
    body: String(input.body || "").slice(0, 300)
  }).show();
  return { ok: true };
});

ipcMain.handle("desktop:assistant-update", async (_event, input = {}) => {
  assistantOverlayState = {
    ...assistantOverlayState,
    message: String(input.message || assistantOverlayState.message || ""),
    visible: input.visible !== false
  };
  const overlay = await ensureAssistantOverlay();
  sendAssistantOverlayState();
  if (assistantOverlayState.visible && mainWindow?.isVisible()) overlay.showInactive();
  else overlay.hide();
  return { ok: true };
});

ipcMain.on("assistant-overlay:action", (_event, input = {}) => {
  mainWindow?.webContents.send("desktop:assistant-action", input);
});

ipcMain.on("assistant-overlay:move", (_event, input = {}) => {
  if (!assistantOverlayWindow || assistantOverlayWindow.isDestroyed()) return;
  const [x, y] = assistantOverlayWindow.getPosition();
  const next = clampAssistantOverlayBounds({ x: x + Number(input.dx || 0), y: y + Number(input.dy || 0) });
  assistantOverlayWindow.setBounds(next, false);
  assistantOverlayState = { ...assistantOverlayState, dockSide: assistantOverlayDockSide(next) };
  sendAssistantOverlayState();
  fs.writeFileSync(assistantOverlayPositionFile(), JSON.stringify({ x: next.x, y: next.y }, null, 2), "utf8");
});

ipcMain.on("assistant-overlay:set-mouse-events", (_event, input = {}) => {
  if (!assistantOverlayWindow || assistantOverlayWindow.isDestroyed()) return;
  if (input.ignore) {
    assistantOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    assistantOverlayWindow.setIgnoreMouseEvents(false);
  }
});

ipcMain.handle("desktop:gpt-status", async (_event, accountId = activeGptAccountId) => {
  const id = safeGptAccountId(accountId);
  const account = gptAccounts.get(id);
  const contents = account?.view && !account.view.webContents.isDestroyed() ? account.view.webContents : null;
  const liveState = contents ? await contents.executeJavaScript(`(() => {
    const url = String(location.href || "");
    const bodyText = String(document.body?.innerText || "").slice(0, 8000).toLowerCase();
    const composerReady = Boolean(document.querySelector('#prompt-textarea, textarea[data-id="root"], [contenteditable="true"]'));
    const authenticationSignal = ["one-time code", "one time code", "verification code", "verify your identity", "check your email", "sign in", "log in", "\u4e00\u6b21\u6027\u9a8c\u8bc1\u7801", "\u9a8c\u8bc1\u7801", "\u68c0\u67e5\u90ae\u7bb1", "\u767b\u5f55"]
      .some((signal) => bodyText.includes(signal));
    let parsedUrl = null;
    try { parsedUrl = new URL(url); } catch (_) { parsedUrl = null; }
    const pathname = String(parsedUrl?.pathname || "");
    const authenticationUrl = parsedUrl?.hostname === "auth.openai.com"
      || pathname.startsWith("/auth/login")
      || pathname.startsWith("/auth/signup")
      || pathname.startsWith("/api/auth/signin");
    const chatConversation = (parsedUrl?.hostname === "chatgpt.com" || parsedUrl?.hostname === "www.chatgpt.com")
      && (pathname === "/" || pathname.startsWith("/c/"));
    const conversationState = typeof globalThis.TeambuildingGptConversationStateSnapshot === "function"
      ? globalThis.TeambuildingGptConversationStateSnapshot()
      : null;
    return {
      readyState: document.readyState,
      extensionReady: document.documentElement.dataset.tbGptProductionExtension === "ready" || Boolean(document.getElementById("tb-gpt-production-extension-marker")),
      extensionVersion: document.documentElement.dataset.tbGptProductionExtensionVersion || document.getElementById("tb-gpt-production-extension-marker")?.content || "",
      extensionSource: document.documentElement.dataset.tbGptProductionExtensionSource || "",
      composerReady,
      authenticationRequired: authenticationUrl || (!composerReady && authenticationSignal),
      chatConversation,
      conversationState
    };
  })()`, true).catch(() => ({ readyState: "", extensionReady: false, extensionVersion: "", extensionSource: "", composerReady: false, authenticationRequired: false, chatConversation: false, conversationState: null })) : null;
  if (account?.pageState && liveState) {
    account.pageState.domReady = ["interactive", "complete"].includes(liveState.readyState);
    account.pageState.extensionReady = Boolean(liveState.extensionReady);
  }
  return {
    available: Boolean(WebContentsView),
    accountId: id,
    loaded: Boolean(contents),
    ready: Boolean(contents && account?.pageState?.domReady && liveState?.extensionReady),
    productionReady: Boolean(contents && account?.pageState?.domReady && liveState?.extensionReady && liveState?.composerReady && liveState?.chatConversation && !liveState?.authenticationRequired),
    domReady: Boolean(account?.pageState?.domReady),
    extensionReady: Boolean(liveState?.extensionReady),
    composerReady: Boolean(liveState?.composerReady),
    authenticationRequired: Boolean(liveState?.authenticationRequired),
    chatConversation: Boolean(liveState?.chatConversation),
    conversationState: liveState?.conversationState || null,
    pageState: account?.pageState || null,
    extensionLoaded: Boolean(account?.extensionInfo),
    extensionRuntimeReady: Boolean(account?.extensionRuntimeReady),
    extensionInfo: account?.extensionInfo ? {
      id: account.extensionInfo.id,
      name: account.extensionInfo.name,
      version: account.extensionInfo.version,
      path: account.extensionPath
    } : null,
    extensionVersion: liveState?.extensionVersion || "",
    extensionSource: liveState?.extensionSource || "",
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
  view.setBorderRadius(16);
  view.setVisible(true);
  const liveReady = await view.webContents.executeJavaScript(`({
    readyState: document.readyState,
    extensionReady: document.documentElement.dataset.tbGptProductionExtension === "ready" || Boolean(document.getElementById("tb-gpt-production-extension-marker")),
    extensionVersion: document.documentElement.dataset.tbGptProductionExtensionVersion || document.getElementById("tb-gpt-production-extension-marker")?.content || "",
    extensionSource: document.documentElement.dataset.tbGptProductionExtensionSource || "",
    composerReady: Boolean(document.querySelector('#prompt-textarea, textarea[data-id="root"], [contenteditable="true"]'))
  })`, true).catch(() => ({ readyState: "", extensionReady: false, extensionVersion: "", extensionSource: "", composerReady: false }));
  return {
    ok: true,
    accountId,
    extensionLoaded: Boolean(account.extensionInfo),
    extensionRuntimeReady: Boolean(account.extensionRuntimeReady),
    extensionInfo: account.extensionInfo ? {
      id: account.extensionInfo.id,
      name: account.extensionInfo.name,
      version: account.extensionInfo.version,
      path: account.extensionPath
    } : null,
    extensionVersion: liveReady.extensionVersion || "",
    extensionSource: liveReady.extensionSource || "",
    extensionError: account.extensionError,
    ready: ["interactive", "complete"].includes(liveReady.readyState) && Boolean(liveReady.extensionReady),
    domReady: ["interactive", "complete"].includes(liveReady.readyState),
    extensionReady: Boolean(liveReady.extensionReady),
    composerReady: Boolean(liveReady.composerReady),
    url: view.webContents.getURL(),
    canGoBack: view.webContents.canGoBack(),
    canGoForward: view.webContents.canGoForward(),
    isChatGpt: /^https:\/\/(?:chatgpt\.com|chat\.openai\.com)(?:\/|$)/i.test(view.webContents.getURL() || "")
  };
});

ipcMain.handle("desktop:gpt-hide", async () => {
  hideAllGptViews();
  return { ok: true };
});

ipcMain.handle("desktop:gpt-theme", async (_event, input = {}) => {
  gptThemeName = ["neo", "glass", "midnight", "midnight-glass"].includes(input.theme) ? input.theme : "neo";
  assistantOverlayState = { ...assistantOverlayState, theme: gptThemeName };
  sendAssistantOverlayState();
  const results = await Promise.all([...gptAccounts.values()].map((account) => applyEmbeddedGptTheme(account, gptThemeName)));
  return { ok: true, theme: gptThemeName, dark: embeddedGptPalette(gptThemeName).dark, updated: results.filter(Boolean).length };
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

ipcMain.handle("desktop:gpt-maintenance", async (_event, input = {}) => {
  const accountId = safeGptAccountId(input.accountId || activeGptAccountId);
  return refreshGptAccountSession(accountId, {
    clearTemporaryCache: Boolean(input.clearTemporaryCache || input.clearCache),
    reason: input.reason
  });
});

ipcMain.handle("desktop:gpt-navigate", async (_event, input = {}) => {
  const accountId = safeGptAccountId(input.accountId || activeGptAccountId);
  const account = await ensureGptAccount(accountId);
  const contents = account.view.webContents;
  const action = String(input.action || "reload");
  if (action === "back" && contents.canGoBack()) contents.goBack();
  else if (action === "forward" && contents.canGoForward()) contents.goForward();
  else if (action === "url") {
    const targetUrl = safeBrowserUrl(input.targetUrl);
    await contents.loadURL(targetUrl);
  }
  else if (action === "home" || action === "new-chat") await contents.loadURL(GPT_URL);
  else contents.reload();
  return {
    ok: true,
    accountId,
    url: contents.getURL(),
    canGoBack: contents.canGoBack(),
    canGoForward: contents.canGoForward(),
    isChatGpt: /^https:\/\/(?:chatgpt\.com|chat\.openai\.com)(?:\/|$)/i.test(contents.getURL() || "")
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

ipcMain.handle("desktop:gpt-inspect-status", async (_event, accountId = activeGptAccountId) => {
  const account = gptAccounts.get(safeGptAccountId(accountId));
  const contents = account?.view?.webContents;
  if (!contents || contents.isDestroyed()) return null;
  const requestId = `inspect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return contents.executeJavaScript(`new Promise((resolve) => {
    const requestId = ${JSON.stringify(requestId)};
    const timeout = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(null);
    }, 5000);
    function onMessage(event) {
      const data = event?.data;
      if (data?.source !== "tb-gpt-production-extension"
        || data?.type !== "tb-workbench-inspect-result"
        || data.requestId !== requestId) return;
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(data);
    }
    window.addEventListener("message", onMessage);
    window.postMessage({
      source: "teambuilding-workbench",
      type: "tb-workbench-inspect-request",
      requestId
    }, "*");
  })`, true).catch(() => null);
});

ipcMain.handle("desktop:gpt-patrol-discover", async (_event, input = {}) => {
  const account = await ensureGptAccount(safeGptAccountId(input.accountId || activeGptAccountId));
  const contents = account?.view?.webContents;
  if (!contents || contents.isDestroyed()) return null;
  const readyDeadline = Date.now() + 20_000;
  while (Date.now() < readyDeadline) {
    const ready = await contents.executeJavaScript("document.documentElement.dataset.tbGptProductionExtension === 'ready'", true).catch(() => false);
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const requestId = `patrol-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = {
    source: "teambuilding-workbench",
    type: "tb-workbench-patrol-discover-request",
    requestId,
    allowlist: Array.isArray(input.allowlist) ? input.allowlist.map(String) : [],
    maximumScrolls: Math.max(0, Math.min(40, Number(input.maximumScrolls || 16)))
  };
  return contents.executeJavaScript(`new Promise((resolve) => {
    const request = ${JSON.stringify(payload)};
    const timeout = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(null);
    }, 30000);
    function onMessage(event) {
      const data = event?.data;
      if (data?.source !== "tb-gpt-production-extension"
        || data?.type !== "tb-workbench-patrol-discover-result"
        || data.requestId !== request.requestId) return;
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(data);
    }
    window.addEventListener("message", onMessage);
    window.postMessage(request, "*");
  })`, true).catch(() => null);
});

// --- Diagnostic: returns full GPT page state for troubleshooting ---
ipcMain.handle("desktop:gpt-diagnostic", async (_event, accountId = activeGptAccountId) => {
  const id = safeGptAccountId(accountId);
  const account = gptAccounts.get(id);
  const contents = account?.view && !account.view.webContents.isDestroyed() ? account.view.webContents : null;
  if (!contents) {
    return {
      ok: true,
      accountId: id,
      timestamp: new Date().toISOString(),
      hasView: false,
      extensionLoaded: Boolean(account?.extensionInfo),
      extensionRuntimeReady: Boolean(account?.extensionRuntimeReady),
      extensionInfo: account?.extensionInfo ? {
        id: account.extensionInfo.id,
        name: account.extensionInfo.name,
        version: account.extensionInfo.version,
        path: account.extensionPath
      } : null,
      extensionError: account?.extensionError || "",
      pageState: account?.pageState || null,
      url: GPT_URL,
      liveState: null,
      productionReady: false,
      notReadyReasons: ["GPT 窗口尚未创建"]
    };
  }
  const liveState = await contents.executeJavaScript(`(() => {
    const url = String(location.href || "");
    const bodyText = String(document.body?.innerText || "").slice(0, 8000).toLowerCase();
    const readyState = document.readyState;
    const composerReady = Boolean(document.querySelector('#prompt-textarea, textarea[data-id="root"], [contenteditable="true"]'));
    const authenticationSignal = ["one-time code", "one time code", "verification code", "verify your identity", "check your email", "sign in", "log in", "\u4e00\u6b21\u6027\u9a8c\u8bc1\u7801", "\u9a8c\u8bc1\u7801", "\u68c0\u67e5\u90ae\u7bb1", "\u767b\u5f55"]
      .some((signal) => bodyText.includes(signal));
    let parsedUrl = null;
    try { parsedUrl = new URL(url); } catch (_) { parsedUrl = null; }
    const pathname = String(parsedUrl?.pathname || "");
    const authenticationUrl = parsedUrl?.hostname === "auth.openai.com"
      || pathname.startsWith("/auth/login")
      || pathname.startsWith("/auth/signup")
      || pathname.startsWith("/api/auth/signin");
    const chatConversation = (parsedUrl?.hostname === "chatgpt.com" || parsedUrl?.hostname === "www.chatgpt.com")
      && (pathname === "/" || pathname.startsWith("/c/"));
    const extensionReady = document.documentElement.dataset.tbGptProductionExtension === "ready" || Boolean(document.getElementById("tb-gpt-production-extension-marker"));
    const extensionVersion = document.documentElement.dataset.tbGptProductionExtensionVersion || document.getElementById("tb-gpt-production-extension-marker")?.content || "";
    const extensionSource = document.documentElement.dataset.tbGptProductionExtensionSource || "";
    const sidebarVisible = Boolean(document.querySelector("#tb-gpt-production-sidebar, .tb-gpt-sidebar"));
    const bodySnippet = bodyText.slice(0, 500);
    return {
      url,
      readyState,
      extensionReady,
      extensionVersion,
      extensionSource,
      composerReady,
      authenticationRequired: authenticationUrl || (!composerReady && authenticationSignal),
      chatConversation,
      sidebarVisible,
      bodySnippet,
      hostname: parsedUrl?.hostname || "",
      pathname
    };
  })()`, true).catch((error) => ({
    url: contents?.getURL() || GPT_URL,
    readyState: "",
    extensionReady: false,
    extensionVersion: "",
    extensionSource: "",
    composerReady: false,
    authenticationRequired: false,
    chatConversation: false,
    sidebarVisible: false,
    bodySnippet: "",
    hostname: "",
    pathname: "",
    error: String(error?.message || error)
  }));
  if (account?.pageState && liveState) {
    account.pageState.domReady = ["interactive", "complete"].includes(liveState.readyState);
    account.pageState.extensionReady = Boolean(liveState.extensionReady);
  }
  const notReadyReasons = [];
  if (!account?.pageState?.domReady) notReadyReasons.push("DOM 未加载完成");
  if (!liveState?.extensionReady) notReadyReasons.push("扩展未注入页面");
  if (!liveState?.composerReady) notReadyReasons.push("ChatGPT 输入框未找到");
  if (!liveState?.chatConversation) notReadyReasons.push(`URL 不是对话页: ${liveState?.hostname}${liveState?.pathname}`);
  if (liveState?.authenticationRequired) notReadyReasons.push("需要登录或验证码");
  const productionReady = Boolean(contents && account?.pageState?.domReady && liveState?.extensionReady && liveState?.composerReady && liveState?.chatConversation && !liveState?.authenticationRequired);
  return {
    ok: true,
    accountId: id,
    timestamp: new Date().toISOString(),
    hasView: true,
    extensionLoaded: Boolean(account?.extensionInfo),
    extensionRuntimeReady: Boolean(account?.extensionRuntimeReady),
    extensionInfo: account?.extensionInfo ? {
      id: account.extensionInfo.id,
      name: account.extensionInfo.name,
      version: account.extensionInfo.version,
      path: account.extensionPath
    } : null,
    extensionError: account?.extensionError || "",
    pageState: account?.pageState || null,
    url: contents?.getURL() || GPT_URL,
    liveState,
    productionReady,
    notReadyReasons
  };
});

ipcMain.handle("desktop:gpt-manual-action", async (_event, input = {}) => {
  const accountId = safeGptAccountId(input.accountId || activeGptAccountId);
  const account = await ensureGptAccount(accountId);
  const action = String(input.action || "download").replace(/[^a-z-]/g, "").slice(0, 32) || "download";
  const contents = account?.view?.webContents;
  if (!contents || contents.isDestroyed()) return { ok: false, error: "GPT 网页尚未就绪" };
  const requestId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const script = `new Promise((resolve) => {
    const requestId = ${JSON.stringify(requestId)};
    const timeout = setTimeout(() => {
      document.removeEventListener("tb-workbench-manual-action-result", onResult);
      resolve({ ok: false, error: "网页手动操作超时" });
    }, ${15 * 60 * 1000});
    function onResult() {
      let result = null;
      try { result = JSON.parse(document.getElementById("tb-workbench-manual-action-result")?.textContent || "null"); }
      catch { result = null; }
      if (!result || result.requestId !== requestId) return;
      clearTimeout(timeout);
      document.removeEventListener("tb-workbench-manual-action-result", onResult);
      resolve(result);
    }
    document.addEventListener("tb-workbench-manual-action-result", onResult);
    let bridge = document.getElementById("tb-workbench-manual-action-request");
    if (!bridge) {
      bridge = document.createElement("script");
      bridge.id = "tb-workbench-manual-action-request";
      bridge.type = "application/json";
      document.documentElement.appendChild(bridge);
    }
    bridge.textContent = ${JSON.stringify(JSON.stringify({ requestId, action }))};
    document.dispatchEvent(new Event("tb-workbench-manual-action"));
  })`;
  return contents.executeJavaScript(script, true)
    .catch((error) => ({ ok: false, error: error?.message || String(error) }));
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

async function flushAllGptStorageData() {
  const profileState = readBrowserProfiles();
  const ids = new Set([
    ...profileState.profiles.map((profile) => safeGptAccountId(profile.id)),
    ...gptAccounts.keys(),
  ]);
  await Promise.all([...ids].map(async (id) => {
    try {
      await Promise.resolve(session.fromPartition(`${GPT_PARTITION_PREFIX}-${id}`).flushStorageData());
    } catch (error) {
      appendDesktopLog("gpt-storage-flush-failed", `${id} ${error.message}`);
    }
  }));
  appendDesktopLog("gpt-storage-flushed", [...ids].join(","));
}

function restoreMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

let gptWindowRestoreTimer = null;
function notifyWindowRestored(reason = "show") {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  clearTimeout(gptWindowRestoreTimer);
  // A minimized BrowserWindow emits `restore`, not necessarily `show`.
  // Wait until Chromium has laid the workbench out again before asking the
  // renderer to re-attach the native GPT surface. This preserves the live
  // page/session and avoids reloading ChatGPT just to recover its pixels.
  gptWindowRestoreTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || !mainWindow.isVisible()) return;
    const account = activeGptAccount();
    if (account?.view && !account.view.webContents.isDestroyed()) {
      try {
        const bounds = account.view.getBounds();
        // Skip re-attaching if bounds are 0x0 — the view was just created
        // by ensureGptAccount but desktop:gpt-show hasn't set the real
        // bounds yet.  Re-attaching with 0x0 makes the GPT window invisible.
        if (bounds.width > 0 && bounds.height > 0) {
          mainWindow.contentView.removeChildView(account.view);
          mainWindow.contentView.addChildView(account.view);
          account.view.setBounds(bounds);
          account.view.setBackgroundColor(embeddedGptPalette(gptThemeName).main);
          account.view.setBorderRadius(16);
          appendDesktopLog("gpt-surface-restored", `${reason} ${account.id} ${bounds.width}x${bounds.height}`);
        } else {
          appendDesktopLog("gpt-surface-skip", `${reason} ${account.id} bounds=${bounds.width}x${bounds.height}`);
        }
      } catch (error) {
        appendDesktopLog("gpt-surface-restore-failed", `${reason} ${error.message}`);
      }
    }
    mainWindow.webContents.send("desktop:window-restored", { reason });
    if (assistantOverlayState.visible) assistantOverlayWindow?.showInactive();
  }, 140);
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

async function restartApp() {
  if (productionTaskActive && mainWindow) {
    const result = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "自动生产仍在运行",
      message: "重启工作台会中断当前自动生产任务。",
      detail: "重启后需要重新手动启动生产。确定要重启吗？",
      buttons: ["取消", "重启"],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    if (result.response !== 1) return;
  }
  appendDesktopLog("desktop-restart", "tray-menu");
  app.relaunch();
  app.exit(0);
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
    { label: "重启工作台", click: () => restartApp() },
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


function probeWorkbenchServer() {
  return new Promise((resolve) => {
    const request = http.get(APP_URL, { timeout: 1200 }, (response) => {
      response.resume();
      resolve(classifyWorkbenchPortProbe({ statusCode: response.statusCode }));
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(classifyWorkbenchPortProbe({ timedOut: true }));
    });
    request.on("error", (error) => resolve(classifyWorkbenchPortProbe({ errorCode: error.code })));
  });
}

async function ensureServer() {
  const initialProbe = await probeWorkbenchServer();
  if (initialProbe === "ready") return;
  if (initialProbe === "occupied") throw new Error(formatPortInUseMessage(APP_PORT));
  const serverFile = path.join(runtimeAppRoot(), "server.js");
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
    const probe = await probeWorkbenchServer();
    if (probe === "ready") return;
    if (probe === "occupied") throw new Error(formatPortInUseMessage(APP_PORT));
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
      // The renderer owns the durable GPT maintenance timers and queue
      // checkpoints. Keep them alive when the workbench is hidden to tray;
      // the native GPT WebContentsView already has the same guarantee.
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.js")
    }
  });
  mainWindow = window;
  window.on("minimize", () => {
    hideAllGptViews();
    assistantOverlayWindow?.hide();
  });
  window.on("hide", () => {
    hideAllGptViews();
    assistantOverlayWindow?.hide();
  });
  window.on("show", () => {
    notifyWindowRestored("show");
  });
  window.on("restore", () => {
    notifyWindowRestored("restore");
  });
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
    if (assistantOverlayWindow && !assistantOverlayWindow.isDestroyed()) assistantOverlayWindow.destroy();
    assistantOverlayWindow = null;
    for (const account of gptAccounts.values()) {
      if (account.view && !account.view.webContents.isDestroyed()) account.view.webContents.close();
    }
    gptAccounts.clear();
    mainWindow = null;
  });

  window.once("ready-to-show", () => {
    if (process.env.TB_DESKTOP_HIDDEN !== "1") window.show();
  });
  // The "show" event may fire before the renderer's DOM is ready, causing
  // notifyWindowRestored to send desktop:window-restored into the void.
  // Re-trigger after the page finishes loading so the renderer can actually
  // receive it and restore the embedded GPT surface.
  window.webContents.once("did-finish-load", () => {
    setTimeout(() => notifyWindowRestored("did-finish-load"), 200);
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
  await ensureAssistantOverlay();
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
    ensureDurableRuntimeResources();
    applyPendingGptLoginBackup();
    applyPendingGptLoginRestore();
    createTray();
    watchExtensionForChanges();
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

app.on("before-quit", (event) => {
  if (!quitFlushCompleted) {
    event.preventDefault();
    if (!quitFlushStarted) {
      quitFlushStarted = true;
      flushAllGptStorageData().finally(() => {
        quitFlushCompleted = true;
        app.quit();
      });
    }
    return;
  }
  isExplicitQuit = true;
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
