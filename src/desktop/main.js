const { app, BrowserWindow, shell } = require("electron");
const childProcess = require("node:child_process");
const path = require("node:path");
const http = require("node:http");

const APP_URL = "http://127.0.0.1:4327/";
let serverProcess = null;

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
  serverProcess = childProcess.spawn(process.execPath, [serverFile], {
    cwd: path.dirname(serverFile),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PORT: "4327" },
    windowsHide: true,
    stdio: "ignore"
  });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await canReachServer()) return;
  }
  throw new Error("本地工作台服务未能启动");
}

function secureGuest(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(chatgpt\.com|auth\.openai\.com)\//i.test(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 980,
          height: 760,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            session: contents.session
          }
        }
      };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
}

async function createWindow() {
  await ensureServer();
  const window = new BrowserWindow({
    width: 1520,
    height: 940,
    minWidth: 1120,
    minHeight: 700,
    title: "团建内容工作台",
    backgroundColor: "#e7eee9",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true
    }
  });

  window.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    if (params.src === APP_URL) return;
    if (!/^https:\/\/chatgpt\.com\//i.test(params.src)) event.preventDefault();
  });
  app.on("web-contents-created", (_event, contents) => secureGuest(contents));
  await window.loadFile(path.join(__dirname, "shell.html"));
}

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on("window-all-closed", () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
