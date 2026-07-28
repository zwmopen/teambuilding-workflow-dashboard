const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const childProcess = require("child_process");
const crypto = require("crypto");
const { generateImages, generateText, normalizeImageApiConfig } = require("./lib/image-generation");
const {
  applySuggestedTitles,
  buildCopyPrompt,
  buildPagePrompt,
  buildProductionPlan
} = require("./lib/production-recipes");
const { getJuguangSnapshot, queryKeywords } = require("./lib/juguang-data");
const {
  confirmOfficialUpload,
  getDistributionSnapshot,
  markOfficialUsed,
  moveCollectionSourceToStage
} = require("./lib/distribution-data");
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

const PORT = Number(process.env.PORT || 4327);
const PROJECT_ROOT = process.env.TEAMBUILDING_ROOT || "D:\\AICode\\项目推进\\projects\\江湖有旅人\\主项目";
const SKILL_ROOT = process.env.TEAMBUILDING_SKILL_ROOT || "D:\\AICode\\AI\\skills\\图文创作相关技能\\团建相关技能";
const APP_ROOT = __dirname;
const PUBLIC_ROOT = path.join(APP_ROOT, "public");
const PROJECT_APP_ROOT = path.resolve(APP_ROOT, "..");
const APP_VERSION = (() => {
  try { return fs.readFileSync(path.join(PROJECT_APP_ROOT, "VERSION"), "utf8").trim() || "0.0.0"; }
  catch { return require("./package.json").version || "0.0.0"; }
})();
const RELEASE_ROOT = process.env.TEAMBUILDING_RELEASE_ROOT || path.join(PROJECT_APP_ROOT, "releases");
const DATA_ROOT = process.env.TEAMBUILDING_DASHBOARD_RUNTIME || "D:\\AICode\\运行数据\\江湖有旅人\\图文生产控制台";
const STATE_FILE = path.join(DATA_ROOT, "state.json");
const PROMPTS_FILE = path.join(DATA_ROOT, "prompt-versions.json");
const TASK_INDEX_FILE = path.join(DATA_ROOT, "production-task-index.json");
const APP_SETTINGS_FILE = path.join(DATA_ROOT, "app-settings.json");
const IMAGE_API_SECRET_FILE = path.join(DATA_ROOT, "secrets", "image-api.local.env");
const IMAGE_REVIEW_ROOT = path.join(DATA_ROOT, "API生产待审");
const PRODUCTION_JOB_ROOT = path.join(DATA_ROOT, "production-jobs");
const COLLECTION_LEDGER_FILE = path.join(DATA_ROOT, "collection-ledger.json");
const DEVICE_PRESENCE_FILE = path.join(DATA_ROOT, "device-presence.json");
const DEVICE_NOTES_FILE = path.join(DATA_ROOT, "device-notes.json");
const MATERIAL_SCAN_CACHE_FILE = path.join(DATA_ROOT, "material-scan-cache.json");
const MATERIAL_LIBRARY_CACHE_FILE = path.join(DATA_ROOT, "material-library-cache.json");
const DEDUP_LEDGER_FILE = path.join(DATA_ROOT, "防重复账本", "dedup-ledger.json");
const EXTENSION_DOWNLOAD_LOG_FILE = path.join(DATA_ROOT, "防重复账本", "extension-download-events.json");
const MATERIAL_USAGE_LEDGER_FILE = path.join(DATA_ROOT, "防重复账本", "material-usage-ledger.json");
const MATERIAL_METADATA_LEDGER_FILE = path.join(DATA_ROOT, "防重复账本", "material-metadata-ledger.json");
const MATERIAL_HASH_CACHE_FILE = path.join(DATA_ROOT, "material-hash-cache.json");
const MATERIAL_GLOBAL_INDEX_FILE = path.join(DATA_ROOT, "material-global-index.json");
const WORKPKG_CONFIG_FILE = "D:\\Download\\workpkg_config.json";
const DOWNLOAD_ROOT = process.env.TEAMBUILDING_DOWNLOAD_ROOT || "D:\\Download";
const PUBLISH_ROOT = process.env.TEAMBUILDING_PUBLISH_ROOT
  || path.join(PROJECT_ROOT, "成品库（GPT+本地脚本制作）", "发布空间");
const DEVICE_TRANSFER_ROOT = process.env.DEVICE_TRANSFER_SKILL_ROOT
  || "D:\\AICode\\AI\\skills\\技能包\\技能\\device-folder-transfer";
