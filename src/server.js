const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const childProcess = require("child_process");
const { getJuguangSnapshot, queryKeywords } = require("./lib/juguang-data");
const { confirmOfficialUpload, getDistributionSnapshot } = require("./lib/distribution-data");
const {
  publicTransferTask,
  updateTransferProgress
} = require("./lib/transfer-progress");

const PORT = Number(process.env.PORT || 4327);
const PROJECT_ROOT = process.env.TEAMBUILDING_ROOT || "D:\\AICode\\项目推进\\projects\\江湖有旅人\\主项目";
const SKILL_ROOT = process.env.TEAMBUILDING_SKILL_ROOT || "D:\\AICode\\AI\\skills\\图文创作相关技能\\团建相关技能";
const APP_ROOT = __dirname;
const PUBLIC_ROOT = path.join(APP_ROOT, "public");
const DATA_ROOT = process.env.TEAMBUILDING_DASHBOARD_RUNTIME || "D:\\AICode\\运行数据\\江湖有旅人\\图文生产控制台";
const STATE_FILE = path.join(DATA_ROOT, "state.json");
const PROMPTS_FILE = path.join(DATA_ROOT, "prompt-versions.json");
const TASK_INDEX_FILE = path.join(DATA_ROOT, "production-task-index.json");
const APP_SETTINGS_FILE = path.join(DATA_ROOT, "app-settings.json");
const COLLECTION_LEDGER_FILE = path.join(DATA_ROOT, "collection-ledger.json");
const DEVICE_NOTES_FILE = path.join(DATA_ROOT, "device-notes.json");
const WORKPKG_CONFIG_FILE = "D:\\Download\\workpkg_config.json";
const PUBLISH_ROOT = process.env.TEAMBUILDING_PUBLISH_ROOT
  || path.join(PROJECT_ROOT, "成品库（GPT+本地脚本制作）", "发布空间");
const DEVICE_TRANSFER_ROOT = process.env.DEVICE_TRANSFER_SKILL_ROOT
  || "D:\\AICode\\AI\\skills\\技能包\\技能\\device-folder-transfer";
const DEVICE_REGISTRY_FILE = path.join(DEVICE_TRANSFER_ROOT, "references", "device-registry.json");

const imageExts = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const textExts = new Set([".txt", ".md"]);
const PREVIEW_LIMITS = {
  materialItemsPerCategory: 1000,
  materialImagesPerItem: 12,
  templateImages: 5,
  productWorksPerGroup: 36,
  productImagesPerWork: 12
};
const materialCategoryCache = new Map();
let deviceStatusCache = { checkedAt: 0, output: "", onlineDevices: [] };
let deviceStatusPromise = null;
const genericTransferTasks = new Map();
const distributionTasks = new Map();

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
}

function getWorkspaceSettings() {
  const local = readJson(APP_SETTINGS_FILE, {});
  const workPackage = readJson(WORKPKG_CONFIG_FILE, {});
  const defaultMaterialRoot = path.join(PROJECT_ROOT, "01-素材库");
  return {
    materialRoot: path.resolve(local.materialRoot || defaultMaterialRoot),
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
    const type = ["traffic", "conversion", "unclassified"].includes(record?.type)
      ? record.type
      : collection.type;
    return {
      ...collection,
      type,
      typeLabel: type === "traffic"
        ? "游戏/泛流量"
        : type === "conversion" ? "团建转化" : "未分类",
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
  const distribution = getDistributionSnapshot({ publishRoot: PUBLISH_ROOT });
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

function getMaterialLibrary(force = false, selectedLibraryPath = "") {
  const root = getWorkspaceSettings().materialRoot;
  const detectedPosts = scanPostFolders(root);

  function materialItem(post, categoryName, itemIndex) {
    const itemPath = post.path;
    const images = listImages(itemPath, PREVIEW_LIMITS.materialImagesPerItem);
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
      preview,
      tags,
      updatedAt: post.updatedAt || safeMtime(itemPath)
    };
  }

  function categoryFromPosts(name, categoryPath, posts, order) {
    const items = posts
      .slice(0, PREVIEW_LIMITS.materialItemsPerCategory)
      .map((post, itemIndex) => materialItem(post, name, itemIndex));
    return {
      id: categoryPath,
      order,
      name,
      path: categoryPath,
      count: posts.length,
      visibleCount: items.length,
      items
    };
  }

  const grouped = new Map();
  detectedPosts.forEach((post) => {
    const parts = post.relativePath.split(path.sep).filter(Boolean);
    const groupName = parts.length > 1 ? parts[0] : "当前素材";
    if (!grouped.has(groupName)) grouped.set(groupName, []);
    grouped.get(groupName).push(post);
  });
  const categories = Array.from(grouped.entries()).map(([name, posts], index) =>
    categoryFromPosts(
      name,
      name === "当前素材" ? root : path.join(root, name),
      posts,
      index + 1
    )
  );
  return { root, recursive: true, detectionRule: "图片 + 文案", categories };
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
  const distribution = getDistributionSnapshot({ publishRoot: PUBLISH_ROOT });
  distribution.collections = mergeCollectionLedger(distribution.collections || []);
  distribution.devices = mergeDeviceNotes(
    readJson(DEVICE_REGISTRY_FILE, { devices: [] }).devices || []
  );
  return {
    projectRoot: PROJECT_ROOT,
    workspaceSettings: getWorkspaceSettings(),
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
    path.resolve("D:\\Download\\素材下载"),
    path.resolve(getWorkspaceSettings().materialRoot),
    path.resolve(getWorkspaceSettings().workPackage.libraryPath)
  ];
  return allowed.some((root) => isPathInside(root, resolved));
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
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
      record.message = "作品包已发送，手机分发组已标记为使用";
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
    record.message = error.message;
    record.finishedAt = new Date().toISOString();
  });
  child.on("close", (code) => {
    if (record.state === "cancelling") {
      record.state = "cancelled";
      record.message = "已取消传送";
    } else if (code === 0) {
      record.state = "completed";
      record.progress = 100;
      record.message = "发送完成";
    } else {
      record.state = "failed";
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
      deviceStatusCache = {
        checkedAt: Date.now(),
        output: result.output || "",
        onlineDevices: parseOnlineDeviceStatus(result.output)
      };
      return deviceStatusCache;
    })
    .finally(() => {
      deviceStatusPromise = null;
    });
  return deviceStatusPromise;
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
  writeJson(APP_SETTINGS_FILE, { materialRoot });

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

  if (pathname === "/api/dashboard") {
    const libraryPath = parsed.query.library ? decodeURIComponent(parsed.query.library) : "";
    return sendJson(res, getDashboard(parsed.query.refresh === "1", libraryPath));
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
    res.writeHead(200, { "Content-Type": contentType(target), "Cache-Control": "no-store" });
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
  getBody,
  httpServer,
  isAllowedFile,
  isAllowedExternalTarget,
  isPathInside,
  resolvePublicFile,
  parseOnlineDeviceStatus,
  scanPostFolders,
  safeName
};


