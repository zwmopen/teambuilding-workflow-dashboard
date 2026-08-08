const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const childProcess = require("child_process");
const crypto = require("crypto");
const os = require("os");
const sharp = require("sharp");
const { generateImages, generateText, networkFetch, normalizeImageApiConfig, normalizeTextApiConfig } = require("./lib/image-generation");
const {
  applySuggestedTitles,
  buildCopyPrompt,
  buildPagePrompt,
  buildProductionPlan,
  recipeForTemplate
} = require("./lib/production-recipes");
const { getJuguangSnapshot, queryKeywords } = require("./lib/juguang-data");
const {
  appendWorkflowOperation,
  classifyCollectionName,
  confirmOfficialUpload,
  getWorkflowStageRoots,
  getDistributionSnapshot,
  inspectSource,
  markOfficialUsed,
  moveCollectionSourceToStage,
  readWorkflowOperations,
  renameCollectionType,
  reconcileWorkflowFolders
} = require("./lib/distribution-data");
const wechatDraft = require("./lib/wechat-draft");
const {
  isDownloadedText,
  ledgerStatus,
  productionHistoryStatus,
  registerDownloadedText,
  syncDedupLedger
} = require("./lib/dedup-ledger");
const {
  publicTransferTask,
  updateTransferProgress
} = require("./lib/transfer-progress");
const {
  countReserve,
  decorateTrustedDevices,
  findTrustedDevice,
  normalizePageSettings
} = require("./lib/workbench-settings");
const {
  normalizeQuotaLedger,
  recordQuotaEvent,
  rollingQuotaStatus
} = require("./lib/gpt-production-orchestrator");
const {
  normalizeWorkPackageTitle,
  publishTitleFromClipboard
} = require("./lib/work-package-title");
const {
  formatPortInUseMessage
} = require("./lib/workbench-port");
const {
  downloadBackup,
  importLifeGameConfig,
  publicStatus: publicCloudBackupStatus,
  readSecureConfig,
  saveManualConfig,
  saveSecureConfig,
  testConnection: testCloudBackupConnection,
  uploadBackup,
  uploadFile
} = require("./lib/webdav-backup");
const {
  inspectProductionQuality,
  qualityReportText
} = require("./lib/production-quality");

// --- 分模块路由（渐进式拆分，每拆一个域加一行 require） ---
const juguangRoute = require("./server/routes/juguang");
const wechatDraftRoute = require("./server/routes/wechat-draft");
const backupRoute = require("./server/routes/backup");
const settingsRoute = require("./server/routes/settings");
const distributionRoute = require("./server/routes/distribution");
const productionRoute = require("./server/routes/production");
const gptExtensionRoute = require("./server/routes/gpt-extension");
const conversionRoute = require("./server/routes/conversion");
const { resolveAuthorizedDownloadRoot } = require("./lib/gpt-download-root");

const PORT = Number(process.env.PORT || 4327);
const LISTEN_HOST = process.env.TB_WORKBENCH_HOST || "127.0.0.1";
const PROJECT_ROOT = process.env.TEAMBUILDING_ROOT || "D:\\AICode\\项目推进\\projects\\江湖有旅人\\主项目";
const SKILL_ROOT = process.env.TEAMBUILDING_SKILL_ROOT || "D:\\AICode\\AI\\skills\\图文创作相关技能\\团建相关技能";
const APP_ROOT = __dirname;
const PUBLIC_ROOT = path.join(APP_ROOT, "public");
const PROJECT_APP_ROOT = path.resolve(APP_ROOT, "..");
const CONVERSION_SERVICE_ORIGIN = process.env.JIANGHU_CONVERSION_ORIGIN || "http://127.0.0.1:8765";
const CONVERSION_ASSISTANT_ROOT = process.env.JIANGHU_CONVERSION_ROOT || "D:\\AICode\\工具开发\\projects\\jianghu-conversion-assistant";
const CONVERSION_ASSISTANT_LAUNCHER = path.join(CONVERSION_ASSISTANT_ROOT, "start.vbs");
const APP_VERSION = (() => {
  try { return fs.readFileSync(path.join(PROJECT_APP_ROOT, "VERSION"), "utf8").trim() || "0.0.0"; }
  catch { return require("./package.json").version || "0.0.0"; }
})();
const RELEASE_ROOT = process.env.TEAMBUILDING_RELEASE_ROOT || path.join(PROJECT_APP_ROOT, "releases");
const DATA_ROOT = process.env.TEAMBUILDING_DASHBOARD_RUNTIME || "D:\\AICode\\运行数据\\江湖有旅人\\团建工作台";
const STATE_FILE = path.join(DATA_ROOT, "state.json");
const PROMPTS_FILE = path.join(DATA_ROOT, "prompt-versions.json");
const TASK_INDEX_FILE = path.join(DATA_ROOT, "production-task-index.json");
const APP_SETTINGS_FILE = path.join(DATA_ROOT, "app-settings.json");
const IMAGE_API_SECRET_FILE = path.join(DATA_ROOT, "secrets", "image-api.local.env");
const WEBDAV_CONFIG_FILE = path.join(DATA_ROOT, "secrets", "webdav-config.dpapi.json");
const CLOUD_BACKUP_META_FILE = path.join(DATA_ROOT, "cloud-backup-meta.json");
const CLOUD_LARGE_BACKUP_MANIFEST_FILE = path.join(DATA_ROOT, "cloud-large-backup-manifest.json");
const IMAGE_REVIEW_ROOT = path.join(DATA_ROOT, "API生产待审");
const PRODUCTION_JOB_ROOT = path.join(DATA_ROOT, "production-jobs");
const COLLECTION_LEDGER_FILE = path.join(DATA_ROOT, "collection-ledger.json");
const DEVICE_PRESENCE_FILE = path.join(DATA_ROOT, "device-presence.json");
const DEVICE_NOTES_FILE = path.join(DATA_ROOT, "device-notes.json");
const DISTRIBUTION_AUTOMATION_LOG_FILE = path.join(DATA_ROOT, "distribution-automation.jsonl");
const MOBILE_CONVERSION_TOKEN_FILE = path.join(DATA_ROOT, "secrets", "mobile-conversion.token");
const MATERIAL_SCAN_CACHE_FILE = path.join(DATA_ROOT, "material-scan-cache.json");
const MATERIAL_LIBRARY_CACHE_FILE = path.join(DATA_ROOT, "material-library-cache.json");
const DEDUP_LEDGER_FILE = path.join(DATA_ROOT, "防重复账本", "dedup-ledger.json");
const EXTENSION_DOWNLOAD_LOG_FILE = path.join(DATA_ROOT, "防重复账本", "extension-download-events.json");
const MATERIAL_USAGE_LEDGER_FILE = path.join(DATA_ROOT, "防重复账本", "material-usage-ledger.json");
const MATERIAL_METADATA_LEDGER_FILE = path.join(DATA_ROOT, "防重复账本", "material-metadata-ledger.json");
const MATERIAL_HASH_CACHE_FILE = path.join(DATA_ROOT, "material-hash-cache.json");
const MATERIAL_GLOBAL_INDEX_FILE = path.join(DATA_ROOT, "material-global-index.json");
const GPT_QUOTA_LEDGER_FILE = path.join(DATA_ROOT, "gpt-production-quota.json");
const GPT_PRODUCTION_CHECKPOINT_FILE = path.join(DATA_ROOT, "gpt-production-checkpoints.json");
const GPT_PRODUCTION_ARCHIVE_LOG_FILE = path.join(DATA_ROOT, "gpt-production-archive.jsonl");
const GPT_CONVERSATION_LOG_FILE = path.join(DATA_ROOT, "gpt-conversation-log.jsonl");
const WORKPKG_SCRIPT_ROOT = path.join(DATA_ROOT, "work-package");
const WORKPKG_CONFIG_FILE = process.env.TEAMBUILDING_WORKPKG_CONFIG_FILE || path.join(WORKPKG_SCRIPT_ROOT, "workpkg_config.json");
const DOWNLOAD_ROOT = process.env.TEAMBUILDING_DOWNLOAD_ROOT || WORKPKG_SCRIPT_ROOT;
const PUBLISH_ROOT = process.env.TEAMBUILDING_PUBLISH_ROOT
  || path.join(PROJECT_ROOT, "成品库（GPT+本地脚本制作）", "发布空间");
const DEVICE_TRANSFER_ROOT = process.env.DEVICE_TRANSFER_SKILL_ROOT
  || "D:\\AICode\\AI\\skills\\技能包\\技能\\device-folder-transfer";
const DEVICE_REGISTRY_FILE = path.join(DEVICE_TRANSFER_ROOT, "references", "device-registry.json");

// Windows 上 `py` (Python Launcher) 不一定安装，查找可用的 Python 可执行文件
let _pythonExe = null;
function pythonExe() {
  if (_pythonExe) return _pythonExe;
  const candidates = [
    "python",       // PATH 中的 python
    "python3",      // PATH 中的 python3
    "py",            // Python Launcher（如果安装了）
    "C:\\Users\\z\\AppData\\Local\\Programs\\Python\\Python311\\python.exe",
    "C:\\Python311\\python.exe",
    "D:\\Program Files\\Python311\\python.exe",
  ];
  for (const cmd of candidates) {
    try {
      const result = childProcess.spawnSync(cmd, ["--version"], {
        windowsHide: true,
        timeout: 5000,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      });
      if (result.status === 0 && /Python \d/i.test(result.stdout || result.stderr || "")) {
        _pythonExe = cmd;
        return cmd;
      }
    } catch {
      // 继续尝试下一个候选
    }
  }
  // 回退到 "python"，让系统报错时给出可读信息
  _pythonExe = "python";
  return _pythonExe;
}

const imageExts = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const textExts = new Set([".txt", ".md"]);
const MATERIAL_MAIN_TAGS = ["团建游戏", "团建转化", "合集攻略"];
const PREVIEW_LIMITS = {
  materialItemsPerCategory: 1000,
  materialImagesPerItem: 12,
  templateImages: 5,
  productWorksPerGroup: 36,
  productImagesPerWork: 12
};
const materialCategoryCache = new Map();
let materialGlobalIndexJob = {
  status: "idle",
  startedAt: "",
  completedAt: "",
  currentCategory: "",
  processedCategories: 0,
  totalCategories: 0,
  indexedItems: 0,
  error: ""
};
let deviceStatusCache = {
  checkedAt: 0,
  output: "",
  onlineDevices: readJson(DEVICE_PRESENCE_FILE, { onlineDevices: [] }).onlineDevices || []
};
let deviceStatusPromise = null;
const genericTransferTasks = new Map();
const distributionTasks = new Map();
const automaticDistributionSessions = new Set();
const pendingProductionPlans = new Map();
const productionJobs = new Map();
const productionAbortControllers = new Map();
const conversionProxyCache = new Map();
const CONVERSION_CACHE_TTL_MS = PORT === 4327 ? 10 * 60 * 1000 : 2_000;
let cloudBackupTimer = null;
let largeCloudBackupTask = null;

function ensureDataFiles() {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  if (!fs.existsSync(STATE_FILE) || !readJson(STATE_FILE, null)) writeJson(STATE_FILE, buildDefaultState());
  if (!fs.existsSync(PROMPTS_FILE)) {
    writeJson(PROMPTS_FILE, buildDefaultPromptVersions());
  }
  if (!fs.existsSync(APP_SETTINGS_FILE)) {
    writeJson(APP_SETTINGS_FILE, {
      materialRoot: path.join(PROJECT_ROOT, "01-素材库")
    });
  }
  if (!fs.existsSync(DEDUP_LEDGER_FILE)) syncHistoricalDedupLedger();
  loadProductionJobs();
}

function getCloudBackupStatus() {
  let config = null;
  try { config = readSecureConfig(WEBDAV_CONFIG_FILE); } catch { config = null; }
  return publicCloudBackupStatus(config, {
    ...readJson(CLOUD_BACKUP_META_FILE, {
    lastBackupAt: "",
    lastBackupFile: "",
    lastResult: ""
    }),
    largeBackup: largeCloudBackupTask || readJson(CLOUD_LARGE_BACKUP_MANIFEST_FILE, {}).lastTask || null
  });
}

function buildCloudBackupPayload() {
  const files = [
    STATE_FILE,
    PROMPTS_FILE,
    TASK_INDEX_FILE,
    APP_SETTINGS_FILE,
    COLLECTION_LEDGER_FILE,
    DEVICE_PRESENCE_FILE,
    DEVICE_NOTES_FILE,
    DEDUP_LEDGER_FILE,
    EXTENSION_DOWNLOAD_LOG_FILE,
    MATERIAL_USAGE_LEDGER_FILE,
    MATERIAL_METADATA_LEDGER_FILE,
    GPT_QUOTA_LEDGER_FILE
  ];
  const records = {};
  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;
    const relative = path.relative(DATA_ROOT, filePath).replace(/\\/g, "/");
    try { records[relative] = JSON.parse(fs.readFileSync(filePath, "utf8")); }
    catch { records[relative] = fs.readFileSync(filePath, "utf8"); }
  }
  return {
    schema: "teambuilding-workbench-backup-v1",
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    machine: os.hostname?.() || process.env.COMPUTERNAME || "windows",
    scope: "设置、提示词、任务索引、设备备注、分发与防重复记录；不包含素材和成品大文件",
    records
  };
}