const DEVICE_REGISTRY_FILE = path.join(DEVICE_TRANSFER_ROOT, "references", "device-registry.json");

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
const pendingProductionPlans = new Map();
const productionJobs = new Map();

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
    usageCount: Math.max(0, Number(saved.usageCount || 0)),
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
  const usageCount = body.incrementUsage === true
    ? Math.max(0, Number(previous.usageCount || 0)) + 1
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
  if (status === "used") {
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

function runExtensionWorkPackage(body = {}) {
  const script = path.join(DOWNLOAD_ROOT, "make_work_package.ps1");
  if (!exists(script)) {
    throw new Error("本地打包程序不存在，请先在设置中恢复正式打包程序");
  }
  const clipboardText = String(body.clipboardText || "");
  if (!clipboardText.trim()) {
    throw new Error("请先复制本次作品文案，再执行打包");
  }
  const metadata = JSON.stringify({
    accountName: String(body.accountName || ""),
    conversationUrl: String(body.conversationUrl || ""),
    title: String(body.title || "")
  });
  const args = [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", script,
    "-ClipboardTextOverride", clipboardText,
    "-ConversationMetadataJsonOverride", metadata,
    "-NoMessage"
  ];
  if (body.preview === true) args.push("-Preview");

  return new Promise((resolve, reject) => {
    const child = childProcess.spawn("powershell.exe", args, {
      cwd: DOWNLOAD_ROOT,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `打包程序退出码 ${code}`));
        return;
      }
      resolve({
        ok: true,
        mode: "workbench-direct",
        fallback: false,
        preview: body.preview === true,
        output: stdout.trim()
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
  return saved.LOCAL_IMAGE_API_KEY || process.env.TEAMBUILDING_IMAGE_API_KEY || "";
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

function saveImageApiSecret({ provider, baseUrl, model, apiKey }) {
  const existing = readEnvFile(IMAGE_API_SECRET_FILE);
  const config = normalizeImageApiConfig({ provider, baseUrl, model });
  const next = { ...existing };
  next.LOCAL_IMAGE_API_PROVIDER = config.provider;
  next.LOCAL_IMAGE_API_BASE_URL = config.baseUrl;
  next.LOCAL_IMAGE_API_MODEL = config.model;
  if (String(apiKey || "").trim()) {
    if (config.provider === "minimax") next.MINIMAX_IMAGE_API_KEY = String(apiKey).trim();
    else next.LOCAL_IMAGE_API_KEY = String(apiKey).trim();
  }
  fs.mkdirSync(path.dirname(IMAGE_API_SECRET_FILE), { recursive: true });
  const lines = [
    "# 团建内容工作台本机生图凭据。禁止提交仓库、日志或导出包。",
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
    "每次只生成一张独立3:4图片，不得输出多页合集、长图、缩略图墙或样机展示。中文必须准确。",
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
  const mode = ["one", "set", "batch"].includes(body.mode) ? body.mode : "set";
  const templatePath = path.resolve(String(body.templatePath || ""));
  if (!isAllowedFile(templatePath) || !exists(templatePath)) throw new Error("请选择真实存在的模板文件夹");
  const requested = mode === "batch"
    ? (Array.isArray(body.materialPaths) ? body.materialPaths : [])
    : [body.materialPath];
  const materialPaths = [...new Set(requested.map((item) => path.resolve(String(item || ""))).filter(Boolean))]
    .slice(0, mode === "batch" ? 5 : 1);
  if (!materialPaths.length) throw new Error("请选择要生产的素材");
  let plans = materialPaths.map((materialPath, index) => {
    if (!isAllowedFile(materialPath) || !exists(materialPath)) throw new Error(`素材文件夹不存在：${materialPath}`);
    const materialImages = collectReferenceImages(materialPath, 10);
    if (!materialImages.length) throw new Error(`素材文件夹中没有可用图片：${path.basename(materialPath)}`);
    const plan = buildProductionPlan({
      mode: mode === "batch" ? "set" : mode,
      materialPath,
      templatePath,
      materialImages,
      facts: materialFacts(materialPath),
      requestedPages: body.requestedPages,
      batchIndex: index
    });
    if (mode === "one" && body.onePageType === "inner") {
      plan.pages[0] = {
        ...plan.pages[0],
        role: "inner",
        roleLabel: "内页",
        title: plan.pages[0].title || "项目内页",
        rule: plan.recipe.inner
      };
    }
    return plan;
  });
  const savedImageApi = readJson(APP_SETTINGS_FILE, {}).imageApi || {};
  const titleConfig = normalizeImageApiConfig(savedImageApi);
  const titleApiKey = imageApiCredential(titleConfig.provider);
  if (titleConfig.provider === "local-openai" && titleApiKey) {
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
          config: titleConfig,
          apiKey: titleApiKey,
          prompt: titlePrompt,
          model: String(body.textModel || "gpt-5.6-terra").trim() || "gpt-5.6-terra"
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
      copyFiles: mode === "one" ? 0 : plans.length
    }
  };
  pendingProductionPlans.set(id, planBundle);
  return planBundle;
}

function publicProductionJob(job) {
  return {
    id: job.id,
    planId: job.planId,
    mode: job.mode,
    status: job.status,
    phase: job.phase,
    message: job.message,
    progress: job.progress,
    total: job.total,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    outputRoots: job.outputRoots || [],
    results: (job.results || []).map((item) => ({
      ...item,
      previewUrl: item.outputFile ? `/file?path=${encodeURIComponent(item.outputFile)}` : ""
    })),
    error: job.error || ""
  };
}

function saveProductionJob(job) {
  fs.mkdirSync(PRODUCTION_JOB_ROOT, { recursive: true });
  writeJson(path.join(PRODUCTION_JOB_ROOT, `${job.id}.json`), publicProductionJob(job));
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
  let completed = 0;
  for (const plan of planBundle.plans) {
    const facts = materialFacts(plan.materialPath);
    const templateImages = collectReferenceImages(plan.templatePath, 5);
    const materialImages = collectReferenceImages(plan.materialPath, 10);
    if (!templateImages.length) throw new Error(`模板中没有可用参考图：${plan.templateName}`);
    const folderName = `${new Date().toISOString().slice(0, 10).replaceAll("-", "")}_${safeOutputName(plan.materialName)}_${safeOutputName(plan.recipe.name)}_${job.id.slice(-6)}`;
    const outputRoot = path.join(IMAGE_REVIEW_ROOT, folderName);
    fs.mkdirSync(outputRoot, { recursive: true });
    job.outputRoots.push(outputRoot);
    writeJson(path.join(outputRoot, "出图计划.json"), plan);
    for (const page of plan.pages) {
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
      const referencePaths = page.role === "cover"
        ? [templateRef, ...materialImages.slice(0, 4)]
        : [templateRef, pageMaterial];
      const prompt = buildPagePrompt(plan, page, facts, options.prompt, options.quality);
      const generated = await generateImages({
        config,
        apiKey,
        prompt,
        referencePaths: [...new Set(referencePaths.filter(Boolean))].slice(0, 8),
        outputRoot,
        count: 1
      });
      const original = generated[0];
      const extension = path.extname(original.outputFile);
      const finalFile = path.join(outputRoot, `${page.code}_${safeOutputName(page.title)}${extension}`);
      if (exists(finalFile)) throw new Error(`待审目录已存在同名页面：${path.basename(finalFile)}`);
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
        model: original.model
      });
      completed += 1;
      updateProductionJob(job, { progress: completed });
    }
    if (planBundle.mode !== "one") {
      updateProductionJob(job, {
        phase: "generating-copy",
        message: `正在写 ${plan.materialName} 的小红书文案`
      });
      const copy = await generateText({
        config,
        apiKey,
        prompt: buildCopyPrompt(plan, facts),
        model: String(options.textModel || "gpt-5.6-terra").trim() || "gpt-5.6-terra"
      });
      const copyFile = path.join(outputRoot, "小红书文案.txt");
      fs.writeFileSync(copyFile, `${copy}\n`, "utf8");
      job.results.push({ type: "copy", work: plan.materialName, outputFile: copyFile, bytes: Buffer.byteLength(copy) });
    }
    writeJson(path.join(outputRoot, "生产记录.json"), {
      status: "review-ready",
      createdAt: new Date().toISOString(),
      plan,
      provider: config.provider,
      imageModel: config.model,
      textModel: planBundle.mode === "one" ? "" : (options.textModel || "gpt-5.6-terra"),
      officialLibraryWritten: false,
      files: job.results.filter((item) => item.work === plan.materialName).map((item) => item.outputFile)
    });
  }
  updateProductionJob(job, {
    status: "review-ready",
    phase: "completed",
    progress: job.total,
    message: planBundle.mode === "one"
      ? "这一张已经生成，已放入待审区。"
      : `${planBundle.plans.length} 套作品已经生成；每套都包含独立图片、文案和生产记录。`
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
  return (devices || []).map((device) => ({
    ...device,
    note: String(notes[device.id] ?? device.localRemark ?? "").trim()
  }));
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
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."))
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
    const entries = safeList(current.directory);
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

function materialTreeSignature(root) {
  if (!exists(root)) return "";
  const rows = safeList(root)
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
  return safeList(root)
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry, index) => ({
      id: path.join(root, entry.name),
      order: index + 1,
      name: entry.name,
      path: path.join(root, entry.name)
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN", { numeric: true }));
}

function getDetectedMaterialPosts(root, force = false) {
  const categoryRoot = path.resolve(root);
  const sourceSignature = materialTreeSignature(categoryRoot);
  const cached = materialCategoryCache.get(categoryRoot);
  if (!force && cached?.sourceSignature === sourceSignature && Array.isArray(cached.posts)) {
    return cached.posts;
  }
  const posts = scanPostFolders(categoryRoot);
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
    const items = posts
      .slice(0, PREVIEW_LIMITS.materialItemsPerCategory)
      .map((post, itemIndex) => materialItem(post, descriptor.name, itemIndex));
    return {
      ...descriptor,
      count: loaded ? posts.length : Number(materialCategoryCache.get(descriptor.path)?.posts?.length || 0),
      visibleCount: items.length,
      loaded,
      items: loaded ? items : []
    };
  }

  const categories = descriptors.map((descriptor) => {
    const loaded = descriptor.path === selectedCategory?.path;
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
    loaded: category.id === categoryId && category.loaded !== false,
    items: category.id === categoryId && category.loaded !== false
      ? (category.items || []).map((item) => {
        return compactMaterialItem(item, category.name, usageByPath, {
          metadata,
          cache: hashCache,
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
        }, category.name, { metadata, cache: hashCache });
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
  const csv = path.join(PROJECT_ROOT, "02-模板库", "爆款链接库.csv");
  const sourceRoot = path.join(PROJECT_ROOT, "01-素材库", "团建攻略图文素材", "模板素材");
  const rows = exists(csv) ? parseCsv(fs.readFileSync(csv, "utf8")) : [];
  const templates = rows.map((row) => {
    const rel = row["源模板路径"] || "";
    const normalized = rel.replace(/\//g, path.sep);
    const full = path.isAbsolute(normalized) ? normalized : path.join(PROJECT_ROOT, normalized);
    const images = listImages(full, PREVIEW_LIMITS.templateImages);
    const imageCount = listImageEntries(full).length;
    return {
      id: row["模板ID"] || path.basename(full),
      name: row["模板名称"] || path.basename(full),
      usage: row["适用内容"] || "",
      defaultPages: row["默认页数"] || "",
      status: row["状态"] || "",
      note: row["备注"] || "",
      path: full,
      images,
      imageCount
    };
  });
  return { csv, sourceRoot, templates };
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
  const materials = getMaterialLibrary(force, selectedLibraryPath || state.selectedMaterialCategoryPath || "");
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
  return {
    appInfo: {
      name: "团建内容工作台",
      version: APP_VERSION,
      channel: "公开便携版",
      runtimeRoot: DATA_ROOT,
      releaseRoot: RELEASE_ROOT,
      desktop: Boolean(process.versions.electron)
    },
    projectRoot: PROJECT_ROOT,
    workspaceSettings,
    generatedAt: new Date().toISOString(),
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

function send(res, status, body, type = "application/json; charset=utf-8") {
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

function isAllowedExternalTarget(target) {
  if (target === "cgpt-workpkg://run" || target === "cgpt-workpkg://configure") return true;
  try {
    const parsed = new URL(target);
    return parsed.protocol === "https:"
      && ["chatgpt.com", "mp.weixin.qq.com"].includes(parsed.hostname);
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
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn("py", [script, ...args], {
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
  return Array.from(tasks.values())
    .sort((left, right) => String(right.startedAt || "").localeCompare(String(left.startedAt || "")))
    .slice(0, limit)
    .map(publicTransferTask);
}

function startDistributionTask(body = {}) {
  if (body.action !== "device-restock") {
    throw new Error("这个任务入口只用于手机作品包分发");
  }
  const args = buildDistributionArgs(body);
  const taskId = `distribution-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  trimCompletedTasks(distributionTasks);
  const record = {
    id: taskId,
    kind: "distribution",
    action: body.action,
    device: String(body.device || "").trim(),
    collection: String(body.collection || "").trim(),
    contentType: body.type === "conversion" ? "团建转化" : "泛流量",
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
  const script = path.join(DEVICE_TRANSFER_ROOT, "scripts", "restock_device.py");
  const child = childProcess.spawn("py", [script, ...args], {
    cwd: DEVICE_TRANSFER_ROOT,
    env: {
      ...process.env,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8"
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
    childProcess.spawn("py", [
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
  const child = childProcess.spawn("py", [script, "--source", resolvedSource, "--device", deviceName], {
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
    childProcess.spawn("py", [
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
    const child = childProcess.spawn("py", [script, "--status"], {
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
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    `$dialog.Description = '${safeDescription}'`,
    "$dialog.ShowNewFolderButton = $true",
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
    "  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "  Write-Output $dialog.SelectedPath",
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
    provider: ["local-openai", "minimax"].includes(String(body.imageApi.provider))
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

async function route(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);

  if (req.method === "OPTIONS") {
    res.writeHead(204, extensionCorsHeaders(req));
    return res.end();
  }

  if (pathname === "/api/dashboard") {
    const libraryPath = parsed.query.library ? decodeURIComponent(parsed.query.library) : "";
    return sendExtensionJson(req, res, getDashboard(parsed.query.refresh === "materials", libraryPath));
  }

  if (pathname === "/api/extension/workspace" && req.method === "GET") {
    const settings = getWorkspaceSettings();
    return sendExtensionJson(req, res, {
      generatedAt: new Date().toISOString(),
      settings,
      products: extensionProductSnapshot(),
      dedup: publicDedupStatus()
    });
  }

  if (pathname === "/api/extension/settings" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    const settings = saveWorkspaceSettings(body);
    return sendExtensionJson(req, res, {
      ok: true,
      settings,
      products: extensionProductSnapshot(),
      dedup: publicDedupStatus()
    });
  }

  if (pathname === "/api/extension/products" && req.method === "GET") {
    const collection = parsed.query.collection ? decodeURIComponent(parsed.query.collection) : "";
    return sendExtensionJson(req, res, {
      generatedAt: new Date().toISOString(),
      products: extensionProductSnapshot(collection)
    });
  }

  if (pathname === "/api/extension/product-tree" && req.method === "GET") {
    const target = parsed.query.path ? decodeURIComponent(parsed.query.path) : "";
    return sendExtensionJson(req, res, {
      generatedAt: new Date().toISOString(),
      tree: extensionProductTreeSnapshot(target)
    });
  }

  if (pathname === "/api/extension/work-package" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 256_000) || "{}");
    return sendExtensionJson(req, res, await runExtensionWorkPackage(body));
  }

  if (pathname === "/api/extension/material-use" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    try {
      return sendExtensionJson(req, res, { ok: true, record: recordMaterialUsage(body) });
    } catch (error) {
      return send(res, 400, JSON.stringify({ error: error.message }));
    }
  }

  if (pathname === "/api/extension/material-usage-check" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    try {
      return sendExtensionJson(req, res, { ok: true, ...checkMaterialUsage(body) });
    } catch (error) {
      return send(res, 400, JSON.stringify({ error: error.message }));
    }
  }

  if (pathname === "/api/extension/material-metadata" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    try {
      return sendExtensionJson(req, res, { ok: true, record: updateMaterialMetadata(body) });
    } catch (error) {
      return sendExtensionJson(req, res, { error: error.message }, 400);
    }
  }

  if (pathname === "/api/extension/material-index" && req.method === "GET") {
    return sendExtensionJson(req, res, {
      ok: true,
      index: getMaterialGlobalIndex({ refresh: parsed.query.refresh === "true" })
    });
  }

  if (pathname === "/api/extension/move-entry" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    try {
      return sendExtensionJson(req, res, { ok: true, ...moveWorkspaceEntry(body) });
    } catch (error) {
      return send(res, 400, JSON.stringify({ error: error.message }));
    }
  }

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

  if (pathname === "/api/juguang") {
    return sendJson(res, getJuguangSnapshot(PROJECT_ROOT));
  }

  if (pathname === "/api/juguang/keywords") {
    return sendJson(res, queryKeywords({ text: parsed.query.q || "", limit: parsed.query.limit || 20 }, PROJECT_ROOT));
  }

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


  if (pathname === "/api/collect-materials" && req.method === "POST") {
    const body = JSON.parse(await getBody(req) || "{}");
    const items = Array.isArray(body.items) ? body.items.slice(0, 300) : [];
    if (!items.length) return send(res, 400, JSON.stringify({ error: "no items" }));
    const result = collectMaterialLinks(body.libraryPath, items, body.filterSummary || "");
    return sendJson(res, result);
  }

  if (pathname === "/api/settings/paths" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    return sendJson(res, { ok: true, settings: saveWorkspaceSettings(body) });
  }

  if (pathname === "/api/production/plan" && req.method === "POST") {
    try {
      const body = JSON.parse(await getBody(req, 256_000) || "{}");
      return sendJson(res, { ok: true, plan: await createProductionPlans(body) });
    } catch (error) {
      return send(res, 400, JSON.stringify({ error: error.message }));
    }
  }

  if (pathname === "/api/production/run" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 256_000) || "{}");
    const planBundle = pendingProductionPlans.get(String(body.planId || ""));
    if (!planBundle) return send(res, 409, JSON.stringify({ error: "出图计划已失效，请重新点击生成计划" }));
    if (!body.confirmed) return send(res, 409, JSON.stringify({ error: "请先查看并确认出图计划" }));
    const job = {
      id: `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`,
      planId: planBundle.id,
      mode: planBundle.mode,
      status: "running",
      phase: "starting",
      message: "已确认计划，正在准备生产",
      progress: 0,
      total: planBundle.totals.images,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      outputRoots: [],
      results: [],
      error: ""
    };
    productionJobs.set(job.id, job);
    saveProductionJob(job);
    pendingProductionPlans.delete(planBundle.id);
    runProductionJob(job, planBundle, body).catch((error) => {
      updateProductionJob(job, {
        status: "failed",
        phase: "failed",
        message: "生产中断，已生成的文件仍保留在待审区。",
        error: String(error?.message || error).slice(0, 1000)
      });
    });
    return sendJson(res, { ok: true, job: publicProductionJob(job) });
  }

  const productionJobMatch = pathname.match(/^\/api\/production\/jobs\/([^/]+)$/);
  if (productionJobMatch && req.method === "GET") {
    const job = productionJobs.get(decodeURIComponent(productionJobMatch[1]));
    if (!job) return send(res, 404, JSON.stringify({ error: "没有找到这次生产任务" }));
    return sendJson(res, { ok: true, job: publicProductionJob(job) });
  }

  if (pathname === "/api/image-api/config" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    const config = saveImageApiSecret(body);
    const previous = readJson(APP_SETTINGS_FILE, {});
    writeJson(APP_SETTINGS_FILE, { ...previous, imageApi: config });
    return sendJson(res, { ok: true, imageApi: publicImageApiSettings(config) });
  }

  if (pathname === "/api/image-api/test" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    const config = normalizeImageApiConfig(body);
    const apiKey = imageApiCredential(config.provider, body.apiKey);
    if (!apiKey) return send(res, 400, JSON.stringify({ error: "没有找到这个平台的本机密钥" }));
    const endpoint = config.provider === "minimax" ? `${config.baseUrl}/models` : `${config.baseUrl}/models`;
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
    if (!response.ok) return send(res, 502, JSON.stringify({ error: `连接失败（HTTP ${response.status}）` }));
    const data = await response.json();
    const models = Array.isArray(data.data) ? data.data.map((item) => item.id).filter(Boolean).slice(0, 50) : [];
    return sendJson(res, { ok: true, modelAvailable: !models.length || models.includes(config.model), models });
  }

  if (pathname === "/api/image-api/generate" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 256_000) || "{}");
    const config = normalizeImageApiConfig(body);
    const apiKey = imageApiCredential(config.provider, body.apiKey);
    const materialPath = path.resolve(String(body.materialPath || ""));
    const templatePath = path.resolve(String(body.templatePath || ""));
    if (!body.confirmed) return send(res, 409, JSON.stringify({ error: "请先确认出图计划，再开始校准" }));
    if (!isAllowedFile(materialPath) || !exists(materialPath)) return send(res, 400, JSON.stringify({ error: "请选择真实存在的素材文件夹" }));
    if (!isAllowedFile(templatePath) || !exists(templatePath)) return send(res, 400, JSON.stringify({ error: "请选择真实存在的模板文件夹" }));
    const stage = body.stage === "inner" ? "inner" : "cover";
    const templateImages = collectReferenceImages(templatePath, stage === "cover" ? 1 : 2);
    const materialImages = collectReferenceImages(materialPath, 6);
    if (!templateImages.length || !materialImages.length) return send(res, 400, JSON.stringify({ error: "模板或素材文件夹中没有可用图片" }));
    const facts = materialFacts(materialPath);
    const prompt = buildProductionPrompt({ ...body, stage }, facts);
    const folderName = `${new Date().toISOString().slice(0, 10).replaceAll("-", "")}_${safeOutputName(path.basename(materialPath))}_${safeOutputName(path.basename(templatePath))}`;
    const outputRoot = path.join(IMAGE_REVIEW_ROOT, folderName, stage === "cover" ? "封面校准" : "内页校准");
    const results = await generateImages({
      config, apiKey, prompt,
      referencePaths: [...templateImages, ...materialImages].slice(0, 8),
      outputRoot, count: body.count
    });
    const report = {
      status: "review-ready",
      createdAt: new Date().toISOString(),
      stage,
      materialPath,
      templatePath,
      provider: config.provider,
      model: config.model,
      requestedCount: Number(body.count) || 1,
      rules: { templateClass: "A", materialClass: "B", historicalResultsClass: "C", officialLibraryWritten: false },
      results
    };
    fs.mkdirSync(outputRoot, { recursive: true });
    writeJson(path.join(outputRoot, "生成记录.json"), report);
    return sendJson(res, {
      ok: true,
      status: report.status,
      outputRoot,
      results: results.map((item) => ({ ...item, previewUrl: `/file?path=${encodeURIComponent(item.outputFile)}` }))
    });
  }

  if (pathname === "/api/dedup/status" && req.method === "GET") {
    return sendJson(res, publicDedupStatus());
  }

  if (pathname === "/api/dedup/sync" && req.method === "POST") {
    return sendJson(res, publicDedupStatus(syncHistoricalDedupLedger()));
  }

  if (pathname === "/api/dedup/export" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="teambuilding-dedup-ledger.json"',
      "Cache-Control": "no-store"
    });
    return res.end(JSON.stringify(getDedupLedger(), null, 2));
  }

  if (pathname === "/api/dedup/check-text" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 256_000) || "{}");
    const result = isDownloadedText(getDedupLedger(), String(body.text || ""));
    return sendExtensionJson(req, res, {
      duplicate: result.duplicate,
      textHash: result.textHash,
      record: result.record ? {
        title: result.record.title,
        path: result.record.path,
        recordedAt: result.record.recordedAt,
        source: result.record.source
      } : null
    });
  }

  if (pathname === "/api/dedup/register-download" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 256_000) || "{}");
    if (!String(body.text || "").trim()) {
      return send(res, 400, JSON.stringify({ error: "文案内容不能为空" }));
    }
    const result = registerDownloadedText(DEDUP_LEDGER_FILE, body.text, {
      title: body.title,
      path: body.path,
      conversationUrl: body.conversationUrl
    });
    return sendJson(res, {
      duplicate: result.duplicate,
      textHash: result.textHash,
      status: publicDedupStatus(result.ledger)
    });
  }

  if (pathname === "/api/extension/download-event" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 256_000) || "{}");
    const filename = path.resolve(String(body.filename || "").trim());
    if (!filename || !isPathInside(path.resolve(DOWNLOAD_ROOT), filename)) {
      return send(res, 400, JSON.stringify({ error: "只记录下载目录中的文件" }));
    }
    const saved = readJson(EXTENSION_DOWNLOAD_LOG_FILE, { version: 1, events: [] });
    const event = {
      downloadId: Number(body.downloadId || 0),
      requestId: String(body.requestId || ""),
      filename,
      url: String(body.url || ""),
      finalUrl: String(body.finalUrl || ""),
      totalBytes: Number(body.totalBytes || 0),
      conversationUrl: String(body.conversationUrl || ""),
      completedAt: String(body.completedAt || new Date().toISOString()),
      exists: exists(filename)
    };
    saved.events = [...(saved.events || []), event].slice(-500);
    saved.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(EXTENSION_DOWNLOAD_LOG_FILE), { recursive: true });
    writeJson(EXTENSION_DOWNLOAD_LOG_FILE, saved);
    return sendExtensionJson(req, res, { ok: true, event });
  }

  if (pathname === "/api/extension/info" && req.method === "GET") {
    return sendExtensionJson(req, res, {
      name: "团建内容工作台 · GPT 助手",
      path: "D:\\AICode\\工具开发\\projects\\teambuilding-gpt-production-extension\\src",
      modules: ["最新版会话树", "成品区", "素材区", "生产去重状态", "上传到当前 GPT"],
      localApi: `http://127.0.0.1:${PORT}`
    });
  }

  if (pathname === "/api/collections/ledger" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    return sendJson(res, { ok: true, record: updateCollectionLedger(body) });
  }

  if (pathname === "/api/collections/export" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="collection-ledger.csv"',
      "Cache-Control": "no-store"
    });
    return res.end(collectionLedgerCsv());
  }

  if (pathname === "/api/pick-folder" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 8_000) || "{}");
    const selectedPath = await pickFolderWithWindowsDialog(body.description || "选择文件夹");
    return sendJson(res, { ok: true, path: selectedPath });
  }
  if (pathname === "/api/pick-file" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 8_000) || "{}");
    const selectedPath = await pickFileWithWindowsDialog(body.title || "选择要传送的文件");
    return sendJson(res, { ok: true, path: selectedPath });
  }
  if (pathname === "/api/transfers" && req.method === "GET") {
    return sendJson(res, recentPublicTasks(genericTransferTasks));
  }
  if (pathname === "/api/transfers" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 16_000) || "{}");
    if (body.confirmed !== true) return send(res, 409, JSON.stringify({ error: "需要确认本次文件传送" }));
    return sendJson(res, startGenericTransfer(body.source, body.device));
  }
  if (pathname.startsWith("/api/transfers/") && req.method === "GET") {
    const taskId = decodeURIComponent(pathname.slice("/api/transfers/".length));
    const record = genericTransferTasks.get(taskId);
    if (!record) return send(res, 404, JSON.stringify({ error: "传送任务不存在" }));
    return sendJson(res, publicTransferTask(record));
  }
  if (pathname.startsWith("/api/transfers/") && pathname.endsWith("/cancel") && req.method === "POST") {
    const taskId = decodeURIComponent(
      pathname.slice("/api/transfers/".length, -"/cancel".length)
    );
    return sendJson(res, cancelGenericTransfer(taskId));
  }
  if (pathname === "/api/distribution/tasks" && req.method === "GET") {
    return sendJson(res, recentPublicTasks(distributionTasks));
  }
  if (pathname === "/api/distribution/tasks" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    if (body.confirmed !== true) {
      return send(res, 409, JSON.stringify({ error: "需要在界面确认本次真实分发" }));
    }
    return sendJson(res, startDistributionTask(body));
  }
  if (pathname.startsWith("/api/distribution/tasks/") && pathname.endsWith("/cancel") && req.method === "POST") {
    const taskId = decodeURIComponent(
      pathname.slice("/api/distribution/tasks/".length, -"/cancel".length)
    );
    return sendJson(res, cancelDistributionTask(taskId));
  }
  if (pathname.startsWith("/api/distribution/tasks/") && req.method === "GET") {
    const taskId = decodeURIComponent(pathname.slice("/api/distribution/tasks/".length));
    const record = distributionTasks.get(taskId);
    if (!record) return send(res, 404, JSON.stringify({ error: "分发任务不存在" }));
    return sendJson(res, publicTransferTask(record));
  }
  if (pathname === "/api/distribution/action" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    if (body.confirmed !== true) return send(res, 409, JSON.stringify({ error: "需要在界面确认本次真实分发" }));
    const result = await runDistributionAction(buildDistributionArgs(body));
    if (body.action === "official-reserve") {
      const sourceMatch = String(result.output || "").match(/^原合集地址：(.+)$/m);
      const sourcePath = sourceMatch?.[1]?.trim();
      if (sourcePath && isAllowedFile(sourcePath) && exists(sourcePath)) {
        childProcess.spawn("explorer.exe", [sourcePath], {
          detached: true,
          windowsHide: true,
          stdio: "ignore"
        }).unref();
      }
    }
    return sendJson(res, result);
  }
  if (pathname === "/api/devices/note" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 8_000) || "{}");
    return sendJson(res, updateDeviceNote(body));
  }
  if (pathname === "/api/distribution/check" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 8_000) || "{}");
    const includeInventory = body.inventory === true;
    const [inventory, deviceStatus] = await Promise.all([
      includeInventory ? runDistributionAction(["--check"]) : Promise.resolve({ ok: true, output: "" }),
      getDeviceStatus(body.force === true)
    ]);
    const onlineDevices = deviceStatus.onlineDevices || parseOnlineDeviceStatus(deviceStatus.output);
    const registry = readJson(DEVICE_REGISTRY_FILE, { devices: [] });
    return sendJson(res, {
      ok: true,
      output: inventory.output,
      statusOutput: deviceStatus.output,
      registered: Array.isArray(registry.devices) ? registry.devices.length : 0,
      online: onlineDevices.length,
      onlineDevices,
      inventoryScanned: includeInventory
    });
  }
  if (pathname === "/api/distribution/confirm-official" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    if (body.confirmed !== true) return send(res, 409, JSON.stringify({ error: "需要确认电脑上传已经完成" }));
    return sendJson(res, confirmOfficialUpload({
      publishRoot: PUBLISH_ROOT,
      collection: body.collection
    }));
  }
  if (pathname === "/api/distribution/mark-used" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    if (body.confirmed !== true) return send(res, 409, JSON.stringify({ error: "需要确认作品已经使用" }));
    return sendJson(res, markOfficialUsed({
      publishRoot: PUBLISH_ROOT,
      libraryRoot: getWorkspaceSettings().workPackage.libraryPath,
      collection: body.collection
    }));
  }
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
    const target = parsed.query.path ? decodeURIComponent(parsed.query.path) : "";
    if (!target || !isAllowedFile(target) || !exists(target)) return send(res, 404, "not found", "text/plain; charset=utf-8");
    res.writeHead(200, {
      "Content-Type": contentType(target),
      "Cache-Control": "no-store",
      ...extensionCorsHeaders(req)
    });
    return fs.createReadStream(target).pipe(res);
  }

  const file = resolvePublicFile(pathname);
  res.writeHead(200, { "Content-Type": contentType(file), "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
}

const httpServer = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    console.error(error);
    send(res, 500, JSON.stringify({ error: error.message }));
  });
});

