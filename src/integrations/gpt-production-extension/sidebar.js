(() => {
  const embeddedVersion = chrome.runtime.getManifest().version;
  const markEmbeddedExtensionReady = () => {
    document.documentElement.dataset.tbGptProductionExtension = "ready";
    document.documentElement.dataset.tbGptProductionExtensionVersion = embeddedVersion;
    document.documentElement.dataset.tbGptProductionExtensionSource = "embedded-extension";
    let marker = document.getElementById("tb-gpt-production-extension-marker");
    if (!marker) {
      marker = document.createElement("meta");
      marker.id = "tb-gpt-production-extension-marker";
      document.head?.append(marker);
    }
    if (marker) marker.content = embeddedVersion;
  };
  globalThis.__TB_GPT_PRODUCTION_SIDEBAR_READY__ = embeddedVersion;
  markEmbeddedExtensionReady();
  window.setInterval(markEmbeddedExtensionReady, 2000);
  const DEFAULT_API_ROOT = "http://127.0.0.1:4327";
  const ROOT_ID = "tb-gpt-production-studio";
  const LAUNCHER_ID = "tb-gpt-production-launcher";
  const DROP_OVERLAY_ID = "tb-gpt-production-drop-overlay";
  const EMBEDDED_STORAGE_KEY = "tb-workbench-embedded";
  const API_ROOT_STORAGE_KEY = "tb-workbench-api-root";
  const PATH_STORAGE_KEY = "tb-production-paths";
  const ACTION_STORAGE_KEY = "tb-material-action-settings";
  const ARCHIVED_BOUNDARY_KEY = "tb-gpt-last-archived-boundary-v1";
  const PATROL_ACTION_LEDGER_KEY = "tb-gpt-patrol-action-ledger-v1";
  const DEFAULT_PUBLISH_COPY_PROMPT = "请只输出一份可直接复制发布的完整小红书文案。第一行直接写实际标题，随后直接写正文，末尾直接写话题标签。不要输出任何解释、开场白、总结，也不要输出“标题”“正文”“话题”“标签”等栏目名或 Markdown 标题。";
  const DEFAULT_MATERIAL_PLAN_PROMPT = "请完整读取全部附件，不要省略 TXT。本套迁移计划和最终成品都最多 10 张；素材超过 10 张时，必须先全部读取，再自行筛选、聚类、合并和取舍，只规划 P1-P10 以内。禁止第 11 页，禁止分批，禁止第二批，禁止把剩余素材留到下一批。先严格按既定格式输出最多 10 页的逐页迁移计划，并在结尾等待我回复 1，暂时不要出图。";
  const normalizePublishCopyPrompt = (value) => {
    const prompt = String(value || "").trim();
    return !prompt || prompt === "给我一份小红书文案" ? DEFAULT_PUBLISH_COPY_PROMPT : prompt;
  };
  const automationCore = globalThis.TeambuildingGptAutomationCore || {};
  const parsePlannedImageCount = automationCore.parsePlannedImageCount || (() => 0);
  const requiresPlannedImageCount = automationCore.requiresPlannedImageCount || ((taskType) => taskType !== "template-init");
  const isArchivedAutomationBoundary = automationCore.isArchivedAutomationBoundary || ((options = {}) => {
    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
    return Boolean(options.marker
      && normalize(options.currentUrl) === normalize(options.marker.conversationUrl)
      && normalize(options.materialText)
      && normalize(options.materialText) === normalize(options.marker.materialText));
  });
  const firstBatchChoice = automationCore.firstBatchChoice || ((options = {}) => {
    const maximum = Math.max(1, Number(options.maximum || 10));
    const expectedImageCount = Math.min(Math.max(1, Number(options.plannedImageCount || maximum)), maximum);
    return { reply: `先出 P1-P${expectedImageCount}`, expectedImageCount };
  });
  const validatePlanPageCap = automationCore.validatePlanPageCap || ((options = {}) => {
    const maximum = Math.max(1, Number(options.maximum || 10));
    const planned = Math.max(0, Number(options.plannedImageCount || 0));
    const text = String(options.text || "");
    if (planned > maximum) return { valid: false, code: "PLAN_PAGE_CAP_EXCEEDED" };
    if (/P\s*11\b|第二批\s*[:：]?\s*P|第二批.{0,24}(?:继续|生成|出图|剩余)|(?:继续|再出).{0,24}P\s*11/iu.test(text)) {
      return { valid: false, code: "PLAN_BATCHING_FORBIDDEN" };
    }
    return { valid: true, code: "" };
  });
  const resolveEntryInstruction = automationCore.resolveEntryInstruction || ((entry = {}) => {
    if (String(entry.customPrompt || "").trim()) return String(entry.customPrompt).trim();
    if (String(entry.prompt || "").trim()) return String(entry.prompt).trim();
    return [
      "请沿用当前对话已经确定的母版与规则，处理刚上传的这组团建素材。",
      `内容名称：${String(entry.name || "").trim()}`
    ].filter(Boolean).join("\n");
  });
  const shouldRecoverSilentAssistant = automationCore.shouldRecoverSilentAssistant || ((options = {}) => (
    Number(options.elapsedMs || 0) >= Number(options.thresholdMs || 60_000)
      && Number(options.freshTurnCount || 0) === 0
      && !options.generating
      && Boolean(options.composerEmpty)
  ));
  const shouldRecoverSilentImageGeneration = automationCore.shouldRecoverSilentImageGeneration || ((options = {}) => (
    Number(options.elapsedMs || 0) >= Number(options.thresholdMs || 60_000)
      && Number(options.freshTurnCount || 0) === 0
      && Number(options.freshImageCount || 0) === 0
      && !options.generating
  ));
  const shouldRetryThreadError = automationCore.shouldRetryThreadError || ((options = {}) => (
    Number(options.elapsedMs || 0) >= Number(options.thresholdMs || 15_000)
      && Boolean(options.retryVisible)
      && Number(options.freshTurnCount || 0) === 0
      && !options.alreadyRetried
  ));
  const detectRepetitiveAssistantLoop = automationCore.detectRepetitiveAssistantLoop || ((text, minimumRepeats = 8) => {
    const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const token = lines.at(-1) || "";
    let repeats = 0;
    for (let index = lines.length - 1; token && index >= 0 && lines[index] === token; index -= 1) repeats += 1;
    return { detected: Boolean(token && token.length <= 40 && repeats >= minimumRepeats), token, repeats };
  });
  const classifyPatrolConversationCandidate = automationCore.classifyPatrolConversationCandidate || ((options = {}) => {
    const title = String(options.title || "").replace(/\s+/g, " ").trim();
    const url = String(options.url || "").trim();
    const denylist = (Array.isArray(options.denylist) ? options.denylist : []).map((value) => String(value || "").trim());
    const titleMatched = /模板|母版/i.test(title);
    const excludedByKeyword = /游戏/i.test(title);
    const explicitlyExcluded = denylist.includes(url) || denylist.includes(title);
    const excluded = excludedByKeyword || explicitlyExcluded;
    return { title, url, titleMatched, excludedByKeyword, explicitlyExcluded, excluded, eligible: titleMatched && !excluded };
  });
  const classifyPatrolStage = globalThis.TeambuildingGptPatrolStage?.classifyPatrolStage || ((options = {}) => ({
    key: options.stage || "unknown",
    label: options.stage || "阶段证据不足",
    nextActionKey: "inspect",
    safeToAct: false,
    detail: ""
  }));
  const decidePatrolSingleStep = globalThis.TeambuildingGptPatrolStage?.decidePatrolSingleStep || (() => ({
    allowed: false,
    action: "none",
    reason: "patrol-decision-module-unavailable"
  }));
  const isAutomationMaterialPrompt = globalThis.TeambuildingGptPatrolStage?.isAutomationMaterialPrompt
    || ((text = "") => /当前素材文件夹：/.test(String(text || ""))
      && /本次附件全部是待迁移素材|请(?:完整)?读取全部附件/.test(String(text || "")));
  const preferredRecoveryImageUrls = globalThis.TeambuildingGptPatrolStage?.preferredRecoveryImageUrls
    || ((pageUrls = [], checkpointUrls = []) => checkpointUrls.length > pageUrls.length ? checkpointUrls : pageUrls);
  const uniqueGeneratedImageUrls = automationCore.uniqueGeneratedImageUrls || ((values) => [...new Set(values)]);
  const isCompleteCopy = automationCore.isCompleteCopy || ((text, minimum = 300) => String(text || "").replace(/\s/g, "").length >= minimum);
  const isLikelyPublishCopy = automationCore.isLikelyPublishCopy || isCompleteCopy;
  const defaultKeywordPattern = automationCore.defaultKeywordPattern || (() => "");
  const completionKeywordDetected = automationCore.completionKeywordDetected || ((text, options = {}) => {
    const pattern = String(options.keywordPattern || options.pattern || "").trim();
    if (!pattern || !text) return { matched: false, pattern };
    try {
      return { matched: new RegExp(pattern, "i").test(String(text || "")), pattern };
    } catch {
      return { matched: String(text || "").includes(pattern), pattern };
    }
  });
  const classifyAttachmentUploadResult = automationCore.classifyAttachmentUploadResult || ((options = {}) => {
    const expected = Math.max(0, Number(options.expected || 0));
    const observed = Math.max(0, Math.min(expected, Number(options.observed || 0)));
    if (expected > 0 && observed >= expected) return { status: "complete", expected, observed };
    if (observed > 0) return { status: "partial", expected, observed, code: "UPLOAD_LIMIT_SIGNAL" };
    return { status: "missing", expected, observed, code: "ATTACHMENT_UPLOAD_NOT_READY" };
  });
  const classifyPlanDetectionResult = automationCore.classifyPlanDetectionResult || ((options = {}) => {
    if (!options.validPlan) return { ready: false, code: "PLAN_NOT_READY" };
    if (!options.planComplete) return { ready: false, code: "PLAN_NOT_COMPLETE" };
    if (Object.prototype.hasOwnProperty.call(options, "plannedImageCount")
      && Math.max(0, Number(options.plannedImageCount || 0)) === 0) {
      return { ready: false, code: "PLAN_NOT_COMPLETE" };
    }
    return { ready: true, code: "" };
  });
  const decidePlanRecovery = automationCore.decidePlanRecovery || ((options = {}) => {
    const attempts = Math.max(0, Number(options.attempts || 0));
    const maxAttempts = Math.max(0, Number(options.maxAttempts ?? 2));
    if (attempts < maxAttempts) return { action: "retry-current", nextAttempt: attempts + 1 };
    return { action: "pause", nextAttempt: attempts };
  });
  const isActiveGenerationControl = automationCore.isActiveGenerationControl || ((options = {}) => {
    if (!options.visible || options.disabled) return false;
    return /stop-(?:button|generating|streaming|response)|stop\s+(?:generating|streaming|response)|停止(?:生成|回答|响应|流式|思考)/i.test(String(options.label || ""));
  });
  const detectPyScriptFallbackSignal = automationCore.detectPyScriptFallbackSignal || ((options = {}) => {
    const nativeImages = Math.max(0, Number(options.nativeImages || 0));
    if (nativeImages <= 0) return { detected: false, reason: "" };
    if (options.hasCodeSignal || options.hasScriptArtifact) return { detected: true, reason: "py-script-fallback" };
    return { detected: false, reason: "" };
  });
  const detectScriptOutputLimitSignal = automationCore.detectScriptOutputLimitSignal || ((options = {}) => {
    const nativeImages = Math.max(0, Number(options.nativeImages || 0));
    const artifactCount = Math.max(0, Number(options.artifactCount || 0));
    if (nativeImages > 0 || artifactCount <= 0) return { detected: false, reason: "" };
    if (options.hasCodeSignal || options.hasScriptArtifact || options.hasArchiveSignal) return { detected: true, reason: "script-output-limit" };
    return { detected: false, reason: "" };
  });
  const detectLowImageLimit = automationCore.detectLowImageLimit || ((options = {}) => {
    const nativeImages = Math.max(0, Number(options.nativeImages || 0));
    const threshold = Math.max(1, Number(options.threshold || 4));
    return { detected: nativeImages > 0 && nativeImages <= threshold, count: nativeImages, threshold };
  });
  const classifyAutomationBoundaryPause = automationCore.classifyAutomationBoundaryPause || ((snapshot = {}) => {
    if (snapshot.scriptOutputLimitSignal) return {
      shouldPause: true,
      boundaryPaused: true,
      code: "GENERATION_LIMIT_SIGNAL",
      riskReason: "script-output-limit",
      message: "检测到纯脚本/沙盒产物输出，按生图触顶处理，停止当前帖子"
    };
    if (snapshot.pyScriptFallbackSignal) return {
      shouldPause: true,
      boundaryPaused: true,
      code: "GENERATION_LIMIT_SIGNAL",
      riskReason: "py-script-fallback",
      message: "检测到 GPT 使用 PY 代码兜底拼接垃圾图，停止当前帖子，疑似撞到生图上限"
    };
    if (snapshot.limitSignal) return {
      shouldPause: true,
      boundaryPaused: true,
      code: "GENERATION_LIMIT_SIGNAL",
      riskReason: "retry-or-limit-signal",
      message: "检测到 GPT 重试或额度限制信号，停止当前帖子，等待下一个时间点"
    };
    if (snapshot.scriptOutput) return {
      shouldPause: true,
      boundaryPaused: true,
      code: "SCRIPT_GENERATED_OUTPUT",
      riskReason: "script-output",
      message: "检测到代码解释器或脚本输出，停止当前帖子，不把脚本拼图当作正常生图"
    };
    return { shouldPause: false, boundaryPaused: false, code: "", riskReason: "", message: "" };
  });
  function logGptLimitDebug(event, payload = {}) {
    const detail = {
      event,
      at: new Date().toISOString(),
      ...payload
    };
    try {
      console.warn("[TB_GPT_LIMIT]", detail);
    } catch {
      // ignore logging failures
    }
    return detail;
  }
  const SEASON_TAGS = Object.freeze({
    春季: ["春季", "春天", "春日"],
    夏季: ["夏季", "夏天", "夏日", "夏季团建"],
    秋季: ["秋季", "秋天", "秋日"],
    冬季: ["冬季", "冬天", "冬日"]
  });
  const HOLIDAY_TAGS = Object.freeze({
    元旦: ["元旦", "跨年"],
    春节: ["春节", "过年", "除夕"],
    元宵节: ["元宵节", "元宵"],
    情人节: ["情人节"],
    妇女节: ["妇女节", "女神节", "三八"],
    清明节: ["清明节", "清明"],
    劳动节: ["劳动节", "五一"],
    青年节: ["青年节", "五四"],
    儿童节: ["儿童节", "六一"],
    端午节: ["端午节", "端午"],
    七夕: ["七夕"],
    中秋节: ["中秋节", "中秋"],
    重阳节: ["重阳节", "重阳"],
    国庆节: ["国庆节", "国庆"],
    圣诞节: ["圣诞节", "圣诞"]
  });
  const DEFAULT_ACTION_SETTINGS = Object.freeze({
    game: { enabled: true, label: "游戏" },
    conversion: { enabled: true, label: "转化" },
    guide: { enabled: true, label: "合集" },
    increment: { enabled: true, label: "+1" },
    move: { enabled: false, label: "收纳", targetPath: "" }
  });
  const DEFAULT_PATHS = Object.freeze({
    productRoot: "D:\\AICode\\项目推进\\projects\\江湖有旅人\\主项目\\成品库（GPT+本地脚本制作）",
    materialRoot: "D:\\AICode\\项目推进\\projects\\江湖有旅人\\主项目\\01-素材库"
  });
  const state = {
    workspace: null,
    materials: null,
    materialIndex: null,
    paths: { ...DEFAULT_PATHS },
    productTree: null,
    productChildren: {},
    openProducts: new Set(),
    openMaterials: new Set(),
    materialFilter: { mainTag: "全部", season: "全部", holiday: "全部", usage: "all", query: "" },
    actionSettings: JSON.parse(JSON.stringify(DEFAULT_ACTION_SETTINGS)),
    settingsOpen: false,
    busy: false,
    // Stop after an unsent-composer boundary failure.  The next post must not
    // be started until the current composer is cleaned and explicitly retried.
    boundaryPaused: false,
    uploadTasks: [],
    uploadSequence: 0,
    health: {
      local: false,
      gptUpload: false,
      dedup: false
    },
    connected: false,
    collapsed: false,
    dragging: null,
    moveTarget: null,
    pendingMove: null,
    pendingUsage: null,
    usageCommitTimer: null
  };
  let remountQueued = false;
  let refreshTimer = null;
  let materialIndexTimer = null;
  localStorage.removeItem("tb-studio-collapsed");

  function isEmbeddedWorkbench() {
    return localStorage.getItem(EMBEDDED_STORAGE_KEY) === "1"
      || /TeambuildingWorkbenchGPT/i.test(navigator.userAgent || "");
  }

  function currentApiRoot() {
    const candidate = String(localStorage.getItem(API_ROOT_STORAGE_KEY) || "").trim();
    return /^http:\/\/127\.0\.0\.1:\d+$/.test(candidate) ? candidate : DEFAULT_API_ROOT;
  }

  function canUseExtensionBridge() {
    return Boolean(globalThis.chrome?.runtime?.id && typeof globalThis.chrome.runtime.sendMessage === "function");
  }

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const fileName = (filePath) => String(filePath || "").split(/[\\/]/).pop() || "本地文件";

  function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }

  async function directLocalRequest(pathname, options = {}, responseType = "json", signal = null) {
    const response = await fetch(new URL(pathname, currentApiRoot()).href, {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body,
      signal
    });
    if (!response.ok) throw new Error(await response.text().catch(() => `HTTP ${response.status}`));
    const contentType = response.headers.get("content-type") || "";
    if (responseType === "base64") return { ok: true, contentType, data: bufferToBase64(await response.arrayBuffer()) };
    if (responseType === "text") return { ok: true, contentType, data: await response.text() };
    return { ok: true, contentType, data: await response.json() };
  }

  async function api(pathname, options = {}) {
    // ChatGPT wraps/filters page-world fetch, and Chromium may also apply
    // private-network checks to https://chatgpt.com -> localhost. A loaded
    // extension has host permissions and is the stable transport even when
    // the page is embedded in Electron; direct fetch is only a fallback.
    if (!canUseExtensionBridge()) {
      const result = await directLocalRequest(pathname, options);
      return result.data;
    }
    const result = await chrome.runtime.sendMessage({
      type: "tb-local-request",
      baseUrl: currentApiRoot(),
      path: pathname,
      method: options.method || "GET",
      body: options.body ? JSON.parse(options.body) : undefined
    });
    if (!result?.ok) throw new Error(result?.error || "本地工作台连接失败");
    return result.data;
  }

  async function readLocalFile(filePath, responseType = "base64", signal = null) {
    if (!canUseExtensionBridge()) {
      return directLocalRequest(`/file?path=${encodeURIComponent(filePath)}`, {}, responseType, signal);
    }
    if (signal?.aborted) throw new DOMException("上传已取消", "AbortError");
    const request = chrome.runtime.sendMessage({
      type: "tb-local-request",
      baseUrl: currentApiRoot(),
      path: `/file?path=${encodeURIComponent(filePath)}`,
      responseType
    });
    const abort = new Promise((_, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("上传已取消", "AbortError")), { once: true });
    });
    const result = signal ? await Promise.race([request, abort]) : await request;
    if (!result?.ok) throw new Error(result?.error || `无法读取 ${fileName(filePath)}`);
    return result;
  }

  async function recordWorkbenchQuota(entry, kind, count) {
    if (!entry?.externalRequestId || !entry?.accountId || Number(count || 0) < 1) return null;
    const result = await api("/api/gpt-production/quota-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: entry.accountId,
        requestId: entry.externalRequestId,
        kind,
        count: Number(count)
      })
    });
    // The workbench renderer may be waiting while GPT is generating.  Push
    // the authoritative ledger snapshot immediately instead of waiting for a
    // page switch or a full task completion.
    window.postMessage({
      source: "tb-gpt-production-extension",
      type: "tb-workbench-quota-updated",
      accountId: entry.accountId,
      quota: result?.quota || null,
      kind,
      count: Number(count)
    }, "*");
    return result;
  }

  // ── 对话日志：记录工作流每一步发送和接收的完整内容，写入服务端 jsonl 文件 ──
  // 非阻塞：日志写入失败不影响生产流程
  function logConversationEvent(event, data = {}) {
    const payload = {
      event,
      requestId: String(data.requestId || "").slice(0, 120),
      account: String(data.account || localStorage.getItem("tb-workbench-account-id") || "").slice(0, 60),
      conversationUrl: String(data.conversationUrl || location.href || "").slice(0, 500),
      materialName: String(data.materialName || "").slice(0, 300),
      step: String(data.step || "").slice(0, 60),
      sentText: typeof data.sentText === "string" ? data.sentText : "",
      receivedText: typeof data.receivedText === "string" ? data.receivedText : "",
      imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
      downloadedFiles: Array.isArray(data.downloadedFiles) ? data.downloadedFiles : [],
      copyTextPath: String(data.copyTextPath || "").slice(0, 500),
      packagePath: String(data.packagePath || "").slice(0, 500),
      meta: data.meta || {}
    };
    api("/api/gpt-production/conversation-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => { /* 日志写入失败不影响生产 */ });
  }
  globalThis.TeambuildingLogConversationEvent = logConversationEvent;

  function readStoredPaths() {
    return new Promise((resolve) => {
      chrome.storage.local.get(PATH_STORAGE_KEY, (result) => {
        const saved = result?.[PATH_STORAGE_KEY] || {};
        resolve({
          productRoot: saved.productRoot || DEFAULT_PATHS.productRoot,
          materialRoot: saved.materialRoot || DEFAULT_PATHS.materialRoot
        });
      });
    });
  }

  function storePaths(paths = state.paths) {
    const next = {
      productRoot: paths.productRoot || DEFAULT_PATHS.productRoot,
      materialRoot: paths.materialRoot || DEFAULT_PATHS.materialRoot
    };
    state.paths = next;
    chrome.storage.local.set({ [PATH_STORAGE_KEY]: next });
  }

  function normalizeActionSettings(raw = {}) {
    return Object.fromEntries(Object.entries(DEFAULT_ACTION_SETTINGS).map(([key, defaults]) => {
      const saved = raw?.[key] || {};
      return [key, {
        ...defaults,
        enabled: saved.enabled !== undefined ? Boolean(saved.enabled) : defaults.enabled,
        label: String(saved.label || defaults.label).trim().slice(0, 8) || defaults.label,
        ...(key === "move" ? { targetPath: String(saved.targetPath || "").trim() } : {})
      }];
    }));
  }

  function readActionSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(ACTION_STORAGE_KEY, (result) => {
        resolve(normalizeActionSettings(result?.[ACTION_STORAGE_KEY] || {}));
      });
    });
  }

  function storeActionSettings(settings = state.actionSettings) {
    state.actionSettings = normalizeActionSettings(settings);
    chrome.storage.local.set({ [ACTION_STORAGE_KEY]: state.actionSettings });
  }

  function setStatus(message, tone = "") {
    const node = document.querySelector(`#${ROOT_ID} [data-status]`);
    if (!node) return;
    node.textContent = message;
    node.dataset.tone = tone;
  }

  function setBusy(entry, message = "") {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.dataset.busy = String(Boolean(entry));
    root.querySelectorAll("[data-entry-kind]").forEach((row) => {
      row.classList.toggle("is-uploading", Boolean(entry) && row.dataset.entryId === entry.id);
    });
    if (message) setStatus(message);
  }

  function renderHealth() {
    const host = document.querySelector(`#${ROOT_ID} [data-health]`);
    if (!host) return;
    const checks = [
      ["local", "本地目录"],
      ["gptUpload", "GPT 上传"],
      ["dedup", "历史去重"]
    ];
    host.innerHTML = checks.map(([key, label]) => (
      `<i data-ok="${String(Boolean(state.health[key]))}" title="${label}${state.health[key] ? "正常" : "未就绪"}"></i>`
    )).join("");
    host.title = checks.map(([key, label]) => `${label}：${state.health[key] ? "正常" : "未就绪"}`).join("\n");
  }

  function renderQueue() {
    const host = document.querySelector(`#${ROOT_ID} [data-upload-queue]`);
    if (!host) return;
    const tasks = state.uploadTasks.slice(-4).reverse();
    host.hidden = tasks.length === 0;
    host.innerHTML = tasks.map((task) => {
      const progress = task.total
        ? Math.min(100, Math.round((task.completed / task.total) * 100))
        : 0;
      const label = {
        queued: "等待上传",
        checking: "检查历史去重",
        reading: `读取 ${task.completed}/${task.total}`,
        attaching: "放入 GPT",
        success: "已进入附件区",
        duplicate: "已拦截重复",
        failed: "上传失败",
        cancelled: "已取消"
      }[task.status] || task.status;
      return `
        <article class="tb-queue-row" data-queue-status="${escapeHtml(task.status)}">
          <div class="tb-queue-copy">
            <b title="${escapeHtml(task.entry.name)}">${escapeHtml(task.entry.name)}</b>
            <small>${escapeHtml(label)}${task.error ? ` · ${escapeHtml(task.error)}` : ""}</small>
          </div>
          <div class="tb-queue-progress"><i style="width:${progress}%"></i></div>
          ${["queued", "checking", "reading"].includes(task.status)
            ? `<button type="button" data-cancel-upload="${task.id}">取消</button>`
            : task.status === "failed"
              ? `<button type="button" data-retry-upload="${task.id}">重试</button>`
              : `<span class="tb-queue-result">${task.status === "success" ? "✓" : "—"}</span>`}
        </article>
      `;
    }).join("");
  }

  function scheduleRefresh(delay) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, delay);
  }

  function applyLayout() {
    document.documentElement.classList.toggle("tb-production-studio-open", !state.collapsed);
    const root = document.getElementById(ROOT_ID);
    if (root) root.dataset.collapsed = String(state.collapsed);
    const launcher = document.getElementById(LAUNCHER_ID);
    if (launcher) launcher.hidden = !state.collapsed;
  }

  function showDropOverlay(visible) {
    const overlay = document.getElementById(DROP_OVERLAY_ID);
    if (overlay) overlay.hidden = !visible;
  }

  function isChatDropTarget(target) {
    return Boolean(
      target?.closest?.("main")
      && !target.closest?.(`#${ROOT_ID}`)
      && !target.closest?.("nav, aside, [role='navigation']")
    );
  }

  function clearMoveTarget() {
    document.querySelectorAll(`#${ROOT_ID} .is-move-target`)
      .forEach((node) => node.classList.remove("is-move-target"));
    state.moveTarget = null;
  }

  function renderMoveDialog() {
    const dialog = document.querySelector(`#${ROOT_ID} [data-move-dialog]`);
    if (!dialog) return;
    const pending = state.pendingMove;
    dialog.hidden = !pending;
    if (!pending) return;
    dialog.querySelector("[data-move-source-name]").textContent = pending.entry.name;
    dialog.querySelector("[data-move-target-name]").textContent = fileName(pending.targetPath);
  }

  async function confirmMove() {
    const pending = state.pendingMove;
    if (!pending) return;
    state.pendingMove = null;
    renderMoveDialog();
    setStatus(`正在移动“${pending.entry.name}”…`);
    try {
      await api("/api/extension/move-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePath: pending.entry.path,
          targetPath: pending.targetPath
        })
      });
      state.productChildren = {};
      state.openProducts.clear();
      state.openMaterials.clear();
      await refresh();
      setStatus(`已移动到“${fileName(pending.targetPath)}”`, "success");
    } catch (error) {
      setStatus(`移动失败：${error.message}`, "danger");
    }
  }

  function productRows(entries = state.productTree?.entries || [], depth = 0) {
    return entries.map((item) => {
      if (item.kind === "file") {
        return `
          <article class="tb-work-row tb-file-row" style="--tree-depth:${depth}" draggable="${item.uploadable ? "true" : "false"}"
            ${item.uploadable ? `data-entry-kind="product" data-entry-id="${escapeHtml(item.id)}"` : ""}>
            <span class="tb-file-icon" aria-hidden="true"></span>
            <span class="tb-work-name" title="${escapeHtml(item.path)}">${escapeHtml(item.name)}</span>
            ${item.uploadable ? `<button type="button" data-upload-product="${escapeHtml(item.id)}">传 GPT</button>` : ""}
          </article>
        `;
      }
      const loaded = Object.prototype.hasOwnProperty.call(state.productChildren, item.path);
      const children = state.productChildren[item.path]?.entries || [];
      const directCount = Number(item.imageCount || 0) + Number(item.textCount || 0);
      return `
          <details class="tb-tree-group tb-product-group" style="--tree-depth:${depth}" data-product-path="${escapeHtml(item.path)}"
            ${state.openProducts.has(item.path) ? "open" : ""}>
          <summary draggable="true" data-move-source-kind="product" data-move-source-id="${escapeHtml(item.id)}"
            data-move-target-path="${escapeHtml(item.path)}">
            <span class="tb-folder-icon"></span>
            <span class="tb-library-copy">
              <b title="${escapeHtml(item.path)}">${escapeHtml(item.name)}</b>
              <small>${Number(item.folderCount || 0)} 个文件夹 · ${Number(item.fileCount || 0)} 个文件</small>
            </span>
            <span class="tb-library-count">${Number(item.folderCount || 0) + Number(item.fileCount || 0)}</span>
          </summary>
          <div class="tb-tree-items">
            ${directCount ? `
              <article class="tb-work-row tb-folder-upload" draggable="true" data-entry-kind="product" data-entry-id="${escapeHtml(item.id)}"
                data-move-source-kind="product" data-move-source-id="${escapeHtml(item.id)}">
                <span class="tb-image-count"><b>${Number(item.imageCount || 0)}</b><small>图</small></span>
                <span class="tb-work-copy"><span class="tb-work-name">上传这个文件夹</span><small>${Number(item.textCount || 0)} 个文档</small></span>
                <button type="button" data-upload-product="${escapeHtml(item.id)}">传 GPT</button>
              </article>
            ` : ""}
            ${loaded ? productRows(children, depth + 1) || `<div class="tb-empty compact">这个文件夹是空的</div>`
              : `<div class="tb-empty compact">展开后读取这个文件夹</div>`}
          </div>
        </details>
      `;
    }).join("") || `<div class="tb-empty">成品目录是空的</div>`;
  }

  function materialMatchesFilter(item) {
    const { mainTag, season, holiday, usage, query } = state.materialFilter;
    if (mainTag !== "全部" && item.mainTag !== mainTag) return false;
    if (season !== "全部" && !materialHasGroupedTag(item, SEASON_TAGS, season)) return false;
    if (holiday !== "全部" && !materialHasGroupedTag(item, HOLIDAY_TAGS, holiday)) return false;
    const count = Number(item.usageCount || 0);
    if (usage === "0" && count !== 0) return false;
    if (usage === "1" && count !== 1) return false;
    if (usage === "2" && count !== 2) return false;
    if (usage === "3+" && count < 3) return false;
    const needle = String(query || "").trim().toLowerCase();
    if (needle) {
      const haystack = `${item.name || ""} ${item.mainTag || ""} ${(item.tags || []).join(" ")} ${item.folderHash || ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  }

  function materialHasGroupedTag(item, groups, value) {
    const aliases = groups[value] || [];
    const tags = new Set((item.tags || []).map((tag) => String(tag).trim()));
    return aliases.some((alias) => tags.has(alias));
  }

  function groupedTagCounts(groups) {
    const items = state.materialIndex?.items || [];
    return Object.fromEntries(Object.keys(groups).map((value) => [
      value,
      items.filter((item) => materialHasGroupedTag(item, groups, value)).length
    ]));
  }

  function materialActionButtons(item) {
    const settings = state.actionSettings;
    const buttons = [];
    if (settings.game.enabled) buttons.push(`<button type="button" data-material-main-tag="团建游戏" data-material-id="${escapeHtml(item.id)}">${escapeHtml(settings.game.label)}</button>`);
    if (settings.conversion.enabled) buttons.push(`<button type="button" data-material-main-tag="团建转化" data-material-id="${escapeHtml(item.id)}">${escapeHtml(settings.conversion.label)}</button>`);
    if (settings.guide.enabled) buttons.push(`<button type="button" data-material-main-tag="合集攻略" data-material-id="${escapeHtml(item.id)}">${escapeHtml(settings.guide.label)}</button>`);
    if (settings.increment.enabled) buttons.push(`<button type="button" data-material-increment="${escapeHtml(item.id)}">${escapeHtml(settings.increment.label)}</button>`);
    if (settings.move.enabled && settings.move.targetPath) buttons.push(`<button type="button" data-material-move="${escapeHtml(item.id)}">${escapeHtml(settings.move.label)}</button>`);
    return buttons.join("");
  }

  function materialRow(item, indexed = false) {
    return `
      <article class="tb-work-row" draggable="${indexed ? "false" : "true"}"
        data-entry-kind="material" data-entry-id="${escapeHtml(item.id)}"
        data-index-category="${escapeHtml(item.categoryId || "")}"
        data-indexed="${String(indexed)}"
        data-move-source-kind="material" data-move-source-id="${escapeHtml(item.id)}">
        <span class="tb-post-folder" aria-hidden="true"><i class="tb-folder-icon"></i></span>
        <span class="tb-work-copy">
          <span class="tb-work-name" title="${escapeHtml(item.path || item.name)}">${escapeHtml(item.name)}</span>
          <span class="tb-material-meta"><i>${escapeHtml(item.mainTag || "团建转化")}</i><em>${Number(item.usageCount || 0)} 次</em><code title="文件夹哈希 ${escapeHtml(item.folderHash || "")}">${escapeHtml((item.folderHash || "").slice(0, 8))}</code></span>
          <small>${Number(item.imageCount || 0)} 张图 · ${Number(item.textCount || 0)} 个文档${item.mainTagSource === "manual" ? " · 人工标签" : " · 自动识别"}${item.usageSource ? ` · ${escapeHtml(item.usageSource)}` : ""}</small>
        </span>
        <span class="tb-material-actions">${materialActionButtons(item)}<button type="button" class="tb-primary-action" data-upload-material="${escapeHtml(item.id)}" data-index-category="${escapeHtml(item.categoryId || "")}">传 GPT</button></span>
      </article>`;
  }

  function materialFilterActive() {
    return state.materialFilter.mainTag !== "全部"
      || state.materialFilter.season !== "全部"
      || state.materialFilter.holiday !== "全部"
      || state.materialFilter.usage !== "all"
      || Boolean(String(state.materialFilter.query || "").trim());
  }

  function globalMaterialRows() {
    const index = state.materialIndex;
    if (!index?.items?.length) {
      const progress = index?.status === "running"
        ? `正在建立全库索引：${Number(index.processedCategories || 0)}/${Number(index.totalCategories || 0)} 个分类，已识别 ${Number(index.indexedItems || 0)} 条`
        : "全库索引尚未完成";
      return `<div class="tb-empty">${progress}</div>`;
    }
    const filtered = index.items.filter(materialMatchesFilter);
    const visible = filtered
      .slice()
      .sort((left, right) => Number(right.usageCount || 0) - Number(left.usageCount || 0)
        || String(left.name || "").localeCompare(String(right.name || ""), "zh-Hans-CN"))
      .slice(0, 240);
    const groups = new Map();
    visible.forEach((item) => {
      const key = item.categoryId || item.categoryName || "其他";
      if (!groups.has(key)) groups.set(key, { id: key, name: item.categoryName || "其他", items: [] });
      groups.get(key).items.push(item);
    });
    const rows = Array.from(groups.values()).map((category) => `
      <details class="tb-tree-group tb-index-results" open>
        <summary><span class="tb-folder-icon"></span><b>${escapeHtml(category.name)}</b><small>${category.items.length}</small></summary>
        <div class="tb-tree-items">${category.items.map((item) => materialRow(item, true)).join("")}</div>
      </details>
    `).join("");
    if (!rows) return `<div class="tb-empty">全库筛选下没有匹配素材</div>`;
    return `<div class="tb-index-result-note">全库匹配 ${filtered.length} 条${filtered.length > visible.length ? `，当前显示前 ${visible.length} 条，请继续输入关键词缩小范围` : ""}</div>${rows}`;
  }

  function materialRows() {
    if (materialFilterActive()) return globalMaterialRows();
    const categories = state.materials?.categories || [];
    return categories.map((category) => `
      <details class="tb-tree-group" data-category="${escapeHtml(category.id)}"
        ${state.openMaterials.has(category.id) ? "open" : ""}>
        <summary data-move-target-path="${escapeHtml(category.path)}"><span class="tb-folder-icon"></span><b title="${escapeHtml(category.name)}">${escapeHtml(category.name)}</b><small>${Number(category.count || 0)}</small></summary>
        <div class="tb-tree-items">
          ${category.loaded ? (category.items || []).map((item) => materialRow(item)).join("")
            || `<div class="tb-empty compact">这个分类没有素材</div>`
            : `<div class="tb-empty compact">展开后读取这个文件夹并生成哈希</div>`}
        </div>
      </details>
    `).join("") || `<div class="tb-empty">素材目录中还没有识别到“图片 + 文案”帖子</div>`;
  }

  function materialFilterBar() {
    const stats = state.materialIndex?.stats;
    const tagButtons = ["全部", "团建游戏", "团建转化", "合集攻略"].map((tag) => (
      `<button type="button" data-filter-main-tag="${tag}" data-active="${String(state.materialFilter.mainTag === tag)}">${tag}<small>${tag === "全部" ? Number(stats?.total || 0) : Number(stats?.byMainTag?.[tag] || 0)}</small></button>`
    )).join("");
    const seasonCounts = groupedTagCounts(SEASON_TAGS);
    const holidayCounts = groupedTagCounts(HOLIDAY_TAGS);
    const groupedButtons = (dimension, groups, counts) => ["全部", ...Object.keys(groups)]
      .filter((value) => value === "全部" || Number(counts[value] || 0) > 0)
      .map((value) => `<button type="button" data-filter-dimension="${dimension}" data-filter-value="${value}" data-active="${String(state.materialFilter[dimension] === value)}">${value}<small>${value === "全部" ? "" : Number(counts[value] || 0)}</small></button>`)
      .join("");
    const progress = state.materialIndex?.status === "running"
      ? `索引 ${Number(state.materialIndex.processedCategories || 0)}/${Number(state.materialIndex.totalCategories || 0)}`
      : state.materialIndex?.generatedAt
        ? `已索引 ${Number(stats?.total || 0)} · 待核对 ${Number(stats?.review || 0)}`
        : "准备建立全库索引";
    return `
      <div class="tb-material-filter">
        <div class="tb-main-filter-row">${tagButtons}</div>
        <div class="tb-filter-dimensions">
          <details class="tb-filter-group" ${state.materialFilter.season !== "全部" ? "open" : ""}>
            <summary>季节${state.materialFilter.season !== "全部" ? ` · ${escapeHtml(state.materialFilter.season)}` : ""}</summary>
            <div>${groupedButtons("season", SEASON_TAGS, seasonCounts)}</div>
          </details>
          <details class="tb-filter-group" ${state.materialFilter.holiday !== "全部" ? "open" : ""}>
            <summary>节日${state.materialFilter.holiday !== "全部" ? ` · ${escapeHtml(state.materialFilter.holiday)}` : ""}</summary>
            <div>${groupedButtons("holiday", HOLIDAY_TAGS, holidayCounts)}</div>
          </details>
        </div>
        <select data-filter-usage aria-label="按使用次数筛选">
          <option value="all" ${state.materialFilter.usage === "all" ? "selected" : ""}>全部次数 ${Number(stats?.total || 0)}</option>
          <option value="0" ${state.materialFilter.usage === "0" ? "selected" : ""}>未使用 ${Number(stats?.byUsage?.unused || 0)}</option>
          <option value="1" ${state.materialFilter.usage === "1" ? "selected" : ""}>使用 1 次 ${Number(stats?.byUsage?.once || 0)}</option>
          <option value="2" ${state.materialFilter.usage === "2" ? "selected" : ""}>使用 2 次 ${Number(stats?.byUsage?.twice || 0)}</option>
          <option value="3+" ${state.materialFilter.usage === "3+" ? "selected" : ""}>使用 3 次以上 ${Number(stats?.byUsage?.threePlus || 0)}</option>
        </select>
        <input data-filter-query value="${escapeHtml(state.materialFilter.query)}" placeholder="搜索名称、标签或哈希">
        <button type="button" data-open-material-settings title="设置文件夹按钮">⚙</button>
        <small class="tb-index-status">${progress}</small>
      </div>`;
  }

  function materialSettingsFields() {
    const rows = [
      ["game", "团建游戏"],
      ["conversion", "团建转化"],
      ["guide", "合集攻略"],
      ["increment", "使用次数 +1"],
      ["move", "移动到固定目录"]
    ];
    return rows.map(([key, title]) => {
      const setting = state.actionSettings[key];
      return `<label class="tb-setting-row">
        <input type="checkbox" data-action-enabled="${key}" ${setting.enabled ? "checked" : ""}>
        <span>${title}</span>
        <input data-action-label="${key}" value="${escapeHtml(setting.label)}" maxlength="8" aria-label="${title}按钮名称">
      </label>`;
    }).join("");
  }

  function renderMaterialSettings() {
    const root = document.getElementById(ROOT_ID);
    const dialog = root?.querySelector("[data-material-settings]");
    if (!dialog) return;
    dialog.hidden = !state.settingsOpen;
    if (!state.settingsOpen) return;
    dialog.querySelector("[data-action-fields]").innerHTML = materialSettingsFields();
    dialog.querySelector("[data-action-move-target]").value = state.actionSettings.move.targetPath || "";
  }

  function renderBody() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const settings = state.workspace?.settings;
    const production = state.workspace?.dedup?.production;
    root.querySelector("[data-product-path]").value = settings?.workPackage?.libraryPath || state.paths.productRoot;
    root.querySelector("[data-material-path]").value = settings?.materialRoot || state.paths.materialRoot;
    root.querySelector("[data-dedup]").innerHTML = production?.available
      ? `<b>${Number(production.uniqueImageGroups || 0)}</b> 组历史 · 精确 ${Number(production.exactHashGroups || 0)} · 视觉 ${Number(production.perceptualHashGroups || 0)}`
      : "历史去重库尚未连接";
    root.querySelector("[data-products]").innerHTML = productRows();
    root.querySelector("[data-material-filter]").innerHTML = materialFilterBar();
    root.querySelector("[data-materials]").innerHTML = materialRows();
    renderMaterialSettings();
  }

  function render() {
    const host = document.body || document.documentElement;
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("aside");
      root.id = ROOT_ID;
      root.innerHTML = `
        <header class="tb-studio-header">
          <div><span>本地生产</span><b>团建创作</b></div>
          <button type="button" data-collapse title="收起右侧生产舱">×</button>
        </header>
        <form class="tb-path-bar" data-product-form>
          <label>成品库</label>
          <input data-product-path aria-label="成品库路径" placeholder="粘贴成品文件夹路径，回车读取">
          <button type="submit">读取</button>
        </form>
        <div class="tb-dedup-strip"><i></i><span data-dedup>正在读取历史去重库…</span></div>
        <section class="tb-studio-zone tb-products-zone">
          <div class="tb-zone-title"><div><span>01</span><b>成品区</b></div><small>成品包与已完成作品</small></div>
          <div class="tb-zone-scroll" data-products></div>
        </section>
        <section class="tb-studio-zone tb-materials-zone">
          <div class="tb-zone-title"><div><span>02</span><b>素材区</b></div><small>图片 + 文案帖子</small></div>
          <form class="tb-mini-path" data-material-form>
            <input data-material-path aria-label="素材库路径" placeholder="粘贴素材文件夹路径">
            <button type="submit" title="读取素材目录">↻</button>
          </form>
          <div data-material-filter></div>
          <div class="tb-zone-scroll" data-materials></div>
        </section>
        <section class="tb-upload-queue" data-upload-queue hidden></section>
        <section class="tb-move-confirm" data-move-dialog hidden role="dialog" aria-modal="true" aria-label="确认移动文件夹">
          <div>
            <b>移动本地文件夹？</b>
            <p>“<span data-move-source-name></span>”将真实移动到“<span data-move-target-name></span>”。原位置会消失。</p>
            <footer>
              <button type="button" data-cancel-move>取消</button>
              <button type="button" data-confirm-move>确认移动</button>
            </footer>
          </div>
        </section>
        <section class="tb-material-settings" data-material-settings hidden role="dialog" aria-modal="true" aria-label="素材文件夹按钮设置">
          <form data-material-settings-form>
            <header><b>素材文件夹按钮</b><button type="button" data-close-material-settings aria-label="关闭设置">×</button></header>
            <p>每个文件夹只保留一个母标签；同义游戏分类统一归入“团建游戏”。</p>
            <div data-action-fields></div>
            <label class="tb-move-target"><span>固定移动目录</span><input data-action-move-target placeholder="例如 D:\\素材库\\已处理"></label>
            <footer><button type="button" data-reset-material-settings>恢复默认</button><button type="submit">保存设置</button></footer>
          </form>
        </section>
        <footer class="tb-studio-footer"><span data-status>正在连接本地工作台…</span><span class="tb-health" data-health></span><b>拖入对话或点“传 GPT”</b></footer>
      `;
      host.appendChild(root);
      root.querySelector("[data-product-path]").value = state.paths.productRoot;
      root.querySelector("[data-material-path]").value = state.paths.materialRoot;
    }
    let launcher = document.getElementById(LAUNCHER_ID);
    if (!launcher) {
      launcher = document.createElement("button");
      launcher.id = LAUNCHER_ID;
      launcher.className = "tb-studio-reopen";
      launcher.type = "button";
      launcher.dataset.studioLauncher = "";
      launcher.title = "展开团建创作生产舱";
      launcher.setAttribute("aria-label", "展开团建创作生产舱");
      launcher.innerHTML = `<span>创作舱</span><b>‹</b>`;
      host.appendChild(launcher);
    }
    let dropOverlay = document.getElementById(DROP_OVERLAY_ID);
    if (!dropOverlay) {
      dropOverlay = document.createElement("div");
      dropOverlay.id = DROP_OVERLAY_ID;
      dropOverlay.hidden = true;
      dropOverlay.innerHTML = "<b>松开放入当前 GPT</b><span>将自动读取文件、上传附件并填入生产指令</span>";
      host.appendChild(dropOverlay);
    }
    applyLayout();
    if (state.workspace) renderBody();
    renderQueue();
    renderHealth();
  }

  function composer() {
    return document.querySelector("#prompt-textarea")
      || document.querySelector('div[contenteditable="true"][id*="prompt"]')
      || document.querySelector('form [contenteditable="true"]')
      || document.querySelector('[data-testid*="composer"] [contenteditable="true"]')
      || document.querySelector('div[contenteditable="true"][role="textbox"]')
      || document.querySelector('textarea[placeholder*="Message"]')
      || document.querySelector('form [data-lexical-editor="true"][contenteditable="true"]')
      || document.querySelector('#composer-textarea')
      || document.querySelector('[data-testid="composer-text-input"]');
  }

  async function ensureEditableConversation() {
    if (composer()) return true;
    if (!/^\/share\//i.test(location.pathname)) return false;
    const continueButton = [...document.querySelectorAll("button, a")].find((node) => {
      const text = String(node.innerText || node.textContent || "").trim();
      return /继续(?:此|该)?对话|继续聊天|Continue (?:this )?conversation/i.test(text);
    });
    if (!continueButton) return false;
    continueButton.click();
    return waitFor(() => Boolean(composer()), 20_000);
  }

  function mergeComposerText(existing, addition) {
    const current = String(existing || "");
    if (!current.trim()) return addition;
    if (current.includes(addition)) return current;
    return `${current.replace(/\s+$/, "")}\n\n${addition}`;
  }

  function fillComposer(text) {
    const target = composer();
    if (!target) throw new Error("没有找到当前 GPT 输入框");
    target.focus();
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      const existingText = target.value || "";
      const nextText = mergeComposerText(existingText, text);
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), "value")?.set;
      if (setter) setter.call(target, nextText);
      else target.value = nextText;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const existingText = target.innerText || target.textContent || "";
    const nextText = mergeComposerText(existingText, text);
    const addition = existingText.trim() ? `\n\n${text}` : text;
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    if (typeof document.execCommand === "function") {
      document.execCommand("insertText", false, addition);
    } else {
      target.textContent = nextText;
    }
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: addition }));
  }

  // Automated workflow controls must always be sent as fresh messages. GPT can
  // retain an unsent draft after a programmatic submit, and merging "1" or the
  // copy prompt into that draft corrupts the workflow turn.
  function setComposerText(text) {
    const target = composer();
    if (!target) throw new Error("没有找到当前 GPT 输入框");
    const next = String(text || "");
    target.focus();
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), "value")?.set;
      if (setter) setter.call(target, next);
      else target.value = next;
    } else {
      // ProseMirror: select all existing content, then insert replacement text
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection?.removeAllRanges();
      selection?.addRange(range);
      let inserted = false;
      if (typeof document.execCommand === "function") {
        try { inserted = document.execCommand("insertText", false, next); } catch {}
      }
      // Fallback 1: direct textContent + InputEvent (for when execCommand fails)
      if (!inserted || !composerDraftText()) {
        target.textContent = next;
        target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: next }));
      }
      // Fallback 2: paste via ClipboardEvent (ProseMirror intercepts paste)
      if (!composerDraftText()) {
        try {
          const clipboardData = new DataTransfer();
          clipboardData.setData("text/plain", next);
          target.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
        } catch {}
      }
    }
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: next }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function clearComposerDraft() {
    const target = composer();
    if (!target) return false;
    if (!composerDraftText()) {
      clearAutomationDraftMarker();
      return true;
    }
    target.focus();
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), "value")?.set;
      if (setter) setter.call(target, "");
      else target.value = "";
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection?.removeAllRanges();
      selection?.addRange(range);
      // insertText with an empty string is a no-op in Chromium. Delete the
      // selected ProseMirror transaction explicitly, then notify React.
      if (typeof document.execCommand === "function") document.execCommand("delete", false);
      if (composerDraftText()) target.textContent = "";
    }
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward", data: null }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    clearAutomationDraftMarker();
    return !composerDraftText();
  }

  function clearComposerAttachments() {
    const target = composer();
    const scope = target?.closest('[data-composer-surface]')
      || target?.closest("form")
      || target?.closest('[data-testid*="composer"]')
      || target?.parentElement;
    if (!scope) return 0;
    const removeButtons = [
      ...scope.querySelectorAll('button[aria-label*="Remove attachment"]'),
      ...scope.querySelectorAll('button[aria-label*="移除附件"]'),
      ...scope.querySelectorAll('button[aria-label*="移除文件"]'),
      ...scope.querySelectorAll('[data-testid*="attachment"] button[aria-label*="Remove"]'),
      ...scope.querySelectorAll('[data-testid*="attachment"] button[aria-label*="移除"]')
    ].filter((btn) => btn.offsetParent !== null);
    removeButtons.forEach((btn) => {
      try { btn.click(); } catch {}
    });
    return removeButtons.length;
  }

  function forceClearComposer() {
    let cleared = 0;
    try { cleared = clearComposerAttachments(); } catch {}
    try { clearComposerDraft(); } catch {}
    return cleared;
  }

  async function replaceComposerText(text, owner = null) {
    clearComposerDraft();
    setComposerText(text);
    const expected = String(text || "").trim();
    const expectedNormalized = normalizeDraft(expected);
    const composerMatchesExpected = () => {
      const currentNormalized = normalizeDraft(composerDraftText());
      return Boolean(expectedNormalized && currentNormalized
        && (currentNormalized === expectedNormalized
          || currentNormalized.includes(expectedNormalized)
          || expectedNormalized.includes(currentNormalized)));
    };
    // ProseMirror/React applies the input transaction on the next microtask.
    // Checking synchronously made a valid prompt look missing and stopped the
    // task after attachments had already been uploaded.  Wait briefly for the
    // DOM-backed composer value to settle before declaring a boundary error.
    let applied = !expected || await waitFor(composerMatchesExpected, 15_000);
    if (!applied && expected) {
      // ProseMirror may ignore the first synthetic transaction while the GPT
      // page is restoring focus. Re-apply once before treating this as a
      // boundary failure; never continue with attachments and no prompt.
      setComposerText(expected);
      applied = await waitFor(composerMatchesExpected, 15_000);
    }
    if (!applied) {
      throw productionBoundaryError("COMPOSER_DRAFT_NOT_SET", "GPT 输入框没有接收到本轮提示词，已停止发送，避免只上传附件或把下一轮混入当前帖");
    }
    rememberAutomationDraft(expected, owner);
    return true;
  }

  function waitFor(check, timeout = 4000) {
    const started = Date.now();
    return new Promise((resolve) => {
      const tick = () => {
        const value = check();
        if (value || Date.now() - started > timeout) return resolve(value || null);
        setTimeout(tick, 90);
      };
      tick();
    });
  }

  async function findFileInput() {
    const locate = () => document.querySelector('#upload-files:not(:disabled)')
      || document.querySelector('input[data-testid="upload-files-input"]:not(:disabled)');
    const existing = locate();
    if (existing) return existing;
    const attachmentButton = [...document.querySelectorAll("button")].find((button) => {
      const label = `${button.getAttribute("aria-label") || ""} ${button.title || ""}`;
      return /attach|add (?:photos|files)|upload|附件|添加文件|上传/i.test(label) && !button.disabled;
    });
    attachmentButton?.click();
    return waitFor(locate, 2500);
  }

  function attachmentPreviewCount() {
    const target = composer();
    // Narrow scope to the composer surface only — searching the entire form
    // picks up unrelated elements that appear after a DataTransfer assignment
    // but are not real attachment previews (caused 35 false positives for 7 files).
    const scope = target?.closest('[data-composer-surface]')
      || target?.closest("form")
      || target?.parentElement
      || document;
    const searchRoot = scope || document;
    // Only count elements with data-testid attributes that explicitly identify
    // attachment tiles/previews AND are visible in the DOM.
    // Class-based matching was removed because ChatGPT creates intermediate
    // elements during upload that match class patterns but aren't real previews.
    const previews = new Set();
    const matchedDetails = [];
    for (const el of searchRoot.querySelectorAll('[data-testid*="attachment-tile"], [data-testid*="file-tile"], [data-testid*="attachment-preview"]')) {
      if (el.offsetParent !== null || el.getClientRects().length > 0) {
        previews.add(el);
        matchedDetails.push({ src: "testid", testid: el.getAttribute("data-testid"), tag: el.tagName, cls: String(el.className || "").slice(0, 60) });
      }
    }
    // ChatGPT's new composer uses Tailwind group/file-tile class for attachment
    // tiles without data-testid attributes. This selector is specific enough to
    // avoid the false positives that plagued broader class-based matching.
    for (const el of searchRoot.querySelectorAll('[class*="group/file-tile"]')) {
      if (el.offsetParent !== null || el.getClientRects().length > 0) {
        previews.add(el);
        matchedDetails.push({ src: "class-file-tile", tag: el.tagName, cls: String(el.className || "").slice(0, 60) });
      }
    }
    for (const el of searchRoot.querySelectorAll('button[aria-label*="Remove attachment"], button[aria-label*="移除附件"], button[aria-label*="移除文件"], button[aria-label*="Remove file"]')) {
      if (el.offsetParent !== null || el.getClientRects().length > 0) {
        previews.add(el);
        matchedDetails.push({ src: "aria", aria: el.getAttribute("aria-label"), tag: el.tagName });
      }
    }
    // Diagnostic: log when count > 0 to help identify false positives
    if (previews.size > 0) {
      console.log("[TB attachmentPreviewCount]", { count: previews.size, details: matchedDetails.slice(0, 8) });
    }
    return previews.size;
  }

  function normalizeLocalAttachmentPath(value = "") {
    return String(value || "").trim().replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
  }

  function composerDraftText() {
    const target = composer();
    if (!target) return "";
    return String(target.value ?? target.innerText ?? target.textContent ?? "").trim();
  }

  // Mark drafts inserted by this extension so a restart/submit race does not
  // get mistaken for a user's unrelated unsent text.
  const AUTOMATION_DRAFT_KEY = "tb-gpt-automation-draft-v1";
  function normalizeDraft(value = "") {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
  function rememberAutomationDraft(text, owner = null) {
    const normalized = normalizeDraft(text);
    try {
      if (!normalized) sessionStorage.removeItem(AUTOMATION_DRAFT_KEY);
      else sessionStorage.setItem(AUTOMATION_DRAFT_KEY, JSON.stringify({
        text: normalized,
        ownerId: String(owner?.id || ""),
        ownerName: String(owner?.name || ""),
        at: Date.now()
      }));
    } catch (_) { /* sessionStorage can be unavailable in strict profiles */ }
  }
  function readAutomationDraft() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(AUTOMATION_DRAFT_KEY) || "null");
      if (!saved?.text) return null;
      if (Date.now() - Number(saved.at || 0) > 60 * 60 * 1000) {
        sessionStorage.removeItem(AUTOMATION_DRAFT_KEY);
        return null;
      }
      return saved;
    } catch (_) {
      return null;
    }
  }
  function clearAutomationDraftMarker() {
    try { sessionStorage.removeItem(AUTOMATION_DRAFT_KEY); } catch (_) { /* noop */ }
  }
  function isAutomationDraft(text, entry = null) {
    const current = normalizeDraft(text);
    if (!current) return false;
    const remembered = readAutomationDraft();
    const ownerMatches = Boolean(remembered && (!entry
      || (!remembered.ownerId && !remembered.ownerName)
      || (remembered.ownerId && remembered.ownerId === String(entry.id || ""))
      || (remembered.ownerName && remembered.ownerName === String(entry.name || ""))));
    if (ownerMatches) {
      const rememberedText = normalizeDraft(remembered.text);
      if (rememberedText && (current === rememberedText || current.includes(rememberedText) || rememberedText.includes(current))) return true;
    }
    // A failed send can happen after the DOM text was inserted but before the
    // sessionStorage marker is written.  The queue entry itself is the source
    // of truth then: a matching task prompt/material label is ours and may be
    // submitted.  Unrelated human drafts remain a hard boundary.
    const currentInstruction = entry
      ? normalizeDraft(entry.prompt || instruction(entry))
      : "";
    const materialLabel = entry ? String(entry.name || "").split(" × ").pop().trim() : "";
    return Boolean(entry?.externalRequestId && currentInstruction && (
      current.includes(normalizeDraft(currentInstruction.slice(0, 120)))
      || (materialLabel && current.includes(normalizeDraft(materialLabel.slice(0, 80))))
    ));
  }

  function looksLikeAutomationDraft(text = "") {
    const current = normalizeDraft(text);
    if (!current) return false;
    // A previous workbench task can leave its prompt in the ProseMirror
    // editor after a reload. Clear only our unmistakable workflow envelope;
    // arbitrary user text remains a hard queue boundary.
    return /(?:请按当前对话已经确定的母版和网页脚本处理这份团建内容|本地文件夹：|当前素材文件夹|本次附件全部是待迁移素材|请读取全部附件|继续使用当前 GPT 会话里已经沉淀好的母版环境|给我一份小红书文案)/.test(current);
  }

  function latestAutomationMaterialPrompt() {
    const turns = conversationRoleTurns();
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index];
      if (conversationTurnRole(turn) !== "user") continue;
      const text = normalizeDraft(turn.innerText || turn.textContent || "");
      if (isAutomationMaterialPrompt(text)) return text;
    }
    return "";
  }

  function readArchivedAutomationBoundary() {
    try {
      const value = JSON.parse(localStorage.getItem(ARCHIVED_BOUNDARY_KEY) || "null");
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  }

  function markArchivedAutomationBoundary(materialText = "") {
    const normalizedMaterial = normalizeDraft(materialText || latestAutomationMaterialPrompt());
    if (!normalizedMaterial) return;
    try {
      localStorage.setItem(ARCHIVED_BOUNDARY_KEY, JSON.stringify({
        conversationUrl: String(location.href || ""),
        materialText: normalizedMaterial,
        archivedAt: new Date().toISOString()
      }));
    } catch (_) { /* storage is best-effort; server history remains the second boundary */ }
  }

  function currentAutomationBoundarySnapshot() {
    const turns = conversationRoleTurns();
    let materialIndex = -1;
    let materialText = "";
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index];
      if (conversationTurnRole(turn) !== "user") continue;
      const text = normalizeDraft(turn.innerText || turn.textContent || "");
      if (isAutomationMaterialPrompt(text)) {
        materialIndex = index;
        materialText = text;
        break;
      }
    }
    if (materialIndex < 0) return null;
    if (isArchivedAutomationBoundary({
      currentUrl: String(location.href || ""),
      materialText,
      marker: readArchivedAutomationBoundary()
    })) return null;
    const after = turns.slice(materialIndex + 1);
    const userAfter = after
      .map((turn, index) => ({ turn, index }))
      .filter(({ turn }) => conversationTurnRole(turn) === "user");
    const copyRequest = userAfter.find(({ turn }) => /给我一份小红书文案|小红书文案/.test(normalizeDraft(turn.innerText || turn.textContent || "")));
    if (copyRequest) {
      const laterAssistants = after.slice(copyRequest.index + 1)
        .filter((turn) => conversationTurnRole(turn) === "assistant");
      const latestCopy = cleanAssistantText(laterAssistants.at(-1));
      if (isLikelyPublishCopy(latestCopy, 300) && !generatingNow()) {
        const imageUrls = freshImageUrls(after.slice(0, copyRequest.index + 1));
        return { stage: "completed-copy-pending-package", materialText, materialIndex, copyText: latestCopy, imageUrls };
      }
      return { stage: "waiting-copy", materialText, materialIndex, copyText: "" };
    }
    const confirm = userAfter.find(({ turn }) => /^1\s*$/.test(normalizeDraft(turn.innerText || turn.textContent || "")));
    if (confirm) {
      const laterAssistants = after.slice(confirm.index + 1)
        .filter((turn) => conversationTurnRole(turn) === "assistant");
      const imageUrls = freshImageUrls(laterAssistants);
      const latestAssistant = laterAssistants.at(-1);
      const risk = generatedOutputRisk(latestAssistant);
      if (risk.hardFailure) return { stage: "generation-limit-or-script", materialText, materialIndex, imageUrls, risk };
      if (imageUrls.length) {
        const evidence = generatedImageCompletionEvidence(imageUrls);
        return {
          stage: evidence?.responseComplete ? "images-ready" : "waiting-images",
          materialText,
          materialIndex,
          imageUrls,
          evidence
        };
      }
      return { stage: "waiting-images", materialText, materialIndex, imageUrls: [] };
    }
    const latestPlan = [...after].reverse().find((turn) => {
      if (conversationTurnRole(turn) !== "assistant") return false;
      const text = cleanAssistantText(turn);
      return text.length >= 80 && /迁移计划|逐页|P\s*1|第\s*1\s*页/i.test(text);
    });
    if (latestPlan) return { stage: "plan-ready", materialText, materialIndex, planText: cleanAssistantText(latestPlan) };
    return { stage: "waiting-plan", materialText, materialIndex };
  }

  function patrolConversationLinks() {
    const seen = new Map();
    for (const anchor of document.querySelectorAll('a[href^="/c/"], a[href*="chatgpt.com/c/"]')) {
      const rawHref = String(anchor.getAttribute("href") || "").trim();
      let url = "";
      try { url = new URL(rawHref, location.origin).href.split(/[?#]/)[0]; } catch { continue; }
      if (!/^https:\/\/(?:chatgpt\.com|chat\.openai\.com)\/c\//i.test(url)) continue;
      const title = String(anchor.getAttribute("aria-label") || anchor.getAttribute("title") || anchor.innerText || anchor.textContent || "")
        .replace(/\s+/g, " ").trim();
      if (!title || seen.has(url)) continue;
      seen.set(url, {
        title,
        url,
        current: anchor.getAttribute("aria-current") === "page" || url === String(location.href || "").split(/[?#]/)[0]
      });
    }
    return [...seen.values()];
  }

  function patrolSidebarScrollContainers() {
    const containers = new Set();
    for (const anchor of document.querySelectorAll('a[href^="/c/"], a[href*="chatgpt.com/c/"]')) {
      let node = anchor.parentElement;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (/(?:auto|scroll)/.test(`${style.overflowY} ${style.overflow}`) && node.scrollHeight > node.clientHeight + 8) {
          containers.add(node);
          break;
        }
        node = node.parentElement;
      }
    }
    return [...containers];
  }

  async function discoverPatrolConversations(options = {}) {
    const denylist = Array.isArray(options.denylist) ? options.denylist : [];
    const maximumScrolls = Math.max(0, Math.min(40, Number(options.maximumScrolls ?? 16)));
    const settleMs = Math.max(100, Math.min(1500, Number(options.settleMs ?? 350)));
    const found = new Map();
    const remember = () => patrolConversationLinks().forEach((item) => found.set(item.url, item));
    remember();
    const containers = patrolSidebarScrollContainers();
    const originalPositions = containers.map((node) => ({ node, top: node.scrollTop }));
    let scrollPasses = 0;
    try {
      for (; scrollPasses < maximumScrolls; scrollPasses += 1) {
        const before = found.size;
        let moved = false;
        for (const node of containers) {
          const next = Math.min(node.scrollHeight, node.scrollTop + Math.max(node.clientHeight * 0.85, 320));
          if (next > node.scrollTop + 2) {
            node.scrollTop = next;
            node.dispatchEvent(new Event("scroll", { bubbles: true }));
            moved = true;
          }
        }
        if (!moved) break;
        await new Promise((resolve) => setTimeout(resolve, settleMs));
        remember();
        const allAtBottom = containers.every((node) => node.scrollTop + node.clientHeight >= node.scrollHeight - 8);
        if (allAtBottom && found.size === before) break;
      }
    } finally {
      originalPositions.forEach(({ node, top }) => {
        node.scrollTop = top;
        node.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
    }
    // The extension-ready marker is installed before ChatGPT has restored a
    // long conversation after desktop restart. Do not classify an empty DOM
    // as "awaiting material"; wait for the real conversation turns first.
    if (/\/c\//.test(String(location.pathname || "")) && conversationRoleTurns().length === 0) {
      const turnDeadline = Date.now() + 20_000;
      while (Date.now() < turnDeadline && conversationRoleTurns().length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    const latestRestoredAssistant = [...conversationRoleTurns()].reverse()
      .find((turn) => conversationTurnRole(turn) === "assistant") || null;
    if (/Worked for|已完成|处理完成/i.test(String(latestRestoredAssistant?.innerText || ""))
      && latestRestoredAssistant?.querySelectorAll?.("img")?.length === 0) {
      const imageHydrationDeadline = Date.now() + 20_000;
      while (Date.now() < imageHydrationDeadline
        && latestRestoredAssistant.isConnected
        && latestRestoredAssistant.querySelectorAll("img").length === 0
        && latestRestoredAssistant.querySelectorAll(".cgpt-conversation-tree-image-download-all").length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    const currentState = conversationStateSnapshot();
    const conversations = [...found.values()].map((item) => ({
      ...classifyPatrolConversationCandidate({ ...item, denylist }),
      current: item.current,
      currentState: item.current ? currentState : null
    }));
    return {
      readOnly: true,
      scannedAt: new Date().toISOString(),
      scrollPasses,
      discoveredCount: conversations.length,
      templateCount: conversations.filter((item) => item.titleMatched).length,
      eligibleCount: conversations.filter((item) => item.eligible).length,
      conversations
    };
  }
  globalThis.TeambuildingGptPatrolDiscover = discoverPatrolConversations;

  // A small, side-effect-free state probe shared by the workbench scheduler
  // and the visible production log. It deliberately reports evidence instead
  // of guessing a next action: the queue may only advance when the caller has
  // a matching material turn and the current stage is complete.
  function conversationStateSnapshot() {
    const turns = conversationRoleTurns();
    const latestAssistant = [...turns].reverse().find((turn) => conversationTurnRole(turn) === "assistant") || null;
    const latestAssistantText = latestAssistant ? cleanAssistantText(latestAssistant) : "";
    const boundary = currentAutomationBoundarySnapshot();
    const currentLink = patrolConversationLinks().find((item) => item.current);
    const conversationLabel = String(currentLink?.title || document.title || "")
      .replace(/\s+-\s+ChatGPT\s*$/i, "").trim();
    const latestImages = boundary?.imageUrls?.length
      ? boundary.imageUrls
      : (latestAssistant ? freshImageUrls([latestAssistant]) : []);
    const hasCopy = Boolean(boundary?.copyText && isLikelyPublishCopy(boundary.copyText, 300));
    const hasPlan = Boolean(boundary?.stage === "plan-ready" || /\u8fc1\u79fb\u8ba1\u5212|\u9010\u9875|\bP\s*1\b/i.test(latestAssistantText));
    const waitingForConfirm = Boolean(boundary?.stage === "plan-ready"
      || /(?:\u56de\u590d|\u8f93\u5165|reply|respond)[^\n]{0,18}\b1\b/i.test(latestAssistantText));
    const generated = latestImages.length > 0;
    const risk = generatedOutputRisk(latestAssistant);
    const templateConversation = /\u6a21\u677f|\u6bcd\u7248/i.test(conversationLabel) && !/\u6e38\u620f/i.test(conversationLabel);
    const currentUrl = String(location.href || "").split(/[?#]/)[0];
    const patrolRecord = readPatrolActionLedger()[currentUrl] || {};
    const archivedByPatrol = !boundary
      && patrolRecord.lastAction === "download-and-package"
      && Boolean(String(patrolRecord.packagePath || "").trim());
    const stage = archivedByPatrol ? "archived" : boundary?.stage
      || (hasCopy ? "completed-copy-pending-package" : waitingForConfirm ? "plan-ready" : generated ? "images-ready" : "unknown");
    const expectedImageCount = parsePlannedImageCount(boundary?.planText || latestAssistantText);
    const patrolState = classifyPatrolStage({
      stage,
      hasMaterialBoundary: Boolean(boundary),
      imageCount: latestImages.length,
      expectedImageCount,
      generating: Boolean(generatingNow()),
      hasCopy
    });
    const evidenceDiagnostic = {
      turnCount: turns.length,
      roles: turns.slice(-6).map((turn) => conversationTurnRole(turn)),
      boundaryStage: String(boundary?.stage || ""),
      latestAssistantCandidateImages: latestAssistant ? freshImageUrls([latestAssistant]).length : 0,
      latestAssistantDomImages: latestAssistant?.querySelectorAll?.("img")?.length || 0,
      latestAssistantBatchButtons: latestAssistant?.querySelectorAll?.(".cgpt-conversation-tree-image-download-all")?.length || 0
    };
    return {
      stage,
      patrolState,
      conversationLabel,
      templateConversation,
      latestAssistantText,
      latestImageCount: latestImages.length,
      expectedImageCount,
      hasPlan,
      waitingForConfirm,
      generated,
      hasCopy,
      scriptOutput: Boolean(risk.scriptOutput),
      scriptOutputLimitSignal: Boolean(risk.scriptOutputLimitSignal),
      limitSignal: Boolean(risk.hasRetrySignal),
      pyScriptFallbackSignal: Boolean(risk.pyScriptFallbackSignal),
      lowImageLimit: Boolean(risk.lowImageLimit),
      canInjectNext: stage === "archived" || (stage === "unknown" && !generated && !waitingForConfirm),
      evidenceDiagnostic
    };
  }
  globalThis.TeambuildingGptConversationStateSnapshot = conversationStateSnapshot;

  function readPatrolActionLedger() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PATROL_ACTION_LEDGER_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writePatrolActionLedger(ledger) {
    try { localStorage.setItem(PATROL_ACTION_LEDGER_KEY, JSON.stringify(ledger || {})); } catch { /* private mode */ }
  }

  async function reportPatrolPackageCompletion(packageTask, details = {}) {
    const packagePath = String(details.packagePath || "").trim();
    const downloadedImages = Math.max(0, Number(details.downloadedImages || 0));
    const copyTextLength = String(details.copyText || "").trim().length;
    const archivePath = String(details.archivePath || "").trim();
    const productionRequestId = String(packageTask?.entry?.externalRequestId || "").trim();
    const downloadedFiles = Array.isArray(details.downloadedFiles) ? details.downloadedFiles.filter(Boolean) : [];
    if (productionRequestId && packagePath) {
      const saved = await api(`/api/gpt-production/checkpoint?requestId=${encodeURIComponent(productionRequestId)}`).catch(() => null);
      await api("/api/gpt-production/checkpoint", {
        method: "POST",
        body: JSON.stringify({
          requestId: productionRequestId,
          checkpoint: {
            ...(saved?.checkpoint || {}),
            stage: "作品归档完成",
            percent: 100,
            plannedImageCount: Math.max(downloadedImages, Number(packageTask?.workflow?.plannedImageCount || 0)),
            generatedImageUrls: packageTask?.workflow?.generatedImageUrls || saved?.checkpoint?.generatedImageUrls || [],
            downloadedFiles,
            downloadRoot: String(details.downloadRoot || packageTask?.entry?.autoOptions?.downloadRoot || ""),
            copyText: String(details.copyText || ""),
            packagePath
          }
        })
      }).catch(() => null);
    }
    reportWorkbenchProgress(
      packageTask,
      "作品归档完成",
      100,
      packagePath ? `巡检续接作品已核对并保存到 ${packagePath}` : "巡检续接作品已完成",
      "completed"
    );
    reportWorkbenchTask(packageTask, "success", "巡检续接作品已完成下载、打包和素材归档", {
      taskType: "material",
      downloadedImages,
      plannedImageCount: Math.max(downloadedImages, Number(packageTask?.workflow?.plannedImageCount || 0)),
      batchId: String(details.batchId || packageTask?.workflow?.batchId || ""),
      packagePath,
      packageValid: Boolean(packagePath),
      downloadRoot: String(details.downloadRoot || packageTask?.entry?.autoOptions?.downloadRoot || ""),
      copyTextLength,
      archivePath,
      conversationUrl: String(details.conversationUrl || location.href)
    });
  }

  async function executePatrolSingleStep(options = {}) {
    const currentUrl = String(location.href || "").split(/[?#]/)[0];
    const targetUrl = String(options.targetUrl || currentUrl).split(/[?#]/)[0];
    if (!/^https:\/\/(?:chatgpt\.com|chat\.openai\.com)\/c\//i.test(currentUrl) || currentUrl !== targetUrl) {
      return { ok: false, acted: false, reason: "target-conversation-not-current", currentUrl, targetUrl };
    }

    // Electron considers the page loaded before ChatGPT has restored the
    // conversation title and semantic turns. Acting against that short empty
    // window produces a harmless but confusing "production-title-required"
    // result, so continuation waits for the real conversation boundary too.
    if (conversationRoleTurns().length === 0) {
      const restoreDeadline = Date.now() + 20_000;
      while (Date.now() < restoreDeadline && conversationRoleTurns().length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    const snapshot = conversationStateSnapshot();
    const candidate = classifyPatrolConversationCandidate({
      title: snapshot.conversationLabel,
      url: currentUrl,
      denylist: Array.isArray(options.denylist) ? options.denylist : []
    });
    if (options.inspectOnly) {
      return { ok: true, acted: false, reason: "inspection-only", candidate, snapshot };
    }
    const ledger = readPatrolActionLedger();
    const record = ledger[currentUrl] && typeof ledger[currentUrl] === "object" ? ledger[currentUrl] : {};
    const generationRequestCount = Math.max(
      0,
      Number(record.generationRequestCount || 0),
      Number(options.generationRequestCount || 0)
    );
    if (record.packagePath && options.requestId) {
      const replayImageCount = Math.max(0, Number(record.downloadedImages || snapshot.latestImageCount || 0));
      const replayTask = {
        status: "success",
        entry: {
          externalRequestId: String(options.requestId),
          name: String(options.materialName || snapshot.conversationLabel || "巡检续接作品"),
          materialPath: String(options.sourceMaterialPath || ""),
          autoOptions: { downloadRoot: String(options.downloadRoot || "") }
        },
        workflow: {
          batchId: String(record.batchId || ""),
          plannedImageCount: replayImageCount,
          generatedImageUrls: Array.from({ length: replayImageCount }, (_, index) => `replayed-${index + 1}`)
        }
      };
      await reportPatrolPackageCompletion(replayTask, {
        packagePath: record.packagePath,
        downloadedImages: replayImageCount,
        copyText: String(record.copyText || snapshot.latestAssistantText || ""),
        batchId: String(record.batchId || ""),
        downloadRoot: String(options.downloadRoot || ""),
        archivePath: String(record.archivePath || ""),
        conversationUrl: currentUrl
      });
      return {
        ok: true,
        acted: false,
        reason: "already-packaged",
        productionRequestId: String(options.requestId || ""),
        candidate,
        snapshot,
        generationRequestCount,
        packagePath: String(record.packagePath),
        downloadedImages: replayImageCount,
        copyTextLength: String(record.copyText || snapshot.latestAssistantText || "").trim().length
      };
    }
    const decision = decidePatrolSingleStep({
      candidate,
      patrolState: snapshot.patrolState,
      generating: Boolean(generatingNow()),
      composerReady: Boolean(composer()),
      composerEmpty: !normalizeDraft(composerDraftText()),
      generationRequestCount,
      maximumGenerationRequests: Number(options.maximumGenerationRequests || 5)
    });
    if (!decision.allowed) {
      return { ok: true, acted: false, reason: decision.reason, decision, candidate, snapshot, generationRequestCount };
    }
    if (record.lastAction === decision.action
      && record.lastStage === snapshot.stage
      && Date.now() - Number(record.lastActionAt || 0) < 60_000) {
      return { ok: true, acted: false, reason: "duplicate-action-guard", decision, candidate, snapshot, generationRequestCount };
    }

    if (decision.action === "download-and-package") {
      const copyText = String(snapshot?.currentBoundary?.copyText || currentAutomationBoundarySnapshot()?.copyText || "").trim();
      let imageUrls = Array.isArray(currentAutomationBoundarySnapshot()?.imageUrls)
        ? currentAutomationBoundarySnapshot().imageUrls
        : [];
      let recoveryCheckpoint = null;
      if (options.requestId) {
        const saved = await api(`/api/gpt-production/checkpoint?requestId=${encodeURIComponent(options.requestId)}`).catch(() => null);
        recoveryCheckpoint = saved?.checkpoint || null;
        imageUrls = preferredRecoveryImageUrls(imageUrls, recoveryCheckpoint?.generatedImageUrls || []);
      }
      const expectedRecoveryImages = Math.max(
        0,
        Number(recoveryCheckpoint?.plannedImageCount || 0),
        Number(recoveryCheckpoint?.detectedImageCount || 0)
      );
      if (expectedRecoveryImages && imageUrls.length < expectedRecoveryImages) {
        return {
          ok: true,
          acted: false,
          reason: "recovery-image-set-incomplete",
          decision,
          candidate,
          snapshot,
          generationRequestCount,
          detectedImages: imageUrls.length,
          expectedImages: expectedRecoveryImages
        };
      }
      if (!isLikelyPublishCopy(copyText, 300)) {
        return { ok: true, acted: false, reason: "publish-copy-not-ready", decision, candidate, snapshot, generationRequestCount };
      }
      if (!imageUrls.length) {
        return { ok: true, acted: false, reason: "generated-images-not-ready", decision, candidate, snapshot, generationRequestCount };
      }
      const sourceMaterialPath = String(options.sourceMaterialPath || "").trim();
      const materialName = String(options.materialName || sourceMaterialPath.split(/[\\/]/).pop() || snapshot.conversationLabel || "巡检续接作品").trim();
      const batchId = workPackageBatchId();
      const downloadRoot = String(options.downloadRoot || "").trim();
      const packageTask = {
        status: "running",
        entry: {
          externalRequestId: String(options.requestId || `patrol-${batchId}`),
          name: materialName,
          materialPath: sourceMaterialPath,
          autoOptions: { downloadRoot }
        },
        workflow: {
          batchId,
          textSubmitted: true,
          plannedImageCount: imageUrls.length,
          generatedImageUrls: imageUrls
        }
      };
      const copyFile = await globalThis.TeambuildingGptProductionSaveCopyText({ copyText, batchId, downloadRoot });
      const downloadResult = await downloadFreshImages(imageUrls, packageTask);
      const packageResult = await packageDownloadedReply({
        clipboardText: copyText,
        title: materialName,
        conversationUrl: currentUrl,
        accountName: localStorage.getItem("tb-workbench-account-id") || "",
        sourceMaterialPath,
        batchId: downloadResult.batchId,
        expectedImageCount: downloadResult.count,
        downloadRoot: String(downloadResult.files?.[0] || "").replace(/[\\/][^\\/]+$/, "") || downloadRoot,
        productRoot: String(options.productRoot || "").trim()
      });
      let archiveResult = null;
      if (!packageResult?.duplicate && options.autoArchive !== false && sourceMaterialPath) {
        const archiveResponse = await api("/api/gpt-production/archive-material", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryPath: sourceMaterialPath,
            requestId: String(options.requestId || `patrol-${batchId}`),
            templateId: String(options.templateId || ""),
            conversationUrl: currentUrl,
            packagePath: String(packageResult?.packagePath || "")
          })
        });
        if (!archiveResponse?.ok) throw new Error(archiveResponse?.error || "作品已生成，但素材归档失败");
        archiveResult = archiveResponse.archive || null;
      }
      markArchivedAutomationBoundary();
      const archivePath = String(archiveResult?.to || "");
      ledger[currentUrl] = {
        generationRequestCount,
        lastAction: decision.action,
        lastStage: snapshot.stage,
        lastActionAt: Date.now(),
        packagePath: String(packageResult?.packagePath || ""),
        batchId: String(downloadResult.batchId || batchId),
        downloadedImages: Number(downloadResult.count || 0),
        copyText,
        copyTextPath: String(copyFile?.filename || ""),
        archivePath
      };
      writePatrolActionLedger(ledger);
      logConversationEvent("text-saved", {
        requestId: String(options.requestId || ""),
        materialName,
        step: "patrol-package/save-text",
        copyTextPath: String(copyFile?.filename || ""),
        meta: { copyLength: copyText.length }
      });
      logConversationEvent("images-downloaded", {
        requestId: String(options.requestId || ""),
        materialName,
        step: "patrol-package/download-images",
        imageUrls,
        downloadedFiles: Array.isArray(downloadResult.files) ? downloadResult.files : [],
        meta: { count: Number(downloadResult.count || 0), downloadRoot }
      });
      logConversationEvent("archived", {
        requestId: String(options.requestId || ""),
        materialName,
        step: "patrol-package/archive",
        copyTextPath: String(copyFile?.filename || ""),
        packagePath: String(packageResult?.packagePath || ""),
        meta: { imageCount: Number(downloadResult.count || 0), batchId: downloadResult.batchId || batchId }
      });
      await reportPatrolPackageCompletion(packageTask, {
        packagePath: String(packageResult?.packagePath || ""),
        downloadedImages: Number(downloadResult.count || 0),
        copyText,
        downloadedFiles: Array.isArray(downloadResult.files) ? downloadResult.files : [],
        batchId: String(downloadResult.batchId || batchId),
        downloadRoot,
        archivePath,
        conversationUrl: currentUrl
      });
      return {
        ok: true,
        acted: true,
        action: decision.action,
        reason: "completed",
        productionRequestId: String(options.requestId || ""),
        candidate,
        snapshot,
        generationRequestCount,
        downloadedImages: downloadResult.count,
        copyTextPath: String(copyFile?.filename || ""),
        packageResult,
        archiveResult
      };
    }

    const text = decision.action === "send-confirm"
      ? String(options.confirmText || "1").trim() || "1"
      : normalizePublishCopyPrompt(options.copyPrompt || DEFAULT_PUBLISH_COPY_PROMPT);
    await replaceComposerText(text);
    await submitComposer();
    clearComposerDraft();

    const nextGenerationRequestCount = generationRequestCount + (decision.action === "send-confirm" ? 1 : 0);
    ledger[currentUrl] = {
      generationRequestCount: nextGenerationRequestCount,
      lastAction: decision.action,
      lastStage: snapshot.stage,
      lastActionAt: Date.now()
    };
    writePatrolActionLedger(ledger);
    return {
      ok: true,
      acted: true,
      action: decision.action,
      reason: "completed",
      candidate,
      snapshot,
      generationRequestCount: nextGenerationRequestCount
    };
  }
  globalThis.TeambuildingGptPatrolContinue = executePatrolSingleStep;

  async function findPendingRemoteProduction() {
    const history = await api("/api/gpt-production/history").catch(() => null);
    const items = Array.isArray(history?.items) ? history.items : [];
    const currentUrl = String(location.href || "");
    return items.find((item) => String(item?.conversationUrl || "") === currentUrl
      && !String(item?.packagePath || "").trim()
      && Number(item?.downloadedImageCount || 0) > 0
      && !/作品打包完成|完成$/.test(String(item?.stage || ""))) || null;
  }

  function automationPromptMatchesEntry(promptText, entry) {
    const prompt = normalizeDraft(promptText);
    if (!prompt || !entry?.externalRequestId) return false;
    const expected = normalizeDraft(entry.prompt || instruction(entry));
    const materialName = String(entry.materialPath || entry.name || "").split(/[\\/]/).pop().trim();
    return Boolean((expected && (prompt === expected || prompt.includes(expected.slice(0, 120))))
      || (materialName && prompt.includes(normalizeDraft(materialName))));
  }

  function productionBoundaryError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function assertSinglePostAttachmentBoundary(entry, paths = []) {
    if (entry?.taskType !== "material" && entry?.entryKind !== "material") return;
    const materialRoot = normalizeLocalAttachmentPath(entry.materialPath || entry.path);
    if (!materialRoot) throw productionBoundaryError("MATERIAL_ROOT_MISSING", "当前素材任务缺少帖子文件夹路径，已阻止上传");
    const prefix = `${materialRoot}\\`;
    const outside = paths.filter((filePath) => {
      const normalized = normalizeLocalAttachmentPath(filePath);
      return normalized !== materialRoot && !normalized.startsWith(prefix);
    });
    if (outside.length) {
      throw productionBoundaryError("MIXED_POST_ATTACHMENTS", `检测到 ${outside.length} 个文件不属于当前帖子文件夹，已阻止混合上传`);
    }
  }

  async function loadFiles(paths, task) {
    const files = [];
    task.status = "reading";
    task.total = paths.length;
    task.completed = 0;
    renderQueue();
    for (let index = 0; index < paths.length; index += 1) {
      if (task.controller.signal.aborted) throw new DOMException("上传已取消", "AbortError");
      setStatus(`正在读取 ${index + 1}/${paths.length}`);
      const response = await readLocalFile(paths[index], "base64", task.controller.signal);
      const binary = atob(response.data);
      const bytes = new Uint8Array(binary.length);
      for (let byteIndex = 0; byteIndex < binary.length; byteIndex += 1) {
        bytes[byteIndex] = binary.charCodeAt(byteIndex);
      }
      const blob = new Blob([bytes], { type: response.contentType || "application/octet-stream" });
      files.push(new File([blob], fileName(paths[index]), { type: blob.type || "application/octet-stream" }));
      task.completed = index + 1;
      renderQueue();
    }
    return files;
  }

  function instruction(entry) {
    return resolveEntryInstruction(entry);
  }

  async function checkEntryDuplicate(entry, task) {
    const textPath = (entry.attachments || []).find((filePath) => /\.(txt|md)$/i.test(filePath));
    if (!textPath) return null;
    task.status = "checking";
    renderQueue();
    const source = await readLocalFile(textPath, "text", task.controller.signal);
    const text = source.data;
    if (!text.trim()) return null;
    return api("/api/dedup/check-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
  }

  async function checkMaterialUsage(entry, task) {
    if (entry.entryKind !== "material") return null;
    task.status = "checking";
    renderQueue();
    return api("/api/extension/material-usage-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryPath: entry.path })
    });
  }

  async function recordMaterialUsage(entry, status) {
    if (entry.entryKind !== "material") return null;
    const payload = await api("/api/extension/material-use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entryPath: entry.path,
        name: entry.name,
        status,
        conversationUrl: location.href
      })
    });
    entry.usage = payload.record;
    if (status === "used") {
      entry.usageCount = Math.max(0, Number(entry.usageCount || 0)) + 1;
      entry.usageSource = "历史日志 + 扩展实时记录";
      const indexed = (state.materialIndex?.items || []).find((item) => item.id === entry.id);
      if (indexed && indexed !== entry) {
        indexed.usageCount = entry.usageCount;
        indexed.usageSource = entry.usageSource;
      }
      recalculateLocalIndexStats();
    }
    renderBody();
    return payload.record;
  }

  function composerContainsEntry(entry) {
    const target = composer();
    const value = target?.value || target?.innerText || target?.textContent || "";
    return Boolean(entry && value && (value.includes(entry.path) || value.includes(entry.name)));
  }

  function commitPendingMaterialUsage() {
    const entry = state.pendingUsage;
    if (!entry || !composerContainsEntry(entry)) return;
    clearTimeout(state.usageCommitTimer);
    state.usageCommitTimer = setTimeout(async () => {
      try {
        await recordMaterialUsage(entry, "used");
        state.pendingUsage = null;
        setStatus(`已登记使用：${entry.name}`, "success");
      } catch (error) {
        setStatus(`素材已发送，但台账登记失败：${error.message}`, "danger");
      }
    }, 700);
  }

  function reportWorkbenchTask(task, status, detail = "", extra = {}) {
    const requestId = task?.entry?.externalRequestId;
    if (!requestId) return;
    document.documentElement.dataset.tbGptLastTask = `${requestId}:${status}`;
    const now = Date.now();
    const metrics = task.metrics || {};
    if (metrics.current && !metrics.current.endedAt) {
      metrics.current.endedAt = new Date(now).toISOString();
      metrics.current.durationMs = now - metrics.current.startedMs;
    }
    const result = {
      source: "tb-gpt-production-extension",
      type: "tb-workbench-task-result",
      requestId,
      status,
      detail: String(detail || ""),
      startedAt: metrics.startedAt || "",
      endedAt: new Date(now).toISOString(),
      elapsedMs: metrics.startedMs ? now - metrics.startedMs : 0,
      stageHistory: Array.isArray(metrics.history) ? metrics.history : [],
      ...(extra && typeof extra === "object" ? extra : {})
    };
    let bridge = document.getElementById("tb-workbench-bridge-result");
    if (!bridge) {
      bridge = document.createElement("script");
      bridge.id = "tb-workbench-bridge-result";
      bridge.type = "application/json";
      document.documentElement.appendChild(bridge);
    }
    bridge.textContent = JSON.stringify(result);
    document.dispatchEvent(new Event("tb-workbench-task-result"));
    window.postMessage(result, "*");
  }

  function reportWorkbenchProgress(task, stage, percent, detail = "", progressStatus = "running") {
    const requestId = task?.entry?.externalRequestId;
    if (!requestId) return;
    const now = Date.now();
    const stageName = String(stage || "");
    if (!task.metrics) task.metrics = { startedMs: now, startedAt: new Date(now).toISOString(), history: [], current: null };
    if (!task.metrics.current || task.metrics.current.stage !== stageName) {
      if (task.metrics.current && !task.metrics.current.endedAt) {
        task.metrics.current.endedAt = new Date(now).toISOString();
        task.metrics.current.durationMs = now - task.metrics.current.startedMs;
      }
      task.metrics.current = {
        stage: stageName,
        status: "running",
        startedMs: now,
        startedAt: new Date(now).toISOString(),
        waiting: /等待|生成图片|生成小红书文案/i.test(stageName)
      };
      task.metrics.history.push(task.metrics.current);
    }
    task.lastStage = stageName;
    task.lastPercent = Math.max(0, Math.min(100, Number(percent || 0)));
    const terminal = progressStatus !== "running";
    if (terminal && task.metrics.current && !task.metrics.current.endedAt) {
      task.metrics.current.status = progressStatus;
      task.metrics.current.endedAt = new Date(now).toISOString();
      task.metrics.current.durationMs = now - task.metrics.current.startedMs;
    }
    const result = {
      source: "tb-gpt-production-extension",
      type: "tb-workbench-task-progress",
      requestId,
      runId: String(task.entry.runId || requestId.split(":")[0] || requestId),
      taskId: requestId,
      browserId: String(task.entry.accountId || localStorage.getItem("tb-workbench-account-id") || ""),
      material: String(task.entry.name || ""),
      stage: stageName,
      status: progressStatus,
      percent: task.lastPercent,
      detail: String(detail || ""),
      uploadedAttachments: Number(task.entry.uploadedAttachments || 0),
      generatedImages: Number(task.workflow?.generatedImageUrls?.length || task.entry.generatedImages || 0),
      expectedImages: Number(task.workflow?.plannedImageCount || task.entry.expectedImages || 0),
      startedAt: task.metrics.startedAt,
      stageStartedAt: task.metrics.current.startedAt,
      elapsedMs: now - task.metrics.startedMs,
      retryCount: Number(task.entry.retryCount || 0)
    };
    let bridge = document.getElementById("tb-workbench-bridge-progress");
    if (!bridge) {
      bridge = document.createElement("script");
      bridge.id = "tb-workbench-bridge-progress";
      bridge.type = "application/json";
      document.documentElement.appendChild(bridge);
    }
    bridge.textContent = JSON.stringify(result);
    document.dispatchEvent(new Event("tb-workbench-task-progress"));
    window.postMessage(result, "*");
  }

  function assistantTurns() {
    const semanticTurns = [...document.querySelectorAll('[data-turn="assistant"]')]
      .filter((turn) => !turn.parentElement?.closest?.('[data-turn]'));
    if (semanticTurns.length) return semanticTurns;
    const outerTurns = [...document.querySelectorAll('[data-testid^="conversation-turn"]')];
    if (outerTurns.length) {
      return outerTurns
        .filter((turn) => !turn.querySelector('[data-message-author-role="user"]'))
        .map((turn) => turn.querySelector('[data-message-author-role="assistant"], article[data-turn="assistant"]') || turn);
    }

    const roleTurns = [...document.querySelectorAll('[data-message-author-role="assistant"]')]
      .filter((turn) => !turn.parentElement?.closest?.('[data-message-author-role]'));
    if (roleTurns.length) return roleTurns;
    return [...document.querySelectorAll('[data-turn="assistant"]')];
  }

  function latestUserTurnWrapper() {
    const users = [...document.querySelectorAll('[data-message-author-role="user"]')];
    return users.at(-1)?.closest?.('[data-testid^="conversation-turn"]') || users.at(-1) || null;
  }

  function assistantTurnsAfter(afterTurn) {
    if (!afterTurn?.isConnected) return [];
    const outerTurns = [...document.querySelectorAll('[data-testid^="conversation-turn"]')];
    const anchorIndex = outerTurns.indexOf(afterTurn.closest?.('[data-testid^="conversation-turn"]') || afterTurn);
    if (anchorIndex < 0) return [];
    return outerTurns.slice(anchorIndex + 1)
      .filter((turn) => !turn.querySelector('[data-message-author-role="user"]'))
      .map((turn) => turn.querySelector('[data-message-author-role="assistant"], article[data-turn="assistant"]') || turn);
  }

  function conversationRoleTurns() {
    const semanticTurns = [...document.querySelectorAll('[data-turn="user"], [data-turn="assistant"]')]
      .filter((turn) => !turn.parentElement?.closest?.('[data-turn]'));
    if (semanticTurns.length) return semanticTurns;
    return [...document.querySelectorAll('[data-message-author-role="user"], [data-message-author-role="assistant"]')]
      .filter((turn) => !turn.parentElement?.closest?.('[data-message-author-role]'));
  }

  function conversationTurnRole(turn) {
    return String(turn?.getAttribute?.("data-turn") || turn?.getAttribute?.("data-message-author-role") || "").trim();
  }

  function latestCopyTurnAfterPrompt(copyPrompt = DEFAULT_PUBLISH_COPY_PROMPT, options = {}) {
    const turns = conversationRoleTurns();
    const promptNeedle = normalizePublishCopyPrompt(copyPrompt).replace(/\s/g, "");
    const minimum = Math.max(1, Number(options.minimum || 300));
    const keywordPattern = String(options.keywordPattern || "").trim();
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index];
      if (conversationTurnRole(turn) !== "user") continue;
      const userText = String(turn.innerText || turn.textContent || "").replace(/\s/g, "");
      if (!userText.includes(promptNeedle) && !/小红书文案/.test(userText)) continue;
      for (let cursor = index + 1; cursor < turns.length; cursor += 1) {
        const candidate = turns[cursor];
        const role = conversationTurnRole(candidate);
        if (role === "user") break;
        const text = cleanAssistantText(candidate);
        if (role === "assistant" && (isLikelyPublishCopy(text, minimum) || completionKeywordDetected(text, { action: "wait-copy", keywordPattern }).matched)) return candidate;
      }
    }
    // ChatGPT can compact or virtualize older user turns after a reload while
    // keeping the assistant reply in the DOM. In that case the pairing marker
    // is missing, but a strict publish-copy predicate still lets us recover the
    // finished copy without confusing a migration plan for publishable text.
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const candidate = turns[index];
      if (conversationTurnRole(candidate) !== "assistant") continue;
      const text = cleanAssistantText(candidate);
      if (isLikelyPublishCopy(text, minimum) || completionKeywordDetected(text, { action: "wait-copy", keywordPattern }).matched) return candidate;
    }
    return null;
  }

  function latestPairedCopyTurn(copyPrompt = DEFAULT_PUBLISH_COPY_PROMPT, options = {}) {
    const turns = conversationRoleTurns();
    const promptNeedle = normalizePublishCopyPrompt(copyPrompt).replace(/\s/g, "");
    const minimum = Math.max(1, Number(options.minimum || 300));
    const keywordPattern = String(options.keywordPattern || "").trim();
    let promptIndex = -1;
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index];
      if (conversationTurnRole(turn) !== "user") continue;
      const userText = String(turn.innerText || turn.textContent || "").replace(/\s/g, "");
      if (userText.includes(promptNeedle) || /小红书.{0,8}文案|文案.{0,8}小红书/.test(userText)) {
        promptIndex = index;
        break;
      }
    }
    if (promptIndex < 0) return null;
    for (let cursor = promptIndex + 1; cursor < turns.length; cursor += 1) {
      const candidate = turns[cursor];
      const role = conversationTurnRole(candidate);
      if (role === "user") break;
      const text = cleanAssistantText(candidate);
      if (role === "assistant" && (isLikelyPublishCopy(text, minimum) || completionKeywordDetected(text, { action: "wait-copy", keywordPattern }).matched)) return candidate;
    }
    return null;
  }

  async function waitForPublishCopy(copyPrompt, timeout = 90_000, options = {}) {
    const started = Date.now();
    const minimum = Math.max(1, Number(options.minimum || 300));
    const keywordPattern = String(options.keywordPattern || "").trim();
    let lastSignature = "";
    let stableSince = 0;
    while (Date.now() - started < timeout) {
      const pauseReason = platformPauseReason();
      if (pauseReason) throw new Error(pauseReason);
      // Only accept a publishable reply paired with the latest copy request.
      // Reusing an older post from the same long-running template chat would
      // silently package the wrong material.
      const turn = latestPairedCopyTurn(copyPrompt, { minimum, keywordPattern });
      const text = cleanAssistantText(turn);
      const signature = `${text.length}:${text.slice(-120)}`;
      const keywordHit = completionKeywordDetected(text, { action: "wait-copy", keywordPattern }).matched;
      if ((isLikelyPublishCopy(text, minimum) || keywordHit) && signature === lastSignature && !generatingNow()) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince >= 2_500) return { turn, text };
      } else {
        stableSince = 0;
        lastSignature = signature;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    // ChatGPT may virtualize the user turn while keeping the finished copy
    // reply in the DOM.  The paired lookup is intentionally strict during
    // polling, but a timeout must get one last post-prompt recovery attempt
    // before declaring the task incomplete; otherwise a valid copy can be
    // discarded merely because the conversation scrolled or re-rendered.
    const recoveredTurn = latestCopyTurnAfterPrompt(copyPrompt, { minimum, keywordPattern });
    const recoveredText = cleanAssistantText(recoveredTurn);
    if ((isLikelyPublishCopy(recoveredText, minimum) || completionKeywordDetected(recoveredText, { action: "wait-copy", keywordPattern }).matched) && !generatingNow()) {
      return { turn: recoveredTurn, text: recoveredText, recovered: true };
    }
    return null;
  }

  function replyScopes(scope = document) {
    const roots = [scope];
    const wrapper = scope?.closest?.('[data-testid^="conversation-turn"]');
    if (wrapper && wrapper !== scope) roots.push(wrapper);
    return [...new Set(roots.filter(Boolean))];
  }

  function generatedImageNodes(scope = document) {
    const nodes = replyScopes(scope).flatMap((root) => [
      ...root.querySelectorAll([
      'img[alt^="已生成图片"]',
      'img[alt="输出图片"]',
      'img[alt*="generated image" i]',
      '[data-testid*="imagegen" i] img',
      '[data-testid*="generated-image" i] img'
      ].join(","))
    ]);
    return [...new Set(nodes)].filter((image) => {
      if (image.closest('[data-message-author-role="user"]')) return false;
      return Boolean(imageUrl(image, { allowSmall: true }));
    });
  }

  function reactFiberForNode(node) {
    if (!node) return null;
    const key = Object.keys(node).find((name) => name.startsWith("__reactFiber$"));
    return key ? node[key] : null;
  }

  function sandboxImageArtifact(button) {
    const visibleName = String(button?.getAttribute?.("aria-label") || button?.textContent || "").trim();
    if (!/\.(?:png|jpe?g|webp|gif|avif)$/i.test(visibleName)) return null;
    let fiber = reactFiberForNode(button);
    let fileName = visibleName;
    let filepath = "";
    let messageId = "";
    for (let depth = 0; fiber && depth < 12; depth += 1, fiber = fiber.return) {
      const props = fiber.memoizedProps || fiber.pendingProps || {};
      fileName = String(props.fileName || fileName).trim();
      filepath = String(props.filepath || filepath).trim();
      messageId = String(props.messageId || messageId).trim();
      if (filepath && messageId) break;
    }
    if (!/^\/mnt\/data\//i.test(filepath) || !messageId) return null;
    const conversationId = String(location.pathname.match(/\/c\/([^/?#]+)/)?.[1] || "").trim();
    if (!conversationId) return null;
    const url = new URL(
      `/backend-api/conversation/${encodeURIComponent(conversationId)}/interpreter/download`,
      location.origin
    );
    url.searchParams.set("message_id", messageId);
    url.searchParams.set("sandbox_path", filepath);
    return { url: url.href, fileName, filepath, messageId };
  }

  function sandboxArtifactPlaceholder(button, fileName) {
    const outerTurn = button?.closest?.('[data-testid^="conversation-turn"]');
    const assistantTurn = button?.closest?.('[data-message-author-role="assistant"], article[data-turn="assistant"]')
      || outerTurn;
    const turns = assistantTurns();
    const index = Math.max(0, turns.indexOf(assistantTurn));
    const turnKey = assistantTurnKey(assistantTurn, index);
    return `https://tb-workbench.invalid/sandbox-artifact/${encodeURIComponent(turnKey)}?file=${encodeURIComponent(fileName)}`;
  }

  function generatedImageArtifacts(scope = document) {
    return [...new Set(replyScopes(scope).flatMap((root) => [...root.querySelectorAll("button[aria-label]")]))]
      .filter((button) => !button.closest('[data-message-author-role="user"]'))
      .map((button) => {
        const fileName = String(button.getAttribute("aria-label") || button.textContent || "").trim();
        if (!/\.(?:png|jpe?g|webp|gif|avif)$/i.test(fileName)) return null;
        return sandboxImageArtifact(button) || {
          url: sandboxArtifactPlaceholder(button, fileName),
          fileName,
          button
        };
      })
      .filter(Boolean);
  }

  function parseSandboxArtifactPlaceholder(value) {
    try {
      const url = new URL(String(value || ""));
      if (url.hostname !== "tb-workbench.invalid" || !url.pathname.startsWith("/sandbox-artifact/")) return null;
      return {
        turnKey: decodeURIComponent(url.pathname.slice("/sandbox-artifact/".length)),
        fileName: String(url.searchParams.get("file") || "")
      };
    } catch {
      return null;
    }
  }

  async function resolveSandboxArtifactUrl(value, timeout = 20_000) {
    const target = parseSandboxArtifactPlaceholder(value);
    if (!target) return value;
    const turns = assistantTurns();
    const keyedWrapper = document.querySelector(`[data-testid="${CSS.escape(target.turnKey)}"]`);
    const turn = keyedWrapper
      || turns.find((candidate, index) => assistantTurnKey(candidate, index) === target.turnKey);
    const button = [...(turn?.querySelectorAll?.("button[aria-label]") || [])]
      .find((candidate) => String(candidate.getAttribute("aria-label") || "").trim() === target.fileName);
    if (!button) throw new Error(`没有找到本轮图片文件：${target.fileName}`);
    button.click();
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const dialogs = [...document.querySelectorAll('[role="dialog"]')];
      const dialog = dialogs.find((candidate) => candidate.querySelector(`img[alt="${CSS.escape(target.fileName)}"]`));
      const image = dialog?.querySelector(`img[alt="${CSS.escape(target.fileName)}"]`);
      const url = imageUrl(image);
      if (url) {
        const closeButton = [...dialog.querySelectorAll("button")].find((candidate) => {
          const label = `${candidate.getAttribute("aria-label") || ""} ${candidate.title || ""}`;
          return /退出全屏|关闭|exit fullscreen|close/i.test(label);
        });
        closeButton?.click();
        return url;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`图片预览地址读取超时：${target.fileName}`);
  }

  function generatedImageUrlsIn(scope = document) {
    return uniqueGeneratedImageUrls([
      ...generatedImageNodes(scope).map((image) => imageUrl(image, { allowSmall: true })),
      ...generatedImageArtifacts(scope).map((artifact) => artifact.url)
    ]);
  }

  function generatedImageUrls() {
    return generatedImageUrlsIn(document);
  }

  function generatedOutputRisk(scope) {
    const text = String(scope?.innerText || scope?.textContent || "");
    const artifacts = generatedImageArtifacts(scope);
    const artifactNames = artifacts.map((item) => String(item.fileName || ""));
    // One native GPT image is rendered as several DOM nodes (large preview,
    // thumbnail and lazy-loaded copy). Count stable backend file identities,
    // otherwise a two-image limit response can look like six images and slip
    // past the low-output stop rule.
    const nativeImageUrls = uniqueGeneratedImageUrls(
      generatedImageNodes(scope).map((image) => imageUrl(image, { allowSmall: true }))
    );
    const nativeImages = nativeImageUrls.length;
    const hasCodeSignal = /(?:\bpython\b\s*(?:script|code|file|output)|python脚本|python代码|代码解释器|运行代码|inspect(?:ing)?\s+composite|analy(?:s|z)ing\s+image|image\s+dimensions)/i.test(text);
    const hasArchiveSignal = /(?:\bzip\b|download\s+all|一次下载|下载全部|压缩包|批量下载)/i.test(text)
      || artifactNames.some((name) => /\.(?:zip|py|ipynb|html|json)$/i.test(name));
    const hasScriptArtifact = artifactNames.some((name) => /\.(?:py|ipynb|html|json)$/i.test(name));
    const scriptOutput = hasCodeSignal || hasScriptArtifact;
    const retryButton = [...replyScopes(scope).flatMap((root) => [...root.querySelectorAll("button")])]
      .some((button) => /^(?:重试|retry|try again|regenerate)$/i.test(String(button.innerText || button.textContent || button.getAttribute("aria-label") || "").trim()));
    const hasRetrySignal = /(?:达到(?:图片|生成|上传)?(?:数量)?上限|额度(?:已|不足|用尽)|图片生成.*(?:失败|受限)|无法继续生成|请稍后再试|rate\s*limit|usage\s*limit|too\s*many\s*requests|try\s+again\s+later|generation\s+(?:limit|failed))/i.test(text)
      || (retryButton && nativeImages <= 3);
    // PY脚本兜底拼图:GPT 撞到生图上限后用 py/代码解释器拼接垃圾图,而非 DALL-E 原生出图。
    // 判定:有图片(>0) 且有脚本特征 → 兜底拼图,视为触顶。
    const pyScriptFallback = detectPyScriptFallbackSignal({ nativeImages, hasCodeSignal, hasScriptArtifact });
    // 纯脚本/沙盒输出:没有原生图但出现代码解释器、脚本文件、压缩包等产物。
    // 用户确认这也是生图触顶特征,按限额信号处理。
    const scriptOutputLimit = detectScriptOutputLimitSignal({
      nativeImages,
      artifactCount: artifacts.length,
      hasCodeSignal,
      hasScriptArtifact,
      hasArchiveSignal
    });
    // 低图触顶:只出 4 张及以下也是撞上限的补充特征(不单独触发 hardFailure,
    // 在图片检测完成后与其他信号组合判断)。
    const lowImage = detectLowImageLimit({ nativeImages, threshold: 4 });
    if (scriptOutputLimit.detected || pyScriptFallback.detected || hasRetrySignal || lowImage.detected) {
      logGptLimitDebug("generated-output-risk", {
        nativeImages,
        artifactCount: artifacts.length,
        artifactNames,
        hasCodeSignal,
        hasScriptArtifact,
        hasArchiveSignal,
        hasRetrySignal,
        scriptOutputLimitSignal: scriptOutputLimit.detected,
        pyScriptFallbackSignal: pyScriptFallback.detected,
        lowImageLimit: lowImage.detected,
        lowImageCount: lowImage.count,
        textSample: text.slice(0, 500)
      });
    }
    return {
      nativeImages,
      hasCodeSignal,
      hasArchiveSignal,
      hasRetrySignal,
      scriptOnly: nativeImages === 0 && artifacts.length > 0 && (scriptOutput || hasArchiveSignal),
      pyScriptFallbackSignal: pyScriptFallback.detected,
      scriptOutputLimitSignal: scriptOutputLimit.detected,
      lowImageLimit: lowImage.detected,
      lowImageCount: lowImage.count,
      hardFailure: hasRetrySignal || scriptOutput || pyScriptFallback.detected
        || (nativeImages === 0 && artifacts.length > 0 && hasArchiveSignal)
    };
  }

  globalThis.TeambuildingGptProductionDebug = {
    generatedImageUrls,
    generatedImageArtifacts: () => generatedImageArtifacts(document).map(({ url, fileName }) => ({ url, fileName })),
    resolveSandboxArtifactUrl
  };

  function freshGeneratedImageUrls(baselineUrls = []) {
    const baseline = new Set(baselineUrls || []);
    // Bind detection to one assistant reply. A long-running template chat can
    // contain old Python/sandbox files and old native previews; scanning the
    // whole document lets those historical artifacts hide the current batch.
    // Prefer the newest reply that has fresh native images. If that reply only
    // exposes sandbox files, use those files as its authoritative output.
    const turns = assistantTurns().slice().reverse();
    for (const turn of turns) {
      const nativeUrls = uniqueGeneratedImageUrls(
        generatedImageNodes(turn).map((image) => imageUrl(image, { allowSmall: true }))
      ).filter((url) => !baseline.has(url));
      const artifactUrls = uniqueGeneratedImageUrls(
        generatedImageArtifacts(turn).map((artifact) => artifact.url)
      ).filter((url) => !baseline.has(url));
      if (nativeUrls.length) {
        // Native image previews are the authoritative generation result. A
        // reply can also contain one or more sandbox/script artifacts (for
        // example a Python-produced composite); preferring that artifact list
        // used to collapse a real 9-image reply to a single file and trigger a
        // false low-output/limit stop. Script artifacts are still reported by
        // generatedOutputRisk and therefore cannot be packaged as normal AI
        // output, but they must never replace the native count.
        return nativeUrls;
      }
      if (artifactUrls.length) return artifactUrls;
    }
    return generatedImageUrls().filter((url) => !baseline.has(url));
  }

  function generatedImageCompletionEvidence(urls) {
    const wanted = new Set(uniqueGeneratedImageUrls(urls || []));
    if (!wanted.size) return null;
    const turns = assistantTurns();
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index];
      const turnUrls = generatedImageUrlsIn(turn);
      const matched = turnUrls.filter((url) => wanted.has(url));
      if (!matched.length) continue;
      const risk = generatedOutputRisk(turn);
      // ChatGPT adds the native copy-reply action only after the whole
      // assistant response has settled. This is substantially safer than
      // treating a short pause after the first generated image as completion.
      const responseRoot = replyScopes(turn).at(-1) || turn;
      const responseComplete = Boolean(responseRoot.querySelector([
        '[data-testid="copy-turn-action-button"]',
        'button[aria-label*="复制回复"]',
        'button[aria-label*="Copy response" i]',
        'button[aria-label*="下载本组"]',
        'button[aria-label*="Download group" i]'
      ].join(",")));
      const declaredCounts = [...turn.querySelectorAll('button')]
        .flatMap((button) => {
          const ariaCount = String(button.getAttribute("aria-label") || "").match(/(?:共|of)\s*(\d{1,3})\s*(?:张)?/i);
          return [
            Number(button.dataset?.cgptImageTotal || 0),
            Number(button.dataset?.cgptImageCount || 0),
            Number(ariaCount?.[1] || 0)
          ];
        })
        .filter((count) => count > 0 && count < 100);
      return {
        responseComplete,
        turnKey: assistantTurnKey(turn, index),
        turnImageCount: turnUrls.length,
        declaredCount: declaredCounts.length ? Math.max(...declaredCounts) : 0,
        nativeImages: risk.nativeImages,
        scriptOnly: risk.scriptOnly,
        scriptOutput: risk.scriptOutput,
        pyScriptFallbackSignal: risk.pyScriptFallbackSignal,
        scriptOutputLimitSignal: risk.scriptOutputLimitSignal,
        lowImageLimit: risk.lowImageLimit,
        lowImageCount: risk.lowImageCount,
        hardFailure: risk.hardFailure,
        riskReason: risk.scriptOutputLimitSignal ? "script-output-limit"
          : risk.scriptOutput ? "script-output"
          : risk.pyScriptFallbackSignal ? "py-script-fallback"
          : risk.hasRetrySignal ? "retry-or-limit-signal"
          : ""
      };
    }
    return null;
  }

  function dismissImageComparison() {
    const buttons = [...document.querySelectorAll("button")].filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && /^\s*跳过\s*$/.test(button.textContent || "");
    });
    buttons.at(-1)?.click();
  }

  function currentBatchChoicePrompt() {
    const latest = [...assistantTurns()].at(-1);
    const text = cleanAssistantText(latest);
    return /(?:单次最多只能出\s*10\s*张|你回复一个选项|先出\s*P\s*1\s*[-—]\s*P\s*10)/i.test(text);
  }

  async function waitForGeneratedImageGrowth(baselineUrls, previousCount, timeout, expectedCount = 0, onTick = null, options = {}) {
    const baseline = new Set(baselineUrls || []);
    const started = Date.now();
    const keywordPattern = String(options.keywordPattern || "").trim();
    const keywordQuietMs = Math.max(1_000, Number(options.keywordQuietMs || 3_000));
    let stableSince = 0;
    let quietWithoutCompletionSince = 0;
    let silentImageIdleSince = 0;
    let lastSignature = "";
    while (Date.now() - started < timeout) {
      const pauseReason = platformPauseReason();
      if (pauseReason) throw new Error(pauseReason);
      if (typeof onTick === "function") await onTick();
      dismissImageComparison();
      const urls = freshGeneratedImageUrls(baselineUrls);
      const signature = urls.join("|");
      const completion = generatedImageCompletionEvidence(urls);
      const pageGenerating = generatingNow();
      const freshTurnCount = Math.max(0, assistantTurns().length - Math.max(0, Number(options.baselineAssistantTurns || 0)));
      const silentImageCandidate = urls.length === 0 && freshTurnCount === 0 && !pageGenerating;
      if (silentImageCandidate && !silentImageIdleSince) silentImageIdleSince = Date.now();
      if (!silentImageCandidate) silentImageIdleSince = 0;
      if (shouldRecoverSilentImageGeneration({
        elapsedMs: silentImageIdleSince ? Date.now() - silentImageIdleSince : 0,
        thresholdMs: Number(options.silentThresholdMs || 60_000),
        freshTurnCount,
        freshImageCount: urls.length,
        generating: pageGenerating
      })) {
        return { urls, confident: false, evidence: "silent-image-response", completion };
      }
      const latestText = cleanAssistantText([...assistantTurns()].at(-1));
      const keywordHit = completionKeywordDetected(latestText, { action: "wait-images", keywordPattern }).matched;
      if (completion?.hardFailure && urls.length > previousCount) {
        const reason = completion.riskReason;
        const isScriptLimit = reason === "script-output-limit";
        const isScript = reason === "script-output" || reason === "script-output-only";
        const isPyScriptFallback = reason === "py-script-fallback";
        const error = new Error(isScriptLimit
          ? "检测到纯脚本/沙盒产物输出而非原生生图，已按生图触顶处理并停止本帖"
          : isScript
          ? "检测到代码解释器/脚本文件输出而非原生生图，已停止本帖"
          : isPyScriptFallback
          ? `检测到 GPT 使用 PY 代码兜底拼接垃圾图(不是大模型原生生图)，疑似撞到生图上限；已停止本帖(本轮 ${urls.length} 张)`
          : "检测到重试、限额或生成失败信号，已停止本帖");
        error.code = isScript && !isScriptLimit ? "SCRIPT_GENERATED_OUTPUT" : "GENERATION_LIMIT_SIGNAL";
        error.detectedImages = urls.length;
        error.riskReason = reason;
        logGptLimitDebug("wait-images-hard-failure", {
          code: error.code,
          riskReason: reason,
          detectedImages: urls.length,
          previousCount,
          expectedCount,
          evidence: completion?.responseComplete ? "response-complete" : "risk-signal",
          completion
        });
        throw error;
      }
      if (urls.length > previousCount && signature === lastSignature && !pageGenerating) {
        if (!stableSince) stableSince = Date.now();
      } else {
        stableSince = 0;
        if (signature !== lastSignature) quietWithoutCompletionSince = Date.now();
        lastSignature = signature;
      }
      const stableFor = stableSince ? Date.now() - stableSince : 0;
      const requiredCount = Math.max(
        Math.max(0, Number(expectedCount || 0)),
        Math.max(0, Number(completion?.declaredCount || 0))
      );
      const reachedExpected = requiredCount > 0 && urls.length >= requiredCount;
      const responseQuietComplete = Boolean(completion?.responseComplete) && stableFor >= 45_000;
      if (urls.length > previousCount && ((reachedExpected && stableFor >= 8_000) || responseQuietComplete || (keywordHit && stableFor >= keywordQuietMs))) {
        return {
          urls,
          confident: true,
          evidence: keywordHit ? "keyword-complete" : (reachedExpected ? "expected-and-declared-count" : "assistant-response-quiet-complete"),
          completion
        };
      }
      // Compatibility fallback for a future ChatGPT DOM change: wait three
      // full minutes of no URL changes. The caller may continue with a safe
      // image count, but a low count without completion evidence must never
      // be promoted to an account-limit signal.
      if (urls.length > previousCount && !pageGenerating && quietWithoutCompletionSince
        && Date.now() - quietWithoutCompletionSince >= 180_000) {
        return { urls, confident: false, evidence: "long-quiet-fallback", completion };
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const urls = freshGeneratedImageUrls(baselineUrls);
    return {
      urls,
      confident: false,
      evidence: "timeout",
      completion: generatedImageCompletionEvidence(urls)
    };
  }

  function generatingNow() {
    // Only trust a visible, explicit stop/stream control or an actual streaming
    // marker. Historical replies often contain words such as “生成/停止” in
    // their toolbar text; matching arbitrary button text made a fresh task wait
    // forever even though the composer was idle.
    const streamingMarker = [...document.querySelectorAll(
      '[data-message-author-role="assistant"][data-is-streaming="true"]',
      '.result-streaming',
      '[data-testid*="streaming" i]'
    )].some((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (streamingMarker) return true;
    return [...document.querySelectorAll("button")].some((button) => {
      const rect = button.getBoundingClientRect();
      const label = `${button.getAttribute("aria-label") || ""} ${button.title || ""} ${button.getAttribute("data-testid") || ""}`;
      if (/composer|voice|microphone|dictation|语音|听写/i.test(label)) return false;
      return isActiveGenerationControl({
        visible: rect.width > 0 && rect.height > 0,
        disabled: button.disabled,
        label
      });
    });
  }

  async function waitForPageIdleBeforeFreshUpload(task, timeout = 10 * 60_000) {
    if (!generatingNow()) return true;
    reportWorkbenchProgress(
      task,
      "等待上一帖完成",
      2,
      "当前 GPT 仍在生成上一条回复；本帖尚未上传，等待网页真正空闲"
    );
    const started = Date.now();
    let idleSince = 0;
    while (Date.now() - started < Math.max(30_000, Number(timeout || 0))) {
      const pauseReason = platformPauseReason();
      if (pauseReason) throw new Error(pauseReason);
      if (!generatingNow()) {
        if (!idleSince) idleSince = Date.now();
        if (Date.now() - idleSince >= 3_000) return true;
      } else {
        idleSince = 0;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    const error = new Error("上一帖仍在生成，本帖没有上传；任务已暂停，避免两个素材进入同一轮回复");
    error.code = "WEB_RESPONSE_IN_FLIGHT";
    throw error;
  }

  function platformPauseReason() {
    if (/\/auth\/(?:login|signup)|\/login(?:[/?#]|$)/i.test(location.href)) {
      return "GPT 登录状态已失效，请重新登录后继续";
    }
    const visibleAlerts = [...document.querySelectorAll(
      '[role="alert"], [role="dialog"], [data-sonner-toast], [data-testid*="modal"], [data-testid*="dialog"]'
    )].filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const message = visibleAlerts.map((node) => String(node.innerText || node.textContent || "")).join("\n");
    if (/too many requests|rate limit|usage limit|try again later|请求过多|达到.*上限|稍后再试/i.test(message)) {
      return "GPT 当前出现频率或额度限制，队列已暂停";
    }
    if (/verify you are human|security check|验证码|安全验证|完成验证/i.test(message)) {
      return "GPT 需要完成登录或安全验证，队列已暂停";
    }
    return "";
  }

  function sendButton() {
    const target = composer();
    const scope = target?.closest('[data-composer-surface]')
      || target?.closest("form")
      || target?.parentElement
      || document;
    const selectors = [
      '#composer-submit-button:not(:disabled)',
      '[data-testid="send-button"]:not(:disabled)',
      '[data-testid="composer-send-button"]:not(:disabled)',
      '[data-testid="composer-submit-button"]:not(:disabled)',
      '[data-testid*="send-button"]:not(:disabled)',
      '[data-testid*="submit-button"]:not(:disabled)',
      'button[aria-label="Send prompt"]:not(:disabled)',
      'button[aria-label="发送提示词"]:not(:disabled)',
      'button[aria-label="发送"]:not(:disabled)',
      'button[aria-label*="Send" i]:not(:disabled)',
      'button[aria-label*="发送"]:not(:disabled)',
      'button[type="submit"]:not(:disabled)'
    ];
    for (const sel of selectors) {
      const btn = scope.querySelector(sel) || document.querySelector(sel);
      if (btn) return btn;
    }
    // ChatGPT new unified composer: the submit button shares position with voice button.
    // Detect by class but exclude voice-mode buttons (aria-label contains 语音/voice).
    const composerSubmitBtn = [...scope.querySelectorAll("button:not(:disabled)")].find((button) => {
      const className = String(button.className || "");
      const ariaLabel = String(button.getAttribute("aria-label") || "");
      const style = button.getAttribute("style") || "";
      if (!className.includes("composer-submit-button")) return false;
      // Exclude voice buttons
      if (/语音|voice|speech/i.test(ariaLabel)) return false;
      if (/--vt-composer-speech-button/i.test(style)) return false;
      // Also check SVG: voice buttons have microphone/voice icons, send buttons have arrow/send icons
      const svgHref = button.querySelector("use")?.getAttribute("href") || "";
      if (/voice|microphone|speech/i.test(svgHref)) return false;
      return true;
    });
    if (composerSubmitBtn) return composerSubmitBtn;
    return [...scope.querySelectorAll("button:not(:disabled)")].find((button) => {
        const label = `${button.getAttribute("aria-label") || ""} ${button.title || ""} ${button.getAttribute("data-testid") || ""}`;
        return /send|submit|发送|提交/i.test(label);
      })
      || [...document.querySelectorAll("button:not(:disabled)")].find((button) => {
        const label = `${button.getAttribute("aria-label") || ""} ${button.title || ""} ${button.getAttribute("data-testid") || ""}`;
        return /send|submit|发送|提交/i.test(label);
      });
  }

  async function submitComposer() {
    const target = composer();
    if (!target) throw new Error("没有找到当前 GPT 输入框");
    const beforeUserCount = document.querySelectorAll('[data-message-author-role="user"]').length;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const button = await waitFor(() => sendButton(), 15_000);
      if (button) button.click();
      else {
        target.focus();
        target.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true
        }));
      }
      const submitted = await waitFor(
        () => document.querySelectorAll('[data-message-author-role="user"]').length > beforeUserCount
          || (!composerDraftText() && attachmentPreviewCount() === 0),
        12_000
      );
      if (submitted) return true;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    throw new Error("GPT 发送按钮已出现，但没有检测到新消息；任务已暂停，避免重复发送");
  }

  function turnSignature(turns = []) {
    return turns.map((turn) => {
      const text = String(turn.innerText || turn.textContent || "").trim();
      return `${text.length}:${turn.querySelectorAll("img").length}`;
    }).join("|");
  }

  function assistantTurnKey(turn, index = 0) {
    const wrapper = turn?.closest?.('[data-testid^="conversation-turn"]');
    const stableId = wrapper?.getAttribute?.("data-testid")
      || turn?.getAttribute?.("data-message-id")
      || turn?.id;
    if (stableId) return String(stableId);
    const text = String(turn?.innerText || turn?.textContent || "").trim();
    return `fallback-${index}-${text.slice(0, 80)}-${text.length}`;
  }

  function assistantTurnKeys(turns = assistantTurns()) {
    return turns.map(assistantTurnKey);
  }

  function replyHasCompletionAction(turn) {
    const root = replyScopes(turn).at(-1) || turn;
    return Boolean(root?.querySelector?.([
      '[data-testid="copy-turn-action-button"]',
      'button[aria-label*="复制回复"]',
      'button[aria-label*="Copy response" i]'
    ].join(",")));
  }

  function migrationPlanHasCompletionMarker(text) {
    return /(?:暂不出图|等待(?:你|您)?(?:回复|输入|确认)\s*[“"']?1|请(?:回复|输入|发送)\s*[“"']?1|回复\s*[“"']?1)/i.test(String(text || ""));
  }

  async function waitForAssistantCompletion(beforeCount, options = {}) {
    const timeout = Math.max(30_000, Number(options.timeout || 15 * 60_000));
    const needImages = Boolean(options.needImages);
    const minTextLength = Math.max(1, Number(options.minTextLength ?? 20));
    // Plans are long and GPT can briefly expose the copy action before the
    // final page headings/constraints have finished rendering. Callers may
    // request a longer quiet window for this boundary; the production plan
    // uses 8s so a partial plan cannot trigger "1" or the next upload.
    const completionQuietMs = Math.max(2_500, Number(options.completionQuietMs || 2_500));
    const keywordAction = String(options.keywordAction || "").trim();
    const keywordPattern = String(options.keywordPattern || "").trim();
    const keywordQuietMs = Math.max(1_000, Number(options.keywordQuietMs || completionQuietMs));
    const started = Date.now();
    const baselineKeys = new Set(Array.isArray(options.baselineKeys) ? options.baselineKeys : []);
    let stableSince = 0;
    let lastSignature = "";
    let threadErrorRetried = false;
    while (Date.now() - started < timeout) {
      const pauseReason = platformPauseReason();
      if (pauseReason) throw new Error(pauseReason);
      const anchoredTurns = assistantTurnsAfter(options.afterTurn);
      const turns = options.afterTurn?.isConnected ? anchoredTurns : assistantTurns();
      const freshTurns = options.afterTurn?.isConnected
        ? turns
        : baselineKeys.size
        ? turns.filter((turn, index) => !baselineKeys.has(assistantTurnKey(turn, index)))
        : turns.slice(beforeCount);
      const signature = turnSignature(freshTurns);
      const imageCount = freshTurns.reduce((sum, turn) => sum + turn.querySelectorAll("img").length, 0);
      const hasContent = freshTurns.length > 0 && freshTurns.some((turn) =>
        String(turn.innerText || turn.textContent || "").trim().length >= minTextLength || turn.querySelector("img")
      );
      if (signature && signature === lastSignature && !generatingNow()) {
        if (!stableSince) stableSince = Date.now();
      } else {
        stableSince = 0;
        lastSignature = signature;
      }
      const latestFreshTurn = freshTurns.at(-1);
      const freshText = freshTurns.map(cleanAssistantText).join("\n").trim();
      const repetitiveLoop = options.repetitiveLoopRecovery === false
        ? { detected: false, token: "", repeats: 0 }
        : detectRepetitiveAssistantLoop(freshText, 8);
      if (repetitiveLoop.detected && generatingNow()) {
        const stopButton = document.querySelector('[data-testid="stop-button"]');
        if (stopButton && !stopButton.disabled) stopButton.click();
        api("/api/gpt-production/dom-snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "repetitive-assistant-loop-stopped", ...repetitiveLoop })
        }).catch(() => {});
        await waitFor(() => !generatingNow(), 10_000);
        return { turns: freshTurns, imageCount, responseComplete: true, stableFor: 0, keywordHit: false, repetitiveLoop };
      }
      const threadErrorRetryButton = document.querySelector('[data-testid="regenerate-thread-error-button"]');
      const threadErrorRetryMs = Math.max(0, Number(options.threadErrorRetryMs || 0));
      if (threadErrorRetryMs > 0 && shouldRetryThreadError({
        elapsedMs: Date.now() - started,
        thresholdMs: threadErrorRetryMs,
        retryVisible: Boolean(threadErrorRetryButton && !threadErrorRetryButton.disabled),
        freshTurnCount: freshTurns.length,
        alreadyRetried: threadErrorRetried
      })) {
        threadErrorRetried = true;
        threadErrorRetryButton.click();
        api("/api/gpt-production/dom-snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "native-thread-error-retry", elapsedMs: Date.now() - started })
        }).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        continue;
      }
      const keywordHit = keywordAction
        ? completionKeywordDetected(freshText, { action: keywordAction, keywordPattern }).matched
        : false;
      const responseComplete = replyHasCompletionAction(latestFreshTurn);
      const stableFor = stableSince ? Date.now() - stableSince : 0;
      if (shouldRecoverSilentAssistant({
        elapsedMs: Date.now() - started,
        thresholdMs: Number(options.silentResponseRecoveryMs || 0),
        freshTurnCount: freshTurns.length,
        generating: generatingNow(),
        composerEmpty: !composerDraftText() && attachmentPreviewCount() === 0
      }) && Number(options.silentResponseRecoveryMs || 0) > 0) {
        return { turns: [], imageCount: 0, responseComplete: false, stableFor: 0, keywordHit: false, silentResponse: true };
      }
      const plannedImageCountReady = !options.requirePlannedImageCount
        || parsePlannedImageCount(freshText) > 0;
      // A completed but malformed/short plan must be returned to the plan
      // classifier after the same quiet window. Otherwise the missing page
      // count keeps this generic waiter asleep for the full eight-minute
      // timeout before the existing current-post recovery can run.
      const incompletePlanSettled = Boolean(
        options.requirePlannedImageCount
        && responseComplete
        && stableFor >= Math.max(8_000, completionQuietMs)
      );
      if (hasContent && (!needImages || imageCount > 0) && stableSince
        && (plannedImageCountReady || incompletePlanSettled)
        && ((responseComplete && stableFor >= completionQuietMs)
          || (keywordHit && stableFor >= keywordQuietMs)
          || stableFor >= Math.max(8_000, completionQuietMs))) {
        return { turns: freshTurns, imageCount, responseComplete: responseComplete || keywordHit, stableFor, keywordHit };
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(needImages ? "等待套图完成超时，尚未检测到稳定图片结果" : "等待 GPT 回复完成超时");
  }

  function workPackageBatchId() {
    const now = new Date();
    const digits = (value) => String(value).padStart(2, "0");
    const stamp = `${now.getFullYear()}${digits(now.getMonth() + 1)}${digits(now.getDate())}-${digits(now.getHours())}${digits(now.getMinutes())}${digits(now.getSeconds())}`;
    return `${stamp}-${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`;
  }

  function imageUrl(image, options = {}) {
    if (!image) return "";
    const candidate = String(image.currentSrc || image.src || image.getAttribute?.("src") || "").trim();
    if (!/^(?:https?:|blob:|data:image\/)/i.test(candidate)) return "";
    if (/data:image\/svg/i.test(candidate)) return "";
    const width = Number(image.naturalWidth || image.width || image.getBoundingClientRect?.().width || 0);
    const height = Number(image.naturalHeight || image.height || image.getBoundingClientRect?.().height || 0);
    if (!options.allowSmall && width && height && (width < 160 || height < 160)) return "";
    return candidate;
  }

  function freshImageUrls(turns) {
    // ChatGPT currently renders generated sandbox files beside the inner
    // assistant message node, inside the outer conversation-turn wrapper.
    // Recovery is scoped to a single reply, so scan that wrapper as well as
    // the inner message.  A document-wide fallback would risk binding images
    // from an older reply in the same long conversation.
    const scopes = [...new Set(turns.flatMap((turn) => {
      const wrapper = turn?.closest?.('[data-testid^="conversation-turn"]');
      return wrapper && wrapper !== turn ? [turn, wrapper] : [turn];
    }).filter(Boolean))];
    const buttons = [...new Set(scopes.flatMap((scope) => [
      ...scope.querySelectorAll(".cgpt-conversation-tree-image-download-all")
    ]))];
    const imagesFromDownloadButtons = buttons.flatMap((button) => {
      const containers = [...new Set([
        button.__cgptImageDownloadContainer,
        button.closest("[data-cgpt-image-download-container]"),
        button.closest('[data-message-author-role="assistant"]'),
        button.closest('[data-turn="assistant"]'),
        button.parentElement
      ].filter(Boolean))];
      // The vendor helper keeps a best-effort element list, but ChatGPT can
      // replace carousel nodes after the button is injected. Always merge the
      // live container images instead of trusting only that cached list.
      return [
        ...(Array.isArray(button.__cgptImageDownloadImages) ? button.__cgptImageDownloadImages : []),
        ...containers.flatMap((container) => [...container.querySelectorAll("img")])
      ];
    });
    const images = imagesFromDownloadButtons.length
      ? imagesFromDownloadButtons
      : scopes.flatMap((scope) => [...scope.querySelectorAll("img")]);
    return uniqueGeneratedImageUrls([
      // Download-container images are known generated thumbnails, including
      // 48px previews. Keep the conservative size filter only for generic DOM
      // fallback where avatars/icons may be present.
      ...images.map((image) => imageUrl(image, { allowSmall: imagesFromDownloadButtons.length > 0 })).filter(Boolean),
      ...scopes.flatMap((scope) => generatedImageArtifacts(scope).map((artifact) => artifact.url))
    ]);
  }

  // Signed ChatGPT image responses can be labelled application/octet-stream.
  // Verify generic payloads by magic bytes before accepting them as images.
  function sniffImageContentType(bytes) {
    if (!bytes || bytes.length < 4) return "";
    if (bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
    if (bytes.length >= 12
      && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
    return "";
  }

  function downloadThroughExtension(url, filename, requestId, downloadRoot = "", timeout = 5 * 60_000) {
    if (isEmbeddedWorkbench()) {
      return (async () => {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) throw new Error(`图片读取失败：HTTP ${response.status}`);
        const headerType = String(response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
        const buffer = await response.arrayBuffer();
        const contentType = /^image\//i.test(headerType) ? headerType : sniffImageContentType(new Uint8Array(buffer));
        if (!/^image\//i.test(contentType)) throw new Error(`图片响应类型无效：${contentType}`);
        const data = bufferToBase64(buffer);
        const result = await api("/api/extension/save-generated-image", {
          method: "POST",
          body: JSON.stringify({ filename, requestId, contentType, data, sourceUrl: url, downloadRoot })
        });
        if (!result?.ok || !result.filename) throw new Error(result?.error || "工作台没有保存生成图片");
        return result.filename;
      })();
    }
    return new Promise((resolve, reject) => {
      let timer = null;
      const finish = (callback, value) => {
        if (timer) clearTimeout(timer);
        chrome.runtime.onMessage.removeListener(onMessage);
        callback(value);
      };
      const onMessage = (message) => {
        if (message?.type !== "tb-download-status" || message.requestId !== requestId) return;
        if (message.status === "complete") finish(resolve, message.filename || filename);
        if (message.status === "error") finish(reject, new Error(message.error || "图片下载失败"));
      };
      chrome.runtime.onMessage.addListener(onMessage);
      timer = setTimeout(() => finish(reject, new Error(`图片下载超时：${filename}`)), timeout);
      chrome.runtime.sendMessage({
        type: "tb-download",
        url,
        filename,
        requestId,
        baseUrl: currentApiRoot()
      }).then((result) => {
        if (!result?.ok) finish(reject, new Error(result?.error || "无法启动图片下载"));
      }).catch((error) => finish(reject, error));
    });
  }

  // The visible manual buttons and the automatic state machine must share the
  // same authenticated page-fetch + workbench-save path. Browser downloads of
  // signed ChatGPT image URLs can lose request credentials after a long reply.
  globalThis.TeambuildingGptProductionDownload = ({ url, filename, requestId = "", downloadRoot = "" } = {}) => (
    downloadThroughExtension(
      String(url || ""),
      String(filename || ""),
      String(requestId || `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      String(downloadRoot || "")
    )
  );

  async function packageDownloadedReply(options = {}) {
    const clipboardText = String(options.clipboardText || "").trim();
    if (!clipboardText) throw new Error("请先复制或下载本轮文案 TXT，再执行下载并打包");
    const result = await api("/api/extension/work-package", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clipboardText,
        title: String(options.title || ""),
        conversationUrl: String(options.conversationUrl || location.href),
        accountName: String(options.accountName || localStorage.getItem("tb-workbench-account-id") || ""),
        sourceMaterialPath: String(options.sourceMaterialPath || ""),
        batchId: String(options.batchId || ""),
        expectedImageCount: Math.max(0, Number(options.expectedImageCount || 0)),
        downloadRoot: String(options.downloadRoot || ""),
        productRoot: String(options.productRoot || "")
      })
    });
    if (!result?.ok) throw new Error(result?.error || "本地打包没有返回成功");
    return result;
  }

  // Manual reply buttons and automatic production intentionally call this
  // single package bridge.  Their only difference is who starts the action.
  globalThis.TeambuildingGptProductionPackage = packageDownloadedReply;

  // Manual packaging follows the same ordering as automatic production:
  // persist the validated copy text locally before image download starts.
  globalThis.TeambuildingGptProductionSaveCopyText = async ({ copyText = "", batchId = "", downloadRoot = "" } = {}) => {
    const result = await api("/api/extension/save-copy-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        copyText: String(copyText || ""),
        batchId: String(batchId || ""),
        downloadRoot: String(downloadRoot || "")
      })
    });
    if (!result?.ok || !result.filename) throw new Error(result?.error || "本轮文案 TXT 保存失败");
    return result;
  };

  async function downloadFreshImages(turnsOrUrls, task) {
    reportWorkbenchProgress(task, "下载图片", 68, "正在核对本轮新生成图片");
    const urls = Array.isArray(turnsOrUrls) && turnsOrUrls.every((item) => typeof item === "string")
      ? uniqueGeneratedImageUrls(turnsOrUrls)
      : freshImageUrls(turnsOrUrls || []);
    if (!urls.length) throw new Error("检测到生成结果，但没有找到本轮可下载图片");
    const batchId = String(task.workflow?.batchId || (task.workflow.batchId = workPackageBatchId()));
    const files = [];
    for (let index = 0; index < urls.length; index += 1) {
      const url = await resolveSandboxArtifactUrl(urls[index]);
      const extensionMatch = url.match(/\.(png|jpe?g|webp|gif|avif)(?:[?#]|$)/i);
      const extension = extensionMatch ? extensionMatch[1].toLowerCase().replace("jpeg", "jpg") : "png";
      const filename = `chatgpt-workpkg-${batchId}-${index + 1}-of-${urls.length}.${extension}`;
      const requestId = `${task.entry.externalRequestId || batchId}-image-${index + 1}`;
      const backgroundCopyRequested = Boolean(task.workflow?.textSubmitted);
      reportWorkbenchProgress(
        task,
        backgroundCopyRequested ? "图片后台下载" : "下载图片",
        (backgroundCopyRequested ? 76 : 68) + Math.round(index / urls.length * (backgroundCopyRequested ? 4 : 8)),
        backgroundCopyRequested ? `文案请求已发送；图片后台下载 ${index + 1}/${urls.length}` : `正在下载 ${index + 1}/${urls.length}`
      );
      files.push(await downloadThroughExtension(url, filename, requestId, String(task.entry.autoOptions?.downloadRoot || "")));
    }
    if (files.length !== urls.length) throw new Error(`图片下载不完整：${files.length}/${urls.length}`);
    document.dispatchEvent(new CustomEvent("tb-gpt-image-download-complete", {
      detail: {
        urls,
        downloaded: files.length,
        total: Math.max(files.length, Number(task?.workflow?.plannedImageCount || 0)),
        batchId,
        state: "downloaded",
        source: "automatic"
      }
    }));
    return { count: files.length, batchId, files };
  }

  function cleanAssistantText(turn) {
    if (!turn) return "";
    const visibleText = String(turn.innerText || turn.textContent || "").trim();
    const clone = turn.cloneNode(true);
    clone.querySelectorAll("button, svg, img, [aria-hidden='true'], .cgpt-conversation-tree-image-download-slot, .cgpt-conversation-tree-text-download-slot")
      .forEach((node) => node.remove());
    const cleanedText = String(clone.innerText || clone.textContent || "").trim();
    // ChatGPT sometimes wraps the only visible answer inside an aria-hidden
    // subtree while a separate accessibility mirror owns the semantic turn.
    // Removing chrome from a detached clone can therefore erase a perfectly
    // visible long-form reply. Prefer the cleaned clone when it retained real
    // content, otherwise fall back to the connected turn's visible text.
    const sourceText = cleanedText.length >= Math.min(80, Math.ceil(visibleText.length / 3)) ? cleanedText : visibleText;
    return sourceText
      .replace(/^\s*(ChatGPT|助手)\s*/i, "")
      .replace(/^\s*说[：:]\s*/, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  async function runAutomaticProduction(task) {
    const options = task.entry.autoOptions || {};
    const taskTimeout = Math.max(5, Number(options.taskTimeoutMinutes || 30)) * 60_000;
    const workflow = task.workflow || (task.workflow = {});
    let currentPlanPromptTurn = null;
    const logTaskConversationEvent = (event, data = {}) => logConversationEvent(event, {
      requestId: task.entry.externalRequestId || "",
      materialName: task.entry.name || "",
      ...data
    });
    const stateSnapshot = conversationStateSnapshot();
    workflow.conversationState = stateSnapshot;
    // Build workflow step lookup from the configured steps
    // Safety net: if workflowSteps is empty or missing critical steps
    // (send-confirm, request-copy), fall back to default workflow to ensure
    // the complete pipeline executes instead of silently skipping steps.
    const DEFAULT_WF_STEPS = [
      { action: "upload-material", text: DEFAULT_MATERIAL_PLAN_PROMPT, timeoutSeconds: 120, enabled: true, autoDetect: true },
      { action: "wait-random", text: "", enabled: true, minSeconds: 1, maxSeconds: 5 },
      { action: "wait-plan", text: "", timeoutSeconds: 480, enabled: true, autoDetect: true },
      { action: "send-confirm", text: "1", timeoutSeconds: 20, enabled: true, autoDetect: false },
      { action: "wait-random", text: "", enabled: true, minSeconds: 1, maxSeconds: 5 },
      { action: "wait-images", text: "", timeoutSeconds: 900, enabled: true, autoDetect: true },
      { action: "request-copy", text: DEFAULT_PUBLISH_COPY_PROMPT, timeoutSeconds: 20, enabled: true, autoDetect: false },
      { action: "wait-random", text: "", enabled: true, minSeconds: 1, maxSeconds: 5 },
      { action: "wait-copy", text: "", timeoutSeconds: 480, enabled: true, autoDetect: true },
      { action: "download-images", text: "", timeoutSeconds: 600, enabled: true, autoDetect: true },
      { action: "save-text", text: "", timeoutSeconds: 60, enabled: true, autoDetect: true },
      { action: "move-archive", text: "", timeoutSeconds: 120, enabled: true, autoDetect: false }
    ];
    const _rawWfSteps = Array.isArray(options.workflowSteps) ? options.workflowSteps : [];
    const _hasConfirm = _rawWfSteps.some((s) => s.action === "send-confirm");
    const _hasCopy = _rawWfSteps.some((s) => s.action === "request-copy");
    const wfSteps = (!_rawWfSteps.length || !_hasConfirm || !_hasCopy)
      ? DEFAULT_WF_STEPS
      : _rawWfSteps;
    const wfStepMap = new Map(wfSteps.map((s) => [s.action, s]));
    const wfEnabled = (action) => !wfStepMap.has(action) || wfStepMap.get(action)?.enabled !== false;
    const wfText = (action, fallback = "") => String(wfStepMap.get(action)?.text || fallback).trim() || fallback;
    const wfTimeout = (action, fallback = 60) => Math.max(5, Math.min(3600, Number(wfStepMap.get(action)?.timeoutSeconds || fallback))) * 1000;
    const wfAutoDetect = (action) => wfStepMap.get(action)?.autoDetect !== false;
    // 读取步骤中的可调参数（如 quietSeconds, minImages, minCopyLength 等）
    const wfParam = (action, key, fallback) => {
      const step = wfStepMap.get(action);
      if (!step) return fallback;
      const val = step[key];
      if (val === undefined || val === null || val === "") return fallback;
      const num = Number(val);
      return isNaN(num) ? val : num;
    };
    // ── 公共发送助手：替换输入框文字 + 提交 + 清空草稿 ──
    // send-confirm / request-copy / send-text / upload-material 统一调用
    async function sendComposerText(text) {
      await replaceComposerText(text, task.entry);
      await submitComposer();
      clearComposerDraft();
      // 记录发送的完整文字到对话日志
      logTaskConversationEvent("sent", { sentText: text, step: "sendComposerText" });
    }

    // ── 工具模块执行器（单步版本，替代原 executeUtilityStepsBefore 批量模式） ──
    // 按工作流顺序逐个执行工具模块，不再跳过主流程模块
    // 返回 false = 时间窗口外应暂停；true = 正常继续
    async function executeUtilityStep(step) {
      if (step.action === "wait-fixed") {
        const delay = Math.max(1, Number(step.timeoutSeconds || 5)) * 1000;
        reportWorkbenchProgress(task, "固定等待", 0, `等待 ${Math.round(delay / 1000)} 秒`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else if (step.action === "wait-random") {
        const min = Math.max(1, Number(step.minSeconds || 5));
        const max = Math.max(min, Number(step.maxSeconds || 30));
        const delay = (min + Math.random() * (max - min)) * 1000;
        reportWorkbenchProgress(task, "随机等待", 0, `等待 ${Math.round(delay / 1000)} 秒（${min}-${max}秒随机）`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else if (step.action === "send-text" && step.text) {
        reportWorkbenchProgress(task, "发送文字", 0, `发送：${step.text.slice(0, 30)}`);
        await sendComposerText(String(step.text));
      } else if (step.action === "clipboard-copy" && workflow.copyText) {
        try { await navigator.clipboard.writeText(workflow.copyText); } catch (e) { /* optional */ }
        reportWorkbenchProgress(task, "已复制到剪贴板", 0, "文案已复制到剪贴板");
      } else if (step.action === "time-window") {
        const start = String(step.startTime || "00:00").trim();
        const end = String(step.endTime || "23:59").trim();
        const now = new Date();
        const currentMin = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        const startMin = (sh || 0) * 60 + (sm || 0);
        const endMin = (eh || 23) * 60 + (em || 59);
        if (currentMin < startMin || currentMin > endMin) {
          reportWorkbenchProgress(task, "时间窗口", 0, `当前 ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")} 不在 ${start}-${end} 窗口内，暂停执行`);
          return false;
        }
        reportWorkbenchProgress(task, "时间窗口", 0, `当前在 ${start}-${end} 窗口内，继续执行`);
      } else if (step.action === "retry") {
        reportWorkbenchProgress(task, "失败重试", 0, `重试配置：超时 ${step.timeoutSeconds || 60} 秒`);
      } else if (step.action.startsWith("detect-")) {
        // 纯检测模块：瞬间检测，不等待。检测到=通过，未检测到=报告但继续
        // 等待请用「随机等待」或「固定等待」模块单独组合
        let detected = false;
        let detectLabel = "";
        if (step.action === "detect-plan") {
          detectLabel = "计划";
          const pattern = String(step.pattern || defaultKeywordPattern("detect-plan") || "迁移计划|逐页|P\\s*1").trim();
          detected = workflow.planDone || completionKeywordDetected(cleanAssistantText([...assistantTurns()].pop()), { action: "detect-plan", keywordPattern: pattern }).matched;
        } else if (step.action === "detect-images") {
          detectLabel = "图片";
          const imgs = freshImageUrls(assistantTurns());
          detected = imgs.length > 0;
        } else if (step.action === "detect-copy") {
          detectLabel = "文案";
          detected = Boolean(workflow.copyText) || isLikelyPublishCopy(cleanAssistantText([...assistantTurns()].pop()));
        } else if (step.action === "detect-state") {
          const st = conversationStateSnapshot();
          detectLabel = "会话状态";
          detected = Boolean(st.stage);
          reportWorkbenchProgress(task, `检测·${detectLabel}`, 0, `当前状态：${st.stage || "unknown"}`);
        }
        if (detectLabel && step.action !== "detect-state") {
          reportWorkbenchProgress(task, `检测·${detectLabel}`, 0, detected ? `${detectLabel}已检测到` : `${detectLabel}未检测到，继续`);
        }
      }
      return true;
    }

    // ── 主流程步骤处理器（每个步骤一个独立函数，按 wfSteps 顺序调用） ──
    // 每个 handler 检查自身状态标志，已完成的自动跳过（支持断点恢复）

    // upload-material：上传素材附件并提交
    async function handleUploadMaterial() {
      if (workflow.planDone) return;
      if (!workflow.planSubmitted) {
        reportWorkbenchProgress(
          task,
          templateInitialization ? "初始化模板" : "提交迁移计划",
          18,
          templateInitialization ? "模板附件完成，正在建立当前会话的母版规则" : "附件完成，正在发送母版迁移要求"
        );
        const expectedAttachmentCount = Array.isArray(task.entry.attachments) ? task.entry.attachments.length : 0;
        if (expectedAttachmentCount === 0) {
          // No attachments in the material folder. If planSubmitted is false
          // (plan was never sent), there is nothing to resume — the task was
          // interrupted before any files were uploaded. Sending text-only
          // would cause GPT to generate a plan without seeing reference images,
          // producing inaccurate results. Fail the task with a clear message.
          throw productionBoundaryError("NO_ATTACHMENTS",
            "当前素材文件夹没有可上传的图片或文案，无法启动生产流程。" +
            "请检查素材文件夹是否为空，或跳过此套素材。" +
            `（素材路径：${task.entry.materialPath || task.entry.path || "未知"}）`);
        }
        if (expectedAttachmentCount) {
          // Don't check attachmentPreviewCount() here — it had false positives
          // (35 for 7 files) that masked real upload failures. Instead, wait
          // directly for the send button, which is the ultimate indicator that
          // ChatGPT has processed the files and is ready to send.
          reportWorkbenchProgress(task, "等待附件就绪", 16, `已上传 ${expectedAttachmentCount} 个文件，等待 GPT 发送按钮可用`);

          // ChatGPT's new unified composer shows a VOICE button (not send)
          // when the input is empty, even if attachments are present.
          // The prompt text set by replaceComposerText before runAutomaticProduction
          // can be cleared by React's async re-rendering during file processing.
          // Re-inject the instruction text if the composer is empty, so the
          // voice button transforms into a send button.
          // SAFETY: Only re-inject text when attachments are actually present
          // in the composer. If expectedAttachmentCount > 0 but no attachments
          // are visible, the files need to be re-uploaded, not just text injected.
          const ensureComposerHasPrompt = () => {
            if (!composerDraftText()) {
              // If we expect attachments but none are in the composer, do NOT
              // inject text alone — that would send a message without files.
              // Only inject if there are no expected attachments, or if
              // attachments are actually present in the composer.
              const currentAttachments = attachmentPreviewCount();
              if (expectedAttachmentCount > 0 && currentAttachments === 0) {
                return false;
              }
              const baseInstr = instruction(task.entry);
              const wfStepsForInstr = Array.isArray(task.entry.autoOptions?.workflowSteps) ? task.entry.autoOptions.workflowSteps : [];
              const insertPromptStep = wfStepsForInstr.find((s) => s.action === "insert-prompt" && s.enabled !== false);
              const finalInstr = insertPromptStep?.text
                ? `${baseInstr}\n${String(insertPromptStep.text).trim()}`
                : baseInstr;
              setComposerText(finalInstr);
              return true;
            }
            return false;
          };
          // Initial injection (covers the race condition where React cleared
          // the text between replaceComposerText and handleUploadMaterial).
          ensureComposerHasPrompt();
          await new Promise((r) => setTimeout(r, 500));

          let diagTick = 0;
          const sendButtonReady = await waitFor(
            () => {
              // Periodically re-inject text if React clears it during
              // async file processing (every ~3 seconds at 200ms poll interval).
              if (diagTick > 0 && diagTick % 15 === 0) {
                ensureComposerHasPrompt();
              }
              const sb = Boolean(sendButton());
              if (diagTick % 10 === 0) {
                console.log("[TB Upload Diag]", {
                  tick: diagTick,
                  currentAttachments: attachmentPreviewCount(),
                  expectedCount: expectedAttachmentCount,
                  sendButtonFound: sb,
                  composerHasText: Boolean(composerDraftText())
                });
              }
              diagTick++;
              return sb;
            },
            Math.min(taskTimeout, 90_000)
          );
          if (!sendButtonReady) {
            // DO NOT re-upload files here. The outer processTask already uploaded
            // them via paste/DataTransfer/DnD. Re-uploading causes duplicate
            // uploads ("你已上传过此文件" error). Instead, re-inject the prompt
            // text (React may have cleared it) and wait for the send button.
            ensureComposerHasPrompt();
            await new Promise((r) => setTimeout(r, 500));
            reportWorkbenchProgress(task, "等待附件处理", 17, `GPT 正在处理 ${expectedAttachmentCount} 个文件，重新注入提示词并等待发送按钮...`);
            const retryReady = await waitFor(() => {
              if (!composerDraftText()) ensureComposerHasPrompt();
              return Boolean(sendButton());
            }, 60_000);
            if (!retryReady) {
              throw productionBoundaryError("SEND_BUTTON_NOT_READY",
                `GPT 发送按钮未就绪：附件 ${attachmentPreviewCount()}/${expectedAttachmentCount}，` +
                `发送按钮在 150 秒内未出现。可能原因：ChatGPT 文件上传未完成或 DOM 结构变更。` +
                `诊断：composer=${Boolean(composer())}, composerText=${composerDraftText().length}字符, scope=${Boolean(composer()?.closest('form'))}`);
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 1_500));
        }
        const previousPlanUserTurn = latestUserTurnWrapper();
        workflow.planSubmitted = true;
        await submitComposer();
        currentPlanPromptTurn = await waitFor(() => {
          const latest = latestUserTurnWrapper();
          return latest && latest !== previousPlanUserTurn ? latest : null;
        }, 15_000) || latestUserTurnWrapper();
        clearComposerDraft();
        // 记录上传素材时发送的提示词
        const uploadPrompt = typeof task.entry.prompt === "string" ? task.entry.prompt : (typeof instruction === "function" ? instruction(task.entry) : "");
        logTaskConversationEvent("upload-sent", { sentText: uploadPrompt, step: "upload-material", meta: { attachmentCount: expectedAttachmentCount } });
        reportWorkbenchProgress(
          task,
          templateInitialization ? "等待模板确认" : "等待迁移计划",
          24,
          templateInitialization ? "GPT 正在读取母版并建立会话环境" : "GPT 正在生成完整逐页迁移计划"
        );
      } else {
        currentPlanPromptTurn = latestUserTurnWrapper();
        reportWorkbenchProgress(task, "继续等待迁移计划", 24, "已恢复当前网页中的计划生成，不重复上传或发送");
      }
    }

    // wait-plan：等待 GPT 返回迁移计划
    async function handleWaitPlan() {
      if (workflow.planDone) return;
      // 从工作流步骤参数读取静默秒数，wfAutoDetect 控制是否走条件检测
      const planQuietMs = (wfAutoDetect("wait-plan") ? wfParam("wait-plan", "quietSeconds", 8) : 2) * 1000;
      const planKeywordPattern = wfAutoDetect("wait-plan")
        ? String(wfParam("wait-plan", "keywordPattern", defaultKeywordPattern("wait-plan")) || defaultKeywordPattern("wait-plan"))
        : "";
      const planWaitOptions = () => ({
        timeout: Math.min(taskTimeout, wfTimeout("wait-plan", 480)),
        minTextLength: 4,
        completionQuietMs: planQuietMs,
        keywordAction: "wait-plan",
        keywordPattern: planKeywordPattern,
        keywordQuietMs: planQuietMs,
        requirePlannedImageCount: requiresPlannedImageCount(task.entry.taskType),
        silentResponseRecoveryMs: templateInitialization ? 0 : 60_000,
        threadErrorRetryMs: templateInitialization ? 0 : 15_000,
        repetitiveLoopRecovery: !templateInitialization,
        baselineKeys: initialAssistantKeys,
        afterTurn: currentPlanPromptTurn
      });
      let planResult = null;
      let planDetection = { ready: false, code: "PLAN_NOT_READY" };
      let planText = "";
      while (!planDetection.ready) {
        try {
          planResult = await waitForAssistantCompletion(initialAssistantCount, planWaitOptions());
          planText = planResult.turns.map(cleanAssistantText).join("\n").trim();
          const planKeywordHit = completionKeywordDetected(planText, { action: "wait-plan", keywordPattern: planKeywordPattern }).matched;
          const validPlan = planKeywordHit || (planText.length >= 80 && /迁移计划|逐页|P\s*1|第\s*1\s*页/i.test(planText));
          const planComplete = Boolean(planResult.responseComplete) || migrationPlanHasCompletionMarker(planText) || planKeywordHit;
          const plannedImageCount = parsePlannedImageCount(planText);
          planDetection = classifyPlanDetectionResult({ validPlan, planComplete, plannedImageCount });
          if (planDetection.ready && !templateInitialization) {
            const pageCap = validatePlanPageCap({ plannedImageCount, text: planText, maximum: 10 });
            if (!pageCap.valid) planDetection = { ready: false, code: pageCap.code };
          }
        } catch (error) {
          if (!/等待 GPT 回复完成超时/.test(String(error?.message || ""))) throw error;
          planDetection = { ready: false, code: "PLAN_NOT_READY" };
        }
        if (planDetection.ready || templateInitialization) break;
        const recovery = decidePlanRecovery({ attempts: workflow.planRecoveryAttempts, maxAttempts: 2 });
        workflow.planRecoveryAttempts = recovery.nextAttempt;
        if (recovery.action !== "retry-current") break;
        if (generatingNow()) {
          await waitFor(() => !generatingNow(), Math.min(taskTimeout, 120_000));
        }
        if (attachmentPreviewCount() > 0 || composerDraftText()) {
          const error = new Error("恢复迁移计划前输入框仍有未发送内容；当前帖子已暂停，不上传下一帖");
          error.code = "COMPOSER_DRAFT_PENDING";
          throw error;
        }
        const capViolation = /PLAN_PAGE_CAP_EXCEEDED|PLAN_BATCHING_FORBIDDEN/.test(planDetection.code);
        const recoveryText = capViolation
          ? "请重写刚才的迁移计划。本套计划和最终成品都最多 10 张；请先完整读取全部素材，再自行筛选、聚类、合并和取舍，只保留 P1-P10 以内。禁止第 11 页，禁止分批，禁止第二批，禁止把剩余素材留到下一批。重写最多 10 页的完整计划，并在结尾等待我回复 1，暂时不要出图。"
          : "请继续处理我上一条已上传的全部附件。先严格按既定格式输出完整逐页迁移计划，并在结尾等待我回复 1，暂时不要出图。";
        reportWorkbenchProgress(
          task,
          capViolation ? "纠正计划页数" : "恢复迁移计划",
          25,
          capViolation
            ? `检测到计划超过 10 页或提出第二批，正在要求原地重写（第 ${recovery.nextAttempt}/2 次），不会回复 1`
            : `GPT 未返回有效计划，正在恢复当前帖子（第 ${recovery.nextAttempt}/2 次），不会上传下一套`
        );
        const previousRecoveryUserTurn = latestUserTurnWrapper();
        await sendComposerText(recoveryText);
        currentPlanPromptTurn = await waitFor(() => {
          const latest = latestUserTurnWrapper();
          return latest && latest !== previousRecoveryUserTurn ? latest : null;
        }, 15_000) || latestUserTurnWrapper();
        logTaskConversationEvent("plan-recovery-sent", { sentText: recoveryText, step: "wait-plan", meta: { attempt: recovery.nextAttempt } });
      }
      if (!templateInitialization) {
        if (planDetection.code === "PLAN_NOT_READY") {
          const error = new Error("GPT 没有返回可确认的迁移计划；当前帖子已暂停，不发送 1、不上传下一帖");
          error.code = "PLAN_NOT_READY";
          throw error;
        }
        if (planDetection.code === "PLAN_NOT_COMPLETE") {
          const error = new Error("迁移计划正文尚未稳定结束；当前帖子已暂停，不发送 1、不上传下一帖");
          error.code = "PLAN_NOT_COMPLETE";
          throw error;
        }
        if (/PLAN_PAGE_CAP_EXCEEDED|PLAN_BATCHING_FORBIDDEN/.test(planDetection.code)) {
          const error = new Error("GPT 迁移计划仍超过 10 页或提出第二批；当前帖子已暂停，不发送 1、不消耗生图额度、不上传下一套素材");
          error.code = planDetection.code;
          throw error;
        }
        workflow.planText = planText;
        workflow.plannedImageCount = parsePlannedImageCount(planText);
        // 记录 GPT 返回的迁移计划全文
        logTaskConversationEvent("plan-received", { receivedText: planText, step: "wait-plan", meta: { plannedImageCount: workflow.plannedImageCount } });
        if (!workflow.plannedImageCount) {
          const error = new Error("迁移计划已返回，但无法解析预计页数；当前帖子已暂停，不上传下一帖");
          error.code = "PLAN_PARSE_FAILED";
          throw error;
        }
      }
      workflow.planDone = true;
      await saveCheckpoint("迁移计划完成", 32);
      // 模板初始化：计划完成后提前返回
      if (templateInitialization) {
        reportWorkbenchProgress(task, "模板已就绪", 100, "当前会话已完成母版环境初始化");
        earlyReturn = { templateInitialized: true, conversationUrl: location.href };
        return;
      }
      // autoConfirm 关闭：计划完成后等待人工确认
      if (options.autoConfirm === false) {
        reportWorkbenchProgress(task, "等待人工确认", 30, "迁移计划已完成，自动发送 1 已关闭");
        earlyReturn = { plannedOnly: true };
        return;
      }
    }

    // send-confirm：发送确认文字（如"1"）触发图片生成
    async function handleSendConfirm() {
      if (workflow.imageSubmitted) {
        if (!workflow.downloadResult) {
          reportWorkbenchProgress(task, "继续等待生成图片", 48, "已恢复当前网页中的图片生成，不重复发送 1");
        }
        return;
      }
      workflow.beforeImagesCount = assistantTurns().length;
      workflow.generatedBaselineUrls = generatedImageUrls();
      const confirmDelayMs = 1_000 + Math.floor(Math.random() * 4_001);
      const confirmText = wfText("send-confirm", String(options.confirmText || "1").trim() || "1");
      reportWorkbenchProgress(task, "确认出图", 36, `迁移计划已完成，将在 ${Math.ceil(confirmDelayMs / 1000)} 秒内自动发送 ${confirmText}`);
      await new Promise((resolve) => setTimeout(resolve, confirmDelayMs));
      await sendComposerText(confirmText);
      // 记录发送的确认文字（如"1"）
      logTaskConversationEvent("confirm-sent", { sentText: confirmText, step: "send-confirm" });
      workflow.imageSubmitted = true;
      await saveCheckpoint("已发送确认", 38);
    }

    // wait-images：等待本轮图片生成完成
    async function handleWaitImages() {
      if (workflow.downloadResult) return; // 图片已下载，无需再等
      let expectedImages = Math.max(1, Number(workflow.plannedImageCount || 0));
      // 从工作流步骤参数读取最小图片数，wfAutoDetect 控制是否走条件检测
      const minimumImages = wfAutoDetect("wait-images")
        ? Math.max(1, wfParam("wait-images", "minImages", 4))
        : Math.max(1, Number(options.minimumImageCount || 4));
      const baselineUrls = Array.isArray(workflow.generatedBaselineUrls) ? workflow.generatedBaselineUrls : [];
      const imageKeywordPattern = wfAutoDetect("wait-images")
        ? String(wfParam("wait-images", "keywordPattern", defaultKeywordPattern("wait-images")) || defaultKeywordPattern("wait-images"))
        : "";
      const imageQuietMs = (wfAutoDetect("wait-images") ? wfParam("wait-images", "quietSeconds", 3) : 3) * 1000;
      let imageUrls = Array.isArray(workflow.generatedImageUrls) ? workflow.generatedImageUrls : [];
      reportWorkbenchProgress(task, "等待图片", 48, `已发送 1，正在等待本轮 ${expectedImages} 张图片生成`);
      let imageDetection;
      const maxSilentRecoveryAttempts = 2;
      while (true) {
        imageDetection = await waitForGeneratedImageGrowth(
          baselineUrls,
          0,
          wfAutoDetect("wait-images") ? wfTimeout("wait-images", 900) : taskTimeout,
          expectedImages,
          async () => {
          if (workflow.batchChoiceSubmitted || !currentBatchChoicePrompt()) return;
          // A plan with more than ten pages can ask the operator which batch
          // to run. The automatic workflow always takes the first batch, then
          // continues with the same post; never inject the next material.
          workflow.batchChoiceSubmitted = true;
          const choice = firstBatchChoice({ plannedImageCount: expectedImages, maximum: 10 });
          expectedImages = choice.expectedImageCount;
          workflow.plannedImageCount = expectedImages;
          reportWorkbenchProgress(task, "确认首批出图", 38, "当前计划超过单轮上限，已自动选择第一批 P1-P10");
          await replaceComposerText(choice.reply, task.entry);
          await submitComposer();
          clearComposerDraft();
          await saveCheckpoint("已确认首批出图", 40);
          },
          {
            keywordPattern: imageKeywordPattern,
            keywordQuietMs: imageQuietMs,
            baselineAssistantTurns: Number(workflow.beforeImagesCount || 0),
            silentThresholdMs: 60_000
          }
        );
        if (imageDetection.evidence !== "silent-image-response") break;
        const recoveryAttempts = Math.max(0, Number(workflow.imageRecoveryAttempts || 0));
        if (recoveryAttempts >= maxSilentRecoveryAttempts) break;
        workflow.imageRecoveryAttempts = recoveryAttempts + 1;
        const recoveryPrompt = "请继续完成刚才已经确认的全部图片生成。不要重新输出计划，直接按已确认的 P1-P10（或实际页数）生成全部独立 3:4 图片。";
        reportWorkbenchProgress(task, "恢复图片生成", 50, `网页已停止但没有返回图片，正在原地续接（${workflow.imageRecoveryAttempts}/${maxSilentRecoveryAttempts}）`);
        await sendComposerText(recoveryPrompt);
        logTaskConversationEvent("image-recovery-sent", {
          sentText: recoveryPrompt,
          step: "wait-images",
          meta: { attempt: workflow.imageRecoveryAttempts }
        });
        await saveCheckpoint("已续接图片生成", 50);
      }
      let detected = imageDetection.urls;
      workflow.generatedImageUrls = detected;
      workflow.generatedImageDetection = {
        confident: imageDetection.confident,
        evidence: imageDetection.evidence,
        detectedAt: new Date().toISOString(),
        turnKey: imageDetection.completion?.turnKey || "",
        declaredCount: Number(imageDetection.completion?.declaredCount || 0)
      };
      // 记录检测到的图片 URL
      logTaskConversationEvent("images-detected", {
        step: "wait-images",
        imageUrls: detected,
        meta: { expectedImages, confident: imageDetection.confident, declaredCount: Number(imageDetection.completion?.declaredCount || 0) }
      });
      reportWorkbenchProgress(
        task,
        "等待图片",
        64,
        `已核对本轮 ${detected.length} 张新图（计划 ${expectedImages} 张；${imageDetection.confident ? "回复已完整结束" : "检测证据不足"}）`
      );
      if (!imageDetection.confident && detected.length < minimumImages) {
        const error = new Error(`图片数量检测不确定：当前找到 ${detected.length} 张，但没有取得"回复完整结束"证据；已暂停当前素材，未判定额度触顶`);
        error.code = "IMAGE_COUNT_UNCERTAIN";
        error.detectedImages = detected.length;
        throw error;
      }
      // 低图触顶补充检测:本轮只出 4 张及以下,且计划要求更多 → 疑似撞到生图上限。
      // PY脚本兜底拼图已在 waitForGeneratedImageGrowth 中通过 hardFailure 拦截;
      // 这里处理"直接少给图"的情况:计划 10 张但只出 4 张及以下。
      const imgCompletion = imageDetection.completion;
      if (detected.length > 0 && detected.length <= 4 && expectedImages > 4) {
        const error = new Error(`检测到 GPT 触顶特征:本轮只生成 ${detected.length} 张图片(计划 ${expectedImages} 张),疑似撞到生图上限;已停止本帖`);
        error.code = "GENERATION_LIMIT_SIGNAL";
        error.detectedImages = detected.length;
        error.riskReason = imgCompletion?.pyScriptFallbackSignal ? "py-script-fallback" : "low-image-output";
        throw error;
      }
      if (detected.length < minimumImages) {
        const error = new Error(`生成结果不足：本轮完整回复只有 ${detected.length} 张，安全线为 ${minimumImages} 张；本素材已跳过，不补页、不续作、不打包`);
        error.detectedImages = detected.length;
        throw error;
      }
      workflow.generatedImageUrls = detected;
      task.entry.generatedImages = detected.length;
      // Count generation when the current GPT reply is confirmed complete,
      // not when the later network download finishes.  This keeps the
      // rolling account usage and cat status current during the wait for TXT.
      if (!workflow.generationQuotaRecorded) {
        await recordWorkbenchQuota(task.entry, "generated", detected.length);
        workflow.generationQuotaRecorded = true;
        await saveCheckpoint("本轮生图数量已记入账号额度", 66);
      }
    }

    // request-copy：发送小红书文案请求
    async function handleRequestCopy() {
      if (!wfEnabled("request-copy")) {
        const error = new Error("文案请求环节已禁用，未创建 TXT；本轮不下载或打包图片，等待手动完成文案后再继续");
        error.code = "COPY_REQUIRED";
        throw error;
      }
      if (workflow.textSubmitted) {
        if (!workflow.copyText) {
          reportWorkbenchProgress(task, "继续等待小红书文案", 84, "已恢复当前网页中的文案生成，不重复发送请求");
        } else {
          reportWorkbenchProgress(task, "跳过文案请求", 84, "检测到本轮文案已完成（断点恢复），跳过请求小红书文案步骤");
        }
        return;
      }
      workflow.beforeTextCount = assistantTurns().length;
      workflow.beforeTextKeys = assistantTurnKeys();
      const copyPromptText = normalizePublishCopyPrompt(wfText("request-copy", normalizePublishCopyPrompt(options.copyPrompt)));
      reportWorkbenchProgress(task, "生成小红书文案", 72, "图片已完成，正在请求本帖文案；文案完成后才下载图片并打包");
      await sendComposerText(copyPromptText);
      // 记录文案请求发送的文字
      logTaskConversationEvent("copy-requested", { sentText: copyPromptText, step: "request-copy" });
      workflow.textSubmitted = true;
    }

    // wait-copy：等待小红书文案生成完成
    async function handleWaitCopy() {
      if (workflow.copyText) return;
      reportWorkbenchProgress(task, "等待小红书文案", 72, "图片已生成，先取得本轮文案；文案完成前不下载、不打包");
      const requestedCopyPrompt = normalizePublishCopyPrompt(wfText("request-copy", normalizePublishCopyPrompt(options.copyPrompt)));
      // 从工作流步骤参数读取超时和最小字数
      const copyTimeoutMs = wfAutoDetect("wait-copy") ? wfTimeout("wait-copy", 480) : 8 * 60_000;
      const copyMinLength = wfAutoDetect("wait-copy") ? wfParam("wait-copy", "minCopyLength", 300) : 300;
      const copyKeywordPattern = wfAutoDetect("wait-copy")
        ? String(wfParam("wait-copy", "keywordPattern", defaultKeywordPattern("wait-copy")) || defaultKeywordPattern("wait-copy"))
        : "";
      const publishResult = await waitForPublishCopy(requestedCopyPrompt, copyTimeoutMs, {
        minimum: copyMinLength,
        keywordPattern: copyKeywordPattern
      });
      workflow.copyText = String(publishResult?.text || "").trim();
      // 记录 GPT 返回的小红书文案全文
      logTaskConversationEvent("copy-received", { receivedText: workflow.copyText, step: "wait-copy", meta: { copyLength: workflow.copyText.length } });
      // 文案校验
      const copyMinCheck = wfAutoDetect("wait-copy") ? wfParam("wait-copy", "minCopyLength", 300) : 300;
      if (!isLikelyPublishCopy(workflow.copyText, copyMinCheck)) {
        const copyError = new Error(`没有检测到不少于 ${copyMinCheck} 个可见字符的完整小红书文案，未执行图片下载与打包`);
        copyError.code = "COPY_REQUIRED";
        throw copyError;
      }
      workflow.textSubmitted = true;
      workflow.batchId ||= workPackageBatchId();
    }

    // ── 打包归档公共逻辑：move-archive（分离）和 package-archive（合并）共用 ──
    // clipboard 写入 + packageDownloadedReply 调用 + 查重跳过 + 事件分发
    async function archivePackageReply(copyText, downloadResult, checkpointLabel, dispatchEvent) {
      if (workflow.packageResult) return; // 已归档
      try { await navigator.clipboard.writeText(copyText); } catch (e) { /* optional */ }
      const downloadedFileDirectories = [...new Set((downloadResult.files || [])
        .map((file) => String(file || "").replace(/[\\/][^\\/]+$/, ""))
        .filter(Boolean))];
      const packageDownloadRoot = downloadedFileDirectories.length === 1
        ? downloadedFileDirectories[0]
        : String(downloadResult.downloadRoot || options.downloadRoot || "").trim();
      const packageResult = await packageDownloadedReply({
        clipboardText: copyText,
        title: task.entry.name,
        conversationUrl: location.href,
        accountName: localStorage.getItem("tb-workbench-account-id") || "",
        sourceMaterialPath: String(task.entry.materialPath || task.entry.path || ""),
        batchId: downloadResult.batchId,
        expectedImageCount: downloadResult.count,
        downloadRoot: packageDownloadRoot,
        productRoot: String(options.productRoot || "").trim()
      });
      workflow.packageResult = packageResult;
      // Successful packaging closes the latest material turn. Persist that
      // boundary so a same-conversation next post is not blocked as stale.
      markArchivedAutomationBoundary();
      // 记录打包归档结果
      logTaskConversationEvent("archived", {
        step: "archive",
        packagePath: String(packageResult?.packagePath || packageResult?.finalPath || ""),
        copyTextPath: workflow.copyTextPath || "",
        meta: {
          duplicate: Boolean(packageResult.duplicate),
          duplicateReason: packageResult.duplicateReason || "",
          imageCount: downloadResult.count,
          batchId: downloadResult.batchId
        }
      });
      if (packageResult.duplicate) {
        reportWorkbenchProgress(task, "查重跳过", 100,
          `与历史作品图片完全重复，已删除本轮 ${Number(packageResult.deletedImages || downloadResult.count)} 张暂存图片并跳过`);
        earlyReturn = {
          downloadedImages: downloadResult.count,
          plannedImageCount: Number(workflow.plannedImageCount || 0),
          batchId: downloadResult.batchId,
          packageResult,
          duplicateSkipped: true,
          duplicateReason: packageResult.duplicateReason || "ExactImageSet",
          conversationUrl: location.href
        };
        return;
      }
      if (checkpointLabel) await saveCheckpoint(checkpointLabel, 96);
      if (dispatchEvent) {
        document.dispatchEvent(new CustomEvent("tb-gpt-image-download-complete", {
          detail: {
            urls: Array.isArray(workflow.generatedImageUrls) ? workflow.generatedImageUrls : [],
            downloaded: downloadResult.count,
            total: Math.max(downloadResult.count, Number(workflow.plannedImageCount || 0)),
            batchId: downloadResult.batchId,
            state: "packaged",
            source: "automatic"
          }
        }));
      }
      reportWorkbenchProgress(task, "完成", 100, `已打包 ${downloadResult.count} 张图片和小红书文案`);
    }

    // ── 统一归档 handler ──
    // save-text / download-images / move-archive（分离模式）和 package-archive（合并模式）共用
    // 由 step.action 决定执行哪个归档子操作，消除 usesSeparatedArchive 分支
    async function handleArchive(step) {
      const action = step.action;

      // save-text：保存文案 TXT（分离模式）
      if (action === "save-text") {
        if (!wfEnabled("save-text")) {
          reportWorkbenchProgress(task, "跳过文案保存", 80, "save-text 环节已禁用");
          return;
        }
        if (workflow.copyTextPath) return; // 已保存
        const copyFile = await api("/api/extension/save-copy-text", {
          method: "POST",
          body: JSON.stringify({
            batchId: workflow.batchId,
            copyText: workflow.copyText,
            downloadRoot: String(options.downloadRoot || "")
          })
        });
        if (!copyFile?.ok || !copyFile.filename) throw new Error(copyFile?.error || "本轮文案 TXT 保存失败");
        workflow.copyTextPath = String(copyFile.filename);
        // 记录文案保存路径
        logTaskConversationEvent("text-saved", { step: "save-text", copyTextPath: workflow.copyTextPath, meta: { copyLength: workflow.copyText.length } });
        reportWorkbenchProgress(task, "文案已保存", 80, `TXT 已写入：${copyFile.filename}`);
        await saveCheckpoint("文案 TXT 已保存", 80);
        return;
      }

      // download-images：下载图片（分离模式）
      if (action === "download-images") {
        if (!wfEnabled("download-images")) {
          reportWorkbenchProgress(task, "跳过图片下载", 85, "download-images 环节已禁用");
          return;
        }
        if (workflow.downloadResult) return; // 已下载
        const imageUrls = workflow.generatedImageUrls || [];
        workflow.downloadResult = await downloadFreshImages(imageUrls, task);
        workflow.downloadResult.downloadRoot = String(options.downloadRoot || "");
        // 记录下载的图片信息
        logTaskConversationEvent("images-downloaded", {
          step: "download-images",
          imageUrls,
          downloadedFiles: (workflow.downloadResult.files || []).map(f => String(f)),
          meta: { count: workflow.downloadResult.count, downloadRoot: workflow.downloadResult.downloadRoot }
        });
        await saveCheckpoint("图片下载完成", 85);
        const downloadedImages = workflow.downloadResult.count;
        if (!downloadedImages) throw new Error("图片下载数量为 0");
        const minimumImages = Math.max(1, Number(options.minimumImageCount || 4));
        if (downloadedImages < minimumImages) {
          throw new Error(`生成图片不足：实际 ${downloadedImages} 张，安全线为 ${minimumImages} 张`);
        }
        reportWorkbenchProgress(task, "图片已下载", 88, `${downloadedImages} 张图片已保存到本地`);
        return;
      }

      // move-archive：移动到成品库（分离模式）
      if (action === "move-archive") {
        if (!wfEnabled("move-archive")) {
          reportWorkbenchProgress(task, "完成", 100, "move-archive 环节已禁用，文件保留在下载目录");
          return;
        }
        await archivePackageReply(workflow.copyText, workflow.downloadResult, "作品归档完成", false);
        return;
      }

      // package-archive：合并模式，一次性完成保存+下载+打包
      if (action === "package-archive") {
        if (!wfEnabled("package-archive")) return;
        if (workflow.packageResult) return; // 已打包
        const copyText = workflow.copyText;

        // 1. 保存文案 TXT
        if (!workflow.copyTextPath) {
          const copyFile = await api("/api/extension/save-copy-text", {
            method: "POST",
            body: JSON.stringify({
              batchId: workflow.batchId,
              copyText,
              downloadRoot: String(options.downloadRoot || "")
            })
          });
          if (!copyFile?.ok || !copyFile.filename) throw new Error(copyFile?.error || "本轮文案 TXT 保存失败，未下载图片");
          workflow.copyTextPath = String(copyFile.filename);
          // 记录文案保存路径（合并模式）
          logTaskConversationEvent("text-saved", { step: "package-archive/save-text", copyTextPath: workflow.copyTextPath, meta: { copyLength: copyText.length } });
          await saveCheckpoint("文案 TXT 已保存", 78);
        }

        // 2. 下载图片
        if (!workflow.downloadResult) {
          const imageUrls = workflow.generatedImageUrls || [];
          workflow.downloadResult = await downloadFreshImages(imageUrls, task);
          workflow.downloadResult.downloadRoot = String(options.downloadRoot || "");
          // 记录下载的图片信息（合并模式）
          logTaskConversationEvent("images-downloaded", {
            step: "package-archive/download-images",
            imageUrls,
            downloadedFiles: (workflow.downloadResult.files || []).map(f => String(f)),
            meta: { count: workflow.downloadResult.count, downloadRoot: workflow.downloadResult.downloadRoot }
          });
          await saveCheckpoint("图片下载完成", 80);
        }
        const downloadResult = workflow.downloadResult;
        const downloadedImages = downloadResult.count;
        if (!downloadedImages) throw new Error("图片下载数量为 0，未执行打包");
        const minimumImages = Math.max(1, Number(options.minimumImageCount || 4));
        if (downloadedImages < minimumImages) {
          throw new Error(`生成图片不足：实际 ${downloadedImages} 张，安全线为 ${minimumImages} 张；本素材已跳过，未执行打包`);
        }
        await saveCheckpoint("文案与图片准备完成", 89);
        try {
          await navigator.clipboard.writeText(copyText);
        } catch (error) {
          console.warn("[团建自动生产] 剪贴板不可用，继续直接写入 TXT：", error);
          reportWorkbenchProgress(task, "保存小红书文案", 89, "网页当前不在焦点，已跳过剪贴板并直接写入 TXT");
        }

        // 3. 检查自动打包开关
        reportWorkbenchProgress(task, "打包作品", 92, `已下载 ${downloadedImages} 张图，正在写入 TXT 并打包`);
        if (options.autoPackage === false) {
          reportWorkbenchProgress(task, "完成", 100, `已下载 ${downloadedImages} 张图并复制文案；自动打包已关闭`);
          earlyReturn = { downloadedImages, copyText, packageSkipped: true, batchId: downloadResult.batchId, conversationUrl: location.href };
          return;
        }

        // 4. 打包归档
        await archivePackageReply(copyText, downloadResult, "作品打包完成", true);
      }
    }
    if (task.entry.reconcileAction === "nudge-plan" && stateSnapshot.stage === "waiting-plan" && !generatingNow()) {
      // A refresh can leave the attachment turn in the conversation while
      // GPT never starts its reply.  Reuse the current turn and send a small
      // nudge; do not upload the material again.
      await replaceComposerText("请继续输出当前这份素材的逐页迁移计划，先不要出图，完成后等待我回复 1。", task.entry);
      await submitComposer();
      clearComposerDraft();
      // 记录补发计划请求
      logTaskConversationEvent("nudge-plan-sent", { sentText: "请继续输出当前这份素材的逐页迁移计划，先不要出图，完成后等待我回复 1。", step: "nudge-plan" });
      reportWorkbenchProgress(task, "已重新请求迁移计划", 18, "检测到上传后网页没有继续响应，已在当前对话补发计划请求");
      task.entry.reconcileAction = "";
    }
    const boundaryDecision = classifyAutomationBoundaryPause(stateSnapshot);
    if (boundaryDecision.shouldPause) {
      logGptLimitDebug("state-snapshot-boundary-pause", {
        code: boundaryDecision.code,
        riskReason: boundaryDecision.riskReason,
        message: boundaryDecision.message,
        stage: stateSnapshot.stage,
        latestImageCount: stateSnapshot.latestImageCount,
        scriptOutput: stateSnapshot.scriptOutput,
        scriptOutputLimitSignal: stateSnapshot.scriptOutputLimitSignal,
        pyScriptFallbackSignal: stateSnapshot.pyScriptFallbackSignal,
        limitSignal: stateSnapshot.limitSignal,
        lowImageLimit: stateSnapshot.lowImageLimit,
        latestAssistantTextSample: String(stateSnapshot.latestAssistantText || "").slice(0, 500)
      });
      const error = new Error(boundaryDecision.message);
      error.code = boundaryDecision.code;
      error.riskReason = boundaryDecision.riskReason;
      throw error;
    }
    const retryStage = String(task.entry.retryFromStage || "");
    const checkpointRequestId = String(task.entry.externalRequestId || "");
    const saveCheckpoint = async (stage, percent) => {
      if (!checkpointRequestId) return null;
      return api("/api/gpt-production/checkpoint", {
        method: "POST",
        body: JSON.stringify({
          requestId: checkpointRequestId,
          checkpoint: {
            stage,
            percent,
            conversationUrl: location.href,
            sourceMaterialPath: String(task.entry.materialPath || task.entry.path || ""),
            plannedImageCount: workflow.plannedImageCount,
            planSubmitted: workflow.planSubmitted,
            imageSubmitted: workflow.imageSubmitted,
            generatedImageUrls: workflow.generatedImageUrls || [],
            textSubmitted: workflow.textSubmitted,
            batchId: workflow.downloadResult?.batchId || workflow.batchId,
            downloadRoot: workflow.downloadResult?.downloadRoot || options.downloadRoot,
            downloadedFiles: workflow.downloadResult?.files || [],
            copyText: workflow.copyText || "",
            copyTextPath: workflow.copyTextPath || "",
            packagePath: workflow.packageResult?.packagePath || ""
          }
        })
      }).catch(() => null);
    };
    if (checkpointRequestId && retryStage) {
      const saved = await api(`/api/gpt-production/checkpoint?requestId=${encodeURIComponent(checkpointRequestId)}`).catch(() => null);
      const checkpoint = saved?.checkpoint;
      if (checkpoint && checkpoint.conversationUrl === location.href) {
        workflow.plannedImageCount ||= Number(checkpoint.plannedImageCount || 0);
        workflow.planSubmitted ||= Boolean(checkpoint.planSubmitted);
        workflow.planDone ||= Boolean(checkpoint.plannedImageCount && checkpoint.planSubmitted);
        workflow.imageSubmitted ||= Boolean(checkpoint.imageSubmitted);
        workflow.generatedImageUrls ||= checkpoint.generatedImageUrls || [];
        workflow.textSubmitted ||= Boolean(checkpoint.textSubmitted);
        workflow.copyText ||= String(checkpoint.copyText || "");
        workflow.batchId ||= String(checkpoint.batchId || "");
        workflow.copyTextPath ||= String(checkpoint.copyTextPath || "");
        workflow.sourceMaterialPath ||= String(checkpoint.sourceMaterialPath || task.entry.materialPath || task.entry.path || "");
        if (!workflow.downloadResult && checkpoint.batchId && checkpoint.downloadedFiles?.length) {
          const checkpointFiles = checkpoint.downloadedFiles.map((file) => String(file || "")).filter(Boolean);
          const checkpointDirectories = [...new Set(checkpointFiles.map((file) => file.replace(/[\\/][^\\/]+$/, "")))];
          workflow.downloadResult = {
            count: checkpointFiles.length,
            batchId: checkpoint.batchId,
            files: checkpointFiles,
            downloadRoot: checkpointDirectories.length === 1
              ? checkpointDirectories[0]
              : (checkpoint.downloadRoot || options.downloadRoot)
          };
        }
        if (checkpoint.packagePath) workflow.packageResult = { ok: true, packagePath: checkpoint.packagePath };
      }
    }
    if (/下载图片|生成小红书文案|纠正文案|保存小红书文案|打包作品|clipboard|剪贴板/i.test(retryStage)) {
      workflow.plannedImageCount ||= Math.max(0, Number(task.entry.expectedImages || 0));
      workflow.planSubmitted = true;
      workflow.planDone = true;
      workflow.imageSubmitted = true;
      if (!workflow.downloadResult && workflow.plannedImageCount) {
        const recovered = await api("/api/gpt-production/recover-image-batch", {
          method: "POST",
          body: JSON.stringify({
            expectedImageCount: workflow.plannedImageCount,
            downloadRoot: String(options.downloadRoot || "")
          })
        }).catch(() => null);
        if (recovered?.batch?.files?.length === workflow.plannedImageCount) {
          workflow.downloadResult = recovered.batch;
          reportWorkbenchProgress(task, "恢复已下载图片", 82, `已核对本地 ${workflow.plannedImageCount} 张本轮图片，不重复下载或生成`);
        }
      }
    }
    if (!workflow.planDone && /等待迁移计划|提交迁移计划|确认出图/i.test(retryStage)) {
      const latestPlanTurn = [...assistantTurns()].reverse().find((turn) => {
        const text = cleanAssistantText(turn);
        return text.length >= 80
          && /迁移计划|逐页|P\s*1|第\s*1\s*页/i.test(text)
          && /等待.{0,12}(?:回复|输入).{0,6}1|暂时不出图/i.test(text);
      });
      const recoveredPlanText = cleanAssistantText(latestPlanTurn);
      const recoveredCount = parsePlannedImageCount(recoveredPlanText);
      if (latestPlanTurn && recoveredCount) {
        workflow.planSubmitted = true;
        workflow.planDone = true;
        workflow.planText = recoveredPlanText;
        workflow.plannedImageCount = recoveredCount;
        reportWorkbenchProgress(task, "恢复迁移计划", 32, `已识别当前网页完成的 ${recoveredCount} 页计划，不重复上传素材`);
      }
    }
    if (/等待图片|生成图片|下载图片|download/i.test(String(task.entry.retryFromStage || ""))) {
      const turns = await waitFor(() => {
        const currentTurns = assistantTurns();
        return currentTurns.some((turn) => freshImageUrls([turn]).length) ? currentTurns : null;
      }, 30_000);
      if (!turns) {
        throw new Error("恢复下载失败：等待 30 秒后仍没有找到最近一次生成图片");
      }
      const taskExpectedImages = Math.max(0, Number(task.entry.expectedImages || 0));
      let generatedTurnIndex = -1;
      if (taskExpectedImages) {
        for (let index = turns.length - 1; index >= 0; index -= 1) {
          if (freshImageUrls([turns[index]]).length === taskExpectedImages) {
            generatedTurnIndex = index;
            break;
          }
        }
      }
      for (let index = turns.length - 1; index >= 0; index -= 1) {
        if (generatedTurnIndex >= 0) break;
        if (freshImageUrls([turns[index]]).length) {
          generatedTurnIndex = index;
          break;
        }
      }
      if (generatedTurnIndex < 0) throw new Error("恢复下载失败：当前会话中没有找到最近一次生成图片");
      const recoveredImageUrls = freshImageUrls([turns[generatedTurnIndex]]);
      const recoveredSet = new Set(recoveredImageUrls);
      workflow.planDone = true;
      workflow.imageSubmitted = true;
      workflow.beforeImagesCount = generatedTurnIndex;
      // A persisted checkpoint may contain a count parsed from an older plan in the
      // same long-running conversation. During recovery the queue entry is the
      // authoritative batch contract; fall back to the recovered reply only when
      // that contract did not record an expected count.
      workflow.plannedImageCount = taskExpectedImages || recoveredImageUrls.length;
      workflow.generatedImageUrls = recoveredImageUrls;
      workflow.generatedBaselineUrls = generatedImageUrls().filter((url) => !recoveredSet.has(url));
      reportWorkbenchProgress(task, "恢复下载图片", 64, `已找到当前会话最近一次 ${recoveredImageUrls.length} 张生成结果，不重复提交计划或消耗生图额度`);
    }
    if (/下载图片|生成小红书文案|纠正文案|打包作品|clipboard|剪贴板/i.test(retryStage) && !workflow.copyText) {
      const latestCopyTurn = latestCopyTurnAfterPrompt(options.copyPrompt);
      const recoveredCopy = cleanAssistantText(latestCopyTurn);
      if (isLikelyPublishCopy(recoveredCopy, 300)) {
        workflow.copyText = recoveredCopy;
        workflow.textSubmitted = true;
        reportWorkbenchProgress(task, "恢复小红书文案", 88, "已识别当前网页完成的文案，不重复发送文案请求");
        await saveCheckpoint("恢复小红书文案", 88);
      }
    }
    const initialAssistantCount = workflow.initialAssistantCount ?? assistantTurns().length;
    workflow.initialAssistantCount = initialAssistantCount;
    const initialAssistantKeys = workflow.initialAssistantKeys ?? assistantTurnKeys();
    workflow.initialAssistantKeys = initialAssistantKeys;
    const templateInitialization = task.entry.taskType === "template-init";
    // Reusing the current conversation means reusing its established master
    // rules, never reusing an old material's migration plan. Every fresh post
    // must submit its own attachments/instruction and receive a new assistant
    // plan before the workflow is allowed to send the confirmation text.

    // ── 按工作流步骤顺序执行（替代原硬编码序列） ──
    // 遍历 wfSteps 数组，按用户拖动的顺序依次执行每个步骤
    // 主流程步骤由对应 handler 处理，工具步骤由 executeUtilityStep 处理
    // 每个 handler 通过 workflow 状态标志去重，支持断点恢复
    let earlyReturn = null;

    // 构建步骤分发表：4 个归档动作统一指向 handleArchive，由 step.action 内部分发
    const mainFlowHandlers = {
      "upload-material": handleUploadMaterial,
      "wait-plan": handleWaitPlan,
      "send-confirm": handleSendConfirm,
      "wait-images": handleWaitImages,
      "request-copy": handleRequestCopy,
      "wait-copy": handleWaitCopy,
      "save-text": handleArchive,
      "download-images": handleArchive,
      "move-archive": handleArchive,
      "package-archive": handleArchive,
    };

    for (const step of wfSteps) {
      if (step.enabled === false) continue;
      if (earlyReturn) break;

      // Diagnostic: log each step being executed to verify the complete
      // workflow runs (especially send-confirm and request-copy)
      api("/api/gpt-production/dom-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "wf-step-execute",
          action: step.action,
          enabled: step.enabled,
          hasText: Boolean(step.text),
          wfStepsCount: wfSteps.length,
          wfStepsActions: wfSteps.map((s) => s.action),
          usedFallback: wfSteps === DEFAULT_WF_STEPS
        })
      }).catch(() => {});

      const handler = mainFlowHandlers[step.action];
      if (handler) {
        await handler(step);
      } else {
        // 工具模块（wait-fixed / wait-random / send-text / clipboard-copy / detect-* / time-window / retry）
        const shouldContinue = await executeUtilityStep(step);
        if (!shouldContinue) return { paused: true, reason: "时间窗口外暂停" };
      }
    }

    // 检查是否有提前返回（模板初始化、autoConfirm 关闭、查重跳过、autoPackage 关闭等）
    if (earlyReturn) return earlyReturn;

    // ── 素材归档（分离模式和合并模式统一处理） ──
    // 条件：autoArchive !== false && isMaterialTask && materialPath
    const materialPath = String(task.entry.materialPath || task.entry.path || "").trim();
    const isMaterialTask = task.entry.entryKind === "material" || task.entry.taskType === "material";
    if (options.autoArchive !== false && isMaterialTask && materialPath) {
      reportWorkbenchProgress(task, "归档素材", 97, "作品已校验，正在登记使用次数并移动原素材");
      const archiveRequest = api("/api/gpt-production/archive-material", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryPath: materialPath,
          requestId: task.entry.externalRequestId,
          templateId: task.entry.templateId || "",
          conversationUrl: location.href,
          packagePath: workflow.packageResult?.packagePath || ""
        })
      });
      const archiveTimeout = new Promise((_, reject) => setTimeout(() => {
        reject(productionBoundaryError(
          "ARCHIVE_CONFIRMATION_TIMEOUT",
          "作品文件已经生成，但素材归档在 90 秒内没有返回确认；已停在当前作品边界，重试时不会重新生图"
        ));
      }, 90_000));
      const archiveResult = await Promise.race([archiveRequest, archiveTimeout]);
      if (!archiveResult?.ok) throw new Error(archiveResult?.error || "作品已完成，但素材归档失败");
      workflow.archiveResult = archiveResult?.archive || null;
    }

    // ── 返回最终结果 ──
    return {
      downloadedImages: workflow.downloadResult?.count || 0,
      copyText: workflow.copyText || "",
      copyTextPath: workflow.copyTextPath || "",
      plannedImageCount: Number(workflow.plannedImageCount || 0),
      batchId: workflow.downloadResult?.batchId || workflow.batchId,
      packageResult: workflow.packageResult || null,
      archiveResult: workflow.archiveResult || null,
      conversationUrl: location.href
    };
  }

  function uploadEntry(entry) {
    if (!entry) return;
    // A direct/manual upload is an explicit user action after cleanup.
    if (!entry.externalRequestId) state.boundaryPaused = false;
    const duplicate = state.uploadTasks.find((task) =>
      task.entry.id === entry.id && ["queued", "reading", "attaching"].includes(task.status)
    );
    if (duplicate) {
      setStatus("这个文件夹已经在上传队列中");
      return;
    }
    state.uploadSequence += 1;
    state.uploadTasks.push({
      id: state.uploadSequence,
      entry,
      status: "queued",
      total: (entry.attachments || []).slice(0, 30).length,
      completed: 0,
      error: "",
      controller: new AbortController()
    });
    if (state.uploadTasks.length > 12) state.uploadTasks.splice(0, state.uploadTasks.length - 12);
    renderQueue();
    setStatus(`已加入上传队列：${entry.name}`);
    processUploadQueue();
  }

  async function processUploadQueue() {
    if (state.busy) return;
    const task = state.uploadTasks.find((item) => item.status === "queued");
    if (!task) return;
    state.busy = true;
    const { entry } = task;
    setBusy(entry, `正在准备“${entry.name}”的文件…`);
    try {
      if (!composer() && !/^\/share\//i.test(location.pathname)) {
        // Normal /c/ conversations are not online templates. GPT can take a
        // moment to mount the composer after a tab switch or wake-up; wait for
        // the real control before entering the share-template branch below.
        reportWorkbenchProgress(task, "Waiting for GPT composer", 3, "GPT is restoring the conversation input");
        const ready = await waitFor(() => Boolean(composer()), 20_000);
        if (!ready) throw new Error("GPT composer is not ready; retry after the conversation wakes up");
      }
      if (!composer()) {
        reportWorkbenchProgress(task, "打开在线模板", 3, "正在把分享模板续接为当前账号可编辑的对话");
        const editable = await ensureEditableConversation();
        if (!editable) throw new Error("在线模板当前不可编辑；请使用 ChatGPT 会话链接，或先在分享页点击“继续此对话”");
      }
      const paths = (entry.attachments || []).slice(0, 30);
      let files = [];
      let workflowResult = null;
      if (entry.resumePlanSubmitted) {
        task.workflow = task.workflow || {};
        task.workflow.planSubmitted = true;
      }
      // Only skip file upload when the plan was already submitted to GPT.
      // retryFromStage or reconcileAction alone are NOT sufficient — if
      // planSubmitted is false, the task was interrupted before the plan
      // was sent, so files must be re-uploaded from scratch. Otherwise the
      // workflow would send text-only (no attachments) or get stuck waiting
      // for a send button that never appears.
      const resumeExistingWorkflow = !entry.forceUpload
        && Boolean(task.workflow?.planSubmitted);
      if (!resumeExistingWorkflow && !paths.length) throw new Error("这个文件夹里没有可上传的图片或文案");
      if (resumeExistingWorkflow) {
        reportWorkbenchProgress(
          task,
          entry.retryFromStage || task.lastStage || "resume current stage",
          Number(entry.retryFromPercent || task.lastPercent || 18),
          "resume the active web task without uploading attachments again"
        );
        workflowResult = await runAutomaticProduction(task);
      } else {
      await waitForPageIdleBeforeFreshUpload(
        task,
        Math.max(5, Number(entry.autoOptions?.taskTimeoutMinutes || 30)) * 60_000
      );
      const usage = entry.externalRequestId ? null : await checkMaterialUsage(entry, task);
      if (usage?.record) entry.usage = usage.record;
      // A material may intentionally be reused with another template or in a
      // later production round. Text/usage history is therefore informative,
      // not a production blocker. The authoritative duplicate decision is the
      // downloaded output image-set hash inside make_work_package.ps1.
      assertSinglePostAttachmentBoundary(entry, paths);
      if (entry.forceUpload) {
        forceClearComposer();
        await new Promise((r) => setTimeout(r, 400));
      }
      const existingComposerAttachments = attachmentPreviewCount();
      const existingComposerDraft = composerDraftText();
      const draftBelongsToThisTask = isAutomationDraft(existingComposerDraft, entry);
      const draftIsAutomation = draftBelongsToThisTask || looksLikeAutomationDraft(existingComposerDraft);
      if (existingComposerAttachments > 0) {
        if (entry.forceUpload) {
          forceClearComposer();
          await new Promise((r) => setTimeout(r, 400));
        } else if (!draftBelongsToThisTask || !entry.externalRequestId) {
          throw productionBoundaryError("COMPOSER_ATTACHMENTS_PENDING", `当前 GPT 输入框仍有 ${existingComposerAttachments} 个未发送附件；已阻止下一帖继续叠加`);
        } else {
          // The attachments and draft were inserted by this task but the send
          // click was interrupted. Submit them as-is instead of uploading twice.
          await submitComposer();
          clearComposerDraft();
          if (entry.autoRun) workflowResult = await runAutomaticProduction(task);
        }
      }
      if (existingComposerDraft && !workflowResult) {
        if (entry.forceUpload) {
          clearComposerDraft();
        } else if (draftIsAutomation && entry.externalRequestId) {
          // This is our own prompt left behind by a retry/restart. Clear it
          // before attaching the current single post; do not block the queue.
          clearComposerDraft();
        } else {
          throw productionBoundaryError("COMPOSER_DRAFT_PENDING", "当前 GPT 输入框仍有未发送文字；已阻止下一帖重复粘贴提示词");
        }
      }
      if (!workflowResult && entry.externalRequestId) {
        const boundarySnapshot = currentAutomationBoundarySnapshot();
        if (boundarySnapshot) {
          const matchesCurrentTask = automationPromptMatchesEntry(boundarySnapshot.materialText, entry);
          if (!matchesCurrentTask && !entry.forceUpload) {
            throw productionBoundaryError("WINDOW_STAGE_PENDING", "当前 GPT 窗口上一帖尚未完成文案 TXT、图片打包和归档，已阻止下一帖注入");
          }
          if (!matchesCurrentTask && entry.forceUpload) {
            // The operator explicitly retried this selected post after a
            // stopped/failed boundary. The page-idle and empty-composer gates
            // above have already proved that no response is still running, so
            // discard only the stale workflow marker and upload this post.
            task.workflow = {};
            reportWorkbenchProgress(task, "跳过旧失败帖", 4, "上一帖已停止且未完成；按用户重试指令从当前选中素材重新开始");
          }
          if (!entry.forceUpload) {
            task.workflow = task.workflow || {};
            task.workflow.planSubmitted = true;
            task.workflow.planDone = boundarySnapshot.stage !== "waiting-plan";
            task.workflow.planText ||= boundarySnapshot.planText || "";
            task.workflow.plannedImageCount ||= parsePlannedImageCount(boundarySnapshot.planText || "");
            if (["waiting-images", "images-ready", "waiting-copy", "completed-copy-pending-package"].includes(boundarySnapshot.stage)) {
              task.workflow.imageSubmitted = true;
              task.workflow.generatedImageUrls ||= boundarySnapshot.imageUrls || [];
            }
            if (["waiting-copy", "completed-copy-pending-package"].includes(boundarySnapshot.stage)) {
              task.workflow.textSubmitted = true;
            }
            if (boundarySnapshot.stage === "completed-copy-pending-package") {
              task.workflow.copyText ||= boundarySnapshot.copyText || "";
            }
            workflowResult = await runAutomaticProduction(task);
          }
        }
        if (!workflowResult && !entry.forceUpload) {
          const pendingRemote = await findPendingRemoteProduction();
          if (pendingRemote) {
            throw productionBoundaryError("WINDOW_STAGE_PENDING", "当前 GPT 窗口仍有上一帖的图片或文案未完成打包，已阻止下一帖注入");
          }
        }
      }
      if (!workflowResult) {
      const loaded = await Promise.all([loadFiles(paths, task), findFileInput()]);
      files = loaded[0];
      const input = loaded[1];
      if (task.controller.signal.aborted) throw new DOMException("上传已取消", "AbortError");
      if (!input) throw new Error("当前 GPT 没有原生附件入口，请先点输入框旁的"+"再重试");
      if (!files.length) throw new Error("文件读取完成但返回 0 个文件，路径: " + JSON.stringify(paths).slice(0, 500));
      task.status = "attaching";
      renderQueue();
      // Clear previous files from the input (leftover files from prior uploads
      // cause inputFilesLength to grow and may confuse ChatGPT's React handler)
      try {
        const emptyTransfer = new DataTransfer();
        input.files = emptyTransfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } catch {}
      // Also dismiss any ChatGPT native modal that might be open (e.g. "添加任意内容"
      // dialog triggered by clicking the + button in a previous failed attempt).
      // An open modal blocks the composer and prevents file upload from working.
      const dismissOpenModals = () => {
        const modals = document.querySelectorAll('[role="dialog"], [data-state="open"][role="dialog"], dialog[open]');
        modals.forEach((modal) => {
          // Don't close our own sidebar modal
          if (modal.closest("#tb-gpt-sidebar") || modal.closest(".tb-sidebar-root")) return;
          // Look for close/escape button inside the modal
          const closeBtn = modal.querySelector('button[aria-label*="Close" i], button[aria-label*="关闭"], button[aria-label*="取消"]');
          if (closeBtn) { try { closeBtn.click(); } catch {} }
          else {
            // Dispatch Escape key to close the modal
            modal.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
          }
        });
      };
      dismissOpenModals();
      await new Promise((r) => setTimeout(r, 500));
      dismissOpenModals(); // Second pass in case first dismissal triggered a transition
      await new Promise((r) => setTimeout(r, 300));

      const previewsBefore = attachmentPreviewCount();
      // Diagnostic: log upload start
      api("/api/gpt-production/dom-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "upload-start",
          filesCount: files.length,
          filesNames: files.map(f => f.name),
          previewsBefore,
          inputFound: Boolean(input),
          inputId: input?.id,
          inputFilesLength: input?.files?.length
        })
      }).catch(() => {});

      const composerEl = composer();
      const dropZone = composerEl?.closest('[data-composer-surface]') || composerEl?.closest('form') || composerEl;

      // Success check: use file name visibility as the PRIMARY indicator
      // (attachmentPreviewCount had false positives — 35 for 7 files — because
      // ChatGPT creates intermediate elements during upload that match selectors
      // but aren't real attachment previews).
      const visibleUploadedFileCount = () => {
        const target = composer();
        const scope = target?.closest('[data-composer-surface]') || target?.closest("form") || target?.parentElement;
        if (!scope) return 0;
        const visibleText = scope.innerText || "";
        // Also check aria-label and title attributes of child elements
        const attrText = [...scope.querySelectorAll("[aria-label], [title], [data-testid]")]
          .map(n => `${n.getAttribute("aria-label") || ""} ${n.getAttribute("title") || ""} ${n.textContent || ""}`)
          .join(" ");
        const allText = `${visibleText} ${attrText}`;
        return files.filter((file) => allText.includes(file.name)).length;
      };
      const checkFilesVisible = () => files.length > 0 && visibleUploadedFileCount() >= files.length;

      const uploadSucceeded = () => {
        // PRIMARY: all file names visible in composer area (most reliable)
        if (checkFilesVisible()) return true;
        // SECONDARY: attachment preview count matches expected count
        // This ensures ALL files were uploaded, not just one.
        const count = attachmentPreviewCount();
        if (count > 0 && count >= files.length) return true;
        // NOTE: Do NOT use sendButton() alone as a success indicator.
        // ChatGPT shows the send button as soon as ANY content is in the composer,
        // even if only 1 of N files was pasted. This caused false "success" when
        // paste only delivered the first file (currentPreviewCount=1, filesCount=8).
        return false;
      };

      // === Sequential upload: try each method one at a time, stop on first success ===
      // Previous code fired all 3 methods simultaneously, causing duplicate uploads
      // ("你已上传过此文件" error) when more than one method succeeded.

      // --- Attempt 1: DataTransfer on the hidden file input (historically reliable) ---
      // Diagnostic data shows this method successfully uploaded all files in prior
      // versions (currentPreviewCount matched filesCount). Paste events only
      // delivered the first file due to ClipboardEvent limitations.
      let uploadOk = false;
      try {
        const transfer = new DataTransfer();
        files.forEach((file) => transfer.items.add(file));
        input.files = transfer.files;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } catch {}
      uploadOk = await waitFor(() => uploadSucceeded(), 12_000);
      api("/api/gpt-production/dom-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "upload-datatransfer-attempt", succeeded: uploadOk, filesCount: files.length, allNamesVisibleCheck: checkFilesVisible(), sendButtonFound: Boolean(sendButton()), currentPreviewCount: attachmentPreviewCount() })
      }).catch(() => {});

      // --- Attempt 2: Drag-and-drop on the composer surface (only if DataTransfer failed) ---
      if (!uploadOk && dropZone) {
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        dropZone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
        dropZone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        dropZone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        dropZone.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: dt }));
        uploadOk = await waitFor(() => uploadSucceeded(), 12_000);
        api("/api/gpt-production/dom-snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "upload-dnd-attempt", succeeded: uploadOk, filesCount: files.length, allNamesVisibleCheck: checkFilesVisible(), sendButtonFound: Boolean(sendButton()), currentPreviewCount: attachmentPreviewCount() })
        }).catch(() => {});
      }

      // --- Attempt 3: Paste event (last resort — may only deliver first file) ---
      if (!uploadOk && composerEl) {
        composerEl.focus();
        await new Promise((r) => setTimeout(r, 200));
        const pasteTransfer = new DataTransfer();
        files.forEach((file) => pasteTransfer.items.add(file));
        composerEl.dispatchEvent(new ClipboardEvent("paste", {
          bubbles: true, cancelable: true, clipboardData: pasteTransfer
        }));
        uploadOk = await waitFor(() => uploadSucceeded(), 10_000);
        api("/api/gpt-production/dom-snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "upload-paste-attempt", succeeded: uploadOk, filesCount: files.length, allNamesVisibleCheck: checkFilesVisible(), sendButtonFound: Boolean(sendButton()), currentPreviewCount: attachmentPreviewCount() })
        }).catch(() => {});
      }

      // Diagnostic: log final appeared result
      api("/api/gpt-production/dom-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "upload-appeared-check",
          appeared: uploadOk,
          filesCount: files.length,
          previewsBefore,
          currentPreviewCount: attachmentPreviewCount(),
          allNamesVisibleCheck: checkFilesVisible(),
          sendButtonFound: Boolean(sendButton()),
          inputFilesLength: input?.files?.length
        })
      }).catch(() => {});

      if (!uploadOk) {
        const uploadResult = classifyAttachmentUploadResult({
          expected: files.length,
          observed: Math.max(visibleUploadedFileCount(), attachmentPreviewCount())
        });
        if (uploadResult.status === "partial") {
          throw productionBoundaryError(
            uploadResult.code,
            `GPT 上传未完整：${uploadResult.observed}/${uploadResult.expected} 个附件已进入输入框；` +
            "可能触达上传图片/文件上限，当前账号窗口已停住，等待下一次探测"
          );
        }
        throw productionBoundaryError(
          uploadResult.code,
          "ChatGPT 没有显示原生附件预览，文件上传未成功（paste、DataTransfer 和拖拽方式均无效，可能是 ChatGPT DOM 结构变更）"
        );
      }
      await recordWorkbenchQuota(entry, "uploaded", files.length);
      task.entry.uploadedAttachments = files.length;
      if (entry.autoRun) {
        // 自动模式需要一条最小控制提示来启动当前会话的计划；流程控制
        // （发送、等待、扣 1、下载、打包）由扩展状态机负责，不写进素材提示词。
        // 如果工作流配置了"插入提示词"环节且有文字，将其拼接到指令后面
        const wfStepsForInstruction = Array.isArray(entry.autoOptions?.workflowSteps) ? entry.autoOptions.workflowSteps : [];
        const insertPromptStep = wfStepsForInstruction.find((s) => s.action === "insert-prompt" && s.enabled !== false);
        const baseInstruction = instruction(entry);
        const finalInstruction = insertPromptStep?.text
          ? `${baseInstruction}\n${String(insertPromptStep.text).trim()}`
          : baseInstruction;
        await replaceComposerText(finalInstruction, entry);
        reportWorkbenchProgress(task, "附件上传完成", 12, `${files.length} 个文件已进入 GPT`);
        workflowResult = await runAutomaticProduction(task);
      } else {
        // 手动模式只把真实附件放进 GPT。不要改写输入框，避免把内部网页脚本、
        // 下载器或工作流控制语句暴露给用户，也避免覆盖用户正在编辑的文字。
        reportWorkbenchProgress(task, "素材上传完成", 100, "手动模式：附件已进入 GPT，未注入额外提示词");
      }
      }
      }
      task.status = workflowResult?.duplicateSkipped ? "duplicate" : "success";
      task.completed = task.total;
      const workflowDetail = workflowResult?.templateInitialized
        ? "当前会话的模板环境已初始化"
        : workflowResult?.plannedOnly
        ? "迁移计划已生成，等待人工确认"
        : workflowResult?.packageSkipped
          ? `已下载 ${workflowResult.downloadedImages || 0} 张图并复制文案`
          : workflowResult?.textSkipped
            ? `已下载 ${workflowResult.downloadedImages || 0} 张图`
            : workflowResult?.packageResult?.packagePath
              ? `作品已核对并保存到 ${workflowResult.packageResult.packagePath}`
              : `${files.length} 个文件已上传`;
      reportWorkbenchTask(task, workflowResult?.duplicateSkipped ? "duplicate" : "success", workflowResult?.duplicateSkipped
        ? `图片与历史作品完全重复，已清理本轮暂存文件并跳过：${entry.name}`
        : workflowDetail, {
        taskType: entry.taskType || "material",
        downloadedImages: Number(workflowResult?.downloadedImages || 0),
        plannedImageCount: Number(workflowResult?.plannedImageCount || 0),
        batchId: workflowResult?.batchId || "",
        packagePath: workflowResult?.packageResult?.packagePath || "",
        downloadRoot: workflowResult?.downloadResult?.downloadRoot || entry.autoOptions?.downloadRoot || "",
        copyTextLength: String(workflowResult?.copyText || "").trim().length,
        archivePath: workflowResult?.archiveResult?.to || "",
        conversationUrl: workflowResult?.conversationUrl || location.href
      });
      if (entry.entryKind === "material" && !workflowResult?.duplicateSkipped) {
        state.pendingUsage = entry;
        await recordMaterialUsage(entry, "prepared").catch(() => null);
      }
      renderQueue();
      setStatus(
        workflowResult?.duplicateSkipped
          ? `历史图片组已存在，已清理本轮下载并跳过：${entry.name}`
          : `已上传 ${files.length} 个文件，并保留原文案后追加生产指令`,
        workflowResult?.duplicateSkipped ? "danger" : "success"
      );
    } catch (error) {
      if (error?.name === "AbortError") {
        task.status = "cancelled";
        task.error = "";
        reportWorkbenchProgress(task, "已取消", 100, `已取消：${entry.name}`, "cancelled");
        reportWorkbenchTask(task, "cancelled");
        setStatus(`已取消：${entry.name}`);
      } else {
        task.status = "failed";
        const pendingComposerAttachments = attachmentPreviewCount();
        const errorCode = String(error?.code
          || (/Failed to fetch|本地工作台连接失败/i.test(String(error?.message || "")) ? "LOCAL_BRIDGE_FETCH_FAILED" : "")
          || (pendingComposerAttachments > 0 ? "COMPOSER_ATTACHMENTS_PENDING" : ""));
        const failureDetail = error.message || "upload failed";
        reportWorkbenchProgress(task, "失败", 100, failureDetail, "failed");
        reportWorkbenchTask(task, "failed", failureDetail, {
          errorCode,
          detectedImages: Number(error?.detectedImages || 0),
          pendingComposerAttachments,
          stage: task.lastStage || "",
          percent: Number(task.lastPercent || 0),
          downloadRoot: String(task.entry.autoOptions?.downloadRoot || ""),
          copyTextLength: Number(String(task.workflow?.copyText || "").trim().length || 0)
        });
        task.error = error.message || "未知错误";
        setStatus(task.error, "danger");
        if ([
          "COMPOSER_ATTACHMENTS_PENDING",
          "COMPOSER_DRAFT_PENDING",
          "MIXED_POST_ATTACHMENTS",
          "COMPOSER_ATTACHMENT_CONFLICT",
          "COMPOSER_DRAFT_NOT_SET",
          "ATTACHMENT_UPLOAD_NOT_READY",
          "UPLOAD_LIMIT_SIGNAL",
          "WINDOW_STAGE_PENDING",
          "WEB_RESPONSE_IN_FLIGHT",
          "IMAGE_COUNT_UNCERTAIN",
          "PLAN_PARSE_FAILED",
          "PLAN_NOT_READY",
          "PLAN_NOT_COMPLETE",
          "GENERATION_LIMIT_SIGNAL",
          "SCRIPT_GENERATED_OUTPUT",
          "COPY_REQUIRED"
        ].includes(errorCode)
          || /未发送附件|未发送文字|重复粘贴提示词|混合上传|输入框仍有|仍在生成|图片数量检测不确定|生成结果不足|代码解释器|额度|文案 TXT/.test(failureDetail)) {
          state.boundaryPaused = true;
        }
      }
      renderQueue();
    } finally {
      state.busy = false;
      setBusy(null);
      if (!state.boundaryPaused) processUploadQueue();
    }
  }

  function findEntry(kind, id) {
    if (kind === "product") {
      const groups = [
        state.productTree?.entries || [],
        ...Object.values(state.productChildren).map((tree) => tree.entries || [])
      ];
      for (const entries of groups) {
        const item = entries.find((entry) => entry.id === id);
        if (item) return item;
      }
      return null;
    }
    for (const category of state.materials?.categories || []) {
      const item = (category.items || []).find((entry) => entry.id === id);
      if (item) return item;
    }
    return (state.materialIndex?.items || []).find((entry) => entry.id === id) || null;
  }

  async function loadCategory(categoryId) {
    const category = (state.materials?.categories || []).find((item) => item.id === categoryId);
    if (!category || category.loaded || category.loading) return;
    category.loading = true;
    try {
      const payload = await api(`/api/materials?category=${encodeURIComponent(categoryId)}`);
      const loaded = (payload.materials?.categories || []).find((item) => item.id === categoryId);
      if (loaded) Object.assign(category, loaded, { loaded: true, loading: false });
      renderBody();
    } catch (error) {
      category.loading = false;
      setStatus(error.message, "danger");
    }
  }

  function recalculateLocalIndexStats() {
    const items = state.materialIndex?.items || [];
    const byMainTag = { 团建游戏: 0, 团建转化: 0, 合集攻略: 0 };
    const byUsage = { unused: 0, once: 0, twice: 0, threePlus: 0, used: 0 };
    items.forEach((item) => {
      if (Object.prototype.hasOwnProperty.call(byMainTag, item.mainTag)) byMainTag[item.mainTag] += 1;
      const count = Number(item.usageCount || 0);
      if (count === 0) byUsage.unused += 1;
      if (count === 1) byUsage.once += 1;
      if (count === 2) byUsage.twice += 1;
      if (count >= 3) byUsage.threePlus += 1;
      if (count > 0) byUsage.used += 1;
    });
    if (state.materialIndex) {
      state.materialIndex.stats = {
        ...(state.materialIndex.stats || {}),
        total: items.length,
        byMainTag,
        byUsage
      };
    }
  }

  function scheduleMaterialIndexPoll(delay = 3_000) {
    clearTimeout(materialIndexTimer);
    materialIndexTimer = setTimeout(() => {
      loadMaterialIndex().catch(() => null);
    }, delay);
  }

  async function loadMaterialIndex(refreshIndex = false) {
    const payload = await api(`/api/extension/material-index${refreshIndex ? "?refresh=true" : ""}`);
    state.materialIndex = payload.index || null;
    renderBody();
    if (state.materialIndex?.status === "running") {
      setStatus(`正在建立全库素材索引：${Number(state.materialIndex.processedCategories || 0)}/${Number(state.materialIndex.totalCategories || 0)}`);
      scheduleMaterialIndexPoll();
    } else if (state.materialIndex?.status === "failed") {
      setStatus(`素材索引失败：${state.materialIndex.error || "未知错误"}`, "danger");
    } else if (state.materialIndex?.status === "complete") {
      setStatus(`全库索引完成：${Number(state.materialIndex.stats?.total || 0)} 条素材，${Number(state.materialIndex.stats?.review || 0)} 条待核对`, "success");
    }
    return state.materialIndex;
  }

  async function materialEntryForUpload(id, categoryId) {
    let entry = findEntry("material", id);
    if (entry?.attachments?.length) return entry;
    if (categoryId) await loadCategory(categoryId);
    entry = findEntry("material", id);
    return entry;
  }

  function categoryForEntry(entryId) {
    return (state.materials?.categories || []).find((category) =>
      (category.items || []).some((item) => item.id === entryId)
    );
  }

  async function updateMaterialEntry(entry, changes) {
    if (!entry?.path) return;
    setStatus(`正在更新“${entry.name}”…`);
    const payload = await api("/api/extension/material-metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryPath: entry.path, folderHash: entry.folderHash, ...changes })
    });
    const record = payload.record || {};
    if (record.mainTag) {
      entry.mainTag = record.mainTag;
      entry.mainTagSource = record.mainTagSource || "manual";
    }
    if (Number.isFinite(Number(record.usageCount))) entry.usageCount = Number(record.usageCount);
    if (Array.isArray(record.tags)) entry.tags = record.tags;
    const indexed = (state.materialIndex?.items || []).find((item) => item.id === entry.id);
    if (indexed && indexed !== entry) Object.assign(indexed, {
      mainTag: entry.mainTag,
      mainTagSource: entry.mainTagSource,
      usageCount: entry.usageCount,
      tags: entry.tags
    });
    for (const category of state.materials?.categories || []) {
      const loaded = (category.items || []).find((item) => item.id === entry.id);
      if (loaded && loaded !== entry) Object.assign(loaded, {
        mainTag: entry.mainTag,
        mainTagSource: entry.mainTagSource,
        usageCount: entry.usageCount,
        tags: entry.tags
      });
    }
    recalculateLocalIndexStats();
    renderBody();
    setStatus(`已更新“${entry.name}”`, "success");
  }

  function saveMaterialActionSettings(form) {
    const next = JSON.parse(JSON.stringify(DEFAULT_ACTION_SETTINGS));
    for (const key of Object.keys(next)) {
      next[key].enabled = Boolean(form.querySelector(`[data-action-enabled="${key}"]`)?.checked);
      next[key].label = form.querySelector(`[data-action-label="${key}"]`)?.value || next[key].label;
    }
    next.move.targetPath = form.querySelector("[data-action-move-target]")?.value || "";
    storeActionSettings(next);
    state.settingsOpen = false;
    renderBody();
    setStatus("素材按钮设置已保存", "success");
  }

  async function loadProductFolder(folderPath) {
    setStatus(`正在读取 ${fileName(folderPath)}…`);
    const payload = await api(`/api/extension/product-tree?path=${encodeURIComponent(folderPath)}`);
    state.productChildren[folderPath] = payload.tree;
    renderBody();
    setStatus(`已读取 ${payload.tree?.entries?.length || 0} 项`, "success");
  }

  async function savePaths(kind, value) {
    const body = kind === "product"
      ? { workPackage: { libraryPath: value } }
      : { materialRoot: value };
    const payload = await api("/api/extension/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    state.workspace = { ...state.workspace, ...payload };
    storePaths({
      productRoot: kind === "product" ? value : state.paths.productRoot,
      materialRoot: kind === "material" ? value : state.paths.materialRoot
    });
    await refresh();
  }

  async function refresh() {
    try {
      const previousProductRoot = state.workspace?.settings?.workPackage?.libraryPath || state.paths.productRoot;
      const previousMaterialRoot = state.materials?.root || state.paths.materialRoot;
      const previousCategories = new Map(
        (state.materials?.categories || []).map((category) => [category.id, category])
      );
      const [workspace, materials, productTree, materialIndex] = await Promise.all([
        api("/api/extension/workspace"),
        api("/api/materials"),
        api("/api/extension/product-tree"),
        api("/api/extension/material-index")
      ]);
      state.workspace = workspace;
      state.productTree = productTree.tree;
      state.materialIndex = materialIndex.index || null;
      const nextProductRoot = workspace?.settings?.workPackage?.libraryPath || state.paths.productRoot;
      const nextMaterialRoot = materials.materials?.root || state.paths.materialRoot;
      const productRootChanged = previousProductRoot !== nextProductRoot;
      const materialRootChanged = previousMaterialRoot !== nextMaterialRoot;
      state.materials = {
        ...materials.materials,
        categories: (materials.materials?.categories || []).map((category) => {
          const previous = previousCategories.get(category.id);
          if (materialRootChanged || !previous?.loaded) return category;
          return { ...category, loaded: true, items: previous.items || [] };
        })
      };
      state.connected = true;
      state.health = {
        local: Boolean(nextProductRoot && nextMaterialRoot),
        gptUpload: Boolean(document.querySelector('#upload-files:not(:disabled)')),
        dedup: Boolean(workspace?.dedup?.production?.available)
      };
      storePaths({
        productRoot: nextProductRoot,
        materialRoot: nextMaterialRoot
      });
      if (productRootChanged) {
        state.productChildren = {};
        state.openProducts.clear();
      }
      if (materialRootChanged) state.openMaterials.clear();
      renderBody();
      renderHealth();
      setStatus("本地工作台已连接", "success");
      if (state.materialIndex?.status === "running") scheduleMaterialIndexPoll();
      scheduleRefresh(60_000);
    } catch {
      state.connected = false;
      state.health.local = false;
      state.health.dedup = false;
      state.health.gptUpload = Boolean(document.querySelector('#upload-files:not(:disabled)'));
      renderHealth();
      setStatus("正在自动连接本地工作台…", "danger");
      scheduleRefresh(5_000);
    }
  }

  function autoApplyPastedPath(input) {
    const productInput = input.matches(`#${ROOT_ID} [data-product-path]`);
    const materialInput = input.matches(`#${ROOT_ID} [data-material-path]`);
    if (!productInput && !materialInput) return;
    setTimeout(() => {
      const value = input.value.trim();
      if (!value) return;
      const kind = productInput ? "product" : "material";
      setStatus(`正在读取${kind === "product" ? "成品" : "素材"}目录…`);
      savePaths(kind, value).catch((error) => setStatus(error.message, "danger"));
    }, 80);
  }

  document.addEventListener("submit", (event) => {
    if (event.target.matches(`#${ROOT_ID} [data-product-form]`)) {
      event.preventDefault();
      savePaths("product", event.target.querySelector("[data-product-path]").value.trim()).catch((error) => setStatus(error.message, "danger"));
    }
    if (event.target.matches(`#${ROOT_ID} [data-material-form]`)) {
      event.preventDefault();
      savePaths("material", event.target.querySelector("[data-material-path]").value.trim()).catch((error) => setStatus(error.message, "danger"));
    }
    if (event.target.matches(`#${ROOT_ID} [data-material-settings-form]`)) {
      event.preventDefault();
      saveMaterialActionSettings(event.target);
    }
  });

  document.addEventListener("paste", (event) => {
    const input = event.target.closest?.(`#${ROOT_ID} input`);
    if (input) autoApplyPastedPath(input);
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest(`#${ROOT_ID} [data-collapse], #${LAUNCHER_ID}`)) {
      state.collapsed = !state.collapsed;
      applyLayout();
      return;
    }
    const filterTag = event.target.closest(`#${ROOT_ID} [data-filter-main-tag]`);
    if (filterTag) {
      state.materialFilter.mainTag = filterTag.dataset.filterMainTag;
      renderBody();
      return;
    }
    const groupedFilter = event.target.closest(`#${ROOT_ID} [data-filter-dimension]`);
    if (groupedFilter) {
      const dimension = groupedFilter.dataset.filterDimension;
      if (dimension === "season" || dimension === "holiday") {
        state.materialFilter[dimension] = groupedFilter.dataset.filterValue;
        renderBody();
      }
      return;
    }
    if (event.target.closest(`#${ROOT_ID} [data-open-material-settings]`)) {
      state.settingsOpen = true;
      renderMaterialSettings();
      return;
    }
    if (event.target.closest(`#${ROOT_ID} [data-close-material-settings]`)) {
      state.settingsOpen = false;
      renderMaterialSettings();
      return;
    }
    if (event.target.closest(`#${ROOT_ID} [data-reset-material-settings]`)) {
      storeActionSettings(DEFAULT_ACTION_SETTINGS);
      renderMaterialSettings();
      return;
    }
    const tagAction = event.target.closest(`#${ROOT_ID} [data-material-main-tag]`);
    if (tagAction) {
      const entry = findEntry("material", tagAction.dataset.materialId);
      updateMaterialEntry(entry, { mainTag: tagAction.dataset.materialMainTag }).catch((error) => setStatus(error.message, "danger"));
      return;
    }
    const incrementAction = event.target.closest(`#${ROOT_ID} [data-material-increment]`);
    if (incrementAction) {
      const entry = findEntry("material", incrementAction.dataset.materialIncrement);
      updateMaterialEntry(entry, { incrementUsage: true }).catch((error) => setStatus(error.message, "danger"));
      return;
    }
    const moveAction = event.target.closest(`#${ROOT_ID} [data-material-move]`);
    if (moveAction) {
      const entry = findEntry("material", moveAction.dataset.materialMove);
      if (entry?.path && state.actionSettings.move.targetPath) {
        state.pendingMove = { entry: { ...entry, entryKind: "material" }, targetPath: state.actionSettings.move.targetPath };
        renderMoveDialog();
      }
      return;
    }
    const cancel = event.target.closest(`#${ROOT_ID} [data-cancel-upload]`);
    if (cancel) {
      const task = state.uploadTasks.find((item) => item.id === Number(cancel.dataset.cancelUpload));
      if (task) {
        if (task.status === "queued") {
          task.status = "cancelled";
          renderQueue();
        } else {
          task.controller.abort();
        }
      }
      return;
    }
    const retry = event.target.closest(`#${ROOT_ID} [data-retry-upload]`);
    if (retry) {
      const task = state.uploadTasks.find((item) => item.id === Number(retry.dataset.retryUpload));
      if (task) {
        task.status = "queued";
        task.completed = 0;
        task.error = "";
        task.controller = new AbortController();
        renderQueue();
        processUploadQueue();
      }
      return;
    }
    if (event.target.closest(`#${ROOT_ID} [data-cancel-move]`)) {
      state.pendingMove = null;
      renderMoveDialog();
      setStatus("已取消移动");
      return;
    }
    if (event.target.closest(`#${ROOT_ID} [data-confirm-move]`)) {
      confirmMove();
      return;
    }
    const productUpload = event.target.closest(`#${ROOT_ID} [data-upload-product]`);
    if (productUpload) uploadEntry({ ...findEntry("product", productUpload.dataset.uploadProduct), entryKind: "product" });
    const materialUpload = event.target.closest(`#${ROOT_ID} [data-upload-material]`);
    if (materialUpload) {
      materialEntryForUpload(
        materialUpload.dataset.uploadMaterial,
        materialUpload.dataset.indexCategory
      ).then((entry) => {
        if (!entry?.attachments?.length) throw new Error("素材详情尚未读取完成，请稍后再试");
        uploadEntry({ ...entry, entryKind: "material" });
      }).catch((error) => setStatus(error.message, "danger"));
    }
  });

  document.addEventListener("change", (event) => {
    const usage = event.target.closest?.(`#${ROOT_ID} [data-filter-usage]`);
    if (!usage) return;
    state.materialFilter.usage = usage.value;
    renderBody();
  });

  document.addEventListener("input", (event) => {
    const query = event.target.closest?.(`#${ROOT_ID} [data-filter-query]`);
    if (!query) return;
    state.materialFilter.query = query.value;
    const materials = document.querySelector(`#${ROOT_ID} [data-materials]`);
    if (materials) materials.innerHTML = materialRows();
  });

  document.addEventListener("toggle", (event) => {
    const product = event.target.closest?.(`#${ROOT_ID} details[data-product-path]`);
    if (product) {
      if (product.open) {
        const folderPath = product.dataset.productPath;
        state.openProducts.add(folderPath);
        if (!Object.prototype.hasOwnProperty.call(state.productChildren, folderPath)) {
          loadProductFolder(folderPath).catch((error) => setStatus(error.message, "danger"));
        }
      } else {
        state.openProducts.delete(product.dataset.productPath);
      }
      return;
    }
    const details = event.target.closest?.(`#${ROOT_ID} details[data-category]`);
    if (details) {
      if (details.open) {
        state.openMaterials.add(details.dataset.category);
        loadCategory(details.dataset.category);
      } else {
        state.openMaterials.delete(details.dataset.category);
      }
    }
  }, true);

  document.addEventListener("dragstart", (event) => {
    const row = event.target.closest?.(`#${ROOT_ID} [data-move-source-kind], #${ROOT_ID} [data-entry-kind]`);
    if (!row) return;
    const kind = row.dataset.moveSourceKind || row.dataset.entryKind;
    const id = row.dataset.moveSourceId || row.dataset.entryId;
    state.dragging = { ...findEntry(kind, id), entryKind: kind };
    if (!state.dragging?.path) {
      state.dragging = null;
      return;
    }
    showDropOverlay(false);
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("text/plain", state.dragging?.name || "团建内容");
  });
  document.addEventListener("dragover", (event) => {
    if (!state.dragging) return;
    const moveTarget = event.target.closest?.(`#${ROOT_ID} [data-move-target-path]`);
    if (moveTarget && moveTarget.dataset.moveTargetPath !== state.dragging.path) {
      event.preventDefault();
      event.stopPropagation();
      clearMoveTarget();
      moveTarget.classList.add("is-move-target");
      state.moveTarget = moveTarget.dataset.moveTargetPath;
      event.dataTransfer.dropEffect = "move";
      showDropOverlay(false);
      return;
    }
    clearMoveTarget();
    if (isChatDropTarget(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
      showDropOverlay(true);
    } else {
      showDropOverlay(false);
    }
  }, true);
  document.addEventListener("drop", (event) => {
    if (!state.dragging) return;
    const moveTarget = event.target.closest?.(`#${ROOT_ID} [data-move-target-path]`);
    if (moveTarget && moveTarget.dataset.moveTargetPath !== state.dragging.path) {
      event.preventDefault();
      event.stopPropagation();
      state.pendingMove = {
        entry: state.dragging,
        targetPath: moveTarget.dataset.moveTargetPath
      };
      state.dragging = null;
      clearMoveTarget();
      showDropOverlay(false);
      renderMoveDialog();
      return;
    }
    if (!isChatDropTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const entry = state.dragging;
    state.dragging = null;
    clearMoveTarget();
    showDropOverlay(false);
    uploadEntry(entry);
  }, true);
  document.addEventListener("dragend", () => {
    state.dragging = null;
    clearMoveTarget();
    showDropOverlay(false);
  });

  document.addEventListener("click", (event) => {
    if (!state.pendingUsage || event.target.closest?.(`#${ROOT_ID}`)) return;
    const button = event.target.closest?.("button");
    if (!button) return;
    const label = `${button.getAttribute("aria-label") || ""} ${button.title || ""} ${button.textContent || ""}`;
    if (/发送|send/i.test(label)) commitPendingMaterialUsage();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (!state.pendingUsage || event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    if (event.target.closest?.(`#${ROOT_ID}`)) return;
    if (event.target.matches?.("textarea, [contenteditable='true']")) commitPendingMaterialUsage();
  }, true);

  async function acceptWorkbenchTask(message) {
    if (message?.source !== "teambuilding-workbench"
      || message?.type !== "tb-workbench-upload") return;
    const requestId = String(message.requestId || "").trim();
    document.documentElement.dataset.tbGptLastTask = `${requestId || "missing"}:received`;
    const attachments = Array.isArray(message.attachments)
      ? [...new Set(message.attachments.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 30)
      : [];
    const prompt = String(message.prompt || "").trim().slice(0, 30000);
    const retryFromStage = String(message.retryFromStage || "").trim();
    const reconcileAction = String(message.reconcileAction || "").trim();
    const forceUpload = Boolean(message.forceUpload);
    const resumePlanSubmitted = Boolean(message.resumePlanSubmitted);
    const taskOptions = message.autoOptions && typeof message.autoOptions === "object" ? message.autoOptions : {};
    const noPromptMode = taskOptions.useCurrentSession !== false || taskOptions.mode === "random";
    localStorage.setItem("tb-workbench-prompt-library-enabled", taskOptions.promptLibraryEnabled === false ? "0" : "1");
    localStorage.setItem("tb-workbench-message-downloads-enabled", taskOptions.messageDownloadsEnabled === false ? "0" : "1");
    window.dispatchEvent(new CustomEvent("tb-workbench-tools-visibility"));
    const resumeOnly = Boolean(retryFromStage || reconcileAction) && !forceUpload;
    if (!requestId || (!resumeOnly && (!attachments.length || (!prompt && !noPromptMode)))) {
      window.postMessage({
        source: "tb-gpt-production-extension",
        type: "tb-workbench-task-result",
        requestId,
        status: "failed",
        detail: "missing requestId, attachments or prompt"
      }, "*");
      return;
    }
    const retryOf = String(message.retryOf || "").trim();
    if (state.boundaryPaused && !retryOf && !forceUpload) {
      window.postMessage({
        source: "tb-gpt-production-extension",
        type: "tb-workbench-task-result",
        requestId,
        status: "failed",
        errorCode: "COMPOSER_ATTACHMENT_CONFLICT",
        detail: "当前 GPT 输入框需要先清理未发送内容；已暂停当前窗口，请先重试上一帖"
      }, "*");
      return;
    }
    if (forceUpload) {
      state.boundaryPaused = false;
      const removed = forceClearComposer();
      if (removed > 0) {
        await new Promise((r) => setTimeout(r, 600));
        forceClearComposer();
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    if (retryOf) state.boundaryPaused = false;
    const retryTask = retryOf
      ? state.uploadTasks.find((item) => item.entry?.externalRequestId === retryOf && item.status === "failed")
      : null;
    if (retryTask) {
      retryTask.entry.externalRequestId = requestId;
      retryTask.entry.name = String(message.name || retryTask.entry.name || "工作台素材").slice(0, 160);
      retryTask.entry.path = String(message.materialPath || message.name || retryTask.entry.path || "工作台素材");
      retryTask.entry.materialPath = String(message.materialPath || retryTask.entry.materialPath || "");
      retryTask.entry.attachments = attachments;
      retryTask.entry.customPrompt = prompt;
      retryTask.entry.expectedImages = Math.max(0, Number(message.expectedImages || retryTask.entry.expectedImages || 0));
      retryTask.entry.accountId = String(message.quotaAccountId || message.accountId || retryTask.entry.accountId || "");
      retryTask.entry.autoOptions = taskOptions;
      retryTask.entry.retryFromStage = String(message.retryFromStage || "");
      retryTask.entry.retryFromPercent = Number(message.retryFromPercent || 0);
      retryTask.entry.reconcileAction = reconcileAction;
      retryTask.entry.forceUpload = forceUpload;
      if (forceUpload) retryTask.workflow = {};
      if (resumePlanSubmitted) {
        retryTask.workflow = retryTask.workflow || {};
        retryTask.workflow.planSubmitted = true;
      }
      retryTask.status = "queued";
      retryTask.error = "";
      retryTask.controller = new AbortController();
      renderQueue();
      processUploadQueue();
      return;
    }
    uploadEntry({
      id: `workbench-${requestId}`,
      name: String(message.name || "工作台素材").slice(0, 160),
      path: String(message.materialPath || message.name || "工作台素材"),
      attachments,
      imageCount: attachments.filter((filePath) => /\.(?:png|jpe?g|webp|gif|bmp)$/i.test(filePath)).length,
      entryKind: "external",
      customPrompt: prompt,
      externalRequestId: requestId,
      accountId: String(message.quotaAccountId || message.accountId || ""),
      taskType: String(message.taskType || "material"),
      templateId: String(message.templateId || ""),
      materialPath: String(message.materialPath || ""),
      autoRun: Boolean(message.autoRun),
      autoOptions: taskOptions,
      expectedImages: Math.max(0, Number(message.expectedImages || 0)),
      retryFromStage,
      retryFromPercent: Number(message.retryFromPercent || 0),
      reconcileAction,
      forceUpload,
      resumePlanSubmitted
    });
  }

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.source === "teambuilding-workbench" && message.type === "tb-workbench-patrol-continue-request") {
      executePatrolSingleStep({
        targetUrl: String(message.targetUrl || ""),
        denylist: Array.isArray(message.denylist) ? message.denylist : [],
        confirmText: String(message.confirmText || "1"),
        copyPrompt: String(message.copyPrompt || DEFAULT_PUBLISH_COPY_PROMPT),
        generationRequestCount: Number(message.generationRequestCount || 0),
        maximumGenerationRequests: Number(message.maximumGenerationRequests || 5),
        requestId: String(message.productionRequestId || ""),
        materialName: String(message.materialName || ""),
        sourceMaterialPath: String(message.sourceMaterialPath || ""),
        templateId: String(message.templateId || ""),
        downloadRoot: String(message.downloadRoot || ""),
        productRoot: String(message.productRoot || ""),
        autoArchive: message.autoArchive !== false,
        inspectOnly: Boolean(message.inspectOnly)
      }).then((result) => window.postMessage({
        source: "tb-gpt-production-extension",
        type: "tb-workbench-patrol-continue-result",
        requestId: String(message.requestId || ""),
        ...result
      }, "*")).catch((error) => window.postMessage({
        source: "tb-gpt-production-extension",
        type: "tb-workbench-patrol-continue-result",
        requestId: String(message.requestId || ""),
        ok: false,
        acted: false,
        error: String(error?.message || error || "巡检单步续接失败")
      }, "*"));
      return;
    }
    if (message.source === "teambuilding-workbench" && message.type === "tb-workbench-patrol-discover-request") {
      discoverPatrolConversations({
        denylist: Array.isArray(message.denylist) ? message.denylist : [],
        maximumScrolls: Number(message.maximumScrolls || 16)
      }).then((result) => window.postMessage({
        source: "tb-gpt-production-extension",
        type: "tb-workbench-patrol-discover-result",
        requestId: String(message.requestId || ""),
        ...result
      }, "*")).catch((error) => window.postMessage({
        source: "tb-gpt-production-extension",
        type: "tb-workbench-patrol-discover-result",
        requestId: String(message.requestId || ""),
        readOnly: true,
        error: String(error?.message || error || "巡检发现失败"),
        conversations: []
      }, "*"));
      return;
    }
    if (message.source === "teambuilding-workbench" && message.type === "tb-workbench-inspect-request") {
      const snapshot = conversationStateSnapshot();
      window.postMessage({
        source: "tb-gpt-production-extension",
        type: "tb-workbench-inspect-result",
        requestId: String(message.requestId || ""),
        ...snapshot,
        composerReady: Boolean(composer()),
        composerDraft: composerDraftText(),
        attachmentCount: attachmentPreviewCount(),
        generating: Boolean(generatingNow()),
        inspectedAt: new Date().toISOString()
      }, "*");
      return;
    }
    acceptWorkbenchTask(event.data);
  });

  document.addEventListener("tb-workbench-upload", () => {
    try {
      const bridge = document.getElementById("tb-workbench-bridge-request");
      acceptWorkbenchTask(JSON.parse(bridge?.textContent || "{}"));
    } catch (error) {
      document.documentElement.dataset.tbGptLastTask = `bridge:failed:${error.message}`;
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "tb-sidebar-toggle") return;
    state.collapsed = !state.collapsed;
    applyLayout();
  });

  if (!isEmbeddedWorkbench()) render();
  Promise.all([readStoredPaths(), readActionSettings()]).then(([paths, actionSettings]) => {
    state.actionSettings = actionSettings;
    storePaths(paths);
    if (!isEmbeddedWorkbench()) {
      renderBody();
      return refresh();
    }
    return null;
  });

  const mountObserver = new MutationObserver(() => {
    if (isEmbeddedWorkbench()) return;
    if (document.getElementById(ROOT_ID) && document.getElementById(LAUNCHER_ID)) return;
    if (remountQueued) return;
    remountQueued = true;
    requestAnimationFrame(() => {
      remountQueued = false;
      render();
    });
  });
  mountObserver.observe(document.documentElement, { childList: true, subtree: true });
})();
