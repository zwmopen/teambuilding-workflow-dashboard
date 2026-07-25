const fs = require("node:fs");
const path = require("node:path");

const PLATFORM_DIRS = {
  xhs: "小红书",
  douyin: "抖音",
  officialAccount: "公众号",
  douyinArchive: path.join("归档", "抖音")
};

function classifyCollectionName(name) {
  const value = String(name || "");
  const hidden = value.startsWith(".");
  if (/\[泛\]$/.test(value)) {
    return { type: "traffic", typeLabel: "游戏/泛流量", hidden, labelled: true };
  }
  if (/\[转\]$/.test(value)) {
    return { type: "conversion", typeLabel: "团建转化", hidden, labelled: true };
  }
  return { type: "unclassified", typeLabel: "未分类", hidden, labelled: false };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const input = String(text || "");
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map((value) => value.trim());
  return rows.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] || ""])
  ));
}

function readCsv(filePath) {
  try {
    return parseCsv(fs.readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}

function listDirectoryNames(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function normalizeRealPath(value) {
  return path.resolve(String(value || "")).toLowerCase();
}

function inspectSource(sourcePath, cache) {
  if (!sourcePath) return { valid: false, itemCount: 0, fileCount: 0, bytes: 0, items: [] };
  const key = normalizeRealPath(sourcePath);
  if (cache.has(key)) return cache.get(key);
  const result = { valid: false, itemCount: 0, fileCount: 0, bytes: 0, items: [] };
  try {
    const stat = fs.statSync(sourcePath);
    if (!stat.isDirectory()) {
      cache.set(key, result);
      return result;
    }
    const children = fs.readdirSync(sourcePath, { withFileTypes: true });
    const itemDirectories = children.filter((entry) => (
      entry.isDirectory() || entry.isSymbolicLink()
    ));
    result.itemCount = itemDirectories.length;
    result.items = itemDirectories.slice(0, 50).map((entry) => {
      const itemPath = path.join(sourcePath, entry.name);
      let previewPath = "";
      let imageCount = 0;
      let textPath = "";
      try {
        const files = fs.readdirSync(itemPath, { withFileTypes: true });
        const images = files.filter((file) => file.isFile() && /\.(png|jpe?g|webp)$/i.test(file.name));
        const texts = files.filter((file) => file.isFile() && /\.(txt|md)$/i.test(file.name));
        imageCount = images.length;
        previewPath = images[0] ? path.join(itemPath, images[0].name) : "";
        textPath = texts[0] ? path.join(itemPath, texts[0].name) : "";
      } catch {
        // A work folder can temporarily be unavailable while it is moved.
      }
      return { name: entry.name, path: itemPath, previewPath, textPath, imageCount };
    });
    const stack = [sourcePath];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          stack.push(fullPath);
        } else if (entry.isFile()) {
          result.fileCount += 1;
          try {
            result.bytes += fs.statSync(fullPath).size;
          } catch {
            // A file may disappear while a live folder is being scanned.
          }
        }
      }
    }
    result.valid = result.itemCount > 0;
  } catch {
    // Broken Junctions and temporarily unavailable folders remain invalid.
  }
  cache.set(key, result);
  return result;
}

function inspectPlatformEntry(publishRoot, relativeDirectory, name, sourceCache) {
  const entryPath = path.join(publishRoot, relativeDirectory, name);
  if (!fs.existsSync(entryPath)) {
    try {
      fs.lstatSync(entryPath);
    } catch {
      return { present: false, valid: false, path: entryPath, sourcePath: "" };
    }
  }
  let stat;
  try {
    stat = fs.lstatSync(entryPath);
  } catch {
    return { present: false, valid: false, path: entryPath, sourcePath: "" };
  }
  if (!stat.isSymbolicLink()) {
    return { present: true, valid: false, path: entryPath, sourcePath: "", reason: "不是 Junction" };
  }
  try {
    const sourcePath = fs.realpathSync.native(entryPath);
    const source = inspectSource(sourcePath, sourceCache);
    return {
      present: true,
      valid: source.valid,
      path: entryPath,
      sourcePath,
      ...source,
      reason: source.valid ? "" : "源目录为空或不可用"
    };
  } catch {
    return { present: true, valid: false, path: entryPath, sourcePath: "", reason: "Junction 已断开" };
  }
}