function restoreBackupPayload(payload = {}) {
  if (payload.schema !== "teambuilding-workbench-backup-v1") {
    throw new Error("备份文件格式不正确");
  }
  const allowedFiles = [
    STATE_FILE,
    PROMPTS_FILE,
    TASK_INDEX_FILE,
    APP_SETTINGS_FILE,
    COLLECTION_LEDGER_FILE,
    DEVICE_PRESENCE_FILE,
    DEVICE_NOTES_FILE,
    DEDUP_LEDGER_FILE,
    EXTENSION_DOWNLOAD_LOG_FILE,
    MATERIAL_USAGE_LEDGER_FILE,
    MATERIAL_METADATA_LEDGER_FILE,
    GPT_QUOTA_LEDGER_FILE
  ];
  const allowed = new Map(allowedFiles.map((filePath) => [
    path.relative(DATA_ROOT, filePath).replace(/\\/g, "/"),
    filePath
  ]));
  const restorable = Object.entries(payload.records || {}).filter(([relative]) => allowed.has(relative));
  if (!restorable.length) throw new Error("备份中没有可恢复的工作台记录");
  const recoveryRoot = path.join(DATA_ROOT, "恢复前快照");
  fs.mkdirSync(recoveryRoot, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const localSnapshot = path.join(recoveryRoot, `before-restore-${stamp}.json`);
  writeJson(localSnapshot, buildCloudBackupPayload());
  for (const [relative, value] of restorable) {
    const target = allowed.get(relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (typeof value === "string") fs.writeFileSync(target, value, "utf8");
    else writeJson(target, value);
  }
  materialCategoryCache.clear();
  materialPostCache = null;
  materialLibraryCache = null;
  return { restored: restorable.length, localSnapshot };
}

async function runCloudBackupNow() {
  const config = readSecureConfig(WEBDAV_CONFIG_FILE);
  if (!config) throw new Error("请先配置坚果云 WebDAV");
  const payload = buildCloudBackupPayload();
  const stamp = payload.createdAt.replace(/[:.]/g, "-");
  const fileName = `teambuilding-workbench-${stamp}.json`;
  await uploadBackup(config, payload, fileName);
  const metadata = {
    lastBackupAt: payload.createdAt,
    lastBackupFile: fileName,
    lastResult: `已备份 ${Object.keys(payload.records).length} 份本地记录`
  };
  writeJson(CLOUD_BACKUP_META_FILE, metadata);
  return publicCloudBackupStatus(config, metadata);
}

async function inspectLatestCloudBackup() {
  const config = readSecureConfig(WEBDAV_CONFIG_FILE);
  if (!config) throw new Error("请先配置坚果云 WebDAV");
  const payload = await downloadBackup(config);
  const recordNames = Object.keys(payload.records || {});
  return {
    ok: true,
    schema: payload.schema,
    createdAt: payload.createdAt || "",
    appVersion: payload.appVersion || "",
    recordCount: recordNames.length,
    records: recordNames,
    message: `云端最新备份可读取，共 ${recordNames.length} 份记录`
  };
}

async function restoreLatestCloudBackup() {
  const config = readSecureConfig(WEBDAV_CONFIG_FILE);
  if (!config) throw new Error("请先配置坚果云 WebDAV");
  const payload = await downloadBackup(config);
  const restored = restoreBackupPayload(payload);
  return {
    ok: true,
    restoredAt: new Date().toISOString(),
    sourceCreatedAt: payload.createdAt || "",
    restoredRecords: restored.restored,
    localSnapshot: restored.localSnapshot,
    message: `已恢复 ${restored.restored} 份记录；恢复前快照已保留`
  };
}

function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function scanLargeBackupFiles(root) {
  const files = [];
  const queue = [root];
  while (queue.length) {
    const current = queue.shift();
    for (const entry of safeList(current)) {
      const fullPath = path.join(current, entry.name);
      if (entry.name.startsWith(".")
        || entry.name.startsWith("~$")
        || ["desktop.ini", "thumbs.db"].includes(entry.name.toLowerCase())) continue;
      let stats;
      try {
        stats = fs.lstatSync(fullPath);
      } catch {
        continue;
      }
      if (stats.isSymbolicLink()) continue;
      if (stats.isDirectory()) queue.push(fullPath);
      else if (stats.isFile()) {
        files.push({
          path: fullPath,
          relative: path.relative(root, fullPath).replace(/\\/g, "/"),
          size: stats.size,
          mtimeMs: Math.trunc(stats.mtimeMs)
        });
      }
    }
  }
  return files.sort((left, right) => left.mtimeMs - right.mtimeMs || left.relative.localeCompare(right.relative, "zh-CN"));
}

async function executeLargeCloudBackup() {
  const settings = getPageSettings().backup || {};
  const sourceRoot = path.resolve(settings.sourceRoot || "");
  if (!settings.sourceRoot || !exists(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    throw new Error("请先设置有效的方案/大文件来源目录");
  }
  const config = readSecureConfig(WEBDAV_CONFIG_FILE);
  if (!config) throw new Error("请先配置坚果云 WebDAV");
  await testCloudBackupConnection(config);

  const manifest = readJson(CLOUD_LARGE_BACKUP_MANIFEST_FILE, {
    schema: "teambuilding-large-backup-v1",
    files: {},
    monthlyUsage: {}
  });
  const month = currentMonthKey();
  const limitBytes = Math.max(0, Number(settings.monthlyLargeFileLimitMb || 0)) * 1024 * 1024;
  let usedBytes = Math.max(0, Number(manifest.monthlyUsage?.[month] || 0));
  const candidates = scanLargeBackupFiles(sourceRoot).filter((file) => {
    const previous = manifest.files?.[file.relative];
    return !previous || previous.size !== file.size || previous.mtimeMs !== file.mtimeMs;
  });
  const task = {
    id: `large-backup-${Date.now()}`,
    state: "running",
    sourceRoot,
    startedAt: new Date().toISOString(),
    totalFiles: candidates.length,
    completedFiles: 0,
    skippedFiles: 0,
    failedFiles: 0,
    uploadedBytes: 0,
    monthlyUsedBytes: usedBytes,
    monthlyLimitBytes: limitBytes,
    percent: candidates.length ? 0 : 100,
    message: candidates.length ? "正在增量备份方案文件" : "没有需要上传的新文件"
  };
  largeCloudBackupTask = task;
  manifest.files ||= {};
  manifest.monthlyUsage ||= {};
  let consecutiveFailures = 0;

  for (const file of candidates) {
    if (limitBytes === 0 || usedBytes + file.size > limitBytes) {
      task.skippedFiles += 1;
      continue;
    }
    try {
      await uploadFile(config, file.path, `方案增量/${file.relative}`);
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures += 1;
      task.failedFiles += 1;
      task.skippedFiles += 1;
      task.lastFailedFile = file.relative;
      task.message = `有文件无法上传，已跳过并继续：${file.relative}`;
      manifest.lastTask = { ...task };
      writeJson(CLOUD_LARGE_BACKUP_MANIFEST_FILE, manifest);
      if (consecutiveFailures >= 3) {
        throw new Error(`连续 3 个文件上传失败，最后文件：${file.relative}；${error.message || "上传失败"}`);
      }
      continue;
    }
    usedBytes += file.size;
    task.completedFiles += 1;
    task.uploadedBytes += file.size;
    task.monthlyUsedBytes = usedBytes;
    task.percent = Math.round(((task.completedFiles + task.skippedFiles) / Math.max(1, candidates.length)) * 100);
    task.message = `已上传 ${task.completedFiles}/${candidates.length} 个文件`;
    manifest.files[file.relative] = {
      size: file.size,
      mtimeMs: file.mtimeMs,
      backedUpAt: new Date().toISOString()
    };
    manifest.monthlyUsage[month] = usedBytes;
    manifest.lastTask = { ...task };
    writeJson(CLOUD_LARGE_BACKUP_MANIFEST_FILE, manifest);
  }

  task.state = "completed";
  task.finishedAt = new Date().toISOString();
  task.percent = 100;
  task.message = task.skippedFiles
    ? `本月额度内上传 ${task.completedFiles} 个，${task.skippedFiles} 个跳过或留待下月`
    : `增量备份完成，共上传 ${task.completedFiles} 个文件`;
  manifest.monthlyUsage[month] = usedBytes;
  manifest.lastTask = { ...task };
  writeJson(CLOUD_LARGE_BACKUP_MANIFEST_FILE, manifest);
  return task;
}

function startLargeCloudBackup() {
  if (largeCloudBackupTask?.state === "running") return largeCloudBackupTask;
  const task = {
    id: `large-backup-${Date.now()}`,
    state: "starting",
    startedAt: new Date().toISOString(),
    percent: 0,
    message: "正在检查方案文件"
  };
  largeCloudBackupTask = task;
  setImmediate(async () => {
    try {
      await executeLargeCloudBackup();
    } catch (error) {
      const current = largeCloudBackupTask || task;
      largeCloudBackupTask = {
        ...current,
        state: "failed",
        finishedAt: new Date().toISOString(),
        message: error.message || "大文件备份失败"
      };
      const manifest = readJson(CLOUD_LARGE_BACKUP_MANIFEST_FILE, {
        schema: "teambuilding-large-backup-v1",
        files: {},
        monthlyUsage: {}
      });
      manifest.lastTask = { ...largeCloudBackupTask };
      writeJson(CLOUD_LARGE_BACKUP_MANIFEST_FILE, manifest);
    }
  });
  return task;
}

function cloudBackupIsDue(now = Date.now()) {
  const settings = getPageSettings().backup || {};
  if (settings.scheduleEnabled === false) return false;
  const metadata = readJson(CLOUD_BACKUP_META_FILE, {});
  const last = Date.parse(metadata.lastBackupAt || "");
  if (!Number.isFinite(last)) return true;
  return now - last >= Math.max(1, Number(settings.intervalHours || 24)) * 60 * 60 * 1000;
}

async function runScheduledCloudBackup() {
  if (!cloudBackupIsDue()) return;
  try {
    await runCloudBackupNow();
    if (getPageSettings().backup?.sourceRoot) startLargeCloudBackup();
  } catch (error) {
    const metadata = readJson(CLOUD_BACKUP_META_FILE, {});
    writeJson(CLOUD_BACKUP_META_FILE, {
      ...metadata,
      lastAttemptAt: new Date().toISOString(),
      lastResult: `自动备份未完成：${error.message}`
    });
  }
}

function syncHistoricalDedupLedger() {
  const settings = getWorkspaceSettings();
  return syncDedupLedger({
    ledgerFile: DEDUP_LEDGER_FILE,
    libraryRoot: settings.workPackage.libraryPath,
    downloadRoot: DOWNLOAD_ROOT,
    publishRoot: PUBLISH_ROOT
  });
}

function getDedupLedger() {
  if (!fs.existsSync(DEDUP_LEDGER_FILE)) return syncHistoricalDedupLedger();
  return readJson(DEDUP_LEDGER_FILE, {
    version: 1,
    updatedAt: "",
    localOnly: true,
    downloads: [],
    distributions: [],
    archives: [],
    imports: []
  });
}

function publicDedupStatus(ledger = getDedupLedger()) {
  const settings = getWorkspaceSettings();
  const historyFile = path.join(
    settings.workPackage.libraryPath,
    "_作品历史数据",
    "作品历史数据库.json"
  );
  return {
    ...ledgerStatus(ledger),
    production: productionHistoryStatus(historyFile),
    ledgerPath: DEDUP_LEDGER_FILE,
    dataRoot: path.dirname(DEDUP_LEDGER_FILE),
    localOnly: true,
    rules: {
      production: "整组图片 SHA-256 精确去重；64 位 dHash 只做视觉近似预警",
      downloads: "旧文案 SHA-256 仅作兼容提示，不再作为作品重复的主判据",
      mobile: "小红书与抖音同属手机组，任一平台使用后整组不可再分发",
      official: "公众号独立记录，只有人工确认上传完成才标记已使用"
    }
  };
}

function materialUsageKey(value) {
  return path.resolve(String(value || "")).toLowerCase();
}

function materialUsageFingerprint(entryPath) {
  const digests = safeList(entryPath)
    .filter((entry) => entry.isFile())
    .filter((entry) => imageExts.has(path.extname(entry.name).toLowerCase()) || textExts.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => {
      const filePath = path.join(entryPath, entry.name);
      return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
    })
    .sort();
  if (!digests.length) return "";
  return crypto.createHash("sha256").update(digests.join("\u0000")).digest("hex");
}

function materialFolderSignature(entryPath) {
  const stat = fs.statSync(entryPath, { bigint: true });
  const birth = stat.birthtimeNs ?? BigInt(Math.round(Number(stat.birthtimeMs || 0) * 1_000_000));
  return `${stat.dev}:${stat.ino}:${birth}`;
}

function getMaterialHashCache(cacheFile = MATERIAL_HASH_CACHE_FILE) {
  return readJson(cacheFile, { version: 1, updatedAt: "", entries: {} });
}

function materialFolderHash(entryPath, options = {}) {
  const cacheFile = options.cacheFile || MATERIAL_HASH_CACHE_FILE;
  const cache = options.cache || getMaterialHashCache(cacheFile);
  const key = materialUsageKey(entryPath);
  const signature = materialFolderSignature(entryPath);
  const direct = cache.entries?.[key];
  if (direct?.signature === signature && direct?.hash) return { hash: direct.hash, cache, changed: false };
  // Directory identity stays stable after a same-volume rename and remains distinct
  // even when two folders contain identical files. Content dedup uses a separate hash.
  const hash = crypto.createHash("sha256").update(`tb-folder-v1\u0000${signature}`).digest("hex");
  cache.entries = { ...(cache.entries || {}), [key]: { entryPath, signature, hash, updatedAt: new Date().toISOString() } };
  cache.updatedAt = new Date().toISOString();
  return { hash, cache, changed: true };
}

function getMaterialMetadataLedger(ledgerFile = MATERIAL_METADATA_LEDGER_FILE) {
  return readJson(ledgerFile, { version: 1, updatedAt: "", entries: {}, events: [] });
}

function inferMaterialMainTag(categoryName, itemName, preview) {
  const haystack = `${categoryName || ""} ${itemName || ""} ${preview || ""}`.toLowerCase();
  const gameKeywords = ["团建游戏", "团建小游戏", "小团建游戏", "聚会游戏", "破冰游戏", "团队游戏", "室内团建游戏", "户外团建游戏"];
  const guideKeywords = ["合集", "攻略", "好去处", "周边游", "大集合", "爬山", "一句话攻略"];
  if (gameKeywords.some((keyword) => haystack.includes(keyword))) return "团建游戏";
  if (guideKeywords.some((keyword) => haystack.includes(keyword))) return "合集攻略";
  return "团建转化";
}

function inferMaterialUsageCountFromPath(entryPath = "", categoryName = "", options = {}) {
  const source = `${categoryName || ""} ${entryPath || ""}`;
  const numeric = source.match(/(?:已使用|已上传|已制作)\s*(\d+)\s*次/i);
  if (numeric) return Math.max(0, Number(numeric[1]) || 0);
  const chinese = source.match(/(?:已使用|已上传|已制作)\s*(一次|两次|二次|三次)/i)?.[1] || "";
  if (chinese) return { "一次": 1, "两次": 2, "二次": 2, "三次": 3 }[chinese] || 0;

  // Canonical physical archive layout: the first folder directly below the
  // configured material root is `1`, `2`, `3`, ... . Only that direct segment
  // is trusted, so numbers in a post title or date cannot become usage data.
  const materialRoot = String(options.materialRoot || "").trim();
  if (materialRoot && entryPath) {
    const relative = path.relative(path.resolve(materialRoot), path.resolve(entryPath));
    const segments = relative.split(path.sep).filter(Boolean);
    const archiveFolder = segments[0] || "";
    if (/^[1-9]\d*$/.test(archiveFolder)) return Number(archiveFolder);
  }
  return 0;
}

function materialMetadataProfile(item, categoryName, options = {}) {
  const metadata = options.metadata || getMaterialMetadataLedger(options.ledgerFile);
  const hashResult = materialFolderHash(item.path, options);
  const saved = metadata.entries?.[hashResult.hash] || {};
  const automaticMainTag = inferMaterialMainTag(categoryName, item.name, item.preview);
  const automaticTags = inferMaterialTags(categoryName, item.name, item.preview);
  return {
    folderHash: hashResult.hash,
    mainTag: MATERIAL_MAIN_TAGS.includes(saved.mainTag) ? saved.mainTag : automaticMainTag,
    mainTagSource: MATERIAL_MAIN_TAGS.includes(saved.mainTag) ? "manual" : "automatic",
    tags: Array.from(new Set([...(automaticTags || []), ...(saved.tags || [])])),
    usageCount: Math.max(
      0,
      Number(saved.usageCount || 0),
      inferMaterialUsageCountFromPath(item.path, categoryName, {
        materialRoot: options.materialRoot || getWorkspaceSettings().materialRoot
      })
    ),
    updatedAt: saved.updatedAt || "",
    hashCache: hashResult.cache,
    hashCacheChanged: hashResult.changed
  };
}

function updateMaterialMetadata(body = {}, options = {}) {
  const ledgerFile = options.ledgerFile || MATERIAL_METADATA_LEDGER_FILE;
  const cacheFile = options.cacheFile || MATERIAL_HASH_CACHE_FILE;
  const indexFile = options.indexFile
    || (options.ledgerFile ? path.join(path.dirname(ledgerFile), "material-global-index.json") : MATERIAL_GLOBAL_INDEX_FILE);
  const materialRoot = path.resolve(options.materialRoot || getWorkspaceSettings().materialRoot);
  const entryPath = path.resolve(String(body.entryPath || "").trim());
  if (!String(body.entryPath || "").trim() || !isPathInside(materialRoot, entryPath) || !exists(entryPath)) {
    throw new Error("只能更新当前素材库中真实存在的素材");
  }
  const materialFiles = safeList(entryPath).filter((entry) => entry.isFile());
  const hasImage = materialFiles.some((entry) => imageExts.has(path.extname(entry.name).toLowerCase()));
  const hasText = materialFiles.some((entry) => textExts.has(path.extname(entry.name).toLowerCase()));
  if (!hasImage || !hasText) throw new Error("只能更新同时包含图片和文案的素材文件夹");
  const hashResult = materialFolderHash(entryPath, { cacheFile });
  const requestedFolderHash = String(body.folderHash || "").trim();
  if (requestedFolderHash && requestedFolderHash !== hashResult.hash) {
    throw new Error("素材文件夹已经变化，请刷新列表后再操作");
  }
  if (hashResult.changed) writeJson(cacheFile, hashResult.cache);
  const ledger = getMaterialMetadataLedger(ledgerFile);
  const previous = ledger.entries?.[hashResult.hash] || {};
  const requestedMainTag = String(body.mainTag || "").trim();
  if (requestedMainTag && requestedMainTag !== "自动" && !MATERIAL_MAIN_TAGS.includes(requestedMainTag)) {
    throw new Error("主标签只能是团建游戏、团建转化或合集攻略");
  }
  const tags = Array.isArray(body.tags)
    ? body.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 30)
    : (previous.tags || []);
  const physicalUsageCount = inferMaterialUsageCountFromPath(entryPath, "", { materialRoot });
  const usageCount = body.incrementUsage === true
    ? Math.max(0, Number(previous.usageCount || 0), physicalUsageCount) + 1
    : Math.max(0, Number(body.usageCount ?? previous.usageCount ?? 0));
  const now = new Date().toISOString();
  const record = {
    ...previous,
    folderHash: hashResult.hash,
    entryPath,
    name: String(body.name || path.basename(entryPath)),
    mainTag: requestedMainTag === "自动" ? "" : (requestedMainTag || previous.mainTag || ""),
    tags: Array.from(new Set(tags)),
    usageCount,
    updatedAt: now
  };
  ledger.entries = { ...(ledger.entries || {}), [hashResult.hash]: record };
  ledger.events = [...(ledger.events || []), {
    folderHash: hashResult.hash,
    entryPath,
    action: body.incrementUsage === true ? "increment-usage" : "update-tags",
    mainTag: record.mainTag,
    usageCount,
    recordedAt: now
  }].slice(-3000);
  ledger.updatedAt = now;
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
  writeJson(ledgerFile, ledger);
  patchMaterialGlobalIndexMetadata(entryPath, record, indexFile);
  return record;
}

function patchMaterialGlobalIndexMetadata(entryPath, record, indexFile = MATERIAL_GLOBAL_INDEX_FILE) {
  const snapshot = readJson(indexFile, null);
  if (!snapshot?.items?.length) return false;
  const item = snapshot.items.find((candidate) => materialUsageKey(candidate.path) === materialUsageKey(entryPath));
  if (!item) return false;
  item.mainTag = MATERIAL_MAIN_TAGS.includes(record.mainTag)
    ? record.mainTag
    : inferMaterialMainTag(item.categoryName, item.name, "");
  item.mainTagSource = MATERIAL_MAIN_TAGS.includes(record.mainTag) ? "manual" : "automatic";
  item.tags = Array.from(new Set([...(item.tags || []), ...(record.tags || [])]));
  item.usageCount = Math.max(0, Number(record.usageCount || 0));
  item.usageSource = record.usageSource || (item.usageCount ? "扩展实时记录" : "暂无使用证据");
  snapshot.stats = materialIndexStats(snapshot.items, snapshot.review || []);
  snapshot.metadataUpdatedAt = new Date().toISOString();
  writeJson(indexFile, snapshot);
  return true;
}

function getMaterialUsageLedger(ledgerFile = MATERIAL_USAGE_LEDGER_FILE) {
  return readJson(ledgerFile, {
    version: 1,
    updatedAt: "",
    entries: {},
    events: []
  });
}

function recordMaterialUsage(body = {}, options = {}) {
  const ledgerFile = options.ledgerFile || MATERIAL_USAGE_LEDGER_FILE;
  const metadataLedgerFile = options.metadataLedgerFile
    || (options.ledgerFile ? path.join(path.dirname(ledgerFile), "material-metadata-ledger.json") : MATERIAL_METADATA_LEDGER_FILE);
  const hashCacheFile = options.hashCacheFile
    || (options.ledgerFile ? path.join(path.dirname(ledgerFile), "material-hash-cache.json") : MATERIAL_HASH_CACHE_FILE);
  const materialRoot = path.resolve(options.materialRoot || getWorkspaceSettings().materialRoot);
  const entryPath = path.resolve(String(body.entryPath || "").trim());
  if (!String(body.entryPath || "").trim() || !isPathInside(materialRoot, entryPath) || !exists(entryPath)) {
    throw new Error("只能记录当前素材库中真实存在的素材");
  }
  const status = body.status === "used" ? "used" : "prepared";
  const now = new Date().toISOString();
  const ledger = getMaterialUsageLedger(ledgerFile);
  const key = materialUsageKey(entryPath);
  const fingerprint = materialUsageFingerprint(entryPath);
  const fingerprintMatch = fingerprint
    ? Object.values(ledger.entries || {}).find((entry) => entry.fingerprint === fingerprint) || null
    : null;
  const previous = ledger.entries?.[key] || fingerprintMatch || {};
  const record = {
    ...previous,
    entryPath,
    name: String(body.name || path.basename(entryPath)),
    status: previous.status === "used" ? "used" : status,
    preparedAt: previous.preparedAt || now,
    usedAt: status === "used" ? now : (previous.usedAt || ""),
    conversationUrl: String(body.conversationUrl || previous.conversationUrl || ""),
    fingerprint: fingerprint || previous.fingerprint || "",
    updatedAt: now
  };
  ledger.entries = { ...(ledger.entries || {}), [key]: record };
  ledger.events = [...(ledger.events || []), {
    entryPath,
    status,
    conversationUrl: record.conversationUrl,
    recordedAt: now
  }].slice(-2000);
  ledger.updatedAt = now;
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
  writeJson(ledgerFile, ledger);
  if (status === "used" && options.skipMetadataIncrement !== true) {
    try {
      updateMaterialMetadata({
        entryPath,
        name: record.name,
        incrementUsage: true
      }, {
        materialRoot,
        ledgerFile: metadataLedgerFile,
        cacheFile: hashCacheFile
      });
    } catch (error) {
      // Historical ledgers may contain image-only folders. Keep their usage
      // history valid while reserving the richer metadata ledger for real
      // image + copy material folders.
      if (!/同时包含图片和文案/.test(String(error?.message || ""))) throw error;
    }
  }
  return record;
}

function checkMaterialUsage(body = {}, options = {}) {
  const ledgerFile = options.ledgerFile || MATERIAL_USAGE_LEDGER_FILE;
  const materialRoot = path.resolve(options.materialRoot || getWorkspaceSettings().materialRoot);
  const entryPath = path.resolve(String(body.entryPath || "").trim());
  if (!String(body.entryPath || "").trim() || !isPathInside(materialRoot, entryPath) || !exists(entryPath)) {
    throw new Error("只能检查当前素材库中真实存在的素材");
  }
  const ledger = getMaterialUsageLedger(ledgerFile);
  const direct = ledger.entries?.[materialUsageKey(entryPath)] || null;
  const fingerprint = materialUsageFingerprint(entryPath);
  const matched = direct || (fingerprint
    ? Object.values(ledger.entries || {}).find((entry) => entry.fingerprint === fingerprint) || null
    : null);
  return {
    duplicate: matched?.status === "used",
    status: matched?.status || "unused",
    match: direct ? "path" : matched ? "fingerprint" : "",
    fingerprint,
    record: matched
  };
}

function moveWorkspaceEntry(body = {}, options = {}) {
  const sourceInput = String(body.sourcePath || "").trim();
  const targetInput = String(body.targetPath || "").trim();
  if (!sourceInput || !targetInput) throw new Error("需要提供要移动的文件夹和目标文件夹");
  const roots = (options.roots || (() => {
    const settings = getWorkspaceSettings();
    return [settings.materialRoot, settings.workPackage?.libraryPath];
  })()).filter(Boolean).map((root) => path.resolve(root));
  const sourcePath = path.resolve(sourceInput);
  const targetPath = path.resolve(targetInput);
  const samePath = (left, right) => path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
  const sourceRoot = roots.find((item) => isPathInside(item, sourcePath));
  const targetRoot = roots.find((item) => isPathInside(item, targetPath));
  if (sourceRoot && samePath(sourcePath, sourceRoot)) throw new Error("不能移动素材库或成品库根目录");
  if (!sourceRoot || !targetRoot || !samePath(sourceRoot, targetRoot)) {
    throw new Error("只能在同一个素材库或成品库内部移动");
  }
  if (!exists(sourcePath)) throw new Error("要移动的文件夹不存在");
  const sourceStat = fs.lstatSync(sourcePath);
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) throw new Error("只能移动真实文件夹，不能移动文件或软链接");
  if (!exists(targetPath)) throw new Error("目标必须是已存在的文件夹");
  const targetStat = fs.lstatSync(targetPath);
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) throw new Error("目标必须是已存在的真实文件夹");
  const realRoot = fs.realpathSync.native(sourceRoot);
  const realSource = fs.realpathSync.native(sourcePath);
  const realTarget = fs.realpathSync.native(targetPath);
  if (!isPathInside(realRoot, realSource) || !isPathInside(realRoot, realTarget)) {
    throw new Error("文件夹真实位置超出当前素材库或成品库");
  }
  if (samePath(sourcePath, targetPath) || isPathInside(sourcePath, targetPath)) {
    throw new Error("不能把文件夹移动到它自己或它的子文件夹里");
  }
  if (samePath(path.dirname(sourcePath), targetPath)) throw new Error("已经在这个文件夹里了");
  const destination = path.join(targetPath, path.basename(sourcePath));
  if (exists(destination)) throw new Error(`目标文件夹里已存在同名项：${path.basename(sourcePath)}`);
  fs.renameSync(sourcePath, destination);
  materialCategoryCache.clear();
  materialPostCache = null;
  materialLibraryCache = null;
  if (!options.roots) setImmediate(() => startMaterialGlobalIndexRefresh({ force: true }));
  return { from: sourcePath, to: destination };
}

function gptQuotaSnapshot(accountId = "", now = Date.now()) {
  const ledger = normalizeQuotaLedger(readJson(GPT_QUOTA_LEDGER_FILE, {}));
  const pageAccounts = getPageSettings().gptAuto?.accounts || [];
  for (const accountSettings of pageAccounts) {
    const account = ledger.accounts[accountSettings.id] || { events: [] };
    account.settings = {
      enabled: getPageSettings().gptAuto?.quotaReminderEnabled !== false,
      windowHours: accountSettings.windowHours,
      uploadLimit: accountSettings.uploadLimit,
      generationLimit: accountSettings.generationLimit
    };
    ledger.accounts[accountSettings.id] = account;
  }
  if (accountId) {
    const account = ledger.accounts[accountId] || { settings: {}, events: [] };
    return { accountId, ...rollingQuotaStatus(account, now) };
  }
  return {
    generatedAt: new Date(now).toISOString(),
    accounts: Object.fromEntries(Object.entries(ledger.accounts).map(([id, account]) => [
      id,
      { accountId: id, ...rollingQuotaStatus(account, now) }
    ]))
  };
}

function appendGptQuotaEvent(body = {}) {
  const accountId = String(body.accountId || "").trim();
  const ledger = recordQuotaEvent(readJson(GPT_QUOTA_LEDGER_FILE, {}), accountId, {
    kind: body.kind,
    count: body.count,
    requestId: body.requestId
  });
  const settings = getPageSettings().gptAuto?.accounts?.find((account) => account.id === accountId);
  if (settings) {
    ledger.accounts[accountId].settings = {
      enabled: getPageSettings().gptAuto?.quotaReminderEnabled !== false,
      windowHours: settings.windowHours,
      uploadLimit: settings.uploadLimit,
      generationLimit: settings.generationLimit
    };
  }
  writeJson(GPT_QUOTA_LEDGER_FILE, ledger);
  return gptQuotaSnapshot(accountId);
}

function readGptProductionCheckpoint(requestId = "") {
  const safeId = String(requestId || "").trim();
  if (!safeId || safeId.length > 160) return null;
  const saved = readJson(GPT_PRODUCTION_CHECKPOINT_FILE, { version: 1, items: {} });
  return saved.items?.[safeId] || null;
}

function writeGptProductionCheckpoint(body = {}) {
  const requestId = String(body.requestId || "").trim();
  if (!requestId || requestId.length > 160) throw new Error("生产检查点编号无效");
  const source = body.checkpoint && typeof body.checkpoint === "object" ? body.checkpoint : {};
  const checkpoint = {
    requestId,
    stage: String(source.stage || "").slice(0, 80),
    percent: Math.max(0, Math.min(100, Number(source.percent || 0))),
    // ── 状态机字段（V1.0 设计说明书） ──
    taskState: String(source.taskState || "").slice(0, 40),
    conversationUrl: String(source.conversationUrl || "").slice(0, 1000),
    sourceMaterialPath: String(source.sourceMaterialPath || "").slice(0, 4000),
    materialHash: String(source.materialHash || "").slice(0, 128),
    templateId: String(source.templateId || "").slice(0, 80),
    accountWindowId: String(source.accountWindowId || "").slice(0, 80),
    attachmentCount: Math.max(0, Math.min(99, Number(source.attachmentCount || 0))),
    promptHash: String(source.promptHash || "").slice(0, 128),
    // ── 计划与确认字段 ──
    plannedImageCount: Math.max(0, Math.min(30, Number(source.plannedImageCount || 0))),
    totalPlannedPages: Math.max(0, Math.min(30, Number(source.totalPlannedPages || 0))),
    batchExpectedPages: Math.max(0, Math.min(30, Number(source.batchExpectedPages || 0))),
    planText: String(source.planText || "").slice(0, 10_000),
    planSubmitted: Boolean(source.planSubmitted),
    confirmSentAt: String(source.confirmSentAt || "").slice(0, 40),
    confirmRetried: Boolean(source.confirmRetried),
    // ── 图片字段 ──
    imageSubmitted: Boolean(source.imageSubmitted),
    detectedImageCount: Math.max(0, Math.min(30, Number(source.detectedImageCount || 0))),
    generatedImageUrls: Array.isArray(source.generatedImageUrls)
      ? source.generatedImageUrls.map((item) => String(item || "").slice(0, 4000)).filter(Boolean).slice(0, 30)
      : [],
    imageGenerationDetectedAt: String(source.imageGenerationDetectedAt || "").slice(0, 40),
    firstImageReadyAt: String(source.firstImageReadyAt || "").slice(0, 40),
    lastImageReadyAt: String(source.lastImageReadyAt || "").slice(0, 40),
    // ── 文案字段 ──
    textSubmitted: Boolean(source.textSubmitted),
    copyText: String(source.copyText || "").slice(0, 200_000),
    copyTextPath: String(source.copyTextPath || "").slice(0, 2000),
    // ── 下载与打包字段 ──
    batchId: String(source.batchId || "").slice(0, 80),
    downloadRoot: String(source.downloadRoot || "").slice(0, 2000),
    downloadedFiles: Array.isArray(source.downloadedFiles)
      ? source.downloadedFiles.map((item) => String(item || "").slice(0, 2000)).filter(Boolean).slice(0, 30)
      : [],
    packagePath: String(source.packagePath || "").slice(0, 2000),
    // ── 限额与恢复字段 ──
    quotaDetectedAt: String(source.quotaDetectedAt || "").slice(0, 40),
    nextProbeAt: String(source.nextProbeAt || "").slice(0, 40),
    // ── 归档字段 ──
    usageUpdated: Boolean(source.usageUpdated),
    updatedAt: new Date().toISOString()
  };
  const saved = readJson(GPT_PRODUCTION_CHECKPOINT_FILE, { version: 1, items: {} });
  saved.version = 1;
  saved.items ||= {};
  saved.items[requestId] = checkpoint;
  const ordered = Object.values(saved.items).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 200);
  saved.items = Object.fromEntries(ordered.map((item) => [item.requestId, item]));
  saved.updatedAt = checkpoint.updatedAt;
  writeJson(GPT_PRODUCTION_CHECKPOINT_FILE, saved);
  return checkpoint;
}

function findRecoverableImageBatch(body = {}) {
  const expected = Math.max(1, Math.min(30, Number(body.expectedImageCount || 0)));
  const requestedRoot = String(body.downloadRoot || "").trim();
  const configuredRoot = String(readJson(WORKPKG_CONFIG_FILE, {}).image_inbox_path || "").trim();
  const authorizedRequestedRoot = resolveAuthorizedDownloadRoot(requestedRoot, {
    defaultRoot: DOWNLOAD_ROOT,
    configuredRoot
  });
  const roots = [...new Set([authorizedRequestedRoot, path.resolve(DOWNLOAD_ROOT)].filter(Boolean))]
    .filter((item) => exists(item) && fs.statSync(item).isDirectory());
  const groups = new Map();
  for (const root of roots) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const match = entry.name.match(/^chatgpt-workpkg-(\d{8}-\d{6}-[a-z0-9]{4})-(\d+)-of-(\d+)\.(?:png|jpe?g|webp)$/i);
      if (!match || Number(match[3]) !== expected) continue;
      const filePath = path.join(root, entry.name);
      const stat = fs.statSync(filePath);
      if (stat.size < 1_000) continue;
      const key = `${root}\0${match[1]}`;
      const group = groups.get(key) || { batchId: match[1], downloadRoot: root, files: [], newestMs: 0 };
      group.files.push({ index: Number(match[2]), path: filePath });
      group.newestMs = Math.max(group.newestMs, stat.mtimeMs);
      groups.set(key, group);
    }
  }
  const complete = [...groups.values()].filter((group) => {
    const indexes = [...new Set(group.files.map((file) => file.index))].sort((a, b) => a - b);
    return indexes.length === expected && indexes.every((value, index) => value === index + 1);
  }).sort((a, b) => b.newestMs - a.newestMs)[0];
  if (!complete) return null;
  return {
    count: expected,
    batchId: complete.batchId,
    downloadRoot: complete.downloadRoot,
    files: complete.files.sort((a, b) => a.index - b.index).map((file) => file.path),
    recoveredAt: new Date().toISOString()
  };
}

function safeArchiveDestination(targetRoot, sourcePath, fingerprint) {
  const baseName = path.basename(sourcePath);
  let destination = path.join(targetRoot, baseName);
  if (!exists(destination)) return destination;
  const suffix = String(fingerprint || crypto.createHash("sha256").update(sourcePath).digest("hex")).slice(0, 8);
  destination = path.join(targetRoot, `${baseName}（${suffix}）`);
  if (exists(destination)) throw new Error(`归档目录已存在同名素材：${path.basename(destination)}`);
  return destination;
}

function materialUsageDirectoryName(usageCount) {
  const count = Math.max(1, Number(usageCount) || 1);
  return String(count);
}

function archiveMaterialAfterProduction(body = {}) {
  const settings = getWorkspaceSettings();
  const materialRoot = path.resolve(settings.materialRoot);
  const sourceInput = String(body.entryPath || "").trim();
  if (!sourceInput) throw new Error("缺少要归档的素材文件夹");
  const sourcePath = path.resolve(sourceInput);
  if (!isPathInside(materialRoot, sourcePath) || sourcePath === materialRoot || !exists(sourcePath)) {
    throw new Error("只能归档当前素材库中的真实帖子文件夹");
  }
  const stat = fs.lstatSync(sourcePath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("只能归档真实文件夹");
  const metadata = updateMaterialMetadata({
    entryPath: sourcePath,
    name: path.basename(sourcePath),
    incrementUsage: true
  });
  const usageCount = Math.max(1, Number(metadata.usageCount || 1));
  const usageRecord = recordMaterialUsage({
    entryPath: sourcePath,
    name: path.basename(sourcePath),
    status: "used",
    conversationUrl: body.conversationUrl
  }, { skipMetadataIncrement: true });
  const targetRoot = path.join(materialRoot, materialUsageDirectoryName(usageCount));
  fs.mkdirSync(targetRoot, { recursive: true });
  const destination = safeArchiveDestination(targetRoot, sourcePath, usageRecord.fingerprint);
  if (path.resolve(path.dirname(sourcePath)).toLowerCase() !== path.resolve(targetRoot).toLowerCase()) {
    fs.renameSync(sourcePath, destination);
  } else if (path.resolve(sourcePath).toLowerCase() !== path.resolve(destination).toLowerCase()) {
    fs.renameSync(sourcePath, destination);
  }
  const finalPath = exists(destination) ? destination : sourcePath;
  updateMaterialMetadata({
    entryPath: finalPath,
    name: path.basename(finalPath),
    usageCount
  });
  const packageInput = String(body.packagePath || "").trim();
  const libraryRoot = path.resolve(settings.workPackage?.libraryPath || "");
  const packagePath = packageInput ? path.resolve(packageInput) : "";
  if (packagePath && libraryRoot && isPathInside(libraryRoot, packagePath) && exists(packagePath)) {
    const packageRecordFile = path.join(packagePath, "GPT作品记录.json");
    if (exists(packageRecordFile) && fs.statSync(packageRecordFile).isFile()) {
      try {
        const packageRecord = readJson(packageRecordFile, {});
        packageRecord.sourceMaterialPath ||= sourcePath;
        packageRecord.sourceMaterialName ||= path.basename(sourcePath);
        packageRecord.sourceMaterialArchivePath = finalPath;
        packageRecord.sourceMaterialUpdatedAt = new Date().toISOString();
        writeJson(packageRecordFile, packageRecord);
      } catch {
        // Archiving remains successful; the package record can be repaired
        // later from the append-only archive event.
      }
    }
  }
  const event = {
    recordedAt: new Date().toISOString(),
    requestId: String(body.requestId || ""),
    templateId: String(body.templateId || ""),
    conversationUrl: String(body.conversationUrl || ""),
    packagePath: String(body.packagePath || ""),
    from: sourcePath,
    to: finalPath,
    sourceMaterialPath: sourcePath,
    sourceMaterialArchivePath: finalPath,
    usageCount,
    fingerprint: usageRecord.fingerprint
  };
  fs.mkdirSync(path.dirname(GPT_PRODUCTION_ARCHIVE_LOG_FILE), { recursive: true });
  fs.appendFileSync(GPT_PRODUCTION_ARCHIVE_LOG_FILE, `${JSON.stringify(event)}\n`, "utf8");
  materialCategoryCache.clear();
  materialPostCache = null;
  materialLibraryCache = null;
  setImmediate(() => startMaterialGlobalIndexRefresh({ force: true }));
  return event;
}

function extensionProductSnapshot(collectionName = "") {
  const settings = getWorkspaceSettings();
  const distribution = getDistributionSnapshot({
    publishRoot: PUBLISH_ROOT,
    libraryRoot: settings.workPackage.libraryPath
  });
  const collections = (distribution.collections || []).map((collection) => ({
    name: collection.name,
    path: collection.sourcePath,
    type: collection.type,
    typeLabel: collection.typeLabel,
    itemCount: collection.itemCount,
    fileCount: collection.fileCount,
    bytes: collection.bytes,
    mobileAvailable: collection.dualPlatformEligible,
    officialAccount: collection.officialAccount
  }));
  const selected = collections.find((item) => item.name === collectionName);
  let works = [];
  if (selected?.path && isAllowedFile(selected.path) && exists(selected.path)) {
    works = safeList(selected.path)
      .filter((entry) => entry.isDirectory())
      .slice(0, 60)
      .map((entry) => {
        const workPath = path.join(selected.path, entry.name);
        const files = safeList(workPath)
          .filter((file) => file.isFile())
          .map((file) => path.join(workPath, file.name))
          .filter((file) => imageExts.has(path.extname(file).toLowerCase()) || textExts.has(path.extname(file).toLowerCase()));
        return {
          id: workPath,
          name: entry.name,
          path: workPath,
          imageCount: files.filter((file) => imageExts.has(path.extname(file).toLowerCase())).length,
          attachments: files.slice(0, 30)
        };
      });
  }
  return {
    root: settings.workPackage.libraryPath,
    batchSize: settings.workPackage.batchSize,
    collections,
    selected: selected || null,
    works
  };
}

function extensionProductTreeSnapshot(requestedPath = "", rootOverride = "") {
  const settings = getWorkspaceSettings();
  const root = path.resolve(rootOverride || settings.workPackage.libraryPath);
  const target = requestedPath
    ? path.resolve(requestedPath)
    : root;
  if (!isPathInside(root, target)) {
    throw new Error("只能读取当前成品库内部的文件夹");
  }
  if (!exists(target) || !fs.statSync(target).isDirectory()) {
    throw new Error("成品文件夹不存在或不是文件夹");
  }

  const entries = safeList(target).map((entry) => {
    const entryPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      const children = safeList(entryPath);
      const directFiles = children
        .filter((child) => child.isFile())
        .map((child) => path.join(entryPath, child.name));
      const attachments = directFiles.filter((file) => {
        const extension = path.extname(file).toLowerCase();
        return imageExts.has(extension) || textExts.has(extension);
      });
      return {
        id: entryPath,
        kind: "directory",
        name: entry.name,
        path: entryPath,
        hasChildren: children.length > 0,
        folderCount: children.filter((child) => child.isDirectory()).length,
        fileCount: directFiles.length,
        imageCount: attachments.filter((file) => imageExts.has(path.extname(file).toLowerCase())).length,
        textCount: attachments.filter((file) => textExts.has(path.extname(file).toLowerCase())).length,
        attachments: attachments.slice(0, 30)
      };
    }
    let size = 0;
    try {
      size = fs.statSync(entryPath).size;
    } catch {}
    const extension = path.extname(entry.name).toLowerCase();
    const uploadable = imageExts.has(extension) || textExts.has(extension);
    return {
      id: entryPath,
      kind: "file",
      name: entry.name,
      path: entryPath,
      size,
      uploadable,
      imageCount: imageExts.has(extension) ? 1 : 0,
      textCount: textExts.has(extension) ? 1 : 0,
      attachments: uploadable ? [entryPath] : []
    };
  });

  return {
    root,
    path: target,
    relativePath: path.relative(root, target),
    parentPath: target === root ? "" : path.dirname(target),
    entries
  };
}

