const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const LIFE_GAME_EXE = "D:\\AICode\\工具开发\\projects\\人生游戏管理系统\\electron\\release\\win-unpacked\\人生游戏系统.exe";
const LIFE_GAME_DEBUG_URL = "http://127.0.0.1:9334/json";
const DEFAULT_URL = "https://dav.jianguoyun.com/dav/";

const dpapiProtectScript = [
  "Add-Type -AssemblyName System.Security",
  "$plain = [Console]::In.ReadToEnd()",
  "$bytes = [Text.Encoding]::UTF8.GetBytes($plain)",
  "$encrypted = [Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Convert]::ToBase64String($encrypted)"
].join("; ");

const dpapiUnprotectScript = [
  "Add-Type -AssemblyName System.Security",
  "$encoded = [Console]::In.ReadToEnd()",
  "$bytes = [Convert]::FromBase64String($encoded)",
  "$plain = [Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Text.Encoding]::UTF8.GetString($plain)"
].join("; ");

function powershellWithInput(script, input) {
  const result = childProcess.spawnSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script
  ], {
    input,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) throw new Error("Windows 安全存储不可用");
  return String(result.stdout || "").trim();
}

function saveSecureConfig(filePath, config) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const encrypted = powershellWithInput(dpapiProtectScript, JSON.stringify(config));
  fs.writeFileSync(filePath, JSON.stringify({
    version: 1,
    protection: "windows-current-user",
    encrypted
  }, null, 2), "utf8");
}

function readSecureConfig(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const container = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!container?.encrypted) return null;
  return JSON.parse(powershellWithInput(dpapiUnprotectScript, container.encrypted));
}

function evpBytesToKey(password, salt, keyLength = 32, ivLength = 16) {
  let derived = Buffer.alloc(0);
  let block = Buffer.alloc(0);
  while (derived.length < keyLength + ivLength) {
    block = crypto.createHash("md5").update(Buffer.concat([block, Buffer.from(password), salt])).digest();
    derived = Buffer.concat([derived, block]);
  }
  return { key: derived.subarray(0, keyLength), iv: derived.subarray(keyLength, keyLength + ivLength) };
}

function decryptCryptoJs(cipherText, password) {
  const payload = Buffer.from(cipherText, "base64");
  if (payload.subarray(0, 8).toString("ascii") !== "Salted__") throw new Error("人生游戏配置格式无法识别");
  const salt = payload.subarray(8, 16);
  const { key, iv } = evpBytesToKey(password, salt);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(payload.subarray(16)), decipher.final()]).toString("utf8");
}

async function waitForDebugTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(LIFE_GAME_DEBUG_URL).then((response) => response.json());
      const target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (target) return target;
    } catch {
      // The life-game app may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("没有连接到人生游戏系统，请先确认它能正常启动");
}

async function readLifeGameLocalStorage() {
  let target;
  try {
    target = await waitForDebugTarget();
  } catch {
    if (!fs.existsSync(LIFE_GAME_EXE)) throw new Error("没有找到人生游戏系统");
    childProcess.spawn(LIFE_GAME_EXE, ["--remote-debugging-port=9334"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    }).unref();
    target = await waitForDebugTarget();
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const result = await new Promise((resolve, reject) => {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) return;
      if (message.error || message.result?.exceptionDetails) reject(new Error("人生游戏配置读取失败"));
      else resolve(message.result.result.value);
    });
    socket.send(JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: {
        expression: `JSON.stringify({
          deviceId: localStorage.getItem("_device_id"),
          encrypted: localStorage.getItem("webdav-config"),
          legacyUrl: localStorage.getItem("webdav-url"),
          legacyUsername: localStorage.getItem("webdav-username"),
          legacyPassword: localStorage.getItem("webdav-password")
        })`,
        returnByValue: true
      }
    }));
  });
  socket.close();
  return JSON.parse(result);
}

async function importLifeGameConfig(configFile) {
  const stored = await readLifeGameLocalStorage();
  let config;
  if (stored.encrypted && stored.deviceId) {
    const key = crypto.pbkdf2Sync(stored.deviceId, "life_game_system", 1000, 32, "sha256").toString("hex");
    config = JSON.parse(decryptCryptoJs(stored.encrypted, key));
  } else if (stored.legacyUsername && stored.legacyPassword) {
    config = {
      url: stored.legacyUrl || DEFAULT_URL,
      username: stored.legacyUsername,
      password: stored.legacyPassword,
      basePath: ""
    };
  }
  if (!config?.username || !config?.password) throw new Error("人生游戏系统里没有可用的坚果云配置");
  const normalized = {
    url: config.url || DEFAULT_URL,
    username: config.username,
    password: config.password,
    basePath: config.basePath || "/人生游戏管理系统",
    importedFrom: "人生游戏系统",
    importedAt: new Date().toISOString()
  };
  saveSecureConfig(configFile, normalized);
  return normalized;
}

function webdavUrl(config, remotePath = "") {
  const base = new URL(config.url || DEFAULT_URL);
  const clean = [config.basePath || "", "团建内容工作台", remotePath]
    .join("/")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");
  base.pathname = `${base.pathname.replace(/\/+$/, "")}/${clean}`;
  return base.toString();
}

function authHeaders(config, extra = {}) {
  return {
    Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
    ...extra
  };
}

async function testConnection(config) {
  const response = await fetch(config.url || DEFAULT_URL, {
    method: "PROPFIND",
    headers: authHeaders(config, { Depth: "0" })
  });
  if (![200, 207].includes(response.status)) throw new Error(`坚果云连接失败（${response.status}）`);
  return true;
}

async function ensureRemoteCollections(config) {
  const parts = [config.basePath || "", "团建内容工作台"]
    .join("/")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    const base = new URL(config.url || DEFAULT_URL);
    base.pathname = `${base.pathname.replace(/\/+$/, "")}${current}`;
    const response = await fetch(base, { method: "MKCOL", headers: authHeaders(config) });
    if (![200, 201, 204, 301, 405].includes(response.status)) {
      throw new Error(`无法建立坚果云备份目录（${response.status}）`);
    }
  }
}

async function uploadBackup(config, payload, fileName) {
  await ensureRemoteCollections(config);
  const body = JSON.stringify(payload, null, 2);
  for (const target of [fileName, "latest.json"]) {
    const response = await fetch(webdavUrl(config, target), {
      method: "PUT",
      headers: authHeaders(config, { "Content-Type": "application/json; charset=utf-8" }),
      body
    });
    if (![200, 201, 204].includes(response.status)) throw new Error(`坚果云上传失败（${response.status}）`);
  }
}

function publicStatus(config, metadata = {}) {
  if (!config) return { configured: false, provider: "坚果云 WebDAV", ...metadata };
  const [name, domain = ""] = String(config.username).split("@");
  const masked = name ? `${name.slice(0, 2)}***${domain ? `@${domain}` : ""}` : "已配置";
  return {
    configured: true,
    provider: "坚果云 WebDAV",
    account: masked,
    basePath: `${config.basePath || ""}/团建内容工作台`.replace(/\/+/g, "/"),
    importedFrom: config.importedFrom || "本机配置",
    ...metadata
  };
}

module.exports = {
  importLifeGameConfig,
  publicStatus,
  readSecureConfig,
  saveSecureConfig,
  testConnection,
  uploadBackup
};
