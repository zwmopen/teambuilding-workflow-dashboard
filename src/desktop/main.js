const { app, BrowserWindow } = require("electron");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { version: APP_VERSION } = require("../package.json");

const APP_URL = "http://127.0.0.1:4327/";
const RUNTIME_ROOT = process.env.TEAMBUILDING_DASHBOARD_RUNTIME || "D:\\AICode\\运行数据\\江湖有旅人\\图文生产控制台";
const DESKTOP_LOG_FILE = path.join(RUNTIME_ROOT, "desktop.log");
let serverProcess = null;
let mainWindow = null;

if (!app.isPackaged || process.env.TB_DESKTOP_SMOKE === "1") {
  app.commandLine.appendSwitch("remote-debugging-port", "9333");
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
      PORT: "4327",
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
  window.on("closed", () => { mainWindow = null; });

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