function findCompletedWorkPackageByBatchId(productRoot, batchId, options = {}) {
  const root = path.resolve(String(productRoot || ""));
  const expectedBatchId = String(batchId || "").trim();
  if (!expectedBatchId || !exists(root) || !fs.statSync(root).isDirectory()) return "";
  const maximumDirectories = Math.max(100, Number(options.maximumDirectories || 10_000));
  const maximumDepth = Math.max(1, Number(options.maximumDepth || 6));
  const queue = [{ directory: root, depth: 0 }];
  let inspected = 0;
  let newest = null;
  while (queue.length && inspected < maximumDirectories) {
    const current = queue.shift();
    inspected += 1;
    const recordPath = path.join(current.directory, "GPT作品记录.json");
    if (exists(recordPath)) {
      const record = readJson(recordPath, {});
      if (String(record.batchId || "").trim() === expectedBatchId
        && String(record.status || "").toLowerCase() === "completed") {
        const recordedPath = String(record.packagePath || "").trim();
        const actualPath = recordedPath && exists(recordedPath) && fs.statSync(recordedPath).isDirectory()
          ? recordedPath
          : current.directory;
        const modifiedAt = fs.statSync(recordPath).mtimeMs;
        if (!newest || modifiedAt > newest.modifiedAt) newest = { path: actualPath, modifiedAt };
      }
    }
    if (current.depth >= maximumDepth) continue;
    for (const entry of safeList(current.directory)) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (/^\.workpkg_staging_/i.test(entry.name) || entry.name === "_作品历史数据") continue;
      queue.push({ directory: path.join(current.directory, entry.name), depth: current.depth + 1 });
    }
  }
  return newest?.path || "";
}

function saveExtensionCopyText(body = {}) {
  const copyText = String(body.copyText || "").trim();
  if (!copyText) throw new Error("本轮文案为空，未创建 TXT");
  const batchId = String(body.batchId || "").trim();
  if (!/^\d{8}-\d{6}-[a-z0-9]{4}$/i.test(batchId)) {
    throw new Error("本轮文案批次号无效，未创建 TXT");
  }
  const requestedRoot = String(body.downloadRoot || "").trim();
  const configuredRoot = String(readJson(WORKPKG_CONFIG_FILE, {}).image_inbox_path || "").trim();
  const targetRoot = resolveAuthorizedDownloadRoot(requestedRoot, {
    defaultRoot: DOWNLOAD_ROOT,
    configuredRoot
  });
  const stagingDir = path.join(targetRoot, ".gpt-copy-staging");
  fs.mkdirSync(stagingDir, { recursive: true });
  const target = path.join(stagingDir, `${batchId}.txt`);
  fs.writeFileSync(target, copyText, { encoding: "utf8" });
  return {
    ok: true,
    batchId,
    filename: target,
    bytes: Buffer.byteLength(copyText, "utf8"),
    copyTextLength: copyText.length
  };
}

function removeExtensionCopyText(root, batchId) {
  const safeBatchId = String(batchId || "").trim();
  if (!/^\d{8}-\d{6}-[a-z0-9]{4}$/i.test(safeBatchId)) return;
  const targetRoot = path.resolve(String(root || DOWNLOAD_ROOT));
  if (!isPathInside(path.resolve(DOWNLOAD_ROOT), targetRoot)) return;
  try {
    fs.rmSync(path.join(targetRoot, ".gpt-copy-staging", `${safeBatchId}.txt`), { force: true });
  } catch {
  }
}

function inspectGptWorkPackage(packagePath, expectedImageCount = 0) {
  const rawPath = String(packagePath || "").trim();
  if (!rawPath) return { valid: false, imageCount: 0, textCount: 0 };
  const target = path.resolve(rawPath);
  if (!exists(target)) return { valid: false, imageCount: 0, textCount: 0 };
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return { valid: false, imageCount: 0, textCount: 0 };
  }
  if (!stat.isDirectory()) return { valid: false, imageCount: 0, textCount: 0 };
  const imageExts = new Set([".png", ".jpg", ".jpeg", ".webp"]);
  const textExts = new Set([".txt"]);
  const entries = safeList(target);
  const imageCount = entries.filter((entry) => entry.isFile() && imageExts.has(path.extname(entry.name).toLowerCase())).length;
  const textCount = entries.filter((entry) => entry.isFile() && textExts.has(path.extname(entry.name).toLowerCase())).length;
  const plannedExpected = Math.max(0, Number(expectedImageCount || 0));
  const packageRecord = readJson(path.join(target, "GPT作品记录.json"), null);
  const recordedExpected = Math.max(0, Number(packageRecord?.expectedImageCount || 0));
  const recordedActual = Math.max(0, Number(packageRecord?.actualImages || 0));
  // ChatGPT can explicitly split a plan larger than ten pages into a first
  // 10-page publishable batch. The packager records the exact batch contract;
  // use it only when the completed record and the files on disk agree. This
  // prevents history sync from turning a verified 10/10 package back into a
  // false "12 pages missing 2" state while still rejecting partial folders.
  const recordMatchesDisk = packageRecord?.status === "completed"
    && recordedExpected > 0
    && recordedActual === recordedExpected
    && imageCount === recordedActual;
  const expected = recordMatchesDisk ? recordedExpected : plannedExpected;
  return {
    valid: imageCount > 0 && textCount > 0 && (expected === 0 || imageCount >= expected),
    imageCount,
    textCount,
    expectedImageCount: expected,
    plannedImageCount: plannedExpected,
    validatedByPackageRecord: recordMatchesDisk
  };
}

function runExtensionWorkPackage(body = {}) {
  const script = path.join(DOWNLOAD_ROOT, "make_work_package.ps1");
  if (!exists(script)) {
    throw new Error("本地打包程序不存在，请先在设置中恢复正式打包程序");
  }
  const clipboardText = String(body.clipboardText || "");
  if (!clipboardText.trim()) {
    throw new Error("请先复制本次作品文案，再执行打包");
  }
  const requestedDownloadRoot = String(body.downloadRoot || "").trim();
  const requestedProductRoot = String(body.productRoot || "").trim();
  const normalProductRoot = path.join(PROJECT_ROOT, "成品库（GPT+本地脚本制作）");
  const workspaceSettings = getWorkspaceSettings();
  const configuredProductRoot = String(workspaceSettings?.workPackage?.libraryPath || "").trim();
  const isAcceptancePath = (value) => /(?:^|[\\/])(?:_测试验收|验收)(?:[\\/]|$)/i.test(value);
  const effectiveRequestedDownloadRoot = isAcceptancePath(requestedDownloadRoot) ? DOWNLOAD_ROOT : requestedDownloadRoot;
  const effectiveRequestedProductRoot = isAcceptancePath(requestedProductRoot)
    ? normalProductRoot
    : (requestedProductRoot || configuredProductRoot || normalProductRoot);
  const effectiveDownloadRoot = requestedDownloadRoot
    ? path.resolve(effectiveRequestedDownloadRoot)
    : path.resolve(DOWNLOAD_ROOT);
  const effectiveProductRoot = path.resolve(effectiveRequestedProductRoot);
  const stageRoots = getWorkflowStageRoots(effectiveProductRoot);
  const configuredPackedRoot = String(getPageSettings()?.production?.packedRoot || "").trim();
  const effectivePortfolioOutputRoot = configuredPackedRoot
    ? path.resolve(configuredPackedRoot)
    : stageRoots.mobile;
  const configPath = path.join(DOWNLOAD_ROOT, "workpkg_config.json");
  const originalConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath) : null;
  let configRestored = false;
  const restoreWorkPackageConfig = () => {
    if (configRestored) return;
    configRestored = true;
    if (originalConfig) fs.writeFileSync(configPath, originalConfig);
    else fs.rmSync(configPath, { force: true });
  };
  // Manual buttons and the automatic state machine must execute against the
  // same concrete inbox/library pair.  The legacy packager reads these values
  // from workpkg_config.json, so leaving an older temporary path in that file
  // made a manual click diverge from an automatic run.
  if (!path.isAbsolute(effectiveDownloadRoot)) throw new Error("下载暂存目录必须是完整路径");
  if (!path.isAbsolute(effectiveProductRoot)) throw new Error("成品库目录必须是完整路径");
  if (!isPathInside(effectiveProductRoot, effectivePortfolioOutputRoot)) {
    throw new Error("作品集目录必须位于当前成品库内");
  }
  fs.mkdirSync(effectiveDownloadRoot, { recursive: true });
  fs.mkdirSync(effectiveProductRoot, { recursive: true });
  fs.mkdirSync(effectivePortfolioOutputRoot, { recursive: true });
  const config = readJson(configPath, {});
  config.image_inbox_path = effectiveDownloadRoot;
  config.library_path = effectiveProductRoot;
  config.portfolio_output_path = effectivePortfolioOutputRoot;
  config.portfolio_batch_size = Math.max(1, Math.min(100, Number(workspaceSettings?.workPackage?.batchSize || 7)));
  config.portfolio_auto_group = workspaceSettings?.workPackage?.autoGroup !== false;
  config.portfolio_auto_zip = workspaceSettings?.workPackage?.autoZip === true;
  writeJson(configPath, config);
  const batchId = String(body.batchId || "").trim();
  const expectedImageCount = Math.max(0, Number(body.expectedImageCount || 0));
  if (batchId && !/^\d{8}-\d{6}-[a-z0-9]{4}$/i.test(batchId)) {
    throw new Error("本次图片批次号无效，已停止打包");
  }
  if (batchId && expectedImageCount < 1) {
    throw new Error("本次图片数量无效，已停止打包");
  }
  const normalizedBodyTitle = normalizeWorkPackageTitle(body.title);
  const metadata = JSON.stringify({
    accountName: String(body.accountName || ""),
    conversationUrl: String(body.conversationUrl || ""),
    title: normalizedBodyTitle,
    sourceMaterialPath: String(body.sourceMaterialPath || "")
  });
  const args = [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", script,
    "-ClipboardTextOverride", clipboardText,
    "-ConversationMetadataJsonOverride", metadata,
    "-NoMessage"
  ];
  let taskFile = "";
  if (batchId) {
    // The PowerShell packager reads its task manifest from image_inbox_path.
    // Writing it to the global download root made every custom/acceptance
    // download directory fail with TASK_MISSING even though all images existed.
    taskFile = path.join(effectiveDownloadRoot, `chatgpt-workpkg-task-${batchId}.json`);
    const publishTitle = publishTitleFromClipboard(clipboardText, normalizedBodyTitle);
    writeJson(taskFile, {
      version: 1,
      batchId,
      expectedImageCount,
      copyText: clipboardText,
      accountName: String(body.accountName || ""),
      conversationUrl: String(body.conversationUrl || ""),
      sourceMaterialPath: String(body.sourceMaterialPath || ""),
      // Embedded automation has no trustworthy foreground browser title. A
      // login/security page title such as "验证你的身份 - OpenAI" used to leak
      // into the output folder name. Matching the conversation title to the
      // publish title keeps the existing packager naming logic deterministic.
      conversationTitle: publishTitle,
      title: normalizedBodyTitle,
      status: "ready",
      createdAt: new Date().toISOString()
    });
    args.push("-BatchId", batchId, "-ExpectedImageCount", String(expectedImageCount));
  }
  if (body.preview === true) args.push("-Preview");

  return new Promise((resolve, reject) => {
    const child = childProcess.spawn("powershell.exe", args, {
      cwd: DOWNLOAD_ROOT,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on("data", (chunk) => { stdoutChunks.push(Buffer.from(chunk)); });
    child.stderr.on("data", (chunk) => { stderrChunks.push(Buffer.from(chunk)); });
    child.on("error", (error) => {
      restoreWorkPackageConfig();
      reject(error);
    });
    child.on("close", (code) => {
      const decodeWindowsOutput = (chunks) => {
        const bytes = Buffer.concat(chunks);
        const utf8 = bytes.toString("utf8");
        if (!utf8.includes("\uFFFD")) return utf8;
        return new TextDecoder("gb18030").decode(bytes);
      };
      const stdout = decodeWindowsOutput(stdoutChunks);
      const stderr = decodeWindowsOutput(stderrChunks);
      restoreWorkPackageConfig();
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `打包程序退出码 ${code}`));
        return;
      }
      const output = stdout.trim();
      const fields = Object.fromEntries(output.split(/\r?\n/).map((line) => {
        const separator = line.indexOf("=");
        return separator > 0 ? [line.slice(0, separator), line.slice(separator + 1)] : null;
      }).filter(Boolean));
      if (body.preview !== true && /^DUPLICATE$/m.test(output)) {
        removeExtensionCopyText(effectiveDownloadRoot, batchId);
        resolve({
          ok: true,
          duplicate: true,
          skipped: true,
          duplicateReason: String(fields.DuplicateReason || "ExactImageSet"),
          deletedImages: Math.max(0, Number(fields.DeletedImages || 0)),
          batchId,
          expectedImageCount,
          packagePath: "",
          imageCount: 0,
          textFile: "",
          output
        });
        return;
      }
      if (body.preview !== true && !/^OK$/m.test(output)) {
        reject(new Error(output || "打包程序没有返回完成标记"));
        return;
      }
      let packagePath = String(fields.Folder || "").trim();
      if (body.preview !== true && batchId
        && (!packagePath || !exists(packagePath) || !fs.statSync(packagePath).isDirectory())) {
        // Windows PowerShell 5 may emit a Chinese path through an OEM code page
        // that happens to decode as valid (but wrong) UTF-8.  The package record
        // is UTF-8 JSON and is therefore the authoritative result channel.
        packagePath = findCompletedWorkPackageByBatchId(effectiveProductRoot, batchId) || packagePath;
      }
      if (body.preview !== true) {
        if (!packagePath || !exists(packagePath) || !fs.statSync(packagePath).isDirectory()) {
          reject(new Error("打包程序已结束，但没有找到成品文件夹"));
          return;
        }
        const packageFiles = fs.readdirSync(packagePath, { withFileTypes: true });
        const imageCount = packageFiles.filter((entry) =>
          entry.isFile() && imageExts.has(path.extname(entry.name).toLowerCase())
        ).length;
        const textCount = packageFiles.filter((entry) =>
          entry.isFile() && path.extname(entry.name).toLowerCase() === ".txt"
        ).length;
        if (expectedImageCount && imageCount !== expectedImageCount) {
          reject(new Error(`成品图片核对失败：${imageCount}/${expectedImageCount}`));
          return;
        }
        if (textCount < 1) {
          reject(new Error("成品文件夹没有 TXT 文案，已停止后续队列"));
          return;
        }
        removeExtensionCopyText(effectiveDownloadRoot, batchId);
      }
      resolve({
        ok: true,
        mode: "workbench-direct",
        fallback: false,
        preview: body.preview === true,
        batchId,
        expectedImageCount,
        packagePath,
        imageCount: Number(fields.Images || expectedImageCount || 0),
        textFile: String(fields.Txt || ""),
        output
      });
    });
  });
}

function getWorkspaceSettings() {
  const local = readJson(APP_SETTINGS_FILE, {});
  const workPackage = readJson(WORKPKG_CONFIG_FILE, {});
  const defaultMaterialRoot = path.join(PROJECT_ROOT, "01-素材库");
  return {
    materialRoot: path.resolve(local.materialRoot || defaultMaterialRoot),
    imageApi: publicImageApiSettings(local.imageApi),
    textApi: publicTextApiSettings(local.textApi),
    pageSettings: getPageSettings(),
    workPackage: {
      configFile: WORKPKG_CONFIG_FILE,
      scriptDirectory: path.dirname(WORKPKG_CONFIG_FILE),
      libraryPath: workPackage.library_path || path.join(PROJECT_ROOT, "成品库（GPT+本地脚本制作）"),
      batchSize: Number(workPackage.portfolio_batch_size || 14),
      autoGroup: workPackage.portfolio_auto_group !== false,
      autoZip: workPackage.portfolio_auto_zip !== false
    }
  };
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).reduce((result, line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) result[match[1]] = match[2].trim();
    return result;
  }, {});
}

function imageApiCredential(provider, suppliedKey = "") {
  if (String(suppliedKey).trim()) return String(suppliedKey).trim();
  const saved = readEnvFile(IMAGE_API_SECRET_FILE);
  if (provider === "minimax") {
    return saved.MINIMAX_IMAGE_API_KEY || process.env.TEAMBUILDING_MINIMAX_IMAGE_API_KEY
      || process.env.MINIMAXI_API_KEY || process.env.MINIMAX_API_KEY || "";
  }
  if (provider === "bytecat") {
    return saved.BYTECAT_IMAGE_API_KEY || process.env.TEAMBUILDING_BYTECAT_IMAGE_API_KEY || "";
  }
  return saved.LOCAL_IMAGE_API_KEY || process.env.TEAMBUILDING_IMAGE_API_KEY || "";
}

function textApiCredential(provider, suppliedKey = "") {
  if (String(suppliedKey).trim()) return String(suppliedKey).trim();
  const saved = readEnvFile(IMAGE_API_SECRET_FILE);
  if (provider === "minimax") {
    return saved.MINIMAX_TEXT_API_KEY || saved.MINIMAX_IMAGE_API_KEY
      || process.env.TEAMBUILDING_MINIMAX_TEXT_API_KEY
      || process.env.MINIMAXI_API_KEY || process.env.MINIMAX_API_KEY || "";
  }
  if (provider === "bytecat") {
    return saved.BYTECAT_TEXT_API_KEY || saved.BYTECAT_IMAGE_API_KEY
      || process.env.TEAMBUILDING_BYTECAT_TEXT_API_KEY || "";
  }
  return saved.LOCAL_TEXT_API_KEY || saved.LOCAL_IMAGE_API_KEY
    || process.env.TEAMBUILDING_TEXT_API_KEY || process.env.TEAMBUILDING_IMAGE_API_KEY || "";
}

function textGenerationConnection(suppliedKey = "") {
  const savedTextApi = readJson(APP_SETTINGS_FILE, {}).textApi || {};
  const config = normalizeTextApiConfig(savedTextApi);
  const apiKey = textApiCredential(config.provider, suppliedKey);
  if (apiKey) return { config, apiKey };
  const localApiKey = textApiCredential("local-openai");
  return localApiKey
    ? { config: normalizeTextApiConfig({ provider: "local-openai" }), apiKey: localApiKey }
    : { config, apiKey: "" };
}

const WORKBENCH_ASSISTANT_ACTIONS = new Set([
  "capabilities",
  "status",
  "open_tab",
  "open_settings",
  "detect_devices",
  "send_collection",
  "restock_device",
  "produce",
  "backup",
  "unclear"
]);

async function interpretWorkbenchAssistantCommand(command) {
  const cleanCommand = String(command || "").trim().slice(0, 500);
  if (!cleanCommand) return { action: "unclear", reply: "请告诉我想处理哪一步。" };
  const connection = textGenerationConnection();
  if (!connection.apiKey) throw new Error("当前没有可用的文案模型密钥");
  const prompt = [
    "你是团建工作台里的命令理解器，只负责理解意图，不执行操作。",
    "只返回一个 JSON 对象，不要 Markdown。",
    "允许的 action：capabilities,status,open_tab,open_settings,detect_devices,send_collection,restock_device,produce,backup,unclear。",
    "字段：action、tab、settings、deviceNumber、category、collection、count、reply。",
    "tab 只能是 dashboard、distribution、conversion、plugins、settings。",
    "settings 只能是 production、distribution、global、backup。",
    "category 只能是 conversion、traffic、unclassified、all。",
    "涉及发送但设备编号、作品集或分类不足时，action 必须是 unclear，并在 reply 里只追问缺少的信息。",
    "涉及删除、覆盖、陌生设备、任意系统命令时，action 必须是 unclear。",
    `用户原话：${cleanCommand}`
  ].join("\n");
  const raw = await generateText({
    config: connection.config,
    apiKey: connection.apiKey,
    prompt,
    model: connection.config.model
  });
  const jsonText = String(raw || "").replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const result = JSON.parse(jsonText);
  const action = WORKBENCH_ASSISTANT_ACTIONS.has(result?.action) ? result.action : "unclear";
  return {
    action,
    tab: ["dashboard", "distribution", "conversion", "plugins", "settings"].includes(result?.tab) ? result.tab : "",
    settings: ["production", "distribution", "global", "backup"].includes(result?.settings) ? result.settings : "",
    deviceNumber: String(result?.deviceNumber || "").replace(/\D/g, "").slice(0, 3),
    category: ["conversion", "traffic", "unclassified", "all"].includes(result?.category) ? result.category : "",
    collection: String(result?.collection || "").trim().slice(0, 100),
    count: Math.max(0, Math.min(100, Number(result?.count) || 0)),
    reply: String(result?.reply || "").trim().slice(0, 300)
  };
}

function publicImageApiSettings(value = {}) {
  const saved = readEnvFile(IMAGE_API_SECRET_FILE);
  const config = normalizeImageApiConfig({
    provider: value?.provider || saved.LOCAL_IMAGE_API_PROVIDER,
    baseUrl: value?.baseUrl || saved.LOCAL_IMAGE_API_BASE_URL,
    model: value?.model || saved.LOCAL_IMAGE_API_MODEL
  });
  return { ...config, credentialConfigured: Boolean(imageApiCredential(config.provider)), secretStoredLocally: true };
}

function publicTextApiSettings(value = {}) {
  const saved = readEnvFile(IMAGE_API_SECRET_FILE);
  const config = normalizeTextApiConfig({
    provider: value?.provider || saved.LOCAL_TEXT_API_PROVIDER,
    baseUrl: value?.baseUrl || saved.LOCAL_TEXT_API_BASE_URL,
    model: value?.model || saved.LOCAL_TEXT_API_MODEL
  });
  return { ...config, credentialConfigured: Boolean(textApiCredential(config.provider)), secretStoredLocally: true };
}

function saveImageApiSecret({ provider, baseUrl, model, apiKey }) {
  const existing = readEnvFile(IMAGE_API_SECRET_FILE);
  const config = normalizeImageApiConfig({ provider, baseUrl, model });
  const next = { ...existing };
  next.LOCAL_IMAGE_API_PROVIDER = config.provider;
  next.LOCAL_IMAGE_API_BASE_URL = config.baseUrl;
  next.LOCAL_IMAGE_API_MODEL = config.model;
  if (String(apiKey || "").trim()) {
    if (config.provider === "minimax") next.MINIMAX_IMAGE_API_KEY = String(apiKey).trim();
    else if (config.provider === "bytecat") next.BYTECAT_IMAGE_API_KEY = String(apiKey).trim();
    else next.LOCAL_IMAGE_API_KEY = String(apiKey).trim();
  }
  fs.mkdirSync(path.dirname(IMAGE_API_SECRET_FILE), { recursive: true });
  const lines = [
    "# 团建工作台本机生图凭据。禁止提交仓库、日志或导出包。",
    "# 界面只返回是否已配置，不会回传密钥明文。",
    ...Object.entries(next).map(([key, value]) => `${key}=${value}`)
  ];
  fs.writeFileSync(IMAGE_API_SECRET_FILE, `${lines.join("\n")}\n`, "utf8");
  return config;
}