if (require.main === module) {
  ensureDataFiles();
  httpServer.listen(PORT, "127.0.0.1", () => {
    console.log(`团建图文生产控制台: http://localhost:${PORT}`);
    console.log(`项目根目录: ${PROJECT_ROOT}`);
  });
}

module.exports = {
  buildDistributionArgs,
  collectMaterialLinks,
  extensionCorsHeaders,
  extensionProductTreeSnapshot,
  getBody,
  httpServer,
  isAllowedFile,
  isAllowedExternalTarget,
  isPathInside,
  materialCategoryIndex,
  materialTreeSignature,
  getMaterialUsageLedger,
  getMaterialMetadataLedger,
  checkMaterialUsage,
  moveWorkspaceEntry,
  materialUsageFingerprint,
  materialFolderHash,
  inferMaterialMainTag,
  getLegacyMaterialEvidence,
  matchLegacyMaterialEvidence,
  applyLegacyMaterialEvidence,
  materialIndexStats,
  startMaterialGlobalIndexRefresh,
  getMaterialGlobalIndex,
  recordMaterialUsage,
  updateMaterialMetadata,
  resolvePublicFile,
  parseOnlineDeviceStatus,
  mergeDevicePresence,
  publicDedupStatus,
  runExtensionWorkPackage,
  scanPostFolders,
  syncHistoricalDedupLedger,
  safeName
};