function latestRowsByCollection(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    const name = row["作品集"] || row["源作品集"] || "";
    if (!name) return;
    const existing = grouped.get(name);
    if (!existing || String(row["时间"] || "") >= String(existing["时间"] || "")) {
      grouped.set(name, row);
    }
  });
  return grouped;
}

function officialStateFromRow(row) {
  const status = String(row?.["状态"] || "");
  if (/待.*上传|已领取/.test(status)) return "reserved_pending_upload";
  if (/已使用|已发布|上传完成/.test(status)) return "confirmed_published";
  if (/恢复|失败/.test(status)) return "available";
  return row ? "unknown" : null;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function confirmOfficialUpload(options = {}) {
  const publishRoot = path.resolve(options.publishRoot || "");
  const collection = String(options.collection || "").trim();
  if (!collection) throw new Error("缺少作品集名称");
  const logFile = path.join(publishRoot, "official-account-usage-log.csv");
  const rows = readCsv(logFile);
  const latest = latestRowsByCollection(rows).get(collection);
  if (officialStateFromRow(latest) !== "reserved_pending_upload") {
    throw new Error("该作品集不是待上传状态");
  }
  const fields = [
    options.now || new Date().toISOString().slice(0, 19),
    latest["公众号账号"],
    latest["承载设备"],
    collection,
    latest["源路径"],
    latest["文件数"],
    latest["字节数"],
    latest["小红书抖音连接剩余数"],
    "公众号已使用",
    "人工确认电脑上传完成"
  ];
  const existing = fs.readFileSync(logFile, "utf8");
  const prefix = existing.endsWith("\n") || existing.endsWith("\r") ? "" : "\n";
  fs.appendFileSync(logFile, `${prefix}${fields.map(csvCell).join(",")}\n`, "utf8");
  return {
    ok: true,
    collection,
    status: "confirmed_published"
  };
}

function stateForPlatform(entry, absentState = "used") {
  if (!entry.present) return absentState;
  return entry.valid ? "available" : "invalid";
}

function getDistributionSnapshot(options = {}) {
  const publishRoot = path.resolve(options.publishRoot || "");
  const libraryRoot = path.resolve(options.libraryRoot || "");
  const sourceCache = new Map();
  const officialRows = readCsv(path.join(publishRoot, "official-account-usage-log.csv"));
  const deviceRows = readCsv(path.join(publishRoot, "device-usage-log.csv"));
  const latestOfficial = latestRowsByCollection(officialRows);
  const names = new Set();

  Object.values(PLATFORM_DIRS).forEach((relativeDirectory) => {
    listDirectoryNames(path.join(publishRoot, relativeDirectory)).forEach((name) => names.add(name));
  });
  listDirectoryNames(libraryRoot)
    .filter((name) => /^\.?作品集[_-]?\d+/i.test(name))
    .forEach((name) => names.add(name));
  officialRows.forEach((row) => names.add(row["作品集"] || ""));
  deviceRows.forEach((row) => names.add(row["源作品集"] || ""));
  names.delete("");

  const collections = [...names].map((name) => {
    const classification = classifyCollectionName(name);
    const entries = {
      xhs: inspectPlatformEntry(publishRoot, PLATFORM_DIRS.xhs, name, sourceCache),
      douyin: inspectPlatformEntry(publishRoot, PLATFORM_DIRS.douyin, name, sourceCache),
      officialAccount: inspectPlatformEntry(publishRoot, PLATFORM_DIRS.officialAccount, name, sourceCache),
      douyinArchive: inspectPlatformEntry(publishRoot, PLATFORM_DIRS.douyinArchive, name, sourceCache)
    };
    const activeSources = [entries.xhs, entries.douyin, entries.officialAccount, entries.douyinArchive]
      .filter((entry) => entry.valid && entry.sourcePath);
    const recordedSourcePath = latestOfficial.get(name)?.["源路径"] || deviceRows
      .filter((row) => row["源作品集"] === name)
      .at(-1)?.["源路径"] || "";
    const recordedSource = inspectSource(recordedSourcePath, sourceCache);
    const directSourcePath = path.join(libraryRoot, name);
    const directSource = inspectSource(directSourcePath, sourceCache);
    const source = activeSources[0]
      || (directSource.valid ? { sourcePath: directSourcePath, ...directSource } : null)
      || (recordedSource.valid ? { sourcePath: recordedSourcePath, ...recordedSource } : {});
    const sameDualTarget = entries.xhs.valid
      && entries.douyin.valid
      && normalizeRealPath(entries.xhs.sourcePath) === normalizeRealPath(entries.douyin.sourcePath);
    const officialHistory = officialRows.filter((row) => row["作品集"] === name);
    const deviceHistory = deviceRows.filter((row) => row["源作品集"] === name);
    const previouslySentToDevice = deviceHistory.length > 0;
    const officialLogState = officialStateFromRow(latestOfficial.get(name));
    const exclusionReasons = [];
    if (classification.hidden) exclusionReasons.push("隐藏作品集");
    if (!classification.labelled) exclusionReasons.push("缺少[泛]/[转]标签");
    if (!source.valid) exclusionReasons.push("没有可用源目录");
    if (entries.xhs.valid && entries.douyin.valid && !sameDualTarget) exclusionReasons.push("小红书与抖音目标不一致");
    [entries.xhs, entries.douyin, entries.officialAccount, entries.douyinArchive].forEach((entry) => {
      if (entry.present && !entry.valid && entry.reason && !exclusionReasons.includes(entry.reason)) {
        exclusionReasons.push(entry.reason);
      }
    });

    let officialAccount = stateForPlatform(entries.officialAccount);
    if (!entries.officialAccount.present && officialLogState) officialAccount = officialLogState;
    const douyin = entries.douyinArchive.present
      ? (entries.douyinArchive.valid ? "archived" : "invalid")
      : stateForPlatform(entries.douyin);
    const sourceValid = Boolean(source.valid);
    if (previouslySentToDevice) exclusionReasons.push("已有手机分发记录");
    const automaticEligible = classification.labelled
      && !classification.hidden
      && !previouslySentToDevice
      && Boolean(activeSources.length);

    return {
      name,
      ...classification,
      sourcePath: source.sourcePath || recordedSourcePath,
      sourceValid,
      itemCount: source.itemCount || 0,
      fileCount: source.fileCount || 0,
      bytes: source.bytes || 0,
      items: source.items || [],
      xhs: previouslySentToDevice ? "used" : stateForPlatform(entries.xhs),
      douyin: previouslySentToDevice ? "used" : douyin,
      officialAccount,
      dualPlatformEligible: automaticEligible && sameDualTarget,
      automaticEligible,
      exclusionReasons,
      deviceHistoryCount: deviceHistory.length,
      officialAccountHistoryCount: officialHistory.length,
      latestDeviceRecord: deviceHistory.at(-1) || null,
      latestOfficialAccountRecord: latestOfficial.get(name) || null
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));

  const eligible = collections.filter((item) => item.automaticEligible);
  const summary = {
    total: collections.length,
    automaticEligible: eligible.length,
    dualPlatformAvailable: collections.filter((item) => item.dualPlatformEligible).length,
    traffic: collections.filter((item) => item.dualPlatformEligible && item.type === "traffic").length,
    conversion: collections.filter((item) => item.dualPlatformEligible && item.type === "conversion").length,
    unclassified: collections.filter((item) => item.type === "unclassified").length,
    douyinArchived: collections.filter((item) => {
      const entryPath = path.join(publishRoot, PLATFORM_DIRS.douyinArchive, item.name);
      try {
        return fs.lstatSync(entryPath).isSymbolicLink();
      } catch {
        return false;
      }
    }).length,
    douyinArchiveInvalid: collections.filter((item) => {
      const entryPath = path.join(publishRoot, PLATFORM_DIRS.douyinArchive, item.name);
      try {
        return fs.lstatSync(entryPath).isSymbolicLink() && item.douyin === "invalid";
      } catch {
        return false;
      }
    }).length,
    officialAvailable: collections.filter((item) => item.officialAccount === "available" && item.automaticEligible).length,
    officialPending: collections.filter((item) => item.officialAccount === "reserved_pending_upload").length,
    officialConfirmed: collections.filter((item) => item.officialAccount === "confirmed_published").length
  };

  return {
    publishRoot,
    libraryRoot,
    generatedAt: new Date().toISOString(),
    summary,
    collections,
    deviceHistory: deviceRows.slice().reverse(),
    officialAccountHistory: officialRows.slice().reverse()
  };
}

module.exports = {
  classifyCollectionName,
  confirmOfficialUpload,
  getDistributionSnapshot,
  parseCsv
};