function saveTextApiSecret({ provider, baseUrl, model, apiKey }) {
  const existing = readEnvFile(IMAGE_API_SECRET_FILE);
  const config = normalizeTextApiConfig({ provider, baseUrl, model });
  const next = { ...existing };
  next.LOCAL_TEXT_API_PROVIDER = config.provider;
  next.LOCAL_TEXT_API_BASE_URL = config.baseUrl;
  next.LOCAL_TEXT_API_MODEL = config.model;
  if (String(apiKey || "").trim()) {
    if (config.provider === "minimax") next.MINIMAX_TEXT_API_KEY = String(apiKey).trim();
    else if (config.provider === "bytecat") next.BYTECAT_TEXT_API_KEY = String(apiKey).trim();
    else next.LOCAL_TEXT_API_KEY = String(apiKey).trim();
  }
  fs.mkdirSync(path.dirname(IMAGE_API_SECRET_FILE), { recursive: true });
  const lines = [
    "# 团建工作台本机 API 凭据。禁止提交仓库、日志或导出包。",
    "# 界面只返回是否已配置，不会回传密钥明文。",
    ...Object.entries(next).map(([key, value]) => `${key}=${value}`)
  ];
  fs.writeFileSync(IMAGE_API_SECRET_FILE, `${lines.join("\n")}\n`, "utf8");
  return config;
}

function safeOutputName(value) {
  return String(value || "待审作品").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 70) || "待审作品";
}

function collectReferenceImages(folderPath, limit = 4) {
  if (!folderPath || !isAllowedFile(folderPath) || !exists(folderPath) || !fs.statSync(folderPath).isDirectory()) return [];
  return safeList(folderPath)
    .filter((entry) => entry.isFile() && imageExts.has(path.extname(entry.name).toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }))
    .slice(0, limit)
    .map((entry) => path.join(folderPath, entry.name));
}

function materialFacts(folderPath) {
  if (!folderPath || !isAllowedFile(folderPath) || !exists(folderPath)) return "";
  return safeList(folderPath)
    .filter((entry) => entry.isFile() && textExts.has(path.extname(entry.name).toLowerCase()))
    .slice(0, 3)
    .map((entry) => readPromptFile(path.join(folderPath, entry.name)))
    .join("\n")
    .slice(0, 12000);
}

function buildProductionPrompt(body, facts) {
  const userPrompt = String(body.prompt || "").trim().slice(0, 16000);
  return [
    "你正在执行严格的轮播母版迁移，不是自由设计。第一组参考图是A类永久视觉母版，后续参考图是B类内容素材。",
    "锁定母版的字体气质、字号比例、配色、标题位置、拼图骨架和页面气质；只从素材提取真实内容。",
    "禁止继承素材自身排版，禁止虚构地点、项目、价格、车程或场景，禁止新增素材和事实中没有的露营、篝火、建筑等内容。",
    "业务口径：江浙沪企业团建，10人起接。没有明确价格则不出现价格。人物、分区和道具应去重，保持真实手机抓拍感。",
    "每次只生成一张独立3:4图片，所有关键信息与人物必须放在画面中央安全区，便于落盘时统一裁切为1200×1600。不得输出多页合集、长图、缩略图墙或样机展示。中文必须准确。",
    "校准图禁止自行添加01/08、1/9等页码或总页数；只有正式整套计划明确给出准确页数时才能显示页码。",
    `本次阶段：${body.stage === "inner" ? "典型内页校准" : "封面校准"}。质量档：${body.quality || "标准"}。`,
    userPrompt ? `用户补充要求：\n${userPrompt}` : "",
    facts ? `素材事实（只能从这里取业务事实）：\n${facts}` : ""
  ].filter(Boolean).join("\n\n");
}

function productionPlanId(plans, mode) {
  return crypto.createHash("sha256")
    .update(JSON.stringify({ mode, plans: plans.map((plan) => ({
      materialPath: plan.materialPath,
      templatePath: plan.templatePath,
      pageCount: plan.pageCount,
      pages: plan.pages.map((page) => ({ role: page.role, title: page.title, sourceImage: page.sourceImage }))
    })) }))
    .digest("hex")
    .slice(0, 20);
}

async function createProductionPlans(body) {
  const templatePath = path.resolve(String(body.templatePath || ""));
  if (!isAllowedFile(templatePath) || !exists(templatePath)) throw new Error("请选择真实存在的模板文件夹");
  const requested = Array.isArray(body.materialPaths) && body.materialPaths.length
    ? body.materialPaths
    : [body.materialPath];
  const materialPaths = [...new Set(requested.map((item) => path.resolve(String(item || ""))).filter(Boolean))]
    .slice(0, 50);
  if (!materialPaths.length) throw new Error("请选择要生产的素材");
  const mode = materialPaths.length > 1 ? "batch" : "set";
  let plans = materialPaths.map((materialPath, index) => {
    if (!isAllowedFile(materialPath) || !exists(materialPath)) throw new Error(`素材文件夹不存在：${materialPath}`);
    const materialImages = collectReferenceImages(materialPath, 10);
    if (!materialImages.length) throw new Error(`素材文件夹中没有可用图片：${path.basename(materialPath)}`);
    const plan = buildProductionPlan({
      mode: "set",
      materialPath,
      templatePath,
      materialImages,
      facts: materialFacts(materialPath),
      requestedPages: body.requestedPages,
      batchIndex: index
    });
    return plan;
  });
  const titleConnection = textGenerationConnection();
  if (titleConnection.apiKey) {
    plans = await Promise.all(plans.map(async (plan) => {
      try {
        const titlePrompt = [
          "请根据团建素材事实为轮播出图计划提炼短标题。只返回严格 JSON，不要 Markdown。",
          `格式：{"workTitle":"作品总标题","pages":[{"title":"P1标题"},{"title":"P2标题"}]}`,
          `必须正好返回 ${plan.pageCount} 个 pages。workTitle 4—12 个中文字符；内页标题 2—8 个中文字符。`,
          "不得使用 emoji、括号、序号、夸张词、HR话术、无限、必看、快收藏、咨询、报价、全包。",
          "只能提取素材明确出现的地点和项目，不得虚构。P1是作品主题；后续每页各自一个不同项目。",
          `原文件夹名：${path.basename(plan.materialPath)}`,
          `素材事实：\n${materialFacts(plan.materialPath)}`
        ].join("\n\n");
        const raw = await generateText({
          config: titleConnection.config,
          apiKey: titleConnection.apiKey,
          prompt: titlePrompt,
          model: String(body.textModel || titleConnection.config.model).trim() || titleConnection.config.model
        });
        const jsonText = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
        return applySuggestedTitles(plan, JSON.parse(jsonText));
      } catch {
        return plan;
      }
    }));
  }
  const id = productionPlanId(plans, mode);
  const planBundle = {
    id,
    mode,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    plans,
    totals: {
      works: plans.length,
      images: plans.reduce((sum, plan) => sum + plan.pageCount, 0),
      copyFiles: plans.length
    }
  };
  pendingProductionPlans.set(id, planBundle);
  return planBundle;
}

function publicProductionJob(job) {
  const imageResults = (job.results || []).filter((item) => item.type === "image");
  return {
    id: job.id,
    planId: job.planId,
    mode: job.mode,
    status: job.status,
    phase: job.phase,
    message: job.message,
    progress: job.progress,
    total: job.total,
    remaining: Math.max(0, Number(job.total || 0) - Number(job.progress || 0)),
    runScope: job.options?.runScope || "full",
    generationRequestCount: imageResults.reduce(
      (sum, item) => sum + Number(item.requestMeta?.requestCount || 0),
      0
    ),
    generationAttemptCount: imageResults.reduce(
      (sum, item) => sum + Number(item.requestMeta?.attemptCount || 0),
      0
    ),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt || "",
    finishedAt: job.finishedAt || "",
    durationMs: job.startedAt
      ? Math.max(0, new Date(
        job.finishedAt || (job.status === "running" ? Date.now() : job.updatedAt || Date.now())
      ).getTime() - new Date(job.startedAt).getTime())
      : 0,
    outputRoots: job.outputRoots || [],
    results: (job.results || []).map((item) => ({
      ...item,
      previewUrl: item.outputFile ? `/file?path=${encodeURIComponent(item.outputFile)}` : ""
    })),
    failures: job.failures || [],
    qualityReports: job.qualityReports || [],
    resumable: ["calibration-ready", "interrupted", "failed", "needs-rework", "cancelled"].includes(job.status),
    cancelable: job.status === "running",
    error: job.error || ""
  };
}

function safeProductionOptions(options = {}) {
  const config = normalizeImageApiConfig(options);
  const textConfig = normalizeTextApiConfig(readJson(APP_SETTINGS_FILE, {}).textApi || {});
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    quality: String(options.quality || "严格母版").slice(0, 100),
    prompt: String(options.prompt || "").slice(0, 30_000),
    textModel: String(options.textModel || textConfig.model).slice(0, 200),
    outputPrefix: safeOutputName(String(options.outputPrefix || "")).slice(0, 40),
    runScope: String(options.runScope || "") === "calibration" ? "calibration" : "full"
  };
}

function productionRequestSummary(results, work) {
  const images = (results || []).filter((item) => item.type === "image" && item.work === work);
  return {
    imageCount: images.length,
    paidGenerationRequests: images.reduce(
      (sum, item) => sum + Number(item.requestMeta?.requestCount || 0),
      0
    ),
    generationAttempts: images.reduce(
      (sum, item) => sum + Number(item.requestMeta?.attemptCount || 0),
      0
    ),
    automaticPaidRetries: 0,
    pages: images.map((item) => ({
      page: item.page,
      provider: item.provider,
      model: item.model,
      referenceCount: Number(item.requestMeta?.referenceCount || 0),
      providerRequestId: item.requestMeta?.providerRequestId || "",
      attempts: item.requestMeta?.attempts || [],
      usage: item.requestMeta?.usage || null,
      durationMs: item.durationMs
    }))
  };
}

function productionResumeScope(job = {}) {
  if (job.status === "calibration-ready") return "full";
  return job.options?.runScope === "calibration" ? "calibration" : "full";
}

function productionPageAllowed(runScope, planIndex, pageCode, firstPageCode) {
  if (runScope !== "calibration") return true;
  return Number(planIndex) === 0 && String(pageCode || "") === String(firstPageCode || "");
}

function saveProductionJob(job) {
  fs.mkdirSync(PRODUCTION_JOB_ROOT, { recursive: true });
  writeJson(path.join(PRODUCTION_JOB_ROOT, `${job.id}.json`), {
    ...job,
    options: safeProductionOptions(job.options || {}),
    planBundle: job.planBundle || null
  });
}

function loadProductionJobs() {
  fs.mkdirSync(PRODUCTION_JOB_ROOT, { recursive: true });
  for (const entry of safeList(PRODUCTION_JOB_ROOT)) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const saved = readJson(path.join(PRODUCTION_JOB_ROOT, entry.name), null);
    if (!saved?.id || !saved?.planBundle) continue;
    if (saved.status === "running") {
      saved.status = "interrupted";
      saved.phase = "interrupted";
      saved.message = "应用曾在生产中关闭，已保留进度，可以继续生产。";
      saved.updatedAt = new Date().toISOString();
      saved.cancelRequested = false;
    }
    productionJobs.set(saved.id, saved);
  }
}

function updateProductionJob(job, patch) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  productionJobs.set(job.id, job);
  saveProductionJob(job);
}

async function runProductionJob(job, planBundle, options) {
  const config = normalizeImageApiConfig(options);
  const apiKey = imageApiCredential(config.provider, options.apiKey);
  if (!apiKey) throw new Error("没有找到这个平台的本机密钥");
  const textConnection = textGenerationConnection(options.textApiKey);
  const abortController = new AbortController();
  productionAbortControllers.set(job.id, abortController);
  job.planBundle = planBundle;
  job.options = safeProductionOptions(options);
  const calibrationOnly = job.options.runScope === "calibration";
  const uniqueResults = new Map();
  for (const item of job.results || []) {
    if (!item?.type || !item?.outputFile || !exists(item.outputFile)) continue;
    const key = item.type === "image"
      ? `image:${item.work || ""}:${item.page || ""}`
      : `${item.type}:${item.work || ""}:${item.outputFile}`;
    uniqueResults.set(key, item);
  }
  job.results = [...uniqueResults.values()];
  job.failures = [];
  job.qualityReports = [];
  job.cancelRequested = false;
  job.startedAt ||= new Date().toISOString();
  job.finishedAt = "";
  updateProductionJob(job, {
    status: "running",
    phase: "starting",
    message: calibrationOnly
      ? "省钱校准模式：本次只生成第一套作品的首张封面，只发起 1 次付费生图请求"
      : "首图已确认，正在核对已完成页面并继续生成剩余内容",
    error: ""
  });
  let completed = job.results.filter((item) => item.type === "image").length;
  for (const [planIndex, plan] of planBundle.plans.entries()) {
    if (job.cancelRequested) break;
    if (calibrationOnly && planIndex > 0) break;
    const facts = materialFacts(plan.materialPath);
    const templateImages = collectReferenceImages(plan.templatePath, 5);
    const materialImages = collectReferenceImages(plan.materialPath, 10);
    if (!templateImages.length) {
      job.failures.push({ work: plan.materialName, phase: "prepare", message: `模板中没有可用参考图：${plan.templateName}` });
      continue;
    }
    job.workRoots ||= {};
    const workKey = String(planIndex);
    if (!job.workRoots[workKey]) {
      const outputPrefix = safeOutputName(String(options.outputPrefix || ""));
      const folderName = `${outputPrefix}${job.createdAt.slice(0, 10).replaceAll("-", "")}_${safeOutputName(plan.materialName)}_${safeOutputName(plan.recipe.name)}_${job.id.slice(-6)}`;
      job.workRoots[workKey] = path.join(IMAGE_REVIEW_ROOT, folderName);
    }
    const outputRoot = job.workRoots[workKey];
    fs.mkdirSync(outputRoot, { recursive: true });
    job.outputRoots = [...new Set([...(job.outputRoots || []), outputRoot])];
    writeJson(path.join(outputRoot, "出图计划.json"), plan);
    for (const page of plan.pages) {
      if (job.cancelRequested) break;
      if (!productionPageAllowed(job.options.runScope, planIndex, page.code, planBundle.plans[0]?.pages[0]?.code)) break;
      const existing = (job.results || []).find((item) => (
        item.type === "image"
        && item.work === plan.materialName
        && item.page === page.code
        && exists(item.outputFile)
      ));
      if (existing) {
        if (calibrationOnly) {
          updateProductionJob(job, {
            status: "calibration-ready",
            phase: "calibration-ready",
            finishedAt: new Date().toISOString(),
            message: `首张校准图已存在。本批剩余 ${Math.max(0, job.total - completed)} 张尚未调用接口；确认后再继续。`,
            progress: completed
          });
          return;
        }
        updateProductionJob(job, {
          phase: "resuming",
          message: `${plan.materialName} · ${page.code} 已完成，继续下一页`,
          progress: completed
        });
        continue;
      }
      const pageStartedAt = Date.now();
      updateProductionJob(job, {
        phase: "generating-images",
        message: `正在做 ${plan.materialName} · ${page.code} ${page.title}`,
        progress: completed
      });
      const templateRef = page.role === "cover"
        ? templateImages[0]
        : (templateImages[Math.min(1, templateImages.length - 1)] || templateImages[0]);
      const pageMaterial = page.sourceImage && exists(page.sourceImage)
        ? page.sourceImage
        : materialImages[Math.min(page.index - 1, materialImages.length - 1)];
      // Keep each request small and deterministic. The local image bridge becomes
      // unreliable with a large multipart payload; one master page plus one source
      // image is enough to lock the layout while preserving the real scene.
      const referencePaths = [templateRef, pageMaterial];
      const prompt = buildPagePrompt(plan, page, facts, options.prompt, options.quality);
      const failedAttemptAudit = [];
      try {
        const generated = await generateImages({
          config,
          apiKey,
          prompt,
          referencePaths: [...new Set(referencePaths.filter(Boolean))].slice(0, 8),
          outputRoot,
          count: 1,
          retryOptions: {
            attempts: 1,
            delays: [],
            onAttempt: (entry) => failedAttemptAudit.push(entry)
          },
          signal: abortController.signal
        });
        const original = generated[0];
        const extension = path.extname(original.outputFile);
        const finalFile = path.join(outputRoot, `${page.code}_${safeOutputName(page.title)}${extension}`);
        if (exists(finalFile)) fs.rmSync(finalFile, { force: true });
        fs.renameSync(original.outputFile, finalFile);
        job.results.push({
          type: "image",
          work: plan.materialName,
          page: page.code,
          title: page.title,
          outputFile: finalFile,
          bytes: original.bytes,
          width: original.width,
          height: original.height,
          provider: original.provider,
          model: original.model,
          requestMeta: original.requestMeta || {
            requestCount: 1,
            attemptCount: 1,
            attempts: [],
            referenceCount: referencePaths.filter(Boolean).length,
            usage: null
          },
          durationMs: Date.now() - pageStartedAt
        });
        completed += 1;
        if (calibrationOnly) {
          writeJson(path.join(outputRoot, "生产记录.json"), {
            status: "calibration-ready",
            createdAt: new Date().toISOString(),
            plan,
            provider: config.provider,
            imageModel: config.model,
            textModel: options.textModel || textConnection.config.model,
            requestSummary: productionRequestSummary(job.results, plan.materialName),
            note: "省钱校准模式只生成首张封面。确认首图后才会生成剩余页面与文案。",
            officialLibraryWritten: false,
            files: job.results.filter((item) => item.work === plan.materialName).map((item) => item.outputFile)
          });
          updateProductionJob(job, {
            status: "calibration-ready",
            phase: "calibration-ready",
            progress: completed,
            finishedAt: new Date().toISOString(),
            message: `首张校准图已生成。本次仅调用 1 次、未自动重试；剩余 ${Math.max(0, job.total - completed)} 张尚未调用接口。请先看图，再决定是否继续整套。`
          });
          return;
        }
        updateProductionJob(job, { progress: completed });
      } catch (error) {
        job.failures.push({
          work: plan.materialName,
          page: page.code,
          phase: "image",
          message: String(error?.message || error).slice(0, 500),
          requestMeta: {
            requestCount: 1,
            attemptCount: failedAttemptAudit.length,
            attempts: failedAttemptAudit,
            referenceCount: [...new Set(referencePaths.filter(Boolean))].length,
            provider: config.provider,
            model: config.model,
            automaticPaidRetries: 0
          }
        });
        if (calibrationOnly) {
          writeJson(path.join(outputRoot, "生产记录.json"), {
            status: "calibration-failed",
            createdAt: new Date().toISOString(),
            plan,
            provider: config.provider,
            imageModel: config.model,
            requestSummary: {
              paidGenerationRequests: 1,
              generationAttempts: failedAttemptAudit.length,
              automaticPaidRetries: 0,
              failedPage: page.code,
              attempts: failedAttemptAudit
            },
            failure: String(error?.message || error).slice(0, 500),
            officialLibraryWritten: false,
            files: []
          });
          updateProductionJob(job, {
            status: "failed",
            phase: "calibration-failed",
            finishedAt: new Date().toISOString(),
            message: `${plan.materialName} · ${page.code} 首张校准图生成失败；为避免继续扣费，后续页面没有调用接口。`,
            progress: completed
          });
          return;
        }
        updateProductionJob(job, {
          message: `${plan.materialName} · ${page.code} 生成失败，已记录并继续下一页`,
          progress: completed
        });
      }
    }
    const copyFile = path.join(outputRoot, "小红书文案.txt");
    const existingCopy = (job.results || []).find((item) => item.type === "copy"
      && item.work === plan.materialName && exists(item.outputFile));
    if (!job.cancelRequested && !existingCopy) {
      updateProductionJob(job, {
        phase: "generating-copy",
        message: `正在写 ${plan.materialName} 的小红书文案`
      });
      const copyStartedAt = Date.now();
      try {
        const copy = await generateText({
          config: textConnection.config,
          apiKey: textConnection.apiKey,
          prompt: buildCopyPrompt(plan, facts),
          model: String(options.textModel || textConnection.config.model).trim() || textConnection.config.model
        });
        fs.writeFileSync(copyFile, `${copy}\n`, "utf8");
        job.results.push({
          type: "copy",
          work: plan.materialName,
          outputFile: copyFile,
          bytes: Buffer.byteLength(copy),
          durationMs: Date.now() - copyStartedAt
        });
      } catch (error) {
        job.failures.push({
          work: plan.materialName,
          phase: "copy",
          message: String(error?.message || error).slice(0, 500)
        });
      }
    }
    updateProductionJob(job, {
      phase: "quality-check",
      message: `正在检查 ${plan.materialName} 的数量、尺寸、重复图和文案`
    });
    const quality = await inspectProductionQuality({
      plan,
      outputRoot,
      results: job.results,
      startedAt: job.startedAt,
      finishedAt: new Date().toISOString()
    });
    const qualityJsonFile = path.join(outputRoot, "质量报告.json");
    const qualityTextFile = path.join(outputRoot, "质量报告.txt");
    job.qualityReports.push({ ...quality, reportFile: qualityTextFile });
    writeJson(qualityJsonFile, quality);
    fs.writeFileSync(qualityTextFile, qualityReportText(quality), "utf8");
    writeJson(path.join(outputRoot, "生产记录.json"), {
      status: quality.status,
      createdAt: new Date().toISOString(),
      plan,
      provider: config.provider,
      imageModel: config.model,
      textModel: options.textModel || textConnection.config.model,
      requestSummary: productionRequestSummary(job.results, plan.materialName),
      failedRequests: job.failures.filter((item) => item.work === plan.materialName && item.phase === "image"),
      quality,
      officialLibraryWritten: false,
      files: job.results.filter((item) => item.work === plan.materialName).map((item) => item.outputFile)
    });
  }
  if (job.cancelRequested) {
    updateProductionJob(job, {
      status: "cancelled",
      phase: "cancelled",
      finishedAt: new Date().toISOString(),
      message: "任务已停止，已完成页面和文案均已保留，可稍后继续。"
    });
    return;
  }
  const hasQualityFailures = job.qualityReports.some((report) => report.failures?.length);
  const finalStatus = job.failures.length || hasQualityFailures ? "needs-rework" : "review-ready";
  updateProductionJob(job, {
    status: finalStatus,
    phase: "completed",
    progress: completed,
    finishedAt: new Date().toISOString(),
    message: finalStatus === "review-ready"
      ? `${planBundle.plans.length} 套作品已生成并完成自动检查；请按质量报告做最终看图确认。`
      : `本批已继续完成可生成页面；有 ${job.failures.length} 项需要重试或人工处理。`
  });
}

function mergeCollectionLedger(collections) {
  const saved = readJson(COLLECTION_LEDGER_FILE, { records: [] });
  const existing = new Map((saved.records || []).map((record) => [record.name, record]));
  let changed = false;
  const records = collections.map((collection) => {
    const previous = existing.get(collection.name);
    if (previous) return previous;
    changed = true;
    return {
      name: collection.name,
      type: collection.type,
      tags: [],
      note: "",
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  });
  const activeNames = new Set(collections.map((collection) => collection.name));
  (saved.records || []).forEach((record) => {
    if (!activeNames.has(record.name)) records.push({ ...record, missing: true });
  });
  if (changed || !exists(COLLECTION_LEDGER_FILE)) {
    writeJson(COLLECTION_LEDGER_FILE, { version: 1, records });
  }
  const recordMap = new Map(records.map((record) => [record.name, record]));
  return collections.map((collection) => {
    const record = recordMap.get(collection.name);
    return {
      ...collection,
      type: collection.type,
      typeLabel: collection.typeLabel,
      ledger: record || null
    };
  });
}

function updateCollectionLedger(body) {
  const name = String(body.name || "").trim();
  if (!name) throw new Error("作品集名称不能为空");
  const data = readJson(COLLECTION_LEDGER_FILE, { version: 1, records: [] });
  const record = (data.records || []).find((item) => item.name === name);
  if (!record) throw new Error("作品集台账中不存在该记录，请先刷新作品集");
  const type = String(body.type || record.type);
  if (!["traffic", "conversion", "unclassified"].includes(type)) {
    throw new Error("作品集类型无效");
  }
  const tags = Array.isArray(body.tags)
    ? body.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20)
    : [];
  Object.assign(record, {
    type,
    tags: Array.from(new Set(tags)),
    note: String(body.note || "").trim().slice(0, 500),
    enabled: body.enabled !== false,
    missing: false,
    updatedAt: new Date().toISOString()
  });
  writeJson(COLLECTION_LEDGER_FILE, data);
  return record;
}

function mergeDeviceNotes(devices) {
  const saved = readJson(DEVICE_NOTES_FILE, { version: 1, notes: {} });
  const notes = saved && typeof saved.notes === "object" ? saved.notes : {};
  return decorateTrustedDevices((devices || []).map((device) => ({
    ...device,
    note: String(notes[device.id] ?? device.localRemark ?? "").trim()
  })));
}

function getPageSettings() {
  const local = readJson(APP_SETTINGS_FILE, {});
  return normalizePageSettings(local.pageSettings || {});
}

