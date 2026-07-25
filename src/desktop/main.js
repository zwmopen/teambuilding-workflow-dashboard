const { app, BrowserWindow, ipcMain, shell, webContents } = require("electron");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const APP_URL = "http://127.0.0.1:4327/";
const DOWNLOAD_ROOT = "D:\\Download";
const CHATGPT_USERSCRIPT = "D:\\AICode\\工具开发\\projects\\chatgpt-conversation-tree\\src\\chatgpt-conversation-tree.user.js";
const CHATGPT_HISTORY_EXPORT = "D:\\Download\\chatgpt-helper-data-2026-07-13T08-04-14.json";
let serverProcess = null;

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function userscriptBootstrap() {
  if (!fs.existsSync(CHATGPT_USERSCRIPT)) return "";
  const userscript = fs.readFileSync(CHATGPT_USERSCRIPT, "utf8");
  const history = readJson(CHATGPT_HISTORY_EXPORT, null);
  const seed = history && history.format === "cgpt-conversation-tree" ? history : null;
  const shim = `(() => {
    if (window.__TB_CHATGPT_USERSCRIPT_LOADED__) return;
    window.__TB_CHATGPT_USERSCRIPT_LOADED__ = true;
    const prefix = "tb-electron-gm:";
    const seed = ${JSON.stringify(seed)};
    if (seed && !localStorage.getItem("cgpt-conversation-tree:state:v3") && !localStorage.getItem("cgpt-conversation-tree:state:v1")) {
      localStorage.setItem("cgpt-conversation-tree:state:v3", JSON.stringify(seed.state || {}));
      localStorage.setItem("cgpt-conversation-tree:state:v1", JSON.stringify(seed.state || {}));
      if (seed.prompts) localStorage.setItem("cgpt-conversation-tree:prompts:v1", JSON.stringify(seed.prompts));
    }
    window.unsafeWindow = window;
    window.GM_getValue = (key, fallback) => {
      try { const value = localStorage.getItem(prefix + key); return value === null ? fallback : JSON.parse(value); } catch { return fallback; }
    };
    window.GM_setValue = (key, value) => localStorage.setItem(prefix + key, JSON.stringify(value));
    window.GM_deleteValue = (key) => localStorage.removeItem(prefix + key);
    window.GM_listValues = () => Object.keys(localStorage).filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
    window.GM_registerMenuCommand = () => Math.random().toString(36).slice(2);
    window.GM_unregisterMenuCommand = () => {};
    window.GM_download = (input, name) => {
      const options = typeof input === "string" ? { url: input, name } : input || {};
      const link = document.createElement("a");
      link.href = options.url || "";
      link.download = options.name || "";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      options.onload?.();
    };
    window.GM_xmlhttpRequest = (options = {}) => fetch(options.url, {
      method: options.method || "GET",
      headers: options.headers,
      body: options.data
    }).then(async (response) => options.onload?.({
      status: response.status,
      responseText: await response.text(),
      finalUrl: response.url
    })).catch((error) => options.onerror?.(error));
  })();`;
  return `${shim}\n${userscript}`;
}

async function injectChatGptUserscript(contents) {
  if (!/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i.test(contents.getURL())) return;
  const source = userscriptBootstrap();
  if (!source) return;
  try {
    await contents.executeJavaScript(source, true);
  } catch (error) {
    console.warn("ChatGPT userscript injection failed:", error.message);
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
  if (contents.getType() === "webview") {
    contents.setUserAgent(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`);
    contents.session.setDownloadPath(DOWNLOAD_ROOT);
    contents.on("dom-ready", () => injectChatGptUserscript(contents));
  }
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(chatgpt\.com|chat\.openai\.com|auth\.openai\.com|accounts\.google\.com|[a-z0-9.-]+\.google\.com)\//i.test(url)) {
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
    show: false,
    backgroundColor: "#e7eee9",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true,
      preload: path.join(__dirname, "shell-preload.js")
    }
  });

  window.once("ready-to-show", () => window.show());

  window.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    if (params.src === APP_URL) {
      webPreferences.preload = path.join(__dirname, "preload.js");
      return;
    }
    if (!/^https:\/\/chatgpt\.com\//i.test(params.src)) event.preventDefault();
  });
  app.on("web-contents-created", (_event, contents) => secureGuest(contents));
  await window.loadFile(path.join(__dirname, "shell.html"));
}

ipcMain.handle("gpt:prepare-transfer", async (_event, payload = {}) => {
  const target = webContents.fromId(Number(payload.targetId));
  if (!target || !/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i.test(target.getURL())) {
    throw new Error("当前 ChatGPT 页面还没有准备好");
  }
  const files = (Array.isArray(payload.files) ? payload.files : [])
    .map((file) => path.resolve(String(file || "")))
    .filter((file) => path.isAbsolute(file) && fs.existsSync(file) && fs.statSync(file).isFile())
    .slice(0, 30);
  const instruction = String(payload.instruction || "").slice(0, 24_000);
  await target.executeJavaScript(`(() => {
    const editor = document.querySelector('#prompt-textarea, [contenteditable="true"][data-lexical-editor="true"], textarea');
    if (!editor) return false;
    editor.focus();
    if (editor.isContentEditable) editor.textContent = ${JSON.stringify(instruction)};
    else editor.value = ${JSON.stringify(instruction)};
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(instruction)} }));
    return true;
  })()`, true);

  let filesAttached = false;
  let attachedDebugger = false;
  if (files.length) {
    try {
      if (!target.debugger.isAttached()) {
        target.debugger.attach("1.3");
        attachedDebugger = true;
      }
      const documentNode = await target.debugger.sendCommand("DOM.getDocument", { depth: -1, pierce: true });
      const input = await target.debugger.sendCommand("DOM.querySelector", {
        nodeId: documentNode.root.nodeId,
        selector: "input[type=file]"
      });
      if (input.nodeId) {
        await target.debugger.sendCommand("DOM.setFileInputFiles", { nodeId: input.nodeId, files });
        filesAttached = true;
      }
    } finally {
      if (attachedDebugger && target.debugger.isAttached()) target.debugger.detach();
    }
  }
  return { ok: true, filesAttached, fileCount: filesAttached ? files.length : 0 };
});

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