function savePageSettings(body = {}) {
  const current = readJson(APP_SETTINGS_FILE, {});
  const pageSettings = normalizePageSettings({
    ...getPageSettings(),
    ...body,
    production: { ...getPageSettings().production, ...(body.production || {}) },
    distribution: { ...getPageSettings().distribution, ...(body.distribution || {}) },
    backup: { ...getPageSettings().backup, ...(body.backup || {}) },
    gptAuto: { ...getPageSettings().gptAuto, ...(body.gptAuto || {}) }
  });
  if (pageSettings.production.templateRoot) {
    const templateRoot = path.resolve(pageSettings.production.templateRoot);
    if (!exists(templateRoot) || !fs.statSync(templateRoot).isDirectory()) {
      throw new Error("模板库目录不存在或不是文件夹");
    }
    pageSettings.production.templateRoot = templateRoot;
  }
  if (pageSettings.production.packedRoot) {
    const packedRoot = path.resolve(pageSettings.production.packedRoot);
    if (!exists(packedRoot) || !fs.statSync(packedRoot).isDirectory()) {
      throw new Error("已打包库目录不存在或不是文件夹");
    }
    pageSettings.production.packedRoot = packedRoot;
  }
  if (pageSettings.backup.sourceRoot) {
    const sourceRoot = path.resolve(pageSettings.backup.sourceRoot);
    if (!exists(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
      throw new Error("大文件备份来源目录不存在或不是文件夹");
    }
    pageSettings.backup.sourceRoot = sourceRoot;
  }
  writeJson(APP_SETTINGS_FILE, { ...current, pageSettings });
  return pageSettings;
}

function registeredDevices() {
  return mergeDeviceNotes(readJson(DEVICE_REGISTRY_FILE, { devices: [] }).devices || []);
}

function assertTrustedDeviceTarget(target) {
  const device = findTrustedDevice(registeredDevices(), target);
  if (!device) {
    throw new Error("陌生设备或尚未确认的设备不允许传送；请先在设备列表确认归属");
  }
  return device;
}

function appendAutomationLog(event) {
  fs.mkdirSync(path.dirname(DISTRIBUTION_AUTOMATION_LOG_FILE), { recursive: true });
  fs.appendFileSync(DISTRIBUTION_AUTOMATION_LOG_FILE, `${JSON.stringify({
    time: new Date().toISOString(),
    ...event
  })}\n`, "utf8");
}

function recentAutomationLogs(limit = 30) {
  if (!exists(DISTRIBUTION_AUTOMATION_LOG_FILE)) return [];
  return fs.readFileSync(DISTRIBUTION_AUTOMATION_LOG_FILE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-Math.max(1, Math.min(100, Number(limit) || 30)))
    .reverse()
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function updateDeviceNote(body) {
  const id = String(body.id || "").trim();
  const registry = readJson(DEVICE_REGISTRY_FILE, { devices: [] });
  if (!registry.devices?.some((device) => device.id === id)) throw new Error("设备不存在");
  const note = String(body.note || "").trim().slice(0, 100);
  const saved = readJson(DEVICE_NOTES_FILE, { version: 1, notes: {} });
  saved.version = 1;
  saved.notes = saved.notes && typeof saved.notes === "object" ? saved.notes : {};
  saved.notes[id] = note;
  saved.updatedAt = new Date().toISOString();
  writeJson(DEVICE_NOTES_FILE, saved);
  return { ok: true, id, note };
}

function collectionLedgerCsv() {
  const distribution = getDistributionSnapshot({
    publishRoot: PUBLISH_ROOT,
    libraryRoot: getWorkspaceSettings().workPackage.libraryPath
  });
  const collections = mergeCollectionLedger(distribution.collections || []);
  const escapeCell = (value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = [
    ["作品集", "内容类型", "标签", "备注", "小红书", "抖音", "公众号", "作品数", "源文件夹", "更新时间"],
    ...collections.map((item) => [
      item.name,
      item.typeLabel,
      (item.ledger?.tags || []).join("|"),
      item.ledger?.note || "",
      item.xhs,
      item.douyin === "archived" ? "used" : item.douyin,
      item.officialAccount,
      item.itemCount || 0,
      item.sourcePath || "",
      item.ledger?.updatedAt || ""
    ])
  ];
  return `\ufeff${rows.map((row) => row.map(escapeCell).join(",")).join("\r\n")}\r\n`;
}

function buildDefaultState() {
  return {
    selectedMaterialCategory: "",
    selectedMaterialCategoryPath: "",
    selectedMaterial: "",
    selectedTemplate: "T01",
    currentProductionPair: {},
    paneWidths: {
      left: 286,
      right: 390
    },
    selectedProduct: "",
    activeTab: "dashboard",
    updatedAt: new Date().toISOString()
  };
}

function sanitizeState(state) {
  const clean = { ...state };
  delete clean.productionMode;
  delete clean.selectedTemplateUsage;
  return clean;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function safeList(dir, options = {}) {
  try {
    const includeHidden = options.includeHidden === true;
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => includeHidden || !entry.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  } catch {
    return [];
  }
}

function toUrl(filePath) {
  return `/file?path=${encodeURIComponent(filePath)}`;
}

function readTextPreview(dir) {
  const files = safeList(dir).filter((entry) => entry.isFile());
  const textFile = files.find((entry) => entry.name.toLowerCase() === "text.txt")
    || files.find((entry) => textExts.has(path.extname(entry.name).toLowerCase()));
  if (!textFile) return "";
  try {
    const full = path.join(dir, textFile.name);
    const text = fs.readFileSync(full, "utf8").replace(/\s+/g, " ").trim();
    return text.slice(0, 280);
  } catch {
    return "";
  }
}


const tagRules = [
  ["信息流素材", ["信息流素材", "高转化"]],
  ["普通素材", ["普通素材"]],
  ["团建合集", ["团建合集", "合集", "大集合"]],
  ["团建游戏", ["团建游戏", "破冰", "游戏"]],
  ["夏季团建", ["夏季", "玩水", "漂流", "溯溪", "水上", "纳凉"]],
  ["节日团建", ["节日", "端午", "中秋", "国庆", "五一", "年会", "春节", "元旦", "圣诞"]],
  ["上海", ["上海"]],
  ["杭州", ["杭州", "余杭", "萧山", "临安", "桐庐", "千岛湖", "径山"]],
  ["安吉", ["安吉"]],
  ["苏州", ["苏州", "西山岛"]],
  ["南京", ["南京"]],
  ["湖州", ["湖州", "莫干山", "南浔"]],
  ["宁波", ["宁波"]],
  ["露营", ["露营", "营地", "天幕", "帐篷"]],
  ["溯溪", ["溯溪", "溪流"]],
  ["漂流", ["漂流"]],
  ["烧烤", ["烧烤", "烤肉", "BBQ"]],
  ["农庄", ["农庄", "农家乐", "农场"]],
  ["采摘", ["采摘", "摘", "果园"]],
  ["徒步", ["徒步", "登山", "爬山"]],
  ["越野", ["越野", "ATV", "山地车"]],
  ["轰趴", ["轰趴", "民宿", "KTV", "台球", "麻将"]],
  ["春季", ["春季", "踏青", "春日", "3月", "4月", "5月"]],
  ["夏季", ["夏季", "夏天", "避暑", "玩水", "6月", "7月", "8月"]],
  ["秋季", ["秋季", "秋日", "秋天", "9月", "10月", "11月"]],
  ["冬季", ["冬季", "冬天", "12月", "1月", "2月"]],
  ["半日", ["半日", "半天"]],
  ["一日", ["一日", "一天", "1日", "1天"]],
  ["两天一夜", ["两天一夜", "2天1夜", "两天一晚", "2天一晚"]],
  ["三天两夜", ["三天两夜", "3天2夜"]],
  ["五一", ["五一", "劳动节"]],
  ["端午", ["端午"]],
  ["中秋", ["中秋"]],
  ["国庆", ["国庆"]],
  ["春节", ["春节", "新年"]],
  ["年会", ["年会"]]
];

function readHiddenTags(dir) {
  const file = path.join(dir, ".tags.json");
  if (!exists(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const tags = Array.isArray(data) ? data : data.tags;
    return Array.isArray(tags) ? tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function inferMaterialTags(categoryName, itemName, preview) {
  const haystack = `${categoryName || ""} ${itemName || ""} ${preview || ""}`.toLowerCase();
  const tags = [];
  tagRules.forEach(([tag, keywords]) => {
    if (keywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()))) tags.push(tag);
  });
  const monthMatches = haystack.match(/(?:^|[^0-9])([1-9]|1[0-2])\s*(?:月|月份|🈷)/g) || [];
  monthMatches.forEach((match) => {
    const number = match.match(/([1-9]|1[0-2])/)?.[1];
    if (number) tags.push(`${number}月`);
  });
  return Array.from(new Set(tags));
}
function listImageEntries(dir) {
  return safeList(dir)
    .filter((entry) => entry.isFile() && imageExts.has(path.extname(entry.name).toLowerCase()));
}

function scanPostFolders(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : 20;
  const maxDirectories = Number.isFinite(options.maxDirectories)
    ? options.maxDirectories
    : 10000;
  if (!exists(root) || !fs.statSync(root).isDirectory()) return [];

  const posts = [];
  const queue = [{ directory: root, depth: 0 }];
  let visited = 0;
  while (queue.length && visited < maxDirectories) {
    const current = queue.shift();
    visited += 1;
    const entries = safeList(current.directory, { includeHidden: options.includeHidden === true });
    const files = entries.filter((entry) => entry.isFile());
    const imageCount = files.filter((entry) =>
      imageExts.has(path.extname(entry.name).toLowerCase())
    ).length;
    const textCount = files.filter((entry) =>
      textExts.has(path.extname(entry.name).toLowerCase())
    ).length;
    const relativePath = path.relative(root, current.directory);
    const relativeDepth = relativePath
      ? relativePath.split(path.sep).filter(Boolean).length
      : 0;

    if (relativeDepth > 0 && imageCount > 0 && textCount > 0) {
      let updatedAt = null;
      try {
        updatedAt = fs.statSync(current.directory).mtime.toISOString();
      } catch {
        updatedAt = null;
      }
      posts.push({
        name: path.basename(current.directory),
        path: current.directory,
        relativePath,
        relativeDepth,
        imageCount,
        textCount,
        updatedAt
      });
      continue;
    }

    if (current.depth >= maxDepth) continue;
    entries.forEach((entry) => {
      if (!entry.isDirectory() || entry.isSymbolicLink()) return;
      queue.push({
        directory: path.join(current.directory, entry.name),
        depth: current.depth + 1
      });
    });
  }
  return posts.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, "zh-Hans-CN")
  );
}

function listImages(dir, limit = 18) {
  return listImageEntries(dir)
    .slice(0, limit)
    .map((entry) => {
      const full = path.join(dir, entry.name);
      return {
        name: entry.name,
        path: full,
        url: toUrl(full)
      };
    });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((values) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = values[index] || "";
    });
    return item;
  });
}

let materialPostCache = null;
let materialLibraryCache = null;
let materialWatcher = null;
let materialCacheStaleTime = 0;
let materialWatcherDebounce = null;

function invalidateMaterialCache() {
  materialLibraryCache = null;
  materialCategoryCache.clear();
  materialCacheStaleTime = Date.now();
}

function startMaterialWatcher() {
  const root = getWorkspaceSettings().materialRoot;
  if (!root || !exists(root)) return;
  if (materialWatcher) {
    try { materialWatcher.close(); } catch { /* ignore */ }
    materialWatcher = null;
  }
  try {
    materialWatcher = fs.watch(root, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      if (materialWatcherDebounce) clearTimeout(materialWatcherDebounce);
      materialWatcherDebounce = setTimeout(() => {
        invalidateMaterialCache();
      }, 800);
    });
    materialWatcher.on("error", () => { /* ignore watcher errors, will restart on next refresh */ });
  } catch {
    /* recursive watch may not be supported on all platforms; fail silently */
  }
}

function restartMaterialWatcherIfNeeded() {
  const root = getWorkspaceSettings().materialRoot;
  if (!root || !exists(root)) return;
  if (!materialWatcher) startMaterialWatcher();
}

function materialTreeSignature(root) {
  if (!exists(root)) return "";
  const rows = safeList(root, { includeHidden: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const full = path.join(root, entry.name);
      return `${entry.name}\u0000${safeMtime(full)}`;
    })
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
  return rows.join("\u0001");
}

function materialCategoryIndex(root) {
  if (!exists(root)) return [];
  return safeList(root, { includeHidden: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry, index) => ({
      id: path.join(root, entry.name),
      order: index + 1,
      name: entry.name,
      path: path.join(root, entry.name)
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN", { numeric: true }));
}

function materialCategoryCountMap(root, snapshot = readJson(MATERIAL_GLOBAL_INDEX_FILE, null)) {
  const currentRoot = path.resolve(root || "");
  if (!snapshot?.root
    || path.resolve(snapshot.root).toLowerCase() !== currentRoot.toLowerCase()
    || !Array.isArray(snapshot.categories)) {
    return new Map();
  }
  return new Map(snapshot.categories
    .filter((category) => category?.path
      && category.sourceSignature
      && category.sourceSignature === materialTreeSignature(category.path)
      && Number.isInteger(Number(category.count))
      && Number(category.count) >= 0)
    .map((category) => [path.resolve(category.path), Number(category.count)]));
}

function getDetectedMaterialPosts(root, force = false) {
  const categoryRoot = path.resolve(root);
  const sourceSignature = materialTreeSignature(categoryRoot);
  const cached = materialCategoryCache.get(categoryRoot);
  if (!force && cached?.sourceSignature === sourceSignature && Array.isArray(cached.posts)) {
    return cached.posts;
  }
  const posts = scanPostFolders(categoryRoot, { includeHidden: true });
  const record = {
    root: categoryRoot,
    sourceSignature,
    scannedAt: new Date().toISOString(),
    posts
  };
  materialCategoryCache.set(categoryRoot, record);
  materialPostCache = record;
  return posts;
}

function getMaterialLibrary(force = false, selectedLibraryPath = "", options = {}) {
  const root = getWorkspaceSettings().materialRoot;
  const sourceSignature = materialTreeSignature(root);
  const descriptors = materialCategoryIndex(root);
  const indexedCounts = materialCategoryCountMap(root);
  if (descriptors.some((descriptor) => !indexedCounts.has(path.resolve(descriptor.path)))
    && materialGlobalIndexJob.status !== "running") {
    setImmediate(() => startMaterialGlobalIndexRefresh({ force: true, materialRoot: root }));
  }
  const requestedPath = selectedLibraryPath ? path.resolve(selectedLibraryPath) : "";
  const requestedCategory = descriptors.find((category) => category.path === requestedPath);
  const selectedCategory = requestedCategory
    || (options.loadDefault === false ? null : descriptors[0] || null);

  function materialItem(post, categoryName, itemIndex) {
    const itemPath = post.path;
    const images = listImages(itemPath, PREVIEW_LIMITS.materialImagesPerItem);
    const textFiles = safeList(itemPath)
      .filter((entry) => entry.isFile() && textExts.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => path.join(itemPath, entry.name));
    const preview = readTextPreview(itemPath);
    const tags = Array.from(new Set([...inferMaterialTags(categoryName, post.name, preview), ...readHiddenTags(itemPath)]));
    return {
      id: itemPath,
      order: itemIndex + 1,
      name: post.name,
      path: itemPath,
      imageCount: post.imageCount,
      textCount: post.textCount,
      relativePath: post.relativePath,
      images,
      attachments: [...images.map((image) => image.path), ...textFiles].slice(0, 30),
      preview,
      tags,
      updatedAt: post.updatedAt || safeMtime(itemPath)
    };
  }

  function categoryFromPosts(descriptor, posts, loaded) {
    const cachedPosts = materialCategoryCache.get(descriptor.path)?.posts;
    const indexedCount = indexedCounts.get(path.resolve(descriptor.path));
    const countKnown = loaded || Array.isArray(cachedPosts) || Number.isInteger(indexedCount);
    const items = posts
      .slice(0, PREVIEW_LIMITS.materialItemsPerCategory)
      .map((post, itemIndex) => materialItem(post, descriptor.name, itemIndex));
    return {
      ...descriptor,
      count: loaded
        ? posts.length
        : (Array.isArray(cachedPosts) ? cachedPosts.length : (Number.isInteger(indexedCount) ? indexedCount : 0)),
      countKnown,
      visibleCount: items.length,
      loaded,
      items: loaded ? items : []
    };
  }

  const loadAll = Boolean(options.loadAll);
  const categories = descriptors.map((descriptor) => {
    const loaded = loadAll || descriptor.path === selectedCategory?.path;
    const posts = loaded ? getDetectedMaterialPosts(descriptor.path, force) : [];
    return categoryFromPosts(descriptor, posts, loaded);
  });
  const library = {
    root,
    recursive: true,
    lazy: true,
    selectedCategoryPath: selectedCategory?.path || "",
    detectionRule: "图片 + 文案",
    categories
  };
  materialLibraryCache = { root, sourceSignature, scannedAt: new Date().toISOString(), library };
  return library;
}

function compactMaterialItem(item, categoryName, usageByPath = {}, options = {}) {
  const profile = materialMetadataProfile(item, categoryName, options);
  if (profile.hashCacheChanged) options.onHashCacheChanged?.();
  const directUsage = usageByPath[materialUsageKey(item.path)] || null;
  const contentFingerprint = directUsage || !Object.keys(usageByPath).length ? "" : materialUsageFingerprint(item.path);
  const usage = directUsage
    || Object.values(usageByPath).find((entry) => entry.fingerprint && entry.fingerprint === contentFingerprint)
    || null;
  return {
    id: item.id,
    name: item.name,
    path: item.path,
    imageCount: item.imageCount,
    textCount: item.textCount,
    attachments: item.attachments || [],
    folderHash: profile.folderHash,
    mainTag: profile.mainTag,
    mainTagSource: profile.mainTagSource,
    tags: profile.tags,
    usageCount: Math.max(profile.usageCount, Number(usage?.usageCount || 0)),
    usage
  };
}

function compactMaterialIndex(library, categoryId = "") {
  const usageByPath = getMaterialUsageLedger().entries || {};
  const metadata = getMaterialMetadataLedger();
  const hashCache = getMaterialHashCache();
  let hashCacheChanged = false;
  const categories = (library.categories || []).map((category) => ({
    id: category.id,
    name: category.name,
    path: category.path,
    count: category.count,
    countKnown: category.countKnown !== false,
    loaded: category.id === categoryId && category.loaded !== false,
    items: category.id === categoryId && category.loaded !== false
      ? (category.items || []).map((item) => {
          return compactMaterialItem(item, category.name, usageByPath, {
            metadata,
            cache: hashCache,
            materialRoot: root,
            onHashCacheChanged: () => { hashCacheChanged = true; }
          });
      })
      : []
  }));
  if (hashCacheChanged) writeJson(MATERIAL_HASH_CACHE_FILE, hashCache);
  return {
    root: library.root,
    recursive: library.recursive,
    lazy: true,
    detectionRule: library.detectionRule,
    categories
  };
}

function getLegacyMaterialEvidence(projectRoot = PROJECT_ROOT) {
  const linkFile = path.join(projectRoot, "01-素材库", "素材链接记录.csv");
  const productionFile = path.join(projectRoot, "04-技能库", "运行记录", "制作日志.csv");
  const evidenceByKey = new Map();

  function addEvidence(row, source) {
    const status = String(row["状态"] || "").trim();
    const successful = source === "素材链接记录"
      ? /已生成|完成/.test(status)
      : /完成|结构校准/.test(status) && !/失败|作废|移除/.test(status);
    if (!successful) return;
    const materialId = String(row["素材ID"] || "").trim();
    const folderName = String(row["素材文件夹"] || "").trim();
    const title = String(row["素材标题"] || row["作品标题"] || "").trim();
    const sourcePath = String(row["原始素材路径"] || "").trim();
    const eventKey = [
      materialId || normalizeMatchKey(folderName || title),
      String(row["时间"] || row["添加时间"] || "").trim(),
      String(row["模板ID"] || "").trim()
    ].join("|");
    const previous = evidenceByKey.get(eventKey);
    evidenceByKey.set(eventKey, {
      eventKey,
      materialId,
      folderName: folderName || previous?.folderName || "",
      title: title || previous?.title || "",
      sourcePath: sourcePath || previous?.sourcePath || "",
      status,
      sources: Array.from(new Set([...(previous?.sources || []), source]))
    });
  }

  if (exists(linkFile)) {
    parseCsv(fs.readFileSync(linkFile, "utf8")).forEach((row) => addEvidence(row, "素材链接记录"));
  }
  if (exists(productionFile)) {
    parseCsv(fs.readFileSync(productionFile, "utf8")).forEach((row) => addEvidence(row, "制作日志"));
  }
  return Array.from(evidenceByKey.values());
}

function matchLegacyMaterialEvidence(items, evidenceRows) {
  const byPath = new Map();
  const byName = new Map();
  items.forEach((item) => {
    byPath.set(materialUsageKey(item.path), item);
    const key = normalizeMatchKey(item.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(item);
  });
  const matched = new Map();
  const review = [];

  evidenceRows.forEach((evidence) => {
    const pathCandidates = [];
    if (evidence.sourcePath) {
      pathCandidates.push(evidence.sourcePath);
      if (evidence.folderName) pathCandidates.push(path.join(evidence.sourcePath, evidence.folderName));
    }
    let candidates = pathCandidates
      .map((candidate) => byPath.get(materialUsageKey(candidate)))
      .filter(Boolean);
    if (!candidates.length) {
      const nameKeys = Array.from(new Set([
        normalizeMatchKey(evidence.folderName),
        normalizeMatchKey(path.basename(evidence.sourcePath || "")),
        normalizeMatchKey(evidence.title)
      ].filter(Boolean)));
      candidates = Array.from(new Set(nameKeys.flatMap((key) => byName.get(key) || [])));
    }
    if (candidates.length === 1) {
      const item = candidates[0];
      if (!matched.has(item.folderHash)) matched.set(item.folderHash, []);
      matched.get(item.folderHash).push(evidence);
      return;
    }
    review.push({
      eventKey: evidence.eventKey,
      materialId: evidence.materialId,
      name: evidence.folderName || evidence.title || evidence.materialId,
      reason: candidates.length ? "发现多个同名素材文件夹" : "历史路径已变化且未找到唯一同名文件夹",
      candidates: candidates.slice(0, 10).map((item) => ({ name: item.name, path: item.path }))
    });
  });

  return { matched, review };
}

function applyLegacyMaterialEvidence(items, evidenceRows, options = {}) {
  const ledgerFile = options.ledgerFile || MATERIAL_METADATA_LEDGER_FILE;
  const ledger = options.ledger || getMaterialMetadataLedger(ledgerFile);
  const result = matchLegacyMaterialEvidence(items, evidenceRows);
  const now = new Date().toISOString();
  let importedEvents = 0;

  result.matched.forEach((evidence, folderHash) => {
    const item = items.find((candidate) => candidate.folderHash === folderHash);
    const previous = ledger.entries?.[folderHash] || {};
    const previousKeys = new Set(previous.importedEvidenceKeys || []);
    const newEvidence = evidence.filter((entry) => !previousKeys.has(entry.eventKey));
    if (!newEvidence.length) return;
    newEvidence.forEach((entry) => previousKeys.add(entry.eventKey));
    importedEvents += newEvidence.length;
    const record = {
      ...previous,
      folderHash,
      entryPath: item.path,
      name: item.name,
      usageCount: Math.max(0, Number(previous.usageCount || 0)) + newEvidence.length,
      importedEvidenceKeys: Array.from(previousKeys),
      usageSource: "历史日志 + 扩展实时记录",
      updatedAt: now
    };
    ledger.entries = { ...(ledger.entries || {}), [folderHash]: record };
    ledger.events = [...(ledger.events || []), ...newEvidence.map((entry) => ({
      folderHash,
      entryPath: item.path,
      action: "import-legacy-usage",
      evidenceKey: entry.eventKey,
      sources: entry.sources,
      recordedAt: now
    }))].slice(-3000);
  });

  if (importedEvents) {
    ledger.updatedAt = now;
    fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
    writeJson(ledgerFile, ledger);
  }
  return { ...result, ledger, importedEvents };
}

function materialIndexStats(items, review = []) {
  const byMainTag = Object.fromEntries(MATERIAL_MAIN_TAGS.map((tag) => [tag, 0]));
  const byUsage = { unused: 0, once: 0, twice: 0, threePlus: 0, used: 0 };
  items.forEach((item) => {
    if (Object.prototype.hasOwnProperty.call(byMainTag, item.mainTag)) byMainTag[item.mainTag] += 1;
    const count = Math.max(0, Number(item.usageCount || 0));
    if (count === 0) byUsage.unused += 1;
    if (count === 1) byUsage.once += 1;
    if (count === 2) byUsage.twice += 1;
    if (count >= 3) byUsage.threePlus += 1;
    if (count > 0) byUsage.used += 1;
  });
  return { total: items.length, byMainTag, byUsage, review: review.length };
}

function materialGlobalIndexPublic(snapshot = null) {
  const saved = snapshot || readJson(MATERIAL_GLOBAL_INDEX_FILE, null);
  return {
    status: materialGlobalIndexJob.status,
    startedAt: materialGlobalIndexJob.startedAt,
    completedAt: materialGlobalIndexJob.completedAt || saved?.generatedAt || "",
    currentCategory: materialGlobalIndexJob.currentCategory,
    processedCategories: materialGlobalIndexJob.processedCategories,
    totalCategories: materialGlobalIndexJob.totalCategories || Number(saved?.categories?.length || 0),
    indexedItems: materialGlobalIndexJob.status === "running"
      ? materialGlobalIndexJob.indexedItems
      : Number(saved?.stats?.total || 0),
    error: materialGlobalIndexJob.error,
    generatedAt: saved?.generatedAt || "",
    root: saved?.root || getWorkspaceSettings().materialRoot,
    stats: saved?.stats || materialIndexStats([]),
    evidence: saved?.evidence || { total: 0, matchedFolders: 0, importedEvents: 0, pendingReview: 0 },
    categories: saved?.categories || [],
    items: saved?.items || [],
    review: saved?.review || []
  };
}

function startMaterialGlobalIndexRefresh(options = {}) {
  if (materialGlobalIndexJob.status === "running") return materialGlobalIndexPublic();
  const root = path.resolve(options.materialRoot || getWorkspaceSettings().materialRoot);
  const descriptors = materialCategoryIndex(root);
  const metadata = getMaterialMetadataLedger(options.ledgerFile);
  const hashCache = getMaterialHashCache(options.cacheFile);
  const items = [];
  const categorySummaries = [];
  let cursor = 0;
  materialGlobalIndexJob = {
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: "",
    currentCategory: "",
    processedCategories: 0,
    totalCategories: descriptors.length,
    indexedItems: 0,
    error: ""
  };

  function finish() {
    try {
      const evidence = getLegacyMaterialEvidence(options.projectRoot || PROJECT_ROOT);
      const reconciled = applyLegacyMaterialEvidence(items, evidence, {
        ledger: metadata,
        ledgerFile: options.ledgerFile
      });
      items.forEach((item) => {
        const saved = reconciled.ledger.entries?.[item.folderHash] || {};
        item.usageCount = Math.max(Number(item.usageCount || 0), Number(saved.usageCount || 0));
        item.usageSource = saved.usageSource || (item.usageCount ? "扩展实时记录" : "暂无使用证据");
      });
      const snapshot = {
        version: 1,
        generatedAt: new Date().toISOString(),
        root,
        categories: categorySummaries,
        items,
        review: reconciled.review,
        evidence: {
          total: evidence.length,
          matchedFolders: reconciled.matched.size,
          importedEvents: reconciled.importedEvents,
          pendingReview: reconciled.review.length
        },
        stats: materialIndexStats(items, reconciled.review)
      };
      writeJson(options.indexFile || MATERIAL_GLOBAL_INDEX_FILE, snapshot);
      writeJson(options.cacheFile || MATERIAL_HASH_CACHE_FILE, hashCache);
      materialGlobalIndexJob = {
        ...materialGlobalIndexJob,
        status: "complete",
        completedAt: snapshot.generatedAt,
        currentCategory: "",
        processedCategories: descriptors.length,
        indexedItems: items.length
      };
    } catch (error) {
      materialGlobalIndexJob = {
        ...materialGlobalIndexJob,
        status: "failed",
        error: error.message || String(error),
        currentCategory: ""
      };
    }
  }

  function scanNextCategory() {
    if (cursor >= descriptors.length) return finish();
    const category = descriptors[cursor];
    materialGlobalIndexJob.currentCategory = category.name;
    try {
      const posts = getDetectedMaterialPosts(category.path, Boolean(options.force));
      posts.forEach((post) => {
        const preview = readTextPreview(post.path);
        const profile = materialMetadataProfile({
          path: post.path,
          name: post.name,
          preview
          }, category.name, { metadata, cache: hashCache, materialRoot: root });
        items.push({
          id: post.path,
          categoryId: category.id,
          categoryName: category.name,
          name: post.name,
          path: post.path,
          imageCount: post.imageCount,
          textCount: post.textCount,
          folderHash: profile.folderHash,
          mainTag: profile.mainTag,
          mainTagSource: profile.mainTagSource,
          tags: profile.tags,
          usageCount: profile.usageCount,
          usageSource: profile.usageCount ? "扩展实时记录" : "暂无使用证据"
        });
      });
      categorySummaries.push({
        id: category.id,
        name: category.name,
        path: category.path,
        sourceSignature: materialTreeSignature(category.path),
        count: posts.length
      });
      cursor += 1;
      materialGlobalIndexJob.processedCategories = cursor;
      materialGlobalIndexJob.indexedItems = items.length;
      setImmediate(scanNextCategory);
    } catch (error) {
      materialGlobalIndexJob = {
        ...materialGlobalIndexJob,
        status: "failed",
        error: `${category.name}：${error.message || error}`,
        currentCategory: ""
      };
    }
  }

  setImmediate(scanNextCategory);
  return materialGlobalIndexPublic();
}

function getMaterialGlobalIndex(options = {}) {
  const indexFile = options.indexFile || MATERIAL_GLOBAL_INDEX_FILE;
  const saved = readJson(indexFile, null);
  const currentRoot = path.resolve(options.materialRoot || getWorkspaceSettings().materialRoot);
  const stale = !saved || path.resolve(saved.root || "") !== currentRoot;
  if ((options.refresh || stale) && materialGlobalIndexJob.status !== "running") {
    startMaterialGlobalIndexRefresh({ ...options, materialRoot: currentRoot, indexFile });
  }
  return materialGlobalIndexPublic(stale ? null : saved);
}

function getTemplateLibrary() {
  const configuredTemplateRoot = getPageSettings().production.templateRoot;
  const templateRoot = configuredTemplateRoot || path.join(PROJECT_ROOT, "02-模板库");
  const csv = path.join(templateRoot, "爆款链接库.csv");
  const sourceRoot = path.join(PROJECT_ROOT, "01-素材库", "团建攻略图文素材", "模板素材");
  const rows = exists(csv) ? parseCsv(fs.readFileSync(csv, "utf8")) : [];
  const templates = rows.map((row) => {
    const rel = row["源模板路径"] || "";
    const normalized = rel.replace(/\//g, path.sep);
    const configuredCandidate = path.join(templateRoot, normalized);
    const projectCandidate = path.join(PROJECT_ROOT, normalized);
    const full = path.isAbsolute(normalized)
      ? normalized
      : (configuredTemplateRoot && exists(configuredCandidate) ? configuredCandidate : projectCandidate);
    const images = listImages(full, PREVIEW_LIMITS.templateImages);
    const imageCount = listImageEntries(full).length;
    const textFiles = safeList(full)
      .filter((entry) => entry.isFile() && textExts.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => path.join(full, entry.name));
    const descriptor = `${row["模板名称"] || ""} ${row["适用内容"] || ""} ${full}`;
    const productionRecipe = recipeForTemplate(`${descriptor} ${row["备注"] || ""}`);
    const type = /团建小游戏|聚会游戏|破冰游戏|真心话|大冒险|游戏规则|玩法清单/.test(descriptor)
      ? "game"
      : "conversion";
    return {
      id: row["模板ID"] || path.basename(full),
      name: row["模板名称"] || path.basename(full),
      type,
      typeLabel: type === "game" ? "游戏模板" : "转化模板",
      usage: row["适用内容"] || "",
      defaultPages: row["默认页数"] || "",
      status: row["状态"] || "",
      note: row["备注"] || "",
      productionRecipe,
      path: full,
      images,
      imageCount,
      textCount: textFiles.length,
      attachments: [...images.map((image) => image.path), ...textFiles].slice(0, 30)
    };
  });
  const customGameRoot = path.join(templateRoot, "定制游模板");
  safeList(customGameRoot)
    .filter((entry) => entry.isDirectory() && /游戏|破冰|真心话|大冒险/.test(entry.name))
    .forEach((entry, index) => {
      const full = path.join(customGameRoot, entry.name);
      const images = listImages(full, PREVIEW_LIMITS.templateImages);
      const textFiles = safeList(full)
        .filter((file) => file.isFile() && textExts.has(path.extname(file.name).toLowerCase()))
        .map((file) => path.join(full, file.name));
      if (!images.length) return;
      templates.push({
        id: `G${String(index + 1).padStart(2, "0")}`,
        name: entry.name.replace(/^[^_]*_/, "").slice(0, 36),
        type: "game",
        typeLabel: "游戏模板",
        usage: "团建小游戏/聚会游戏/破冰玩法",
        defaultPages: "5",
        status: "参考",
        note: "多游戏条目和玩法说明模板",
        path: full,
        images,
        imageCount: listImageEntries(full).length,
        textCount: textFiles.length,
        attachments: [...images.map((image) => image.path), ...textFiles].slice(0, 30)
      });
    });
  return { csv, sourceRoot, templates };
}

function onlineTemplateFilePath() {
  const configuredTemplateRoot = getPageSettings().production.templateRoot;
  const templateRoot = path.resolve(configuredTemplateRoot || path.join(PROJECT_ROOT, "02-模板库"));
  fs.mkdirSync(templateRoot, { recursive: true });
  return path.join(templateRoot, "链接模板.txt");
}

function normalizeOnlineTemplateUrl(value = "") {
  let parsed;
  try { parsed = new URL(String(value || "").trim()); } catch { return ""; }
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "chatgpt.com") return "";
  if (!/^\/(?:c|share)\/[a-z0-9-]+\/?$/i.test(parsed.pathname)) return "";
  parsed.hash = "";
  return parsed.toString();
}

function readOnlineTemplates(filePath = onlineTemplateFilePath()) {
  const source = exists(filePath) ? fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "") : "";
  const templates = source.split(/\r?\n/).map((line) => {
    const clean = line.trim();
    if (!clean || clean.startsWith("#")) return null;
    const urlMatch = clean.match(/https:\/\/chatgpt\.com\/(?:c|share)\/[a-z0-9-]+\/?/i);
    const templateUrl = normalizeOnlineTemplateUrl(urlMatch?.[0] || "");
    if (!templateUrl) return null;
    const before = clean.slice(0, Number(urlMatch.index || 0)).replace(/[\t|｜]+$/g, "").trim();
    const after = clean.slice(Number(urlMatch.index || 0) + urlMatch[0].length).replace(/^[\t|｜]+/g, "").trim();
    const name = (before || `在线模板 ${templateUrl.split("/").filter(Boolean).pop()?.slice(0, 8) || ""}`).slice(0, 48);
    const accountId = /^[a-z0-9_-]+$/i.test(after) ? after.slice(0, 48) : "";
    return {
      id: `online-${crypto.createHash("sha256").update(`${name}\0${templateUrl}`).digest("hex").slice(0, 16)}`,
      kind: "online",
      name,
      url: templateUrl,
      accountId
    };
  }).filter(Boolean);
  return { filePath, templates };
}

function writeOnlineTemplates(templates = [], filePath = onlineTemplateFilePath()) {
  const normalized = templates.map((template) => ({
    name: String(template?.name || "").trim().slice(0, 48),
    url: normalizeOnlineTemplateUrl(template?.url),
    accountId: /^[a-z0-9_-]+$/i.test(String(template?.accountId || ""))
      ? String(template.accountId).slice(0, 48)
      : ""
  })).filter((template) => template.name && template.url);
  const seen = new Set();
  const unique = normalized.filter((template) => {
    const key = `${template.name.toLowerCase()}\0${template.url.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const text = unique.map((template) => [template.name, template.url, template.accountId].filter(Boolean).join("\t")).join("\r\n");
  fs.writeFileSync(temporary, text ? `${text}\r\n` : "", "utf8");
  fs.renameSync(temporary, filePath);
  return readOnlineTemplates(filePath);
}

function updateOnlineTemplate(body = {}, filePath = onlineTemplateFilePath()) {
  const current = readOnlineTemplates(filePath).templates;
  const action = String(body.action || "upsert");
  if (action === "delete") {
    return writeOnlineTemplates(current.filter((template) => template.id !== String(body.id || "")), filePath);
  }
  const name = String(body.name || "").trim().slice(0, 48);
  const templateUrl = normalizeOnlineTemplateUrl(body.url);
  if (!name) throw new Error("在线模板名称不能为空");
  if (!templateUrl) throw new Error("只支持 ChatGPT 会话链接或分享链接");
  const accountId = /^[a-z0-9_-]+$/i.test(String(body.accountId || "")) ? String(body.accountId).slice(0, 48) : "";
  const replacingId = String(body.id || "");
  const next = current.filter((template) => template.id !== replacingId && template.url !== templateUrl);
  next.push({ name, url: templateUrl, accountId });
  return writeOnlineTemplates(next, filePath);
}

function getProductLibrary() {
  const root = path.join(PROJECT_ROOT, "03-成品库");
  const groups = safeList(root)
    .filter((entry) => entry.isDirectory())
    .map((group) => {
      const groupPath = path.join(root, group.name);
      const allWorks = safeList(groupPath).filter((entry) => entry.isDirectory());
      const works = allWorks
        .slice(0, PREVIEW_LIMITS.productWorksPerGroup)
        .map((entry) => {
          const workPath = path.join(groupPath, entry.name);
          const images = listImages(workPath, PREVIEW_LIMITS.productImagesPerWork);
          const imageCount = listImageEntries(workPath).length;
          return {
            id: workPath,
            name: entry.name,
            path: workPath,
            images,
            imageCount,
            hasCopy: exists(path.join(workPath, "文案.txt")),
            hasPlan: exists(path.join(workPath, "出图计划.md")),
            hasSource: exists(path.join(workPath, "溯源说明.md")),
            hasCheck: exists(path.join(workPath, "质检说明.md")) || exists(path.join(workPath, "自检.md")),
            updatedAt: safeMtime(workPath)
          };
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return {
        id: groupPath,
        name: group.name,
        path: groupPath,
        count: allWorks.length,
        visibleCount: works.length,
        works
      };
    });
  return { root, groups };
}

function productionWorkbenchProducts() {
  const settings = getWorkspaceSettings();
  const pageSettings = getPageSettings();
  const libraryRoot = path.resolve(settings.workPackage.libraryPath);
  const stageRoots = getWorkflowStageRoots(libraryRoot);
  const packedRoot = pageSettings.production.packedRoot
    ? path.resolve(pageSettings.production.packedRoot)
    : stageRoots.mobile;
  const reservedNames = new Set([
    "_portfolio_move_logs", "_作品历史数据", "发布空间",
    "抖音小红书", "微信公众号", "已发送"
  ]);
  const textFiles = (workPath) => safeList(workPath)
    .filter((entry) => entry.isFile() && textExts.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => {
      const full = path.join(workPath, entry.name);
      return { name: entry.name, path: full, url: toUrl(full) };
    });
  const readCopyPreview = (files = []) => {
    const target = files.find((item) => /小红书文案|文案/i.test(item.name)) || files[0];
    if (!target) return "";
    try {
      return fs.readFileSync(target.path, "utf8").trim().slice(0, 420);
    } catch {
      return "";
    }
  };
  const inferWorkCategory = (name, preview = "") => (
    /游戏合集|团建游戏|破冰游戏|真心话|大冒险|小游戏/.test(`${name} ${preview}`)
      ? { type: "traffic", typeLabel: "泛流量贴" }
      : { type: "conversion", typeLabel: "精准流量贴" }
  );
  const buildWork = (workPath, source, extra = {}) => {
    const images = listImages(workPath, 30);
    const attachments = textFiles(workPath);
    const preview = readCopyPreview(attachments);
    const planPath = path.join(workPath, "出图计划.json");
    const plan = exists(planPath) ? readJson(planPath, {}) : {};
    const recipeName = plan.recipe?.name || plan.templateName || "";
    const category = extra.type
      ? { type: extra.type, typeLabel: extra.typeLabel }
      : inferWorkCategory(path.basename(workPath), preview);
    return {
      id: workPath,
      name: path.basename(workPath),
      path: workPath,
      source,
      templateName: recipeName,
      images,
      imageCount: listImageEntries(workPath).length,
      textFiles: attachments,
      textCount: attachments.length,
      preview,
      hasCopy: attachments.length > 0,
      copyPath: attachments[0]?.path || "",
      updatedAt: safeMtime(workPath),
      packed: source === "已打包",
      collectionName: extra.collectionName || "",
      type: category.type,
      typeLabel: category.typeLabel
    };
  };
  const readWorks = (root, source) => safeList(root)
    .filter((entry) => entry.isDirectory() && !reservedNames.has(entry.name))
    .map((entry) => buildWork(path.join(root, entry.name), source))
    .filter((work) => work.imageCount > 0 || work.textCount > 0);
  const unpackedWorks = [
    ...readWorks(IMAGE_REVIEW_ROOT, "待审区"),
    ...readWorks(libraryRoot, "成品库")
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const packedCollections = safeList(packedRoot)
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .flatMap((entry) => {
      const collectionPath = path.join(packedRoot, entry.name);
      const classification = classifyCollectionName(entry.name);
      const direct = buildWork(collectionPath, "已打包", {
        collectionName: entry.name,
        type: classification.type,
        typeLabel: classification.type === "traffic" ? "泛流量贴"
          : classification.type === "conversion" ? "精准流量贴" : "未分类"
      });
      if (direct.imageCount > 0 || direct.textCount > 0) return [direct];
      return safeList(collectionPath)
        .filter((post) => post.isDirectory())
        .map((post) => buildWork(path.join(collectionPath, post.name), "已打包", {
          collectionName: entry.name,
          type: classification.type,
          typeLabel: classification.type === "traffic" ? "泛流量贴"
            : classification.type === "conversion" ? "精准流量贴" : "未分类"
        }))
        .filter((work) => work.imageCount > 0 || work.textCount > 0);
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const history = readWorkflowOperations(stageRoots)
    .filter((entry) => /pack|作品集|打包/i.test(`${entry.action || ""} ${entry.detail || ""}`))
    .slice(0, 120);
  return {
    reviewRoot: IMAGE_REVIEW_ROOT,
    libraryRoot,
    packedRoot,
    pendingRoot: packedRoot,
    works: unpackedWorks,
    unpackedWorks,
    packedWorks: packedCollections,
    history
  };
}

function packProductionWorks(paths = []) {
  const settings = getWorkspaceSettings();
  const pageSettings = getPageSettings();
  const libraryRoot = path.resolve(settings.workPackage.libraryPath);
  const stageRoots = getWorkflowStageRoots(libraryRoot);
  const packedRoot = pageSettings.production.packedRoot
    ? path.resolve(pageSettings.production.packedRoot)
    : stageRoots.mobile;
  fs.mkdirSync(packedRoot, { recursive: true });
  const allowedRoots = [path.resolve(IMAGE_REVIEW_ROOT), libraryRoot];
  const selected = [...new Set((Array.isArray(paths) ? paths : []).map((item) => path.resolve(String(item || ""))))];
  if (!selected.length) throw new Error("请先选择至少一个成品文件夹");
  const results = [];
  selected.forEach((sourcePath) => {
    if (!allowedRoots.some((root) => isPathInside(root, sourcePath)) || !exists(sourcePath)) {
      throw new Error(`成品路径不在允许范围：${sourcePath}`);
    }
    if (!fs.statSync(sourcePath).isDirectory()) throw new Error("只能打包作品文件夹");
    const files = safeList(sourcePath);
    if (!files.some((entry) => entry.isFile() && imageExts.has(path.extname(entry.name).toLowerCase()))) {
      throw new Error(`作品中没有图片：${path.basename(sourcePath)}`);
    }
    const targetPath = path.join(packedRoot, path.basename(sourcePath));
    if (exists(targetPath)) {
      results.push({ name: path.basename(sourcePath), status: "exists", targetPath });
      return;
    }
    fs.cpSync(sourcePath, targetPath, { recursive: true, errorOnExist: true });
    appendWorkflowOperation(stageRoots, {
      action: "production-pack",
      collection: path.basename(sourcePath),
      sourcePath,
      targetPath,
      detail: "从素材生产工作台复制到抖音小红书待发"
    });
    results.push({ name: path.basename(sourcePath), status: "packed", targetPath });
  });
  return {
    ok: true,
    pendingRoot: packedRoot,
    packed: results.filter((item) => item.status === "packed").length,
    skipped: results.filter((item) => item.status === "exists").length,
    results
  };
}

function safeMtime(filePath) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return "";
  }
}

function getLogs() {
  const productionLog = path.join(PROJECT_ROOT, "04-技能库", "运行记录", "制作日志.csv");
  const imageLog = path.join(PROJECT_ROOT, "04-技能库", "运行记录", "生图日志.csv");
  const production = exists(productionLog) ? parseCsv(fs.readFileSync(productionLog, "utf8")) : [];
  const images = exists(imageLog) ? parseCsv(fs.readFileSync(imageLog, "utf8")) : [];
  return {
    productionLog,
    imageLog,
    productionCount: production.length,
    imageCount: images.length,
    latestProduction: production.slice(-16).reverse(),
    productionRecords: production.slice().reverse()
  };
}

function normalizeMatchKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function resolveProjectPath(maybeRelativePath) {
  if (!maybeRelativePath) return "";
  const cleaned = String(maybeRelativePath).replace(/\//g, "\\");
  return path.isAbsolute(cleaned) ? cleaned : path.join(PROJECT_ROOT, cleaned);
}

function countProductPages(productPath) {
  if (!productPath || !exists(productPath)) return { imageCount: 0, hasCopy: false, hasPlan: false, hasSource: false, hasCheck: false };
  const images = safeList(productPath).filter((entry) => {
    const lower = entry.name.toLowerCase();
    return entry.isFile() && (lower === "封面.png" || /^内页\d+\.(png|jpg|jpeg|webp)$/i.test(entry.name));
  });
  return {
    imageCount: images.length,
    hasCopy: exists(path.join(productPath, "文案.txt")),
    hasPlan: exists(path.join(productPath, "出图计划.md")),
    hasSource: exists(path.join(productPath, "溯源说明.md")),
    hasCheck: exists(path.join(productPath, "质检说明.md")) || exists(path.join(productPath, "自检.md"))
  };
}

function findProductionRecordForPair(records, material, templateId) {
  const materialKey = normalizeMatchKey(material?.name || "");
  const materialKeyNoPrefix = materialKey.replace(/^\d+/, "");
  let best = null;
  records.forEach((record) => {
    if ((record["模板ID"] || "") !== templateId) return;
    const source = normalizeMatchKey(record["素材文件夹"] || "");
    const title = normalizeMatchKey(record["素材标题"] || "");
    let score = 0;
    [materialKey, materialKeyNoPrefix].filter((key) => key.length >= 8).forEach((key) => {
      if (source === key) score = Math.max(score, 100);
      else if (source.includes(key) || key.includes(source)) score = Math.max(score, 82);
      if (title && (key.includes(title) || title.includes(key))) score = Math.max(score, 56);
    });
    const newer = best?.record && String(record["时间"] || "") >= String(best.record["时间"] || "");
    if (score > (best?.score || 0) || (score === best?.score && newer)) best = { record, score };
  });
  return best?.score >= 50 ? best.record : null;
}

function buildProductionTaskIndex(materials, templates, logs, state) {
  const selectedTemplateId = state.selectedTemplate || "T01";
  const template = templates.templates.find((item) => item.id === selectedTemplateId) || templates.templates[0] || {};
  const activeCategories = materials.categories.filter((category) => (
    category.items
    && category.items.length
    && category.name !== "模板素材"
  ));
  const records = logs.productionRecords || [];
  const tasks = [];
  activeCategories.forEach((category) => {
    category.items.forEach((material) => {
      const record = findProductionRecordForPair(records, material, template.id || selectedTemplateId);
      const productPath = resolveProjectPath(record?.["成品路径"] || "");
      const files = countProductPages(productPath);
      const expectedPages = Number.parseInt(template.defaultPages, 10) || Math.min(Math.max(material.imageCount || 5, 5), 10);
      const recordStatus = record?.["状态"] || "";
      const failed = /失败|作废|归档/.test(recordStatus);
      const removed = Boolean(record && /完成/.test(recordStatus) && productPath && !exists(productPath));
      const complete = !failed
        && !removed
        && record
        && files.imageCount >= expectedPages
        && files.hasCopy
        && files.hasPlan
        && files.hasSource;
      const partial = record && !complete && !failed;
      const missing = [];
      if (files.imageCount < expectedPages) missing.push(`缺 ${Math.max(expectedPages - files.imageCount, 0)} 张图`);
      if (record && !files.hasCopy) missing.push("缺文案");
      if (record && !files.hasPlan) missing.push("缺出图计划");
      if (record && !files.hasSource) missing.push("缺溯源");
      tasks.push({
        id: `${template.id || selectedTemplateId}::${material.id}`,
        templateId: template.id || selectedTemplateId,
        templateName: template.name || "",
        materialId: material.id,
        materialName: material.name,
        materialPath: material.path,
        materialLibrary: category.name,
        materialLibraryPath: category.path,
        expectedPages,
        sourceImages: material.imageCount || 0,
        productPath: productPath || "",
        status: complete ? "完成_待人工发布前终检" : removed ? "已移除_不续接" : failed ? "失败记录_需重做" : partial ? "缺页待续接" : "待生成",
        generatedPages: files.imageCount,
        missing,
        recordTime: record?.["时间"] || "",
        recordStatus,
        updatedAt: files.imageCount ? safeMtime(productPath) : ""
      });
    });
  });
  const summary = {
    total: tasks.length,
    done: tasks.filter((task) => task.status.startsWith("完成")).length,
    pending: tasks.filter((task) => task.status === "待生成").length,
    partial: tasks.filter((task) => task.status === "缺页待续接").length,
    failed: tasks.filter((task) => task.status.startsWith("失败")).length,
    removed: tasks.filter((task) => task.status === "已移除_不续接").length
  };
  const selectedMaterialId = state.selectedMaterial || tasks[0]?.materialId || "";
  const current = tasks.find((task) => task.materialId === selectedMaterialId) || tasks[0] || null;
  const next = tasks.find((task) => task.status === "缺页待续接") || tasks.find((task) => task.status === "待生成") || null;
  const index = {
    generatedAt: new Date().toISOString(),
    selectedTemplateId: template.id || selectedTemplateId,
    selectedTemplateName: template.name || "",
    summary,
    current,
    next,
    tasks: tasks.slice(0, 240)
  };
  writeJson(TASK_INDEX_FILE, index);
  return index;
}

function buildDefaultPromptVersions() {
  const sources = [
    {
      id: "template-v36",
      title: "轮播母版迁移器",
      file: path.join(SKILL_ROOT, "00-轮播母版迁移器 V3.6-模板复刻.md"),
      version: "V3.6-动态页数硬锁版",
      role: "永久视觉母版硬锁、动态页数、强制换位/换人/换物、去AI味的母版迁移主提示词"
    },
    {
      id: "team-sop",
      title: "团建 SOP",
      file: path.join(SKILL_ROOT, "00-团建 SOP.md"),
      version: "SOP",
      role: "原始手动生产流程"
    },
    {
      id: "batch-sop",
      title: "批量产图流程",
      file: path.join(PROJECT_ROOT, "05-知识库", "00-工作流入口", "团建批量产图流程显性化SOP.md"),
      version: "2026-06-30",
      role: "Codex 批量生产和续接规则"
    },
    {
      id: "queue-rule",
      title: "素材队列与续接",
      file: path.join(PROJECT_ROOT, "05-知识库", "00-工作流入口", "素材队列与续接规则.md"),
      version: "2026-06-29",
      role: "默认素材库、模板匹配、40 张图续接"
    },
    {
      id: "xhs-copy",
      title: "小红书团建文案编辑器",
      file: path.join(PROJECT_ROOT, "04-技能库", "提示词", "小红书团建文案最高规则.md"),
      version: "SEO搜索决策资产版",
      role: "独立发布文案提示词，和生图/模板迁移分开使用"
    }
  ];
  return {
    updatedAt: new Date().toISOString(),
    prompts: sources.map((source) => ({
      id: source.id,
      title: source.title,
      role: source.role,
      activeVersion: source.version,
      versions: [
        {
          version: source.version,
          createdAt: new Date().toISOString().slice(0, 10),
          sourceFile: source.file,
          content: readPromptFile(source.file)
        }
      ]
    }))
  };
}

function readPromptFile(file) {
  try {
    return fs.readFileSync(file, "utf8").slice(0, 24000);
  } catch {
    return "";
  }
}

function getDashboard(force = false, selectedLibraryPath = "") {
  ensureDataFiles();
  const state = readJson(STATE_FILE, {});
  // Keep first paint lightweight. Scan a category only after the renderer
  // explicitly requests it; a stale saved selection must not trigger a full
  // scan (especially when it points at a dot-prefixed holding folder).
  const materials = getMaterialLibrary(force, selectedLibraryPath, { loadDefault: false });
  const templates = getTemplateLibrary();
  const products = getProductLibrary();
  const logs = getLogs();
  const prompts = readJson(PROMPTS_FILE, { prompts: [] });
  const productionTasks = buildProductionTaskIndex(materials, templates, logs, state);
  const workspaceSettings = getWorkspaceSettings();
  const distribution = getDistributionSnapshot({
    publishRoot: PUBLISH_ROOT,
    libraryRoot: workspaceSettings.workPackage.libraryPath
  });
  distribution.collections = mergeCollectionLedger(distribution.collections || []);
  distribution.devices = mergeDeviceNotes(
    readJson(DEVICE_REGISTRY_FILE, { devices: [] }).devices || []
  );
  distribution.reserve = {
    traffic: countReserve(distribution.collections, "traffic"),
    conversion: countReserve(distribution.collections, "conversion"),
    unclassified: countReserve(distribution.collections, "unclassified"),
    all: countReserve(distribution.collections, "all")
  };
  distribution.automationHistory = recentAutomationLogs();
  restartMaterialWatcherIfNeeded();
  return {
    appInfo: {
      name: "团建工作台",
      version: APP_VERSION,
      channel: process.env.TB_WORKBENCH_CHANNEL || (process.versions.electron ? "便携版" : "本地开发版（热更新）"),
      runtimeRoot: DATA_ROOT,
      releaseRoot: RELEASE_ROOT,
      sourceRoot: __dirname,
      desktop: Boolean(process.versions.electron)
    },
    projectRoot: PROJECT_ROOT,
    workspaceSettings,
    generatedAt: new Date().toISOString(),
    materialCacheStaleTime,
    state,
    materials,
    templates,
    products,
    prompts,
    logs,
    productionTasks,
    distribution,
    stats: {
      materialCategories: materials.categories.length,
      materialItems: materials.categories.reduce((sum, category) => sum + category.count, 0),
      templates: templates.templates.length,
      productGroups: products.groups.length,
      products: products.groups.reduce((sum, group) => sum + group.count, 0),
      productionRows: logs.productionCount,
      imageRows: logs.imageCount
    }
  };
}

function isPathInside(rootPath, targetPath) {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function isAllowedFile(filePath) {
  const resolved = path.resolve(filePath);
  const allowed = [
    path.resolve(PROJECT_ROOT),
    path.resolve(SKILL_ROOT),
    path.resolve(APP_ROOT),
    path.resolve(PROJECT_APP_ROOT),
    path.resolve(DATA_ROOT),
    path.resolve("D:\\Download\\素材下载"),
    path.resolve(getWorkspaceSettings().materialRoot),
    path.resolve(getWorkspaceSettings().workPackage.libraryPath)
  ];
  return allowed.some((root) => isPathInside(root, resolved));
}

function trashEditableWorkspaceDirectory(targetInput = "") {
  const target = path.resolve(String(targetInput || "").trim());
  const pageSettings = getPageSettings();
  const roots = [
    getWorkspaceSettings().materialRoot,
    pageSettings.production?.templateRoot || path.join(PROJECT_ROOT, "02-模板库")
  ].filter(Boolean).map((root) => path.resolve(root));
  const root = roots.find((candidate) => isPathInside(candidate, target) && candidate.toLowerCase() !== target.toLowerCase());
  if (!root || !exists(target)) throw new Error("只能删除素材库或模板库内部的真实文件夹");
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("只能删除真实文件夹，不能删除文件或链接");
  const command = "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($env:TB_TRASH_TARGET,[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)";
  const result = childProcess.spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    windowsHide: true,
    env: { ...process.env, TB_TRASH_TARGET: target },
    encoding: "utf8"
  });
  if (result.status !== 0 || exists(target)) {
    throw new Error(String(result.stderr || result.stdout || "文件夹没有移入回收站").trim());
  }
  materialCategoryCache.clear();
  materialPostCache = null;
  materialLibraryCache = null;
  setImmediate(() => startMaterialGlobalIndexRefresh({ force: true }));
  return { ok: true, path: target, recoverable: true };
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  if (res.headersSent) return;
  res.writeHead(status, {
    "Content-Type": type
  });
  res.end(body);
}

function extensionCorsHeaders(req) {
  const origin = String(req.headers.origin || "");
  const isAllowed = origin === "https://chatgpt.com"
    || origin === "https://chat.openai.com"
    || /^chrome-extension:\/\/[a-z]{32}$/.test(origin)
    || /^edge-extension:\/\/[a-z]{32}$/.test(origin);
  if (!isAllowed) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
    "Vary": "Origin"
  };
}

function sendExtensionJson(req, res, body, status = 200) {
  if (res.headersSent) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...extensionCorsHeaders(req)
  });
  res.end(JSON.stringify(body));
}


function safeName(name) {
  const cleaned = String(name || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!cleaned || /^\.+$/.test(cleaned)) return "未命名";
  return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(cleaned) ? `_${cleaned}` : cleaned;
}

function createDirectoryJunction(source, target) {
  try {
    fs.symlinkSync(source, target, "junction");
    return true;
  } catch {
    try {
      fs.cpSync(source, target, { recursive: true, dereference: false, errorOnExist: false });
      return false;
    } catch {
      return false;
    }
  }
}

function collectMaterialLinks(libraryPath, items, filterSummary, options = {}) {
  const libraryRoot = path.resolve(libraryPath || "");
  if (!libraryRoot || !isAllowedFile(libraryRoot) || !exists(libraryRoot)) throw new Error("material library not allowed");
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const folderName = `.筛选整合_${stamp}_${items.length}条`;
  const targetRoot = path.join(libraryRoot, folderName);
  const tempRoot = path.join(libraryRoot, `.tmp-${folderName}`);
  if (!isPathInside(libraryRoot, targetRoot) || !isPathInside(libraryRoot, tempRoot)) throw new Error("target not allowed");
  const linkDirectory = options.linkDirectory || createDirectoryJunction;
  const manifest = [];
  try {
    fs.mkdirSync(tempRoot, { recursive: true });
    items.forEach((item, index) => {
      const source = path.resolve(item.path || "");
      if (!isPathInside(libraryRoot, source) || !exists(source)) return;
      const target = path.join(tempRoot, `${String(index + 1).padStart(3, "0")}_${safeName(item.name || path.basename(source))}`);
      if (exists(target)) return;
      const linked = linkDirectory(source, target);
      manifest.push({ name: item.name || path.basename(source), source, target, linked });
    });
    fs.writeFileSync(path.join(tempRoot, "筛选说明.json"), JSON.stringify({ createdAt: new Date().toISOString(), filterSummary, count: manifest.length, items: manifest }, null, 2), "utf8");
    fs.renameSync(tempRoot, targetRoot);
    return { folderPath: targetRoot, created: manifest.length };
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}
function sendJson(res, body) {
  send(res, 200, JSON.stringify(body), "application/json; charset=utf-8");
}

function isLoopbackAddress(address = "") {
  const normalized = String(address || "").toLowerCase().replace(/^::ffff:/, "");
  return normalized === "127.0.0.1" || normalized === "::1";
}

function requestCookies(req) {
  return String(req.headers.cookie || "").split(";").reduce((cookies, entry) => {
    const separator = entry.indexOf("=");
    if (separator < 0) return cookies;
    const key = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function mobileConversionToken() {
  try {
    const existing = fs.readFileSync(MOBILE_CONVERSION_TOKEN_FILE, "utf8").trim();
    if (/^[a-f0-9]{48}$/i.test(existing)) return existing;
  } catch {}
  const token = crypto.randomBytes(24).toString("hex");
  fs.mkdirSync(path.dirname(MOBILE_CONVERSION_TOKEN_FILE), { recursive: true });
  fs.writeFileSync(MOBILE_CONVERSION_TOKEN_FILE, token, { encoding: "utf8", mode: 0o600 });
  return token;
}

function hasMobileConversionAccess(req, parsed) {
  const supplied = String(parsed.query.access || requestCookies(req).tb_mobile_access || "");
  const expected = mobileConversionToken();
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length
    && suppliedBuffer.length > 0
    && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function localIPv4Addresses() {
  const addresses = [];
  Object.values(os.networkInterfaces()).flat().forEach((item) => {
    if (!item || item.internal || item.family !== "IPv4") return;
    if (String(item.address).startsWith("169.254.")) return;
    addresses.push(item.address);
  });
  return [...new Set(addresses)];
}

function mobileConversionLink() {
  const address = localIPv4Addresses()[0] || "127.0.0.1";
  return `http://${address}:${PORT}/mobile-conversion?access=${mobileConversionToken()}`;
}

function rewriteIntegratedConversionContent(source) {
  return String(source || "")
    .replaceAll("'/api/", "'/conversion-integrated/api/")
    .replaceAll('"/api/', '"/conversion-integrated/api/')
    .replaceAll("`/api/", "`/conversion-integrated/api/")
    .replaceAll(
      "input.startsWith('/conversion-integrated/api/')",
      "input.startsWith('/api/')"
    )
    .replaceAll(
      "pathname.startsWith('/conversion-integrated/api/')",
      "pathname.startsWith('/api/')"
    )
    .replaceAll(
      "/conversion-integrated/api/正式SOP",
      "/conversion-integrated/api/正式SOP?workbench-proxy=20260729-2"
    )
    .replaceAll(
      "/conversion-integrated/api/用户状态",
      "/conversion-integrated/api/用户状态?workbench-proxy=20260729-2"
    )
    .replaceAll(
      "console.error('正式SOP加载失败',error)",
      "console.warn('正式SOP增强层已回退到页面现有数据',error?.message||error)"
    );
}

function rewriteIntegratedConversionDocument(source) {
  const seamlessEmbeddedStyle = `
<style id="workbench-seamless-embed">
html.embedded-host,
html.embedded-host body,
html.embedded-host .app {
  background: transparent !important;
  background-image: none !important;
}
html.embedded-host .side {
  padding: 18px 28px 8px !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
html.embedded-host .main {
  padding: 8px 28px 28px !important;
  background: transparent !important;
}
html.embedded-host .side-bottom {
  background: color-mix(in srgb, var(--panel) 74%, transparent) !important;
}
html.embedded-host[data-workbench-theme="midnight"],
html.embedded-host[data-workbench-theme="midnight"] body,
html.embedded-host[data-workbench-theme="midnight"] .app,
html.embedded-host[data-workbench-theme="midnight-glass"],
html.embedded-host[data-workbench-theme="midnight-glass"] body,
html.embedded-host[data-workbench-theme="midnight-glass"] .app {
  color-scheme: dark;
  --panel: rgba(18, 35, 49, .86);
  --panel-light: rgba(29, 52, 67, .76);
  --line: rgba(144, 193, 207, .2);
  --ink: #edf6f7;
  --muted: #b6c7cc;
  --accent: #68b8ff;
  --selection: rgba(64, 124, 158, .35);
  color: var(--ink) !important;
}
html.embedded-host[data-workbench-theme="midnight"] :is(.card, .panel, .module, .side-bottom, input, textarea, select),
html.embedded-host[data-workbench-theme="midnight-glass"] :is(.card, .panel, .module, .side-bottom, input, textarea, select) {
  color: var(--ink) !important;
  border-color: var(--line) !important;
  background: color-mix(in srgb, var(--panel) 88%, transparent) !important;
}
@media (max-width: 900px) {
  html.embedded-host .side {
    padding: 12px 14px 6px !important;
  }
  html.embedded-host .main {
    padding: 8px 14px 22px !important;
  }
}
</style>`;
  const embeddedThemeScript = `
<script id="workbench-theme-bridge">
(function(){
  function applyWorkbenchTheme(theme){
    var value = String(theme || new URLSearchParams(location.search).get("theme") || "neo");
    document.documentElement.classList.add("embedded-host");
    document.documentElement.dataset.workbenchTheme = value;
    document.documentElement.dataset.theme = value;
  }
  applyWorkbenchTheme(new URLSearchParams(location.search).get("theme"));
  window.addEventListener("message", function(event){
    if (event.origin !== window.location.origin || !event.data || event.data.type !== "jianghu-theme") return;
    applyWorkbenchTheme(event.data.theme);
  });
  window.parent && window.parent.postMessage({ type: "jianghu-theme-ready" }, window.location.origin);
})();
</script>`;
  const rewritten = rewriteIntegratedConversionContent(source)
    .replaceAll(
      "正式SOP增强.js?v=20260718-scrollfix2",
      "正式SOP增强.js?v=20260718-scrollfix2&workbench-proxy=20260729-2"
    )
    .replaceAll('href="/', 'href="/conversion-integrated/')
    .replaceAll('src="/', 'src="/conversion-integrated/');
  return rewritten.includes("</head>")
    ? rewritten.replace("</head>", `${seamlessEmbeddedStyle}${embeddedThemeScript}</head>`)
    : `${seamlessEmbeddedStyle}${embeddedThemeScript}${rewritten}`;
}

function isIntegratedConversionCompatibilityPath(pathname) {
  return pathname === "/api/正式SOP" || pathname === "/api/用户状态";
}

function proxyIntegratedConversion(req, res, parsed, pathname) {
  const prefix = "/conversion-integrated";
  const upstreamPath = pathname.slice(prefix.length) || "/";
  const requestPath = `${upstreamPath}${parsed.search || ""}`;
  const cacheKey = `${upstreamPath}${upstreamPath.endsWith(".js") ? ":js" : ":document"}`;
  const canUseRewriteCache = req.method === "GET" && (upstreamPath === "/" || upstreamPath.endsWith(".js"));
  const cached = canUseRewriteCache ? conversionProxyCache.get(cacheKey) : null;
  if (cached && Date.now() - cached.savedAt < CONVERSION_CACHE_TTL_MS) {
    if (!res.headersSent) {
      res.writeHead(200, {
        "Content-Type": cached.contentType,
        "Content-Length": Buffer.byteLength(cached.content),
        "Cache-Control": "private, max-age=60"
      });
      res.end(cached.content);
    }
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const upstream = http.request(`${CONVERSION_SERVICE_ORIGIN}${requestPath}`, {
      method: req.method,
      headers: {
        ...req.headers,
        host: new URL(CONVERSION_SERVICE_ORIGIN).host,
        origin: CONVERSION_SERVICE_ORIGIN,
        referer: `${CONVERSION_SERVICE_ORIGIN}/`
      }
    }, (upstreamResponse) => {
      const contentTypeHeader = String(upstreamResponse.headers["content-type"] || "");
      const isAppDocument = req.method === "GET"
        && upstreamPath === "/"
        && contentTypeHeader.includes("text/html");
      const isJavascript = req.method === "GET"
        && (contentTypeHeader.includes("javascript") || upstreamPath.endsWith(".js"));
      if (!isAppDocument && !isJavascript) {
        const headers = { ...upstreamResponse.headers, "cache-control": "no-store" };
        delete headers["content-security-policy"];
        res.writeHead(upstreamResponse.statusCode || 502, headers);
        upstreamResponse.pipe(res);
        upstreamResponse.on("end", resolve);
        return;
      }
      const chunks = [];
      upstreamResponse.on("data", (chunk) => chunks.push(chunk));
      upstreamResponse.on("end", () => {
        const source = Buffer.concat(chunks).toString("utf8");
        const content = isAppDocument
          ? rewriteIntegratedConversionDocument(source)
          : rewriteIntegratedConversionContent(source);
        if (canUseRewriteCache && (upstreamResponse.statusCode || 200) < 400) {
          conversionProxyCache.set(cacheKey, {
            savedAt: Date.now(),
            content,
            contentType: isAppDocument
              ? "text/html; charset=utf-8"
              : "application/javascript; charset=utf-8"
          });
        }
        res.writeHead(upstreamResponse.statusCode || 200, {
          "Content-Type": isAppDocument
            ? "text/html; charset=utf-8"
            : "application/javascript; charset=utf-8",
          "Content-Length": Buffer.byteLength(content),
          "Cache-Control": PORT === 4327 ? "private, max-age=60" : "no-store"
        });
        res.end(content);
        resolve();
      });
    });
    upstream.on("error", reject);
    req.pipe(upstream);
  });
}

async function warmIntegratedConversionCache() {
  try {
    const response = await networkFetch(`${CONVERSION_SERVICE_ORIGIN}/`);
    if (!response.ok) return;
    const content = rewriteIntegratedConversionDocument(await response.text());
    conversionProxyCache.set("/:document", {
      savedAt: Date.now(),
      content,
      contentType: "text/html; charset=utf-8"
    });
  } catch {
    // The conversion service can be started later without blocking the workbench.
  }
}

async function requestConversionService(endpoint, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 15_000));
  try {
    const response = await fetch(`${CONVERSION_SERVICE_ORIGIN}${endpoint}`, {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`转化知识库返回了无法识别的内容（${response.status}）`);
    }
    if (!response.ok) throw new Error(payload.error || payload.message || `转化知识库请求失败（${response.status}）`);
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("转化知识库响应超时");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function getConversionSnapshot() {
  try {
    const [health, sop, search, plans, journey] = await Promise.all([
      requestConversionService("/api/健康", { timeoutMs: 5_000 }),
      requestConversionService("/api/正式SOP", { timeoutMs: 12_000 }),
      requestConversionService("/api/搜索快照", { timeoutMs: 45_000 }),
      requestConversionService("/api/方案索引", { timeoutMs: 30_000 }),
      requestConversionService("/api/用户旅程", { timeoutMs: 8_000 })
    ]);
    return {
      ok: true,
      serviceOrigin: CONVERSION_SERVICE_ORIGIN,
      source: "团建工作台·流量转化",
      health,
      sop,
      search,
      plans,
      journey
    };
  } catch (error) {
    return {
      ok: false,
      serviceOrigin: CONVERSION_SERVICE_ORIGIN,
      source: "团建工作台·流量转化",
      launcherAvailable: exists(CONVERSION_ASSISTANT_LAUNCHER),
      error: error.message
    };
  }
}

function isAllowedExternalTarget(target) {
  if (target === "cgpt-workpkg://run" || target === "cgpt-workpkg://configure") return true;
  try {
    const parsed = new URL(target);
    return parsed.protocol === "https:"
      && ["chatgpt.com", "mp.weixin.qq.com", "github.com", "raw.githubusercontent.com"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function buildDistributionArgs(body = {}) {
  const type = body.type === "conversion" ? "团建转化" : "泛流量";
  if (body.action === "official-reserve") {
    return ["--official-account", "--type", type];
  }
  if (body.action !== "device-restock") throw new Error("不支持的分发操作");
  const device = String(body.device || "").trim();
  if (!device || device.length > 80 || device.startsWith("-") || /[\r\n\0]/.test(device)) {
    throw new Error("设备名称无效");
  }
  const args = ["--device", device, "--type", type];
  const collection = String(body.collection || "").trim();
  if (collection) {
    if (collection.length > 160 || collection.startsWith("-") || /[\r\n\0]/.test(collection)) {
      throw new Error("作品集名称无效");
    }
    args.push("--collection", collection);
  }
  return args;
}

function runDistributionAction(args) {
  const script = path.join(DEVICE_TRANSFER_ROOT, "scripts", "restock_device.py");
  const actionTaskId = `distribution-action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(pythonExe(), [script, ...args], {
      cwd: DEVICE_TRANSFER_ROOT,
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
        TRAE_TASK_ID: actionTaskId
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const limit = 64 * 1024;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("分发操作超时，已停止等待；请检查设备端状态"));
    }, 20 * 60 * 1000);
    child.stdout.on("data", (chunk) => {
      if (stdout.length < limit) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < limit) stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, output: stdout.trim() });
      else reject(new Error((stderr || stdout || `分发脚本退出码 ${code}`).trim()));
    });
  });
}

function trimCompletedTasks(tasks) {
  if (tasks.size < 50) return;
  const removable = Array.from(tasks.entries())
    .filter(([, task]) => !["running", "cancelling"].includes(task.state))
    .sort((left, right) => String(left[1].startedAt).localeCompare(String(right[1].startedAt)));
  removable.slice(0, Math.max(1, tasks.size - 49))
    .forEach(([id]) => tasks.delete(id));
}

function recentPublicTasks(tasks, limit = 12) {
  const cutoff = Date.now() - (3 * 60 * 1000);
  for (const [id, task] of tasks.entries()) {
    if (["running", "cancelling"].includes(task.state)) continue;
    const finishedAt = Date.parse(task.finishedAt || task.startedAt || "");
    if (Number.isFinite(finishedAt) && finishedAt < cutoff) tasks.delete(id);
  }
  return Array.from(tasks.values())
    .sort((left, right) => String(right.startedAt || "").localeCompare(String(left.startedAt || "")))
    .slice(0, limit)
    .map(publicTransferTask);
}

function resolveDistributionCollectionSource(collectionName) {
  const name = String(collectionName || "").trim();
  if (!name) throw new Error("请选择一个真实可用的作品集");
  const libraryRoot = path.resolve(getWorkspaceSettings().workPackage.libraryPath);
  const distribution = getDistributionSnapshot({ publishRoot: PUBLISH_ROOT, libraryRoot });
  const collection = mergeCollectionLedger(distribution.collections || [])
    .find((item) => String(item.name || "") === name);
  if (!collection) throw new Error(`作品集不存在：${name}`);
  if (collection.workflowStage !== "mobile"
    || collection.sourceValid === false
    || collection.dualPlatformEligible === false
    || collection.automaticEligible !== true) {
    const reason = (collection.exclusionReasons || []).join("；") || "作品集不在手机可分发阶段";
    throw new Error(`作品集当前不可发送：${name}（${reason}）`);
  }
  const source = path.resolve(String(collection.sourcePath || ""));
  const relative = path.relative(libraryRoot, source);
  if (!source || !exists(source) || !relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`作品集源目录无效：${name}`);
  }
  return { collection, source };
}

function startDistributionTask(body = {}) {
  if (body.action !== "device-restock") {
    throw new Error("这个任务入口只用于手机作品包分发");
  }
  const trustedDevice = assertTrustedDeviceTarget(body.device);
  const selected = resolveDistributionCollectionSource(body.collection);
  const args = ["--source", selected.source, "--device", String(body.device || "").trim()];
  const taskId = `distribution-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  trimCompletedTasks(distributionTasks);
  const record = {
    id: taskId,
    kind: "distribution",
    action: body.action,
    device: String(body.device || "").trim(),
    deviceId: trustedDevice.id,
    collection: String(body.collection || "").trim(),
    source: selected.source,
    contentType: body.type === "conversion" ? "精准流量" : "泛流量",
    state: "running",
    stage: "queued",
    stageLabel: "准备开始发送",
    progress: 0,
    message: "任务已经建立",
    output: "",
    remoteTaskId: "",
    startedAt: new Date().toISOString(),
    child: null
  };
  // The workbench is the source-of-truth for the current no-Junction
  // distribution stages. Send the exact validated collection source instead
  // of asking the legacy random-restock scanner to rediscover old platform
  // entries, then move it only after the receiver commit succeeds.
  const script = path.join(DEVICE_TRANSFER_ROOT, "scripts", "send_to_device.py");
  const child = childProcess.spawn(pythonExe(), [script, ...args], {
    cwd: DEVICE_TRANSFER_ROOT,
    env: {
      ...process.env,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
      TRAE_TASK_ID: taskId
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  record.child = child;
  distributionTasks.set(taskId, record);
  child.stdout.on("data", (chunk) => updateTransferProgress(record, chunk));
  child.stderr.on("data", (chunk) => updateTransferProgress(record, chunk, true));
  child.on("error", (error) => {
    record.state = "failed";
    record.stage = "failed";
    record.stageLabel = "发送未完成";
    record.message = error.message;
    record.finishedAt = new Date().toISOString();
  });
  child.on("close", (code) => {
    if (record.state === "cancelling") {
      record.state = "cancelled";
      record.stage = "cancelled";
      record.stageLabel = "已停止发送";
      record.message = "已停止；为防止重复发送，请先核对手机接收情况";
    } else if (code === 0) {
      record.state = "completed";
      record.stage = "completed";
      record.stageLabel = "发送完成并已记录";
      record.progress = 100;
      record.message = "作品包已发送，已自动进入公众号";
      try {
        const libraryRoot = getWorkspaceSettings().workPackage.libraryPath;
        moveCollectionSourceToStage({
          publishRoot: PUBLISH_ROOT,
          libraryRoot,
          collection: record.collection,
          stage: "official"
        });
      } catch (error) {
        record.stageLabel = "发送完成，文件待整理";
        record.message = `手机已确认接收；自动移动失败：${error.message}`;
      }
    } else {
      record.state = "failed";
      record.stage = "failed";
      record.stageLabel = "发送未完成";
      record.message = record.error || record.message || `分发进程退出码 ${code}`;
    }
    record.finishedAt = new Date().toISOString();
    record.child = null;
  });
  return publicTransferTask(record);
}

function cancelDistributionTask(taskId) {
  const record = distributionTasks.get(String(taskId || ""));
  if (!record) throw new Error("分发任务不存在");
  if (record.state !== "running") return publicTransferTask(record);
  record.state = "cancelling";
  record.stage = "cancelling";
  record.stageLabel = "正在安全停止";
  record.message = "正在停止发送";
  if (record.child && !record.child.killed) record.child.kill();
  if (record.remoteTaskId) {
    const script = path.join(DEVICE_TRANSFER_ROOT, "scripts", "send_to_device.py");
    childProcess.spawn(pythonExe(), [
      script,
      "--cancel-task",
      record.remoteTaskId,
      "--device",
      record.device
    ], {
      cwd: DEVICE_TRANSFER_ROOT,
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
      windowsHide: true,
      detached: true,
      stdio: "ignore"
    }).unref();
  }
  return publicTransferTask(record);
}

function startGenericTransfer(source, device) {
  const rawSource = String(source || "").trim();
  if (!rawSource) throw new Error("请选择要传送的文件或文件夹");
  const resolvedSource = path.resolve(rawSource);
  const deviceName = String(device || "").trim();
  const trustedDevice = assertTrustedDeviceTarget(deviceName);
  if (!resolvedSource || !exists(resolvedSource)) throw new Error("选择的文件或文件夹不存在");
  if (path.parse(resolvedSource).root === resolvedSource) {
    throw new Error("不能直接传送整个磁盘，请选择具体文件或文件夹");
  }
  if (!deviceName || deviceName.length > 80 || deviceName.startsWith("-") || /[\r\n\0]/.test(deviceName)) {
    throw new Error("设备名称无效");
  }
  const taskId = `transfer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  trimCompletedTasks(genericTransferTasks);
  const record = {
    id: taskId,
    device: deviceName,
    deviceId: trustedDevice.id,
    source: resolvedSource,
    state: "running",
    stage: "queued",
    stageLabel: "准备开始发送",
    progress: 0,
    message: "准备传送",
    output: "",
    remoteTaskId: "",
    startedAt: new Date().toISOString(),
    child: null
  };
  const script = path.join(DEVICE_TRANSFER_ROOT, "scripts", "send_to_device.py");
  const child = childProcess.spawn(pythonExe(), [script, "--source", resolvedSource, "--device", deviceName], {
    cwd: DEVICE_TRANSFER_ROOT,
    env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  record.child = child;
  genericTransferTasks.set(taskId, record);
  child.stdout.on("data", (chunk) => updateTransferProgress(record, chunk));
  child.stderr.on("data", (chunk) => updateTransferProgress(record, chunk, true));
  child.on("error", (error) => {
    record.state = "failed";
    record.stage = "failed";
    record.stageLabel = "发送未完成";
    record.message = error.message;
    record.finishedAt = new Date().toISOString();
  });
  child.on("close", (code) => {
    if (record.state === "cancelling") {
      record.state = "cancelled";
      record.stage = "cancelled";
      record.stageLabel = "已停止发送";
      record.message = "已取消传送";
    } else if (code === 0) {
      record.state = "completed";
      record.stage = "completed";
      record.stageLabel = "发送完成并确认接收";
      record.progress = 100;
      record.message = "发送完成";
    } else {
      record.state = "failed";
      record.stage = "failed";
      record.stageLabel = "发送未完成";
      record.message = record.error || record.message || `传送进程退出码 ${code}`;
    }
    record.finishedAt = new Date().toISOString();
    record.child = null;
  });
  return publicTransferTask(record);
}

function cancelGenericTransfer(taskId) {
  const record = genericTransferTasks.get(String(taskId || ""));
  if (!record) throw new Error("传送任务不存在");
  if (record.state !== "running") return publicTransferTask(record);
  record.state = "cancelling";
  record.stage = "cancelling";
  record.stageLabel = "正在安全停止";
  record.message = "正在取消";
  if (record.child && !record.child.killed) record.child.kill();
  if (record.remoteTaskId) {
    const script = path.join(DEVICE_TRANSFER_ROOT, "scripts", "send_to_device.py");
    childProcess.spawn(pythonExe(), [
      script,
      "--cancel-task",
      record.remoteTaskId,
      "--device",
      record.device
    ], {
      cwd: DEVICE_TRANSFER_ROOT,
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
      windowsHide: true,
      detached: true,
      stdio: "ignore"
    }).unref();
  }
  return publicTransferTask(record);
}

function runDeviceStatus() {
  const script = path.join(DEVICE_TRANSFER_ROOT, "scripts", "send_to_device.py");
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(pythonExe(), [script, "--status"], {
      cwd: DEVICE_TRANSFER_ROOT,
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8"
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("设备在线状态扫描超时"));
    }, 30_000);
    child.stdout.on("data", (chunk) => {
      if (stdout.length < 64 * 1024) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 64 * 1024) stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, output: stdout.trim() });
      else reject(new Error((stderr || stdout || `设备扫描退出码 ${code}`).trim()));
    });
  });
}

function getDeviceStatus(force = false) {
  const fresh = Date.now() - deviceStatusCache.checkedAt < 15_000;
  if (!force && fresh) return Promise.resolve(deviceStatusCache);
  if (deviceStatusPromise) return deviceStatusPromise;
  deviceStatusPromise = runDeviceStatus()
    .then((result) => {
      const checkedAt = Date.now();
      const onlineDevices = mergeDevicePresence(
        parseOnlineDeviceStatus(result.output),
        deviceStatusCache.onlineDevices,
        checkedAt
      );
      deviceStatusCache = {
        checkedAt,
        output: result.output || "",
        onlineDevices
      };
      writeJson(DEVICE_PRESENCE_FILE, { version: 1, checkedAt, onlineDevices });
      return deviceStatusCache;
    })
    .finally(() => {
      deviceStatusPromise = null;
    });
  return deviceStatusPromise;
}

function devicePresenceKey(device = {}) {
  const model = String(device.model || "").trim().toLowerCase();
  if (model) return `model:${model}`;
  return `name:${String(device.name || "")
    .toLowerCase()
    .replace(/[（(][^）)]*作品数[^）)]*[）)]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "")}`;
}

function mergeDevicePresence(currentRecords, previousRecords, now = Date.now(), ttlMs = 10 * 60_000) {
  const current = Array.isArray(currentRecords) ? currentRecords : [];
  const previous = Array.isArray(previousRecords) ? previousRecords : [];
  const merged = new Map();
  previous.forEach((record) => {
    const lastSeenAt = Number(record.lastSeenAt || 0);
    if (lastSeenAt && now - lastSeenAt <= ttlMs) {
      merged.set(devicePresenceKey(record), { ...record, current: false, recentlySeen: true });
    }
  });
  current.forEach((record) => {
    merged.set(devicePresenceKey(record), {
      ...record,
      transport: record.transport || "wifi",
      current: true,
      recentlySeen: false,
      lastSeenAt: now
    });
  });
  return Array.from(merged.values());
}

function waitForDistributionTask(taskId) {
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const record = distributionTasks.get(taskId);
      if (!record || !["running", "cancelling"].includes(record.state)) {
        clearInterval(timer);
        resolve(record || null);
      }
    }, 500);
  });
}

async function runAutomaticDistributionBatch(device, liveRecord, collections, settings) {
  const target = device.aliases?.[0] || device.displayName;
  const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  appendAutomationLog({
    event: "started",
    batchId,
    deviceId: device.id,
    device: device.note || device.displayName,
    phoneReserve: liveRecord.workCount,
    category: settings.autoCategory,
    requested: collections.length,
    message: "检测到手机作品集储备不足，开始自动分发"
  });
  let completed = 0;
  for (const collection of collections) {
    try {
      const task = startDistributionTask({
        action: "device-restock",
        device: target,
        collection: collection.name,
        type: collection.type === "conversion" ? "conversion" : "traffic",
        automatic: true
      });
      const result = await waitForDistributionTask(task.id);
      if (!result || result.state !== "completed") {
        throw new Error(result?.message || "自动分发未完成");
      }
      completed += 1;
      appendAutomationLog({
        event: "item-completed",
        batchId,
        taskId: task.id,
        deviceId: device.id,
        device: device.note || device.displayName,
        collection: collection.name,
        progress: Math.round((completed / collections.length) * 100),
        message: "作品集已完成自动分发"
      });
    } catch (error) {
      appendAutomationLog({
        event: "failed",
        batchId,
        deviceId: device.id,
        device: device.note || device.displayName,
        collection: collection.name,
        completed,
        message: error.message
      });
      return;
    }
  }
  appendAutomationLog({
    event: "completed",
    batchId,
    deviceId: device.id,
    device: device.note || device.displayName,
    completed,
    progress: 100,
    message: `自动分发完成，共发送 ${completed} 个作品集`
  });
}

function maybeStartAutomaticDistribution(onlineDevices = []) {
  const settings = getPageSettings().distribution;
  const currentRecords = onlineDevices.filter((record) => record.current !== false);
  const currentKeys = new Set(currentRecords.map(devicePresenceKey));
  Array.from(automaticDistributionSessions).forEach((key) => {
    if (!currentKeys.has(key)) automaticDistributionSessions.delete(key);
  });
  if (!settings.autoDistributionEnabled || !settings.detectOnConnection) return [];

  const distribution = getDistributionSnapshot({
    publishRoot: PUBLISH_ROOT,
    libraryRoot: getWorkspaceSettings().workPackage.libraryPath
  });
  const eligible = mergeCollectionLedger(distribution.collections || []).filter((collection) =>
    collection.workflowStage === "mobile"
      && collection.sourceValid !== false
      && collection.dualPlatformEligible !== false
      && (settings.autoCategory === "all" || collection.type === settings.autoCategory)
  );
  const triggered = [];
  currentRecords.forEach((liveRecord) => {
    const key = devicePresenceKey(liveRecord);
    if (automaticDistributionSessions.has(key)) return;
    const device = findTrustedDevice(registeredDevices(), liveRecord.name)
      || findTrustedDevice(registeredDevices(), liveRecord.model);
    if (!device || !Number.isFinite(Number(liveRecord.workCount))) return;
    automaticDistributionSessions.add(key);
    const missing = Math.max(0, settings.phoneReserveThreshold - Number(liveRecord.workCount));
    const sendCount = Math.min(settings.autoSendCount, missing, eligible.length);
    if (!sendCount) return;
    const collections = eligible.splice(0, sendCount);
    triggered.push({
      deviceId: device.id,
      device: device.note || device.displayName,
      phoneReserve: Number(liveRecord.workCount),
      count: collections.length
    });
    runAutomaticDistributionBatch(device, liveRecord, collections, settings).catch((error) => {
      appendAutomationLog({
        event: "failed",
        deviceId: device.id,
        device: device.note || device.displayName,
        message: error.message
      });
    });
  });
  return triggered;
}

function parseOnlineDeviceStatus(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t").map((part) => part.trim());
      if (parts.length < 3 || parts[parts.length - 1] !== "online") return null;
      const match = parts[0].match(/作品数\s*(\d+)/);
      return {
        name: parts[0],
        model: parts[1],
        online: true,
        transport: "wifi",
        workCount: match ? Number(match[1]) : null
      };
    })
    .filter(Boolean);
}

function pickFolderWithWindowsDialog(description = "选择文件夹") {
  const safeDescription = String(description).replace(/'/g, "''");
  const command = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$owner = New-Object System.Windows.Forms.Form",
    "$owner.TopMost = $true",
    "$owner.ShowInTaskbar = $false",
    "$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen",
    "$owner.Width = 1",
    "$owner.Height = 1",
    "$owner.Opacity = 0",
    "$owner.Show()",
    "$owner.Activate()",
    "$dialog = New-Object System.Windows.Forms.OpenFileDialog",
    `$dialog.Title = '${safeDescription}'`,
    "$dialog.CheckFileExists = $false",
    "$dialog.CheckPathExists = $true",
    "$dialog.ValidateNames = $false",
    "$dialog.DereferenceLinks = $true",
    "$dialog.RestoreDirectory = $true",
    "$dialog.FileName = '选择当前文件夹'",
    "$dialog.Filter = '文件夹|*.folder'",
    "$result = $dialog.ShowDialog($owner)",
    "$owner.Close()",
    "if ($result -eq [System.Windows.Forms.DialogResult]::OK) {",
    "  $selected = Split-Path -Parent $dialog.FileName",
    "  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "  Write-Output $selected",
    "}"
  ].join("; ");
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn("powershell.exe", [
      "-NoProfile",
      "-STA",
      "-Command",
      command
    ], {
      windowsHide: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || "目录选择器打开失败"));
      resolve(stdout.trim());
    });
  });
}

function pickFileWithWindowsDialog(title = "选择要传送的文件") {
  const safeTitle = String(title).replace(/'/g, "''");
  const command = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.OpenFileDialog",
    `$dialog.Title = '${safeTitle}'`,
    "$dialog.Multiselect = $false",
    "$dialog.CheckFileExists = $true",
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
    "  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "  Write-Output $dialog.FileName",
    "}"
  ].join("; ");
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn("powershell.exe", [
      "-NoProfile", "-STA", "-Command", command
    ], { windowsHide: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || "文件选择器打开失败"));
      resolve(stdout.trim());
    });
  });
}

function saveWorkspaceSettings(body) {
  const current = getWorkspaceSettings();
  const materialRoot = path.resolve(String(body.materialRoot || current.materialRoot).trim());
  if (!exists(materialRoot) || !fs.statSync(materialRoot).isDirectory()) {
    throw new Error("素材目录不存在或不是文件夹");
  }
  const localPrevious = readJson(APP_SETTINGS_FILE, {});
  const imageApi = body.imageApi ? {
    provider: ["local-openai", "bytecat", "minimax"].includes(String(body.imageApi.provider))
      ? String(body.imageApi.provider) : "local-openai",
    baseUrl: String(body.imageApi.baseUrl || "").trim().slice(0, 500),
    model: String(body.imageApi.model || "").trim().slice(0, 200)
  } : localPrevious.imageApi;
  if (imageApi?.baseUrl) {
    let parsed;
    try { parsed = new URL(imageApi.baseUrl); } catch { throw new Error("生图 API 地址格式不正确"); }
    if (parsed.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(parsed.hostname)) {
      throw new Error("生图 API 必须使用 HTTPS；本机接口可使用 localhost");
    }
  }
  writeJson(APP_SETTINGS_FILE, { ...localPrevious, materialRoot, imageApi });

  if (body.workPackage) {
    const previous = readJson(WORKPKG_CONFIG_FILE, {});
    const libraryPath = path.resolve(String(
      body.workPackage.libraryPath || current.workPackage.libraryPath
    ).trim());
    if (!exists(libraryPath) || !fs.statSync(libraryPath).isDirectory()) {
      throw new Error("作品集存放目录不存在或不是文件夹");
    }
    const batchSize = Math.max(1, Math.min(100, Number(body.workPackage.batchSize || 14)));
    const next = {
      ...previous,
      library_path: libraryPath,
      portfolio_batch_size: batchSize,
      portfolio_auto_group: body.workPackage.autoGroup !== false,
      portfolio_auto_zip: body.workPackage.autoZip !== false
    };
    if (exists(WORKPKG_CONFIG_FILE)) {
      fs.copyFileSync(WORKPKG_CONFIG_FILE, `${WORKPKG_CONFIG_FILE}.bak`);
    }
    writeJson(WORKPKG_CONFIG_FILE, next);
  }
  materialCategoryCache.clear();
  materialPostCache = null;
  materialLibraryCache = null;
  return getWorkspaceSettings();
}

function getBody(req, maxBytes = 2_000_000) {
  return new Promise((resolve, reject) => {
    let data = "";
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      data += chunk;
      if (data.length > maxBytes) {
        settled = true;
        const error = new Error("request body too large");
        error.statusCode = 413;
        reject(error);
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!settled) resolve(data);
    });
    req.on("error", (error) => {
      if (!settled) reject(error);
    });
  });
}

function resolvePublicFile(requestPath) {
  const index = path.join(PUBLIC_ROOT, "index.html");
  let decoded = String(requestPath || "/");
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return index;
  }
  const relative = decoded.replace(/^[/\\]+/, "");
  const candidate = path.resolve(PUBLIC_ROOT, relative || "index.html");
  return isPathInside(PUBLIC_ROOT, candidate) && exists(candidate) ? candidate : index;
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

// 分模块路由共享上下文（只构造一次，各路由模块按需取用）
const routeCtx = {
  // 工具函数
  send, sendJson, sendExtensionJson, extensionCorsHeaders, getBody,
  isLoopbackAddress, isAllowedFile, isAllowedExternalTarget, isPathInside,
  contentType, resolvePublicFile, getWorkspaceSettings,
  getCloudBackupStatus, runCloudBackupNow, inspectLatestCloudBackup,
  restoreLatestCloudBackup, getPageSettings, startLargeCloudBackup, readJson,
  getLargeCloudBackupTask: () => largeCloudBackupTask,
  saveWorkspaceSettings, savePageSettings, buildCloudBackupPayload, restoreBackupPayload,
  updateCollectionLedger, collectionLedgerCsv, pickFolderWithWindowsDialog,
  pickFileWithWindowsDialog, recentPublicTasks, startGenericTransfer,
  cancelGenericTransfer, startDistributionTask, cancelDistributionTask,
  runDistributionAction, buildDistributionArgs, exists, updateDeviceNote,
  getDeviceStatus, parseOnlineDeviceStatus, registeredDevices,
  maybeStartAutomaticDistribution, recentAutomationLogs,
  // 路径常量
  PROJECT_ROOT, DATA_ROOT, PUBLIC_ROOT, APP_ROOT, SKILL_ROOT,
  CONVERSION_SERVICE_ORIGIN, CONVERSION_ASSISTANT_ROOT, CONVERSION_ASSISTANT_LAUNCHER,
  RELEASE_ROOT, DEVICE_TRANSFER_ROOT, DEVICE_REGISTRY_FILE,
  // 数据文件
  STATE_FILE, PROMPTS_FILE, TASK_INDEX_FILE, APP_SETTINGS_FILE,
  IMAGE_API_SECRET_FILE, WEBDAV_CONFIG_FILE, CLOUD_BACKUP_META_FILE,
  CLOUD_LARGE_BACKUP_MANIFEST_FILE, IMAGE_REVIEW_ROOT, PRODUCTION_JOB_ROOT,
  COLLECTION_LEDGER_FILE, DEVICE_PRESENCE_FILE, DEVICE_NOTES_FILE,
  DISTRIBUTION_AUTOMATION_LOG_FILE, MOBILE_CONVERSION_TOKEN_FILE,
  MATERIAL_SCAN_CACHE_FILE, MATERIAL_LIBRARY_CACHE_FILE,
  DEDUP_LEDGER_FILE, EXTENSION_DOWNLOAD_LOG_FILE,
  MATERIAL_USAGE_LEDGER_FILE, MATERIAL_METADATA_LEDGER_FILE,
  MATERIAL_HASH_CACHE_FILE, MATERIAL_GLOBAL_INDEX_FILE,
  GPT_QUOTA_LEDGER_FILE, GPT_PRODUCTION_CHECKPOINT_FILE,
  GPT_PRODUCTION_ARCHIVE_LOG_FILE, GPT_CONVERSATION_LOG_FILE, WORKPKG_SCRIPT_ROOT, WORKPKG_CONFIG_FILE,
  DOWNLOAD_ROOT, PUBLISH_ROOT,
  // 运行时状态（引用类型，各路由模块可通过引用操作）
  genericTransferTasks, distributionTasks, automaticDistributionSessions,
  pendingProductionPlans, materialCategoryCache, deviceStatusCache,
  deviceStatusPromise, materialGlobalIndexJob,
  // 生产域函数与状态
  productionJobs, productionAbortControllers,
  createProductionPlans, publicProductionJob, safeProductionOptions,
  productionResumeScope, saveProductionJob, updateProductionJob,
  runProductionJob, productionWorkbenchProducts, packProductionWorks,
  saveImageApiSecret, saveTextApiSecret,
  publicImageApiSettings, publicTextApiSettings,
  imageApiCredential, textApiCredential,
  interpretWorkbenchAssistantCommand,
  collectReferenceImages, materialFacts, buildProductionPrompt,
  safeOutputName, generateImages, networkFetch,
  normalizeImageApiConfig, normalizeTextApiConfig,
  writeJson,
  // GPT+扩展+去重域函数与状态
  PORT,
  readOnlineTemplates, updateOnlineTemplate,
  extensionProductSnapshot, extensionProductTreeSnapshot,
  runExtensionWorkPackage, saveExtensionCopyText,
  readGptProductionCheckpoint, writeGptProductionCheckpoint,
  findRecoverableImageBatch, gptQuotaSnapshot, appendGptQuotaEvent,
  archiveMaterialAfterProduction, inspectGptWorkPackage,
  recordMaterialUsage, checkMaterialUsage, updateMaterialMetadata,
  getMaterialGlobalIndex,
  publicDedupStatus, syncHistoricalDedupLedger, getDedupLedger,
  isDownloadedText, registerDownloadedText,
  // 转化域函数与状态
  LISTEN_HOST,
  hasMobileConversionAccess, mobileConversionToken, mobileConversionLink,
  localIPv4Addresses, proxyIntegratedConversion,
  isIntegratedConversionCompatibilityPath,
  requestConversionService, getConversionSnapshot,
};

async function route(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);
  const remoteRequest = !isLoopbackAddress(req.socket.remoteAddress);

  if (await conversionRoute.handleEarly(req, res, pathname, parsed, routeCtx)) return;

  if (remoteRequest) {
    return send(res, 403, "此入口仅供本机使用。", "text/plain; charset=utf-8");
  }

  if (await conversionRoute.handle(req, res, pathname, parsed, routeCtx)) return;

  if (req.method === "OPTIONS") {
    res.writeHead(204, extensionCorsHeaders(req));
    return res.end();
  }

  if (pathname === "/api/dashboard") {
    const libraryPath = parsed.query.library ? decodeURIComponent(parsed.query.library) : "";
    return sendExtensionJson(req, res, getDashboard(parsed.query.refresh === "materials", libraryPath));
  }

  if (pathname === "/api/materials/all") {
    return sendExtensionJson(req, res, getMaterialLibrary(parsed.query.refresh === "1", "", { loadAll: true }));
  }

  if (pathname === "/api/materials") {
    const libraryPath = parsed.query.library ? decodeURIComponent(parsed.query.library) : "";
    if (libraryPath) {
      return sendExtensionJson(req, res, getMaterialLibrary(parsed.query.refresh === "1", libraryPath));
    }
    // 不带 library 参数时只返回分类索引（不加载帖子），避免一次性扫描所有分类阻塞服务器
    return sendExtensionJson(req, res, getMaterialLibrary(parsed.query.refresh === "1", "", {
      loadAll: false,
      loadDefault: false
    }));
  }

  if (await gptExtensionRoute.handle(req, res, pathname, parsed, routeCtx)) return;

  if (pathname === "/api/materials" && req.method === "GET") {
    ensureDataFiles();
    const libraryPath = parsed.query.library ? decodeURIComponent(parsed.query.library) : "";
    const categoryId = parsed.query.category ? decodeURIComponent(parsed.query.category) : "";
    const selectedPath = categoryId || libraryPath;
    const materials = getMaterialLibrary(
      parsed.query.refresh === "true",
      selectedPath,
      { loadDefault: Boolean(selectedPath) }
    );
    return sendExtensionJson(req, res, {
      generatedAt: new Date().toISOString(),
      materials: compactMaterialIndex(materials, categoryId)
    });
  }

  if (await juguangRoute.handle(req, res, pathname, parsed, routeCtx)) return;

  if (pathname === "/api/state" && req.method === "POST") {
    const body = JSON.parse(await getBody(req) || "{}");
    const previous = readJson(STATE_FILE, {});
    const next = sanitizeState({ ...previous, ...body, updatedAt: new Date().toISOString() });
    writeJson(STATE_FILE, next);
    return sendJson(res, next);
  }

  if (pathname === "/api/prompts" && req.method === "POST") {
    const body = JSON.parse(await getBody(req) || "{}");
    const data = readJson(PROMPTS_FILE, { prompts: [] });
    const prompt = data.prompts.find((item) => item.id === body.id);
    if (!prompt) return send(res, 404, JSON.stringify({ error: "prompt not found" }));
    const version = body.version || `V${prompt.versions.length + 1}`;
    prompt.versions.unshift({
      version,
      createdAt: new Date().toISOString().slice(0, 10),
      sourceFile: "workflow-dashboard",
      content: body.content || ""
    });
    prompt.activeVersion = version;
    data.updatedAt = new Date().toISOString();
    writeJson(PROMPTS_FILE, data);
    return sendJson(res, data);
  }

  if (pathname === "/api/rename" && req.method === "POST") {
    const body = JSON.parse(await getBody(req) || "{}");
    const target = body.path || "";
    const newName = String(body.newName || "").trim();
    if (!target || !isAllowedFile(target) || !exists(target)) return send(res, 403, JSON.stringify({ error: "path not allowed" }));
    if (!newName || /[\\/:*?"<>|]/.test(newName)) return send(res, 400, JSON.stringify({ error: "invalid name" }));
    const next = path.join(path.dirname(target), newName);
    if (!isAllowedFile(next) || exists(next)) return send(res, 400, JSON.stringify({ error: "target exists or not allowed" }));
    fs.renameSync(target, next);
    return sendJson(res, { ok: true, path: next });
  }

  if (pathname === "/api/trash-workspace-folder" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    try {
      return sendJson(res, trashEditableWorkspaceDirectory(body.path));
    } catch (error) {
      return send(res, 400, JSON.stringify({ error: error.message }));
    }
  }


  if (pathname === "/api/collect-materials" && req.method === "POST") {
    const body = JSON.parse(await getBody(req) || "{}");
    const items = Array.isArray(body.items) ? body.items.slice(0, 300) : [];
    if (!items.length) return send(res, 400, JSON.stringify({ error: "no items" }));
    const result = collectMaterialLinks(body.libraryPath, items, body.filterSummary || "");
    return sendJson(res, result);
  }

  if (await settingsRoute.handle(req, res, pathname, parsed, routeCtx)) return;

  if (await productionRoute.handle(req, res, pathname, parsed, routeCtx)) return;

  if (await backupRoute.handle(req, res, pathname, parsed, routeCtx)) return;

  if (await distributionRoute.handle(req, res, pathname, parsed, routeCtx)) return;



  if (await wechatDraftRoute.handle(req, res, pathname, parsed, routeCtx)) return;

  if (pathname === "/api/open" && req.method === "POST") {
    const body = JSON.parse(await getBody(req) || "{}");
    const target = body.path;
    if (!target || !isAllowedFile(target)) return send(res, 403, JSON.stringify({ error: "path not allowed" }));
    childProcess.spawn("explorer.exe", [target], { detached: true, stdio: "ignore" }).unref();
    return sendJson(res, { ok: true });
  }
  if (pathname === "/api/open-url" && req.method === "POST") {
    const body = JSON.parse(await getBody(req) || "{}");
    const target = body.target;
    if (!isAllowedExternalTarget(target)) return send(res, 403, JSON.stringify({ error: "external target not allowed" }));
    childProcess.spawn("explorer.exe", [target], { detached: true, stdio: "ignore" }).unref();
    return sendJson(res, { ok: true });
  }

  if (pathname === "/file") {
    if (res.headersSent) return;
    const target = parsed.query.path ? decodeURIComponent(parsed.query.path) : "";
    if (!target || !isAllowedFile(target) || !exists(target)) return send(res, 404, "not found", "text/plain; charset=utf-8");
    res.writeHead(200, {
      "Content-Type": contentType(target),
      "Cache-Control": "no-store",
      ...extensionCorsHeaders(req)
    });
    return fs.createReadStream(target).pipe(res);
  }

  if (res.headersSent) return;
  const file = resolvePublicFile(pathname);
  if (!file) return send(res, 404, "not found", "text/plain; charset=utf-8");
  res.writeHead(200, { "Content-Type": contentType(file), "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
}

const httpServer = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    console.error(error);
    if (res.headersSent) return;
    send(res, 500, JSON.stringify({ error: error.message }));
  });
});

httpServer.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(formatPortInUseMessage(PORT));
    process.exitCode = 1;
    return;
  }
  throw error;
});

if (require.main === module) {
  ensureDataFiles();
  httpServer.listen(PORT, LISTEN_HOST, () => {
    console.log(`团建工作台: http://localhost:${PORT}`);
    if (LISTEN_HOST !== "127.0.0.1") console.log(`手机转化入口已开启: ${mobileConversionLink()}`);
    console.log(`项目根目录: ${PROJECT_ROOT}`);
    cloudBackupTimer = setInterval(runScheduledCloudBackup, 15 * 60 * 1000);
    cloudBackupTimer.unref?.();
    setTimeout(runScheduledCloudBackup, 8_000).unref?.();
    setTimeout(warmIntegratedConversionCache, 1_200).unref?.();
    startMaterialWatcher();
  });
}

module.exports = {
  buildDistributionArgs,
  collectMaterialLinks,
  extensionCorsHeaders,
  extensionProductTreeSnapshot,
  findCompletedWorkPackageByBatchId,
  getBody,
  httpServer,
  isAllowedFile,
  isAllowedExternalTarget,
  isIntegratedConversionCompatibilityPath,
  isPathInside,
  isLoopbackAddress,
  localIPv4Addresses,
  mobileConversionLink,
  materialCategoryIndex,
  materialCategoryCountMap,
  materialTreeSignature,
  normalizeOnlineTemplateUrl,
  readOnlineTemplates,
  getMaterialUsageLedger,
  getMaterialMetadataLedger,
  checkMaterialUsage,
  moveWorkspaceEntry,
  materialUsageFingerprint,
  materialUsageDirectoryName,
  materialFolderHash,
  inferMaterialMainTag,
  inferMaterialUsageCountFromPath,
  inspectGptWorkPackage,
  getLegacyMaterialEvidence,
  matchLegacyMaterialEvidence,
  applyLegacyMaterialEvidence,
  materialIndexStats,
  startMaterialGlobalIndexRefresh,
  getMaterialGlobalIndex,
  recordMaterialUsage,
  updateMaterialMetadata,
  updateOnlineTemplate,
  resolvePublicFile,
  rewriteIntegratedConversionContent,
  rewriteIntegratedConversionDocument,
  parseOnlineDeviceStatus,
  mergeDevicePresence,
  productionPageAllowed,
  productionResumeScope,
  publicDedupStatus,
  runExtensionWorkPackage,
  scanPostFolders,
  syncHistoricalDedupLedger,
  safeName
};
