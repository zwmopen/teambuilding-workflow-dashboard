let dashboard = null;
let selectedMaterial = null;
let selectedMaterialCategory = null;
let selectedTemplate = null;
let selectedPrompt = null;
let selectedProductGroup = null;
let selectedProductWork = null;
let focusTarget = null;
let contextMenuTarget = null;
let contextMenuGptHidden = false;
let productsRendered = false;
let logsRendered = false;
let juguangRendered = false;
let juguangData = null;
let conversionData = null;
let conversionModule = "search";
let conversionRole = "前端运营";
let conversionActiveStageIndex = 0;
let conversionResult = null;
let materialRenderLimit = 12;
let productRenderLimit = 8;
let collectionFilters = { stage: "mobile" };
let activeDistributionPanel = "devices";
let distributionSummaryFilter = "devices";
let distributionCollectionTypeFilter = "all";
let selectedDistributionCollectionName = "";
let selectedDistributionDeviceId = "";
let packageDevicePickerCollectionName = "";
let uploadChoiceDeviceId = "";
// 微信公众号草稿发布器状态
let wechatDraftSelectedCollection = "";
let wechatDraftSelectedPost = null;
let wechatDraftPosts = [];
let wechatDraftSettings = null;
let wechatDraftCreating = false;
const genericTransferUiTasks = new Map();
const distributionTransferUiTasks = new Map();
let transferPollTimer = null;
let deviceCheckState = {
  registered: null,
  online: null,
  output: "",
  onlineDevices: [],
  scanning: true
};
let deviceScanStarted = false;
let deviceScanRunning = false;
let activeProductionPlan = null;
let activeProductionJobId = "";
let productionJobPollTimer = null;
let productionTasksRestored = false;
let workbenchProgressValue = 0;
const workbenchProductionLog = [];
const workbenchSelectedMaterials = new Set();
const workbenchSelectedProducts = new Set();
let workbenchTemplateType = "conversion";
let workbenchMaterialFilter = "all";
let workbenchOutputFilter = "unpacked";
let workbenchExpandedProductPath = "";
let workbenchFolderBindings = {};
let workbenchActiveMaterialCategoryPath = "";
let workbenchExpandedMaterialCategoryPath = "";
let workbenchExpandedMaterialPath = "";
let workbenchModelsLoaded = false;
let productionWorkspace = null;
const gptTestSelectedMaterials = new Set();
const gptTestMaterialEntries = new Map();
const gptTestSelectedTemplates = new Set();
let gptTemplateMode = localStorage.getItem("teambuilding-gpt-template-mode") === "online" ? "online" : "local";
let gptOnlineTemplates = [];
let gptOnlineTemplatesLoaded = false;
const gptTestExpandedCategories = new Set();
const gptTestExpandedMaterials = new Set();
const gptTestExpandedTemplates = new Set();
let gptTestQueue = [];
let gptTestQueueIndex = 0;
let gptEmbeddedResizeObserver = null;
let gptEmbeddedResizeTimer = null;
let gptLastShowSignature = "";
let gptShowInFlight = null;
let draggedGptAccountId = "";
let gptAutoRunning = false;
let gptAutoPaused = false;
let gptQueuePaused = false;
let gptCurrentManualTask = null;
let gptSemiAutoPendingTask = null; // Semi-auto: task waiting for user to confirm plan before continuing
let gptLastFailedTask = null;
let gptLastFailedStage = "";
let gptLastFailedPercent = 0;
let gptQuotaSnapshot = null;
const gptQuotaSnapshots = new Map();
let gptQuotaPauseStatus = "";
let gptContinuousLaunchTimer = null;
const GPT_WINDOW_RUNTIME_STORAGE_KEY = "teambuilding-gpt-window-runtime-v1";
let gptWindowRuntime = loadGptWindowRuntime();
let assistantBubbleTimer = null;
let assistantSuppressClickUntil = 0;
let assistantChatOpen = false;
const ASSISTANT_PERSISTENT_MESSAGE_KEY = "tb-workbench-assistant-persistent-message-v1";
let assistantPersistentMessage = String(localStorage.getItem(ASSISTANT_PERSISTENT_MESSAGE_KEY) || "");
let lastAssistantBubbleMessage = "";
let assistantDragState = null;
const assistantEventLog = [];
let assistantMuteUntil = Number(localStorage.getItem("tb-workbench-assistant-muted-until") || 0);
let assistantMuteTimer = null;

const WORKBENCH_ASSISTANT_PAGE_TIPS = {
  dashboardView: "当前生产状态：已暂停。左侧可选择素材，右侧查看历史记录。",
  gptProductionTestView: "内容生产区：先选素材，再选模板，点击上传开始自动生产。",
  distributionView: "内容分发：选择作品集后，右侧可创建公众号草稿或发送到设备。",
  conversionView: "流量转化：选择角色和素材，生成转化文案后可直接发布。",
  pluginsView: "插件市场：点击卡片可启用或禁用插件，部分设置需重启生效。",
  settingsView: "设置中心：修改路径和账号后需点击保存，部分设置需重启生效。",
};

let lastAssistantTipTime = 0;
let lastAssistantTipViewId = "";

function showAssistantTipForActiveView() {
  const activeView = document.querySelector(".view.active")?.id || "";
  if (!activeView) return;
  const tip = WORKBENCH_ASSISTANT_PAGE_TIPS[activeView];
  if (!tip) return;
  const now = Date.now();
  if (activeView === lastAssistantTipViewId && now - lastAssistantTipTime < 10000) return;
  if (Date.now() < assistantMuteUntil) return;
  showWorkbenchAssistantBubble(tip, { duration: 8000, transient: true });
  lastAssistantTipTime = now;
  lastAssistantTipViewId = activeView;
}

const GPT_ACCOUNTS_STORAGE_KEY = "teambuilding-gpt-accounts";
const GPT_AUTO_SETTINGS_STORAGE_KEY = "teambuilding-gpt-auto-settings";
const GPT_DEFAULT_MODE_MIGRATION_KEY = "teambuilding-gpt-default-mode-endless-v1";
const GPT_GENERATION_SAFETY_MIGRATION_KEY = "teambuilding-gpt-generation-safety-45-v1";
const GPT_ACCOUNT_GENERATION_SAFETY_MIGRATION_KEY = "teambuilding-gpt-account-generation-safety-45-v1";
const GPT_SERVER_GENERATION_SAFETY_MIGRATION_KEY = "teambuilding-gpt-server-generation-safety-45-v1";
const GPT_MODE_PROFILES_STORAGE_KEY = "teambuilding-gpt-mode-profiles-v1";
const GPT_PATROL_SETTINGS_STORAGE_KEY = "teambuilding-gpt-patrol-settings-v1";
const GPT_QUEUE_STORAGE_KEY = "teambuilding-gpt-queue-v1";
const GPT_MULTI_RUN_STORAGE_KEY = "teambuilding-gpt-multi-run-v1";
const GPT_CONTINUOUS_RUN_STORAGE_KEY = "teambuilding-gpt-continuous-run-v1";
const GPT_HISTORY_STORAGE_KEY = "teambuilding-gpt-production-history-v1";
const GPT_TEMPORARY_CACHE_STORAGE_KEY = "teambuilding-gpt-temporary-cache-maintenance-v1";
const GPT_TEMPORARY_CACHE_INTERVAL_MS = 3 * 60 * 60 * 1000;
const GPT_POST_REFRESH_TIMEOUT_MS = 20_000;
const gptTemporaryCacheMaintenanceTimers = new Map();
const gptAccountRefreshPromises = new Map();
const gptWindowRetryTimers = new Map();

function scheduleGptWindowRetry(accountId = activeGptAccountId, delayMs = 15_000, reason = "网页尚未就绪") {
  const key = String(accountId || activeGptAccountId);
  if (gptWindowRetryTimers.has(key)) return;
  const runtime = readGptWindowRuntime(key);
  if (runtime.stoppedByUser || runtime.pausedByUser || !isContinuousGptMode()) return;
  const delay = Math.max(5_000, Math.min(20 * 60_000, Number(delayMs) || 15_000));
  writeGptWindowRuntime(key, { status: "retry-wait", currentStage: reason, nextRetryAt: Date.now() + delay });
  showWorkbenchAssistantBubble(`${gptAccounts.find((item) => item.id === key)?.name || "当前账号窗口"}${reason}，${Math.ceil(delay / 1000)} 秒后自动重试，不需要手动点“重试”。`, { duration: 0, tone: "warning" });
  const timer = setTimeout(() => {
    gptWindowRetryTimers.delete(key);
    if (gptWindowIsUserStopped(key) || gptWindowIsUserPaused(key) || !isContinuousGptProductionArmed()) return;
    reconcileGptWindow(key, { force: true }).catch(() => scheduleGptWindowRetry(key, 20_000, "网页仍未就绪"));
  }, delay);
  gptWindowRetryTimers.set(key, timer);
}

function loadGptWindowRuntime() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GPT_WINDOW_RUNTIME_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}

function defaultGptWindowRuntime(accountId) {
  return {
    accountId: String(accountId || "account-1"),
    status: "idle",
    pausedByUser: false,
    stoppedByUser: false,
    currentTaskId: "",
    currentStage: "",
    currentPercent: 0,
    uploadedAttachments: 0,
    expectedAttachments: 0,
    expectedImages: 0,
    generatedImages: 0,
    // Per-account serial production cursor.  This is deliberately stored per
    // browser window so the cat never shows browser 1's "第几套" on browser 2.
    completedSets: 0,
    currentSetNumber: 0,
    currentSetStartedAt: null,
    nextProbeAt: null,
    updatedAt: Date.now()
  };
}

function readGptWindowRuntime(accountId = activeGptAccountId) {
  const key = String(accountId || "account-1");
  return { ...defaultGptWindowRuntime(key), ...(gptWindowRuntime[key] || {}), accountId: key };
}

function writeGptWindowRuntime(accountId, patch = {}) {
  const key = String(accountId || activeGptAccountId || "account-1");
  gptWindowRuntime[key] = { ...readGptWindowRuntime(key), ...patch, accountId: key, updatedAt: Date.now() };
  try { localStorage.setItem(GPT_WINDOW_RUNTIME_STORAGE_KEY, JSON.stringify(gptWindowRuntime)); } catch { /* private mode */ }
  return gptWindowRuntime[key];
}

function markGptWindowSetStarted(accountId = activeGptAccountId) {
  const current = readGptWindowRuntime(accountId);
  const account = gptAccounts.find((item) => item.id === String(accountId));
  const cycle = readGptCycleState(account?.quotaGroup || accountId);
  const cycleStart = Math.min(
    ...[cycle.uploadCycleStartAt, cycle.generationCycleStartAt].map((value) => Number(value || 0)).filter(Boolean)
  ) || 0;
  const cycleChanged = cycleStart > 0 && Number(current.setCycleStartedAt || 0) < cycleStart;
  const completedSets = cycleChanged ? 0 : Number(current.completedSets || 0);
  const nextNumber = Math.max(1, completedSets + 1);
  return writeGptWindowRuntime(accountId, {
    completedSets,
    currentSetNumber: nextNumber,
    setCycleStartedAt: cycleStart || current.setCycleStartedAt || Date.now(),
    currentSetStartedAt: current.currentSetStartedAt || Date.now(),
    generatedImages: 0
  });
}

function markGptWindowSetCompleted(accountId = activeGptAccountId) {
  const current = readGptWindowRuntime(accountId);
  return writeGptWindowRuntime(accountId, {
    completedSets: Math.max(0, Number(current.completedSets || 0)) + 1,
    currentSetNumber: Math.max(1, Number(current.currentSetNumber || Number(current.completedSets || 0) + 1)),
    currentSetStartedAt: null
  });
}

function gptWindowIsUserStopped(accountId = activeGptAccountId) {
  const state = readGptWindowRuntime(accountId);
  return Boolean(state.stoppedByUser);
}

function gptWindowIsUserPaused(accountId = activeGptAccountId) {
  const state = readGptWindowRuntime(accountId);
  return Boolean(state.pausedByUser);
}

// The production selector exposes four user-facing workflows, including a
// serial account-rotation workflow. Older builds stored several aliases;
// normalize them at the boundary so an upgrade cannot silently start a
// different queue.
const GPT_MODE_DEFINITIONS = Object.freeze({
  manual: { label: "人工控制", defaultName: "人工控制", shortName: "人工", continuous: false, multi: false, description: '自动上传附件和提示词到输入框，但不自动发送。需手动点发送，完成后点"完成当前，上传下一套"。适合新手试水、单帖精修。' },
  automatic: { label: "选材后自动", defaultName: "选材后自动", shortName: "选材后", continuous: false, multi: false, description: "选好素材后全自动完成上传→等计划→发确认→等图→求文案→打包归档。队列跑完即停。适合中小批量一次性生产。" },
  single: { label: "单账号全自动", defaultName: "单账号全自动", shortName: "单账号", continuous: true, multi: false, manualWindow: true, description: "单账号连续生产，额度触顶后自动等待恢复，跨重启自动续跑。工作时段 07:00-02:00。适合单账号长时间挂着生产。" },
  scheduled: { label: "定时单账号全自动", defaultName: "定时单账号全自动", shortName: "定时", continuous: true, multi: false, manualWindow: true, scheduled: true, description: "在指定时间点自动启动单账号生产，支持每日定时循环。适合固定时段定时生产场景。" },
  rotate: { label: "多账号全自动", defaultName: "多账号全自动", shortName: "多账号", continuous: true, multi: true, rotation: true, autoWindow: true, description: "多账号自动轮换，一个触顶自动切下一个账号窗口，全程无人值守。跨重启自动恢复。适合多账号最大化产能。" },
  patrol: { label: "单账号多对话巡检", defaultName: "单账号多对话巡检", shortName: "巡检", continuous: true, multi: false, manualWindow: true, patrol: true, description: "单账号下多个对话轮流巡检生产，每个对话独立处理一个素材。适合单账号多对话并行场景。" },
  // Kept as a compatibility profile for configurations created before the
  // mode rename. Hidden from the selector but still readable for old configs.
  "semi-auto": { label: "半自动（兼容）", defaultName: "半自动（兼容）", shortName: "半自动", continuous: false, multi: false, semiAuto: true, hidden: true, description: "自动上传并发送，计划完成后暂停等待人工确认。确认后自动完成出图→文案→打包归档。仅保留兼容性，新配置请使用其他模式。" },
  multi: { label: "多账号全自动（旧版）", defaultName: "多账号全自动（旧版）", shortName: "旧版", continuous: true, multi: true, rotation: true, legacy: true, hidden: true, description: "已废弃的旧版多账号模式，仅保留读取旧配置的兼容性。" }
});
// Legacy label retained for existing 0.14.x audit records: 单账号单模板·永不停歇。
// ── 模块分类体系（类似 RPA/N8N 的独立小模块） ──
// category: action(执行，含检测) / wait(等待) / time(时间) / flow(流程)
// hasText: 是否有文字输入框
// hasTimeout: 是否有超时秒数
// hasAutoDetect: 是否有自动检测开关
// hasRandomRange: 是否有随机等待范围(min/max)
// hasTimeWindow: 是否有开始/结束时间
// hasDailyTime: 是否有每日定时时间
const GPT_MODULE_CATEGORIES = Object.freeze({
  action: { label: "执行", color: "#4a9eff", icon: "▶" },
  wait: { label: "等待", color: "#f5a623", icon: "⏳" },
  detect: { label: "检测", color: "#9b59b6", icon: "🔍" },
  time: { label: "时间", color: "#27ae60", icon: "🕐" },
  flow: { label: "流程", color: "#e74c3c", icon: "🔀" }
});

// 每个模块的 rule 字段是用户可见的判断规则说明
// params 字段定义可调参数（key=参数名, label=显示标签, min/max/default=范围）
const GPT_WORKFLOW_MODULES = Object.freeze({
  // ── 执行模块 ──
  "upload-material": {
    label: "上传当前帖子", category: "action", hasText: true, hasTimeout: true, hasAutoDetect: true, hasRetry: true,
    rule: "上传素材文件到GPT并填充提示词到输入框，然后等待GPT开始回复",
    params: {}
  },
  "send-text": {
    label: "发送文字", category: "action", hasText: true, hasTimeout: false, hasAutoDetect: false, hasRetry: true,
    rule: "替换输入框文字并提交发送",
    params: {}
  },
  "insert-prompt": {
    label: "插入提示词", category: "action", hasText: true, hasTimeout: false, hasAutoDetect: false, hasRetry: false,
    rule: "替换输入框文字但不自动提交，等待用户手动发送",
    params: {}
  },
  "send-confirm": {
    label: "发送确认(扣1)", category: "action", hasText: true, hasTimeout: false, hasAutoDetect: false, hasRetry: true,
    rule: "发送指定确认文字（如\"1\"），通知GPT继续执行",
    params: {}
  },
  "request-copy": {
    label: "请求小红书文案", category: "action", hasText: true, hasTimeout: false, hasAutoDetect: false, hasRetry: true,
    rule: "发送文案请求提示词，请求GPT生成小红书文案",
    params: {}
  },
  "download-images": {
    label: "下载图片到成品库", category: "action", hasText: false, hasTimeout: true, hasAutoDetect: true,
    rule: "下载当前轮GPT生成的图片到本地成品库文件夹",
    params: {}
  },
  "save-text": {
    label: "保存文案到TXT", category: "action", hasText: false, hasTimeout: true, hasAutoDetect: true,
    rule: "提取GPT回复中的文案并保存为TXT文件",
    params: {}
  },
  "move-archive": {
    label: "移动到成品库文件夹", category: "action", hasText: false, hasTimeout: true, hasAutoDetect: false,
    rule: "将当前帖子的图片和文案移动到成品库对应文件夹",
    params: {}
  },
  "clipboard-copy": {
    label: "复制到剪贴板", category: "action", hasText: false, hasTimeout: false, hasAutoDetect: false,
    rule: "将文案复制到系统剪贴板",
    params: {}
  },
  "package-archive": {
    label: "合并打包(复制+下载+归档)", category: "action", hasText: false, hasTimeout: true, hasAutoDetect: false,
    rule: "一步完成：复制文案 + 下载图片 + 移动到成品库",
    params: {}
  },

  // ── 等待模块 ── (autoDetect开启时=条件检测，关闭时=纯超时)
  "wait-reply": {
    label: "等待回复完成", category: "wait", hasText: false, hasTimeout: true, hasAutoDetect: true,
    rule: "等待GPT回复完成。开启「自动」时检测4个条件全部满足才继续：①回复内容签名稳定（连续2次轮询hash相同）②GPT已停止生成（停止按钮消失）③回复出现完成动作（复制/下载按钮）④以上条件稳定保持≥静默秒数。关闭「自动」时纯等待到超时。",
    params: {
      quietSeconds: { label: "静默秒数", min: 1, max: 30, default: 3, desc: "回复内容连续不变多少秒才算\"写完了\"" }
    }
  },
  "wait-plan": {
    label: "等待迁移计划", category: "wait", hasText: false, hasTimeout: true, hasAutoDetect: true,
    rule: "等待GPT输出迁移计划。开启「自动」时检测：①回复内容签名稳定 ②GPT已停止生成 ③回复文本匹配计划结构或自定义完成关键词 ④稳定保持≥静默秒数。关闭时纯等待到超时。",
    params: {
      quietSeconds: { label: "静默秒数", min: 1, max: 30, default: 8, desc: "计划内容连续不变多少秒才算\"输出完成\"" },
      keywordPattern: { label: "完成关键词正则", type: "text", default: "迁移计划|逐页|P\\s*1|计划完成", desc: "检测到这些关键词后可作为计划完成信号，可改成你的固定完成词" }
    }
  },
  "wait-images": {
    label: "等待图片生成", category: "wait", hasText: false, hasTimeout: true, hasAutoDetect: true,
    rule: "等待GPT生成图片。开启「自动」时检测：①图片数量≥最小张数 ②图片数量停止增长 ③GPT已停止生成 ④回复文本匹配自定义完成关键词 ⑤稳定保持≥静默秒数。关闭时纯等待到超时。",
    params: {
      minImages: { label: "最小张数", min: 1, max: 20, default: 4, desc: "至少检测到多少张图片才算生成完成" },
      quietSeconds: { label: "静默秒数", min: 1, max: 30, default: 3, desc: "图片数量连续不变多少秒才算\"生成完成\"" },
      keywordPattern: { label: "完成关键词正则", type: "text", default: "出图完毕|图片完成|生成完成", desc: "让 GPT 出完图后回复其中一个关键词，可更快判定本轮出图结束" }
    }
  },
  "wait-copy": {
    label: "等待文案生成", category: "wait", hasText: false, hasTimeout: true, hasAutoDetect: true,
    rule: "等待GPT生成小红书文案。开启「自动」时检测：①回复内容签名稳定 ②GPT已停止生成 ③文案通过isLikelyPublishCopy检测或回复文本匹配自定义完成关键词 ④稳定保持≥静默秒数。关闭时纯等待到超时。",
    params: {
      minCopyLength: { label: "最小字数", min: 50, max: 2000, default: 300, desc: "文案至少多少字才算有效文案" },
      quietSeconds: { label: "静默秒数", min: 1, max: 30, default: 3, desc: "文案内容连续不变多少秒才算\"写完了\"" },
      keywordPattern: { label: "完成关键词正则", type: "text", default: "文案完成|文案已完成|复制文案完成", desc: "让 GPT 写完文案后回复其中一个关键词，可更快判定文案结束" }
    }
  },
  "wait-fixed": {
    label: "固定等待", category: "wait", hasText: false, hasTimeout: true, hasAutoDetect: false,
    rule: "固定等待指定秒数后继续下一步，不做任何检测",
    params: {}
  },
  "wait-random": {
    label: "随机等待", category: "wait", hasText: false, hasTimeout: false, hasAutoDetect: false, hasRandomRange: true,
    rule: "在最小~最大秒数范围内随机等待，用于生产间隔冷却",
    params: {}
  },

  // ── 检测模块（瞬间检测，不等待；等待请用「随机等待」组合） ──
  "detect-plan": {
    label: "检测·计划完成", category: "detect", hasText: false, hasTimeout: false, hasAutoDetect: false,
    rule: "瞬间检测当前回复是否包含迁移计划。匹配规则：正则 /迁移计划|逐页|P\\s*1/i",
    params: {
      pattern: { label: "匹配正则", type: "text", default: "迁移计划|逐页|P\\s*1", desc: "检测回复文本是否匹配此正则" }
    }
  },
  "detect-images": {
    label: "检测·图片已生成", category: "detect", hasText: false, hasTimeout: false, hasAutoDetect: false,
    rule: "瞬间检测当前回复中图片数量是否≥阈值",
    params: {
      minImages: { label: "最小张数", min: 1, max: 20, default: 1, desc: "至少多少张图片才算检测到" }
    }
  },
  "detect-copy": {
    label: "检测·文案已生成", category: "detect", hasText: false, hasTimeout: false, hasAutoDetect: false,
    rule: "瞬间检测当前回复是否包含有效文案。检测规则：文案长度≥最小字数 且 包含小红书关键词",
    params: {
      minCopyLength: { label: "最小字数", min: 50, max: 2000, default: 300, desc: "文案至少多少字才算有效" }
    }
  },
  "detect-state": {
    label: "检测·会话状态", category: "detect", hasText: false, hasTimeout: false, hasAutoDetect: false,
    rule: "瞬间检测当前会话状态。读取页面快照判断：unknown(未知) / plan-ready(计划就绪) / images-ready(图片就绪) / completed-copy-pending-package(文案完成待打包)",
    params: {}
  },
  "detect-generating": {
    label: "检测·GPT正在生成", category: "detect", hasText: false, hasTimeout: false, hasAutoDetect: false,
    rule: "瞬间检测GPT是否正在生成回复。检测规则：页面存在可见的\"停止生成\"按钮 或 存在流式标记[data-is-streaming=true]",
    params: {}
  },
  "detect-limit": {
    label: "检测·额度限制", category: "detect", hasText: false, hasTimeout: false, hasAutoDetect: false,
    rule: "瞬间检测是否触发额度/限制信号。检测规则：回复包含重试/限制/低产出关键词",
    params: {}
  },

  // ── 时间控制模块 ──
  "time-window": {
    label: "时间窗口(开始/结束)", category: "time", hasText: false, hasTimeout: false, hasAutoDetect: false, hasTimeWindow: true,
    rule: "仅在指定时间段内执行后续步骤，时间窗口外暂停",
    params: {}
  },
  "loop-daily": {
    label: "每日定时循环", category: "time", hasText: false, hasTimeout: false, hasAutoDetect: false, hasDailyTime: true,
    rule: "每天在指定时间触发一次工作流",
    params: {}
  },

  // ── 流程控制模块 ──
  "retry": {
    label: "失败重试", category: "flow", hasText: false, hasTimeout: true, hasAutoDetect: false,
    rule: "前一步骤失败时，等待指定秒数后自动重试1次",
    params: {}
  }
});
// 兼容旧代码：保留 GPT_WORKFLOW_ACTIONS 名称
const GPT_WORKFLOW_ACTIONS = GPT_WORKFLOW_MODULES;
const GPT_PUBLISH_COPY_PROMPT = "请只输出一份可直接复制发布的完整小红书文案。第一行直接写实际标题，随后直接写正文，末尾直接写话题标签。不要输出任何解释、开场白、总结，也不要输出“标题”“正文”“话题”“标签”等栏目名或 Markdown 标题。";
const LEGACY_GPT_COPY_PROMPTS = new Set(["给我一份小红书文案"]);
function normalizeGptCopyPrompt(value) {
  const prompt = String(value || "").trim();
  return !prompt || LEGACY_GPT_COPY_PROMPTS.has(prompt) ? GPT_PUBLISH_COPY_PROMPT : prompt;
}
function moduleCategory(action) {
  return GPT_WORKFLOW_MODULES[action]?.category || "action";
}
function moduleHasProp(action, prop) {
  return Boolean(GPT_WORKFLOW_MODULES[action]?.[prop]);
}
function defaultGptWorkflowSteps() {
  return [
    { action: "upload-material", text: "请读取全部附件，不要省略 TXT。先严格按既定格式输出逐页迁移计划，并在结尾等待我回复 1，暂时不要出图。", timeoutSeconds: 120, enabled: true, autoDetect: true },
    { action: "wait-random", text: "", enabled: true, minSeconds: 1, maxSeconds: 5 },
    { action: "wait-plan", text: "", timeoutSeconds: 480, enabled: true, autoDetect: true },
    { action: "send-confirm", text: "1", timeoutSeconds: 20, enabled: true, autoDetect: false },
    { action: "wait-random", text: "", enabled: true, minSeconds: 1, maxSeconds: 5 },
    { action: "wait-images", text: "", timeoutSeconds: 900, enabled: true, autoDetect: true },
    { action: "request-copy", text: GPT_PUBLISH_COPY_PROMPT, timeoutSeconds: 20, enabled: true, autoDetect: false },
    { action: "wait-random", text: "", enabled: true, minSeconds: 1, maxSeconds: 5 },
    { action: "wait-copy", text: "", timeoutSeconds: 480, enabled: true, autoDetect: true },
    { action: "download-images", text: "", timeoutSeconds: 600, enabled: true, autoDetect: true },
    { action: "save-text", text: "", timeoutSeconds: 60, enabled: true, autoDetect: true },
    { action: "move-archive", text: "", timeoutSeconds: 120, enabled: true, autoDetect: false }
  ];
}
function normalizeGptWorkflowSteps(value) {
  const source = Array.isArray(value) ? value : defaultGptWorkflowSteps();
  const defaults = defaultGptWorkflowSteps();
  const defaultMap = new Map(defaults.map((s) => [s.action, s]));
  const steps = source.map((step) => {
    const action = String(step?.action || "");
    const isValid = Object.prototype.hasOwnProperty.call(GPT_WORKFLOW_MODULES, action);
    // For steps that have a default text value, backfill it when the stored
    // config has an empty string. This ensures already-saved profiles pick up
    // new defaults without requiring the user to manually re-enter them.
    const defaultStep = defaultMap.get(action);
    const rawText = String(step?.text ?? "").trim();
    const text = action === "request-copy"
      ? normalizeGptCopyPrompt(rawText || defaultStep?.text)
      : ((!rawText && defaultStep?.text) ? defaultStep.text : rawText);
    // 从模块定义读取可调参数的默认值
    const moduleDef = GPT_WORKFLOW_MODULES[action];
    const moduleParams = moduleDef?.params || {};
    const paramValues = {};
    if (moduleParams && typeof moduleParams === "object") {
      for (const [pk, pdef] of Object.entries(moduleParams)) {
        if (pdef.type === "text") {
          paramValues[pk] = String(step?.[pk] ?? pdef.default ?? "");
        } else {
          const min = Number(pdef.min ?? 0);
          const max = Number(pdef.max ?? 9999);
          const def = Number(pdef.default ?? 0);
          paramValues[pk] = Math.max(min, Math.min(max, Number(step?.[pk] ?? def)));
        }
      }
    }
    return {
      action: isValid ? action : "",
      text,
      timeoutSeconds: Math.max(5, Math.min(3600, Number(step?.timeoutSeconds || defaultStep?.timeoutSeconds || 60))),
      enabled: step?.enabled !== false,
      autoDetect: moduleHasProp(action, "hasAutoDetect") ? step?.autoDetect !== false : false,
      minSeconds: Math.max(1, Math.min(3600, Number(step?.minSeconds || 5))),
      maxSeconds: Math.max(5, Math.min(3600, Number(step?.maxSeconds || 30))),
      timeStart: String(step?.timeStart || "09:00"),
      timeEnd: String(step?.timeEnd || "22:00"),
      dailyTime: String(step?.dailyTime || "09:30"),
      retryCount: Math.max(1, Math.min(10, Number(step?.retryCount || 3))),
      detectDelayMin: Math.max(0, Math.min(30, Number(step?.detectDelayMin ?? 1))),
      detectDelayMax: Math.max(1, Math.min(60, Number(step?.detectDelayMax ?? 3))),
      retryEnabled: moduleHasProp(action, "hasRetry") ? step?.retryEnabled === true : false,
      retryDelayMin: Math.max(30, Math.min(600, Number(step?.retryDelayMin ?? 120))),
      retryDelayMax: Math.max(60, Math.min(900, Number(step?.retryDelayMax ?? 300))),
      ...paramValues
    };
  }).filter((step) => step.action).slice(0, 20);
  // Safety check: ensure all critical default actions are present.
  // If any are missing, the configuration is incomplete (e.g., from a
  // corrupted or partially-saved localStorage). Fall back to full defaults
  // to ensure the complete workflow executes (upload → plan → confirm →
  // images → copy → download → archive).
  const defaultActions = new Set(defaults.map((s) => s.action));
  const presentActions = new Set(steps.map((s) => s.action));
  for (const action of defaultActions) {
    if (!presentActions.has(action)) {
      return defaults;
    }
  }
  return steps.length ? steps : defaults;
}
function workflowStepOrder(steps) {
  return new Map(normalizeGptWorkflowSteps(steps).map((step, index) => [step.action, { ...step, index }]));
}
function validateGptWorkflowSteps(value) {
  const steps = normalizeGptWorkflowSteps(value);
  const order = workflowStepOrder(steps);
  const enabled = (action) => order.get(action)?.enabled === true;

  // If the combined package-archive is enabled, the separated steps are optional
  const usesCombinedArchive = enabled("package-archive");
  const requires = [
    ["send-confirm", "wait-plan", "确认出图必须在计划完成后"],
    ["request-copy", "wait-images", "文案请求必须在本轮图片完成后"],
    ["wait-copy", "request-copy", "等待文案必须在文案请求后"]
  ];
  if (!enabled("upload-material")) return { ok: false, error: "必须保留“上传当前帖子”环节" };
  for (const [action, dependency, message] of requires) {
    if (!enabled(action)) continue;
    if (!enabled(dependency) || order.get(dependency).index >= order.get(action).index) return { ok: false, error: message };
  }
  // Validate separated archive steps ordering (only if package-archive is not used)
  if (!usesCombinedArchive) {
    if (enabled("download-images") && enabled("wait-images") && order.get("wait-images").index >= order.get("download-images").index)
      return { ok: false, error: "下载图片必须在图片生成完成后" };
    if ((enabled("save-text") || enabled("copy-text")) && enabled("wait-copy") && order.get("wait-copy").index >= (order.get("save-text")?.index ?? order.get("copy-text")?.index ?? 0))
      return { ok: false, error: "复制文案必须在文案完成后" };
    if ((enabled("move-archive") || enabled("move-to-archive")) && enabled("download-images") && order.get("download-images").index >= (order.get("move-archive")?.index ?? order.get("move-to-archive")?.index ?? 0))
      return { ok: false, error: "移动到成品库必须在下载图片完成后" };
  }
  return { ok: true, steps };
}
function normalizeGptProductionMode(value) {
  const mode = String(value || "").trim();
  // 自定义模式 key 直接透传
  if (mode.startsWith("custom-")) return mode;
  if (mode === "manual") return "manual";
  if (mode === "automatic" || mode === "auto") return "automatic";
  if (mode === "semi-auto" || mode === "semiauto" || mode === "semi") return "semi-auto";
  if (mode === "single" || ["single-wait-manual", "single-account-template-wait-manual", "manual-window-endless"].includes(mode)) return "single";
  if (mode === "scheduled" || ["scheduled-endless", "timer-single"].includes(mode)) return "scheduled";
  if (mode === "patrol" || ["patrol-multi-dialog", "conversation-patrol"].includes(mode)) return "patrol";
  if (mode === "rotate" || mode === "single-wait-auto" || mode === "single-account-template-wait-auto" || mode === "auto-window-endless" || mode === "single-window-multi-browser-rotation" || mode === "multi-browser-rotation") return "rotate";
  // Legacy "multi" mode is normalized to "rotate" for forward compatibility.
  if (mode === "multi") return "rotate";
  if (["all-day-multi", "multi-account-template-endless", "multi-account"].includes(mode)) return "rotate";
  if (["all-day", "single-template-endless", "single-account-template-endless", "random"].includes(mode)) return "single";
  return "manual";
}
function loadGptModeProfiles() {
  const defaults = {
    manual: { name: GPT_MODE_DEFINITIONS.manual.defaultName, useCurrentSession: true, confirmText: "1", copyPrompt: GPT_PUBLISH_COPY_PROMPT, steps: defaultGptWorkflowSteps() },
    automatic: { name: GPT_MODE_DEFINITIONS.automatic.defaultName, useCurrentSession: true, confirmText: "1", copyPrompt: GPT_PUBLISH_COPY_PROMPT, steps: defaultGptWorkflowSteps() },
    "semi-auto": { name: GPT_MODE_DEFINITIONS["semi-auto"].defaultName, useCurrentSession: true, confirmText: "1", copyPrompt: GPT_PUBLISH_COPY_PROMPT, steps: defaultGptWorkflowSteps() },
    single: { name: GPT_MODE_DEFINITIONS.single.defaultName, useCurrentSession: true, confirmText: "1", copyPrompt: GPT_PUBLISH_COPY_PROMPT, steps: defaultGptWorkflowSteps() },
    scheduled: { name: GPT_MODE_DEFINITIONS.scheduled.defaultName, useCurrentSession: true, confirmText: "1", copyPrompt: GPT_PUBLISH_COPY_PROMPT, steps: defaultGptWorkflowSteps() },
    rotate: { name: GPT_MODE_DEFINITIONS.rotate.defaultName, useCurrentSession: true, confirmText: "1", copyPrompt: GPT_PUBLISH_COPY_PROMPT, steps: defaultGptWorkflowSteps() },
    patrol: { name: GPT_MODE_DEFINITIONS.patrol.defaultName, useCurrentSession: true, confirmText: "1", copyPrompt: GPT_PUBLISH_COPY_PROMPT, steps: defaultGptWorkflowSteps() }
  };
  // 旧名 → 新名迁移表（0.14.28 模式名称统一）
  const LEGACY_MODE_NAME_MAP = {
    "手动": "人工控制", "上传不自动发": "人工控制",
    "自动": "选材后自动", "全流程无人值守": "选材后自动",
    "半自动": "半自动（兼容）", "计划后人工确认": "半自动（兼容）",
    "永不停歇": "单账号全自动", "单账号连续": "单账号全自动",
    "轮换": "多账号全自动", "多账号自动切": "多账号全自动"
  };
  try {
    const saved = JSON.parse(localStorage.getItem(GPT_MODE_PROFILES_STORAGE_KEY) || "{}");
    const builtIn = Object.fromEntries(Object.keys(defaults).map((key) => {
      const merged = { ...defaults[key], ...(saved?.[key] || {}) };
      merged.copyPrompt = normalizeGptCopyPrompt(merged.copyPrompt);
      // 迁移旧名：如果 localStorage 里存的是旧名，强制覆盖为新 defaultName
      const migratedName = LEGACY_MODE_NAME_MAP[merged.name];
      if (migratedName) merged.name = migratedName;
      else if (merged.name && merged.name !== defaults[key].name && !Object.values(LEGACY_MODE_NAME_MAP).includes(merged.name)) {
        // 用户自定义名保留，但确保不是已废弃的旧名
        // 如果 name 等于旧 defaultName 但不在映射表里，也强制更新为新 defaultName
      } else if (!merged.name || Object.keys(LEGACY_MODE_NAME_MAP).includes(merged.name)) {
        merged.name = defaults[key].name;
      }
      // 在加载时就 normalize steps，确保旧 localStorage 数据中的空提示词
      // 被默认值回填，避免设置面板显示空白输入框
      merged.steps = normalizeGptWorkflowSteps(merged.steps);
      return [key, merged];
    }));
    // 加载自定义模式（key 以 custom- 开头）
    const customModes = {};
    for (const [key, profile] of Object.entries(saved || {})) {
      if (key.startsWith("custom-") && profile?.name) {
        customModes[key] = {
          ...profile,
          copyPrompt: normalizeGptCopyPrompt(profile.copyPrompt),
          steps: normalizeGptWorkflowSteps(profile.steps),
          isCustom: true
        };
      }
    }
    return { ...builtIn, ...customModes };
  } catch { return defaults; }
}
let gptModeProfiles = loadGptModeProfiles();
// 0.14.31: 强制回填默认提示词并持久化，修复旧 localStorage 中空提示词的问题
(() => {
  let needsSave = false;
  for (const [key, profile] of Object.entries(gptModeProfiles)) {
    const normalized = normalizeGptWorkflowSteps(profile.steps);
    const uploadStep = normalized.find((s) => s.action === "upload-material");
    if (uploadStep && !uploadStep.text) {
      // normalizeGptWorkflowSteps should have already backfilled this,
      // but double-check and flag for save if it was empty before
      needsSave = true;
    }
    profile.steps = normalized;
  }
  if (needsSave) saveGptModeProfiles();
})();
function activeGptModeKey(value) {
  const configuredMode = normalizeGptProductionMode(value === undefined ? gptAutoSettings?.mode : value);
  return value === undefined
    ? normalizeGptProductionMode(TBGptAccountRotation.effectiveProductionMode(configuredMode, gptMultiRunState))
    : configuredMode;
}
function activeSettingsModeKey() {
  return activePageSettings === "gptAuto" && gptSettingsPreviewMode
    ? normalizeGptProductionMode(gptSettingsPreviewMode)
    : activeGptModeKey();
}
function isContinuousGptMode(value) {
  return Boolean(GPT_MODE_DEFINITIONS[activeGptModeKey(value)]?.continuous);
}
function isRotatingGptMode(value) {
  return activeGptModeKey(value) === "rotate";
}
function isSemiAutoGptMode(value = gptAutoSettings?.mode) {
  return normalizeGptProductionMode(value) === "semi-auto";
}
function saveGptModeProfiles() {
  localStorage.setItem(GPT_MODE_PROFILES_STORAGE_KEY, JSON.stringify(gptModeProfiles));
}
function applyGptModeProfile(mode = gptAutoSettings?.mode) {
  const key = activeGptModeKey(mode);
  const profile = gptModeProfiles[key] || gptModeProfiles.manual;
  gptAutoSettings.mode = key;
  gptAutoSettings.confirmText = String(profile.confirmText || "1").trim() || "1";
  gptAutoSettings.copyPrompt = normalizeGptCopyPrompt(profile.copyPrompt);
  gptAutoSettings.useCurrentSession = profile.useCurrentSession !== false;
  profile.steps = normalizeGptWorkflowSteps(profile.steps);
  // Sync workflowSteps to gptAutoSettings so task creation always has the
  // complete, normalized step list. Without this, gptAutoSettings.workflowSteps
  // could remain stale (empty or incomplete) from a previous load.
  gptAutoSettings.workflowSteps = profile.steps;
  const enabledActions = new Set(profile.steps.filter((step) => step.enabled).map((step) => step.action));
  gptAutoSettings.autoConfirm = enabledActions.has("send-confirm");
  gptAutoSettings.autoCopy = enabledActions.has("request-copy") && enabledActions.has("wait-copy");
  gptAutoSettings.autoPackage = enabledActions.has("package-archive");
  // Collect retry settings from all steps that support retry
  const retryConfig = {};
  for (const step of profile.steps) {
    if (moduleHasProp(step.action, "hasRetry")) {
      retryConfig[step.action] = {
        enabled: step.retryEnabled === true,
        delayMin: Number(step.retryDelayMin || 120),
        delayMax: Number(step.retryDelayMax || 300)
      };
    }
  }
  gptAutoSettings.retryConfig = retryConfig;
  return profile;
}
function renderGptModeWorkflow() {
  const container = $("#gptModeWorkflowEditor");
  if (!container) return;
  const profile = gptModeProfiles[activeSettingsModeKey()] || gptModeProfiles.manual;
  const steps = normalizeGptWorkflowSteps(profile.steps);
  // Fixed first row: init-session — same grid layout as dynamic steps, draggable, but not deletable
  const startBehavior = profile.useCurrentSession === false ? "inject" : "current";
  const initRow = `
    <div class="gpt-workflow-step gpt-workflow-step-init" data-workflow-fixed="true" draggable="true">
      <div class="gpt-workflow-main">
        <span class="gpt-workflow-drag-handle" title="拖动排序" aria-label="拖动排序">⠿</span>
        <span class="gpt-workflow-order">1</span>
        <span class="gpt-workflow-cat" style="color:${GPT_MODULE_CATEGORIES.action.color}" title="执行">▶</span>
        <select disabled aria-label="固定环节"><option selected>初始化会话</option></select>
        <select id="gptModeStartBehavior" aria-label="起始行为" data-workflow-field="startBehavior"><option value="current"${startBehavior === "current" ? " selected" : ""}>继续使用当前会话</option><option value="inject"${startBehavior === "inject" ? " selected" : ""}>注入模板提示词</option></select>
        <span class="gpt-workflow-spacer" style="visibility:hidden">&nbsp;</span>
        <span class="gpt-workflow-spacer" style="visibility:hidden">&nbsp;</span>
        <label class="gpt-workflow-enabled" style="opacity:.5"><input type="checkbox" checked disabled />启用</label>
        <span class="gpt-workflow-spacer" style="visibility:hidden">&nbsp;</span>
      </div>
    </div>`;
  container.innerHTML = initRow + steps.map((step, index) => {
    const cat = moduleCategory(step.action);
    const catInfo = GPT_MODULE_CATEGORIES[cat] || GPT_MODULE_CATEGORIES.action;
    const hasText = moduleHasProp(step.action, "hasText");
    const hasTimeout = moduleHasProp(step.action, "hasTimeout");
    const hasAutoDetect = moduleHasProp(step.action, "hasAutoDetect");
    const hasRandomRange = moduleHasProp(step.action, "hasRandomRange");
    const hasTimeWindow = moduleHasProp(step.action, "hasTimeWindow");
    const hasDailyTime = moduleHasProp(step.action, "hasDailyTime");
    const hasDetectDelay = moduleHasProp(step.action, "hasDetectDelay");
    const hasRetry = moduleHasProp(step.action, "hasRetry");
    // 获取当前 action 的默认提示词，用于下拉选择器
    const defaultsList = defaultGptWorkflowSteps();
    const defaultText = defaultsList.find((s) => s.action === step.action)?.text || "";
    const hasDefaultPrompt = Boolean(defaultText);
    // 判断当前值是否等于默认值
    const isUsingDefault = hasDefaultPrompt && step.text === defaultText;
    // 获取模块的规则说明和可调参数
    const moduleDef = GPT_WORKFLOW_MODULES[step.action];
    const moduleRule = moduleDef?.rule || "";
    const moduleParams = moduleDef?.params || {};
    const moduleParamEntries = Object.entries(moduleParams);
    const hasModuleParams = moduleParamEntries.length > 0;
    const moduleParamFields = moduleParamEntries.map(([pk, pdef]) => {
      const val = step[pk] ?? pdef.default;
      if (pdef.type === "text") {
        return `<label class="gpt-workflow-param" title="${escapeHtml(pdef.desc || "")}"><span>${escapeHtml(pdef.label)}</span><input type="text" data-workflow-field="${pk}" value="${escapeHtml(String(val))}" aria-label="${escapeHtml(pdef.label)}" /></label>`;
      }
      return `<label class="gpt-workflow-param" title="${escapeHtml(pdef.desc || "")}"><span>${escapeHtml(pdef.label)}</span><input type="number" data-workflow-field="${pk}" min="${pdef.min ?? 0}" max="${pdef.max ?? 9999}" value="${val}" aria-label="${escapeHtml(pdef.label)}" /></label>`;
    }).join("");
    const promptField = hasText
      ? `<div class="gpt-workflow-text-cell">${hasDefaultPrompt ? `<select class="gpt-workflow-prompt-preset" data-workflow-field="textPreset" data-action="${step.action}" title="切换提示词来源"><option value="custom"${isUsingDefault ? "" : " selected"}>自定义</option><option value="default"${isUsingDefault ? " selected" : ""}>默认</option></select>` : ""}<textarea data-workflow-field="text" class="gpt-workflow-prompt-editor" rows="1" placeholder="${step.action === "upload-material" ? "点击编辑上传提示词" : "点击编辑发送文字"}" aria-label="${escapeHtml(`第${index + 2}个环节${step.action === "upload-material" ? "上传提示词" : "发送文字"}`)}">${escapeHtml(step.text)}</textarea><button type="button" class="gpt-workflow-prompt-edit-btn" data-workflow-prompt-edit title="点击放大并编辑提示词">编辑提示词</button></div>`
      : `<span class="gpt-workflow-spacer" style="visibility:hidden">&nbsp;</span>`;
    const timingField = hasRandomRange
      ? `<label class="gpt-workflow-timeout gpt-workflow-random-inline"><input type="number" data-workflow-field="minSeconds" min="1" max="3600" value="${step.minSeconds}" aria-label="最小秒数" /><span>~</span><input type="number" data-workflow-field="maxSeconds" min="5" max="3600" value="${step.maxSeconds}" aria-label="最大秒数" /><span>秒</span></label>`
      : hasTimeout ? `<label class="gpt-workflow-timeout"><span>${hasDetectDelay ? "轮询" : "等待"}</span><input type="number" data-workflow-field="timeoutSeconds" min="5" max="3600" value="${step.timeoutSeconds}" aria-label="第${index + 2}个环节等待秒数" /><span>秒</span></label>`
      : `<span class="gpt-workflow-spacer" style="visibility:hidden">&nbsp;</span>`;
    const hasExtraControls = hasDetectDelay || hasRetry || hasTimeWindow || hasDailyTime || hasModuleParams;
    return `
    <div class="gpt-workflow-step gpt-workflow-step-${cat}" data-workflow-index="${index}" draggable="true">
      <div class="gpt-workflow-main">
        <span class="gpt-workflow-drag-handle" title="拖动排序" aria-label="拖动排序">⠿</span>
        <span class="gpt-workflow-order">${index + 2}</span>
        <span class="gpt-workflow-cat" style="color:${catInfo.color}" title="${catInfo.label}">${catInfo.icon}</span>
        <select data-workflow-field="action" aria-label="第${index + 2}个环节">${buildModuleOptions(step.action)}</select>
        ${promptField}
        ${timingField}
        ${hasAutoDetect ? `<label class="gpt-workflow-autodetect" title="开启后检测到完成就继续，等待时间仅作为上限"><input type="checkbox" data-workflow-field="autoDetect"${step.autoDetect ? " checked" : ""} />自动</label>` : `<span class="gpt-workflow-spacer" style="visibility:hidden">&nbsp;</span>`}
        <label class="gpt-workflow-enabled"><input type="checkbox" data-workflow-field="enabled"${step.enabled ? " checked" : ""} />启用</label>
        <button type="button" class="icon-button danger" data-workflow-remove title="删除环节" aria-label="删除环节">×</button>
      </div>
      ${hasExtraControls ? `
      <div class="gpt-workflow-extra">
        ${hasDetectDelay ? `<label class="gpt-workflow-detectdelay" title="检测到目标完成后，等待此范围随机秒数再继续下一步"><span>检测后延迟</span><input type="number" data-workflow-field="detectDelayMin" min="0" max="30" value="${step.detectDelayMin}" aria-label="检测后最小延迟秒" />~<input type="number" data-workflow-field="detectDelayMax" min="1" max="60" value="${step.detectDelayMax}" aria-label="检测后最大延迟秒" /><span>秒</span></label>` : ``}
        ${hasRetry ? `<div class="gpt-workflow-retry-group" title="发送后检测到失败(如出图错误、网络异常)，等待指定秒数后自动重试1次"><label class="gpt-workflow-retry-delay"><input type="checkbox" data-workflow-field="retryEnabled"${step.retryEnabled ? " checked" : ""} /><span>失败重试</span><input type="number" data-workflow-field="retryDelayMin" min="30" max="600" value="${step.retryDelayMin}" aria-label="重试最小秒数" /><span>~</span><input type="number" data-workflow-field="retryDelayMax" min="60" max="900" value="${step.retryDelayMax}" aria-label="重试最大秒数" /><span>秒</span></label></div>` : ``}
        ${hasTimeWindow ? `<label class="gpt-workflow-timewindow"><span>时间窗口</span><input type="time" data-workflow-field="timeStart" value="${step.timeStart}" aria-label="开始时间" />~<input type="time" data-workflow-field="timeEnd" value="${step.timeEnd}" aria-label="结束时间" /></label>` : ``}
        ${hasDailyTime ? `<label class="gpt-workflow-daily"><span>每日定时</span><input type="time" data-workflow-field="dailyTime" value="${step.dailyTime}" aria-label="每日执行时间" /></label>` : ``}
        ${moduleParamFields}
      </div>` : ``}
      ${moduleRule ? `<div class="gpt-workflow-rule" data-workflow-rule="${step.action}"><span class="gpt-workflow-rule-icon" title="判断规则">📋</span><span class="gpt-workflow-rule-text">${escapeHtml(moduleRule)}</span></div>` : ``}
    </div>`;
  }).join("");
}
function buildModuleOptions(currentAction) {
  const categories = ["action", "wait", "detect", "time", "flow"];
  return categories.map((cat) => {
    const catInfo = GPT_MODULE_CATEGORIES[cat];
    const modules = Object.entries(GPT_WORKFLOW_MODULES).filter(([, def]) => def.category === cat);
    if (!modules.length) return "";
    const opts = modules.map(([value, def]) => `<option value="${value}"${value === currentAction ? " selected" : ""}>${def.label}</option>`).join("");
    return `<optgroup label="${catInfo.icon} ${catInfo.label}">${opts}</optgroup>`;
  }).join("");
}
function readGptModeWorkflowFromUi() {
  return [...document.querySelectorAll("#gptModeWorkflowEditor .gpt-workflow-step:not([data-workflow-fixed])")].map((row) => {
    const action = row.querySelector('[data-workflow-field="action"]')?.value || "";
    const step = {
      action,
      text: row.querySelector('[data-workflow-field="text"]')?.value || "",
      timeoutSeconds: Number(row.querySelector('[data-workflow-field="timeoutSeconds"]')?.value || 60),
      enabled: row.querySelector('[data-workflow-field="enabled"]')?.checked !== false,
      autoDetect: row.querySelector('[data-workflow-field="autoDetect"]')?.checked === true,
      minSeconds: Number(row.querySelector('[data-workflow-field="minSeconds"]')?.value || 5),
      maxSeconds: Number(row.querySelector('[data-workflow-field="maxSeconds"]')?.value || 30),
      timeStart: row.querySelector('[data-workflow-field="timeStart"]')?.value || "09:00",
      timeEnd: row.querySelector('[data-workflow-field="timeEnd"]')?.value || "22:00",
      dailyTime: row.querySelector('[data-workflow-field="dailyTime"]')?.value || "09:30",
      retryCount: Number(row.querySelector('[data-workflow-field="retryCount"]')?.value || 3),
      detectDelayMin: Number(row.querySelector('[data-workflow-field="detectDelayMin"]')?.value ?? 1),
      detectDelayMax: Number(row.querySelector('[data-workflow-field="detectDelayMax"]')?.value ?? 3),
      retryEnabled: row.querySelector('[data-workflow-field="retryEnabled"]')?.checked === true,
      retryDelayMin: Number(row.querySelector('[data-workflow-field="retryDelayMin"]')?.value || 120),
      retryDelayMax: Number(row.querySelector('[data-workflow-field="retryDelayMax"]')?.value || 300)
    };
    // 读取模块定义中的动态参数
    const moduleDef = GPT_WORKFLOW_MODULES[action];
    const moduleParams = moduleDef?.params || {};
    for (const [pk, pdef] of Object.entries(moduleParams)) {
      const el = row.querySelector(`[data-workflow-field="${pk}"]`);
      if (!el) continue;
      step[pk] = pdef.type === "text" ? String(el.value || "") : Number(el.value || pdef.default);
    }
    return step;
  });
}
let gptPatrolDiscovery = null;
function loadGptPatrolSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(GPT_PATROL_SETTINGS_STORAGE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch { return {}; }
}
function patrolAllowlist(accountId = activeGptAccountId) {
  const settings = loadGptPatrolSettings();
  const values = settings?.[String(accountId || "")]?.allowlist;
  return Array.isArray(values) ? values.map((value) => String(value || "").trim()).filter(Boolean) : [];
}
function savePatrolAllowlist(values, accountId = activeGptAccountId) {
  const settings = loadGptPatrolSettings();
  settings[String(accountId || "")] = {
    ...(settings[String(accountId || "")] || {}),
    allowlist: [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))],
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(GPT_PATROL_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  return settings[String(accountId || "")].allowlist;
}
function renderGptPatrolDiscovery() {
  const list = $("#gptPatrolConversationList");
  if (!list) return;
  const conversations = Array.isArray(gptPatrolDiscovery?.conversations)
    ? gptPatrolDiscovery.conversations.filter((item) => item.titleMatched)
    : [];
  if (!conversations.length) {
    list.innerHTML = '<div class="gpt-patrol-empty">尚未发现标题包含“模板”的历史对话。</div>';
    return;
  }
  list.innerHTML = conversations.map((item, index) => `
    <article class="gpt-patrol-conversation ${item.eligible ? "eligible" : ""}">
      <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.url)}</small>${item.currentState?.patrolState?.label ? `<small>当前对话：${escapeHtml(item.currentState.patrolState.label)}</small>` : ""}</div>
      <span>${item.currentState?.patrolState?.label ? escapeHtml(item.currentState.patrolState.label) : (item.eligible ? "已准入" : "仅发现")}</span>
      <button type="button" data-patrol-toggle="${index}">${item.eligible ? "取消准入" : "允许续接"}</button>
    </article>`).join("");
}
function renderGptPatrolSettings(modeKey = activeSettingsModeKey()) {
  const group = $("#gptPatrolSettingsGroup");
  if (!group) return;
  group.hidden = modeKey !== "patrol";
  if (group.hidden) return;
  const input = $("#gptPatrolAllowlist");
  if (input) input.value = patrolAllowlist().join("\n");
  renderGptPatrolDiscovery();
}
async function discoverCurrentAccountPatrolConversations() {
  const status = $("#gptPatrolDiscoverStatus");
  const button = $("#gptPatrolDiscoverBtn");
  if (!window.gptWorkbench?.discoverPatrolConversations) {
    if (status) status.textContent = "当前桌面版本不支持巡检扫描，请重启加载新版";
    return null;
  }
  if (button) button.disabled = true;
  if (status) status.textContent = `正在只读扫描 ${activeGptAccount()?.name || activeGptAccountId}…`;
  try {
    const result = await window.gptWorkbench.discoverPatrolConversations(activeGptAccountId, {
      allowlist: patrolAllowlist(),
      maximumScrolls: 20
    });
    if (!result) throw new Error("GPT 页面尚未加载巡检扩展");
    if (result.error) throw new Error(result.error);
    gptPatrolDiscovery = result;
    renderGptPatrolDiscovery();
    if (status) status.textContent = `发现 ${result.discoveredCount || 0} 个对话，其中模板 ${result.templateCount || 0} 个、已准入 ${result.eligibleCount || 0} 个；未发送任何消息`;
    return result;
  } catch (error) {
    if (status) status.textContent = `扫描失败：${error.message}`;
    return null;
  } finally {
    if (button) button.disabled = false;
  }
}
function renderGptModeProfile() {
  const key = activeSettingsModeKey();
  const profile = gptModeProfiles[key] || gptModeProfiles.manual;
  if ($("#gptModeProfileLabel")) $("#gptModeProfileLabel").textContent = `${GPT_MODE_DEFINITIONS[key].label} · 右键可修改、重命名或删除配置`;
  renderGptModeWorkflow();
  // Set startBehavior value after renderGptModeWorkflow rebuilds the DOM
  if ($("#gptModeStartBehavior")) $("#gptModeStartBehavior").value = profile.useCurrentSession === false ? "inject" : "current";
  updateGptModeHint(key);
  updateGptModeInfoPopover(key);
  updateModeQuickTabs(key);
  renderGptPatrolSettings(key);
}
function updateModeQuickTabs(key) {
  const tabs = document.querySelectorAll("#gptModeQuickTabs .mode-quick-tab");
  const activeKey = key || activeGptModeKey();
  tabs.forEach((tab) => {
    const isActive = tab.dataset.mode === activeKey;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
}
function updateGptModeHint(key) {
  const hint = $("#gptModeHint");
  if (!hint) return;
  const def = GPT_MODE_DEFINITIONS[key || activeGptModeKey()];
  if (!def) return;
  hint.textContent = def.description || "";
}
function updateGptModeInfoPopover(key) {
  const popover = $("#gptModeInfoPopover");
  if (!popover) return;
  const def = GPT_MODE_DEFINITIONS[key || activeGptModeKey()];
  if (!def) return;
  popover.innerHTML = `<strong>${def.label}</strong>${def.description || ""}`;
}
function saveGptModeProfileFromUi() {
  const key = activeSettingsModeKey();
  const current = gptModeProfiles[key] || {};
  const workflow = validateGptWorkflowSteps(readGptModeWorkflowFromUi());
  if (!workflow.ok) {
    showWorkbenchAssistantBubble(`当前流程不能保存：${workflow.error}`, { duration: 5200 });
    return;
  }
  const confirmStep = workflow.steps.find((step) => step.action === "send-confirm");
  const copyStep = workflow.steps.find((step) => step.action === "request-copy");
  gptModeProfiles[key] = {
    ...current,
    name: current.name || GPT_MODE_DEFINITIONS[key].defaultName,
    useCurrentSession: $("#gptModeStartBehavior")?.value !== "inject",
    confirmText: String(confirmStep?.text || "1").trim() || "1",
    copyPrompt: normalizeGptCopyPrompt(copyStep?.text),
    steps: workflow.steps
  };
  saveGptModeProfiles();
  // Do NOT change the actual production mode — only save settings for the previewed mode
  if (key === activeGptModeKey()) applyGptModeProfile(key);
  saveGptAutoSettings();
  renderGptModeProfile();
  updateGptTestQueueStatus(`${gptModeProfiles[key]?.name || GPT_MODE_DEFINITIONS[key].defaultName} 设置已保存`);
  toast("模式设置已保存");
}
// New/untrained conversations use one versioned registry source. Existing
// trained conversation URLs stay compact and never receive this on every post.
const GPT_CURRENT_MASTER_PROMPT = TBGptPromptRegistry.currentInitializationPrompt;
const GPT_CURRENT_MASTER_PROMPT_VERSION = TBGptPromptRegistry.currentInitializationVersion;
function currentGptMasterPrompt() {
  return String(gptAutoSettings?.masterPromptRules || "").trim() || GPT_CURRENT_MASTER_PROMPT;
}
let gptProductionHistory = (() => {
  try {
    const rows = JSON.parse(localStorage.getItem(GPT_HISTORY_STORAGE_KEY) || "[]");
    return Array.isArray(rows) ? rows.slice(0, 200) : [];
  } catch { return []; }
})();
let gptAccounts = loadGptAccounts();
let activeGptAccountId = gptAccounts[0]?.id || "account-1";
let gptAutoSettings = loadGptAutoSettings();
let gptMultiRunState = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(GPT_MULTI_RUN_STORAGE_KEY) || "null");
    return saved && typeof saved === "object" ? saved : null;
  } catch { return null; }
})();

function configuredGptAccountIds() {
  const configured = Array.isArray(gptAutoSettings.multiAccountIds)
    ? gptAutoSettings.multiAccountIds.map((id) => String(id || "")).filter(Boolean)
    : [];
  return new Set(configured);
}

function availableMultiWindowAccounts() {
  const configured = configuredGptAccountIds();
  return gptAccounts.filter((account) => !account.hidden && !account.disabled && (!configured.size || configured.has(account.id)));
}

function availableRotationAccounts() {
  const configured = configuredGptAccountIds();
  return gptAccounts.filter((account) => (
    (!configured.size || configured.has(account.id))
    && TBGptAccountRotation.accountParticipatesInRotation(account, readGptWindowRuntime(account.id))
  ));
}

function gptAccountNeedsMasterPrompt(account = {}) {
  const url = String(account.lastUrl || "").trim();
  // A root ChatGPT URL is a fresh/unknown session. A conversation URL is
  // treated as trained only when it is a real /c/<id> conversation, so an
  // added browser cannot silently receive material without its template.
  return !/\/c\/[a-z0-9-]+/i.test(url);
}

function promptForNewGptSession(prompt = "", account = {}) {
  if (!gptAccountNeedsMasterPrompt(account)) return prompt;
  const extraRules = String(gptAutoSettings?.extraPromptRules || "").trim();
  const baseMaster = currentGptMasterPrompt();
  const master = extraRules ? `${baseMaster}\n\n${extraRules}` : baseMaster;
  return `${master}\n\n${prompt}`.trim();
}

function persistGptMultiRun(patch = {}) {
  gptMultiRunState = {
    ...(gptMultiRunState || {}),
    ...patch,
    updatedAt: new Date().toISOString()
  };
  try { localStorage.setItem(GPT_MULTI_RUN_STORAGE_KEY, JSON.stringify(gptMultiRunState)); } catch { /* private mode */ }
  return gptMultiRunState;
}

function clearGptMultiRunIfFinished() {
  if (!gptMultiRunState || gptMultiRunState.status === "running") return;
  // Keep the last run summary for the production-history UI, but remove a
  // stale pending queue so a restart never silently replays it.
  if (gptMultiRunState.status === "completed" && !gptTestQueue.some((task) => !["completed", "skipped"].includes(task._status))) {
    try { localStorage.removeItem(GPT_MULTI_RUN_STORAGE_KEY); } catch { /* private mode */ }
    gptMultiRunState = null;
  }
}

function persistGptQueue() {
  if (!gptTestQueue.length || gptTestQueueIndex >= gptTestQueue.length) {
    localStorage.removeItem(GPT_QUEUE_STORAGE_KEY);
    return;
  }
  localStorage.setItem(GPT_QUEUE_STORAGE_KEY, JSON.stringify({
    version: 1,
    savedAt: new Date().toISOString(),
    index: gptTestQueueIndex,
    paused: gptQueuePaused || gptAutoPaused,
    tasks: gptTestQueue.map((task) => ({
      ...task,
      autoOptions: task.autoOptions && Array.isArray(task.autoOptions.accounts)
        ? {
            ...task.autoOptions,
            accounts: task.autoOptions.accounts.map((account, index) => ({
              ...account,
              name: /^浏览器\s*\d+$/i.test(String(account?.name || "")) ? `账号窗口 ${index + 1}` : account?.name
            }))
          }
        : task.autoOptions,
      _status: task._status || "queued",
      _stage: task._stage || "",
      _percent: Number(task._percent || 0)
    }))
  }));
}

function isContinuousGptProductionArmed() {
  return isContinuousGptMode()
    && localStorage.getItem(GPT_CONTINUOUS_RUN_STORAGE_KEY) === "true";
}

function setContinuousGptProductionArmed(armed) {
  if (armed) localStorage.setItem(GPT_CONTINUOUS_RUN_STORAGE_KEY, "true");
  else localStorage.removeItem(GPT_CONTINUOUS_RUN_STORAGE_KEY);
}

function currentGptQueueIntegrityBlock() {
  const task = gptTestQueue[gptTestQueueIndex];
  if (!task || task._status === "completed") return null;
  const code = String(task._errorCode || "");
  if (!["COMPOSER_ATTACHMENTS_PENDING", "COMPOSER_DRAFT_PENDING", "COMPOSER_DRAFT_NOT_SET", "MIXED_POST_ATTACHMENTS", "MATERIAL_ROOT_MISSING", "COMPOSER_ATTACHMENT_CONFLICT", "LOCAL_BRIDGE_FETCH_FAILED", "ATTACHMENT_UPLOAD_NOT_READY", "UPLOAD_LIMIT_SIGNAL", "WINDOW_STAGE_PENDING", "WEB_RESPONSE_IN_FLIGHT", "IMAGE_COUNT_UNCERTAIN", "PLAN_PARSE_FAILED", "PLAN_NOT_READY", "PLAN_NOT_COMPLETE", "GENERATION_LIMIT_SIGNAL", "SCRIPT_GENERATED_OUTPUT", "COPY_REQUIRED"].includes(code)) return null;
  return task;
}

async function recoverContinuousPlanFailure(task, result = {}, accountId = "account-1") {
  const errorCode = String(result?.errorCode || task?._errorCode || "");
  if (!["PLAN_NOT_READY", "PLAN_NOT_COMPLETE"].includes(errorCode)) return false;
  if (!isContinuousGptMode() || !isContinuousGptProductionArmed()) return false;
  if (gptWindowIsUserStopped(accountId) || gptWindowIsUserPaused(accountId)) return false;

  const previousRequestId = String(task.requestId || "");
  const freshRetryCount = Math.max(0, Number(task._planFreshRetryCount || 0)) + 1;
  task._planFreshRetryCount = freshRetryCount;
  task.requestId = `gpt-plan-recovery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  task.retryOf = previousRequestId;
  task.retryFromStage = "";
  task.retryFromPercent = 0;
  task.forceUpload = true;
  task._submittedToGpt = false;
  task._status = "queued";
  task._stage = "等待重新上传";
  task._percent = 0;
  task._error = "";
  task._errorCode = "";
  delete task.workflow;

  if (freshRetryCount <= 2) {
    persistGptQueue();
    updateGptTestQueueStatus(`当前素材没有收到完整计划；正在清理网页并重新上传（${freshRetryCount}/2），不会跳到下一套。`);
    await refreshGptAfterProduction(accountId, "plan-response-fresh-retry").catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    return true;
  }

  task._planFreshRetryCount = 0;
  task._planRecoveryDeferrals = Math.max(0, Number(task._planRecoveryDeferrals || 0)) + 1;
  const currentIndex = gptTestQueue.indexOf(task);
  if (currentIndex >= 0) {
    const [deferredTask] = gptTestQueue.splice(currentIndex, 1);
    const deferDistance = Math.min(20, 3 + Number(task._planRecoveryDeferrals || 0));
    const deferIndex = Math.min(gptTestQueue.length, currentIndex + deferDistance);
    gptTestQueue.splice(deferIndex, 0, deferredTask);
  }
  persistGptQueue();
  updateGptTestQueueStatus("当前素材连续无完整计划，已保留并顺延重试；现在继续下一套，不暂停整条生产线。");
  await refreshGptAfterProduction(accountId, "plan-response-deferred").catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  return true;
}

// A continuous window may safely retry transport/readiness failures, but it
// must stop at an attachment conflict, an ambiguous reply, a low-output
// quota signal, or a script-generated result.  Those boundaries require the
// current reply/composer to be inspected instead of blindly sending again.
function isTransientGptWindowFailure(errorOrResult = {}) {
  const code = String(errorOrResult?.errorCode || errorOrResult?.code || "");
  const message = String(errorOrResult?.message || errorOrResult?.detail || errorOrResult?.error || errorOrResult || "");
  if (!code && !message) return false;
  if ([
    "LOCAL_BRIDGE_FETCH_FAILED",
    "ATTACHMENT_UPLOAD_NOT_READY",
    "WINDOW_STAGE_PENDING",
    "WEB_RESPONSE_IN_FLIGHT",
    "GPT_PAGE_NOT_READY",
    "GPT_PAGE_LOAD_TIMEOUT",
    "EXTENSION_NOT_READY",
    "COMPOSER_NOT_READY"
  ].includes(code)) return true;
  if (/(?:网页尚未就绪|网页状态没有完成确认|本地工作台连接失败|连接失败|网络错误|Failed to fetch|fetch failed|暂时不可用|正在准备 GPT 网页|页面仍在加载|响应仍在生成|工作台桥接|扩展尚未就绪|GPT 网页刷新失败)/i.test(message)) return true;
  return false;
}

function restoreGptQueue() {
  try {
    const saved = JSON.parse(localStorage.getItem(GPT_QUEUE_STORAGE_KEY) || "null");
    if (!saved || !Array.isArray(saved.tasks) || !saved.tasks.length) return;
    // 0.14.5 could stop after the first image while the same assistant
    // response was still adding more images. Rewind only that exact legacy
    // signature so 0.14.6 can recover the already-finished reply instead of
    // uploading the source post or sending `1` again.
    const legacyFalseStopIndex = saved.tasks.findIndex((task, index) => (
      index < Number(saved.index || 0)
      && task?._quotaSkipped === true
      && Number(task?.expectedImages || 0) >= 4
      && /本轮只检测到\s*1\s*张/.test(String(task?._error || ""))
      && /等待图片/.test(String(task?._stage || ""))
    ));
    if (legacyFalseStopIndex >= 0) {
      const task = saved.tasks[legacyFalseStopIndex];
      task._status = "paused";
      task._errorCode = "LEGACY_IMAGE_COUNT_RECHECK";
      task._error = "旧版图片计数可能过早收口；将从当前 GPT 回复重新核对，不重复上传或发送 1";
      task.retryFromStage = "等待图片";
      task.retryFromPercent = Number(task._percent || 64);
      task._quotaSkipped = false;
      delete task._endedAt;
      delete task._result;
      saved.index = legacyFalseStopIndex;
      saved.paused = true;
      localStorage.setItem(GPT_QUEUE_STORAGE_KEY, JSON.stringify(saved));
    }
    gptTestQueue = saved.tasks.map((task) => ({
      ...task,
      autoOptions: task.autoOptions && Array.isArray(task.autoOptions.accounts)
        ? {
            ...task.autoOptions,
            accounts: task.autoOptions.accounts.map((account, index) => ({
              ...account,
              name: /^浏览器\s*\d+$/i.test(String(account?.name || "")) ? `账号窗口 ${index + 1}` : account?.name
            }))
          }
        : task.autoOptions
    }));
    gptTestQueueIndex = Math.max(0, Math.min(saved.tasks.length, Number(saved.index || 0)));
    const hadInterruptedTask = gptTestQueue.some((task) => task._status === "running");
    gptTestQueue.forEach((task) => {
      if (task._status === "running") task._status = "paused";
    });
    // A persisted pause is an explicit safety boundary. Do not let the
    // continuous scheduler reinterpret it as permission to upload the next
    // post during startup. A renderer that died mid-task is also paused until
    // the operator resumes from its checkpoint, so the web page can never
    // silently race ahead after an update/reload.
    gptQueuePaused = Boolean(saved.paused || hadInterruptedTask);
    if (gptQueuePaused) {
      // Rehydrate the retry affordance as well as the queue itself.  After a
      // restart the old code restored the paused task but left
      // gptLastFailedTask null, so the visible “重试当前任务” button had no
      // effect until another failure happened in this renderer session.
      const currentTask = gptTestQueue[gptTestQueueIndex];
      if (currentTask && currentTask._status !== "completed" && currentTask._status !== "skipped") {
        gptLastFailedTask = currentTask;
        gptLastFailedStage = String(currentTask._stage || "");
        gptLastFailedPercent = Number(currentTask._percent || 0);
      }
      showWorkbenchAssistantBubble(`发现上次未完成队列：从第 ${gptTestQueueIndex + 1}/${gptTestQueue.length} 套继续。`, { duration: 0 });
    }
  } catch {
    localStorage.removeItem(GPT_QUEUE_STORAGE_KEY);
  }
}

function loadGptAccounts() {
  try {
    const stored = JSON.parse(localStorage.getItem(GPT_ACCOUNTS_STORAGE_KEY) || "[]");
    const accounts = Array.isArray(stored)
      ? stored.filter((item) => item && /^[a-z0-9_-]+$/i.test(String(item.id || ""))).slice(0, 8)
      : [];
    if (accounts.length) return accounts.map((item, index) => ({
      id: String(item.id),
      name: (/^浏览器\s*\d+$/i.test(String(item.name || "")) ? `账号窗口 ${index + 1}` : String(item.name || `账号窗口 ${index + 1}`)).slice(0, 24),
      quotaGroup: String(item.quotaGroup || item.id),
      hidden: Boolean(item.hidden),
      disabled: Boolean(item.disabled),
      lastUrl: String(item.lastUrl || ""),
      lastBrowserUrl: String(item.lastBrowserUrl || item.lastUrl || ""),
      lastOpenedAt: String(item.lastOpenedAt || ""),
      createdAt: String(item.createdAt || ""),
      // Per-window production mode: each account window remembers its own
      // mode (manual / automatic / single / rotate).  Undefined falls back
      // to the global gptAutoSettings.mode for backward compatibility.
      mode: item.mode ? normalizeGptProductionMode(item.mode) : undefined
    }));
  } catch {
    // Fall back to the first isolated account.
  }
  return [{ id: "account-1", name: "账号窗口 1", quotaGroup: "account-1", hidden: false }];
}

function saveGptAccounts() {
  localStorage.setItem(GPT_ACCOUNTS_STORAGE_KEY, JSON.stringify(gptAccounts));
}

async function hydrateGptBrowserProfiles() {
  if (!window.gptWorkbench?.profiles) return;
  try {
    let state = await window.gptWorkbench.profiles();
    const known = new Set((state.profiles || []).map((profile) => profile.id));
    for (const local of gptAccounts) {
      if (known.has(local.id)) continue;
      state = await window.gptWorkbench.saveProfile({
        ...local,
        name: local.name || `账号窗口 ${state.profiles.length + 1}`,
        active: false
      });
      known.add(local.id);
    }
    // Migrate the persisted native profile labels as well as the local UI
    // copy.  Earlier builds stored “浏览器 N”; leaving that value in the
    // Electron profile file made the next restart regress the account
    // language even though the current tab already showed “账号窗口 N”.
    const nativeProfiles = state.profiles || [];
    for (let index = 0; index < nativeProfiles.length; index += 1) {
      const profile = nativeProfiles[index];
      if (!/^浏览器\s*\d+$/i.test(String(profile.name || ""))) continue;
      state = await window.gptWorkbench.saveProfile({
        ...profile,
        name: `账号窗口 ${index + 1}`,
        active: profile.id === state.activeId
      });
    }
    const persistedAccountSettings = dashboard?.workspaceSettings?.pageSettings?.gptAuto?.accounts;
    if (Array.isArray(persistedAccountSettings)) {
      const quotaDefaults = dashboard?.workspaceSettings?.pageSettings?.gptAuto || {};
      const reconciledSettings = TBGptAccountRotation.reconcileAccountQuotaSettings({
        profiles: state.profiles || [],
        settings: persistedAccountSettings,
        defaults: {
          uploadLimit: quotaDefaults.uploadLimit || 80,
          generationLimit: quotaDefaults.generationLimit || 45,
          windowHours: quotaDefaults.windowHours || 3
        }
      });
      let settingsChanged = JSON.stringify(reconciledSettings) !== JSON.stringify(persistedAccountSettings);
      const migrateAccountSafety = localStorage.getItem(GPT_ACCOUNT_GENERATION_SAFETY_MIGRATION_KEY) !== "done";
      const normalizedSettings = reconciledSettings.map((account, index) => {
        if (!account) return account;
        const nameChanged = /^浏览器\s*\d+$/i.test(String(account.name || ""));
        const safetyChanged = migrateAccountSafety && Number(account.generationLimit) === 50;
        if (!nameChanged && !safetyChanged) return account;
        settingsChanged = true;
        return {
          ...account,
          ...(nameChanged ? { name: `账号窗口 ${index + 1}` } : {}),
          ...(safetyChanged ? { generationLimit: 45 } : {})
        };
      });
      // Keep the live renderer settings in sync with profiles discovered after
      // startup. The server-backed dashboard object is not the same object as
      // gptAutoSettings, so without this assignment a newly added account only
      // appeared in its quota panel after a full page reload.
      gptAutoSettings.accounts = normalizedSettings;
      localStorage.setItem(GPT_AUTO_SETTINGS_STORAGE_KEY, JSON.stringify(gptAutoSettings));
      if (settingsChanged && dashboard?.workspaceSettings?.pageSettings?.gptAuto) {
        dashboard.workspaceSettings.pageSettings.gptAuto.accounts = normalizedSettings;
        api("/api/page-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gptAuto: { accounts: normalizedSettings } })
        }).catch(() => {});
      }
      if (migrateAccountSafety) localStorage.setItem(GPT_ACCOUNT_GENERATION_SAFETY_MIGRATION_KEY, "done");
    }
    // Preserve per-window mode from localStorage when syncing Electron
    // profiles.  The mode is a UI-only field; the native profile store does
    // not carry it, so we merge it back from the previously saved accounts.
    const previousModes = new Map(gptAccounts.map((item) => [item.id, item.mode]));
    const previousDisabled = new Map(gptAccounts.map((item) => [item.id, Boolean(item.disabled)]));
    for (const profile of state.profiles || []) {
      const id = String(profile.id || "");
      if (Object.prototype.hasOwnProperty.call(profile, "disabled") || !previousDisabled.has(id)) continue;
      state = await window.gptWorkbench.saveProfile({
        ...profile,
        disabled: previousDisabled.get(id),
        active: false
      });
    }
    gptAccounts = (state.profiles || []).map((profile, index) => ({
      id: String(profile.id),
      name: (/^浏览器\s*\d+$/i.test(String(profile.name || "")) ? `账号窗口 ${index + 1}` : String(profile.name || `账号窗口 ${index + 1}`)),
      quotaGroup: String(profile.quotaGroup || profile.id),
      hidden: Boolean(profile.hidden),
      disabled: Object.prototype.hasOwnProperty.call(profile, "disabled")
        ? Boolean(profile.disabled)
        : Boolean(previousDisabled.get(String(profile.id))),
      lastUrl: String(profile.lastUrl || ""),
      lastBrowserUrl: String(profile.lastBrowserUrl || profile.lastUrl || ""),
      lastOpenedAt: String(profile.lastOpenedAt || ""),
      createdAt: String(profile.createdAt || ""),
      mode: previousModes.has(String(profile.id)) ? previousModes.get(String(profile.id)) : undefined
    }));
    activeGptAccountId = gptAccounts.some((profile) => profile.id === state.activeId && !profile.hidden)
      ? state.activeId
      : gptAccounts.find((profile) => !profile.hidden)?.id || gptAccounts[0]?.id || "account-1";
    saveGptAccounts();
    renderGptAccountTabs();
    renderGptBrowserManager();
  } catch (error) {
    console.warn("账号窗口档案读取失败，暂用本地标签", error);
  }
}

function loadGptAutoSettings() {
  const defaultDownloadRoot = "D:\\Download";
  const defaultProductRoot = "D:\\AICode\\项目推进\\projects\\江湖有旅人\\主项目\\成品库（GPT+本地脚本制作）";
  const normalizeProductionPath = (value, fallback) => {
    const path = String(value || "").trim();
    return /(?:^|[\\/])(?:_测试验收|验收)(?:[\\/]|$)/i.test(path) ? fallback : (path || fallback);
  };
  const defaults = {
    mode: "single",
    autoConfirm: true,
    autoCopy: true,
    autoPackage: true,
    pauseOnFailure: false,
    autoArchive: true,
    quotaReminderEnabled: true,
    minDelaySeconds: 25,
    maxDelaySeconds: 55,
    taskTimeoutMinutes: 30,
    accountTaskLimit: 8,
    parallelWorkers: 3,
    maximumWorkers: 5,
    // Empty means all visible browser profiles. Set this to a list to run a
    // deliberate two-account/three-account production without touching a
    // blank or untrained profile.
    multiAccountIds: [],
    uploadLimit: 80,
    generationLimit: 45,
    windowHours: 3,
    confirmText: "1",
    copyPrompt: GPT_PUBLISH_COPY_PROMPT,
    minimumImageCount: 4,
    idleUnloadMinutes: 30,
    downloadRoot: defaultDownloadRoot,
    productRoot: defaultProductRoot,
    promptLibraryEnabled: true,
    messageDownloadsEnabled: true,
    scheduledEnabled: false,
    scheduledTime: "09:30",
    scheduledJitterMinutes: 10,
    schedulePlan: "09:30,8",
    launchAtLogin: true,
    continuousAutoStart: true,
    continuousWorkHoursEnabled: true,
    continuousWorkStart: "07:00",
    continuousWorkEnd: "02:00",
    masterPromptRules: "",
    extraPromptRules: ""
  };
  try {
    const loaded = {
      ...defaults,
      ...JSON.parse(localStorage.getItem(GPT_AUTO_SETTINGS_STORAGE_KEY) || "{}"),
      // 0.14.2: a failed material is recorded and skipped. It must never hold
      // the remaining production queue hostage.
      pauseOnFailure: false
    };
    if (Array.isArray(loaded.accounts)) {
      loaded.accounts = loaded.accounts.map((account, index) => ({
        ...account,
        name: /^浏览器\s*\d+$/i.test(String(account?.name || "")) ? `账号窗口 ${index + 1}` : account?.name
      }));
    }
    if (localStorage.getItem(GPT_GENERATION_SAFETY_MIGRATION_KEY) !== "done") {
      if (Number(loaded.generationLimit) === 50) loaded.generationLimit = 45;
      localStorage.setItem(GPT_AUTO_SETTINGS_STORAGE_KEY, JSON.stringify(loaded));
      localStorage.setItem(GPT_GENERATION_SAFETY_MIGRATION_KEY, "done");
    }
    loaded.mode = normalizeGptProductionMode(loaded.mode);
    loaded.downloadRoot = normalizeProductionPath(loaded.downloadRoot, defaultDownloadRoot);
    loaded.productRoot = normalizeProductionPath(loaded.productRoot, defaultProductRoot);
    // Normalize workflowSteps to ensure all critical steps are present.
    // If the stored workflowSteps is empty or missing steps (e.g., from a
    // partially-saved config), fall back to the active profile's steps or
    // the full default workflow.
    const profileKey = normalizeGptProductionMode(loaded.mode);
    const profile = gptModeProfiles?.[profileKey] || gptModeProfiles?.manual;
    const profileSteps = normalizeGptWorkflowSteps(profile?.steps);
    const storedSteps = normalizeGptWorkflowSteps(loaded.workflowSteps);
    // Use stored steps only if they have all critical actions; otherwise use profile steps
    const defaultActions = new Set(defaultGptWorkflowSteps().map((s) => s.action));
    const storedHasAll = [...defaultActions].every((a) => storedSteps.some((s) => s.action === a));
    loaded.workflowSteps = storedHasAll ? storedSteps : profileSteps;
    return loaded;
  } catch {
    return defaults;
  }
}

function renderGptAutoSettings() {
  const values = gptAutoSettings;
  const mode = activeGptModeKey();
  values.mode = mode;
  applyGptModeProfile(mode);
  if ($("#gptProductionMode")) $("#gptProductionMode").value = mode;
  if ($("#gptAutoArchiveEnabled")) $("#gptAutoArchiveEnabled").checked = values.autoArchive !== false;
  if ($("#gptQuotaReminderEnabled")) $("#gptQuotaReminderEnabled").checked = values.quotaReminderEnabled !== false;
  if ($("#gptAutoMinDelay")) $("#gptAutoMinDelay").value = values.minDelaySeconds;
  if ($("#gptAutoMaxDelay")) $("#gptAutoMaxDelay").value = values.maxDelaySeconds;
  if ($("#gptAutoTaskTimeout")) $("#gptAutoTaskTimeout").value = values.taskTimeoutMinutes;
  if ($("#gptAutoAccountLimit")) $("#gptAutoAccountLimit").value = values.accountTaskLimit;
  if ($("#gptParallelWorkers")) $("#gptParallelWorkers").value = values.parallelWorkers;
  if ($("#gptUploadLimit")) $("#gptUploadLimit").value = values.uploadLimit;
  if ($("#gptGenerationLimit")) $("#gptGenerationLimit").value = values.generationLimit;
  if ($("#gptQuotaWindowHours")) $("#gptQuotaWindowHours").value = values.windowHours;
  if ($("#gptMinimumImageCount")) $("#gptMinimumImageCount").value = values.minimumImageCount;
  if ($("#gptIdleUnloadMinutes")) $("#gptIdleUnloadMinutes").value = values.idleUnloadMinutes;
  if ($("#gptScheduledEnabled")) $("#gptScheduledEnabled").checked = Boolean(values.scheduledEnabled);
  if ($("#gptScheduledTime")) $("#gptScheduledTime").value = values.scheduledTime || "09:30";
  if ($("#gptScheduledJitter")) $("#gptScheduledJitter").value = values.scheduledJitterMinutes ?? 10;
  if ($("#gptSchedulePlan")) $("#gptSchedulePlan").value = values.schedulePlan || "09:30,8";
  if ($("#gptLaunchAtLogin")) $("#gptLaunchAtLogin").checked = values.launchAtLogin !== false;
  if ($("#gptContinuousAutoStart")) $("#gptContinuousAutoStart").checked = values.continuousAutoStart !== false;
  if ($("#gptContinuousWorkHoursEnabled")) $("#gptContinuousWorkHoursEnabled").checked = values.continuousWorkHoursEnabled !== false;
  if ($("#gptContinuousWorkStart")) $("#gptContinuousWorkStart").value = values.continuousWorkStart || "07:00";
  if ($("#gptContinuousWorkEnd")) $("#gptContinuousWorkEnd").value = values.continuousWorkEnd || "02:00";
  if ($("#gptDownloadRoot")) $("#gptDownloadRoot").value = values.downloadRoot;
  if ($("#gptProductRoot")) $("#gptProductRoot").value = values.productRoot;
  if ($("#gptPromptLibraryEnabled")) $("#gptPromptLibraryEnabled").checked = values.promptLibraryEnabled !== false;
  if ($("#gptMessageDownloadsEnabled")) $("#gptMessageDownloadsEnabled").checked = values.messageDownloadsEnabled !== false;
  // Show the registry version and snapshot used for new-session injection.
  if ($("#gptPromptRegistryVersion")) $("#gptPromptRegistryVersion").textContent = `V${GPT_CURRENT_MASTER_PROMPT_VERSION}`;
  if ($("#gptMasterPromptRules")) $("#gptMasterPromptRules").value = currentGptMasterPrompt();
  if ($("#gptExtraPromptRules")) $("#gptExtraPromptRules").value = values.extraPromptRules || "";
  renderGptModeProfile();
  renderGptBrowserManager({ hydrateNative: true });
}

function saveGptAutoSettings() {
  const minDelay = $("#gptAutoMinDelay") ? Math.max(5, Number($("#gptAutoMinDelay").value || 25)) : (gptAutoSettings.minDelaySeconds || 25);
  const maxDelay = $("#gptAutoMaxDelay") ? Math.max(minDelay, Number($("#gptAutoMaxDelay").value || 55)) : (gptAutoSettings.maxDelaySeconds || 55);
  // Profile key = previewed mode (what the user is editing in settings panel);
  // actualMode = real production mode (must NOT change just because user is previewing).
  const profileKey = activeSettingsModeKey();
  const actualMode = activeGptModeKey();
  // ── Workflow steps are the single source of truth ──
  // Read from the UI editor if the settings panel is open; otherwise keep stored steps.
  const workflowDraft = readGptModeWorkflowFromUi();
  const profileSteps = normalizeGptWorkflowSteps(workflowDraft.length
    ? workflowDraft
    : gptModeProfiles[profileKey]?.steps);
  const confirmStep = profileSteps.find((s) => s.action === "send-confirm");
  const copyStep = profileSteps.find((s) => s.action === "request-copy");
  const waitCopyStep = profileSteps.find((s) => s.action === "wait-copy");
  const packageStep = profileSteps.find((s) => s.action === "package-archive");
  const derivedConfirmText = String(confirmStep?.text || "1").trim() || "1";
  const derivedCopyPrompt = normalizeGptCopyPrompt(copyStep?.text);
  // Only derive production flags from the ACTUAL mode's workflow, not the previewed mode
  const actualSteps = normalizeGptWorkflowSteps(gptModeProfiles[actualMode]?.steps || defaultGptWorkflowSteps());
  const actualConfirmStep = actualSteps.find((s) => s.action === "send-confirm");
  const actualCopyStep = actualSteps.find((s) => s.action === "request-copy");
  const actualWaitCopyStep = actualSteps.find((s) => s.action === "wait-copy");
  const actualPackageStep = actualSteps.find((s) => s.action === "package-archive");
  const derivedAutoConfirm = actualConfirmStep?.enabled !== false;
  const derivedAutoCopy = actualCopyStep?.enabled !== false && actualWaitCopyStep?.enabled !== false;
  const derivedAutoPackage = actualPackageStep?.enabled !== false;
  const useCurrentSession = $("#gptModeStartBehavior")?.value !== "inject";
  gptModeProfiles[profileKey] = {
    ...(gptModeProfiles[profileKey] || {}),
    useCurrentSession,
    confirmText: derivedConfirmText,
    copyPrompt: derivedCopyPrompt,
    steps: profileSteps
  };
  saveGptModeProfiles();
  const actualConfirmText = String(actualConfirmStep?.text || "1").trim() || "1";
  const actualCopyPrompt = normalizeGptCopyPrompt(actualCopyStep?.text);
  gptAutoSettings = {
    mode: actualMode,
    autoConfirm: derivedAutoConfirm,
    autoCopy: derivedAutoCopy,
    autoPackage: derivedAutoPackage,
    workflowSteps: actualSteps,
    pauseOnFailure: false,
    autoArchive: $("#gptAutoArchiveEnabled") ? $("#gptAutoArchiveEnabled").checked !== false : (gptAutoSettings.autoArchive !== false),
    quotaReminderEnabled: $("#gptQuotaReminderEnabled")?.checked !== false,
    minDelaySeconds: minDelay,
    maxDelaySeconds: maxDelay,
    taskTimeoutMinutes: Math.max(5, Number($("#gptAutoTaskTimeout")?.value || 30)),
    accountTaskLimit: Math.max(1, Number($("#gptAutoAccountLimit")?.value || 8)),
    parallelWorkers: Math.max(1, Math.min(5, Number($("#gptParallelWorkers")?.value || 3))),
    maximumWorkers: 5,
    multiAccountIds: Array.isArray(gptAutoSettings.multiAccountIds) ? gptAutoSettings.multiAccountIds : [],
    uploadLimit: Math.max(1, Number($("#gptUploadLimit")?.value || 80)),
    generationLimit: Math.max(1, Number($("#gptGenerationLimit")?.value || 45)),
    windowHours: Math.max(1, Number($("#gptQuotaWindowHours")?.value || 3)),
    confirmText: actualConfirmText,
    copyPrompt: actualCopyPrompt,
    minimumImageCount: Math.max(1, Number($("#gptMinimumImageCount")?.value || 4)),
    idleUnloadMinutes: Math.max(5, Number($("#gptIdleUnloadMinutes")?.value || 30)),
    downloadRoot: String($("#gptDownloadRoot")?.value || "D:\\Download").trim(),
    productRoot: String($("#gptProductRoot")?.value || "").trim(),
    promptLibraryEnabled: $("#gptPromptLibraryEnabled")?.checked !== false,
    messageDownloadsEnabled: $("#gptMessageDownloadsEnabled")?.checked !== false,
    scheduledEnabled: Boolean($("#gptScheduledEnabled")?.checked),
    scheduledTime: String($("#gptScheduledTime")?.value || "09:30"),
    scheduledJitterMinutes: Math.max(0, Math.min(60, Number($("#gptScheduledJitter")?.value || 0))),
    schedulePlan: String($("#gptSchedulePlan")?.value || "09:30,8").trim() || "09:30,8",
    launchAtLogin: $("#gptLaunchAtLogin")?.checked !== false,
    continuousAutoStart: $("#gptContinuousAutoStart")?.checked !== false,
    continuousWorkHoursEnabled: $("#gptContinuousWorkHoursEnabled")?.checked !== false,
    continuousWorkStart: String($("#gptContinuousWorkStart")?.value || "07:00"),
    continuousWorkEnd: String($("#gptContinuousWorkEnd")?.value || "02:00"),
    masterPromptRules: (() => {
      const value = String($("#gptMasterPromptRules")?.value || "").trim();
      return !value || value === GPT_CURRENT_MASTER_PROMPT ? "" : value;
    })(),
    extraPromptRules: String($("#gptExtraPromptRules")?.value || "").trim()
  };
  gptAutoSettings.mode = actualMode;
  localStorage.setItem(GPT_AUTO_SETTINGS_STORAGE_KEY, JSON.stringify(gptAutoSettings));
  window.gptWorkbench?.setLaunchAtLogin?.(gptAutoSettings.launchAtLogin !== false).catch(() => {});
  renderGptAutoSettings();
  if (dashboard?.workspaceSettings?.pageSettings) {
    const existingAccounts = dashboard.workspaceSettings.pageSettings.gptAuto?.accounts || [];
    const accountMap = new Map(existingAccounts.map((account) => [account.id, account]));
    gptAccounts.forEach((account) => {
      const previous = accountMap.get(account.id) || {};
      accountMap.set(account.id, {
        ...previous,
        id: account.id,
        name: account.name,
        uploadLimit: account.id === activeGptAccountId ? gptAutoSettings.uploadLimit : previous.uploadLimit || 80,
        generationLimit: account.id === activeGptAccountId ? gptAutoSettings.generationLimit : previous.generationLimit || 45,
        windowHours: account.id === activeGptAccountId ? gptAutoSettings.windowHours : previous.windowHours || 3
      });
    });
    api("/api/page-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gptAuto: { ...gptAutoSettings, accounts: [...accountMap.values()] } })
    }).then((result) => {
      dashboard.workspaceSettings.pageSettings = result.settings;
    }).catch(() => {});
  }
}
const expandedMaterialPaths = new Set();
const expandedCollectionNames = new Set();
let materialTreeInitialized = false;
let materialTreeView = window.localStorage.getItem("materialTreeView") === "icons" ? "icons" : "list";
let collectionViewMode = window.localStorage.getItem("collectionViewMode") === "grid" ? "grid" : "list";
let activePageSettings = "";
let gptSettingsPreviewMode = null;
const notifiedTransferStates = new Map();
const TRANSFER_TASK_VISIBLE_MS = 3 * 60 * 1000;
const transferDismissTimers = new Map();

const LOCATION_KEYWORDS = ["上海", "杭州", "安吉", "苏州", "南京", "湖州", "桐庐", "千岛湖", "莫干山", "宁波"];
const ACTIVITY_KEYWORDS = ["露营", "溯溪", "漂流", "烧烤", "农庄", "采摘", "徒步", "越野", "轰趴", "玩水"];
const SEASON_KEYWORDS = ["春季", "夏季", "秋季", "冬季"];
const MONTH_KEYWORDS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const FESTIVAL_KEYWORDS = ["五一", "端午", "中秋", "国庆", "春节", "年会", "七夕", "妇女节", "儿童节", "圣诞", "元旦", "清明"];
const MATERIAL_TYPE_KEYWORDS = ["信息流素材", "普通素材", "团建合集", "团建游戏", "夏季团建", "节日团建", "关键词采集"];
const DURATION_KEYWORDS = ["半日", "一日", "两天一夜", "三天两夜", "1日", "2天1夜", "3天2夜"];
const SORT_OPTIONS = [
  { id: "time", label: "按时间" },
  { id: "folderTime", label: "按文件夹时间" },
  { id: "likes", label: "按点赞" },
  { id: "comments", label: "按评论" },
  { id: "name", label: "按名称" }
];
const FILTER_MATCH_OPTIONS = [
  { id: "all", label: "全部满足" },
  { id: "any", label: "满足其一" }
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
window.MaterialWorkspace?.installShell();

async function api(path, options) {
  let response;
  try {
    response = await fetch(path, options);
  } catch (networkError) {
    throw new Error(`网络请求失败（${path}）：服务器未响应或连接被拒绝`);
  }
  if (!response.ok) {
    const text = await response.text();
    try {
      const payload = JSON.parse(text);
      throw new Error(payload.error || payload.message || text);
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(text || `请求失败（${response.status}）`);
      throw error;
    }
  }
  return response.json();
}

function toast(message, type) {
  const el = $("#toast");
  el.textContent = message;
  el.className = "toast show";
  if (type) el.classList.add(type);
  // 错误信息显示更久
  const duration = type === "error" ? 5000 : 1800;
  window.setTimeout(() => {
    el.classList.remove("show");
    if (type) el.classList.remove(type);
  }, duration);
}

function shortText(text, limit = 20) {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
  }[char]));
}

function normalizeForHistory(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function findPairHistory() {
  if (!selectedMaterial || !selectedTemplate) return null;
  const materialName = normalizeForHistory(selectedMaterial.name);
  const templateId = selectedTemplate.id;
  const candidates = [materialName, materialName.replace(/^\d+/, "")].filter((value) => value.length >= 8);
  const records = dashboard?.logs?.productionRecords || [];
  let best = null;
  records.forEach((record) => {
    if ((record["模板ID"] || "") !== templateId) return;
    const source = normalizeForHistory(record["素材文件夹"] || "");
    const title = normalizeForHistory(record["素材标题"] || "");
    let score = 0;
    candidates.forEach((candidate) => {
      if (source === candidate) score = Math.max(score, 100);
      else if (source.includes(candidate) || candidate.includes(source)) score = Math.max(score, 80);
      if (title && candidate.includes(title)) score = Math.max(score, 50);
    });
    if (score > (best?.score || 0)) best = { record, score };
  });
  return best?.score >= 50 ? best.record : null;
}

function getCurrentProductionTask() {
  if (!selectedMaterial || !selectedTemplate) return null;
  const tasks = dashboard?.productionTasks?.tasks || [];
  return tasks.find((task) => (
    task.materialId === selectedMaterial.id
    && task.templateId === selectedTemplate.id
  )) || null;
}

function renderProductionStatus() {
  const container = $("#productionStatus");
  if (!container) return;
  if (!selectedMaterial || !selectedTemplate) {
    container.innerHTML = "";
    return;
  }
  const task = getCurrentProductionTask();
  const history = findPairHistory();
  const defaultPages = Number.parseInt(selectedTemplate.defaultPages, 10) || 5;
  const sourceImageCount = selectedMaterial.imageCount || 0;
  const missing = [];
  if (selectedTemplate.imageCount < 2) missing.push("母版参考图不足");
  if (sourceImageCount < 3) missing.push("有效素材图偏少");
  if (!selectedMaterial.preview) missing.push("缺 TXT/文案信息源");
  const statusText = task
    ? task.status
    : history
    ? (history["状态"] || "已有历史记录")
    : (missing.length ? "信息不完整，建议先补素材" : "可进入生产计划");
  const statusClass = task
    ? (/完成/.test(task.status) ? "done" : /缺页|失败/.test(task.status) ? "warn" : "ready")
    : history
    ? (/(完成|校准)/.test(statusText) ? "done" : "warn")
    : (missing.length ? "warn" : "ready");
  const tags = (selectedMaterial.tags || []).slice(0, 6).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  const taskLine = task
    ? `已生成 ${task.generatedPages || 0}/${task.expectedPages || defaultPages} 页${task.missing?.length ? ` · ${task.missing.join("、")}` : ""}`
    : `${selectedTemplate.id} 母版 · 计划 ${defaultPages} 页 · 素材 ${sourceImageCount} 张`;
  const nextTask = dashboard?.productionTasks?.next;
  const nextLine = nextTask
    ? `队列下一步：${escapeHtml(shortText(nextTask.materialName, 24))} × ${escapeHtml(nextTask.templateId)}`
    : "当前筛选队列暂无待续接项。";
  container.innerHTML = `
    <div class="production-status-head">
      <span>当前生产判断</span>
      <strong class="${statusClass}">${escapeHtml(statusText)}</strong>
    </div>
    <p>${escapeHtml(taskLine)}</p>
    <div class="tag-strip">${tags || "<span>未识别标签</span>"}</div>
    <small>${task ? nextLine : (history ? `可验证历史：${escapeHtml(history["素材标题"] || history["素材ID"] || "同模板记录")}` : (missing.length ? `待补：${escapeHtml(missing.join("、"))}` : `先写出图计划，再按 V${GPT_CURRENT_MASTER_PROMPT_VERSION} 母版规则生成。`))}</small>
  `;
}

function parentPath(targetPath) {
  const normalized = (targetPath || "").replace(/[\\/]+$/, "");
  const index = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  return index > 0 ? normalized.slice(0, index) : normalized;
}

function currentFocusFolder() {
  return focusTarget?.folderPath || selectedMaterial?.path || selectedTemplate?.path || dashboard?.projectRoot || "";
}

function closeCustomSelects(except = null) {
  $$(".custom-select.open").forEach((select) => {
    if (select !== except) select.classList.remove("open");
  });
}

function syncCustomSelect(select) {
  if (!select) return;
  select.classList.add("native-select-hidden");
  const shell = select.nextElementSibling?.classList.contains("custom-select") ? select.nextElementSibling : null;
  if (!shell) return;
  const trigger = shell.querySelector(".custom-select-trigger");
  const triggerText = trigger.querySelector("span");
  const menu = shell.querySelector(".custom-select-menu");
  const selected = select.selectedOptions[0] || select.options[0];
  triggerText.textContent = selected?.textContent?.trim() || "未选择";
  trigger.title = selected?.textContent?.trim() || "";
  trigger.dataset.path = selected?.dataset.path || selected?.value || "";
  menu.innerHTML = "";
  Array.from(select.options).forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `custom-select-option${option.value === select.value ? " active" : ""}`;
    button.dataset.value = option.value;
    button.dataset.path = option.dataset.path || option.value;
    button.title = option.textContent;
    button.textContent = option.textContent;
    button.addEventListener("click", () => {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      closeCustomSelects();
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      contextMenuTarget = { label: option.textContent, path: option.dataset.path || option.value, selectId: select.id };
      showContextMenu(event.clientX, event.clientY);
    });
    menu.appendChild(button);
  });
}

function showContextMenu(x, y) {
  const menu = $("#contextMenu");
  if (!menu || !contextMenuTarget) return;
  const isFolderBinding = contextMenuTarget.kind === "folder-binding";
  const isEditableFolder = contextMenuTarget.kind === "gpt-material-folder" || contextMenuTarget.kind === "gpt-template-folder";
  const isBrowserProfile = contextMenuTarget.kind === "gpt-browser-profile";
  const isProductionMode = contextMenuTarget.kind === "gpt-production-mode";
  if ($("#contextOpenFolder")) $("#contextOpenFolder").hidden = isBrowserProfile || isProductionMode;
  if ($("#contextCopyPath")) $("#contextCopyPath").hidden = isBrowserProfile || isProductionMode;
  if ($("#contextSetFolder")) $("#contextSetFolder").hidden = !isFolderBinding || isBrowserProfile;
  if ($("#contextRename")) $("#contextRename").hidden = isFolderBinding;
  const toggleDisableBtn = $("#contextToggleDisable");
  if (toggleDisableBtn) {
    toggleDisableBtn.hidden = !isBrowserProfile;
    if (isBrowserProfile) {
      const profile = gptAccounts.find((item) => item.id === contextMenuTarget.accountId);
      toggleDisableBtn.textContent = profile?.disabled ? "启用账号窗口" : "暂时禁用";
      toggleDisableBtn.classList.toggle("danger-action", !profile?.disabled);
    }
  }
  if ($("#contextRemoveAccount")) $("#contextRemoveAccount").hidden = !isBrowserProfile;
  if ($("#contextTrashFolder")) $("#contextTrashFolder").hidden = !isEditableFolder;
  if ($("#contextModeSettings")) {
    $("#contextModeSettings").hidden = !(isProductionMode || isBrowserProfile);
    $("#contextModeSettings").textContent = isBrowserProfile ? "账号生产与额度设置" : "修改模式设置";
  }
  if ($("#contextDeleteMode")) $("#contextDeleteMode").hidden = !isProductionMode;
  if ($("#contextCopyTemplateCommand")) $("#contextCopyTemplateCommand").hidden = isFolderBinding || isBrowserProfile || isProductionMode;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.classList.add("show");
  // WebContentsView 是独立合成层，DOM z-index 无法盖住它。GPT 视图活动时
  // 先隐藏原生视图，否则右键菜单被 GPT 页面遮挡看不见。
  const gptActive = $("#gptProductionTestView")?.classList.contains("active");
  if (gptActive && window.gptWorkbench?.available && !contextMenuGptHidden) {
    contextMenuGptHidden = true;
    window.gptWorkbench.hide?.().catch(() => {});
  }
}

function hideContextMenu() {
  $("#contextMenu")?.classList.remove("show");
  if (contextMenuGptHidden) {
    contextMenuGptHidden = false;
    // 延迟恢复：如果紧接着打开了对话框（重命名/删除等），让对话框自己管理
    // hide/restore；否则恢复 GPT 原生视图。延迟 120ms 让 click handler 有时间
    // 触发 openSystemDialog（它会自己 hide GPT 视图）。
    setTimeout(() => {
      if (!document.querySelector(".system-dialog-backdrop")
        && !$("#contextMenu")?.classList.contains("show")) {
        restoreEmbeddedGptView();
      }
    }, 120);
  }
}

function enhanceSelect(selectId) {
  const select = $(`#${selectId}`);
  if (!select) return;
  select.classList.add("native-select-hidden");
  let shell = select.nextElementSibling;
  if (!shell || !shell.classList.contains("custom-select") || shell.dataset.selectId !== selectId) {
    shell = document.createElement("div");
    shell.className = "custom-select";
    shell.dataset.selectId = selectId;
    shell.innerHTML = `
      <button type="button" class="custom-select-trigger"><span></span></button>
      <div class="custom-select-menu"></div>
    `;
    select.insertAdjacentElement("afterend", shell);
    const trigger = shell.querySelector(".custom-select-trigger");
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const shouldOpen = !shell.classList.contains("open");
      closeCustomSelects(shell);
      shell.classList.toggle("open", shouldOpen);
    });
    trigger.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const selected = select.selectedOptions[0] || select.options[0];
      const isProductionMode = select.id === "gptProductionMode";
      contextMenuTarget = {
        ...(isProductionMode ? {
          kind: "gpt-production-mode",
          mode: normalizeGptProductionMode(selected?.value || "manual")
        } : {}),
        label: selected?.textContent || "",
        path: selected?.dataset.path || selected?.value || "",
        selectId: select.id
      };
      showContextMenu(event.clientX, event.clientY);
    });
    trigger.addEventListener("wheel", (event) => {
      if (!select.options.length) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? 1 : -1;
      const nextIndex = Math.min(Math.max(select.selectedIndex + delta, 0), select.options.length - 1);
      if (nextIndex === select.selectedIndex) return;
      select.selectedIndex = nextIndex;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }, { passive: false });
  }
  syncCustomSelect(select);
}

async function copyText(text, label = "已复制") {
  await navigator.clipboard.writeText(text || "");
  toast(label);
}

function saveLocalState(next) {
  const state = { ...(dashboard?.state || {}), ...next };
  delete state.productionMode;
  delete state.selectedTemplateUsage;
  localStorage.setItem("tb-dashboard-state", JSON.stringify(state));
  api("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state)
  }).catch(() => {});
  if (dashboard) dashboard.state = state;
}

function getSavedState() {
  try {
    const localState = JSON.parse(localStorage.getItem("tb-dashboard-state") || "{}");
    const categories = dashboard?.materials?.categories || [];
    if (categories.length && localState.selectedMaterialCategoryPath
      && !categories.some((category) => category.path === localState.selectedMaterialCategoryPath)) {
      delete localState.selectedMaterialCategoryPath;
      delete localState.selectedMaterial;
      delete localState.selectedMaterialCategory;
      localStorage.setItem("tb-dashboard-state", JSON.stringify(localState));
    }
    return { ...(dashboard?.state || {}), ...localState };
  } catch {
    return dashboard?.state || {};
  }
}

async function migrateServerGptGenerationSafety(persistedGptAuto) {
  if (!persistedGptAuto || typeof persistedGptAuto !== "object") return persistedGptAuto;
  if (localStorage.getItem(GPT_SERVER_GENERATION_SAFETY_MIGRATION_KEY) === "done") return persistedGptAuto;
  const accounts = Array.isArray(persistedGptAuto.accounts) ? persistedGptAuto.accounts : [];
  const migratedAccounts = accounts.map((account) => (
    account && Number(account.generationLimit) === 50
      ? { ...account, generationLimit: 45 }
      : account
  ));
  const changed = Number(persistedGptAuto.generationLimit) === 50
    || migratedAccounts.some((account, index) => account?.generationLimit !== accounts[index]?.generationLimit);
  const migrated = {
    ...persistedGptAuto,
    ...(Number(persistedGptAuto.generationLimit) === 50 ? { generationLimit: 45 } : {}),
    accounts: migratedAccounts
  };
  if (changed) {
    const result = await api("/api/page-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gptAuto: migrated })
    });
    localStorage.setItem(GPT_SERVER_GENERATION_SAFETY_MIGRATION_KEY, "done");
    return result?.settings?.gptAuto || migrated;
  }
  localStorage.setItem(GPT_SERVER_GENERATION_SAFETY_MIGRATION_KEY, "done");
  return migrated;
}

async function loadDashboard(force = false, libraryPath = "") {
  const previousCategories = libraryPath
    ? new Map((dashboard?.materials?.categories || []).filter((category) => category.loaded !== false).map((category) => [category.path, category]))
    : null;
  const params = new URLSearchParams();
  if (force) params.set("refresh", force === "materials" ? "materials" : "1");
  if (libraryPath) params.set("library", libraryPath);
  const query = params.toString();
  dashboard = await api(`/api/dashboard${query ? `?${query}` : ""}`);
  let persistedGptAuto = dashboard?.workspaceSettings?.pageSettings?.gptAuto;
  persistedGptAuto = await migrateServerGptGenerationSafety(persistedGptAuto);
  if (persistedGptAuto && dashboard?.workspaceSettings?.pageSettings) {
    dashboard.workspaceSettings.pageSettings.gptAuto = persistedGptAuto;
  }
  if (persistedGptAuto && typeof persistedGptAuto === "object") {
    const persistedAccounts = Array.isArray(persistedGptAuto.accounts) ? persistedGptAuto.accounts : [];
    const normalizedAccounts = persistedAccounts.map((account, index) => (
      account && /^浏览器\s*\d+$/i.test(String(account.name || ""))
        ? { ...account, name: `账号窗口 ${index + 1}` }
        : account
    ));
    const activeAccountSettings = (persistedGptAuto.accounts || []).find((account) => account.id === activeGptAccountId)
      || persistedGptAuto.accounts?.[0] || {};
    gptAutoSettings = {
      ...gptAutoSettings,
      ...persistedGptAuto,
      accounts: normalizedAccounts,
      uploadLimit: activeAccountSettings.uploadLimit ?? gptAutoSettings.uploadLimit,
      generationLimit: activeAccountSettings.generationLimit ?? gptAutoSettings.generationLimit,
      windowHours: activeAccountSettings.windowHours ?? gptAutoSettings.windowHours
    };
    // Critical: persistedGptAuto from app-settings.json may not contain
    // workflowSteps (older server-side backup). Preserve the existing
    // workflowSteps from localStorage or fall back to the current mode
    // profile's steps. Without this, the spread above overwrites
    // workflowSteps to undefined, causing the workflow to skip all steps
    // after upload (send-confirm, wait-images, request-copy, etc.).
    if (!Array.isArray(gptAutoSettings.workflowSteps) || !gptAutoSettings.workflowSteps.length) {
      const profileKey = normalizeGptProductionMode(gptAutoSettings.mode);
      const profile = gptModeProfiles?.[profileKey] || gptModeProfiles?.manual;
      gptAutoSettings.workflowSteps = normalizeGptWorkflowSteps(profile?.steps);
    } else {
      gptAutoSettings.workflowSteps = normalizeGptWorkflowSteps(gptAutoSettings.workflowSteps);
    }
    gptAutoSettings.mode = normalizeGptProductionMode(gptAutoSettings.mode);
    applyGptModeProfile(gptAutoSettings.mode);
    localStorage.setItem(GPT_AUTO_SETTINGS_STORAGE_KEY, JSON.stringify(gptAutoSettings));
    if (normalizedAccounts.some((account, index) => account?.name !== persistedAccounts[index]?.name)) {
      api("/api/page-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gptAuto: { accounts: normalizedAccounts } })
      }).catch(() => {});
    }
  }
  if (localStorage.getItem(GPT_DEFAULT_MODE_MIGRATION_KEY) !== "done") {
    gptAutoSettings = {
      ...gptAutoSettings,
      mode: "single",
      launchAtLogin: true,
      continuousAutoStart: true,
      continuousWorkHoursEnabled: true,
      continuousWorkStart: "07:00",
      continuousWorkEnd: "02:00"
    };
    localStorage.setItem(GPT_DEFAULT_MODE_MIGRATION_KEY, "done");
    localStorage.setItem(GPT_AUTO_SETTINGS_STORAGE_KEY, JSON.stringify(gptAutoSettings));
    api("/api/page-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gptAuto: gptAutoSettings })
    }).then((result) => {
      if (dashboard?.workspaceSettings) dashboard.workspaceSettings.pageSettings = result.settings;
    }).catch(() => {});
  }
  if (previousCategories && dashboard?.materials?.categories) {
    dashboard.materials.categories = dashboard.materials.categories.map((category) => {
      const previous = previousCategories.get(category.path);
      return category.loaded === false && previous ? previous : category;
    });
  }
  if (!libraryPath) {
    const saved = getSavedState();
    const loadedCategory = dashboard?.materials?.categories?.find((category) => category.loaded !== false);
    const namedCategory = dashboard?.materials?.categories?.find((category) => category.name === saved.selectedMaterialCategory);
    if (loadedCategory?.count === 0 && namedCategory && namedCategory.path !== loadedCategory.path) {
      saveLocalState({
        selectedMaterialCategory: namedCategory.name,
        selectedMaterialCategoryPath: namedCategory.path,
        selectedMaterial: ""
      });
      return loadDashboard(force, namedCategory.path);
    }
  }
  productsRendered = false;
  logsRendered = false;
  materialRenderLimit = 12;
  productRenderLimit = 8;
  renderStats();
  applyPaneWidths(getSavedState());
  renderMaterialLibraryFilter();
  renderFilterMatchSwitch();
  renderKeywordFilters();
  renderMaterialSortSwitch();
  renderTemplateQuickSelect();
  renderMaterialQuickSelect();
  renderMaterials();
  await renderProductionWorkbench();
  renderGptProductionTest();
  renderPrompts();
  renderWorkspaceSettings();
  loadCloudBackupStatus();
  if ($("#overviewView")) renderOverview();
  restoreSelection();
}

function pageSettings() {
  return dashboard?.workspaceSettings?.pageSettings || {
    production: {},
    distribution: {},
    backup: {}
  };
}

function effectiveWorkbenchFolderBindings() {
  const materialRoot = dashboard?.workspaceSettings?.materialRoot || "";
  const libraryRoot = dashboard?.workspaceSettings?.workPackage?.libraryPath || "";
  const packedRoot = pageSettings().production?.packedRoot || productionWorkspace?.packedRoot
    || (libraryRoot ? `${libraryRoot}\\抖音小红书` : "");
  const defaults = {
    "material-all": materialRoot,
    "material-conversion": materialRoot ? `${materialRoot}\\精准流量贴` : "",
    "material-traffic": materialRoot ? `${materialRoot}\\泛流量贴` : "",
    "material-unclassified": materialRoot ? `${materialRoot}\\未分类` : "",
    "output-unpacked": libraryRoot,
    "output-packed": packedRoot,
    "output-history": libraryRoot ? `${libraryRoot}\\_portfolio_move_logs` : ""
  };
  return { ...defaults, ...(pageSettings().production?.folderBindings || {}), ...workbenchFolderBindings };
}

function renderPageSettingsValues() {
  const production = pageSettings().production || {};
  const distribution = pageSettings().distribution || {};
  const backup = pageSettings().backup || {};
  const values = {
    productionTemplateRoot: production.templateRoot || "",
    productionPackedRoot: production.packedRoot || productionWorkspace?.packedRoot || "",
    productionBasePromptRules: production.promptRules || "",
    productionReserveThreshold: production.reserveThreshold ?? 10,
    productionReserveCategory: production.reserveCategory || "conversion",
    productionItemsPerCollection: production.itemsPerCollection ?? 9,
    productionScheduleTime: production.scheduleTime || "09:00",
    desktopReserveThreshold: distribution.desktopReserveThreshold ?? 10,
    desktopReserveCategory: distribution.desktopReserveCategory || "conversion",
    phoneReserveThreshold: distribution.phoneReserveThreshold ?? 10,
    autoDistributionCategory: distribution.autoCategory || "conversion",
    autoDistributionCount: distribution.autoSendCount ?? 1,
    cloudBackupFrequency: backup.frequency || "daily",
    cloudBackupIntervalHours: backup.intervalHours ?? 24,
    cloudBackupMonthlyLimitMb: backup.monthlyLargeFileLimitMb ?? 2560,
    cloudBackupSourceRoot: backup.sourceRoot || ""
  };
  Object.entries(values).forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input && document.activeElement !== input) input.value = value;
  });
  const checks = {
    productionAutoProduceEnabled: production.autoProduceEnabled === true,
    productionScheduleEnabled: production.scheduleEnabled === true,
    productionCompressCollections: production.compressCollections === true,
    desktopReserveAlertEnabled: distribution.desktopReserveAlertEnabled !== false,
    detectOnConnection: distribution.detectOnConnection !== false,
    autoDistributionEnabled: distribution.autoDistributionEnabled === true,
    requireSendConfirmation: distribution.requireSendConfirmation === true,
    completionNotificationEnabled: distribution.completionNotificationEnabled !== false,
    cloudBackupScheduleEnabled: backup.scheduleEnabled !== false
  };
  Object.entries(checks).forEach(([id, checked]) => {
    const input = document.getElementById(id);
    if (input && document.activeElement !== input) input.checked = checked;
  });
}

async function saveBackupSettingsFromUi() {
  const payload = {
    backup: {
      scheduleEnabled: $("#cloudBackupScheduleEnabled")?.checked !== false,
      frequency: $("#cloudBackupFrequency")?.value || "daily",
      intervalHours: Number($("#cloudBackupIntervalHours")?.value || 24),
      monthlyLargeFileLimitMb: Number($("#cloudBackupMonthlyLimitMb")?.value || 2560),
      sourceRoot: $("#cloudBackupSourceRoot")?.value || ""
    }
  };
  const result = await api("/api/page-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  dashboard.workspaceSettings.pageSettings = result.settings;
  renderPageSettingsValues();
  toast("备份设置已自动保存");
}

async function exportLocalWorkbenchSettings() {
  const payload = await api("/api/local-backup/export");
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `团建工作台-本地设置-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast("本地设置已导出；不包含 GPT 登录 Cookie");
}

async function importLocalWorkbenchSettings(file) {
  if (!file) return;
  const payload = JSON.parse(await file.text());
  await api("/api/local-backup/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  await loadDashboard(true);
  renderWorkspaceSettings();
  renderPageSettingsValues();
  toast("本地设置已恢复");
}

async function savePageSettingsFromUi(section) {
  const payload = {};
  if (section === "production") {
    payload.production = {
      templateRoot: $("#productionTemplateRoot")?.value || "",
      packedRoot: $("#productionPackedRoot")?.value || "",
      folderBindings: effectiveWorkbenchFolderBindings(),
      promptRules: $("#productionBasePromptRules")?.value || "",
      reserveThreshold: Number($("#productionReserveThreshold")?.value || 10),
      reserveCategory: $("#productionReserveCategory")?.value || "conversion",
      itemsPerCollection: Number($("#productionItemsPerCollection")?.value || 9),
      scheduleTime: $("#productionScheduleTime")?.value || "09:00",
      autoProduceEnabled: $("#productionAutoProduceEnabled")?.checked === true,
      scheduleEnabled: $("#productionScheduleEnabled")?.checked === true,
      compressCollections: $("#productionCompressCollections")?.checked === true
    };
  } else {
    payload.distribution = {
      desktopReserveThreshold: Number($("#desktopReserveThreshold")?.value || 10),
      desktopReserveCategory: $("#desktopReserveCategory")?.value || "conversion",
      desktopReserveAlertEnabled: $("#desktopReserveAlertEnabled")?.checked !== false,
      phoneReserveThreshold: Number($("#phoneReserveThreshold")?.value || 10),
      autoCategory: $("#autoDistributionCategory")?.value || "conversion",
      autoSendCount: Number($("#autoDistributionCount")?.value || 1),
      detectOnConnection: $("#detectOnConnection")?.checked !== false,
      autoDistributionEnabled: $("#autoDistributionEnabled")?.checked === true,
      requireSendConfirmation: $("#requireSendConfirmation")?.checked === true,
      completionNotificationEnabled: $("#completionNotificationEnabled")?.checked !== false
    };
  }
  const result = await api("/api/page-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  dashboard.workspaceSettings.pageSettings = result.settings;
  renderPageSettingsValues();
  renderDistributionReserveAlert();
}

async function openPageSettings(section) {
  activePageSettings = section;
  $("#pageSettingsTitle").textContent = section === "production"
    ? "内容制作设置"
    : section === "gptAuto" ? "自动生产设置" : "内容分发设置";
  $("#productionPageSettings").hidden = section !== "production";
  $("#distributionPageSettings").hidden = section !== "distribution";
  if ($("#gptAutoPageSettings")) $("#gptAutoPageSettings").hidden = section !== "gptAuto";
  // Hide the native GPT view BEFORE revealing the settings backdrop.  The
  // WebContentsView is a native compositor layer that paints above all DOM;
  // if we fire-and-forget the hide, the settings panel briefly appears
  // underneath the still-visible GPT page.
  if ($("#gptProductionTestView")?.classList.contains("active")) {
    await window.gptWorkbench?.hide?.().catch(() => {});
  }
  $("#pageSettingsBackdrop").hidden = false;
  document.body.classList.add("page-settings-open");
  renderPageSettingsValues();
  if (section === "gptAuto") {
    gptSettingsPreviewMode = normalizeGptProductionMode(gptAutoSettings.mode);
    renderGptAutoSettings();
  }
}

function closePageSettings() {
  $("#pageSettingsBackdrop").hidden = true;
  document.body.classList.remove("page-settings-open");
  activePageSettings = "";
  gptSettingsPreviewMode = null;
  if ($("#gptProductionTestView")?.classList.contains("active")) restoreEmbeddedGptView();
}

function reserveCategoryLabel(category) {
  return ({ conversion: "精准流量（业务类）", traffic: "泛流量类", unclassified: "未分类", all: "全部" })[category] || "精准流量（业务类）";
}

function renderDistributionReserveAlert() {
  const alert = $("#distributionReserveAlert");
  if (!alert || !dashboard?.distribution) return;
  const settings = pageSettings().distribution || {};
  const category = settings.desktopReserveCategory || "conversion";
  const reserve = Number(dashboard.distribution.reserve?.[category] || 0);
  const threshold = Number(settings.desktopReserveThreshold || 10);
  const dismissedKey = `tb-reserve-dismissed:${category}:${reserve}:${threshold}`;
  const shouldNotify = settings.desktopReserveAlertEnabled !== false
    && reserve < threshold
    && localStorage.getItem(dismissedKey) !== "1";

  // 隐藏旧的浮动通知条，改用小猫气泡
  alert.hidden = true;

  if (!shouldNotify) return;

  const message = `电脑作品集储备不足：${reserveCategoryLabel(category)}只有 ${reserve} 个，低于安全线 ${threshold} 个，请继续批量制作作品集。`;
  showWorkbenchAssistantBubble(message, { duration: 0, tone: "warning", persistent: true });
}

function closeImageLightbox() {
  document.querySelector(".image-lightbox")?.remove();
  if ($("#gptProductionTestView")?.classList.contains("active") && !document.querySelector(".system-dialog-backdrop") && $("#pageSettingsBackdrop")?.hidden !== false) {
    restoreEmbeddedGptView();
  }
}

function openImageLightbox(imageUrl, caption = "图片预览") {
  closeImageLightbox();
  if ($("#gptProductionTestView")?.classList.contains("active")) window.gptWorkbench?.hide?.().catch(() => {});
  const backdrop = document.createElement("div");
  backdrop.className = "image-lightbox";
  backdrop.innerHTML = `<section class="image-lightbox-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(caption)}">
    <button class="image-lightbox-close" type="button" aria-label="关闭大图">×</button>
    <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(caption)}" />
    <p>${escapeHtml(caption)}</p>
  </section>`;
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop || event.target.closest(".image-lightbox-close")) closeImageLightbox();
  });
  document.body.appendChild(backdrop);
  backdrop.querySelector(".image-lightbox-close")?.focus();
}

function openTextLightbox(content, caption = "TXT 参考内容") {
  closeImageLightbox();
  if ($("#gptProductionTestView")?.classList.contains("active")) window.gptWorkbench?.hide?.().catch(() => {});
  const backdrop = document.createElement("div");
  backdrop.className = "image-lightbox text-lightbox";
  backdrop.innerHTML = `<section class="image-lightbox-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(caption)}">
    <button class="image-lightbox-close" type="button" aria-label="关闭文本预览">×</button>
    <h3>${escapeHtml(caption)}</h3>
    <pre>${escapeHtml(content || "这个 TXT 暂无可预览内容。")}</pre>
  </section>`;
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop || event.target.closest(".image-lightbox-close")) closeImageLightbox();
  });
  document.body.appendChild(backdrop);
  backdrop.querySelector(".image-lightbox-close")?.focus();
}

async function openWorkbenchTextAsset(textPreview) {
  const entry = findMaterialEntry(textPreview.dataset.workbenchText);
  let content = entry?.item?.preview || "";
  const textPath = textPreview.dataset.workbenchTextPath;
  if (textPath) {
    try {
      const response = await fetch(`/file?path=${encodeURIComponent(textPath)}`);
      if (response.ok) content = await response.text();
    } catch {}
  }
  openTextLightbox(content, `${textPreview.dataset.workbenchTextCaption || entry?.item?.name || "帖子"} · TXT参考内容`);
}

function openSystemDialog(options = {}) {
  return new Promise((resolve) => {
    document.querySelector(".system-dialog-backdrop")?.remove();
    const restoreGpt = $("#gptProductionTestView")?.classList.contains("active");
    if (restoreGpt) window.gptWorkbench?.hide?.().catch(() => {});
    const backdrop = document.createElement("div");
    backdrop.className = "system-dialog-backdrop";
    const details = Array.isArray(options.details) ? options.details : [];
    backdrop.innerHTML = `
      <section class="system-dialog ${options.tone === "danger" ? "is-danger" : ""}" role="dialog" aria-modal="true" aria-labelledby="systemDialogTitle">
        <header>
          <div>
            ${options.eyebrow ? `<span class="system-dialog-eyebrow">${escapeHtml(options.eyebrow)}</span>` : ""}
            <h2 id="systemDialogTitle">${escapeHtml(options.title || "请确认")}</h2>
          </div>
          <button type="button" data-dialog-result="cancel" aria-label="关闭">×</button>
        </header>
        ${options.description ? `<p class="system-dialog-description">${escapeHtml(options.description)}</p>` : ""}
        ${details.length ? `<dl class="system-dialog-details">${details.map((item) => `
          <div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>
        `).join("")}</dl>` : ""}
        ${options.input ? `<label class="system-dialog-input">
          <span>${escapeHtml(options.input.label || "名称")}</span>
          <input type="text" value="${escapeHtml(options.input.value || "")}" maxlength="${Number(options.input.maxLength) || 160}">
        </label>` : ""}
        ${options.warning ? `<div class="system-dialog-warning">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.7 20h18.6L12 3Z"/><path d="M12 9v5M12 17.3v.2"/></svg>
          <span>${escapeHtml(options.warning)}</span>
        </div>` : ""}
        <footer>
          ${options.cancelLabel === null ? "" : `<button type="button" class="dialog-secondary" data-dialog-result="cancel">${escapeHtml(options.cancelLabel || "返回")}</button>`}
          <button type="button" class="dialog-primary primary-button" data-dialog-result="confirm">${escapeHtml(options.confirmLabel || "确认")}</button>
        </footer>
      </section>`;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeydown);
      backdrop.remove();
      if (restoreGpt && $("#pageSettingsBackdrop")?.hidden !== false && !document.querySelector(".image-lightbox")) {
        restoreEmbeddedGptView();
      }
      resolve(result);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") finish(false);
    };
    backdrop.addEventListener("click", (event) => {
      const result = event.target.closest("[data-dialog-result]")?.dataset.dialogResult;
      if (result === "confirm") {
        finish(options.input ? backdrop.querySelector(".system-dialog-input input")?.value.trim() : true);
      } else if (result) finish(false);
      else if (event.target === backdrop) finish(false);
    });
    backdrop.querySelector(".system-dialog-input input")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(event.currentTarget.value.trim());
      }
    });
    document.addEventListener("keydown", onKeydown);
    document.body.appendChild(backdrop);
    const initialFocus = backdrop.querySelector(".system-dialog-input input")
      || backdrop.querySelector(".dialog-primary");
    initialFocus?.focus();
    initialFocus?.select?.();
  });
}

function showSystemNotice(title, description, options = {}) {
  return openSystemDialog({
    eyebrow: options.eyebrow || "系统提示",
    title,
    description,
    details: options.details,
    warning: options.warning,
    tone: options.tone,
    cancelLabel: null,
    confirmLabel: options.confirmLabel || "知道了"
  });
}

function renderWorkspaceSettings() {
  const settings = dashboard?.workspaceSettings;
  if (!settings) return;
  if ($("#materialRootInput")) $("#materialRootInput").value = settings.materialRoot || "";
  if ($("#settingsMaterialRoot")) $("#settingsMaterialRoot").value = settings.materialRoot || "";
  if ($("#settingsPortfolioRoot")) $("#settingsPortfolioRoot").value = settings.workPackage?.libraryPath || "";
  if ($("#collectionRootInput")) $("#collectionRootInput").value = settings.workPackage?.libraryPath || "";
  if ($("#distributionCollectionRootInput")) $("#distributionCollectionRootInput").value = settings.workPackage?.libraryPath || "";
  if ($("#settingsBatchSize")) $("#settingsBatchSize").value = settings.workPackage?.batchSize || 14;
  if ($("#settingsAutoGroup")) $("#settingsAutoGroup").checked = settings.workPackage?.autoGroup !== false;
  if ($("#settingsAutoZip")) $("#settingsAutoZip").checked = settings.workPackage?.autoZip !== false;
  if ($("#productionApiProvider")) $("#productionApiProvider").value = settings.imageApi?.provider || "local-openai";
  if ($("#productionApiBaseUrl")) $("#productionApiBaseUrl").value = settings.imageApi?.baseUrl || "http://localhost:62104/v1";
  if ($("#productionApiModel")) $("#productionApiModel").value = settings.imageApi?.model || "gpt-image-2";
  if ($("#workbenchImageProvider")) {
    $("#workbenchImageProvider").value = localStorage.getItem("tb-workbench-image-provider")
      || settings.imageApi?.provider
      || "local-openai";
    syncCustomSelect($("#workbenchImageProvider"));
  }
  if ($("#productionTextProvider")) $("#productionTextProvider").value = settings.textApi?.provider || "minimax";
  if ($("#productionTextBaseUrl")) $("#productionTextBaseUrl").value = settings.textApi?.baseUrl || "https://api.minimaxi.com/v1";
  if ($("#productionTextModel")) {
    const textModel = settings.textApi?.model || "MiniMax-M2.7";
    if (![...$("#productionTextModel").options].some((option) => option.value === textModel)) {
      $("#productionTextModel").appendChild(new Option(textModel, textModel));
    }
    $("#productionTextModel").value = textModel;
  }
  ["#productionApiProvider", "#productionTextProvider", "#productionTextModel"]
    .forEach((selector) => syncCustomSelect($(selector)));
  const imageApiReady = Boolean(settings.imageApi?.baseUrl && settings.imageApi?.model && settings.imageApi?.credentialConfigured);
  const textApiReady = Boolean(settings.textApi?.baseUrl && settings.textApi?.model && settings.textApi?.credentialConfigured);
  if ($("#settingsImageApiStatus")) $("#settingsImageApiStatus").textContent = imageApiReady ? "凭据已连接" : settings.imageApi?.baseUrl ? "等待本机密钥" : "待接入";
  if ($("#imageApiStatus")) $("#imageApiStatus").textContent = imageApiReady && textApiReady
    ? "生图和文案引擎已就绪"
    : imageApiReady
      ? "生图已就绪，文案等待密钥"
      : settings.imageApi?.baseUrl ? "等待本机密钥" : "生产引擎待连接";
  const appInfo = dashboard?.appInfo || {};
  if ($("#settingsVersion")) $("#settingsVersion").textContent = `v${appInfo.version || "未知"}`;
  if ($("#settingsVersionChannel")) $("#settingsVersionChannel").textContent = appInfo.channel || "本地便携版";
  if ($("#settingsVersionStatus")) $("#settingsVersionStatus").textContent = appInfo.desktop ? "桌面版运行中" : "浏览器预览中";
  if ($("#settingsDiagnosticsSummary")) {
    $("#settingsDiagnosticsSummary").textContent = `运行数据：${appInfo.runtimeRoot || "未识别"}`;
  }
}

function workbenchStorageKey(kind, templateId = selectedTemplate?.id || "default") {
  return `tb-production-${kind}-${templateId}`;
}

function defaultTemplatePrompt(template) {
  if (!template) return "";
  const isGame = template.type === "game";
  const recipe = template.productionRecipe;
  const masterRule = recipe
    ? `\n当前母版配方：${recipe.name}\n封面骨架：${recipe.cover}\n内页骨架：${recipe.inner}\n标题与配色：${recipe.titleStyle}`
    : "";
  return isGame
    ? `你正在使用「${template.name}」生产团建游戏内容。${masterRule}\n保留母版封面、内页、字体、配色和信息层级；图上必须完整表达游戏名称、适合人数、所需道具、玩法步骤和注意事项。新素材只提供游戏内容，不得覆盖模板视觉。每页文字可以多，但必须分组清楚、手机端可读。输出独立 3:4 图片和一份可直接发布的小红书文案，生成后检查规则是否完整、是否漏项、是否出现事实编造。`
      : `你正在使用「${template.name}」生产精准流量（业务类）内容。${masterRule}\n永久锁定母版的封面结构、内页结构、字体气质、配色、标题位置和拼图比例；新素材只提供地点、项目、路线和文案事实。图上文字少而准，优先地点词、项目词和路线词；不得虚构价格、场地、车程或项目。所有页面输出为独立 3:4 图片，人物与道具按规则去重，保留真实场景，避免广告感和 AI 味。每套作品同时生成小红书文案、出图计划和生产记录。`;
}

function readTemplateConversation(templateId = selectedTemplate?.id || "default") {
  try {
    return JSON.parse(localStorage.getItem(workbenchStorageKey("conversation", templateId)) || "[]");
  } catch {
    return [];
  }
}

function writeTemplateConversation(messages, templateId = selectedTemplate?.id || "default") {
  localStorage.setItem(workbenchStorageKey("conversation", templateId), JSON.stringify(messages.slice(-80)));
}

function currentWorkbenchMaterials() {
  const query = ($("#workbenchMaterialSearch")?.value || "").trim().toLowerCase();
  const categories = dashboard?.materials?.categories || [];
  const visibleCategories = categories.filter((category) => !isHiddenMaterialPath(category.path));
  const activeCategory = visibleCategories.find((category) => category.path === workbenchActiveMaterialCategoryPath)
    || visibleCategories.find((category) => category.loaded !== false);
  return (activeCategory?.items || [])
    .map((item) => ({ item, category: activeCategory }))
    .filter(({ item }) => {
      const text = `${item.name} ${item.preview || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
      const mainTag = item.mainTag || item.metadata?.mainTag || "";
      if (query && !text.includes(query)) return false;
      if (workbenchMaterialFilter === "conversion" && mainTag !== "团建转化") return false;
      if (workbenchMaterialFilter === "traffic" && !["团建游戏", "合集攻略"].includes(mainTag)) return false;
      if (workbenchMaterialFilter === "unclassified" && ["团建转化", "团建游戏", "合集攻略"].includes(mainTag)) return false;
      return true;
    })
    .slice(0, 120);
}

function templateTypeOf(template) {
  return template?.type || (/游戏|破冰|真心话|大冒险/.test(`${template?.name || ""} ${template?.usage || ""}`) ? "game" : "conversion");
}

function renderWorkbenchMaterials() {
  const folders = $("#workbenchMaterialFolders");
  if (!folders) return;
  const categories = dashboard?.materials?.categories || [];
  const visibleCategories = categories.filter((category) => !isHiddenMaterialPath(category.path));
  if (!visibleCategories.some((category) => category.path === workbenchActiveMaterialCategoryPath)) {
    const savedPath = getSavedState().selectedMaterialCategoryPath || "";
    const selectedPath = selectedMaterialCategory?.path || "";
    workbenchActiveMaterialCategoryPath = visibleCategories.find((category) => category.path === savedPath)?.path
      || visibleCategories.find((category) => category.path === selectedPath)?.path
      || visibleCategories.find((category) => category.loaded !== false)?.path
      || "";
  }
  const entries = currentWorkbenchMaterials();
  const postFolders = entries.length ? entries.map(({ item }) => {
    const selected = workbenchSelectedMaterials.has(item.path);
    const expanded = workbenchExpandedMaterialPath === item.path;
    const images = expanded ? (item.images || []).map((image) =>
      `<button class="asset-thumb-button workbench-material-image" type="button" data-image-preview="${escapeHtml(image.url)}" data-image-caption="${escapeHtml(item.name)}"><img src="${escapeHtml(image.url)}" alt="帖子图片预览" loading="lazy" /></button>`
    ).join("") : "";
    const textAttachments = (item.attachments || []).filter((file) => /\.(txt|md)$/i.test(file));
    const texts = expanded ? textAttachments.map((file) => {
      const name = String(file).split(/[\\/]/).pop() || "参考文案.txt";
      return `<button class="workbench-text-asset" type="button" data-workbench-text="${escapeHtml(item.id)}" data-workbench-text-path="${escapeHtml(file)}" data-workbench-text-caption="${escapeHtml(item.name)}"><b>TXT</b><span>${escapeHtml(name)}</span><small>${escapeHtml(shortText(item.preview || "点击查看参考内容", 54))}</small></button>`;
    }).join("") : "";
    return `<section class="workbench-post-branch${expanded ? " active" : ""}">
      <div class="workbench-post-row${selected ? " selected" : ""}">
        <input class="material-check" type="checkbox" data-workbench-material-check="${escapeHtml(item.id)}" aria-label="选择帖子文件夹" ${selected ? "checked" : ""} />
        <button class="workbench-post-folder" type="button" data-workbench-post-folder="${escapeHtml(item.id)}" title="${escapeHtml(item.name)}">
          <span class="folder-glyph" aria-hidden="true">▸</span><span><strong>${escapeHtml(item.name)}</strong><small>${item.imageCount || 0} 张图 · ${item.textCount || 0} 个文本</small></span>
        </button>
      </div>
      ${expanded ? `<div class="workbench-post-assets">${images}${texts || (item.textCount ? `<button class="workbench-text-asset" type="button" data-workbench-text="${escapeHtml(item.id)}"><b>TXT</b><span>参考内容</span><small>${escapeHtml(shortText(item.preview || "点击查看参考内容", 54))}</small></button>` : "")}</div>` : ""}
    </section>`;
  }).join("") : `<div class="empty-state"><strong>这个分类下没有帖子文件夹</strong></div>`;
  folders.innerHTML = visibleCategories.length ? visibleCategories.map((category) => {
    const expanded = category.path === workbenchExpandedMaterialCategoryPath;
    const selectedCategory = category.path === workbenchActiveMaterialCategoryPath;
    return `<section class="workbench-folder-branch${expanded ? " active" : ""}">
      <button class="workbench-folder-item${selectedCategory ? " selected" : ""}${expanded ? " active" : ""}" type="button" data-workbench-material-folder="${escapeHtml(category.path)}">
        <span class="folder-glyph" aria-hidden="true">▸</span><span><strong>${escapeHtml(category.name)}</strong><small>${escapeHtml(window.MaterialWorkspace.categoryCountLabel(category))}</small></span>
      </button>
      ${expanded ? `<div class="workbench-post-list" id="workbenchMaterialList">${postFolders}</div>` : ""}
    </section>`;
  }).join("") : `<div class="empty-state"><strong>没有素材目录</strong></div>`;
  folders.onclick = async (event) => {
    const imageButton = event.target.closest("[data-image-preview]");
    if (imageButton) {
      event.preventDefault();
      event.stopPropagation();
      openImageLightbox(imageButton.dataset.imagePreview, imageButton.dataset.imageCaption || "图片预览");
      return;
    }
    const textButton = event.target.closest("[data-workbench-text]");
    if (textButton) {
      event.preventDefault();
      event.stopPropagation();
      await openWorkbenchTextAsset(textButton);
    }
  };
  window.requestAnimationFrame(() => {
    const activeBranch = folders.querySelector(".workbench-post-branch.active") || folders.querySelector(".workbench-folder-branch.active");
    if (activeBranch && (activeBranch.offsetTop < folders.scrollTop || activeBranch.offsetTop + activeBranch.offsetHeight > folders.scrollTop + folders.clientHeight)) {
      folders.scrollTop = Math.max(0, activeBranch.offsetTop - folders.offsetTop - 4);
    }
  });
  $("#workbenchMaterialCount").textContent = `${workbenchSelectedMaterials.size} 个已选`;
  renderProductionMode();
}

function renderWorkbenchTemplates() {
  const list = $("#workbenchTemplateList");
  if (!list) return;
  const templates = (dashboard?.templates?.templates || []).filter((item) => templateTypeOf(item) === workbenchTemplateType);
  if (selectedTemplate && templateTypeOf(selectedTemplate) !== workbenchTemplateType) {
    selectedTemplate = templates[0] || null;
  }
  list.innerHTML = templates.length ? templates.map((template) => {
    const active = selectedTemplate?.id === template.id;
    const previews = active ? (template.images || []).map((image, index) =>
      `<button class="template-image-thumb" type="button" data-image-preview="${escapeHtml(image.url)}" data-image-caption="${escapeHtml(`${template.name} · ${index ? `内页 ${index}` : "封面"}`)}"><img src="${escapeHtml(image.url)}" alt="模板图预览" loading="lazy" /></button>`
    ).join("") : "";
    return `<section class="workbench-folder-branch${active ? " active" : ""}">
      <article class="workbench-template-item${active ? " active" : ""}" data-workbench-template="${escapeHtml(template.id)}">
        <span class="folder-glyph" aria-hidden="true">▸</span><span><strong>${escapeHtml(template.id)} · ${escapeHtml(template.name)}</strong><small>${template.imageCount || 0} 张母版图</small></span>
      </article>
      ${active ? `<div class="workbench-template-images workbench-inline-previews" id="workbenchTemplateImages">${previews || `<div class="empty-state"><strong>没有模板图</strong></div>`}</div>` : ""}
    </section>`;
  }).join("") : `<div class="empty-state"><strong>这类模板还没有登记</strong><p>可继续从本地模板资产加入。</p></div>`;
  $("#workbenchTemplateTypeLabel").textContent = workbenchTemplateType === "game" ? "游戏模板" : "转化模板";
  if (selectedTemplate) renderWorkbenchTemplateDetail();
}

function renderWorkbenchTemplateDetail() {
  if (!selectedTemplate) return;
  $("#workbenchDialogTitle").textContent = `${selectedTemplate.id} · ${selectedTemplate.name}`;
  $("#workbenchDialogMeta").textContent = `${templateTypeOf(selectedTemplate) === "game" ? "游戏模板" : "转化模板"} · 规则与本次要求`;
  const savedPrompt = localStorage.getItem(workbenchStorageKey("prompt"));
  $("#workbenchPromptEditor").value = savedPrompt || defaultTemplatePrompt(selectedTemplate);
  $("#workbenchPromptVersion").textContent = savedPrompt ? "已保存的模板规则" : "模板默认规则";
  renderWorkbenchConversation();
}

function renderWorkbenchConversation() {
  const container = $("#workbenchConversation");
  if (!container) return;
  const messages = readTemplateConversation();
  if (!messages.length) {
    container.innerHTML = `<div class="conversation-message">已经加载「${escapeHtml(selectedTemplate?.name || "当前模板")}」的生产规则。你可以直接补充本批要求，然后开始生产。<time>系统</time></div>`;
    return;
  }
  container.innerHTML = messages.map((message) => `<div class="conversation-message ${message.role === "user" ? "user" : ""}">${escapeHtml(message.text)}<time>${escapeHtml(message.time || "")}</time></div>`).join("");
  container.scrollTop = container.scrollHeight;
}

async function loadProductionWorkspace() {
  const result = await api("/api/production/workspace");
  productionWorkspace = result.workspace;
  if ($("#productionPackedRoot") && !pageSettings().production?.packedRoot) {
    $("#productionPackedRoot").value = productionWorkspace?.packedRoot || "";
  }
  renderWorkbenchProducts();
}

const WORKBENCH_PROVIDER_DEFAULTS = {
  "local-openai": { baseUrl: "http://localhost:62104/v1", imageModel: "gpt-image-2", label: "本地 GPT 生图" },
  bytecat: { baseUrl: "https://bytecat.lamclod.cn/v1", imageModel: "gpt-image-2", label: "ByteCat" },
  minimax: { baseUrl: "https://api.minimaxi.com/v1", imageModel: "image-01", label: "MiniMax" }
};

const WORKBENCH_TEXT_PROVIDER_DEFAULTS = {
  "local-openai": { baseUrl: "http://localhost:62104/v1", textModel: "gpt-5.6-terra", label: "本地 OpenAI 兼容" },
  bytecat: { baseUrl: "https://bytecat.lamclod.cn/v1", textModel: "gpt-5.6-terra", label: "ByteCat 文案" },
  minimax: { baseUrl: "https://api.minimaxi.com/v1", textModel: "MiniMax-M2.7", label: "MiniMax 文案" }
};

function currentWorkbenchProvider() {
  return $("#workbenchImageProvider")?.value
    || localStorage.getItem("tb-workbench-image-provider")
    || dashboard?.workspaceSettings?.imageApi?.provider
    || "local-openai";
}

function currentWorkbenchTextProvider() {
  return $("#productionTextProvider")?.value
    || dashboard?.workspaceSettings?.textApi?.provider
    || "minimax";
}

function renderWorkbenchModelOptions(imageModels = [], textModels = []) {
  const provider = currentWorkbenchProvider();
  const providerDefaults = WORKBENCH_PROVIDER_DEFAULTS[provider] || WORKBENCH_PROVIDER_DEFAULTS["local-openai"];
  const providerSelect = $("#workbenchImageProvider");
  if (providerSelect) providerSelect.value = provider;
  const imageSelect = $("#workbenchImageModel");
  if (imageSelect) {
    const configured = dashboard?.workspaceSettings?.imageApi?.provider === provider
      ? dashboard.workspaceSettings.imageApi.model
      : providerDefaults.imageModel;
    const remembered = localStorage.getItem(`tb-workbench-image-model-${provider}`) || configured;
    const likely = imageModels.filter((model) => /image|imagen|dall|flux|recraft|seedream/i.test(String(model)));
    const options = [...new Set([remembered, configured, providerDefaults.imageModel, ...likely].filter(Boolean))];
    imageSelect.innerHTML = options.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("");
    imageSelect.value = options.includes(remembered) ? remembered : options[0];
    if ($("#productionApiModel")) $("#productionApiModel").value = imageSelect.value;
    syncCustomSelect(imageSelect);
  }
  const textSelect = $("#workbenchTextModel");
  if (textSelect) {
    const textProvider = currentWorkbenchTextProvider();
    const textDefaults = WORKBENCH_TEXT_PROVIDER_DEFAULTS[textProvider] || WORKBENCH_TEXT_PROVIDER_DEFAULTS.minimax;
    const configuredText = dashboard?.workspaceSettings?.textApi?.provider === textProvider
      ? dashboard.workspaceSettings.textApi.model
      : textDefaults.textModel;
    const rememberedText = localStorage.getItem(`tb-workbench-text-model-${textProvider}`) || configuredText;
    const likelyText = textModels.filter((model) => !/image|imagen|dall|flux|recraft|seedream|embedding|audio|whisper|tts/i.test(String(model)));
    const options = [...new Set([rememberedText, configuredText, textDefaults.textModel, ...likelyText].filter(Boolean))];
    textSelect.innerHTML = options.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("");
    textSelect.value = options.includes(rememberedText) ? rememberedText : options[0];
    if ($("#productionTextModel")) {
      if (![...$("#productionTextModel").options].some((option) => option.value === textSelect.value)) {
        $("#productionTextModel").appendChild(new Option(textSelect.value, textSelect.value));
      }
      $("#productionTextModel").value = textSelect.value;
    }
    syncCustomSelect(textSelect);
    syncCustomSelect($("#productionTextModel"));
  }
}

async function fetchModelCatalog(payload, route = "/api/image-api/test") {
  return api(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, quiet: true })
  });
}

async function refreshWorkbenchModels(force = false) {
  if (workbenchModelsLoaded && !force) return;
  const status = $("#workbenchModelStatus");
  if (status) status.textContent = "正在分别读取生图与文案模型…";
  const provider = currentWorkbenchProvider();
  const providerDefaults = WORKBENCH_PROVIDER_DEFAULTS[provider] || WORKBENCH_PROVIDER_DEFAULTS["local-openai"];
  const textPayload = currentTextApiPayload({ workbench: true });
  const textDefaults = WORKBENCH_TEXT_PROVIDER_DEFAULTS[textPayload.provider] || WORKBENCH_TEXT_PROVIDER_DEFAULTS.minimax;
  renderWorkbenchModelOptions();
  const [imageCatalog, textCatalog] = await Promise.allSettled([
    fetchModelCatalog({ provider, baseUrl: providerDefaults.baseUrl, model: $("#workbenchImageModel")?.value || providerDefaults.imageModel }),
    fetchModelCatalog(textPayload, "/api/text-api/test")
  ]);
  const imageModels = imageCatalog.status === "fulfilled" ? imageCatalog.value.models || [] : [];
  const textModels = textCatalog.status === "fulfilled" ? textCatalog.value.models || [] : [];
  renderWorkbenchModelOptions(imageModels, textModels);
  workbenchModelsLoaded = imageCatalog.status === "fulfilled" || textCatalog.status === "fulfilled";
  if (status) {
    const imageState = imageCatalog.status === "fulfilled"
      ? `生图 ${$("#workbenchImageModel")?.options?.length || 0} 个`
      : `${providerDefaults.label}暂不可读，保留当前模型`;
    const textState = textCatalog.status === "fulfilled"
      ? `文案 ${$("#workbenchTextModel")?.options?.length || 0} 个`
      : `${textDefaults.label}暂不可读，保留当前模型`;
    status.textContent = `${imageState} · ${textState}`;
    status.title = [imageCatalog, textCatalog]
      .filter((item) => item.status === "rejected")
      .map((item) => item.reason?.message || "读取失败")
      .join("；");
  }
  if ($("#workbenchEngineState")) {
    $("#workbenchEngineState").textContent = imageCatalog.status === "fulfilled"
      ? `${providerDefaults.label} · ${$("#workbenchImageModel")?.value || providerDefaults.imageModel} 可用`
      : `${providerDefaults.label}连接失败`;
  }
}

async function saveWorkbenchModels() {
  const provider = currentWorkbenchProvider();
  const providerDefaults = WORKBENCH_PROVIDER_DEFAULTS[provider] || WORKBENCH_PROVIDER_DEFAULTS["local-openai"];
  const model = $("#workbenchImageModel")?.value || providerDefaults.imageModel;
  const textPayload = currentTextApiPayload({ workbench: true });
  const textModel = textPayload.model;
  localStorage.setItem("tb-workbench-image-provider", provider);
  localStorage.setItem(`tb-workbench-image-model-${provider}`, model);
  localStorage.setItem(`tb-workbench-text-model-${textPayload.provider}`, textModel);
  if ($("#productionApiProvider")) $("#productionApiProvider").value = provider;
  if ($("#productionApiBaseUrl")) $("#productionApiBaseUrl").value = providerDefaults.baseUrl;
  if ($("#productionApiModel")) $("#productionApiModel").value = model;
  if ($("#productionTextModel")) $("#productionTextModel").value = textModel;
  const [imageResult, textResult] = await Promise.all([
    api("/api/image-api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, baseUrl: providerDefaults.baseUrl, model })
    }),
    api("/api/text-api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(textPayload)
    })
  ]);
  dashboard.workspaceSettings.imageApi = imageResult.imageApi;
  dashboard.workspaceSettings.textApi = textResult.textApi;
  $("#workbenchEngineState").textContent = `${providerDefaults.label} · ${model} 已配置`;
  $("#workbenchModelStatus").textContent = `图片用 ${model}；文案用 ${textResult.textApi.model}`;
}

function filteredWorkbenchProducts() {
  const source = workbenchOutputFilter === "packed"
    ? (productionWorkspace?.packedWorks || [])
    : (productionWorkspace?.unpackedWorks || productionWorkspace?.works || []);
  return source;
}

function renderWorkbenchProducts() {
  const list = $("#workbenchProductList");
  if (!list) return;
  if (workbenchOutputFilter === "history") {
    const history = productionWorkspace?.history || [];
    list.innerHTML = history.length ? history.map((entry) => `<article class="workbench-pack-history">
      <span class="history-state" aria-hidden="true"></span>
      <span><strong>${escapeHtml(entry.collection || entry.name || "作品集打包")}</strong><small>${escapeHtml(entry.detail || entry.action || "打包完成")}</small><time>${escapeHtml(entry.time ? new Date(entry.time).toLocaleString("zh-CN", { hour12: false }) : "")}</time></span>
    </article>`).join("") : `<div class="empty-state"><strong>还没有打包记录</strong><p>完成作品集打包后，时间和目标目录会记录在这里。</p></div>`;
    $("#workbenchProductCount").textContent = `${history.length} 条记录`;
    $("#workbenchSelectedProductCount").textContent = "历史打包记录";
    $("#workbenchOutputPath").textContent = productionWorkspace?.packedRoot ? `记录来源：${productionWorkspace.packedRoot}` : "正在读取打包记录…";
    if ($("#workbenchPackBtn")) $("#workbenchPackBtn").hidden = true;
    return;
  }
  if ($("#workbenchPackBtn")) $("#workbenchPackBtn").hidden = workbenchOutputFilter !== "unpacked";
  const works = filteredWorkbenchProducts();
  list.innerHTML = works.length ? works.map((work) => {
    const selected = workbenchSelectedProducts.has(work.path);
    const expanded = workbenchExpandedProductPath === work.path;
    const images = expanded ? (work.images || []).map((image) =>
      `<button class="asset-thumb-button workbench-material-image" type="button" data-image-preview="${escapeHtml(image.url)}" data-image-caption="${escapeHtml(work.name)}"><img src="${escapeHtml(image.url)}" alt="成品图片预览" loading="lazy" /></button>`
    ).join("") : "";
    const texts = expanded ? (work.textFiles || []).map((file) =>
      `<button class="workbench-text-asset" type="button" data-workbench-text-path="${escapeHtml(file.path)}" data-workbench-text-caption="${escapeHtml(work.name)}"><b>TXT</b><span>${escapeHtml(file.name)}</span><small>${escapeHtml(shortText(work.preview || "点击查看文案", 54))}</small></button>`
    ).join("") : "";
    return `<section class="workbench-post-branch workbench-output-folder${expanded ? " active" : ""}">
      <div class="workbench-post-row${selected ? " selected" : ""}">
        ${workbenchOutputFilter === "unpacked"
          ? `<input class="product-check" type="checkbox" data-workbench-product-check="${escapeHtml(work.path)}" aria-label="选择成品帖子" ${selected ? "checked" : ""} />`
          : `<span class="output-folder-mark" aria-hidden="true"></span>`}
        <button class="workbench-post-folder" type="button" data-workbench-product-folder="${escapeHtml(work.path)}" title="${escapeHtml(work.name)}">
          <span class="folder-glyph" aria-hidden="true">▸</span>
          <span><strong>${escapeHtml(work.name)}</strong><small>${work.imageCount || 0} 张图 · ${work.textCount || 0} 个文本${work.collectionName ? ` · ${escapeHtml(work.collectionName)}` : ""}</small></span>
        </button>
      </div>
      ${expanded ? `<div class="workbench-post-assets">${images}${texts}</div>` : ""}
    </section>`;
  }).join("") : `<div class="empty-state"><strong>这里暂时没有帖子文件夹</strong><p>本地目录产生新帖子后会自动显示。</p></div>`;
  $("#workbenchProductCount").textContent = `${works.length} 个帖子`;
  $("#workbenchSelectedProductCount").textContent = `已选 ${workbenchSelectedProducts.size} 个`;
  $("#workbenchOutputPath").textContent = workbenchOutputFilter === "packed"
    ? `已打包库：${productionWorkspace?.packedRoot || "未设置"}`
    : `成品库：${productionWorkspace?.libraryRoot || "正在读取…"}`;
}

async function renderProductionWorkbench() {
  if (!$("#workbenchMaterialFolders")) return;
  const settings = dashboard?.workspaceSettings || {};
  $("#workbenchMaterialRoot").value = settings.materialRoot || "";
  if ($("#workbenchProductRoot")) $("#workbenchProductRoot").value = settings.workPackage?.libraryPath || "";
  renderPageSettingsValues();
  $("#workbenchEngineState").textContent = settings.imageApi?.credentialConfigured ? `${settings.imageApi.model} 已配置` : "生图引擎待配置";
  if ($("#workbenchImageProvider")) {
    $("#workbenchImageProvider").value = localStorage.getItem("tb-workbench-image-provider") || settings.imageApi?.provider || "local-openai";
  }
  renderWorkbenchModelOptions();
  if (!workbenchSelectedMaterials.size && selectedMaterial?.path) workbenchSelectedMaterials.add(selectedMaterial.path);
  renderWorkbenchMaterials();
  loadProductionWorkspace().catch((error) => {
    if ($("#workbenchOutputPath")) $("#workbenchOutputPath").textContent = `成品库读取失败：${error.message}`;
  });
  const activeCategory = dashboard?.materials?.categories?.find((category) => category.path === workbenchActiveMaterialCategoryPath);
  if (activeCategory?.loaded === false) {
    if ($("#workbenchProductionStatus")) $("#workbenchProductionStatus").textContent = `正在自动扫描 ${activeCategory.name}…`;
    await loadDashboard(false, activeCategory.path);
    return;
  }
  if (!selectedTemplate) selectedTemplate = dashboard?.templates?.templates?.find((item) => templateTypeOf(item) === workbenchTemplateType) || null;
  renderWorkbenchTemplates();
  refreshWorkbenchModels().catch(() => {});
  restoreLatestProductionTask().catch(() => {});
}

function renderGptTestMaterials() {
  const host = $("#gptTestMaterialFolders");
  if (!host) return;
  const categories = dashboard?.materials?.categories || [];
  const query = String($("#gptTestMaterialSearch")?.value || "").trim().toLowerCase();
  host.innerHTML = categories.length ? categories.map((category) => {
    const expanded = gptTestExpandedCategories.has(category.path);
    const categoryItems = category.items || [];
    const items = categoryItems.filter((item) => !query
      || `${item.name || ""} ${item.preview || ""} ${(item.tags || []).join(" ")}`.toLowerCase().includes(query));
    const selectedCount = categoryItems.filter((item) => gptTestSelectedMaterials.has(item.path)).length;
    const allSelected = Boolean(categoryItems.length && selectedCount === categoryItems.length);
    const partial = selectedCount > 0 && !allSelected;
    const posts = items.map((item) => {
      const selected = gptTestSelectedMaterials.has(item.path);
      const postExpanded = gptTestExpandedMaterials.has(item.path);
      const images = postExpanded ? (item.images || []).map((image) => (
        `<button class="asset-thumb-button workbench-material-image" type="button" data-image-preview="${escapeHtml(image.url)}" data-image-caption="${escapeHtml(item.name)}"><img src="${escapeHtml(image.url)}" alt="素材图片预览" loading="lazy" /></button>`
      )).join("") : "";
      const texts = postExpanded ? (item.attachments || []).filter((filePath) => /\.(?:txt|md)$/i.test(filePath)).map((filePath) => {
        const name = String(filePath).split(/[\\/]/).pop() || "参考内容.txt";
        return `<button class="workbench-text-asset" type="button" data-workbench-text-path="${escapeHtml(filePath)}" data-workbench-text-caption="${escapeHtml(item.name)}"><b>TXT</b><span>${escapeHtml(name)}</span><small>${escapeHtml(shortText(item.preview || "点击查看参考内容", 54))}</small></button>`;
      }).join("") : "";
      return `<section class="workbench-post-branch${postExpanded ? " active" : ""}">
        <div class="workbench-post-row${selected ? " selected" : ""}">
          <input class="material-check" type="checkbox" data-gpt-test-material-check="${escapeHtml(item.id)}" aria-label="选择素材文件夹" ${selected ? "checked" : ""}${gptAutoRunning ? " disabled" : ""} />
          <button class="workbench-post-folder" type="button" draggable="true" data-gpt-material-path="${escapeHtml(item.path)}" data-gpt-test-post-folder="${escapeHtml(item.id)}" title="${escapeHtml(item.name)}">
            <span class="folder-glyph" aria-hidden="true">${postExpanded ? "▾" : "▸"}</span><span><strong>${escapeHtml(item.name)}</strong><small>${item.imageCount || 0} 图 · ${item.textCount || 0} TXT · 使用 ${Number(item.usageCount || 0)} 次</small></span>
          </button>
          <button class="gpt-post-send-button" type="button" data-gpt-upload-post="${escapeHtml(item.id)}" title="只把这个帖子的图片和 TXT 上传到当前 GPT 输入框，不自动发送"${gptAutoRunning ? " disabled" : ""}>上传素材</button>
        </div>
        ${postExpanded ? `<div class="workbench-post-assets">${images}${texts || `<span class="workbench-empty-asset">没有 TXT</span>`}</div>` : ""}
      </section>`;
    }).join("");
    return `<section class="workbench-folder-branch${expanded ? " active" : ""}">
      <div class="workbench-folder-row${allSelected ? " selected" : ""}">
        <input class="material-check folder-check" type="checkbox" data-gpt-test-category-check="${escapeHtml(category.path)}" ${allSelected ? "checked" : ""} data-indeterminate="${partial ? "true" : "false"}" aria-label="选择此文件夹中的全部帖子"${gptAutoRunning ? " disabled" : ""} />
        <button class="workbench-folder-item${expanded ? " active" : ""}" type="button" data-gpt-drop-category="${escapeHtml(category.path)}" data-gpt-test-material-category="${escapeHtml(category.path)}">
          <span class="folder-glyph" aria-hidden="true">${expanded ? "▾" : "▸"}</span><span><strong>${escapeHtml(category.name)}（${category.countKnown === false ? "…" : Number(category.count ?? categoryItems.length)}）</strong></span>
        </button>
      </div>
      ${expanded ? `<div class="workbench-post-list">${category.loaded === false ? `<div class="tree-loading-state">正在读取文件夹…</div>` : (posts || `<div class="empty-state"><strong>没有匹配的帖子文件夹</strong></div>`)}</div>` : ""}
    </section>`;
  }).join("") : `<div class="empty-state"><strong>没有读取到素材目录</strong></div>`;
  host.querySelectorAll("[data-indeterminate='true']").forEach((input) => { input.indeterminate = true; });
  $("#gptTestMaterialCount").textContent = `${gptTestSelectedMaterials.size} 个已选`;
  updateGptTestQueueStatus();
}

function renderGptTestTemplates() {
  const host = $("#gptTestTemplateList");
  if (!host) return;
  const templates = gptTemplateMode === "online" ? gptOnlineTemplates : (dashboard?.templates?.templates || []);
  $("#gptLocalTemplateModeBtn")?.classList.toggle("active", gptTemplateMode === "local");
  $("#gptOnlineTemplateModeBtn")?.classList.toggle("active", gptTemplateMode === "online");
  $("#gptOnlineTemplateForm")?.toggleAttribute("hidden", gptTemplateMode !== "online");
  host.innerHTML = templates.length ? templates.map((template) => {
    const selected = gptTestSelectedTemplates.has(template.id);
    const expanded = gptTestExpandedTemplates.has(template.id);
    const previews = expanded ? (template.images || []).map((image, index) => (
      `<button class="template-image-thumb" type="button" data-image-preview="${escapeHtml(image.url)}" data-image-caption="${escapeHtml(`${template.name} · ${index ? `内页 ${index}` : "封面"}`)}"><img src="${escapeHtml(image.url)}" alt="模板图预览" loading="lazy" /></button>`
    )).join("") : "";
    const texts = expanded ? (template.attachments || []).filter((filePath) => /\.(?:txt|md)$/i.test(filePath)).map((filePath) => (
      `<button class="workbench-text-asset" type="button" data-workbench-text-path="${escapeHtml(filePath)}" data-workbench-text-caption="${escapeHtml(template.name)}"><b>TXT</b><span>模板规则</span><small>点击查看全文</small></button>`
    )).join("") : "";
    const onlineDetail = template.kind === "online" && expanded
      ? `<div class="gpt-online-template-detail"><a href="${escapeHtml(template.url)}" target="_blank" rel="noopener">${escapeHtml(template.url)}</a>${template.accountId ? `<small>绑定：${escapeHtml(template.accountId)}</small>` : ""}<button type="button" data-gpt-online-template-delete="${escapeHtml(template.id)}">删除</button></div>`
      : "";
    return `<section class="workbench-folder-branch${expanded ? " active" : ""}">
      <div class="workbench-folder-row${selected ? " selected" : ""}">
        <input class="material-check folder-check" type="checkbox" data-gpt-test-template-check="${escapeHtml(template.id)}" ${selected ? "checked" : ""} aria-label="选择模板"${gptAutoRunning ? " disabled" : ""} />
        <button class="workbench-folder-item gpt-test-template-row${expanded ? " active" : ""}" type="button" data-gpt-test-template="${escapeHtml(template.id)}">
          <span class="folder-glyph" aria-hidden="true">${expanded ? "▾" : "▸"}</span><span><strong>${escapeHtml(template.name)}${template.kind === "online" ? "" : `（${template.imageCount || 0}）`}</strong></span>
        </button>
        <button class="gpt-post-send-button" type="button" data-gpt-upload-template="${escapeHtml(template.id)}" title="${template.kind === "online" ? "在当前账号窗口打开这个在线模板" : "只把这个模板的图片和规则上传到当前 GPT 输入框，不自动发送"}"${gptAutoRunning ? " disabled" : ""}>上传模板</button>
      </div>
      ${expanded ? `<div class="workbench-template-images workbench-inline-previews">${onlineDetail}${previews}${texts}</div>` : ""}
    </section>`;
  }).join("") : `<div class="empty-state"><strong>${gptTemplateMode === "online" ? "还没有在线模板" : "没有读取到本地模板"}</strong><p>${gptTemplateMode === "online" ? "在上方粘贴名称和 ChatGPT 会话链接即可添加。" : "请检查模板库目录。"}</p></div>`;
  $("#gptTestTemplateName").textContent = gptTestSelectedTemplates.size ? `${gptTestSelectedTemplates.size} 个已选` : (gptTemplateMode === "online" ? "未选时沿用当前窗口" : "未选时沿用当前会话");
  updateGptTestQueueStatus();
}

async function loadGptOnlineTemplates() {
  const result = await api("/api/gpt-online-templates");
  gptOnlineTemplates = Array.isArray(result?.templates) ? result.templates : [];
  gptOnlineTemplatesLoaded = true;
  if ($("#gptOnlineTemplateFile")) $("#gptOnlineTemplateFile").textContent = result?.filePath || "链接模板.txt";
  renderGptTestTemplates();
}

function switchGptTemplateMode(mode) {
  if (gptAutoRunning) {
    showWorkbenchAssistantBubble("当前批次正在执行，模板来源已冻结；完成或暂停后再切换。", { duration: 4200 });
    return;
  }
  const next = mode === "online" ? "online" : "local";
  if (next === gptTemplateMode) return;
  gptTemplateMode = next;
  localStorage.setItem("teambuilding-gpt-template-mode", next);
  gptTestSelectedTemplates.clear();
  renderGptTestTemplates();
  if (next === "online") loadGptOnlineTemplates().catch((error) => showSystemNotice("在线模板读取失败", error.message, { tone: "danger" }));
}

async function saveGptOnlineTemplate() {
  const name = String($("#gptOnlineTemplateName")?.value || "").trim();
  const url = String($("#gptOnlineTemplateUrl")?.value || "").trim();
  const result = await api("/api/gpt-online-templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "upsert", name, url })
  });
  gptOnlineTemplates = Array.isArray(result?.templates) ? result.templates : [];
  if ($("#gptOnlineTemplateName")) $("#gptOnlineTemplateName").value = "";
  if ($("#gptOnlineTemplateUrl")) $("#gptOnlineTemplateUrl").value = "";
  renderGptTestTemplates();
  showWorkbenchAssistantBubble(`在线模板“${name}”已保存到链接模板.txt。`);
}

function selectedGptTestEntries() {
  const loaded = (dashboard?.materials?.categories || []).flatMap((category) => (category.items || []).map((item) => ({ item, category })));
  loaded.forEach((entry) => {
    if (gptTestSelectedMaterials.has(entry.item.path)) gptTestMaterialEntries.set(entry.item.path, entry);
  });
  return [...gptTestSelectedMaterials].map((materialPath) => gptTestMaterialEntries.get(materialPath)).filter(Boolean);
}

function selectedGptTestTemplates() {
  const templates = gptTemplateMode === "online" ? gptOnlineTemplates : (dashboard?.templates?.templates || []);
  return templates.filter((template) => gptTestSelectedTemplates.has(template.id));
}

function normalizeGptAttachmentPath(value = "") {
  return String(value || "").trim().replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}

function attachmentsForSingleMaterial(material = {}) {
  const materialPath = normalizeGptAttachmentPath(material.path);
  if (!materialPath) throw new Error("素材任务缺少帖子文件夹路径，已阻止上传");
  const prefix = `${materialPath}\\`;
  const attachments = [...new Set((material.attachments || []).filter(Boolean))].slice(0, 30);
  const outside = attachments.filter((filePath) => {
    const normalized = normalizeGptAttachmentPath(filePath);
    return normalized !== materialPath && !normalized.startsWith(prefix);
  });
  if (outside.length) {
    throw new Error(`素材“${material.name || "未命名"}”混入了 ${outside.length} 个其他帖子文件，已阻止整批上传`);
  }
  return attachments;
}

function hydrateGptTaskFromMaterialTree(task) {
  if (!task || task.taskType !== "material") return task;
  const currentAttachments = Array.isArray(task.attachments)
    ? task.attachments.filter(Boolean)
    : [];
  if (currentAttachments.length && String(task.materialPath || "").trim()) {
    task.attachments = attachmentsForSingleMaterial({
      path: task.materialPath,
      name: task.name,
      attachments: currentAttachments
    });
    return task;
  }
  const materialPath = String(task.materialPath || "").trim();
  const candidates = [
    ...gptTestMaterialEntries.values(),
    ...(dashboard?.materials?.categories || []).flatMap((category) =>
      (category.items || []).map((item) => ({ item, category })))
  ];
  const match = candidates.find((entry) => String(entry?.item?.path || "") === materialPath)
    || candidates.find((entry) => String(entry?.item?.name || "") === String(task.name || "").split(" × ").pop());
  if (!match?.item) return task;
  task.materialPath ||= match.item.path;
  task.attachments = attachmentsForSingleMaterial(match.item);
  task.expectedImages ||= Number(match.item.imageCount || 0);
  return task;
}

function shouldReattachGptTaskOnResume(task) {
  if (!task || task.taskType !== "material") return false;
  // A task that never reached the bridge must upload again. This marker is
  // persisted with the queue so quota pauses cannot masquerade as web-stage
  // checkpoints after a reload.
  if (task._submittedToGpt === false) return true;
  if (task._submittedToGpt === true) return false;
  const stage = String(task._stage || task.retryFromStage || task._error || "");
  return !stage || /排队|额度|限额|任务暂停|页面就绪|准备|上传|附件/i.test(stage)
    && !/计划|图片|文案|打包|归档/i.test(stage);
}

function isHiddenMaterialPath(materialPath) {
  return String(materialPath || "").split(/[\\/]+/).some((segment) => segment.startsWith("."));
}

function parseGptSchedulePlan(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line, index) => {
      const [timeRaw, countRaw] = line.split(/[，,]/).map((part) => String(part || "").trim());
      const match = /^(\d{1,2}):(\d{2})$/.exec(timeRaw || "");
      if (!match) return null;
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      if (hour > 23 || minute > 59) return null;
      return { id: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}-${index}`, time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, count: Math.max(1, Math.min(30, Number(countRaw || 1))) };
    })
    .filter(Boolean);
}

async function prepareAutoGptQueue(count = gptAutoSettings.accountTaskLimit || 8, label = "全天自动") {
  if (gptAutoRunning) return false;
  // 逐个轻量加载分类素材，避免 loadDashboard 的完整 dashboard 重算开销
  // 每次只扫描一个分类，不会像 loadAll 那样阻塞整个服务器 30 秒
  try {
    const index = await api("/api/materials");
    if (dashboard?.materials) dashboard.materials = index;
    for (const category of dashboard?.materials?.categories || []) {
      if (category.loaded === false && !isHiddenMaterialPath(category.path)) {
        await loadMaterialCategory(category.path);
      }
    }
  } catch (_) {
    await loadDashboard("materials").catch(() => {});
    for (const category of dashboard?.materials?.categories || []) {
      if (category.loaded === false && !isHiddenMaterialPath(category.path)) {
        await loadDashboard(false, category.path).catch(() => {});
      }
    }
  }
  const entries = (dashboard?.materials?.categories || [])
    .filter((category) => !isHiddenMaterialPath(category.path))
    .flatMap((category) => (category.items || [])
      .filter((item) => {
        if (isHiddenMaterialPath(item.path)) return false;
        // A post is a real production unit only when the scanner found both
        // images and a TXT reference. Never enqueue an empty parent folder or
        // an in-progress directory merely because it has a name.
        const imageCount = Number(item.imageCount || 0);
        const textCount = Number(item.textCount || 0);
        const attachments = Array.isArray(item.attachments) ? item.attachments : [];
        const hasImage = imageCount > 0 || attachments.some((entry) => /\.(?:png|jpe?g|webp|gif|bmp)$/i.test(String(entry || "")));
        const hasText = textCount > 0 || attachments.some((entry) => /\.txt$/i.test(String(entry || "")));
        return hasImage && hasText;
      })
      .map((item) => ({ item, category })))
    .sort((left, right) => {
      const usage = gptMaterialUsageCount(left.item, left.category) - gptMaterialUsageCount(right.item, right.category);
      if (usage) return usage;
      const leftTime = Date.parse(left.item.updatedAt || left.item.modifiedAt || "") || 0;
      const rightTime = Date.parse(right.item.updatedAt || right.item.modifiedAt || "") || 0;
      return leftTime - rightTime || String(left.item.name || "").localeCompare(String(right.item.name || ""), "zh-Hans-CN", { numeric: true });
    })
    .slice(0, Math.max(1, Number(count || 1)));
  if (!entries.length) return false;
  gptTestSelectedMaterials.clear();
  gptTestMaterialEntries.clear();
  entries.forEach((entry) => {
    gptTestSelectedMaterials.add(entry.item.path);
    gptTestMaterialEntries.set(entry.item.path, entry);
  });
  gptTestQueue = [];
  gptTestQueueIndex = 0;
  renderGptTestMaterials();
  showWorkbenchAssistantBubble(`${label}已选 ${entries.length} 个素材，按使用次数从低到高排队。`, { duration: 0 });
  return true;
}

async function prepareAllDayGptQueue() {
  if (!isContinuousGptMode() || gptAutoRunning) return false;
  return prepareAutoGptQueue(gptAutoSettings.accountTaskLimit || 8, "全天自动");
}

// 轻量加载单个素材分类，避免 loadDashboard 的完整 dashboard 重算开销
async function loadMaterialCategory(categoryPath) {
  try {
    const library = await api(`/api/materials?library=${encodeURIComponent(categoryPath)}`);
    if (!dashboard?.materials?.categories) {
      dashboard.materials = library;
      return;
    }
    dashboard.materials.categories = dashboard.materials.categories.map((cat) => {
      const fresh = library.categories?.find((c) => c.path === cat.path);
      return fresh && fresh.loaded ? fresh : cat;
    });
  } catch (_) {
    await loadDashboard(false, categoryPath).catch(() => {});
  }
}

function parseGptWorkTime(value, fallback) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || fallback || ""));
  if (!match) return parseGptWorkTime(fallback === value ? "00:00" : fallback, "00:00");
  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const minute = Math.max(0, Math.min(59, Number(match[2])));
  return hour * 60 + minute;
}

function getGptContinuousWorkWindow(now = new Date()) {
  if (gptAutoSettings.continuousWorkHoursEnabled === false) {
    return { allowed: true, nextStartAt: null };
  }
  const startMinutes = parseGptWorkTime(gptAutoSettings.continuousWorkStart, "07:00");
  const endMinutes = parseGptWorkTime(gptAutoSettings.continuousWorkEnd, "02:00");
  if (startMinutes === endMinutes) return { allowed: true, nextStartAt: null };
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const currentMinutes = beijingNow.getUTCHours() * 60 + beijingNow.getUTCMinutes();
  const crossesMidnight = startMinutes > endMinutes;
  const allowed = crossesMidnight
    ? currentMinutes >= startMinutes || currentMinutes < endMinutes
    : currentMinutes >= startMinutes && currentMinutes < endMinutes;
  if (allowed) return { allowed: true, nextStartAt: null };
  const minutesUntilStart = currentMinutes < startMinutes
    ? startMinutes - currentMinutes
    : 24 * 60 - currentMinutes + startMinutes;
  const nextStartAt = new Date(now.getTime()
    - now.getUTCSeconds() * 1000
    - now.getUTCMilliseconds()
    + minutesUntilStart * 60_000);
  return { allowed: false, nextStartAt };
}

function scheduleContinuousGptProduction(delayMs = 2500) {
  if (gptContinuousLaunchTimer) return;
  if (!isContinuousGptProductionArmed() || gptAutoRunning || gptAutoPaused) return;
  if (gptWindowIsUserStopped(activeGptAccountId) || gptWindowIsUserPaused(activeGptAccountId)) return;
  // A persisted pause is an explicit operator boundary.  The scheduler must
  // never reinterpret an unfinished queue as permission to upload the next
  // post, especially after a renderer/Electron restart.
  if (gptQueuePaused) return;
  const integrityBlock = currentGptQueueIntegrityBlock();
  if (integrityBlock) {
    gptQueuePaused = true;
    showWorkbenchAssistantBubble(`全天自动已安全暂停：${integrityBlock.name || "当前帖子"} 的输入框附件需要先清理，不会继续塞入下一帖。`, { duration: 0, tone: "warning" });
    return;
  }

  const workWindow = getGptContinuousWorkWindow();
  if (!workWindow.allowed) {
    const nextStartAt = workWindow.nextStartAt;
    const waitMs = Math.max(1500, Number(nextStartAt?.getTime() || 0) - Date.now() + 1000);
    showWorkbenchAssistantBubble(`当前是休息时段，单账号全自动将在北京时间 ${nextStartAt?.toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })} 继续。`, { duration: 0 });
    gptContinuousLaunchTimer = setTimeout(() => {
      gptContinuousLaunchTimer = null;
      scheduleContinuousGptProduction(1500);
    }, Math.min(waitMs, 2_147_000_000));
    return;
  }

  const candidateAccounts = (isRotatingGptMode()
    ? availableMultiWindowAccounts()
    : gptAccounts.filter((item) => item.id === activeGptAccountId));
  const cycleStates = candidateAccounts.map((account) => ({
    account,
    quotaAccountId: account.quotaGroup || account.id,
    state: readGptCycleState(account.quotaGroup || account.id)
  }));
  const readyAccounts = cycleStates.filter((entry) => Number(entry.state.nextProbeAt || 0) <= Date.now());
  if (!readyAccounts.length && cycleStates.length) {
    cycleStates.forEach((entry) => {
      if (Number(entry.state.nextProbeAt || 0) > Date.now()) {
        scheduleGptQuotaReminder(new Date(Number(entry.state.nextProbeAt)).toISOString(), entry.quotaAccountId);
      }
    });
    return;
  }

  gptContinuousLaunchTimer = setTimeout(async () => {
    gptContinuousLaunchTimer = null;
    if (!isContinuousGptProductionArmed() || gptAutoRunning || gptAutoPaused) return;
    if (gptWindowIsUserStopped(activeGptAccountId) || gptWindowIsUserPaused(activeGptAccountId)) return;
    // The queue index is only a display cursor. A multi-window run advances
    // workers independently, so pending status—not the cursor—decides whether
    // another batch is needed after a restart or quota pause.
    let hasPendingQueue = gptTestQueue.some((task) => !["completed", "skipped"].includes(task._status));
    if (!hasPendingQueue && gptTestSelectedMaterials.size) {
      // A deliberate UI selection is the current batch contract. Endless
      // mode may refill only after that exact snapshot is completed; it must
      // never replace one selected post with an automatic eight-post batch.
      gptTestQueue = buildGptProductionQueue();
      gptTestQueueIndex = 0;
      hasPendingQueue = gptTestQueue.length > 0;
    }
    if (!hasPendingQueue) {
      hasPendingQueue = Boolean(await prepareAllDayGptQueue());
    }
    if (!hasPendingQueue) {
      showWorkbenchAssistantBubble("全天自动仍在运行，但素材库暂时没有可用帖子；10 分钟后再扫描。", { duration: 0 });
      scheduleContinuousGptProduction(10 * 60_000);
      return;
    }
    gptQueuePaused = gptTestQueue.some((task) => !["completed", "skipped"].includes(task._status));
    persistGptQueue();
    showWorkbenchAssistantBubble("全天自动正在继续下一批素材。", { duration: 0 });
    await sendNextGptTestTask({ continuousResume: true, allowedAccountIds: readyAccounts.map((entry) => entry.account.id) });
  }, Math.max(1500, Number(delayMs || 0)));
}

function buildGptTemplateInitTask(template) {
  return {
    requestId: `gpt-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskType: "template-init",
    templateId: template.id,
    name: `初始化母版 · ${template.name}`,
    attachments: [...new Set([...(template.images || []).map((image) => image.path), ...(template.attachments || [])].filter(Boolean))].slice(0, 30),
    prompt: `${defaultTemplatePrompt(template)}\n\n这些附件是本会话唯一母版。请完整读取并锁定母版结构、页面角色、字体、配色、标题、贴纸、拼图节奏和规则。只确认母版环境初始化完成，不要开始制作新作品。`
  };
}

async function uploadSingleItemToCurrentGpt(task, successMessage) {
  if (!window.gptWorkbench?.sendTask) {
    throw new Error("当前不是桌面开发端，无法把本地附件上传到内置 GPT");
  }
  if (gptAutoRunning) {
    throw new Error("自动任务正在执行，不能把手动上传插入当前会话；请先暂停并等待当前阶段结束");
  }
  const account = gptAccounts.find((item) => item.id === activeGptAccountId && !item.hidden) || gptAccounts[0];
  const payload = {
    ...task,
    accountId: account?.id || activeGptAccountId || "account-1",
    quotaAccountId: account?.quotaGroup || account?.id || activeGptAccountId || "account-1",
    autoRun: false,
    forceUpload: true,
    autoOptions: gptAutoSettings
  };
  showWorkbenchAssistantBubble(`正在上传：${task.name}`, { duration: 0 });
  const result = await window.gptWorkbench.sendTask(payload);
  if (!result?.ok) throw new Error(result?.detail || result?.error || "GPT 没有确认附件上传完成");
  showWorkbenchAssistantBubble(successMessage, { duration: 4200 });
  return result;
}

async function uploadMaterialToCurrentGpt(entry) {
  const task = buildGptTestTask(entry);
  task.requestId = `gpt-manual-material-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await uploadSingleItemToCurrentGpt(task, `已把“${entry.item.name}”上传到当前 GPT；尚未自动发送。`);
}

async function uploadTemplateToCurrentGpt(template) {
  if (template.kind === "online") {
    if (!window.gptWorkbench?.navigate) throw new Error("当前不是桌面开发端，无法打开在线模板");
    await window.gptWorkbench.navigate("url", activeGptAccountId, template.url);
    showWorkbenchAssistantBubble(`已在当前账号窗口打开在线模板“${template.name}”。`, { duration: 4200 });
    return;
  }
  const task = buildGptTemplateInitTask(template);
  task.requestId = `gpt-manual-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await uploadSingleItemToCurrentGpt(task, `已把模板“${template.name}”上传到当前 GPT；尚未自动发送。`);
}

function buildGptTestTask(entry, template = null) {
  const attachments = attachmentsForSingleMaterial(entry.item);
  const extra = String($("#gptTestExtraPrompt")?.value || "").trim();
  // A mode configured to reuse the current session deliberately sends only
  // the material attachment.  The explicit “inject” choice carries the
  // current registry rules even when no physical template folder is selected.
  const useCurrentSession = gptAutoSettings.useCurrentSession !== false && !template;
  const extraRules = String(gptAutoSettings?.extraPromptRules || "").trim();
  const baseMaster = currentGptMasterPrompt();
  const masterWithExtra = extraRules ? `${baseMaster}\n\n${extraRules}` : baseMaster;
  // Check if the upload-material workflow step has a custom prompt configured
  const activeProfile = gptModeProfiles[activeGptModeKey()] || gptModeProfiles.manual;
  const uploadStep = (activeProfile.steps || []).find((step) => step.action === "upload-material");
  const uploadPromptText = String(uploadStep?.text || "").trim();
  const prompt = uploadPromptText
    ? [
        uploadPromptText,
        `当前素材文件夹：${entry.item.name}`,
        extra ? `本次补充要求：\n${extra}` : ""
      ].filter(Boolean).join("\n\n")
    : useCurrentSession ? "" : [
        template?.kind === "online"
          ? `继续使用当前链接会话中已经沉淀好的「${template.name}」母版。`
          : template
            ? `继续使用当前会话刚初始化的「${template.name}」母版。`
            : masterWithExtra,
        "本次附件全部是待迁移素材和 TXT 参考内容，不是新模板。",
        `当前素材文件夹：${entry.item.name}`,
        "请读取全部附件，不要省略 TXT。先严格按既定格式输出逐页迁移计划，并在结尾等待我回复 1，暂时不要出图。",
        extra ? `本次补充要求：\n${extra}` : ""
      ].filter(Boolean).join("\n\n");
  return {
    requestId: `gpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskType: "material",
    templateId: template?.id || "",
    templateKind: template?.kind || "local",
    templateUrl: template?.url || "",
    name: `${template?.name || "当前会话母版"} × ${entry.item.name}`,
    materialPath: entry.item.path,
    attachments,
    prompt,
    expectedImages: Number(entry.item.imageCount || 0)
  };
}

function buildGptProductionQueue(entries = selectedGptTestEntries(), templates = selectedGptTestTemplates()) {
  if (!templates.length) return entries.map((entry) => buildGptTestTask(entry));
  return templates.flatMap((template) => {
    if (template.kind === "online") {
      return entries.map((entry, index) => ({
        ...buildGptTestTask(entry, template),
        navigationUrl: index === 0 ? template.url : "",
        preferredAccountId: template.accountId || ""
      }));
    }
    return [
      { ...buildGptTemplateInitTask(template), navigation: "new-chat" },
      ...entries.map((entry) => buildGptTestTask(entry, template))
    ];
  });
}

function gptProductionWorkCount() {
  return gptTestSelectedMaterials.size * Math.max(1, gptTestSelectedTemplates.size);
}

function gptMaterialUsageCount(item = {}, category = {}) {
  const source = `${category?.name || ""} ${category?.path || ""} ${item?.path || ""}`;
  const numeric = source.match(/(?:已使用|已上传|已制作)\s*(\d+)\s*次/i);
  const chinese = source.match(/(?:已使用|已上传|已制作)\s*(一次|两次|二次|三次)/i)?.[1] || "";
  const physicalCount = numeric
    ? Math.max(0, Number(numeric[1]) || 0)
    : ({ "一次": 1, "两次": 2, "二次": 2, "三次": 3 }[chinese] || 0);
  return Math.max(0, Number(item?.usageCount || 0), physicalCount);
}

function updateGptAssistantBubble(message = "") {
  const materials = gptTestSelectedMaterials.size;
  const templates = gptTestSelectedTemplates.size;
  const works = gptProductionWorkCount();
  const account = gptAccounts.find((item) => item.id === String(activeGptAccountId));
  const quota = (gptQuotaSnapshots.get(String(activeGptAccountId)) || gptQuotaSnapshot)?.status;
  const runtime = readGptWindowRuntime(activeGptAccountId);
  const globalMessage = message || (materials || templates
    ? `已选 ${materials} 个素材、${templates} 个模板，预计 ${works} 个作品`
    : "");
  const setNumber = Number(runtime.currentSetNumber || 0);
  const stage = String(runtime.currentStage || "").trim();
  const windowMessage = quota
    ? `${account?.name || "当前账号窗口"}：近${quota.settings?.windowHours || 3}小时上传 ${quota.uploaded || 0} 张、已生图 ${quota.generated || 0} 张`
    : `${account?.name || "当前账号窗口"}：近3小时用量等待同步`;
  // Continuous mode status: show armed state, next probe time and work window
  let continuousStatus = "";
  if (isContinuousGptMode()) {
    const armed = isContinuousGptProductionArmed();
    const workWindow = getGptContinuousWorkWindow();
    const inWindow = workWindow.allowed;
    const workStart = gptAutoSettings.continuousWorkStart || "07:00";
    const workEnd = gptAutoSettings.continuousWorkEnd || "02:00";
    const nextProbe = Number(runtime.nextProbeAt || 0);
    if (runtime.status === "waiting-quota" && nextProbe > 0) {
      const waitMs = Math.max(0, nextProbe - Date.now());
      const waitMin = Math.ceil(waitMs / 60_000);
      const waitText = waitMin >= 60 ? `${Math.floor(waitMin / 60)}小时${waitMin % 60 || ""}分钟` : `${waitMin}分钟`;
      continuousStatus = ` · 等待额度恢复（约${waitText}后自动探测）`;
    } else if (!inWindow) {
      continuousStatus = ` · 工作时段外（${workStart}-${workEnd}自动开始）`;
    } else if (armed && runtime.status === "idle") {
      continuousStatus = " · 单账号全自动已就绪，等待启动";
    } else if (armed) {
      continuousStatus = " · 单账号全自动运行中";
    } else {
      continuousStatus = " · 单账号全自动未启动";
    }
  }
  const taskMessage = setNumber > 0
    ? ` · 当前第 ${setNumber} 套${stage ? ` · ${stage}` : ""}${/等待.*图|生图/i.test(stage) && runtime.expectedImages
      ? ` · 正在等待第 ${Math.min(runtime.expectedImages, Number(runtime.generatedImages || 0) + 1)} 张/${runtime.expectedImages} 张`
      : runtime.generatedImages ? ` · 本套已生成 ${runtime.generatedImages} 张` : ""}${continuousStatus}`
    : continuousStatus;
  // Do not keep the old "预计上传 N 张" estimate in the persistent cat
  // message.  It describes a selection, not the account's actual usage.
  const combinedMessage = [globalMessage, windowMessage + taskMessage].filter(Boolean).join(" · ");
  if (combinedMessage !== lastAssistantBubbleMessage) {
    lastAssistantBubbleMessage = combinedMessage;
    showWorkbenchAssistantBubble(combinedMessage, message ? { persistent: true } : { transient: true, duration: 3600 });
  }
}

async function refreshGptQuota(accountId = activeGptAccountId, options = {}) {
  const key = String(accountId || activeGptAccountId);
  const syncBrowser = options.syncBrowser !== false;
  const quotaKey = String(gptAccounts.find((item) => item.id === key)?.quotaGroup || key);
  // Switches must paint the selected account's snapshot immediately.  Never
  // leave the previous account's quota object as a fallback while the local
  // endpoint is being refreshed; that is what made a newly selected window
  // appear to have blank/zero usage.
  if (key === String(activeGptAccountId)) {
    gptQuotaSnapshot = gptQuotaSnapshots.get(key) || null;
  }
  try {
    const result = await api(`/api/gpt-production/quota?account=${encodeURIComponent(quotaKey)}`);
    const snapshot = { status: result?.quota || result, accountId: key };
    gptQuotaSnapshots.set(key, snapshot);
    if (key === String(activeGptAccountId)) gptQuotaSnapshot = snapshot;
  } catch {
    if (key === String(activeGptAccountId)) gptQuotaSnapshot = null;
  }
  if (key === String(activeGptAccountId) && syncBrowser && window.gptWorkbench?.available) {
    const browserState = await window.gptWorkbench.status(key).catch(() => null);
    if (browserState) {
      syncGptBrowserAddress(browserState.url);
      $("#gptBrowserBackBtn")?.toggleAttribute("disabled", !browserState.canGoBack);
      $("#gptBrowserForwardBtn")?.toggleAttribute("disabled", !browserState.canGoForward);
    }
  }
  if (key === String(activeGptAccountId)) updateGptAssistantBubble();
}

// Extension quota events are written after the real attachment preview or
// generated-image detection.  Polling the local ledger keeps the visible cat
// in sync even when the embedded page is busy generating and cannot deliver a
// renderer callback.  This is deliberately lightweight and account-scoped.
function startGptQuotaUsageRefresh() {
  if (window.__tbGptQuotaRefreshTimer) return;
  window.__tbGptQuotaRefreshTimer = window.setInterval(() => {
    if (!activeGptAccountId || document.hidden) return;
    refreshGptQuota(activeGptAccountId, { syncBrowser: false }).catch(() => {});
  }, 4_000);
}

async function ensureGptTaskQuota(task, quotaAccountId = activeGptAccountId, options = {}) {
  if (gptAutoSettings.quotaReminderEnabled === false || task.taskType !== "material") return;
  const result = await api(`/api/gpt-production/quota?account=${encodeURIComponent(quotaAccountId)}`).catch(() => null);
  const quota = result?.quota || result;
  if (!quota) return;
  const requiredUploads = (task.attachments || []).length;
  const generatedImages = Math.max(1, Number(task.expectedImages || 1));
  const boundary = TBGptAccountRotation.taskQuotaBoundary({
    requiredUploads,
    requiredGenerations: generatedImages,
    remainingUploads: quota.remainingUploads,
    remainingGenerations: quota.remainingGenerations
  });
  if (!boundary.reached) return;
  const cycle = readGptCycleState(quotaAccountId);
  const quotaExpiry = Date.parse(String(quota.nextExpiryAt || ""));
  const nextProbeAt = Number(cycle.nextProbeAt || 0)
    || (Number.isFinite(quotaExpiry) ? quotaExpiry : 0)
    || Date.now() + Math.max(1, Number(quota.settings?.windowHours || gptAutoSettings.windowHours || 3)) * 60 * 60 * 1000;
  const kindLabel = boundary.kind === "upload" ? "上传附件" : "生成图片";
  const boundaryMessage = `${kindLabel}额度安全线已到：本套需要 ${boundary.required}，当前滚动窗口仅剩 ${boundary.remaining}；` +
    "当前作品尚未启动，已在作品边界等待额度恢复";
  const boundaryState = {
    ...cycle,
    accountId: String(quotaAccountId),
    ...(boundary.kind === "upload" ? { nextUploadProbeAt: nextProbeAt } : { nextGenerationProbeAt: nextProbeAt }),
    nextProbeAt,
    lastAt: Date.now(),
    message: boundaryMessage
  };
  localStorage.setItem(gptCycleStateKey(quotaAccountId), JSON.stringify(boundaryState));
  writeGptWindowRuntime(quotaAccountId, {
    status: "waiting-quota",
    currentStage: "等待额度恢复",
    currentPercent: 0,
    expectedAttachments: requiredUploads,
    expectedImages: generatedImages,
    uploadedAttachments: 0,
    nextProbeAt
  });
  scheduleGptQuotaReminder(new Date(nextProbeAt).toISOString(), quotaAccountId);
  const error = new Error(
    boundaryMessage
  );
  error.code = "LOCAL_QUOTA_BOUNDARY";
  error.gptLimit = true;
  error.quotaKind = boundary.kind;
  error.nextProbeAt = nextProbeAt || null;
  throw error;
}

function isActualGptLimitMessage(message = "") {
  return /(达到|已达|超出|没有更多|用完|不足|上限|上传未完整|附件尚未全部就绪|稍后再试|请在.*后|try again later|rate limit|upload limit|generation limit|too many requests)/i.test(String(message || ""))
    && /(额度|限制|上传|生成|图片|请求|limit|quota|rate)/i.test(String(message || ""));
}

function isGptRetryLimitSignal(message = "", task = {}) {
  const text = String(message || "");
  if (!/(出了点问题|请重试|something went wrong|try again)/i.test(text)) return false;
  if (/(网络|断网|连接失败|超时|timeout|network|offline|验证码|验证|登录)/i.test(text)) return false;
  const context = `${task?._stage || ""} ${task?.stage || ""} ${text}`;
  return task?.taskType === "material" || /(等待计划|等待图片|生成图片|生图|出图|图片|等待文案|生成)/i.test(context);
}

// A low image count is the first reliable local symptom we have seen when the
// web model has crossed into a degraded/limited generation state. Treat it as
// a real generation-limit signal for the current batch: do not feed the next
// material into the same account until the next probe window.
function isLowOutputGptLimitMessage(message = "") {
  return /(生成结果不足|本轮只检测到|安全线为|额度触顶|生成不完整)/i.test(String(message || ""));
}

function inferGptQuotaLimitKind(task, message = "") {
  const context = `${task?._stage || ""} ${message || ""}`;
  if (/(上传|附件|文件|upload)/i.test(context)) return "upload";
  if (/(生成|生图|图片|generation|image)/i.test(context)) return "generation";
  return "unknown";
}

function gptCycleStateKey(accountId = activeGptAccountId) {
  return `teambuilding-gpt-web-limit-v1:${String(accountId || "account-1")}`;
}

function readGptCycleState(accountId = activeGptAccountId) {
  try { return JSON.parse(localStorage.getItem(gptCycleStateKey(accountId)) || "null") || {}; } catch { return {}; }
}

function recordGptQuotaConsumption(task, accountId = activeGptAccountId, kind = "upload") {
  if (!task || task.taskType !== "material") return;
  const now = Date.now();
  const state = readGptCycleState(accountId);
  const windowMs = Math.max(1, Number(gptAutoSettings.windowHours || 3)) * 60 * 60 * 1000;
  const knownStarts = [state.uploadCycleStartAt, state.generationCycleStartAt]
    .map((value) => Number(value || 0)).filter(Boolean);
  // A rolling window starts a new local production round once both previous
  // anchors have expired.  Without this reset, the cat would keep saying
  // "第 19 套" forever even after the account had fully cooled down.
  if (knownStarts.length && Math.max(...knownStarts) + windowMs <= now) {
    delete state.uploadCycleStartAt;
    delete state.generationCycleStartAt;
    delete state.nextUploadProbeAt;
    delete state.nextGenerationProbeAt;
    delete state.nextProbeAt;
  }
  if (kind === "generation") state.generationCycleStartAt ||= now;
  else if ((task.attachments || []).some((filePath) => /\.(?:png|jpe?g|webp|gif|bmp)$/i.test(filePath))) {
    state.uploadCycleStartAt ||= now;
  }
  state.accountId = String(accountId || activeGptAccountId);
  state.updatedAt = now;
  try { localStorage.setItem(gptCycleStateKey(accountId), JSON.stringify(state)); } catch { /* private mode */ }
  return state;
}

function recordActualGptLimit(message, accountId = activeGptAccountId, kind = "unknown") {
  const now = Date.now();
  const key = gptCycleStateKey(accountId);
  const previous = readGptCycleState(accountId);
  const uploadCycleStartAt = Number(previous.uploadCycleStartAt || (kind === "upload" ? now : 0)) || null;
  const generationCycleStartAt = Number(previous.generationCycleStartAt || (kind === "generation" ? now : 0)) || null;
  const windowMs = Math.max(1, Number(gptAutoSettings.windowHours || 3)) * 60 * 60 * 1000;
  const isRetryAfterProbe = Number(previous.probeAttempts || 0) > 0 && Number(previous.probeStartedAt || 0) > 0;
  const retryDelayMs = (10 + Math.floor(Math.random() * 11)) * 60 * 1000;
  const nextUploadProbeAt = isRetryAfterProbe
    ? now + retryDelayMs
    : uploadCycleStartAt ? uploadCycleStartAt + windowMs : null;
  const nextGenerationProbeAt = isRetryAfterProbe
    ? now + retryDelayMs
    : generationCycleStartAt ? generationCycleStartAt + windowMs : null;
  const probeTimes = [nextUploadProbeAt, nextGenerationProbeAt].filter((value) => Number.isFinite(value));
  const nextProbeAt = probeTimes.length ? Math.max(...probeTimes) : null;
  const startTimes = [uploadCycleStartAt, generationCycleStartAt].filter((value) => Number.isFinite(value));
  const accountName = gptAccounts.find((item) => item.id === accountId || item.quotaGroup === accountId)?.name || "当前账号窗口";
  const quotaKindLabel = kind === "upload" ? "上传" : kind === "generation" ? "生图" : "上传/生图";
  const probeText = formatGptQuotaProbeTime(nextProbeAt);
  const state = {
    ...previous,
    firstAt: Number(previous.firstAt || (startTimes.length ? Math.min(...startTimes) : now)),
    uploadCycleStartAt,
    generationCycleStartAt,
    nextUploadProbeAt,
    nextGenerationProbeAt,
    nextProbeAt,
    retryAfterProbe: isRetryAfterProbe,
    lastAt: now,
    message: String(message || "").slice(0, 500)
  };
  try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* private mode */ }
  writeGptWindowRuntime(accountId, {
    status: "waiting-quota",
    nextProbeAt,
    currentStage: kind === "upload" ? "上传受限" : kind === "generation" ? "生图受限" : "额度/低产出受限"
  });
  const lowOutputSignal = isLowOutputGptLimitMessage(message);
  const retryLimitSignal = isGptRetryLimitSignal(message, { _stage: kind === "generation" ? "生成图片" : "" });
  const signalLabel = retryLimitSignal
    ? "GPT 网页在出图阶段返回“出了点问题，请重试”，按触顶信号处理"
    : lowOutputSignal
      ? "本轮图片低于安全线，判定为触顶/降级征兆"
      : "GPT 网页返回了真实限额提示";
    gptQuotaPauseStatus = `${accountName}已触发${quotaKindLabel}额度/低产出上限；当前批次已安全停住，${probeText}自动重新探测（等待真实消耗后计算）。`;
  showWorkbenchAssistantBubble(
    `${signalLabel}：${gptQuotaPauseStatus} 上传本轮起点：${uploadCycleStartAt ? new Date(uploadCycleStartAt).toLocaleTimeString("zh-CN", { hour12: false }) : "尚未记录"}；生图本轮起点：${generationCycleStartAt ? new Date(generationCycleStartAt).toLocaleTimeString("zh-CN", { hour12: false }) : "尚未记录"}。`,
    { duration: 0, persistent: true, tone: "warning" }
  );
  if (nextProbeAt) scheduleGptQuotaReminder(new Date(nextProbeAt).toISOString(), accountId);
  return state;
}

function formatGptQuotaProbeTime(nextProbeAt) {
  const timestamp = Number(nextProbeAt || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "下一次探测时间待网页记录，";
  const waitMs = Math.max(0, timestamp - Date.now());
  const totalMinutes = Math.max(1, Math.ceil(waitMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const waitText = hours ? `${hours}小时${minutes ? `${minutes}分钟` : ""}` : `${minutes}分钟`;
  const at = new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
  return `最早 ${at}（约 ${waitText} 后）`;
}

function readGptTemporaryCacheState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GPT_TEMPORARY_CACHE_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeGptTemporaryCacheState(state) {
  try { localStorage.setItem(GPT_TEMPORARY_CACHE_STORAGE_KEY, JSON.stringify(state || {})); } catch { /* private mode */ }
}

function gptTemporaryCacheIntervalMs() {
  return GPT_TEMPORARY_CACHE_INTERVAL_MS;
}

function scheduleGptTemporaryCacheMaintenance(accountId = activeGptAccountId, baseAt = Date.now()) {
  const key = String(accountId || activeGptAccountId);
  const state = readGptTemporaryCacheState();
  const accountState = state[key] && typeof state[key] === "object" ? state[key] : {};
  const now = Date.now();
  const interval = gptTemporaryCacheIntervalMs();
  const requestedNextAt = Number(accountState.nextAt || 0);
  const nextAt = requestedNextAt > now ? requestedNextAt : Math.max(now + 1000, Number(baseAt || now) + interval);
  state[key] = { ...accountState, accountId: key, nextAt, intervalMs: interval, updatedAt: now };
  writeGptTemporaryCacheState(state);
  clearTimeout(gptTemporaryCacheMaintenanceTimers.get(key));
  const delay = Math.max(1000, Math.min(nextAt - now, 2_147_000_000));
  gptTemporaryCacheMaintenanceTimers.set(key, setTimeout(() => {
    gptTemporaryCacheMaintenanceTimers.delete(key);
    runGptTemporaryCacheMaintenance(key).catch((error) => {
      showWorkbenchAssistantBubble(`${gptAccounts.find((account) => account.id === key)?.name || "当前账号窗口"} 临时缓存清理失败：${error?.message || "未知错误"}`, { duration: 0, tone: "warning" });
      scheduleGptTemporaryCacheMaintenance(key, Date.now());
    });
  }, delay));
  return nextAt;
}

async function refreshGptAfterProduction(accountId = activeGptAccountId, reason = "production-complete") {
  const key = String(accountId || activeGptAccountId);
  if (!window.gptWorkbench?.maintenance) {
    scheduleGptTemporaryCacheMaintenance(key, Date.now());
    return { ok: false, accountId: key, error: "桌面 GPT 维护入口不可用" };
  }
  if (gptAccountRefreshPromises.has(key)) return gptAccountRefreshPromises.get(key);
  let timeoutTimer = null;
  const maintenanceRequest = window.gptWorkbench.maintenance({ accountId: key, clearTemporaryCache: false, reason });
  const timeoutRequest = new Promise((resolve) => {
    timeoutTimer = setTimeout(() => resolve({
      ok: false,
      timedOut: true,
      accountId: key,
      error: "GPT 页面刷新超时；已继续轮换，稍后再恢复该窗口"
    }), GPT_POST_REFRESH_TIMEOUT_MS);
  });
  const promise = Promise.race([maintenanceRequest, timeoutRequest])
    .then((result) => {
      scheduleGptTemporaryCacheMaintenance(key, Date.now());
      if (!result?.ok) throw new Error(result?.detail || result?.error || "GPT 网页刷新失败");
      return result;
    })
    .finally(() => {
      clearTimeout(timeoutTimer);
      gptAccountRefreshPromises.delete(key);
    });
  gptAccountRefreshPromises.set(key, promise);
  return promise;
}

async function runGptTemporaryCacheMaintenance(accountId = activeGptAccountId) {
  const key = String(accountId || activeGptAccountId);
  const state = readGptTemporaryCacheState();
  const accountState = state[key] && typeof state[key] === "object" ? state[key] : {};
  // Never reload a window in the middle of an upload, generation, copy or
  // package operation. The timer stays due and runs immediately after the
  // current post is safely finished.
  if (gptAutoRunning) {
    state[key] = { ...accountState, pending: true, nextAt: Date.now() + 30_000, updatedAt: Date.now() };
    writeGptTemporaryCacheState(state);
    scheduleGptTemporaryCacheMaintenance(key, Date.now());
    return { ok: false, deferred: true, accountId: key };
  }
  if (!window.gptWorkbench?.maintenance) throw new Error("桌面 GPT 维护入口不可用");
  const result = await window.gptWorkbench.maintenance({
    accountId: key,
    clearTemporaryCache: true,
    reason: "3h-temporary-cache"
  });
  if (!result?.ok) throw new Error(result?.detail || result?.error || "GPT 临时缓存清理后刷新失败");
  const now = Date.now();
  const nextState = {
    ...accountState,
    accountId: key,
    lastClearedAt: now,
    nextAt: now + gptTemporaryCacheIntervalMs(),
    pending: false,
    updatedAt: now
  };
  state[key] = nextState;
  writeGptTemporaryCacheState(state);
  scheduleGptTemporaryCacheMaintenance(key, now);
  showWorkbenchAssistantBubble(`${gptAccounts.find((account) => account.id === key)?.name || "当前账号窗口"} 已完成 3 小时临时缓存清理并刷新网页；登录状态和 Cookie 未动。`, { duration: 5200, tone: "info" });
  return result;
}

function restoreGptTemporaryCacheMaintenanceTimers() {
  const state = readGptTemporaryCacheState();
  const accountIds = new Set(gptAccounts.map((account) => account.id));
  accountIds.add(activeGptAccountId);
  accountIds.forEach((accountId) => {
    const nextAt = Number(state[String(accountId)]?.nextAt || 0);
    if (nextAt > 0) scheduleGptTemporaryCacheMaintenance(accountId, nextAt - gptTemporaryCacheIntervalMs());
  });
}

const gptQuotaReminderTimers = new Map();
let gptScheduledLaunchTimer = null;
let gptScheduledDayKey = "";
const gptScheduledLaunchKeys = new Set();

function resetGptCycleForAutomaticProbe(accountId, expectedProbeAt) {
  const key = String(accountId || activeGptAccountId);
  const state = readGptCycleState(key);
  if (Number(state.nextProbeAt || 0) !== Number(expectedProbeAt || 0)) return false;
  const nextState = {
    ...state,
    previousCycleStartAt: Number(state.generationCycleStartAt || state.uploadCycleStartAt || 0) || null,
    uploadCycleStartAt: null,
    generationCycleStartAt: null,
    nextUploadProbeAt: null,
    nextGenerationProbeAt: null,
    nextProbeAt: null,
    probeStartedAt: Date.now(),
    probeAttempts: Number(state.probeAttempts || 0) + 1,
    autoResumePending: false,
    updatedAt: Date.now()
  };
  try { localStorage.setItem(gptCycleStateKey(key), JSON.stringify(nextState)); } catch { /* private mode */ }
  writeGptWindowRuntime(key, { status: "probing", nextProbeAt: null, currentStage: "额度探测" });
  return true;
}

async function resumeGptQueueAfterQuotaProbe(accountId, expectedProbeAt) {
  const key = String(accountId || activeGptAccountId);
  const state = readGptCycleState(key);
  if (Number(state.nextProbeAt || 0) !== Number(expectedProbeAt || 0)) return;
  const runtime = readGptWindowRuntime(gptAccounts.find((item) => item.id === key || item.quotaGroup === key)?.id || key);
  if (runtime.stoppedByUser || runtime.pausedByUser) {
    writeGptWindowRuntime(runtime.accountId, { status: runtime.stoppedByUser ? "stopped" : "paused", nextProbeAt: expectedProbeAt });
    showWorkbenchAssistantBubble(`${gptAccounts.find((item) => item.id === runtime.accountId)?.name || "当前账号窗口"} 已由你${runtime.stoppedByUser ? "停止" : "暂停"}，额度已恢复但不会自动启动。`, { duration: 0 });
    return;
  }
  if (gptAutoSettings.mode === "manual") return;
  if (isContinuousGptMode()) {
    if (!isContinuousGptProductionArmed()) return;
    const workWindow = getGptContinuousWorkWindow();
    if (!workWindow.allowed) {
      scheduleContinuousGptProduction();
      return;
    }
  }
  if (gptAutoRunning) {
    clearTimeout(gptQuotaReminderTimers.get(key));
    gptQuotaReminderTimers.set(key, setTimeout(() => {
      resumeGptQueueAfterQuotaProbe(key, expectedProbeAt).catch(() => {});
    }, 60_000));
    return;
  }

  let hasPendingQueue = gptTestQueueIndex < gptTestQueue.length;
  if (!hasPendingQueue && isContinuousGptMode()) {
    hasPendingQueue = Boolean(await prepareAutoGptQueue(gptAutoSettings.accountTaskLimit || 8, "额度恢复自动探测"));
  }
  if (!hasPendingQueue) {
    showWorkbenchAssistantBubble("额度探测时间已到，但当前批次没有剩余素材；本次不自动新增普通生产任务。", { duration: 0 });
    return;
  }
  if (!resetGptCycleForAutomaticProbe(key, expectedProbeAt)) return;
  gptQuotaPauseStatus = "";
  // Keep the queue marked as a resume checkpoint so the current task is
  // reattached safely; the send routine clears this flag once it starts.
  gptQueuePaused = true;
  gptAutoPaused = false;
  const account = gptAccounts.find((item) => item.id === key || item.quotaGroup === key);
  if (account && account.id !== activeGptAccountId && isRotatingGptMode()) {
    await switchGptAccount(account.id, { silent: true, resumeWindow: false });
  }
  persistGptQueue();
  showWorkbenchAssistantBubble("已到下一次额度探测时间，正在用下一条素材自动试跑；若仍只生成 1–3 张，会再次停止。", { duration: 0, tone: "info" });
  await sendNextGptTestTask({
    quotaProbe: true,
    accountId: account?.id || activeGptAccountId,
    allowedAccountIds: isRotatingGptMode() ? [account?.id || String(accountId)] : undefined
  });
}

function scheduleGptQuotaReminder(nextExpiryAt, accountId) {
  const timestamp = Date.parse(String(nextExpiryAt || ""));
  if (!Number.isFinite(timestamp)) return;
  const key = String(accountId || activeGptAccountId);
  clearTimeout(gptQuotaReminderTimers.get(key));
  const delay = Math.max(1500, Math.min(timestamp - Date.now() + 1500, 2_147_000_000));
  gptQuotaReminderTimers.set(key, setTimeout(() => {
    const account = gptAccounts.find((item) => item.id === key || item.quotaGroup === key);
    const message = `${account?.name || "GPT 账号"}已到本轮生图起点后的额度探测时间。`;
    showWorkbenchAssistantBubble(message, { duration: 0 });
    window.gptWorkbench?.notify?.({ title: "开始额度探测", body: message }).catch(() => {});
    refreshGptQuota(key);
    resumeGptQueueAfterQuotaProbe(key, timestamp).catch((error) => {
      showWorkbenchAssistantBubble(`额度探测未能启动：${error?.message || "未知错误"}`, { duration: 0, tone: "warning" });
    });
  }, delay));
}

function restoreGptQuotaProbeTimers() {
  const accountIds = new Set([activeGptAccountId]);
  gptAccounts.forEach((account) => accountIds.add(account.quotaGroup || account.id));
  accountIds.forEach((accountId) => {
    const state = readGptCycleState(accountId);
    if (Number.isFinite(Number(state.nextProbeAt)) && Number(state.nextProbeAt) > 0) {
      scheduleGptQuotaReminder(new Date(Number(state.nextProbeAt)).toISOString(), accountId);
    }
  });
}

async function checkScheduledGptProduction() {
  if (!gptAutoSettings.scheduledEnabled || gptAutoRunning || gptScheduledLaunchTimer) return;
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const plans = parseGptSchedulePlan(
    gptAutoSettings.schedulePlan
      || `${gptAutoSettings.scheduledTime || "09:30"},${gptAutoSettings.accountTaskLimit || 8}`
  );
  for (const plan of plans) {
    const launchKey = `${dayKey}:${plan.id}`;
    if (gptScheduledLaunchKeys.has(launchKey)) continue;
    const [hour, minute] = String(plan.time || "").split(":").map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (now < target || now.getTime() - target.getTime() > 65_000) continue;
    if (isContinuousGptMode() && gptTestQueueIndex >= gptTestQueue.length && !gptTestSelectedMaterials.size) {
      gptScheduledLaunchKeys.add(launchKey);
      gptScheduledDayKey = dayKey;
      const prepared = await prepareAutoGptQueue(plan.count, "单账号全自动");
      if (!prepared) {
        showWorkbenchAssistantBubble("已到全天自动时间，但素材库没有可用素材；点号隐藏文件夹已跳过。", { duration: 0 });
        continue;
      }
    }
    const hasReadyQueue = gptTestQueueIndex < gptTestQueue.length || gptTestSelectedMaterials.size > 0;
    if (!hasReadyQueue) {
      gptScheduledLaunchKeys.add(launchKey);
      gptScheduledDayKey = dayKey;
      showWorkbenchAssistantBubble("已到定时生产时间，但当前没有准备好的素材队列，本次未启动。", { duration: 0 });
      continue;
    }
    const jitterMinutes = Math.max(0, Number(gptAutoSettings.scheduledJitterMinutes || 0));
    const delay = Math.round(Math.random() * jitterMinutes * 60_000);
    gptScheduledLaunchKeys.add(launchKey);
    gptScheduledDayKey = dayKey;
    showWorkbenchAssistantBubble(delay
      ? `定时任务 ${plan.time} 已到点，将在 ${Math.ceil(delay / 60_000)} 分钟内稳定启动。`
      : `定时任务 ${plan.time} 已到点，正在启动生产队列。`, { duration: 0 });
    gptScheduledLaunchTimer = setTimeout(() => {
      gptScheduledLaunchTimer = null;
      sendNextGptTestTask();
    }, delay);
    break;
  }
}

function updateGptTestQueueStatus(message = "") {
  const node = $("#gptTestQueueStatus");
  const badge = $("#gptStatusBadge");
  const button = $("#gptTestSendBtn");
  const progressBar = $(".gpt-auto-progress");
  if (!node || !button) return;
  const selectedCount = gptTestSelectedMaterials.size;
  const canResumeQueue = gptQueuePaused && gptTestQueue.length > 0 && gptTestQueueIndex < gptTestQueue.length;
  const modeKey = activeGptModeKey();
  const mode = GPT_MODE_DEFINITIONS[modeKey]?.label || "人工控制";
  const shortMode = GPT_MODE_DEFINITIONS[modeKey]?.shortName || mode;
  // --- Issue 3: status badge + dynamic message ---
  let badgeText = "待机";
  let msgText = "";
  if (message) { msgText = message; badgeText = "通知"; }
  else if (gptAutoRunning) {
    badgeText = "运行中";
    msgText = `${mode}处理中 ${Math.min(gptTestQueueIndex + 1, gptTestQueue.length)}/${gptTestQueue.length}`;
  }
  else if (gptQuotaPauseStatus && gptQueuePaused) { msgText = gptQuotaPauseStatus; badgeText = "等额度"; }
  else if (gptCurrentManualTask) { msgText = "已上传到输入框，请在右侧手动发送"; badgeText = "待发送"; }
  else if (gptSemiAutoPendingTask) { msgText = "计划已生成，请确认后继续"; badgeText = "待确认"; }
  else if (canResumeQueue) { msgText = `已恢复未完成队列，还有 ${gptTestQueue.length - gptTestQueueIndex} 个步骤待处理`; badgeText = "已恢复"; }
  else if (gptTestQueue.length && gptTestQueueIndex < gptTestQueue.length) { msgText = `还有 ${gptTestQueue.length - gptTestQueueIndex} 个队列步骤待处理`; badgeText = "暂停中"; }
  else if (!selectedCount) { msgText = "请至少选择一个素材文件夹；模板可以不选"; badgeText = "待机"; }
  else { msgText = `${shortMode}模式 · ${selectedCount} 素材 × ${Math.max(1, gptTestSelectedTemplates.size)} 母版 = ${gptProductionWorkCount()} 作品`; badgeText = "就绪"; }
  node.textContent = msgText;
  if (badge) badge.textContent = badgeText;
  const BADGE_CLASS_KEY = { "待机": "idle", "就绪": "ready", "运行中": "running", "通知": "info", "待发送": "pending", "待确认": "confirm", "暂停中": "paused", "等额度": "quota", "已恢复": "restored" };
  if (badge) badge.className = `gpt-status-badge badge-${BADGE_CLASS_KEY[badgeText] || "idle"}`;
  // --- Issue 1: button text reflects actual mode behavior ---
  button.disabled = (!selectedCount && !canResumeQueue) || !window.gptWorkbench?.available;
  if (gptAutoRunning) button.disabled = true;
  if (gptCurrentManualTask) button.disabled = true;
  if (gptSemiAutoPendingTask) button.disabled = true;
  // Mode-specific button text: tell the user exactly what will happen
  if (gptAutoRunning)
    button.textContent = `${mode}进行中 ${Math.min(gptTestQueueIndex + 1, gptTestQueue.length)}/${gptTestQueue.length}`;
  else if (gptCurrentManualTask)
    button.textContent = "⏳ 等待手动发送";
  else if (gptSemiAutoPendingTask)
    button.textContent = "⏳ 等待确认计划";
  else if (canResumeQueue)
    button.textContent = `▶ 继续生产 ${gptTestQueueIndex + 1}/${gptTestQueue.length}`;
  else if (gptTestQueue.length && gptTestQueueIndex > 0 && gptTestQueueIndex < gptTestQueue.length)
    button.textContent = `▶ 继续 ${gptTestQueueIndex + 1}/${gptTestQueue.length}`;
  else if (modeKey === "manual")
    button.textContent = "📤 上传素材到输入框";
  else if (modeKey === "patrol")
    button.textContent = "🔍 开始巡检生产";
  else
    button.textContent = `🚀 开始${shortMode}生产`;
  // --- Issue 4: hide irrelevant buttons when idle ---
  const hasActiveWork = gptAutoRunning || gptQueuePaused || gptTestQueue.some((task) => !["completed", "skipped"].includes(task._status));
  const pauseButton = $("#gptPauseQueueBtn");
  if (pauseButton) {
    const runtime = readGptWindowRuntime(activeGptAccountId);
    pauseButton.hidden = !hasActiveWork;
    pauseButton.disabled = false;
    const quotaWaiting = Boolean((gptQuotaPauseStatus || runtime.status === "waiting-quota") && !gptAutoRunning && gptQueuePaused);
    pauseButton.textContent = runtime.pausedByUser || gptAutoPaused || (!gptAutoRunning && gptQueuePaused) ? "▶ 继续" : "⏸ 暂停";
    if (quotaWaiting) pauseButton.textContent = "▶ 继续（等额度）";
    pauseButton.title = quotaWaiting
      ? "已触达额度或低产出上限；到探测时间会自动试跑，也可以手动继续强制尝试"
      : gptAutoRunning ? "暂停当前工作流，当前帖子会停在安全检查点" : "继续当前工作流";
  }
  const stopButton = $("#gptStopQueueBtn");
  if (stopButton) {
    const runtime = readGptWindowRuntime(activeGptAccountId);
    stopButton.hidden = !hasActiveWork && !runtime.stoppedByUser;
    stopButton.textContent = runtime.stoppedByUser ? "▶ 启动" : "⏹ 停止";
    stopButton.title = runtime.stoppedByUser
      ? "重新启动当前账号窗口的生产模式"
      : "彻底停止当前账号窗口的本轮生产，不会删除队列或登录状态";
  }
  // Skip button: only show when queue is active and not at the end
  const skipBtn = $("#gptSkipTaskBtn");
  if (skipBtn) {
    skipBtn.hidden = gptAutoRunning ? false : (!gptTestQueue.length || gptTestQueueIndex >= gptTestQueue.length);
    skipBtn.disabled = gptAutoRunning ? false : true;
  }
  // Progress bar: only visible when running
  if (progressBar) progressBar.hidden = !gptAutoRunning && !gptQueuePaused;
  $("#gptManualNextBtn")?.toggleAttribute("hidden", gptAutoSettings.mode !== "manual" || !gptCurrentManualTask);
  $("#gptSemiAutoResumeBtn")?.toggleAttribute("hidden", !gptSemiAutoPendingTask);
  $("#gptRetryTaskBtn")?.toggleAttribute("hidden", !gptLastFailedTask || gptAutoRunning);
  updateGptAssistantBubble(message);
}

function blockGptSelectionDuringRun() {
  // Pausing keeps gptAutoRunning true (the current post winds down to a safe
  // checkpoint) but must release the material/template lock so the operator
  // can queue the next batch.  Only a live, unpaused run blocks selection.
  if (!gptAutoRunning || gptAutoPaused) return false;
  showWorkbenchAssistantBubble("自动生产正在进行中，已锁定素材和模板选择；请先暂停，再调整队列。", { duration: 5200 });
  return true;
}

function gptHostBounds() {
  const host = $("#gptEmbeddedHost");
  if (!host) return null;
  const rect = host.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: Math.max(320, rect.width),
    height: Math.max(320, rect.height)
  };
}

function renderGptAccountTabs() {
  const host = $("#gptAccountTabs");
  if (!host) return;
  // disabled 账号窗口附加 .gpt-account-tab.disabled 样式（见 styles.css），自动化模式会跳过此窗口。
  host.innerHTML = gptAccounts.filter((account) => !account.hidden).map((account) => `
    <button class="gpt-account-tab${account.id === activeGptAccountId ? " active" : ""}${account.disabled ? " disabled" : ""}"
      type="button" data-gpt-account="${escapeHtml(account.id)}"
      draggable="true"
      title="${escapeHtml(account.name)} · 独立登录状态${account.mode ? ` · ${GPT_MODE_DEFINITIONS[account.mode]?.label || account.mode}` : ""}${account.disabled ? " · 已禁用（自动化跳过）" : ""}">
      <span>${escapeHtml(account.name)}</span>${account.mode ? `<small class="gpt-account-mode-tag">${escapeHtml(GPT_MODE_DEFINITIONS[account.mode]?.label?.replace(/模式$/, "") || account.mode)}</small>` : ""}
    </button>
  `).join("");
}

async function renameGptAccount(accountId) {
  const account = gptAccounts.find((item) => item.id === accountId);
  if (!account) return;
  const result = await openSystemDialog({
    eyebrow: "账号窗口",
    title: "重命名账号窗口",
    description: "为这个账号窗口输入一个新名称（最多 24 个字符）。",
    input: { label: "新名称", value: account.name, maxLength: 24 },
    confirmLabel: "保存",
    cancelLabel: "取消"
  });
  const cleanName = String(result || "").trim().slice(0, 24);
  if (!cleanName || cleanName === account.name) return;
  account.name = cleanName;
  if (window.gptWorkbench?.saveProfile) {
    const state = await window.gptWorkbench.saveProfile({ ...account, active: false });
    gptAccounts = state.profiles.map((profile) => ({ ...profile }));
  }
  saveGptAccounts();
  renderGptAccountTabs();
  renderGptBrowserManager();
  showWorkbenchAssistantBubble(`账号窗口已重命名为“${cleanName}”。`);
}

async function toggleGptAccountDisabled(accountId) {
  const account = gptAccounts.find((item) => item.id === accountId);
  if (!account) return;
  const nextDisabled = !account.disabled;
  account.disabled = nextDisabled;
  if (window.gptWorkbench?.saveProfile) {
    try {
      await window.gptWorkbench.saveProfile({ ...account, disabled: nextDisabled, active: false });
    } catch (error) {
      account.disabled = !nextDisabled;
      throw error;
    }
  }
  saveGptAccounts();
  renderGptAccountTabs();
  renderGptBrowserManager();
  if (account.disabled) {
    showWorkbenchAssistantBubble(`账号窗口“${account.name}”已暂时禁用。自动化模式将跳过此窗口，窗口仍可手动查看。`, { duration: 4200, tone: "warning" });
  } else {
    showWorkbenchAssistantBubble(`账号窗口“${account.name}”已启用，自动化模式可正常驱动。`, { duration: 3000 });
  }
}

async function reorderGptAccounts(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const sourceIndex = gptAccounts.findIndex((item) => item.id === sourceId);
  const targetIndex = gptAccounts.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [moved] = gptAccounts.splice(sourceIndex, 1);
  gptAccounts.splice(targetIndex, 0, moved);
  if (window.gptWorkbench?.reorderProfiles) {
    const state = await window.gptWorkbench.reorderProfiles(gptAccounts.map((item) => item.id));
    gptAccounts = state.profiles.map((profile) => ({ ...profile }));
  }
  saveGptAccounts();
  renderGptAccountTabs();
  renderGptBrowserManager();
  showWorkbenchAssistantBubble("账号窗口顺序已保存。", { transient: true, duration: 2600 });
}

function renderGptBrowserManager(options = {}) {
  const host = $("#gptBrowserManager");
  if (!host) return;
  if (options.hydrateNative && window.gptWorkbench?.profiles && !renderGptBrowserManager._hydrating) {
    renderGptBrowserManager._hydrating = true;
    hydrateGptBrowserProfiles()
      .catch(() => {})
      .finally(() => { renderGptBrowserManager._hydrating = false; });
  }
  host.innerHTML = `
    <div class="gpt-browser-manager-summary">当前同步 ${gptAccounts.length} 个账号窗口；和上方账号标签一致，手动加减后这里会自动刷新。</div>
  ` + gptAccounts.map((account) => `
    <section class="gpt-browser-manager-row${account.disabled ? " disabled" : ""}" data-browser-profile="${escapeHtml(account.id)}">
      <input type="text" value="${escapeHtml(account.name)}" data-browser-name="${escapeHtml(account.id)}" aria-label="账号窗口名称" />
      <input type="text" value="${escapeHtml(account.quotaGroup || account.id)}" data-browser-quota-group="${escapeHtml(account.id)}" aria-label="额度组" />
      <button type="button" data-browser-toggle-disable="${escapeHtml(account.id)}">${account.disabled ? "启用" : "禁用"}</button>
      <button type="button" data-browser-toggle="${escapeHtml(account.id)}">${account.hidden ? "重新打开" : "隐藏标签"}</button>
      <button type="button" data-browser-recovery="${escapeHtml(account.id)}">创建恢复点</button>
      ${gptAccounts.length > 1 ? `<button type="button" class="danger-text-button" data-browser-remove="${escapeHtml(account.id)}">移除记录</button>` : ""}
      <button type="button" class="danger-text-button" data-browser-delete-login="${escapeHtml(account.id)}">删除登录数据</button>
    </section>
  `).join("");
}

async function reconcileGptWindow(accountId = activeGptAccountId, options = {}) {
  const key = String(accountId || activeGptAccountId);
  const mode = normalizeGptProductionMode(gptAutoSettings.mode);
  const runtime = readGptWindowRuntime(key);
  if (!isContinuousGptMode(mode) || gptAutoRunning) return false;
  // Disabled accounts are invisible to continuous automation.
  const account = gptAccounts.find((item) => item.id === key);
  if (account?.disabled) return false;
  // A saved queue pause is an operator/safety checkpoint, not an invitation
  // to resume merely because an account tab was reattached or inspected.
  // Explicit Start/Continue clears the pause before calling with force=true.
  if (gptQueuePaused && !options.force) return false;
  if (runtime.stoppedByUser && !options.force) return false;
  if (runtime.pausedByUser && !options.force) return false;
  if (!options.force && !isContinuousGptProductionArmed()) return false;
  const quotaState = readGptCycleState(gptAccounts.find((item) => item.id === key)?.quotaGroup || key);
  if (!options.force && Number(quotaState.nextProbeAt || 0) > Date.now()) {
    scheduleGptQuotaReminder(new Date(Number(quotaState.nextProbeAt)).toISOString(), quotaState.accountId || key);
    writeGptWindowRuntime(key, { status: "waiting-quota", nextProbeAt: Number(quotaState.nextProbeAt), currentStage: "等待额度恢复" });
    updateGptTestQueueStatus(`${gptAccounts.find((item) => item.id === key)?.name || "当前账号窗口"} 等待额度恢复；到时间会自动探测。`);
    return false;
  }
  let hasPending = gptTestQueue.some((task) => !["completed", "skipped"].includes(task._status));
  if (!hasPending) {
    hasPending = Boolean(await prepareAllDayGptQueue());
  }
  if (!hasPending) {
    showWorkbenchAssistantBubble(`${gptAccounts.find((item) => item.id === key)?.name || "当前账号窗口"} 暂无可生产素材，等待下一次扫描。`, { duration: 0 });
    return false;
  }
  gptQueuePaused = gptTestQueueIndex < gptTestQueue.length;
  persistGptQueue();
  await sendNextGptTestTask({ accountId: key, allowWindowSwitch: true, automaticResume: true });
  const stillPending = gptTestQueue.some((task) => !["completed", "skipped"].includes(task._status));
  const afterRuntime = readGptWindowRuntime(key);
  if (stillPending && !gptAutoRunning && afterRuntime.status !== "waiting-quota" && !afterRuntime.stoppedByUser && !afterRuntime.pausedByUser) {
    scheduleGptWindowRetry(key, 15_000, "网页状态没有完成确认");
  }
  return true;
}

async function switchGptAccount(accountId, options = {}) {
  const account = gptAccounts.find((item) => item.id === accountId);
  if (!account) return;
  // The renderer can restore an active tab from local settings while the
  // Electron side still has another BrowserView (or no view) attached after
  // a restart.  Do not return early when the tab is already marked active:
  // re-showing it is what actually wakes/attaches that account's persistent
  // GPT session.  This also makes a newly added account window immediately
  // usable instead of leaving the previous account's page visible.
  const accountChanged = account.id !== activeGptAccountId;
  activeGptAccountId = account.id;
  window.gptWorkbench?.saveProfile?.({ ...account, active: true, lastOpenedAt: new Date().toISOString() }).catch(() => {});
  const accountSettings = dashboard?.workspaceSettings?.pageSettings?.gptAuto?.accounts?.find((item) => item.id === account.id);
  if (accountChanged) {
    // Clear the manual task from the previous account window.  A manual task
    // is owned by the account it was uploaded to; switching to another window
    // must not let the old task's "完成当前" button advance the new window.
    gptCurrentManualTask = null;
    gptSemiAutoPendingTask = null;
    // Per-window mode: restore this account's own production mode.  Each
    // window can be independently set to manual / automatic / continuous.
    const accountMode = account.mode ? normalizeGptProductionMode(account.mode) : "";
    if (accountMode && accountMode !== normalizeGptProductionMode(gptAutoSettings.mode)) {
      gptAutoSettings.mode = accountMode;
      applyGptModeProfile(accountMode);
      if ($("#gptProductionMode")) $("#gptProductionMode").value = accountMode;
    }
    if (accountSettings) {
      gptAutoSettings = {
        ...gptAutoSettings,
        uploadLimit: accountSettings.uploadLimit,
        generationLimit: accountSettings.generationLimit,
        windowHours: accountSettings.windowHours
      };
    }
    renderGptAutoSettings();
  }
  saveGptAccounts();
  renderGptAccountTabs();
  gptLastShowSignature = "";
  await showEmbeddedGptView();
  // Refresh the selected account before painting its assistant summary. The
  // profiles are isolated; do not briefly reuse the previous account's
  // quota snapshot while this view is being attached.
  await refreshGptQuota(account.id);
  writeGptWindowRuntime(account.id, { currentStage: readGptWindowRuntime(account.id).currentStage || "窗口已打开" });
  updateGptAssistantBubble(`${account.name} 已切换：上传 ${readGptWindowRuntime(account.id).uploadedAttachments || 0} 张，本轮生图 ${readGptWindowRuntime(account.id).generatedImages || 0} 张`);
  if (gptAutoRunning && !options.silent) {
    showWorkbenchAssistantBubble(`已切换查看 ${account.name}；正在运行的任务仍留在开始时的账号窗口，不会向当前窗口自动注入。`, { duration: 0 });
  }
  // In manual-window mode the selected account is the worker.  Switching the
  // visible tab must therefore wake that account, but never hijack a running
  // task owned by another account.
  if (!gptAutoRunning && options.resumeWindow !== false) {
    await reconcileGptWindow(account.id, { force: Boolean(options.forceResume) });
  }
}

async function addGptAccount() {
  if (gptAutoRunning) {
    showSystemNotice("自动生产进行中", "完成或暂停后再新增账号。");
    return;
  }
  if (gptAccounts.length >= 8) {
    showSystemNotice("账号数量已到上限", "最多可保留 8 个相互隔离的 GPT 登录账号。");
    return;
  }
  const used = new Set(gptAccounts.map((item) => item.id));
  let sequence = 1;
  while (used.has(`account-${sequence}`)) sequence += 1;
  const account = { id: `account-${sequence}`, name: `账号窗口 ${sequence}`, quotaGroup: `account-${sequence}`, hidden: false };
  gptAccounts.push(account);
  activeGptAccountId = account.id;
  if (window.gptWorkbench?.saveProfile) {
    const state = await window.gptWorkbench.saveProfile({ ...account, active: true });
    gptAccounts = state.profiles.map((profile) => ({ ...profile }));
  }
  saveGptAccounts();
  renderGptAccountTabs();
  renderGptBrowserManager();
  gptLastShowSignature = "";
  await showEmbeddedGptView();
  if (isContinuousGptMode() && isContinuousGptProductionArmed()) {
    await reconcileGptWindow(account.id);
  }
}

async function removeGptAccount(accountId) {
  if (gptAutoRunning) {
    showSystemNotice("自动生产进行中", "完成或暂停后再移除账号。");
    return;
  }
  if (gptAccounts.length <= 1) return;
  const account = gptAccounts.find((item) => item.id === accountId);
  if (!account) return;
  const confirmed = await openSystemDialog({
    eyebrow: "危险操作",
    tone: "danger",
    title: `删除账号窗口“${account.name}”`,
    description: "此操作会移除账号窗口记录，并清除对应的浏览器分区数据。",
    details: [
      { label: "包含数据", value: "Cookie、GPT 登录状态、Google 登录、扩展数据、缓存" },
      { label: "不可恢复", value: "删除后需要重新登录所有相关账号" },
      { label: "队列影响", value: "若该窗口有任务，会先终止当前任务" }
    ],
    warning: "删除将清除本机保存的 GPT/Google 登录状态，请确认。",
    confirmLabel: "我确认删除",
    cancelLabel: "取消"
  });
  if (!confirmed) return;
  // 二次确认
  const finalConfirm = await openSystemDialog({
    eyebrow: "最后确认",
    tone: "danger",
    title: "再次确认删除",
    description: `即将删除“${account.name}”及其全部登录数据，此操作不可撤销。`,
    confirmLabel: "确认删除",
    cancelLabel: "返回"
  });
  if (!finalConfirm) return;
  if (window.gptWorkbench?.removeProfile) {
    const state = await window.gptWorkbench.removeProfile(accountId);
    gptAccounts = state.profiles.map((profile) => ({ ...profile }));
    activeGptAccountId = state.activeId;
  } else {
    gptAccounts = gptAccounts.filter((item) => item.id !== accountId);
    if (activeGptAccountId === accountId) activeGptAccountId = gptAccounts[0].id;
  }
  saveGptAccounts();
  renderGptAccountTabs();
  renderGptBrowserManager();
  gptLastShowSignature = "";
  await showEmbeddedGptView();
  showWorkbenchAssistantBubble(`账号窗口“${account.name}”已删除，登录数据已清除。`, { tone: "warning", duration: 4000 });
}

async function deleteGptAccountLogin(accountId) {
  if (gptAutoRunning) {
    showSystemNotice("自动生产进行中", "完成或暂停后再处理登录数据。");
    return;
  }
  const account = gptAccounts.find((item) => item.id === accountId);
  if (!account || !window.gptWorkbench?.deleteProfileLogin) return;
  if (!window.confirm(`危险操作：这会清除“${account.name}”的 GPT/Google 本机登录状态。确定继续吗？`)) return;
  if (!window.confirm("最后确认：清除后需要重新登录，现有浏览器记录仍保留。")) return;
  await window.gptWorkbench.deleteProfileLogin(accountId);
  gptLastShowSignature = "";
  if (accountId === activeGptAccountId) await showEmbeddedGptView();
  showSystemNotice("登录数据已清除", `${account.name} 的本机登录状态已删除，账号窗口档案仍保留。`, { tone: "success" });
}

function syncGptBrowserAddress(url = "") {
  const input = $("#gptBrowserAddressInput");
  if (!input || document.activeElement === input) return;
  input.value = String(url || "");
  input.title = String(url || "");
}

async function navigateEmbeddedGpt(action, targetUrl = "", accountId = activeGptAccountId) {
  if (!window.gptWorkbench?.available) return;
  const state = $("#gptEmbeddedState");
  try {
    if (state) {
      state.textContent = action === "reload" ? "正在刷新 GPT" : "正在切换网页";
      state.dataset.tone = "busy";
    }
    const result = await window.gptWorkbench.navigate(action, accountId, targetUrl);
    $("#gptBrowserBackBtn").disabled = !result.canGoBack;
    $("#gptBrowserForwardBtn").disabled = !result.canGoForward;
    syncGptBrowserAddress(result.url);
    if (action === "url" && result.url && !result.isChatGpt) {
      showWorkbenchAssistantBubble("已在当前账号窗口打开网页；需要继续生产时点首页返回 GPT。", { duration: 3600 });
    }
    if (/\/auth\/(?:login|signup)/i.test(result.url || "")) {
      showWorkbenchAssistantBubble("当前 GPT 账号窗口需要登录，登录完成后可继续生产。", { duration: 0 });
    }
    window.setTimeout(() => showEmbeddedGptView(), 380);
  } catch (error) {
    if (state) {
      state.textContent = "网页操作失败";
      state.dataset.tone = "danger";
      state.title = error.message;
    }
  }
}

async function showEmbeddedGptView() {
  // Guard: never show the native GPT view when the user has already switched
  // to a different tab.  The WebContentsView is a native compositor layer
  // that renders above all DOM regardless of z-index; showing it on a
  // non-GPT tab makes it "float" on top of other pages.
  if (!$("#gptProductionTestView")?.classList.contains("active")) return;
  // Also bail out if a DOM overlay (settings, dialog, lightbox, assistant
  // panel, history panel) is currently open — the native view must stay
  // hidden until the overlay closes.
  if (!$("#pageSettingsBackdrop")?.hidden) return;
  if (document.querySelector(".system-dialog-backdrop")) return;
  if (document.querySelector(".image-lightbox")) return;
  if (!$("#workbenchAssistantPanel")?.hidden) return;
  if (!$("#gptProductionHistoryPanel")?.hidden) return;
  if ($("#contextMenu")?.classList.contains("show")) return;
  const state = $("#gptEmbeddedState");
  const host = $("#gptEmbeddedHost");
  if (!window.gptWorkbench?.available) {
    if (state) {
      state.textContent = "请在桌面测试版中使用";
      state.dataset.tone = "danger";
    }
    updateGptTestQueueStatus();
    return;
  }
  const bounds = gptHostBounds();
  if (!bounds || bounds.width < 100 || bounds.height < 100) {
    host?.classList.remove("is-native-visible");
    window.setTimeout(() => {
      if ($("#gptProductionTestView")?.classList.contains("active")) showEmbeddedGptView().catch(() => {});
    }, 260);
    return;
  }
  const signature = `${activeGptAccountId}:${Math.round(bounds.x)}:${Math.round(bounds.y)}:${Math.round(bounds.width)}:${Math.round(bounds.height)}`;
  if (signature === gptLastShowSignature && !gptShowInFlight) return;
  if (gptShowInFlight) return gptShowInFlight;
  if (state && !gptLastShowSignature) {
    state.textContent = "正在打开 GPT";
    state.dataset.tone = "busy";
  }
  gptShowInFlight = (async () => {
  try {
    const result = await window.gptWorkbench.show(bounds, activeGptAccountId);
    gptLastShowSignature = signature;
    host?.classList.add("is-native-visible");
    syncGptBrowserAddress(result.url);
    if (state) {
      const needsLogin = /\/auth\/(?:login|signup)/i.test(result.url || "");
      state.textContent = !result.isChatGpt
        ? "浏览器网页已打开 · 返回 GPT 可继续生产"
        : needsLogin
        ? `${gptAccounts.find((item) => item.id === activeGptAccountId)?.name || "当前账号"}：请先登录`
        : result.ready ? "GPT 已就绪 · 生产助手已接入" : "GPT 网页加载中（最长20秒）";
      state.dataset.tone = !result.isChatGpt ? "success" : needsLogin ? "warning" : result.ready ? "success" : "busy";
      state.title = result.extensionError || "";
    }
    if ($("#gptBrowserBackBtn")) $("#gptBrowserBackBtn").disabled = !result.canGoBack;
    if ($("#gptBrowserForwardBtn")) $("#gptBrowserForwardBtn").disabled = !result.canGoForward;
    if (result.isChatGpt && !/\/auth\/(?:login|signup)/i.test(result.url || "") && !result.ready) {
      const deadline = Date.now() + 20_000;
      let readiness = result;
      while (Date.now() < deadline && !readiness.ready) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        readiness = await window.gptWorkbench.status(activeGptAccountId);
      }
      if (state) {
        state.textContent = readiness.ready ? "GPT 已就绪 · 生产助手已接入" : "GPT 网页加载超时，请点击刷新";
        state.dataset.tone = readiness.ready ? "success" : "danger";
        state.title = readiness.pageState?.error || readiness.extensionError || "网页没有在20秒内进入可生产状态";
      }
      if (!readiness.ready) {
        showWorkbenchAssistantBubble("GPT 网页未在 20 秒内就绪，可点击网页顶部刷新后重试。", { duration: 0, tone: "danger" });
      }
    }
  } catch (error) {
    gptLastShowSignature = "";
    host?.classList.remove("is-native-visible");
    if (state) {
      state.textContent = "GPT 打开失败";
      state.dataset.tone = "danger";
      state.title = error.message;
    }
    showWorkbenchAssistantBubble(`GPT 打开失败：${error.message}`, { duration: 0, tone: "danger" });
  }
  })();
  try {
    await gptShowInFlight;
  } finally {
    gptShowInFlight = null;
  }
  if (!gptEmbeddedResizeObserver && $("#gptEmbeddedHost")) {
    gptEmbeddedResizeObserver = new ResizeObserver(() => {
      if ($("#gptProductionTestView")?.classList.contains("active")) {
        clearTimeout(gptEmbeddedResizeTimer);
        gptEmbeddedResizeTimer = setTimeout(() => {
          gptLastShowSignature = "";
          showEmbeddedGptView().catch(() => {});
        }, 120);
      }
    });
    gptEmbeddedResizeObserver.observe($("#gptEmbeddedHost"));
  }
  updateGptTestQueueStatus();
}

function restoreEmbeddedGptView() {
  if (!$("#gptProductionTestView")?.classList.contains("active")) return;
  // Clear the signature so delayed calls re-show even if bounds unchanged.
  gptLastShowSignature = "";
  window.requestAnimationFrame(() => {
    // Re-check: user may have switched tabs or opened an overlay since the
    // rAF was scheduled.  showEmbeddedGptView has its own guards, but the
    // signature reset must not fire on a non-GPT tab.
    if (!$("#gptProductionTestView")?.classList.contains("active")) return;
    showEmbeddedGptView().catch(() => {});
  });
  window.setTimeout(() => {
    if (!$("#gptProductionTestView")?.classList.contains("active")) return;
    gptLastShowSignature = "";
    showEmbeddedGptView().catch(() => {});
  }, 180);
  window.setTimeout(() => {
    if (!$("#gptProductionTestView")?.classList.contains("active")) return;
    gptLastShowSignature = "";
    showEmbeddedGptView().catch(() => {});
  }, 700);
}

function renderGptProductionTest() {
  if (!$("#gptProductionTestView")) return;
  renderGptTestMaterials();
  renderGptTestTemplates();
  if (gptTemplateMode === "online" && !gptOnlineTemplatesLoaded) {
    loadGptOnlineTemplates().catch((error) => showWorkbenchAssistantBubble(`在线模板读取失败：${error.message}`, { duration: 0 }));
  }
  renderGptAccountTabs();
  renderGptAutoSettings();
  refreshGptQuota();
  window.requestAnimationFrame(() => showEmbeddedGptView());
  window.setTimeout(() => showEmbeddedGptView().catch(() => {}), 320);
  window.setTimeout(() => showEmbeddedGptView().catch(() => {}), 1200);
}

async function refreshExpandedGptMaterialTrees() {
  if (!$("#gptProductionTestView")?.classList.contains("active") || gptAutoRunning) return;
  for (const categoryPath of [...gptTestExpandedCategories]) {
    await loadDashboard("materials", categoryPath).catch(() => {});
  }
  renderGptTestMaterials();
}

function gptTaskGroupsForMultiWindow() {
  if (gptQueuePaused && gptTestQueue.some((task) => !["completed", "skipped"].includes(task._status))) {
    const pending = gptTestQueue.filter((task) => !["completed", "skipped"].includes(task._status));
    const groups = [];
    for (const task of pending) {
      if (task.taskType === "template-init") groups.push([task]);
      else if (groups.length && groups[groups.length - 1][0]?.taskType === "template-init") groups[groups.length - 1].push(task);
      else groups.push([task]);
    }
    return groups;
  }
  const entries = selectedGptTestEntries();
  const templates = selectedGptTestTemplates();
  if (!templates.length) return entries.map((entry) => [buildGptTestTask(entry)]);
  return templates.flatMap((template) => template.kind === "online"
    ? entries.map((entry) => [{
        ...buildGptTestTask(entry, template),
        navigationUrl: template.url,
        preferredAccountId: template.accountId || ""
      }])
    : [[
        { ...buildGptTemplateInitTask(template), navigation: "new-chat" },
        ...entries.map((entry) => buildGptTestTask(entry, template))
      ]]);
}

async function runGptTaskOnBrowser(task, account, tracker) {
  const resumeCheckpoint = TBGptAccountRotation.rotationResumeCheckpoint(task);
  if (resumeCheckpoint.resuming) {
    task.retryFromStage = resumeCheckpoint.stage;
    task.retryFromPercent = resumeCheckpoint.percent;
    task.forceUpload = false;
    task._stage = resumeCheckpoint.stage;
    task._percent = resumeCheckpoint.percent;
  }
  task.accountId = account.id;
  task.quotaAccountId = account.quotaGroup || account.id;
  task.autoRun = true;
  task.autoOptions = { ...gptAutoSettings, quotaAccountId: task.quotaAccountId };
  task._status = "running";
  task._startedAt ||= new Date().toISOString();
  const uploadImages = (task.attachments || []).filter((filePath) => /\.(?:png|jpe?g|webp|gif|bmp)$/i.test(String(filePath || ""))).length;
  markGptWindowSetStarted(account.id);
  writeGptWindowRuntime(account.id, {
    status: "running",
    currentTaskId: task.requestId,
    currentStage: resumeCheckpoint.resuming ? resumeCheckpoint.stage : "上传附件",
    currentPercent: resumeCheckpoint.resuming ? resumeCheckpoint.percent : 5,
    expectedAttachments: (task.attachments || []).length,
    uploadedAttachments: resumeCheckpoint.resuming
      ? Number(readGptWindowRuntime(account.id).uploadedAttachments || (task.attachments || []).length)
      : 0,
    stoppedByUser: false
  });
  showWorkbenchAssistantBubble(resumeCheckpoint.resuming
    ? `${account.name} 正在从当前素材的网页检查点继续，不会重复上传附件。`
    : `${account.name} 已上传本帖 ${uploadImages} 张图片，等待 GPT 确认附件。`, { duration: 3600 });
  // Persist this before entering the bridge. A restart may safely resume from
  // the web stage only after this marker is true; it must never upload a
  // second copy of a post because the renderer disappeared mid-request.
  if (!resumeCheckpoint.resuming) task._submittedToGpt = false;
  persistGptQueue();
  if (!resumeCheckpoint.resuming) recordGptQuotaConsumption(task, task.quotaAccountId, "upload");
  if (task.taskType === "material" && !resumeCheckpoint.resuming) await ensureGptTaskQuota(task, task.quotaAccountId);
  if (!resumeCheckpoint.resuming && task.navigationUrl) {
    await window.gptWorkbench.navigate("url", account.id, task.navigationUrl);
    await new Promise((resolve) => setTimeout(resolve, 1800));
  } else if (!resumeCheckpoint.resuming && task.navigation === "new-chat") {
    await window.gptWorkbench.navigate("new-chat", account.id);
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  // A newly-created account or a new local-template chat must receive the
  // current versioned guard before any material prompt. Existing conversation
  // windows keep their trained context and are not flooded with the prompt.
  if (task.taskType === "template-init" || gptAccountNeedsMasterPrompt(account)) {
    const extraRules = String(gptAutoSettings?.extraPromptRules || "").trim();
    const baseMaster = currentGptMasterPrompt();
    const master = extraRules ? `${baseMaster}\n\n${extraRules}` : baseMaster;
    task.prompt = task.taskType === "template-init"
      ? `${master}\n\n${task.prompt}`
      : promptForNewGptSession(task.prompt, account);
    if (task.taskType === "material" && !task.templateId) {
      task.prompt += "\n\n当前账号窗口没有可确认的历史母版，也没有实体模板附件；请先提示用户提供模板，不要直接自由设计或出图。";
    }
  }
  let polling = true;
  const poll = (async () => {
    while (polling) {
      const status = await window.gptWorkbench.workflowStatus(account.id).catch(() => null);
      if (status?.requestId === task.requestId) {
        task._stage = String(status.stage || "");
        task._percent = Number(status.percent || 0);
        writeGptWindowRuntime(account.id, {
          status: "running",
          currentTaskId: task.requestId,
          currentStage: task._stage,
          currentPercent: task._percent,
          uploadedAttachments: Number(status.uploadedAttachments || readGptWindowRuntime(account.id).uploadedAttachments || 0),
          expectedImages: Number(status.expectedImages || readGptWindowRuntime(account.id).expectedImages || 0),
          generatedImages: Number(status.generatedImages || status.actualImages || readGptWindowRuntime(account.id).generatedImages || 0)
        });
        if (/生成|图片|生图/i.test(task._stage)) recordGptQuotaConsumption(task, task.quotaAccountId, "generation");
        persistGptQueue();
        const overall = Math.round(((tracker.completed + tracker.failed + task._percent / 100) / tracker.total) * 100);
        if ($("#gptAutoProgressBar")) $("#gptAutoProgressBar").style.width = `${overall}%`;
        updateGptTestQueueStatus(`${account.name} · ${task.name} · ${task._stage || "处理中"} ${task._percent || 0}% · 全批 ${tracker.completed + tracker.failed}/${tracker.total}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  })();
  let result;
  try {
    task._submittedToGpt = true;
    persistGptQueue();
    result = await window.gptWorkbench.sendTask(task);
  } finally {
    polling = false;
    await poll;
  }
  if (result?.ok !== false) {
    const confirmedUploads = Number(result?.fileCount || result?.uploadedFiles || uploadImages || 0);
    writeGptWindowRuntime(account.id, {
      uploadedAttachments: confirmedUploads,
      expectedAttachments: uploadImages,
      currentStage: "附件已确认，等待计划"
    });
    updateGptAssistantBubble();
  }
  if (!result?.ok) {
    task._errorCode = String(result?.errorCode || "");
    task._error = result?.detail || result?.error || "自动生产没有完整结束";
    const lowOutput = isLowOutputGptLimitMessage(task._error);
    const retryLimit = isGptRetryLimitSignal(task._error, task);
    const actualLimit = lowOutput || isActualGptLimitMessage(task._error) || retryLimit;
    task._status = actualLimit ? (lowOutput ? "skipped" : "paused") : "failed";
    task._quotaLimit = actualLimit;
    writeGptWindowRuntime(account.id, {
      status: actualLimit ? "waiting-quota" : "failed",
      currentTaskId: task.requestId,
      currentStage: task._stage || "任务失败",
      currentPercent: Number(task._percent || 0),
      generatedImages: Number(result?.detectedImages || result?.actualImages || readGptWindowRuntime(account.id).generatedImages || 0),
      nextProbeAt: actualLimit ? Number(readGptCycleState(task.quotaAccountId || account.id).nextProbeAt || 0) || null : null
    });
    if (actualLimit) recordActualGptLimit(task._error, task.quotaAccountId, lowOutput || retryLimit ? "generation" : inferGptQuotaLimitKind(task, task._error));
    tracker.failed += actualLimit ? 0 : 1;
    appendGptProductionHistory(task, actualLimit ? "paused" : "failed", result, task._error);
    if (actualLimit && task.taskType === "material") {
      await refreshGptAfterProduction(task.quotaAccountId || account.id, "production-limit-signal").catch((error) => {
        showWorkbenchAssistantBubble(`${account.name} 触顶后刷新 GPT 网页失败：${error?.message || "未知错误"}；已保留暂停状态。`, { duration: 0, tone: "warning" });
      });
    }
    persistGptQueue();
    const failure = new Error(`${account.name}：${task._error}`);
    failure.gptLimit = actualLimit;
    failure.lowOutput = lowOutput;
    throw failure;
  }
  task._status = "completed";
  task._percent = 100;
  markGptWindowSetCompleted(account.id);
  writeGptWindowRuntime(account.id, { status: "idle", currentTaskId: "", currentStage: "已完成", currentPercent: 100 });
  appendGptProductionHistory(task, "completed", result);
  tracker.completed += 1;
  persistGptQueue();
  return result;
}

function resetGptTaskForRotation(task, reason = "") {
  if (!task) return;
  const previousRequestId = String(task.requestId || "");
  task.requestId = `gpt-rotate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  task.retryOf = previousRequestId;
  task._rotationAttempts = Number(task._rotationAttempts || 0) + 1;
  task._rotationReason = String(reason || "").slice(0, 240);
  task._status = "queued";
  task._stage = "排队";
  task._percent = 0;
  task._error = "";
  task._errorCode = "";
  task._quotaLimit = false;
  task._quotaSkipped = false;
  task._submittedToGpt = false;
  delete task._endedAt;
  delete task._result;
  delete task.retryFromStage;
  delete task.retryFromPercent;
}

function rotationAccountReady(account, now = Date.now()) {
  const state = readGptCycleState(account?.quotaGroup || account?.id);
  return Number(state.nextProbeAt || 0) <= now;
}

function recordGptSafetyLineCooldown(account, boundary) {
  const quotaAccountId = String(account?.quotaGroup || account?.id || "");
  const state = readGptCycleState(quotaAccountId);
  const windowMs = Math.max(1, Number(boundary?.windowHours || gptAutoSettings.windowHours || 3)) * 60 * 60 * 1000;
  const fallbackProbeAt = Number(state.generationCycleStartAt || 0) + windowMs;
  const nextProbeAt = Math.max(Date.now(), Number(boundary?.nextProbeAt || 0) || fallbackProbeAt || Date.now() + windowMs);
  const nextState = {
    ...state,
    accountId: quotaAccountId,
    nextGenerationProbeAt: nextProbeAt,
    nextProbeAt,
    lastAt: Date.now(),
    message: `本地生图安全线 ${boundary.generated}/${boundary.limit}`
  };
  localStorage.setItem(gptCycleStateKey(quotaAccountId), JSON.stringify(nextState));
  writeGptWindowRuntime(account.id, {
    status: "waiting-quota",
    nextProbeAt,
    currentStage: `安全线 ${boundary.generated}/${boundary.limit}`
  });
  scheduleGptQuotaReminder(new Date(nextProbeAt).toISOString(), quotaAccountId);
  return nextState;
}

function nextRotationAccount(accounts, cursor, blocked = new Set()) {
  if (!accounts.length) return { account: null, cursor };
  const now = Date.now();
  for (let offset = 0; offset < accounts.length; offset += 1) {
    const index = (cursor + offset) % accounts.length;
    const account = accounts[index];
    if (blocked.has(account.id)) continue;
    if (!rotationAccountReady(account, now)) continue;
    return { account, cursor: index };
  }
  return { account: null, cursor };
}

function persistGptRotationRun(patch = {}) {
  return persistGptMultiRun({
    mode: "rotate",
    rotation: true,
    ...patch
  });
}

async function sendRotatingWindowGptTasks(options = {}) {
  if (gptAutoRunning) return;
  const groups = gptTaskGroupsForMultiWindow();
  const pendingTasks = groups.flat();
  if (!pendingTasks.length) return;
  const accounts = availableRotationAccounts();
  if (!accounts.length) {
    gptQueuePaused = true;
    updateGptTestQueueStatus("多账号全自动没有可用的账号窗口；请先保留至少一个可见账号窗口");
    showWorkbenchAssistantBubble("多账号全自动没有可用账号窗口，未上传素材。", { duration: 0, tone: "warning" });
    return;
  }
  const pendingFromQueue = gptQueuePaused && gptTestQueue.length
    ? gptTestQueue.filter((task) => !["completed", "skipped"].includes(task._status))
    : pendingTasks;
  if (!gptQueuePaused || !gptTestQueue.length) {
    gptTestQueue = pendingFromQueue;
    gptTestQueueIndex = 0;
  }
  const tracker = {
    completed: gptTestQueue.filter((task) => task._status === "completed").length,
    failed: gptTestQueue.filter((task) => task._status === "failed").length,
    total: Math.max(1, gptTestQueue.length)
  };
  const cursorStart = Math.max(0, accounts.findIndex((account) => account.id === activeGptAccountId));
  let accountCursor = cursorStart;
  const blockedAccounts = new Set();
  const integrityBoundaryCodes = new Set([
    "WINDOW_STAGE_PENDING",
    "ARCHIVE_CONFIRMATION_TIMEOUT",
    "COMPOSER_DRAFT_PENDING",
    "COMPOSER_ATTACHMENT_CONFLICT",
    "SEND_BUTTON_NOT_READY",
    "ATTACHMENT_UPLOAD_NOT_READY",
    "PLAN_NOT_READY",
    "PLAN_NOT_COMPLETE",
    "PLAN_PARSE_FAILED"
    ,"IMAGE_COUNT_UNCERTAIN"
  ]);
  const templateInitializers = new Map(gptTestQueue.filter((task) => task.taskType === "template-init").map((task) => [task.templateId, task]));
  const onlineTemplates = new Map(selectedGptTestTemplates().filter((template) => template.kind === "online").map((template) => [template.id, template]));
  const readyTemplates = new Set();
  const workerState = Object.fromEntries(accounts.map((account) => [account.id, {
    accountId: account.id,
    accountName: account.name,
    status: "queued",
    currentTask: "",
    completed: 0,
    failed: 0,
    nextProbeAt: null,
    lastError: ""
  }]));
  const runId = String(gptMultiRunState?.runId || `gpt-rotate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  gptAutoRunning = true;
  gptAutoPaused = false;
  gptQueuePaused = false;
  gptQuotaPauseStatus = "";
  persistGptRotationRun({
    version: 1,
    runId,
    startedAt: gptMultiRunState?.startedAt || new Date().toISOString(),
    status: "running",
    accountIds: accounts.map((account) => account.id),
    workerState,
    currentAccountId: accounts[accountCursor]?.id || accounts[0].id,
    pending: gptTestQueue.filter((task) => !["completed", "skipped"].includes(task._status)).map((task) => task.requestId)
  });
  window.gptWorkbench?.setProductionActive?.(true).catch(() => {});
  persistGptQueue();
  updateGptTestQueueStatus(`多账号全自动已启动 · ${accounts.length} 个账号窗口 · 一次只处理一帖`);

  const runInitializerForAccount = async (materialTask, account) => {
    if (!materialTask?.templateId) return;
    const templateKey = `${account.id}:${materialTask.templateId}`;
    if (!TBGptAccountRotation.shouldInitializeTemplate(materialTask, readyTemplates.has(templateKey))) {
      // A submitted material is already inside a trained conversation. On a
      // resumed rotation, treat that conversation as the initialized template
      // for the rest of this run instead of navigating away and uploading the
      // master again before restoring the material checkpoint.
      if (materialTask._submittedToGpt === true) readyTemplates.add(templateKey);
      return;
    }
    const online = onlineTemplates.get(materialTask.templateId);
    if (online?.url) {
      materialTask.navigationUrl = online.url;
      readyTemplates.add(templateKey);
      return;
    }
    const initializer = templateInitializers.get(materialTask.templateId);
    if (!initializer) return;
    const copy = { ...initializer, attachments: [...(initializer.attachments || [])] };
    resetGptTaskForRotation(copy, "为新账号窗口初始化模板");
    copy.taskType = "template-init";
    // Template initialization is an automation-owned fresh post. Clear any
    // human draft or stale attachment left in this account before attaching
    // the template, instead of treating it as a skippable material failure.
    copy.forceUpload = true;
    await runGptTaskOnBrowser(copy, account, tracker);
    readyTemplates.add(templateKey);
    showWorkbenchAssistantBubble(`${account.name} 已完成模板会话初始化，继续处理当前素材。`, { duration: 3600 });
  };

  try {
    while (gptTestQueueIndex < gptTestQueue.length) {
      if (gptAutoPaused) {
        gptQueuePaused = true;
        break;
      }
      const task = gptTestQueue[gptTestQueueIndex];
      if (!task || ["completed", "skipped"].includes(task._status)) {
        gptTestQueueIndex += 1;
        continue;
      }
      const selected = nextRotationAccount(accounts, accountCursor, blockedAccounts);
      if (!selected.account) {
        gptQueuePaused = true;
        const nextProbeAt = accounts.map((account) => Number(readGptCycleState(account.quotaGroup || account.id).nextProbeAt || 0)).filter(Boolean).sort((a, b) => a - b)[0] || 0;
        updateGptTestQueueStatus(nextProbeAt
          ? `所有账号窗口都在等待额度恢复；最早 ${new Date(nextProbeAt).toLocaleString("zh-CN", { hour12: false })} 再探测`
          : "所有账号窗口暂时不可用；已安全暂停多账号全自动，不会继续注入下一帖");
        persistGptRotationRun({ status: "waiting-quota", nextProbeAt: nextProbeAt || null, workerState });
        break;
      }
      accountCursor = selected.cursor;
      const account = selected.account;
      const state = workerState[account.id];
      state.status = "running";
      state.currentTask = task.name || task.requestId;
      if (activeGptAccountId !== account.id) {
        await switchGptAccount(account.id, { silent: true, resumeWindow: false });
      }
      persistGptRotationRun({ workerState, currentAccountId: account.id });
      updateGptTestQueueStatus(`${account.name} 正在处理第 ${gptTestQueueIndex + 1}/${gptTestQueue.length} 帖：${task.name || "当前素材"}`);
      try {
        if (task.taskType === "material") await runInitializerForAccount(task, account);
        await runGptTaskOnBrowser(task, account, tracker);
        if (task.taskType === "material") {
          await refreshGptAfterProduction(account.id, "rotation-production-complete").catch((error) => {
            showWorkbenchAssistantBubble(`${account.name} 本轮已落盘，但 GPT 网页刷新失败：${error?.message || "未知错误"}；继续保留任务状态。`, { duration: 0, tone: "warning" });
          });
          await refreshGptQuota(account.id);
        }
        if (task.taskType === "template-init" && task.templateId) readyTemplates.add(`${account.id}:${task.templateId}`);
        if (task.taskType === "material" && task.templateId) readyTemplates.add(`${account.id}:${task.templateId}`);
        state.completed += 1;
        state.status = "running";
        state.currentTask = "";
        gptTestQueueIndex += 1;
        const quota = gptQuotaSnapshots.get(String(account.id))?.status || null;
        const boundary = TBGptAccountRotation.accountQuotaBoundary(quota || {}, Date.now());
        if (task.taskType === "material" && boundary.reached) {
          const cooldown = recordGptSafetyLineCooldown(account, {
            ...boundary,
            windowHours: quota?.settings?.windowHours
          });
          blockedAccounts.add(account.id);
          state.status = "waiting-quota";
          state.nextProbeAt = cooldown.nextProbeAt;
          accountCursor = (accountCursor + 1) % accounts.length;
          showWorkbenchAssistantBubble(
            `${account.name} 本轮作品已完整归档，近${quota?.settings?.windowHours || 3}小时已生图 ${boundary.generated}/${boundary.limit} 张；现在切换下一个全局轮换账号。`,
            { duration: 5200, tone: "info" }
          );
          persistGptRotationRun({ workerState, currentAccountId: accounts[accountCursor]?.id || accounts[0]?.id });
          persistGptQueue();
          continue;
        }
        // Rotation is quota-driven, not round-robin: keep using this account
        // until the web page reports a real limit or low-output probe.
        persistGptRotationRun({ workerState, currentAccountId: account.id });
        persistGptQueue();
      } catch (error) {
        const message = String(task._error || error?.message || "未知错误");
        state.lastError = message.slice(0, 500);
        state.currentTask = "";
        if (error?.gptLimit || isActualGptLimitMessage(message)) {
          blockedAccounts.add(account.id);
          const quotaState = readGptCycleState(task.quotaAccountId || account.quotaGroup || account.id);
          state.status = "waiting-quota";
          state.nextProbeAt = Number(quotaState.nextProbeAt || 0) || null;
          resetGptTaskForRotation(task, message);
          accountCursor = (accountCursor + 1) % accounts.length;
          const next = nextRotationAccount(accounts, accountCursor, blockedAccounts);
          if (next.account) {
            showWorkbenchAssistantBubble(`${account.name} 已触达真实限额，切换到 ${next.account.name}；当前帖子不会丢失。`, { duration: 0, tone: "warning" });
            persistGptRotationRun({ workerState, currentAccountId: next.account.id });
            continue;
          }
          gptQueuePaused = true;
          const nextProbeAt = accounts.map((item) => Number(readGptCycleState(item.quotaGroup || item.id).nextProbeAt || 0)).filter(Boolean).sort((a, b) => a - b)[0] || 0;
          persistGptRotationRun({ status: "waiting-quota", nextProbeAt: nextProbeAt || null, workerState });
          updateGptTestQueueStatus(nextProbeAt
            ? `所有账号窗口已触顶；最早 ${new Date(nextProbeAt).toLocaleString("zh-CN", { hour12: false })} 自动探测`
            : "所有账号窗口已触顶；轮换已暂停，等待下一次真实额度探测");
          break;
        }
        if (integrityBoundaryCodes.has(String(task._errorCode || error?.code || ""))) {
          state.status = "paused";
          task._status = "paused";
          gptQueuePaused = true;
          gptAutoPaused = true;
          persistGptRotationRun({
            status: "paused-integrity-boundary",
            currentAccountId: account.id,
            workerState,
            pending: gptTestQueue.filter((item) => !["completed", "skipped"].includes(item._status)).map((item) => item.requestId)
          });
          persistGptQueue();
          updateGptTestQueueStatus(`${account.name} 当前窗口需要先清理输入框；全局轮换已停在当前帖子，不会跳过或上传下一套`);
          showWorkbenchAssistantBubble(`${account.name} 当前窗口存在未发送内容；已停在当前帖子，清理后可继续，不会丢素材。`, { duration: 0, tone: "warning" });
          break;
        }
        state.status = "failed";
        state.failed += 1;
        task._status = "skipped";
        gptTestQueueIndex += 1;
        showWorkbenchAssistantBubble(`${task.name || "当前素材"} 失败，已跳过并继续多账号全自动下一帖。`, { duration: 4200, tone: "warning" });
        persistGptQueue();
      }
    }
    const pending = gptTestQueue.filter((task) => !["completed", "skipped"].includes(task._status));
    if (!gptAutoPaused && !pending.length) {
      gptQueuePaused = false;
      persistGptRotationRun({ status: "completed", completed: tracker.completed, failed: tracker.failed, workerState, finishedAt: new Date().toISOString(), pending: [] });
      updateGptTestQueueStatus(`多账号全自动完成：成功 ${tracker.completed} 套，失败/跳过 ${tracker.failed} 套`);
    } else if (gptAutoPaused) {
      persistGptRotationRun({ status: "paused", workerState, pending: pending.map((task) => task.requestId) });
    }
  } finally {
    gptAutoRunning = false;
    window.gptWorkbench?.setProductionActive?.(false).catch(() => {});
    persistGptQueue();
    updateGptTestQueueStatus();
    refreshGptQuota();
    if (isContinuousGptProductionArmed() && !gptAutoPaused && !gptQueuePaused) scheduleContinuousGptProduction();
    clearGptMultiRunIfFinished();
  }
}

async function sendMultiWindowGptTasks(options = {}) {
  if (gptAutoRunning) return;
  const groups = gptTaskGroupsForMultiWindow();
  if (!groups.length) return;
  const allowedAccountIds = new Set(options.allowedAccountIds || []);
  const configuredAccounts = availableMultiWindowAccounts();
  const visibleAccounts = configuredAccounts.filter((account) => !allowedAccountIds.size || allowedAccountIds.has(account.id));
  const workerCount = Math.max(1, Math.min(
    Number(gptAutoSettings.parallelWorkers || 3),
    Number(gptAutoSettings.maximumWorkers || 5),
    visibleAccounts.length
  ));
  const workers = visibleAccounts.slice(0, workerCount);
  const allTasks = groups.flat();
  const existingCompleted = gptQueuePaused ? gptTestQueue.filter((task) => ["completed", "skipped"].includes(task._status)).length : 0;
  const tracker = { completed: existingCompleted, failed: 0, total: Math.max(1, gptQueuePaused ? gptTestQueue.length : allTasks.length) };
  const pendingGroups = groups.map((group, index) => ({ group, index }));
  if (!gptQueuePaused) {
    gptTestQueue = allTasks;
    gptTestQueueIndex = 0;
  }
  gptAutoRunning = true;
  gptAutoPaused = false;
  gptQueuePaused = false;
  const runId = String(gptMultiRunState?.runId || `gpt-multi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const workerState = Object.fromEntries(workers.map((account) => [account.id, {
    accountId: account.id,
    accountName: account.name,
    status: "running",
    currentTask: "",
    completed: 0,
    failed: 0,
    nextProbeAt: null,
    lastError: ""
  }]));
  persistGptMultiRun({
    version: 1,
    runId,
    mode: gptAutoSettings.mode,
    startedAt: gptMultiRunState?.startedAt || new Date().toISOString(),
    status: "running",
    accountIds: workers.map((account) => account.id),
    workerState,
    pending: gptTestQueue.filter((task) => !["completed", "skipped"].includes(task._status)).map((task) => task.requestId)
  });
  window.gptWorkbench?.setProductionActive?.(true).catch(() => {});
  persistGptQueue();
  updateGptTestQueueStatus(`多账号全自动已启动 · ${workers.length} 个账号窗口 · ${gptProductionWorkCount()} 个作品`);
  const runWorker = async (account) => {
    const state = workerState[account.id];
    while (!gptAutoPaused) {
      let claimIndex = pendingGroups.findIndex(({ group }) => {
        const preferredAccountId = String(group.find((task) => task.preferredAccountId)?.preferredAccountId || "");
        return preferredAccountId === account.id;
      });
      if (claimIndex < 0) {
        claimIndex = pendingGroups.findIndex(({ group }) => !group.some((task) => task.preferredAccountId));
      }
      if (claimIndex < 0) {
        state.status = "idle";
        state.currentTask = "";
        persistGptMultiRun({ workerState });
        return;
      }
      const [{ group }] = pendingGroups.splice(claimIndex, 1);
      for (let taskIndex = 0; taskIndex < group.length; taskIndex += 1) {
        const task = group[taskIndex];
        if (gptAutoPaused) {
          pendingGroups.unshift({ group: group.slice(taskIndex), index: Date.now() });
          state.status = "paused";
          persistGptMultiRun({ workerState });
          return;
        }
        state.status = "running";
        state.currentTask = task.name || task.requestId;
        persistGptMultiRun({ workerState });
        try {
          await runGptTaskOnBrowser(task, account, tracker);
          if (task.taskType === "material") {
            await refreshGptAfterProduction(account.id, "multi-production-complete").catch((error) => {
              showWorkbenchAssistantBubble(`${account.name} 本轮已落盘，但 GPT 网页刷新失败：${error?.message || "未知错误"}；继续保留任务状态。`, { duration: 0, tone: "warning" });
            });
          }
          state.completed += 1;
          state.currentTask = "";
          const nextPending = gptTestQueue.findIndex((item) => !["completed", "skipped"].includes(item._status));
          gptTestQueueIndex = nextPending < 0 ? gptTestQueue.length : nextPending;
          persistGptMultiRun({
            workerState,
            pending: gptTestQueue.filter((item) => !["completed", "skipped"].includes(item._status)).map((item) => item.requestId)
          });
          persistGptQueue();
        } catch (error) {
          gptLastFailedTask = task;
          gptLastFailedStage = task._stage || "";
          gptLastFailedPercent = task._percent || 0;
          state.lastError = String(task._error || error.message || "未知错误");
          state.currentTask = "";
        if (error?.gptLimit || isActualGptLimitMessage(String(task._error || error.message || "")) || isGptRetryLimitSignal(String(task._error || error.message || ""), task)) {
            const quotaState = readGptCycleState(task.quotaAccountId || account.quotaGroup || account.id);
            state.status = "waiting-quota";
            state.nextProbeAt = Number(quotaState.nextProbeAt || 0) || null;
            if (taskIndex + 1 < group.length) {
              // Keep the template/material remainder in the queue. The
              // account is paused, but the other account may still claim it.
              pendingGroups.unshift({ group: group.slice(taskIndex + 1), index: Date.now() });
            }
            showWorkbenchAssistantBubble(`${account.name} 已触发真实限额/低产出信号，暂停该账号；其他账号继续，一帖不会混入下一帖。`, { duration: 0, tone: "warning" });
            persistGptMultiRun({ workerState, pending: pendingGroups.flatMap(({ group: next }) => next).map((item) => item.requestId) });
            return;
          }
          state.status = "failed";
          state.failed += 1;
          const boundaryConflict = [
            "COMPOSER_ATTACHMENTS_PENDING",
            "COMPOSER_DRAFT_PENDING",
            "COMPOSER_DRAFT_NOT_SET",
            "MIXED_POST_ATTACHMENTS",
            "MATERIAL_ROOT_MISSING",
            "COMPOSER_ATTACHMENT_CONFLICT",
            "LOCAL_BRIDGE_FETCH_FAILED",
            "ATTACHMENT_UPLOAD_NOT_READY",
            "WINDOW_STAGE_PENDING",
            "WEB_RESPONSE_IN_FLIGHT",
            "IMAGE_COUNT_UNCERTAIN",
            "PLAN_PARSE_FAILED",
            "PLAN_NOT_READY",
            "PLAN_NOT_COMPLETE",
            "GENERATION_LIMIT_SIGNAL",
            "SCRIPT_GENERATED_OUTPUT",
            "COPY_REQUIRED"
          ].includes(String(task._errorCode || ""))
            || /未发送附件|未发送文字|重复粘贴提示词|没有接收到本轮提示词|输入框没有接收到|不属于当前帖子文件夹|混合上传|缺少帖子文件夹路径|上一帖仍在生成|已阻止下一帖注入|文案 TXT|代码解释器|脚本文件输出/.test(String(task._error || error.message || ""));
          if (boundaryConflict) {
            // A composer boundary belongs to this account window, not to the
            // whole batch. Park this worker and leave every remaining post
            // queued for the next safe retry; never burn through the queue
            // against a stale unsent draft.
            state.status = "paused";
            if (taskIndex + 1 < group.length) {
              pendingGroups.unshift({ group: group.slice(taskIndex + 1), index: Date.now() });
            }
            showWorkbenchAssistantBubble(`${account.name} 的 GPT 输入框有未发送内容，已暂停该账号窗口；其他账号继续。清理后可从当前帖重试。`, { duration: 0, tone: "warning" });
            persistGptMultiRun({ workerState, pending: pendingGroups.flatMap(({ group: next }) => next).map((item) => item.requestId) });
            return;
          }
          showWorkbenchAssistantBubble(`${task.name}生产失败并已记录；正在继续下一个素材。`, { duration: 0 });
          // A non-limit failure skips only this post. Any remaining tasks in a
          // template group are returned to the queue instead of disappearing.
          if (taskIndex + 1 < group.length) pendingGroups.unshift({ group: group.slice(taskIndex + 1), index: Date.now() });
        }
      }
    }
    state.status = "paused";
    persistGptMultiRun({ workerState });
  };
  try {
    await Promise.all(workers.map(runWorker));
    const pending = pendingGroups.flatMap(({ group }) => group).filter((task) => !["completed", "skipped"].includes(task._status));
    gptQueuePaused = pending.length > 0;
    gptTestQueueIndex = gptTestQueue.findIndex((task) => !["completed", "skipped"].includes(task._status));
    if (gptTestQueueIndex < 0) gptTestQueueIndex = gptTestQueue.length;
    updateGptTestQueueStatus(gptAutoPaused
      ? `多账号全自动队列已暂停 · 完成 ${tracker.completed} · 失败 ${tracker.failed}`
      : pending.length
        ? `多账号全自动部分完成 · 成功 ${tracker.completed} · 等待 ${pending.length} 套`
        : `多账号全自动队列完成 · 成功 ${tracker.completed} · 失败 ${tracker.failed}`);
    persistGptMultiRun({
      status: gptAutoPaused ? "paused" : pending.length ? "waiting-quota" : "completed",
      workerState,
      completed: tracker.completed,
      failed: tracker.failed,
      pending: pending.map((task) => task.requestId),
      finishedAt: pending.length ? null : new Date().toISOString()
    });
  } finally {
    gptAutoRunning = false;
    window.gptWorkbench?.setProductionActive?.(false).catch(() => {});
    persistGptQueue();
    updateGptTestQueueStatus();
    refreshGptQuota();
    if (isContinuousGptProductionArmed() && !gptAutoPaused) scheduleContinuousGptProduction();
    clearGptMultiRunIfFinished();
  }
}

async function sendNextGptTestTask(options = {}) {
  if (!window.gptWorkbench?.available || gptAutoRunning) return;
  const requestedAccountId = String(options.accountId || activeGptAccountId);
  // Block automation modes from driving disabled account windows. Manual and
  // user-initiated semi-auto runs are still allowed on disabled accounts.
  const runAccount = gptAccounts.find((item) => item.id === requestedAccountId);
  if (runAccount?.disabled && isContinuousGptMode(normalizeGptProductionMode(gptAutoSettings.mode)) && !options.userInitiated) return;
  if (gptWindowIsUserStopped(requestedAccountId) && !options.userInitiated) return;
  if (gptWindowIsUserPaused(requestedAccountId) && !options.userInitiated && !options.quotaProbe) return;
  if (isRotatingGptMode()) return sendRotatingWindowGptTasks(options);
  // Legacy "multi" mode now normalized to "rotate"; multi-window dispatch
  // is handled by sendRotatingWindowGptTasks above.
  if (isContinuousGptMode() && options.userInitiated) {
    setContinuousGptProductionArmed(true);
  }
  if (!gptTestQueue.length || gptTestQueueIndex >= gptTestQueue.length) {
    gptTestQueue = buildGptProductionQueue();
    gptTestQueueIndex = 0;
    persistGptQueue();
  }
  if (!gptTestQueue.length) return;
  const resuming = gptQueuePaused && gptTestQueueIndex < gptTestQueue.length;
  const runAccountId = requestedAccountId;
  if (runAccountId !== activeGptAccountId && !options.allowWindowSwitch) return;
  const runAccountName = gptAccounts.find((item) => item.id === runAccountId)?.name || "当前账号窗口";
  const preflight = await window.gptWorkbench.status(runAccountId).catch(() => null);
  if (!preflight?.productionReady) {
    const reason = preflight?.authenticationRequired
      ? `${runAccountName}需要先完成登录或验证码；本次没有上传任何素材`
      : !preflight?.composerReady
        ? `${runAccountName}当前不是可输入的 GPT 对话；本次没有上传任何素材`
        : `${runAccountName}的生产助手尚未就绪；本次没有上传任何素材`;
    updateGptTestQueueStatus(reason);
    // Auto-retry: if in continuous mode, wait 30s and retry up to 3 times
    // before giving up and pausing the queue.
    if (isContinuousGptMode() && isContinuousGptProductionArmed() && !gptProductionRetryTimer) {
      gptQueuePaused = false;
      persistGptQueue();
      scheduleGptProductionRetry(runAccountId, 1);
      showWorkbenchAssistantBubble(reason + "；正在自动重试...", { duration: 0, tone: "info" });
      return;
    }
    gptQueuePaused = true;
    persistGptQueue();
    showWorkbenchAssistantBubble(reason, { duration: 0, tone: "warning" });
    return;
  }
  const button = $("#gptTestSendBtn");
  const progressBar = $("#gptAutoProgressBar");
  gptAutoRunning = true;
  gptAutoPaused = false;
  gptQueuePaused = false;
  gptQuotaPauseStatus = "";
  writeGptWindowRuntime(runAccountId, { status: "running", stoppedByUser: false, currentStage: "准备生产", currentPercent: 0 });
  window.gptWorkbench?.setProductionActive?.(true).catch(() => {});
  persistGptQueue();
  button.disabled = true;
    const normalizedMode = normalizeGptProductionMode(gptAutoSettings.mode);
    const manualMode = normalizedMode === "manual";
    const runModeLabel = GPT_MODE_DEFINITIONS[normalizedMode]?.label || "人工控制";
    updateGptTestQueueStatus(`${runModeLabel} · ${runAccountName} · ${gptProductionWorkCount()} 个作品`);
  let completedThisRun = 0;
  let failedThisRun = 0;
  let quotaPausedTask = null;
  let pendingSingleAccountHandoff = "";
  try {
    while (gptTestQueueIndex < gptTestQueue.length) {
      if (gptAutoPaused) throw new Error("已由用户暂停；可以继续剩余队列");
      const accountLimit = Math.max(1, Number(gptAutoSettings.accountTaskLimit || 8));
      if (!manualMode && normalizeGptProductionMode(gptAutoSettings.mode) === "multi" && completedThisRun >= accountLimit) {
        throw new Error(`已完成本轮 ${accountLimit} 套上限；点击“继续自动生产”后从第 ${gptTestQueueIndex + 1} 套续跑`);
      }
      const task = gptTestQueue[gptTestQueueIndex];
      hydrateGptTaskFromMaterialTree(task);
      task._startedAt ||= new Date().toISOString();
      gptLastFailedStage = "";
      gptLastFailedPercent = 0;
      const reattachOnResume = resuming && shouldReattachGptTaskOnResume(task);
      if (reattachOnResume) {
        task.retryFromStage = "";
        task.retryFromPercent = 0;
        task.forceUpload = true;
      } else if (resuming && task._stage && task._status !== "completed") {
        task.retryFromStage = task._stage;
        task.retryFromPercent = Number(task._percent || 0);
        task.forceUpload = false;
      }
      task.accountId = runAccountId;
      task.autoRun = !manualMode;
      task.autoOptions = { ...gptAutoSettings };
      if (!manualMode) await ensureGptTaskQuota(task, runAccountId, {
        // Single-window production is intentionally user-driven: the local
        // quota ledger is a warning only. A real web limit still pauses in
        // the extension, while multi-window keeps its conservative gate.
        allowManualOverride: gptAutoSettings.mode !== "multi" || Boolean(options.allowQuotaOverride)
      });
      if (task.navigationUrl) {
        await navigateEmbeddedGpt("url", task.navigationUrl, runAccountId);
        await new Promise((resolve) => setTimeout(resolve, 1800));
      } else if (task.navigation === "new-chat") {
        await navigateEmbeddedGpt("new-chat");
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      let polling = true;
      const poll = async () => {
        while (polling) {
          const status = await window.gptWorkbench.workflowStatus(runAccountId).catch(() => null);
          if (status?.requestId === task.requestId) {
            gptLastFailedStage = String(status.stage || "");
            gptLastFailedPercent = Number(status.percent || 0);
            task._stage = gptLastFailedStage;
            task._percent = gptLastFailedPercent;
            const runtime = readGptWindowRuntime(runAccountId);
            writeGptWindowRuntime(runAccountId, {
              status: "running",
              currentTaskId: task.requestId,
              currentStage: gptLastFailedStage,
              currentPercent: gptLastFailedPercent,
              uploadedAttachments: Number(status.uploadedAttachments || runtime.uploadedAttachments || 0),
              expectedImages: Number(status.expectedImages || runtime.expectedImages || 0),
              generatedImages: Number(status.generatedImages || status.actualImages || runtime.generatedImages || 0)
            });
            if (/生成|图片|生图/i.test(task._stage)) recordGptQuotaConsumption(task, runAccountId, "generation");
            task._status = "running";
            persistGptQueue();
            const overall = Math.round(((gptTestQueueIndex + Number(status.percent || 0) / 100) / gptTestQueue.length) * 100);
            if (progressBar) progressBar.style.width = `${overall}%`;
            updateGptTestQueueStatus(`第 ${gptTestQueueIndex + 1}/${gptTestQueue.length} 套 · ${status.stage || "处理中"} ${status.percent || 0}%${status.detail ? ` · ${status.detail}` : ""}`);
          }
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      };
      const pollingTask = poll();
      let result;
      let uploadImages = 0;
      try {
        task._submittedToGpt = true;
        uploadImages = (task.attachments || []).filter((filePath) => /\.(?:png|jpe?g|webp|gif|bmp)$/i.test(String(filePath || ""))).length;
        recordGptQuotaConsumption(task, runAccountId, "upload");
        markGptWindowSetStarted(runAccountId);
        writeGptWindowRuntime(runAccountId, {
          status: "running",
          currentTaskId: task.requestId,
          currentStage: "上传附件",
          currentPercent: 5,
          expectedAttachments: uploadImages,
          uploadedAttachments: 0
        });
        showWorkbenchAssistantBubble(`${runAccountName} 已上传本帖 ${uploadImages} 张图片，等待 GPT 出计划。`, { duration: 3600 });
        persistGptQueue();
        // Semi-auto mode: pass autoConfirm=false so the extension stops after
        // the plan is generated, waiting for the user to review and confirm.
        if (isSemiAutoGptMode() && !task._semiAutoResume) {
          task.autoOptions = { ...gptAutoSettings, autoConfirm: false };
        } else {
          task.autoOptions = { ...gptAutoSettings };
        }
        result = await window.gptWorkbench.sendTask(task);
      } finally {
        polling = false;
        await pollingTask;
      }
      if (result?.ok !== false) {
        const confirmedUploads = Number(result?.fileCount || result?.uploadedFiles || uploadImages || 0);
        writeGptWindowRuntime(runAccountId, {
          uploadedAttachments: confirmedUploads,
          expectedAttachments: uploadImages,
          currentStage: "附件已确认，等待计划"
        });
        showWorkbenchAssistantBubble(`${runAccountName} 已确认收到 ${confirmedUploads}/${uploadImages} 张图片，正在等待计划。`, { duration: 3600 });
      }
      // Semi-auto: extension returned plannedOnly after generating the plan.
      // Pause the queue and wait for the user to click "确认继续出图".
      if (result?.plannedOnly && isSemiAutoGptMode() && !task._semiAutoResume) {
        gptSemiAutoPendingTask = task;
        task._status = "paused";
        task._stage = "计划已完成，等待人工确认";
        task._percent = 30;
        gptQueuePaused = true;
        gptAutoPaused = true;
        writeGptWindowRuntime(runAccountId, {
          status: "paused",
          currentStage: "计划已完成，等待确认",
          currentPercent: 30
        });
        persistGptQueue();
        showWorkbenchAssistantBubble(`${task.name} 的迁移计划已完成。请审核计划，确认无误后点击"确认继续出图"继续自动出图、文案和打包。`, { duration: 0, persistent: true, tone: "info" });
        updateGptTestQueueStatus(`第 ${gptTestQueueIndex + 1}/${gptTestQueue.length} 套 · 迁移计划已完成，请审核后点击"确认继续出图"`);
        throw new Error("半自动：计划已完成，等待人工确认");
      }
      if (!result?.ok) {
        gptLastFailedStage = String(result?.stage || gptLastFailedStage || "");
        gptLastFailedPercent = Number(result?.percent || gptLastFailedPercent || 0);
        const taskError = new Error(result?.detail || result?.error || "自动生产没有完整结束");
        const boundaryConflict = ["COMPOSER_ATTACHMENTS_PENDING", "COMPOSER_DRAFT_PENDING", "COMPOSER_DRAFT_NOT_SET", "COMPOSER_ATTACHMENT_CONFLICT", "LOCAL_BRIDGE_FETCH_FAILED", "ATTACHMENT_UPLOAD_NOT_READY", "MIXED_POST_ATTACHMENTS", "MATERIAL_ROOT_MISSING", "IMAGE_COUNT_UNCERTAIN", "PLAN_PARSE_FAILED", "PLAN_NOT_READY", "PLAN_NOT_COMPLETE", "WINDOW_STAGE_PENDING", "WEB_RESPONSE_IN_FLIGHT", "GENERATION_LIMIT_SIGNAL", "SCRIPT_GENERATED_OUTPUT", "COPY_REQUIRED"].includes(String(result?.errorCode || ""))
          || /未发送附件|未发送文字|重复粘贴提示词|没有接收到本轮提示词|输入框没有接收到|不属于当前帖子文件夹|混合上传|缺少帖子文件夹路径|上一帖仍在生成|已阻止下一帖注入|文案 TXT|代码解释器|脚本文件输出/.test(taskError.message);
        if (await recoverContinuousPlanFailure(task, result, runAccountId)) {
          continue;
        }
        task._stage = gptLastFailedStage;
        task._percent = gptLastFailedPercent;
        task._error = taskError.message;
        const lowOutputLimit = isLowOutputGptLimitMessage(taskError.message);
        const retryLimit = isGptRetryLimitSignal(taskError.message, task);
        const actualLimit = lowOutputLimit || isActualGptLimitMessage(taskError.message) || retryLimit;
        writeGptWindowRuntime(runAccountId, {
          status: actualLimit ? "waiting-quota" : "failed",
          currentTaskId: task.requestId,
          currentStage: gptLastFailedStage || task._stage || "任务失败",
          currentPercent: gptLastFailedPercent,
          generatedImages: Number(result?.detectedImages || result?.actualImages || readGptWindowRuntime(runAccountId).generatedImages || 0),
          nextProbeAt: actualLimit ? Number(readGptCycleState(runAccountId).nextProbeAt || 0) || null : null
        });
        task._status = actualLimit ? "paused" : "failed";
        appendGptProductionHistory(task, actualLimit ? "paused" : "failed", result, task._error);
        persistGptQueue();
        failedThisRun += 1;
        if (boundaryConflict) {
          // This is a queue-integrity failure, not a bad material. Retain the
          // current index so the exact post can be retried after the composer
          // has been made safe. Never advance and stack another post.
          task._status = "paused";
          task._errorCode = String(result?.errorCode || "COMPOSER_ATTACHMENT_CONFLICT");
          gptQueuePaused = true;
          gptAutoPaused = true;
          persistGptQueue();
          throw new Error(`${taskError.message}；已暂停整批，清理输入框后从当前帖子继续`);
        }
        if (actualLimit) {
          // A low-output result is not worth continuing. Keep its history,
          // skip it, and probe the next fresh material after the cycle window.
          gptQueuePaused = true;
          quotaPausedTask = task;
          task._status = lowOutputLimit ? "failed" : "paused";
          task._endedAt = new Date().toISOString();
          task._quotaSkipped = lowOutputLimit;
          task._error = lowOutputLimit
            ? `${taskError.message}；已识别为触顶征兆，当前素材跳过，本批暂停，不继续发送后续素材`
            : taskError.message;
          recordActualGptLimit(task._error, runAccountId, lowOutputLimit || retryLimit ? "generation" : inferGptQuotaLimitKind(task, taskError.message));
          await refreshGptAfterProduction(runAccountId, "production-limit-signal").catch((error) => {
            showWorkbenchAssistantBubble(`触顶后刷新 GPT 网页失败：${error?.message || "未知错误"}；已保留暂停状态。`, { duration: 0, tone: "warning" });
          });
          if (lowOutputLimit) gptTestQueueIndex += 1;
          persistGptQueue();
          const detectedLowOutputCount = Number(taskError.message.match(/(?:只检测到|完整回复只有)\s*(\d+)/)?.[1] || result?.detectedImages || 0);
          throw new Error(lowOutputLimit
            ? `本轮只生成 ${Math.max(0, detectedLowOutputCount)} 张，低于安全线；已暂停本批，等待下一轮额度探测`
            : taskError.message);
        }
        gptTestQueueIndex += 1;
        persistGptQueue();
        updateGptTestQueueStatus(`第 ${gptTestQueueIndex} 套失败并已记录：${taskError.message}；继续下一套`);
        continue;
      }
      gptLastFailedTask = null;
      if (manualMode) {
        gptCurrentManualTask = task;
        updateGptTestQueueStatus(`附件与提示词已准备：${task.name}。请在 GPT 中手动发送；完成后点“完成当前，上传下一套”。`);
        break;
      }
      gptTestQueueIndex += 1;
      task._status = "completed";
      task._percent = 100;
      task._error = "";
      delete task._errorCode;
      markGptWindowSetCompleted(runAccountId);
      writeGptWindowRuntime(runAccountId, { status: "idle", currentTaskId: "", currentStage: "已完成", currentPercent: 100 });
      appendGptProductionHistory(task, "completed", result);
      if (task.taskType === "material") {
        await refreshGptAfterProduction(runAccountId, "production-complete").catch((error) => {
          showWorkbenchAssistantBubble(`本轮已落盘，但 GPT 网页刷新失败：${error?.message || "未知错误"}；已保留队列状态。`, { duration: 0, tone: "warning" });
        });
      }
      persistGptQueue();
      if (task.taskType === "material") completedThisRun += 1;
      if (progressBar) progressBar.style.width = `${Math.round(gptTestQueueIndex / gptTestQueue.length * 100)}%`;
      const completionLabel = task.taskType === "template-init"
        ? "母版会话已初始化"
        : gptAutoSettings.autoConfirm === false
        ? "迁移计划已生成"
        : gptAutoSettings.autoCopy === false
          ? "套图已下载"
          : gptAutoSettings.autoPackage === false
            ? "套图已下载、文案已复制"
            : "图片、TXT 和作品包已核对落盘";
      const completedNotice = `${task.name} 已完成：${completionLabel}${result?.packagePath ? " · 点击“查看生产记录”可直接打开成品文件夹" : ""}`;
      updateGptTestQueueStatus(gptTestQueueIndex < gptTestQueue.length
        ? `第 ${gptTestQueueIndex} 套${completionLabel}，继续下一套`
        : failedThisRun
          ? `本轮结束：成功 ${completedThisRun} 套，失败 ${failedThisRun} 套`
          : completedNotice);
      if (normalizeGptProductionMode(gptAutoSettings.mode) === "single"
        && activeGptAccountId !== runAccountId
        && gptTestQueueIndex < gptTestQueue.length) {
        pendingSingleAccountHandoff = activeGptAccountId;
        updateGptTestQueueStatus(`当前作品已在 ${runAccountName} 安全完成；下一帖切换到手动选中的账号窗口。`);
        break;
      }
      if (gptTestQueueIndex < gptTestQueue.length && task.taskType === "material") {
        const minDelay = Math.max(5, Number(gptAutoSettings.minDelaySeconds || 25));
        const maxDelay = Math.max(minDelay, Number(gptAutoSettings.maxDelaySeconds || 55));
        const delaySeconds = Math.round(minDelay + Math.random() * (maxDelay - minDelay));
        updateGptTestQueueStatus(`第 ${gptTestQueueIndex} 套已完成；稳定等待 ${delaySeconds} 秒后继续下一套`);
        await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
      }
    }
  } catch (error) {
    // Semi-auto pause is not a failure — the plan was generated successfully
    // and the queue is waiting for the user to confirm.  Skip the failure
    // path so no "自动生产已暂停" alarm or retry button appears.
    const isSemiAutoPause = Boolean(gptSemiAutoPendingTask)
      && /半自动.*等待人工确认/.test(String(error?.message || ""));
    if (isSemiAutoPause) {
      gptAutoRunning = false;
      button.disabled = false;
      updateGptTestQueueStatus(`第 ${gptTestQueueIndex + 1}/${gptTestQueue.length} 套 · 迁移计划已完成，请审核后点击"确认继续出图"`);
      return;
    }
    const localQuotaBoundary = error?.code === "LOCAL_QUOTA_BOUNDARY";
    gptLastFailedTask = quotaPausedTask || gptTestQueue[gptTestQueueIndex] || null;
    gptQueuePaused = true;
    const failedTask = quotaPausedTask || gptTestQueue[gptTestQueueIndex];
    if (!quotaPausedTask && failedTask && failedTask._status !== "completed") {
      failedTask._stage = localQuotaBoundary ? "等待额度恢复" : (gptLastFailedStage || failedTask._stage || "任务暂停");
      failedTask._percent = Number(gptLastFailedPercent || failedTask._percent || 0);
      failedTask._error = String(error?.message || failedTask._error || "自动生产已暂停");
      if (localQuotaBoundary) {
        failedTask._errorCode = error.code;
        failedTask._submittedToGpt = false;
      }
      failedTask._status = "paused";
    }
    if (!quotaPausedTask && isActualGptLimitMessage(error?.message)) {
      recordActualGptLimit(error.message, runAccountId, inferGptQuotaLimitKind(failedTask, error?.message));
    }
    persistGptQueue();
    if (quotaPausedTask) {
      const quotaAccountId = quotaPausedTask.quotaAccountId || activeGptAccountId;
      const quotaState = readGptCycleState(quotaAccountId);
      const probeText = formatGptQuotaProbeTime(quotaState.nextProbeAt);
      const accountName = gptAccounts.find((item) => item.id === quotaAccountId || item.quotaGroup === quotaAccountId)?.name || "当前账号窗口";
      gptQuotaPauseStatus ||= `${accountName}已触发额度/低产出上限；当前批次已安全停住，${probeText}自动重新探测。`;
      updateGptTestQueueStatus(gptQuotaPauseStatus);
    } else {
      updateGptTestQueueStatus(`第 ${gptTestQueueIndex + 1} 套已暂停：${error.message}`);
    }
    if (localQuotaBoundary) {
      const probeText = formatGptQuotaProbeTime(error.nextProbeAt);
      gptQuotaPauseStatus = `${runAccountName}已在作品边界安全停住；${probeText}自动重新探测。`;
      updateGptTestQueueStatus(gptQuotaPauseStatus);
      showWorkbenchAssistantBubble(gptQuotaPauseStatus, { duration: 0, persistent: true, tone: "warning" });
    } else if (String(error.message || "").includes("用户暂停") || resuming) {
      showWorkbenchAssistantBubble(`已暂停在第 ${gptTestQueueIndex + 1} 套；可以点击“继续自动生产”恢复。`);
    } else {
      showSystemNotice("自动生产已暂停", `${error.message}\n已完成的作品不会重复生成，处理当前问题后可继续。`, { tone: "danger" });
      // In a continuous window, transient bridge/page readiness faults are
      // operational interruptions, not material failures.  Keep the exact
      // task checkpoint and retry it automatically.  Integrity, quota and
      // low-output signals remain stopped for manual inspection/probing.
      if (isContinuousGptMode()
        && !currentGptQueueIntegrityBlock()
        && isTransientGptWindowFailure(error?.message || gptLastFailedTask?._error || "")
        && !gptWindowIsUserStopped(runAccountId)
        && !gptWindowIsUserPaused(runAccountId)
        && isContinuousGptProductionArmed()) {
        scheduleGptWindowRetry(runAccountId, 15_000, "网页/桥接临时失败");
      }
    }
  } finally {
    gptAutoRunning = false;
    gptAutoPaused = false;
    button.disabled = false;
    window.gptWorkbench?.setProductionActive?.(false).catch(() => {});
    persistGptQueue();
    updateGptTestQueueStatus();
    refreshGptQuota();
    if (pendingSingleAccountHandoff && isContinuousGptProductionArmed() && !gptQueuePaused) {
      const handoffAccountId = pendingSingleAccountHandoff;
      setTimeout(() => {
        reconcileGptWindow(handoffAccountId, { force: true }).catch(() => {});
      }, 0);
    }
    const finalRuntime = readGptWindowRuntime(runAccountId);
    if (!finalRuntime.stoppedByUser && !finalRuntime.pausedByUser && finalRuntime.status === "running") {
      writeGptWindowRuntime(runAccountId, { status: gptQueuePaused ? "waiting-quota" : "idle" });
    }
    if (isContinuousGptProductionArmed() && !gptQueuePaused && gptTestQueueIndex >= gptTestQueue.length) {
      scheduleContinuousGptProduction();
    }
  }
}

function retryCurrentGptTask() {
  if (gptAutoRunning || !gptLastFailedTask) return;
  const failedTask = gptLastFailedTask;
  const previousRequestId = failedTask.requestId;
  const failureText = `${gptLastFailedStage || ""} ${failedTask._error || failedTask.error || ""}`;
  const planParseBoundary = Boolean(failedTask.workflow?.planSubmitted)
    || ["PLAN_PARSE_FAILED", "PLAN_NOT_READY", "PLAN_NOT_COMPLETE"].includes(String(failedTask._errorCode || ""))
    || /迁移计划已返回.*(?:解析|页数)/i.test(failureText);
  const requiresFreshUpload = /没有检测到新消息|发送按钮已出现|未发送附件|输入框仍有|没有接收到本轮提示词|输入框没有接收到|残留|上一帖|composer|COMPOSER|附件上传|附件尚未全部就绪|ATTACHMENT_UPLOAD_NOT_READY|Failed to fetch|本地工作台连接失败|LOCAL_BRIDGE_FETCH_FAILED|WEB_RESPONSE_IN_FLIGHT|WINDOW_STAGE_PENDING/i.test(failureText);
  failedTask.requestId = `gpt-retry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  failedTask.retryOf = previousRequestId;
  failedTask.retryFromStage = gptLastFailedStage;
  failedTask.retryFromPercent = gptLastFailedPercent;
  if (!planParseBoundary && requiresFreshUpload) {
    // A failed send/attachment boundary is not safely resumable. Reattach the
    // one-post payload from a clean composer instead of submitting an empty or
    // residual draft and pretending that the GPT turn advanced.
    failedTask.forceUpload = true;
    failedTask._submittedToGpt = false;
    failedTask.retryFromStage = "页面就绪";
    failedTask.retryFromPercent = 3;
    delete failedTask.workflow;
  }
  if (planParseBoundary) {
    // The current assistant reply already contains the plan. Re-enter the
    // same web stage so the fixed parser can read it and send exactly one
    // confirmation. Uploading the material again here would create a second
    // plan and can race the next queue item.
    failedTask.forceUpload = false;
    failedTask.workflow = failedTask.workflow || {};
    failedTask.workflow.planSubmitted = true;
    failedTask.workflow.planDone = false;
    failedTask.retryFromStage = "等待迁移计划";
    failedTask.retryFromPercent = Math.max(24, Number(failedTask._percent || 24));
    failedTask._submittedToGpt = true;
  }
  delete failedTask._errorCode;
  gptLastFailedTask = null;
  updateGptTestQueueStatus(`正在从安全检查点重试：${gptLastFailedStage || "当前任务"}`);
  sendNextGptTestTask();
}

function completeCurrentManualGptTask() {
  if (!gptCurrentManualTask) return;
  gptCurrentManualTask = null;
  gptTestQueueIndex += 1;
  if (gptTestQueueIndex >= gptTestQueue.length) {
    updateGptTestQueueStatus("手动队列已完成；所有发送、下载与打包由你在网页中完成");
    return;
  }
  sendNextGptTestTask();
}

async function resumeSemiAutoGptTask() {
  if (!gptSemiAutoPendingTask) return;
  const task = gptSemiAutoPendingTask;
  gptSemiAutoPendingTask = null;
  // Mark the task as a semi-auto resume so the send loop does not pause again
  // after the plan. The extension will pick up from the existing plan and
  // proceed with confirm → images → copy → package.
  task._semiAutoResume = true;
  task.retryFromStage = "计划已完成";
  task.retryFromPercent = 30;
  task.forceUpload = false;
  gptAutoPaused = false;
  gptQueuePaused = false;
  const accountId = String(task.accountId || activeGptAccountId);
  writeGptWindowRuntime(accountId, { status: "running", currentStage: "确认继续出图", currentPercent: 35, pausedByUser: false });
  showWorkbenchAssistantBubble(`已确认继续出图：${task.name}。将自动完成出图、文案和打包。`, { duration: 3600 });
  updateGptTestQueueStatus(`第 ${gptTestQueueIndex + 1}/${gptTestQueue.length} 套 · 确认继续出图，自动处理中`);
  try {
    await sendNextGptTestTask({ accountId, userInitiated: true, allowWindowSwitch: true });
  } catch (error) {
    updateGptTestQueueStatus(`继续出图失败：${error?.message || "未知错误"}`);
  }
}

function syncWorkbenchProductionSettings() {
  if ($("#productionPageCount")) $("#productionPageCount").value = $("#workbenchPageCount")?.value || "";
  if ($("#productionQuality")) $("#productionQuality").value = $("#workbenchQuality")?.value || "严格母版";
  if ($("#productionTextModel")) $("#productionTextModel").value = $("#workbenchTextModel")?.value || "MiniMax-M2.7";
  const conversation = readTemplateConversation().filter((item) => item.role === "user").map((item) => item.text);
  const prompt = [
    pageSettings().production?.promptRules
      ? `工作台生产基础规则：\n${pageSettings().production.promptRules}` : "",
    $("#workbenchPromptEditor")?.value || "",
    conversation.length ? `本次对话补充要求：\n${conversation.map((item) => `- ${item}`).join("\n")}` : ""
  ].filter(Boolean).join("\n\n");
  if ($("#productionPrompt")) $("#productionPrompt").value = prompt;
}

async function packSelectedProductionWorks() {
  if (!workbenchSelectedProducts.size) {
    showSystemNotice("还没有选择成品", "请先勾选右侧一个或多个作品文件夹。");
    return;
  }
  const result = await api("/api/production/pack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths: [...workbenchSelectedProducts] })
  });
  await loadProductionWorkspace();
  showSystemNotice(
    "已整理到抖音小红书待发",
    `成功复制 ${result.packed} 个作品，${result.skipped} 个同名作品已存在并跳过。`,
    {
      details: [
        { label: "待发目录", value: result.pendingRoot },
        { label: "包含内容", value: "独立图片、文案和生产记录" }
      ],
      confirmLabel: "知道了"
    }
  );
}

function currentImageApiPayload() {
  const provider = $("#productionApiProvider")?.value
    || dashboard?.workspaceSettings?.imageApi?.provider
    || "local-openai";
  const providerDefaults = WORKBENCH_PROVIDER_DEFAULTS[provider] || WORKBENCH_PROVIDER_DEFAULTS["local-openai"];
  return {
    provider,
    baseUrl: $("#productionApiBaseUrl")?.value || providerDefaults.baseUrl,
    model: $("#productionApiModel")?.value || providerDefaults.imageModel,
    apiKey: $("#productionApiKey")?.value || ""
  };
}

function currentWorkbenchImageApiPayload() {
  const provider = currentWorkbenchProvider();
  const providerDefaults = WORKBENCH_PROVIDER_DEFAULTS[provider] || WORKBENCH_PROVIDER_DEFAULTS["local-openai"];
  return {
    provider,
    baseUrl: providerDefaults.baseUrl,
    model: $("#workbenchImageModel")?.value || providerDefaults.imageModel,
    apiKey: $("#productionApiKey")?.value || ""
  };
}

function currentTextApiPayload({ workbench = false } = {}) {
  const provider = $("#productionTextProvider")?.value
    || dashboard?.workspaceSettings?.textApi?.provider
    || "minimax";
  const providerDefaults = WORKBENCH_TEXT_PROVIDER_DEFAULTS[provider] || WORKBENCH_TEXT_PROVIDER_DEFAULTS.minimax;
  return {
    provider,
    baseUrl: $("#productionTextBaseUrl")?.value || providerDefaults.baseUrl,
    model: (workbench ? $("#workbenchTextModel")?.value : "")
      || $("#productionTextModel")?.value
      || providerDefaults.textModel,
    apiKey: $("#productionTextApiKey")?.value || ""
  };
}

function updateWorkbenchProgress(percent, phase = "", logMessage = "") {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  workbenchProgressValue = safePercent;
  const bar = $("#workbenchProgressBar");
  const track = bar?.parentElement;
  if (bar) bar.style.width = `${safePercent}%`;
  if (track) track.setAttribute("aria-valuenow", String(safePercent));
  if ($("#workbenchProgressPercent")) $("#workbenchProgressPercent").textContent = `${Math.round(safePercent)}%`;
  if (phase && $("#workbenchProgressPhase")) $("#workbenchProgressPhase").textContent = phase;
  if (logMessage && workbenchProductionLog.at(-1) !== logMessage) {
    workbenchProductionLog.push(logMessage);
    if (workbenchProductionLog.length > 5) workbenchProductionLog.shift();
  }
  const log = $("#workbenchProductionLog");
  if (log) log.innerHTML = workbenchProductionLog.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function setProductionLiveStatus(message, tone = "", progress = null, phase = "") {
  const status = $("#productionLiveStatus");
  if (status) {
    status.textContent = message;
    status.className = `production-live-status${tone ? ` ${tone}` : ""}`;
  }
  const workbenchStatus = $("#workbenchProductionStatus");
  if (workbenchStatus) {
    workbenchStatus.textContent = message;
    workbenchStatus.className = `workbench-production-status${tone ? ` ${tone}` : ""}`;
  }
  if (progress !== null || phase) updateWorkbenchProgress(progress ?? workbenchProgressValue, phase, message);
}

async function saveProductionApi() {
  const [imageResult, textResult] = await Promise.all([
    api("/api/image-api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentImageApiPayload())
    }),
    api("/api/text-api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentTextApiPayload())
    })
  ]);
  if ($("#productionApiKey")) $("#productionApiKey").value = "";
  if ($("#productionTextApiKey")) $("#productionTextApiKey").value = "";
  dashboard.workspaceSettings.imageApi = imageResult.imageApi;
  dashboard.workspaceSettings.textApi = textResult.textApi;
  renderWorkspaceSettings();
  renderWorkbenchModelOptions();
  setProductionLiveStatus(`生图 ${imageResult.imageApi.model}、文案 ${textResult.textApi.model} 已保存到本机安全凭据区。`);
}

async function testProductionApi() {
  setProductionLiveStatus("正在分别核对生图和文案接口……", "running");
  const [imageTest, textTest] = await Promise.allSettled([
    api("/api/image-api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentImageApiPayload())
    }),
    api("/api/text-api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentTextApiPayload())
    })
  ]);
  const imageOk = imageTest.status === "fulfilled" && imageTest.value.modelAvailable;
  const textOk = textTest.status === "fulfilled" && textTest.value.modelAvailable;
  const details = [
    imageTest.status === "fulfilled" ? `生图${imageOk ? "可用" : "已连接但模型未列出"}` : `生图失败：${imageTest.reason?.message || "连接失败"}`,
    textTest.status === "fulfilled" ? `文案${textOk ? "可用" : "已连接但模型未列出"}` : `文案失败：${textTest.reason?.message || "连接失败"}`
  ];
  setProductionLiveStatus(details.join("；"), imageOk && textOk ? "" : "error");
}

function renderProductionOutputs(result) {
  const markup = (result.results || []).map((item, index) => `
    <button class="production-output-card${item.type === "copy" ? " copy-output-card" : ""}" type="button" data-output-path="${escapeHtml(item.outputFile)}">
      ${item.type === "copy"
        ? `<div class="copy-output-icon">文案</div>`
        : `<img src="${escapeHtml(item.previewUrl)}" alt="待审图 ${index + 1}" />`}
      <span>${escapeHtml(item.page || item.work || "结果")} · ${item.type === "copy" ? "小红书文案" : `${item.width || "?"}×${item.height || "?"}`}</span>
    </button>
  `).join("");
  ["#productionOutputGrid", "#workbenchLatestOutputs"].forEach((selector) => {
    const grid = $(selector);
    if (!grid) return;
    grid.innerHTML = markup;
    grid.querySelectorAll("[data-output-path]").forEach((button) => button.addEventListener("click", () => openPath(button.dataset.outputPath)));
  });
}

function selectedProductionMaterials() {
  const paths = workbenchSelectedMaterials.size
    ? [...workbenchSelectedMaterials]
    : (selectedMaterial?.path ? [selectedMaterial.path] : []);
  return [...new Set(paths.filter(Boolean))];
}

function renderProductionMode() {
  const inferred = window.MaterialWorkspace.inferSelectionMode(selectedProductionMaterials());
  if (!activeProductionPlan) {
    if ($("#createProductionPlanBtn")) $("#createProductionPlanBtn").textContent = "开始生产";
    if ($("#workbenchStartProductionBtn")) $("#workbenchStartProductionBtn").textContent = "开始生产";
  }
  if ($("#workbenchSelectionMode")) $("#workbenchSelectionMode").textContent = inferred.workCount
    ? `已选择 ${inferred.workCount} 个帖子文件夹`
    : "请在左侧选择帖子文件夹";
}

function invalidateProductionPlan() {
  if (activeProductionJobId) return;
  activeProductionPlan = null;
  if ($("#productionPlanPanel")) {
    $("#productionPlanPanel").hidden = true;
    $("#productionPlanPanel").innerHTML = "";
  }
  if ($("#workbenchPlanPanel")) {
    $("#workbenchPlanPanel").hidden = true;
    $("#workbenchPlanPanel").innerHTML = "";
  }
  if ($("#workbenchEditPlanBtn")) $("#workbenchEditPlanBtn").hidden = true;
  if ($("#workbenchStartProductionBtn")) {
    $("#workbenchStartProductionBtn").textContent = "开始生产";
    $("#workbenchStartProductionBtn").disabled = false;
  }
  if ($("#createProductionPlanBtn")) {
    $("#createProductionPlanBtn").textContent = "开始生产";
    $("#createProductionPlanBtn").disabled = false;
  }
  if ($("#cancelProductionPlanBtn")) $("#cancelProductionPlanBtn").hidden = true;
}

function renderProductionPlan(planBundle) {
  const workSections = planBundle.plans.map((plan) => `
    <article class="production-plan-work">
      <header><strong>${escapeHtml(plan.materialName)}</strong><span>${plan.pageCount} 张独立图片 + 文案</span></header>
      <p>套用：${escapeHtml(plan.recipe.name)}</p>
      <div class="production-plan-pages">${plan.pages.map((page) => `<span><b>${escapeHtml(page.code)}</b>${escapeHtml(page.title)} · ${escapeHtml(page.roleLabel)}</span>`).join("")}</div>
    </article>
  `).join("");
  const markup = `
    <div class="production-plan-title">
      <div><small>系统已经按聊天记录中的规则拆好</small><h3>确认这次生产计划</h3></div>
      <strong>${planBundle.totals.works} 个素材文件夹 · ${planBundle.totals.images} 张图 · ${planBundle.totals.copyFiles} 份文案</strong>
    </div>
    ${workSections}
    <div class="production-plan-safeguards">
      ${(planBundle.plans[0]?.safeguards || []).map((item) => `<span>✓ ${escapeHtml(item)}</span>`).join("")}
    </div>
    <div class="production-plan-safeguards">
      <span>省钱校准：下一步只生成第 1 套作品的 P1 封面</span>
      <span>只发起 1 次付费生图请求，失败不自动重试</span>
      <span>首图通过后，再由你点击继续生成剩余 ${Math.max(0, Number(planBundle.totals.images || 0) - 1)} 张</span>
    </div>
  `;
  ["#productionPlanPanel", "#workbenchPlanPanel"].forEach((selector) => {
    const panel = $(selector);
    if (!panel) return;
    panel.hidden = false;
    panel.innerHTML = markup;
  });
  if ($("#workbenchStartProductionBtn")) $("#workbenchStartProductionBtn").textContent = "生成首张校准图（仅1次调用）";
  if ($("#createProductionPlanBtn")) $("#createProductionPlanBtn").textContent = "生成首张校准图（仅1次调用）";
  if ($("#workbenchEditPlanBtn")) $("#workbenchEditPlanBtn").hidden = false;
  $("#workbenchPlanPanel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function createProductionPlan() {
  const materialPaths = selectedProductionMaterials();
  if (!materialPaths.length || !selectedTemplate) {
    setProductionLiveStatus("请先选择一个或多个素材文件夹，再选择一个模板。", "error");
    return;
  }
  const inferred = window.MaterialWorkspace.inferSelectionMode(materialPaths);
  workbenchProductionLog.length = 0;
  setProductionLiveStatus("正在读取素材、模板和事实，生成可确认的出图计划……", "running", 8, "生成计划");
  if ($("#createProductionPlanBtn")) $("#createProductionPlanBtn").disabled = true;
  if ($("#workbenchStartProductionBtn")) $("#workbenchStartProductionBtn").disabled = true;
  try {
    const result = await api("/api/production/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: inferred.mode,
        materialPath: materialPaths[0],
        materialPaths,
        templatePath: selectedTemplate.path,
        requestedPages: $("#productionPageCount")?.value || "",
        textModel: currentTextApiPayload({ workbench: true }).model
      })
    });
    activeProductionPlan = result.plan;
    renderProductionPlan(result.plan);
    if ($("#cancelProductionPlanBtn")) $("#cancelProductionPlanBtn").hidden = false;
    setProductionLiveStatus(`计划已生成：整批共 ${result.plan.totals.images} 张。下一步只生成第 1 张封面，成功后暂停。`, "", 25, "等待首图校准");
  } catch (error) {
    setProductionLiveStatus(error.message, "error", workbenchProgressValue, "需要处理");
  } finally {
    if ($("#createProductionPlanBtn")) $("#createProductionPlanBtn").disabled = false;
    if ($("#workbenchStartProductionBtn")) $("#workbenchStartProductionBtn").disabled = false;
  }
}

async function confirmProductionPlan() {
  if (!activeProductionPlan) {
    setProductionLiveStatus("计划已经失效，请重新生成。", "error");
    return;
  }
  if ($("#workbenchStartProductionBtn")) $("#workbenchStartProductionBtn").disabled = true;
  if ($("#createProductionPlanBtn")) $("#createProductionPlanBtn").disabled = true;
  if ($("#workbenchEditPlanBtn")) $("#workbenchEditPlanBtn").disabled = true;
  setProductionLiveStatus("正在生成首张校准图：只调用 1 次，失败不自动重试……", "running", 30, "首图校准");
  try {
    const result = await api("/api/production/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...currentWorkbenchImageApiPayload(),
        planId: activeProductionPlan.id,
        confirmed: true,
        runScope: "calibration",
        quality: $("#productionQuality")?.value || "严格母版",
        prompt: $("#productionPrompt")?.value || "",
        textModel: currentTextApiPayload({ workbench: true }).model
      })
    });
    activeProductionJobId = result.job.id;
    renderProductionJob(result.job);
    startProductionJobPolling();
  } catch (error) {
    if ($("#workbenchStartProductionBtn")) $("#workbenchStartProductionBtn").disabled = false;
    if ($("#createProductionPlanBtn")) $("#createProductionPlanBtn").disabled = false;
    if ($("#workbenchEditPlanBtn")) $("#workbenchEditPlanBtn").disabled = false;
    setProductionLiveStatus(error.message, "error", workbenchProgressValue, "启动失败");
  }
}

function renderProductionJob(job) {
  const percent = job.total ? Math.round((job.progress / job.total) * 100) : 0;
  const suffix = job.status === "running" ? ` · ${job.progress}/${job.total} 张（${percent}%）` : "";
  const finished = ["review-ready", "needs-rework"].includes(job.status);
  const overallPercent = finished ? 100 : job.status === "running" ? 30 + Math.round(percent * 0.7) : workbenchProgressValue;
  const phaseLabels = {
    "calibration-ready": "等待确认首图",
    "review-ready": "生产完成",
    "needs-rework": "需要补做",
    interrupted: "可继续",
    cancelled: "已停止",
    failed: "生产失败"
  };
  const phase = phaseLabels[job.status] || "正在生图";
  const errorTone = ["failed", "needs-rework"].includes(job.status) ? "error" : job.status === "running" ? "running" : "";
  setProductionLiveStatus(`${job.message || "正在生产"}${suffix}`, errorTone, overallPercent, phase);
  renderProductionOutputs(job);
  renderProductionTaskActions(job);
  renderProductionQualitySummary(job);
  if (job.status === "calibration-ready") {
    activeProductionJobId = "";
    activeProductionPlan = null;
    if ($("#productionPlanPanel")) $("#productionPlanPanel").hidden = true;
    if ($("#workbenchPlanPanel")) $("#workbenchPlanPanel").hidden = true;
    if ($("#workbenchEditPlanBtn")) {
      $("#workbenchEditPlanBtn").hidden = true;
      $("#workbenchEditPlanBtn").disabled = false;
    }
    if ($("#workbenchStartProductionBtn")) {
      $("#workbenchStartProductionBtn").textContent = "首图已生成，请在下方确认";
      $("#workbenchStartProductionBtn").disabled = true;
    }
    if ($("#createProductionPlanBtn")) {
      $("#createProductionPlanBtn").textContent = "首图已生成，请在下方确认";
      $("#createProductionPlanBtn").disabled = true;
    }
  }
  if (finished) {
    activeProductionJobId = "";
    activeProductionPlan = null;
    if ($("#productionPlanPanel")) $("#productionPlanPanel").hidden = true;
    if ($("#workbenchPlanPanel")) $("#workbenchPlanPanel").hidden = true;
    if ($("#workbenchEditPlanBtn")) {
      $("#workbenchEditPlanBtn").hidden = true;
      $("#workbenchEditPlanBtn").disabled = false;
    }
    if ($("#workbenchStartProductionBtn") && job.status === "review-ready") {
      $("#workbenchStartProductionBtn").textContent = "开始下一次生产";
      $("#workbenchStartProductionBtn").disabled = false;
    }
    if ($("#cancelProductionPlanBtn")) $("#cancelProductionPlanBtn").hidden = true;
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = "打开待审作品文件夹";
    openButton.addEventListener("click", () => openPath(job.outputRoots?.[0]));
    $("#productionLiveStatus")?.append(" ", openButton);
    loadProductionWorkspace().catch(() => {});
  }
  if (["failed", "interrupted", "cancelled", "needs-rework"].includes(job.status)) {
    activeProductionJobId = "";
    if (job.status === "failed") setProductionLiveStatus(`${job.message} ${job.error || ""}`, "error");
  }
}

function renderProductionTaskActions(job) {
  const actions = $("#workbenchTaskActions");
  if (!actions) return;
  actions.hidden = false;
  const buttons = [];
  if (job.cancelable) buttons.push(`<button type="button" data-production-cancel="${escapeHtml(job.id)}">完成当前页后停止</button>`);
  if (job.status === "calibration-ready") {
    buttons.push(`<button class="primary-button" type="button" data-production-resume="${escapeHtml(job.id)}">首图确认无误，继续生成剩余 ${Number(job.remaining || 0)} 张</button>`);
  } else if (job.resumable) {
    const label = job.runScope === "calibration" ? "重试首张校准图（仍只调用1次）" : "继续未完成页面";
    buttons.push(`<button class="primary-button" type="button" data-production-resume="${escapeHtml(job.id)}">${label}</button>`);
  }
  if (job.outputRoots?.[0]) buttons.push(`<button type="button" data-production-open="${escapeHtml(job.outputRoots[0])}">打开本次待审目录</button>`);
  const report = job.qualityReports?.find((item) => item.reportFile);
  if (report) buttons.push(`<button type="button" data-production-report="${escapeHtml(report.reportFile)}">查看质量报告</button>`);
  actions.innerHTML = buttons.join("");
  actions.hidden = !buttons.length;
}

function renderProductionQualitySummary(job) {
  const container = $("#workbenchQualitySummary");
  if (!container) return;
  const reports = job.qualityReports || [];
  if (!reports.length) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  const failures = reports.reduce((sum, report) => sum + Number(report.summary?.failures || 0), 0);
  const warnings = reports.reduce((sum, report) => sum + Number(report.summary?.warnings || 0), 0);
  const durationMs = Number(job.durationMs || 0);
  container.hidden = false;
  container.innerHTML = `
    <strong>自动质检：${failures ? `${failures} 项需补做` : "文件检查通过"}</strong>
    <span>${reports.length} 套 · ${job.progress}/${job.total} 张 · ${warnings} 条人工复核提醒 · 用时 ${Math.max(1, Math.round(durationMs / 60000))} 分钟</span>
    <small>已检查数量、尺寸、重复图、损坏文件和文案风险词；母版一致性与真实感请按报告最终看图。</small>
  `;
}

async function resumeProductionJob(jobId) {
  const result = await api(`/api/production/jobs/${encodeURIComponent(jobId)}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...currentWorkbenchImageApiPayload(),
      textModel: currentTextApiPayload({ workbench: true }).model,
      action: "continue"
    })
  });
  activeProductionJobId = result.job.id;
  renderProductionJob(result.job);
  startProductionJobPolling();
}

async function cancelProductionJob(jobId) {
  const result = await api(`/api/production/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
  renderProductionJob(result.job);
}

async function restoreLatestProductionTask() {
  if (productionTasksRestored || activeProductionJobId) return;
  productionTasksRestored = true;
  const result = await api("/api/production/tasks");
  const latest = (result.tasks || [])[0];
  if (!latest) return;
  if (latest.status === "running") {
    activeProductionJobId = latest.id;
    renderProductionJob(latest);
    startProductionJobPolling();
    return;
  }
  if (["calibration-ready", "interrupted", "failed", "needs-rework", "cancelled"].includes(latest.status)) {
    renderProductionJob(latest);
  }
}

function startProductionJobPolling() {
  if (productionJobPollTimer) window.clearInterval(productionJobPollTimer);
  productionJobPollTimer = window.setInterval(async () => {
    if (!activeProductionJobId) {
      window.clearInterval(productionJobPollTimer);
      productionJobPollTimer = null;
      return;
    }
    try {
      const result = await api(`/api/production/jobs/${encodeURIComponent(activeProductionJobId)}`);
      renderProductionJob(result.job);
    } catch (error) {
      setProductionLiveStatus(`读取生产进度失败：${error.message}`, "error");
    }
  }, 2500);
}

let dedupInfo = null;

async function loadDedupStatus(sync = false) {
  dedupInfo = await api(sync ? "/api/dedup/sync" : "/api/dedup/status", {
    method: sync ? "POST" : "GET"
  });
  if ($("#dedupProductionGroups")) $("#dedupProductionGroups").textContent = dedupInfo.production?.uniqueImageGroups ?? 0;
  if ($("#dedupExactGroups")) $("#dedupExactGroups").textContent = dedupInfo.production?.exactHashGroups ?? 0;
  if ($("#dedupPerceptualGroups")) $("#dedupPerceptualGroups").textContent = dedupInfo.production?.perceptualHashGroups ?? 0;
  if ($("#dedupMobileUsed")) $("#dedupMobileUsed").textContent = dedupInfo.mobileUsed ?? 0;
  if ($("#dedupOfficialUsed")) $("#dedupOfficialUsed").textContent = dedupInfo.officialUsed ?? 0;
  if ($("#dedupSummary")) {
    const updatedAt = dedupInfo.production?.updatedAt || dedupInfo.updatedAt;
    const updated = updatedAt ? new Date(updatedAt).toLocaleString("zh-CN") : "尚未同步";
    $("#dedupSummary").textContent = dedupInfo.production?.available
      ? `生产历史 ${dedupInfo.production.uniqueImageGroups} 组 · 最后更新 ${updated} · ${dedupInfo.production.historyPath}`
      : `生产历史库尚未连接 · 分发账本 ${dedupInfo.ledgerPath || ""}`;
  }
  return dedupInfo;
}

function buildDiagnosticsText() {
  const appInfo = dashboard?.appInfo || {};
  const distribution = dashboard?.distribution || {};
  const online = (distribution.devices || []).filter((device) => device.online).length;
  return [
    `${appInfo.name || "团建工作台"} v${appInfo.version || "未知"}`,
    `运行方式：${appInfo.desktop ? "桌面版" : "浏览器预览"}`,
    `项目目录：${dashboard?.projectRoot || "未识别"}`,
    `素材目录：${dashboard?.workspaceSettings?.materialRoot || "未识别"}`,
    `作品集目录：${dashboard?.workspaceSettings?.workPackage?.libraryPath || "未识别"}`,
    `设备在线：${online}/${(distribution.devices || []).length}`,
    `数据生成时间：${dashboard?.generatedAt || "未知"}`,
    `运行数据：${appInfo.runtimeRoot || "未识别"}`
  ].join("\n");
}

async function chooseFolder(description, defaultPath = "") {
  if (window.desktopDialogs?.pickFolder) {
    return await window.desktopDialogs.pickFolder({
      title: description,
      defaultPath
    });
  }
  const result = await api("/api/pick-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description, defaultPath })
  });
  return result.path || "";
}

async function saveWorkspacePaths(options = {}) {
  const materialRoot = String(
    options.materialRoot || $("#settingsMaterialRoot")?.value || $("#materialRootInput")?.value || ""
  ).trim();
  const portfolioRoot = String(
    options.portfolioRoot
      || $("#settingsPortfolioRoot")?.value
      || $("#collectionRootInput")?.value
      || $("#distributionCollectionRootInput")?.value
      || dashboard?.workspaceSettings?.workPackage?.libraryPath
      || ""
  ).trim();
  const payload = { materialRoot };
  if (options.materialOnly !== true) {
    const currentWorkPackage = dashboard?.workspaceSettings?.workPackage || {};
    payload.workPackage = {
      libraryPath: portfolioRoot,
      batchSize: Number(currentWorkPackage.batchSize || 14),
      autoGroup: currentWorkPackage.autoGroup !== false,
      autoZip: currentWorkPackage.autoZip !== false
    };
  }
  if (options.includeImageApi === true) {
    payload.imageApi = {
      provider: $("#settingsImageApiProvider")?.value || "openai-compatible",
      baseUrl: $("#settingsImageApiBaseUrl")?.value || "",
      model: $("#settingsImageApiModel")?.value || ""
    };
  }
  await api("/api/settings/paths", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  await loadDashboard(true);
  activateTab(options.returnTab || "dashboard");
  toast(options.materialOnly ? "素材目录已递归扫描" : "目录设置已保存");
}

function renderStats() {
  $("#statMaterialCategories").textContent = dashboard.stats.materialCategories;
  $("#statMaterialItems").textContent = dashboard.stats.materialItems;
  $("#statTemplates").textContent = dashboard.stats.templates;
  $("#statProducts").textContent = dashboard.stats.products;
}

function renderMaterialLibraryFilter() {
  const select = $("#materialLibraryFilter");
  if (!select) return;
  const state = getSavedState();
  const fallback = dashboard.materials.categories[0]?.path || "";
  const savedPath = state.selectedMaterialCategoryPath || fallback;
  select.innerHTML = dashboard.materials.categories
    .map((category) => `<option value="${escapeHtml(category.path)}" data-path="${escapeHtml(category.path)}">${escapeHtml(category.name)}（${category.count}条）</option>`)
    .join("");
  const hasSaved = dashboard.materials.categories.some((category) => category.path === savedPath);
  select.value = hasSaved ? savedPath : fallback;
  enhanceSelect("materialLibraryFilter");
}

function renderTemplateQuickSelect() {
  const select = $("#templateQuickSelect");
  if (!select) return;
  const state = getSavedState();
  select.innerHTML = dashboard.templates.templates
    .map((template) => `<option value="${escapeHtml(template.id)}" data-path="${escapeHtml(template.path)}">${escapeHtml(template.id)} · ${escapeHtml(template.name)}</option>`)
    .join("");
  const saved = state.selectedTemplate || "T01";
  select.value = dashboard.templates.templates.some((template) => template.id === saved) ? saved : dashboard.templates.templates[0]?.id || "";
  enhanceSelect("templateQuickSelect");
}

function renderKeywordFilters() {
  renderKeywordGroup("materialTypeKeywordFilters", "selectedMaterialTypeKeyword", MATERIAL_TYPE_KEYWORDS);
  renderKeywordGroup("durationKeywordFilters", "selectedDurationKeyword", DURATION_KEYWORDS);
  renderKeywordGroup("locationKeywordFilters", "selectedLocationKeyword", LOCATION_KEYWORDS);
  renderKeywordGroup("activityKeywordFilters", "selectedActivityKeyword", ACTIVITY_KEYWORDS);
  renderKeywordGroup("seasonKeywordFilters", "selectedSeasonKeyword", SEASON_KEYWORDS);
  renderKeywordGroup("monthKeywordFilters", "selectedMonthKeyword", MONTH_KEYWORDS);
  renderKeywordGroup("festivalKeywordFilters", "selectedFestivalKeyword", FESTIVAL_KEYWORDS);
}

function renderFilterMatchSwitch() {
  const checkbox = $("#filterMatchSwitch");
  if (!checkbox) return;
  const state = getSavedState();
  const mode = getFilterMatchMode();
  checkbox.checked = mode !== "any";
  checkbox.onchange = () => {
    saveLocalState({ keywordMatchMode: checkbox.checked ? "all" : "any", keywordMatchModeUserSet: true, selectedMaterial: "" });
    renderMaterialQuickSelect();
    renderMaterials();
    const firstEntry = getVisibleMaterialEntries()[0];
    if (firstEntry) selectMaterial(firstEntry.item, firstEntry.category);
    toast(checkbox.checked ? "满足全部筛选" : "满足任一筛选");
  };
}

function getFilterMatchMode() {
  const state = getSavedState();
  return state.keywordMatchModeUserSet && state.keywordMatchMode === "any" ? "any" : "all";
}
function renderMaterialSortSwitch() {
  const select = $("#materialSortSwitch");
  if (!select) return;
  const active = getSavedState().materialSort || "time";
  select.innerHTML = SORT_OPTIONS.map((option) => `<option value="${option.id}">${option.label}</option>`).join("");
  select.value = SORT_OPTIONS.some((option) => option.id === active) ? active : "time";
  enhanceSelect("materialSortSwitch");
  select.onchange = () => {
    saveLocalState({ materialSort: select.value || "time", selectedMaterial: "" });
    syncCustomSelect(select);
    renderMaterialQuickSelect();
    renderMaterials();
    const firstEntry = getVisibleMaterialEntries()[0];
    if (firstEntry) selectMaterial(firstEntry.item, firstEntry.category);
    toast(select.selectedOptions[0]?.textContent?.trim() || "已排序");
  };
}

function renderKeywordGroup(containerId, stateKey, keywords) {
  const select = $(`#${containerId}`);
  if (!select) return;
  const state = getSavedState();
  const active = state[stateKey] || "";
  select.innerHTML = [`<option value="">全部</option>`]
    .concat(keywords.map((keyword) => `<option value="${keyword}">${keyword}</option>`))
    .join("");
  select.value = keywords.includes(active) ? active : "";
  enhanceSelect(containerId);
  select.onchange = () => {
    saveLocalState({ [stateKey]: select.value || "", selectedMaterial: "" });
    syncCustomSelect(select);
    renderMaterialQuickSelect();
    renderMaterials();
    const firstEntry = getVisibleMaterialEntries()[0];
    if (firstEntry) selectMaterial(firstEntry.item, firstEntry.category);
    toast(select.value ? `已筛选：${select.value}` : "已取消筛选");
  };
}

function getCurrentFilterSummary() {
  const state = getSavedState();
  const pairs = [
    ["素材类型", state.selectedMaterialTypeKeyword],
    ["行程天数", state.selectedDurationKeyword],
    ["地点", state.selectedLocationKeyword],
    ["活动", state.selectedActivityKeyword],
    ["季节", state.selectedSeasonKeyword],
    ["月份", state.selectedMonthKeyword],
    ["节日", state.selectedFestivalKeyword],
    ["搜索", ($("#materialSearch")?.value || "").trim()]
  ].filter(([, value]) => value);
  const mode = getFilterMatchMode() === "any" ? "满足其一" : "全部满足";
  return pairs.length ? `${mode}：${pairs.map(([key, value]) => `${key}=${value}`).join("，")}` : "未启用关键词筛选";
}
function getVisibleMaterialCategories() {
  if ($("#materialFeed")?.classList.contains("material-folder-tree")) return dashboard.materials.categories;
  const selectedPath = $("#materialLibraryFilter")?.value || "";
  if (selectedPath.startsWith("template:")) return [];
  return dashboard.materials.categories.filter((category) => !selectedPath || category.path === selectedPath);
}

function getSelectedTemplateFromLibrary() {
  return null;
}

function templateForMaterialItem(item) {
  if (!item) return null;
  const materialPath = (item.path || "").toLowerCase();
  return dashboard.templates.templates.find((template) => (
    (template.path || "").toLowerCase() === materialPath
    || (template.path || "").toLowerCase().startsWith(`${materialPath}\\`)
    || materialPath.endsWith((template.path || "").toLowerCase())
  )) || null;
}

function getVisibleMaterialEntries() {
  const query = ($("#materialSearch").value || "").trim().toLowerCase();
  if ($("#materialFeed")?.classList.contains("material-folder-tree")) {
    return getVisibleMaterialCategories()
      .flatMap((category) => category.items.map((item) => ({ item, category })))
      .filter(({ item, category }) => {
        const haystack = `${category.name} ${item.name} ${item.preview} ${(item.tags || []).join(" ")}`.toLowerCase();
        return !query || haystack.includes(query);
      })
      .sort(compareMaterialEntries);
  }
  const state = getSavedState();
  const visibleCategories = getVisibleMaterialCategories();
  const isTemplateLibrary = visibleCategories.length === 1 && visibleCategories[0].name === "模板素材";
  const locationKeyword = (state.selectedLocationKeyword || "").toLowerCase();
  const activityKeyword = (state.selectedActivityKeyword || "").toLowerCase();
  const seasonKeyword = (state.selectedSeasonKeyword || "").toLowerCase();
  const monthKeyword = (state.selectedMonthKeyword || "").toLowerCase();
  const festivalKeyword = (state.selectedFestivalKeyword || "").toLowerCase();
  const materialTypeKeyword = (state.selectedMaterialTypeKeyword || "").toLowerCase();
  const durationKeyword = (state.selectedDurationKeyword || "").toLowerCase();
  const keywordMatchers = [
    materialTypeKeyword,
    durationKeyword,
    locationKeyword,
    activityKeyword,
    seasonKeyword,
    monthKeyword,
    festivalKeyword
  ].filter(Boolean);
  const matchMode = getFilterMatchMode();
  return visibleCategories
    .flatMap((category) => category.items.map((item) => ({ item, category })))
    .filter(({ item, category }) => {
      if (isTemplateLibrary) return true;
      const haystack = `${category.name} ${item.name} ${item.preview} ${(item.tags || []).join(" ")}`.toLowerCase();
      const matchSearch = !query || haystack.includes(query);
      const matchKeywords = !keywordMatchers.length
        || (matchMode === "any"
          ? keywordMatchers.some((keyword) => haystack.includes(keyword))
          : keywordMatchers.every((keyword) => haystack.includes(keyword)));
      return matchSearch && matchKeywords;
    })
    .sort(compareMaterialEntries);
}

function compareMaterialEntries(left, right) {
  const sort = getSavedState().materialSort || "time";
  if (sort === "name") return left.item.name.localeCompare(right.item.name, "zh-Hans-CN");
  if (sort === "folderTime") return readFolderTime(right.item) - readFolderTime(left.item) || left.item.order - right.item.order;
  if (sort === "likes") return readMetric(right.item, "like") - readMetric(left.item, "like") || left.item.order - right.item.order;
  if (sort === "comments") return readMetric(right.item, "comment") - readMetric(left.item, "comment") || left.item.order - right.item.order;
  return readTime(right.item) - readTime(left.item) || left.item.order - right.item.order;
}

function readFolderTime(item) {
  const value = Date.parse(item.updatedAt || "");
  return Number.isFinite(value) ? value : 0;
}

function readMetric(item, type) {
  const text = `${item.name || ""} ${item.preview || ""}`;
  const patterns = type === "like"
    ? [/点赞[:：]?\s*(\d+(?:\.\d+)?)(w|万|k)?/i, /(\d+(?:\.\d+)?)(w|万|k)?\s*(赞|点赞)/i]
    : [/评论[:：]?\s*(\d+(?:\.\d+)?)(w|万|k)?/i, /(\d+(?:\.\d+)?)(w|万|k)?\s*(评|评论)/i];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return scaleNumber(match[1], match[2]);
  }
  return -1;
}

function scaleNumber(value, unit = "") {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return -1;
  if (unit === "w" || unit === "万") return number * 10000;
  if (unit?.toLowerCase() === "k") return number * 1000;
  return number;
}

function readTime(item) {
  const text = `${item.name || ""} ${item.preview || ""}`;
  const match = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
  return Number(item.order || 0);
}

async function collectFilteredMaterials() {
  const entries = getVisibleMaterialEntries();
  const libraryPath = selectedMaterialCategory?.path || $("#materialLibraryFilter")?.value || "";
  if (!libraryPath || !entries.length) {
    toast("当前筛选没有可整合素材");
    return;
  }
  const payload = {
    libraryPath,
    filterSummary: getCurrentFilterSummary(),
    items: entries.map(({ item }) => ({ name: item.name, path: item.path }))
  };
  const result = await api("/api/collect-materials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  toast(`已整合 ${result.created} 条素材`);
  if (result.folderPath) openPath(result.folderPath);
}
function renderMaterialQuickSelect() {
  const select = $("#materialQuickSelect");
  if (!select) return;
  const state = getSavedState();
  const entries = getVisibleMaterialEntries();
  select.innerHTML = entries
    .map(({ item }) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
    .join("");
  const selectedId = selectedMaterial?.id || state.selectedMaterial || entries[0]?.item.id || "";
  select.value = entries.some(({ item }) => item.id === selectedId) ? selectedId : entries[0]?.item.id || "";
  enhanceSelect("materialQuickSelect");
}

function renderMaterials() {
  const container = $("#materialFeed");
  if (!container) return;
  if (container.classList.contains("material-folder-tree")) {
    renderMaterialTree(container);
    return;
  }
  container.innerHTML = "";
  const allEntries = getVisibleMaterialEntries();
  const signature = allEntries.map(({ item }) => item.id).join("\u001f");
  if (container.dataset.feedSignature !== signature) {
    materialRenderLimit = 12;
    container.dataset.feedSignature = signature;
  }
  const templateFromLibrary = getSelectedTemplateFromLibrary();
  if (templateFromLibrary) {
    selectTemplate(templateFromLibrary);
    renderTemplateLibraryFeed(container, templateFromLibrary);
    return;
  }
  let shown = 0;
  getVisibleMaterialCategories().forEach((category) => {
    const items = allEntries
      .filter((entry) => entry.category.path === category.path)
      .map((entry) => entry.item);
    if (!items.length) return;
    items.slice(0, Math.max(0, materialRenderLimit - shown)).forEach((item) => {
      container.appendChild(createMaterialPreviewCard(item, category));
      shown += 1;
    });
  });
  if (!container.children.length) {
    container.innerHTML = `<div class="summary-text">当前筛选没有匹配素材。可以取消部分筛选，或切换为“满足任一筛选”。</div>`;
    $("#materialPath").textContent = "无匹配素材";
  } else if (shown < allEntries.length) {
    appendFeedLoadStatus(container, shown, allEntries.length, "素材");
  }
}

function appendFeedLoadStatus(container, shown, total, label) {
  const status = document.createElement("div");
  status.className = "feed-load-status";
  status.textContent = `继续下滑加载${label} · 已显示 ${shown} / ${total}`;
  container.appendChild(status);
}

function maybeLoadMoreMaterials() {
  const canvas = $("#dashboardView .work-canvas");
  if (!canvas || canvas.scrollTop + canvas.clientHeight < canvas.scrollHeight - 220) return;
  const total = getVisibleMaterialEntries().length;
  if (materialRenderLimit >= total) return;
  const scrollTop = canvas.scrollTop;
  materialRenderLimit = Math.min(materialRenderLimit + 12, total);
  renderMaterials();
  canvas.scrollTop = scrollTop;
}

function createMaterialPreviewCard(item, category) {
  const el = document.createElement("article");
  el.className = "feed-card material-item";
  el.dataset.id = item.id;
  const percent = category.count ? `${Math.round(((item.order || 0) / category.count) * 100)}%` : "--";
  const tags = (item.tags || []).slice(0, 8).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  el.innerHTML = `
    <div class="feed-card-head">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <p>${escapeHtml(category.name)} · 第 ${item.order || "--"} / ${category.count} 条 · ${percent} · ${item.imageCount || 0} 张图</p>
      </div>
      <div class="tag-strip">${tags}</div>
    </div>
    <div class="image-grid material-grid"></div>
  `;
  const grid = el.querySelector(".material-grid");
  renderImageCards(grid, item.images, "素材预览");
  el.addEventListener("click", () => selectMaterial(item, category, { keepFeed: true }));
  return el;
}

function renderTemplateLibraryFeed(container, template) {
  $("#materialPath").textContent = `模板素材库 · ${template.id} · ${template.name} · ${template.imageCount || 0} 张参考图`;
  const el = document.createElement("article");
  el.className = "feed-card template-feed-card";
  el.dataset.id = template.id;
  el.innerHTML = `
    <div class="feed-card-head">
      <div>
        <strong>${escapeHtml(template.id)} · ${escapeHtml(template.name)}</strong>
        <p>${escapeHtml(template.usage || "模板参考")} · 默认 ${template.defaultPages || "--"} 页</p>
      </div>
      <div class="tag-strip"><span>当前母版</span><span>${template.status || "可用"}</span></div>
    </div>
    <div class="image-grid template-grid"></div>
  `;
  renderImageCards(el.querySelector(".template-grid"), template.images, "模板参考图");
  container.appendChild(el);
  if (template.images?.[0]) setFocusPreview(template.images[0], `${template.id} · ${template.name}`, "模板参考图");
}

function selectMaterial(item, category, options = {}) {
  if (selectedMaterial?.id !== item.id) invalidateProductionPlan();
  selectedMaterial = item;
  selectedMaterialCategory = category;
  expandedMaterialPaths.add(category.path);
  const templateMaterial = category.name === "模板素材" ? templateForMaterialItem(item) : null;
  if (templateMaterial) selectedTemplate = templateMaterial;
  const libraryFilter = $("#materialLibraryFilter");
  if (libraryFilter && libraryFilter.value !== category.path) libraryFilter.value = category.path;
  const materialQuickSelect = $("#materialQuickSelect");
  if (materialQuickSelect && materialQuickSelect.value !== item.id) materialQuickSelect.value = item.id;
  syncCustomSelect(libraryFilter);
  syncCustomSelect(materialQuickSelect);
  $$(".material-item").forEach((el) => el.classList.toggle("active", el.dataset.id === item.id));
  const percent = category.count ? `${Math.round(((item.order || 0) / category.count) * 100)}%` : "--";
  $("#materialPath").textContent = `${category.name} · 第 ${item.order || "--"} / ${category.count} 条 · ${percent} · ${item.imageCount || 0} 张图`;
  if (item.images?.[0]) setFocusPreview(item.images[0], item.name, `素材预览 · ${category.name}`);
  updateMission();
  if (templateMaterial) saveLocalState({ selectedTemplate: templateMaterial.id });
  saveLocalState({
    selectedMaterialCategory: category.name,
    selectedMaterialCategoryPath: category.path,
    selectedMaterial: item.id
  });
  if (!options.keepFeed) renderMaterials();
}

function selectTemplate(template) {
  if (selectedTemplate?.id !== template.id) invalidateProductionPlan();
  selectedTemplate = template;
  $$(".template-item").forEach((el) => el.classList.toggle("active", el.dataset.id === template.id));
  if ($("#templateQuickSelect")) {
    $("#templateQuickSelect").value = template.id;
    syncCustomSelect($("#templateQuickSelect"));
  }
  const index = dashboard.templates.templates.findIndex((item) => item.id === template.id) + 1;
  if ($("#templateMeta")) $("#templateMeta").textContent = `第 ${index || "--"} / ${dashboard.templates.templates.length} 个模板 · ${template.imageCount || 0} 张参考图`;
  if ($("#templateImages")) renderImages("#templateImages", template.images);
  if (template.images?.[0]) setFocusPreview(template.images[0], `${template.id} · ${template.name}`, "模板参考图");
  updateMission();
  saveLocalState({ selectedTemplate: template.id });
}

function updateMission() {
  const templateLabel = selectedTemplate ? `${selectedTemplate.id} · ${selectedTemplate.name}` : "T01";
  const materialLabel = selectedMaterial ? selectedMaterial.name : "当前素材";
  if ($("#pipelineMaterialName")) $("#pipelineMaterialName").textContent = selectedMaterial ? selectedMaterial.name : "从下方素材库选择";
  const libraryLabel = selectedMaterialCategory ? selectedMaterialCategory.name : "素材库1";
  const pages = Number.parseInt(selectedTemplate?.defaultPages, 10) || 5;
  const task = getCurrentProductionTask();
  const history = findPairHistory();
  const stateNote = task
    ? `当前任务状态为「${task.status}」，已生成 ${task.generatedPages || 0}/${task.expectedPages || pages} 页；${task.missing?.length ? `优先补齐：${task.missing.join("、")}；` : ""}`
    : history
    ? `已命中历史记录「${history["状态"] || "未知状态"}」，先核对成品是否可复用；`
    : "未命中可验证历史记录；";
  $("#commandBox").value = $("#materialFeed")?.classList.contains("material-folder-tree")
    ? window.MaterialWorkspace.buildChatGptInstruction(selectedMaterial, selectedMaterialCategory, selectedTemplate?.id || "T04")
    : `继续模板迁移正式生产：锁定 A 类永久母版「${templateLabel}」，素材从当前素材库「${libraryLabel}」的未完成/未制作处续接；当前 B 类素材为「${materialLabel}」。${stateNote}先写或补齐《出图计划.md》，按 3:4 竖图输出 ${pages} 页独立图片；封面与内页严格复用母版结构、字体、配色和拼图节奏，人物/静物/分区必须去重。完成后生成独立小红书文案，落盘到成品库并写入制作日志。`;
  renderProductionStatus();
  saveLocalState({
    currentProductionPair: {
      material: materialLabel,
      materialPath: selectedMaterial?.path || "",
      materialLibrary: libraryLabel,
      materialLibraryPath: selectedMaterialCategory?.path || "",
      template: templateLabel,
      templatePath: selectedTemplate?.path || "",
      mode: "模板迁移正式生产",
      updatedAt: new Date().toISOString()
    }
  });
}

function renderImages(selector, images, options = {}) {
  const container = $(selector);
  if (!container) return;
  container.innerHTML = "";
  renderImageCards(container, images, selector === "#templateImages" ? "模板参考图" : "素材预览");
}

function renderImageCards(container, images, meta) {
  if (!container) return;
  container.innerHTML = "";
  if (!images || !images.length) {
    container.innerHTML = `<div class="summary-text">没有可预览图片。</div>`;
    return;
  }
  images.forEach((image) => {
    const card = document.createElement("figure");
    card.className = "image-card";
    card.innerHTML = `<img src="${escapeHtml(image.url)}" loading="lazy" alt="${escapeHtml(image.name)}"><span>${escapeHtml(image.name)}</span>`;
    card.addEventListener("click", (event) => {
      event.stopPropagation();
      setFocusPreview(image, image.name, meta || "图片预览");
    });
    card.addEventListener("dblclick", () => openPath(image.path));
    container.appendChild(card);
  });
}

function setFocusPreview(image, title, meta) {
  if (!image) return;
  focusTarget = {
    path: image.path || "",
    folderPath: parentPath(image.path),
    title: title || image.name || "当前图片"
  };
  const img = $("#focusPreviewImage");
  const text = $("#focusPreviewText");
  img.src = image.url;
  img.style.display = "block";
  text.value = "";
  text.style.display = "none";
  $("#focusPreviewTitle").textContent = title || image.name || "当前图片";
  $("#focusPreviewMeta").textContent = meta || "图片预览";
}

function setFocusTextPreview(title, meta, content) {
  focusTarget = {
    path: selectedMaterial?.path || "",
    folderPath: selectedMaterial?.path || "",
    title: title || "素材文案/信息源"
  };
  const img = $("#focusPreviewImage");
  const text = $("#focusPreviewText");
  img.removeAttribute("src");
  img.style.display = "none";
  text.value = content || "没有读取到文案。";
  text.style.display = "block";
  $("#focusPreviewTitle").textContent = title || "素材文案/信息源";
  $("#focusPreviewMeta").textContent = meta || "只提取内容，不继承素材排版";
}

function renderPrompts() {
  const list = $("#promptList");
  list.innerHTML = "";
  dashboard.prompts.prompts.forEach((prompt) => {
    const el = document.createElement("article");
    el.className = "prompt-item";
    el.dataset.id = prompt.id;
    el.innerHTML = `
      <div class="item-title">${escapeHtml(prompt.title)}</div>
      <div class="item-sub">${escapeHtml(prompt.activeVersion)} · ${escapeHtml(prompt.role)}</div>
    `;
    el.addEventListener("click", () => selectPrompt(prompt));
    list.appendChild(el);
  });
  if (!selectedPrompt && dashboard.prompts.prompts[0]) selectPrompt(dashboard.prompts.prompts[0]);
}

function selectPrompt(prompt) {
  selectedPrompt = prompt;
  $$(".prompt-item").forEach((el) => el.classList.toggle("active", el.dataset.id === prompt.id));
  $("#promptTitle").textContent = prompt.title;
  $("#promptRole").textContent = prompt.role;
  const select = $("#promptVersion");
  select.innerHTML = "";
  prompt.versions.forEach((version) => {
    const option = document.createElement("option");
    option.value = version.version;
    option.textContent = version.version;
    select.appendChild(option);
  });
  select.value = prompt.activeVersion;
  renderPromptVersion();
}

function renderPromptVersion() {
  if (!selectedPrompt) return;
  const version = selectedPrompt.versions.find((item) => item.version === $("#promptVersion").value) || selectedPrompt.versions[0];
  $("#promptContent").value = version?.content || "";
}

function getVisibleProductGroups() {
  const selectedPath = $("#productTemplateFilter")?.value || "";
  return dashboard.products.groups.filter((group) => !selectedPath || group.path === selectedPath);
}

function getVisibleProductWorks() {
  const query = ($("#productSearch")?.value || "").trim().toLowerCase();
  return getVisibleProductGroups()
    .flatMap((group) => group.works.map((work) => ({ group, work })))
    .filter(({ group, work }) => {
      const haystack = `${group.name} ${work.name}`.toLowerCase();
      return !query || haystack.includes(query);
    });
}

function renderProducts() {
  renderProductTemplateFilter();
  renderProductWorkFilter();
  const board = $("#productBoard");
  const entries = getVisibleProductWorks();
  if (!board) {
    renderProductFeed(entries);
    const selectedEntry = entries.find(({ work }) => work.id === selectedProductWork?.id);
    if (selectedEntry) selectProductWork(selectedEntry.work, selectedEntry.group, { keepFeed: true });
    return;
  }
  board.innerHTML = "";
  entries.forEach(({ group, work }) => {
    const card = document.createElement("article");
    card.className = "product-card";
    card.dataset.id = work.id;
    card.innerHTML = `
      <h3>${escapeHtml(work.name)}</h3>
      <div class="product-meta">
        <span class="status-pill">${work.imageCount} 图</span>
        <span class="status-pill">${work.hasCopy ? "有文案" : "缺文案"}</span>
        <span class="status-pill">${work.hasPlan ? "有计划" : "缺计划"}</span>
      </div>
    `;
    card.addEventListener("click", () => selectProductWork(work, group));
    card.addEventListener("dblclick", () => openPath(work.path));
    board.appendChild(card);
  });
  const selectedEntry = entries.find(({ work }) => work.id === selectedProductWork?.id) || entries[0];
  if (selectedEntry) selectProductWork(selectedEntry.work, selectedEntry.group);
}

function renderProductFeed(entries) {
  const container = $("#productImages");
  if (!container) return;
  container.innerHTML = "";
  const group = entries[0]?.group || getVisibleProductGroups()[0];
  const templateId = (group?.name || "").match(/T\d{2}/)?.[0];
  const template = dashboard.templates.templates.find((item) => item.id === templateId);
  if (template) {
    const templateCard = document.createElement("article");
    templateCard.className = "feed-card template-feed-card";
    templateCard.innerHTML = `
      <div class="feed-card-head">
        <div>
          <strong>00 模板 · ${escapeHtml(template.id)} · ${escapeHtml(template.name)}</strong>
          <p>${escapeHtml(template.usage || "原始母版")} · ${template.imageCount || 0} 张参考图</p>
        </div>
        <div class="tag-strip"><span>原模板</span></div>
      </div>
      <div class="image-grid product-grid"></div>
    `;
    renderImageCards(templateCard.querySelector(".product-grid"), template.images, "模板参考图");
    templateCard.addEventListener("click", () => {
      if (template.images?.[0]) setProductPreview(template.images[0], `00 模板 · ${template.name}`, "模板参考图");
    });
    container.appendChild(templateCard);
  }
  const signature = entries.map(({ work }) => work.id).join("\u001f");
  if (container.dataset.feedSignature !== signature) {
    productRenderLimit = 8;
    container.dataset.feedSignature = signature;
  }
  const visibleEntries = entries.slice(0, productRenderLimit);
  visibleEntries.forEach(({ group: itemGroup, work }) => {
    const card = document.createElement("article");
    card.className = "feed-card product-card";
    card.dataset.id = work.id;
    card.innerHTML = `
      <div class="feed-card-head">
        <div>
          <strong>${escapeHtml(work.name)}</strong>
          <p>${escapeHtml(itemGroup.name)} · ${work.imageCount || 0} 张图 · ${work.hasCopy ? "有文案" : "缺文案"} · ${work.hasPlan ? "有计划" : "缺计划"}</p>
        </div>
      </div>
      <div class="image-grid product-grid"></div>
    `;
    renderImageCards(card.querySelector(".product-grid"), work.images || [], "成品图片");
    card.addEventListener("click", () => selectProductWork(work, itemGroup, { keepFeed: true }));
    card.addEventListener("dblclick", () => openPath(work.path));
    container.appendChild(card);
  });
  if (visibleEntries.length < entries.length) appendFeedLoadStatus(container, visibleEntries.length, entries.length, "成品");
  const first = visibleEntries[0];
  if (template?.images?.[0] && !selectedProductWork) setProductPreview(template.images[0], `00 模板 · ${template.name}`, "模板参考图");
  else if (first && !selectedProductWork) selectProductWork(first.work, first.group, { keepFeed: true });
}

function renderProductTemplateFilter() {
  const select = $("#productTemplateFilter");
  if (!select) return;
  select.innerHTML = dashboard.products.groups
    .map((group) => `<option value="${escapeHtml(group.path)}" data-path="${escapeHtml(group.path)}">${escapeHtml(group.name)}（${group.count}条）</option>`)
    .join("");
  const current = selectedProductGroup?.path || dashboard.products.groups[0]?.path || "";
  select.value = dashboard.products.groups.some((group) => group.path === current) ? current : dashboard.products.groups[0]?.path || "";
  enhanceSelect("productTemplateFilter");
}

function renderProductWorkFilter() {
  const entries = getVisibleProductWorks();
  const current = selectedProductWork?.id || entries[0]?.work.id || "";
  ["productWorkFilter", "productWorkQuickSelect"].forEach((selectId) => {
    const select = $(`#${selectId}`);
    if (!select) return;
    select.innerHTML = entries
      .map(({ work }) => `<option value="${escapeHtml(work.id)}" data-path="${escapeHtml(work.path)}">${escapeHtml(work.name)}</option>`)
      .join("");
    select.value = entries.some(({ work }) => work.id === current) ? current : entries[0]?.work.id || "";
    enhanceSelect(selectId);
  });
}

function maybeLoadMoreProducts() {
  const pane = $("#productsView .product-preview-pane");
  if (!pane || pane.scrollTop + pane.clientHeight < pane.scrollHeight - 220) return;
  const entries = getVisibleProductWorks();
  if (productRenderLimit >= entries.length) return;
  const scrollTop = pane.scrollTop;
  productRenderLimit = Math.min(productRenderLimit + 8, entries.length);
  renderProducts();
  pane.scrollTop = scrollTop;
}

function selectProductWork(work, group, options = {}) {
  selectedProductWork = work;
  selectedProductGroup = group;
  if ($("#productTemplateFilter")) {
    $("#productTemplateFilter").value = group.path;
    syncCustomSelect($("#productTemplateFilter"));
  }
  if ($("#productWorkFilter")) {
    $("#productWorkFilter").value = work.id;
    syncCustomSelect($("#productWorkFilter"));
  }
  if ($("#productWorkQuickSelect")) {
    $("#productWorkQuickSelect").value = work.id;
    syncCustomSelect($("#productWorkQuickSelect"));
  }
  $$("#productBoard .product-card").forEach((card) => card.classList.toggle("active", card.dataset.id === work.id));
  $$("#productImages .product-card").forEach((card) => card.classList.toggle("active", card.dataset.id === work.id));
  $("#productPath").textContent = `${group.name} · ${work.imageCount || 0} 张图`;
  $("#productDetailTitle").textContent = work.name;
  $("#productDetailMeta").textContent = `${group.name} · ${work.hasCopy ? "有文案" : "缺文案"} · ${work.hasPlan ? "有计划" : "缺计划"}`;
  if (!options.keepFeed) renderProductImages(work.images || []);
  else if (work.images?.[0]) setProductPreview(work.images[0], work.name, "成品图片");
}

function renderProductImages(images) {
  const container = $("#productImages");
  if (!container) return;
  container.innerHTML = "";
  if (!images.length) {
    container.innerHTML = `<div class="summary-text">没有可预览图片。</div>`;
    return;
  }
  images.forEach((image) => {
    const card = document.createElement("figure");
    card.className = "image-card";
    card.innerHTML = `<img src="${escapeHtml(image.url)}" loading="lazy" alt="${escapeHtml(image.name)}"><span>${escapeHtml(image.name)}</span>`;
    card.addEventListener("click", () => setProductPreview(image));
    card.addEventListener("dblclick", () => openPath(image.path));
    container.appendChild(card);
  });
  setProductPreview(images[0]);
}

function setProductPreview(image, title, meta) {
  const img = $("#productPreviewImage");
  if (!img || !image) return;
  img.src = image.url;
  img.style.display = "block";
  $("#productPreviewTitle").textContent = title || image.name;
  $("#productPreviewMeta").textContent = meta || "成品图片";
}

function renderLogs() {
  const container = $("#latestLogs");
  container.innerHTML = "";
  dashboard.logs.latestProduction.forEach((row) => {
    const el = document.createElement("div");
    el.className = "log-row";
    el.innerHTML = `
      <span>${escapeHtml(row["时间"] || "")}</span>
      <strong>${escapeHtml(row["素材标题"] || "")}</strong>
      <span>${escapeHtml(row["模板ID"] || "")}</span>
      <span>${escapeHtml(row["状态"] || "")}</span>
    `;
    container.appendChild(el);
  });
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(Number(value) || 0);
}

function renderMaterialTree(container) {
  const entries = getVisibleMaterialEntries();
  const entryIds = new Set(entries.map(({ item }) => item.id));
  const categories = dashboard.materials.categories.map((category) => ({
    ...category,
    items: category.items.filter((item) => entryIds.has(item.id))
  })).filter((category) => category.items.length || !($("#materialSearch")?.value || "").trim());

  if (!materialTreeInitialized && categories[0]) {
    const savedCategoryPath = getSavedState().selectedMaterialCategoryPath;
    expandedMaterialPaths.add(categories.some((category) => category.path === savedCategoryPath)
      ? savedCategoryPath
      : categories[0].path);
    materialTreeInitialized = true;
  }
  const tree = window.MaterialWorkspace.buildMaterialTree(
    categories,
    selectedMaterial?.id || "",
    Array.from(expandedMaterialPaths)
  );
  container.dataset.view = materialTreeView;
  $("#treeSummary").textContent = `${categories.length} 个素材库 · ${entries.length} 个帖子`;
  const treeToolbar = $(".tree-toolbar > div");
  if (treeToolbar && !treeToolbar.querySelector(".tree-view-switch")) {
    treeToolbar.insertAdjacentHTML("beforeend", `
      <div class="tree-view-switch" role="group" aria-label="素材视图">
        <button type="button" data-material-tree-view="list" title="列表视图" aria-label="列表视图">☷</button>
        <button type="button" data-material-tree-view="icons" title="小图标视图" aria-label="小图标视图">▦</button>
      </div>
    `);
  }
  $$(".tree-view-switch button").forEach((button) => {
    button.classList.toggle("active", button.dataset.materialTreeView === materialTreeView);
  });
  container.innerHTML = tree.length ? tree.map((category) => `
    <section class="tree-category${category.expanded ? " expanded" : ""}" data-category-path="${escapeHtml(category.path)}">
      <button class="tree-category-row" type="button" data-tree-toggle="${escapeHtml(category.path)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h6l2 2H20.5v10h-17z"/><path d="M3.5 9h17"/></svg>
        <span>${escapeHtml(category.name)}</span>
        <small>${category.count || category.items.length}</small>
        <b aria-hidden="true">⌄</b>
      </button>
      <div class="tree-children">
        ${category.expanded ? category.items.map((item) => `
          <article class="tree-item material-item${item.selected ? " active" : ""}" data-id="${escapeHtml(item.id)}">
            <button class="tree-item-main" type="button" data-tree-select="${escapeHtml(item.id)}">
              <span class="tree-file-icon">${item.imageCount || 0}<small>图</small></span>
              <span><strong>${escapeHtml(item.name)}</strong></span>
            </button>
            <button class="tree-send-button" type="button" data-tree-send="${escapeHtml(item.id)}"><span>上传</span><b aria-hidden="true">→</b></button>
          </article>
        `).join("") || `<p class="tree-empty">当前分类没有匹配帖子</p>` : ""}
      </div>
    </section>
  `).join("") : `<div class="summary-text">没有匹配的本地帖子文件夹。</div>`;
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function renderOverview() {
  const container = $("#overviewStats");
  if (!container || !dashboard) return;
  const distribution = dashboard.distribution || { summary: {} };
  const summary = distribution.summary || {};
  container.innerHTML = [
    ["待生产", dashboard.productionTasks?.summary?.pending || 0, ""],
    ["双平台作品集", summary.dualPlatformAvailable || 0, ""],
    ["公众号待上传", summary.officialPending || 0, summary.officialPending ? "warn" : ""],
    ["归档入口异常", summary.douyinArchiveInvalid || 0, summary.douyinArchiveInvalid ? "warn" : ""]
  ].map(([label, value, className]) => `
    <article class="summary-card ${className}">
      <span>${escapeHtml(label)}</span><strong>${formatNumber(value)}</strong>
    </article>
  `).join("");
}

function collectionStateClass(state) {
  if (state === "available" || state === "confirmed_published") return "good";
  if (state === "reserved_pending_upload" || state === "unknown") return "warn";
  if (state === "invalid" || state === "archived") return "";
  return "";
}

function humanizeCollectionReason(reason) {
  const value = String(reason || "");
  if (/Junction|源目录|入口/.test(value)) return "未找到可用作品文件夹";
  if (/隐藏作品集/.test(value)) return "隐藏作品集";
  if (/缺少/.test(value)) return "尚未设置内容分类";
  return value;
}

function renderCollectionFilters() {
  const collections = dashboard?.distribution?.collections || [];
  const options = [
    ["mobile", "抖音小红书可发"],
    ["official", "微信公众号可发"],
    ["used", "已全部发送"]
  ];
  const container = $("#collectionStageTabs");
  if (!container) return;
  container.innerHTML = options.map(([value, label], index) => {
    const count = collections.filter((item) => item.workflowStage === value).length;
    return `<button type="button" class="workflow-stage-tab ${collectionFilters.stage === value ? "active" : ""}" data-workflow-stage="${value}">
      <span class="stage-number">0${index + 1}</span><span>${label}</span><strong>${formatNumber(count)}</strong>
    </button>`;
  }).join("");
  const pathLine = $("#collectionStagePath");
  if (pathLine) {
    const root = dashboard?.distribution?.stageRoots?.[collectionFilters.stage] || "";
    pathLine.textContent = root
      ? `${options.find(([value]) => value === collectionFilters.stage)?.[1] || "当前阶段"}：${root}`
      : "";
  }
}

function getFilteredCollections() {
  return (dashboard?.distribution?.collections || [])
    .filter((item) => item.workflowStage === collectionFilters.stage);
}

function transportIcon(type) {
  if (type === "usb") return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0-12-3 3m3-3 3 3M8 10H5v4a3 3 0 0 0 3 3h4m-6-7v-2m10 5h3v4a3 3 0 0 1-3 3h-4m6-7v-2"/></svg>';
  if (type === "remote") return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 18H6a4 4 0 0 1-.5-8 6.5 6.5 0 0 1 12.6-1.5A4.8 4.8 0 0 1 18 18h-1.5M9 15l3-3 3 3m-3-3v9"/></svg>';
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9.5a11 11 0 0 1 15 0M7.5 13a6.6 6.6 0 0 1 9 0M10.5 16.5a2.3 2.3 0 0 1 3 0"/><circle cx="12" cy="19" r="1"/></svg>';
}

function renderTransportTag(type, label, state = "pending") {
  return `<span class="transport-tag transport-tag-${type} is-${state}">${transportIcon(type)}<span>${escapeHtml(label)}</span></span>`;
}

function renderDeviceTransportTags(device, compact = false) {
  const tags = [
    renderTransportTag("wifi", device.transports?.wifi ? device.recentlySeen ? "Wi-Fi 最近在线" : "Wi-Fi 在线" : "Wi-Fi 离线", device.transports?.wifi ? device.recentlySeen ? "standby" : "active" : "offline"),
    renderTransportTag("usb", device.transports?.usb ? "USB 已连接" : device.usbCapable ? "USB 大文件备用" : "USB 未连接", device.transports?.usb ? "active" : device.usbCapable ? "standby" : "offline"),
    renderTransportTag("remote", device.transports?.remote ? "远程在线" : device.remoteConfigured ? "远程离线" : "远程待接入", device.transports?.remote ? "active" : "pending")
  ];
  return `<span class="transport-tags ${compact ? "is-compact" : ""}">${tags.join("")}</span>`;
}

function isAppleDevice(device) {
  return /iphone|ipad|ios|apple|苹果/i.test(`${device?.id || ""} ${device?.displayName || ""} ${device?.note || ""}`);
}

function renderDevicePlatformIcon(device, className = "device-platform-icon") {
  const apple = isAppleDevice(device);
  const icon = apple
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.8 12.7c0-2.5 2.1-3.7 2.2-3.8-1.2-1.8-3.1-2-3.8-2-1.6-.2-3.1 1-3.9 1s-2-1-3.3-1c-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.3 2.5 1.3-.1 1.8-.8 3.4-.8 1.6 0 2.1.8 3.4.8 1.4 0 2.3-1.2 3.2-2.5 1-1.4 1.4-2.9 1.4-3-.1 0-3-.9-3-3.9Z"/><path d="M14.2 5.2c.7-.9 1.2-2.2 1.1-3.4-1.1 0-2.4.7-3.2 1.6-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.5-.6 3.2-1.5Z"/></svg>`
    : `<svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m7.4 5.8-1.3-2.2M16.6 5.8l1.3-2.2"/><path d="M6.2 10a5.8 5.8 0 0 1 11.6 0H6.2Z"/><circle cx="9.1" cy="7.8" r=".65"/><circle cx="14.9" cy="7.8" r=".65"/><path d="M6.2 11h11.6v6.1a2.1 2.1 0 0 1-2.1 2.1H8.3a2.1 2.1 0 0 1-2.1-2.1V11Z"/><path d="M4.3 11.5v5M19.7 11.5v5M9 19.2v2.4M15 19.2v2.4"/></svg>`;
  return `<span class="${className}" role="img" aria-label="${apple ? "苹果设备" : "安卓设备"}">${icon}</span>`;
}

function cleanDeviceDisplayName(value = "") {
  return String(value)
    .replace(/^\s*\d+\s*号\s*[｜|·\-]?\s*/, "")
    .replace(/^\s*(公司|个人)\s*[｜|·\-]?\s*/, "")
    .trim() || "未命名设备";
}

function renderTransportGuide() {
  return `<div class="transport-guide" aria-label="可用传送方式">
    ${renderTransportTag("wifi", "Wi-Fi 自动发现", "active")}
    ${renderTransportTag("usb", "USB 大文件备用", "standby")}
    ${renderTransportTag("remote", "远程待接入", "pending")}
  </div>`;
}

function renderCollections() {
  const data = dashboard?.distribution;
  if (!data) return;
  renderCollectionFilters();
  const collections = getFilteredCollections();
  const list = $("#collectionList");
  list.classList.toggle("grid-view", collectionViewMode === "grid");
  const viewToggle = $("[data-collection-view-toggle]");
  if (viewToggle) {
    const nextIsGrid = collectionViewMode !== "grid";
    viewToggle.innerHTML = nextIsGrid
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>';
    viewToggle.title = nextIsGrid ? "切换为网格视图" : "切换为列表视图";
    viewToggle.setAttribute("aria-label", viewToggle.title);
  }
  list.innerHTML = collections.length ? collections.map((collection) => {
    const expanded = expandedCollectionNames.has(collection.name);
    const stageLabel = collection.workflowStage === "mobile" ? "待发送到手机"
      : collection.workflowStage === "official" ? "待微信公众号发布" : "三端已发布 · 已压缩";
    const primaryAction = collection.workflowStage === "mobile"
      ? collection.dualPlatformEligible
        ? `<button class="collection-primary-action" type="button" data-send-package="${escapeHtml(collection.name)}">发到手机</button>`
        : `<button type="button" disabled title="先补充 [泛] 或 [转] 分类和双平台入口">待补分类</button>`
      : collection.workflowStage === "official"
        ? collection.sourceValid
          ? `<button class="collection-primary-action" type="button" data-mark-used="${escapeHtml(collection.name)}">归档到已发送</button>`
          : `<button type="button" disabled title="原作品文件夹为空，不能生成归档压缩包">作品为空</button>`
        : "";
    const emptyActions = !collection.sourceValid && collection.itemCount === 0
      ? `<button type="button" class="collection-empty-action" data-rename-collection="${escapeHtml(collection.name)}" title="重命名作品集">重命名</button><button type="button" class="collection-empty-action danger" data-delete-collection="${escapeHtml(collection.name)}" title="删除空作品集">删除</button>`
      : "";
    const openPathValue = collection.archivePath || collection.sourcePath || "";
    return `
      <article class="collection-row ${expanded ? "expanded" : ""}" data-collection="${escapeHtml(collection.name)}">
        <button class="collection-toggle" type="button" data-collection-toggle="${escapeHtml(collection.name)}" aria-expanded="${expanded}" aria-label="${expanded ? "收起" : "展开"} ${escapeHtml(collection.name)}">
          <span aria-hidden="true">⌄</span>
        </button>
        <div class="collection-title"><strong>${escapeHtml(collection.name)}</strong><span>${stageLabel}</span></div>
        <div class="badge-line"><span class="state-badge ${collection.type === "unclassified" ? "warn" : ""}">${escapeHtml(collection.typeLabel)}</span></div>
        <div class="collection-count">${collection.itemCount || 0}/14</div>
        <div class="collection-stage-actions">
          <button type="button" data-open-collection="${escapeHtml(openPathValue)}">${collection.workflowStage === "used" ? "打开压缩包" : "打开作品"}</button>
          ${primaryAction}
          ${emptyActions}
        </div>
        <div class="collection-children">
          ${expanded ? (collection.items || []).map((item, index) => `
            <button class="collection-work" type="button" data-preview-work="${escapeHtml(item.previewPath || "")}" data-preview-text="${escapeHtml(item.textPath || "")}" data-work-path="${escapeHtml(item.path || "")}">
              <span class="collection-branch" aria-hidden="true">${index === (collection.items || []).length - 1 ? "└" : "├"}</span>
              ${item.previewPath ? `<img src="/file?path=${encodeURIComponent(item.previewPath)}" alt="" />` : `<span class="work-placeholder">${item.imageCount || 0}图</span>`}
              <span><strong>${escapeHtml(item.name)}</strong><small>${item.imageCount || 0} 张图片 · 点击预览</small></span>
            </button>
          `).join("") : `<p class="tree-empty">这个合集暂时没有可预览的作品文件夹</p>`}
        </div>
      </article>
    `;
  }).join("") : `<div class="empty-state"><strong>这个文件夹现在是空的</strong><p>在资源管理器里移动作品后，刷新就会同步显示。</p></div>`;
  if (packageDevicePickerCollectionName && collectionFilters.stage === "mobile") {
    const onlineDevices = DistributionUI.decorateDevices(
      dashboard?.distribution?.devices || [],
      deviceCheckState.onlineDevices || []
    ).filter((device) => device.online);
    list.insertAdjacentHTML("beforeend", `<div class="device-picker-backdrop" data-close-device-picker>
      <section class="device-picker-dialog" role="dialog" aria-modal="true" aria-label="选择当前在线设备">
        <header><div><strong>发到哪台手机？</strong><span>${escapeHtml(packageDevicePickerCollectionName)}</span></div><button type="button" data-close-device-picker aria-label="关闭">×</button></header>
        ${renderTransportGuide()}
        <div class="device-picker-list">
          ${onlineDevices.length ? onlineDevices.map((device) => `<button type="button" data-confirm-package-device="${escapeHtml(device.id)}"><strong>${escapeHtml(device.note || device.displayName)}</strong>${renderDeviceTransportTags(device, true)}</button>`).join("") : `<div class="empty-state"><strong>当前没有在线设备</strong><p>设备上线后刷新即可发送。</p></div>`}
        </div>
      </section>
    </div>`);
  }
}

async function showCollectionWorkPreview(previewPath, textPath, workPath) {
  const previous = $("#collectionPreviewDialog");
  if (previous) previous.remove();
  let textPreview = "";
  if (textPath) {
    try {
      const response = await fetch(`/file?path=${encodeURIComponent(textPath)}`);
      if (response.ok) textPreview = await response.text();
    } catch {
      textPreview = "";
    }
  }
  const dialog = document.createElement("dialog");
  dialog.id = "collectionPreviewDialog";
  dialog.className = "work-preview-dialog";
  dialog.innerHTML = `
    <button class="preview-close" type="button" aria-label="关闭">×</button>
    <div class="preview-stage">
      ${previewPath ? `<img src="/file?path=${encodeURIComponent(previewPath)}" alt="作品预览" />` : `<div class="empty-state"><strong>没有预览图</strong><p>可直接打开作品文件夹查看。</p></div>`}
      ${textPreview ? `<textarea class="collection-text-preview" readonly>${escapeHtml(textPreview)}</textarea>` : ""}
    </div>
    <div class="detail-button-row">
      <button type="button" data-open-preview-folder="${escapeHtml(workPath)}">打开作品文件夹</button>
    </div>
  `;
  document.body.appendChild(dialog);
  dialog.querySelector(".preview-close")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

function renderDistribution() {
  const data = dashboard?.distribution || { devices: [], collections: [] };
  const devices = DistributionUI.decorateDevices(data.devices || [], deviceCheckState.onlineDevices || []);
  const onlineDevices = devices.filter((device) => device.online);
  const trustedOnlineDevices = onlineDevices.filter((device) => device.trusted !== false);
  const unknownOnlineDevices = onlineDevices.filter((device) => device.trusted === false);
  const collections = data.collections || [];
  const mobileCollections = collections.filter((item) => item.workflowStage === "mobile");
  const usedCollections = collections.filter((item) => item.workflowStage === "used");
  // 公众号选项卡：显示所有有内容的作品集 + 空的官方阶段文件夹，按有效性排序
  const officialCollections = collections
    .filter((item) => item.sourceValid || item.workflowStage === "official")
    .sort((a, b) => {
      if (a.sourceValid !== b.sourceValid) return b.sourceValid - a.sourceValid;
      return a.name.localeCompare(b.name, "zh-Hans-CN");
    });
  const visibleMobileCollections = distributionCollectionTypeFilter === "all" ? mobileCollections : mobileCollections.filter((item) => item.type === distributionCollectionTypeFilter);
  const visibleOfficialCollections = distributionCollectionTypeFilter === "all" ? officialCollections : officialCollections.filter((item) => item.type === distributionCollectionTypeFilter);
  const stageRoots = data.stageRoots || {};
  const officialAvailableCount = officialCollections.filter((item) => item.sourceValid).length;
  const tabItems = [
    ["devices", "设备", `${onlineDevices.length}/${devices.length}`],
    ["mobile", "抖音小红书可发", mobileCollections.length],
    ["official", "微信公众号可发", officialAvailableCount],
    ["used", "已全部发送", usedCollections.length],
    ["history", "操作记录", (data.deviceHistory || []).length + (data.officialAccountHistory || []).length + (data.operationHistory || []).length]
  ];

  $("#distributionTabs").innerHTML = tabItems.map(([panel, label, count]) => `
    <button type="button" data-panel="${panel}" class="${activeDistributionPanel === panel ? "active" : ""}">
      <span>${label}</span><b>${count}</b>
    </button>
  `).join("");

  const stageHeader = (stage, title, description) => `
    <header class="distribution-stage-header">
      <div>
        <span class="stage-folder-kicker">真实文件夹</span>
        <h3>${title}</h3>
        <p>${description}</p>
        <code>${escapeHtml(stageRoots[stage] || "")}</code>
      </div>
      <button type="button" data-open-stage-root="${stage}">打开文件夹</button>
    </header>
  `;
  const typeTabs = (rows) => `
    <div class="collection-type-tabs" aria-label="作品集类型">
      <button type="button" data-stage-type-filter="all" class="${distributionCollectionTypeFilter === "all" ? "active" : ""}">
        全部 <b>${rows.length}</b>
      </button>
      <button type="button" data-stage-type-filter="traffic" class="${distributionCollectionTypeFilter === "traffic" ? "active" : ""}">
        泛流量帖 <b>${rows.filter((item) => item.type === "traffic").length}</b>
      </button>
      <button type="button" data-stage-type-filter="conversion" class="${distributionCollectionTypeFilter === "conversion" ? "active" : ""}">
        精准流量帖 <b>${rows.filter((item) => item.type === "conversion").length}</b>
      </button>
      <button type="button" data-stage-type-filter="unclassified" class="${distributionCollectionTypeFilter === "unclassified" ? "active" : ""}">
        未分类 <b>${rows.filter((item) => item.type === "unclassified").length}</b>
      </button>
    </div>
  `;
  const classificationSelect = (collection) => distributionCollectionTypeFilter === "unclassified" ? `
    <label class="classification-select">
      <select data-classify-collection="${escapeHtml(collection.name)}">
        <option value="traffic" ${collection.type === "traffic" ? "selected" : ""}>泛流量帖</option>
        <option value="conversion" ${collection.type === "conversion" ? "selected" : ""}>精准流量帖</option>
        <option value="unclassified" ${collection.type === "unclassified" ? "selected" : ""}>未分类</option>
      </select>
    </label>
  ` : "";
  const devicePicker = () => packageDevicePickerCollectionName ? `
    <div class="device-picker-backdrop" data-close-device-picker>
      <section class="device-picker-dialog" role="dialog" aria-modal="true" aria-label="选择当前在线设备">
        <header><div><strong>发送作品包</strong><span>${escapeHtml(packageDevicePickerCollectionName)}</span></div><button type="button" data-close-device-picker aria-label="关闭">×</button></header>
        ${renderTransportGuide()}
        <div class="device-picker-list">
          ${trustedOnlineDevices.length ? trustedOnlineDevices.map((device) => `
            <button type="button" data-confirm-package-device="${escapeHtml(device.id)}">
              ${renderDevicePlatformIcon(device, "picker-platform-icon")}
              <strong>${escapeHtml(cleanDeviceDisplayName(device.note || device.displayName))}</strong>
              ${renderDeviceTransportTags(device, true)}
            </button>
          `).join("") : `<div class="empty-state"><strong>当前没有在线设备</strong><p>设备上线后刷新即可发送。</p></div>`}
        </div>
      </section>
    </div>
  ` : "";
  const deviceRows = devices.map((device) => {
    const sendEnabled = device.online && device.trusted !== false;
    return `
    <article class="device-row ${device.online ? "is-online" : "is-offline"} ${device.trusted === false ? "is-untrusted" : "is-trusted"}" data-device-id="${escapeHtml(device.id)}">
      ${renderDevicePlatformIcon(device)}
      <div class="device-copy">
        ${device.trusted === false
          ? `<strong class="editable-device-name">${escapeHtml(cleanDeviceDisplayName(device.displayName))}</strong>`
          : `<button class="editable-device-name" type="button" data-edit-device-note="${escapeHtml(device.id)}" title="点击编辑设备名称或编号">${escapeHtml(cleanDeviceDisplayName(device.note || device.displayName))}</button>`}
        <p>${escapeHtml(cleanDeviceDisplayName(device.displayName))} · ${escapeHtml(device.ownerGroup || "未确认归属")} · ${device.online ? "在线" : "离线"}${device.workCount == null ? "" : ` · 手机储备 ${device.workCount} 个`}</p>
      </div>
      <div class="badge-line device-status-badges">
        ${renderDeviceTransportTags(device)}
        <span class="state-badge ${device.trusted === false ? "bad" : "good"}">${escapeHtml(device.trustLabel || (device.trusted === false ? "陌生设备" : "已确认设备"))}</span>
        <span class="state-badge ${sendEnabled ? "good" : "bad"}">${sendEnabled ? "可发送" : device.trusted === false ? "禁止传送" : "当前离线"}</span>
      </div>
      <div class="device-actions">
        <button type="button" data-device-action="traffic" data-device="${escapeHtml(device.aliases?.[0] || device.displayName)}" ${sendEnabled ? "" : "disabled"}>补泛流量</button>
        <button type="button" data-device-action="conversion" data-device="${escapeHtml(device.aliases?.[0] || device.displayName)}" ${sendEnabled ? "" : "disabled"}>补精准流量</button>
        <button type="button" data-upload-other="${escapeHtml(device.id)}" ${sendEnabled ? "" : "disabled"}>上传其他</button>
      </div>
      ${uploadChoiceDeviceId === device.id ? `<div class="upload-choice-panel">
        <span>选择要发送给 ${escapeHtml(device.note || device.displayName)} 的内容</span>
        <button type="button" data-generic-source="file" data-generic-device="${escapeHtml(device.id)}">选择文件</button>
        <button type="button" data-generic-source="folder" data-generic-device="${escapeHtml(device.id)}">选择文件夹</button>
        <button type="button" data-close-upload-choice>取消</button>
      </div>` : ""}
    </article>
  `; }).join("");

  $("#distributionDevices").innerHTML = `
    <div class="distribution-stats">
      <article class="summary-card"><span>可信设备在线</span><strong>${trustedOnlineDevices.length}<small> / ${devices.filter((item) => item.trusted !== false).length} 台</small></strong></article>
      <article class="summary-card"><span>陌生设备</span><strong>${unknownOnlineDevices.length}<small> 台</small></strong></article>
      <article class="summary-card"><span>进行中任务</span><strong>${[...distributionTransferUiTasks.values(), ...genericTransferUiTasks.values()].filter((task) => ["running", "cancelling"].includes(task.state)).length}<small> 个</small></strong></article>
    </div>
    ${renderTransferTasks()}
    <div class="device-list">${deviceRows || `<div class="empty-state"><strong>暂未发现设备</strong><p>刷新后会重新检测 Wi-Fi、USB 和远程连接。</p></div>`}</div>
  `;

  $("#distributionMobile").innerHTML = `
    ${stageHeader("mobile", `抖音小红书可发 · ${mobileCollections.length} 个作品集`, "这里的真实文件夹，就是待发送到手机并发布抖音、小红书的库存。")}
    ${typeTabs(mobileCollections)}
    ${renderTransferTasks()}
    <div class="package-list">${visibleMobileCollections.length ? visibleMobileCollections.map((collection) => {
      const sendable = collection.sourceValid && collection.dualPlatformEligible;
      const issueBadge = sendable ? ""
        : !collection.sourceValid
          ? `<span class="state-badge bad">作品为空</span>`
          : collection.type === "unclassified"
            ? `<span class="state-badge warn">待分类</span>`
            : `<span class="state-badge warn">${escapeHtml(collection.exclusionReasons?.[0] || "当前不可发送")}</span>`;
      return `<article class="distribution-package-row ${selectedDistributionCollectionName === collection.name ? "active" : ""}" data-package-name="${escapeHtml(collection.name)}">
        <div class="package-select">
          <span class="package-radio" aria-hidden="true"></span>
          <span><strong>${escapeHtml(collection.name)}</strong><small>${collection.itemCount || 0} 个作品 · ${escapeHtml(collection.typeLabel || "")}</small></span>
        </div>
        ${issueBadge ? `<div class="badge-line">${issueBadge}</div>` : ""}
        <div class="device-actions">
          <button type="button" data-open-collection="${escapeHtml(collection.sourcePath || "")}">打开作品包</button>
          <button type="button" data-send-package="${escapeHtml(collection.name)}" ${sendable ? "" : "disabled"}>选择设备发送</button>
          ${classificationSelect(collection)}
        </div>
      </article>`;
    }).join("") : `<div class="empty-state"><strong>这个分类暂时没有作品</strong><p>切换另一个分类，或打开真实文件夹核对。</p></div>`}</div>
    ${devicePicker()}
  `;

  const stageBadgeLabel = (stage) => {
    if (stage === "official") return '<span class="stage-badge official">公众号库</span>';
    if (stage === "mobile") return '<span class="stage-badge mobile">手机库</span>';
    if (stage === "used") return '<span class="stage-badge used">已归档</span>';
    return "";
  };
  $("#distributionOfficial").innerHTML = `
    ${stageHeader("official", `微信公众号可发 · ${officialAvailableCount} 个可用 / ${officialCollections.length} 个总计`, "左侧选作品集 → 右侧选帖子 → 检查图片和文案 → 点「创建草稿」。首次使用请先完成下方账号配置。")}
    <div class="official-launcher">
      <div><strong>微信公众号草稿发布器</strong><p>自动上传图片和文案到公众号草稿箱，无需手动拖传。</p></div>
      <div class="official-launcher-actions">
        <button type="button" class="secondary-button" data-open-official-site>公众号官网</button>
        <button type="button" class="secondary-button" data-wechat-draft-settings>账号设置</button>
      </div>
    </div>
    ${renderWechatAccountStatus()}
    ${typeTabs(officialCollections)}
    <div class="wechat-draft-layout">
      <aside class="wechat-draft-sidebar">
        <section class="workbench-card wechat-draft-collection-card">
          <header class="workbench-card-head">
            <div><span class="workbench-step">01</span><strong>作品集</strong><small>${visibleOfficialCollections.length} 个可选</small></div>
          </header>
          <nav class="wechat-draft-collection-list">
            ${visibleOfficialCollections.length ? visibleOfficialCollections.map((collection) => `
              <article class="distribution-package-row ${wechatDraftSelectedCollection === collection.name ? "active" : ""}" data-wechat-collection="${escapeHtml(collection.name)}">
                <div class="package-select"><span class="package-radio" aria-hidden="true"></span><span><strong>${escapeHtml(collection.name)}</strong><small>${collection.itemCount || 0} 个作品 · ${escapeHtml(collection.typeLabel || "")}</small></span></div>
                <div class="badge-line">${stageBadgeLabel(collection.workflowStage)}<span class="state-badge ${collection.sourceValid ? "good" : "bad"}">${collection.sourceValid ? "可发布" : "作品为空"}</span>${!collection.sourceValid && collection.itemCount === 0 ? `<button type="button" class="collection-empty-action" data-rename-collection="${escapeHtml(collection.name)}" title="重命名作品集">重命名</button><button type="button" class="collection-empty-action danger" data-delete-collection="${escapeHtml(collection.name)}" title="删除空作品集">删除</button>` : ""}</div>
              </article>
            `).join("") : `<div class="empty-state"><strong>这个分类暂时没有作品</strong><p>切换另一个分类，或打开真实文件夹核对。</p></div>`}
          </nav>
        </section>
        <section class="workbench-card wechat-draft-posts-card">
          <header class="workbench-card-head">
            <div><span class="workbench-step">02</span><strong>帖子列表</strong><small id="wechatPostsHint">${wechatDraftSelectedCollection ? "加载中..." : "请先选择作品集"}</small></div>
          </header>
          <div class="wechat-batch-bar" id="wechatBatchBar"></div>
          <div class="wechat-draft-post-panel" id="wechatDraftRight">
            ${wechatDraftSelectedCollection ? `<div class="empty-state"><strong>加载中...</strong><p>正在扫描帖子</p></div>` : `<div class="empty-state"><strong>选择上方作品集</strong><p>选择一个作品集后，这里会显示帖子列表。</p></div>`}
          </div>
        </section>
      </aside>
      <section class="workbench-card wechat-draft-detail-card">
        <header class="workbench-card-head">
          <div><span class="workbench-step">03</span><strong>草稿检查台</strong><small>预览图片、检查文案、创建草稿</small></div>
        </header>
        <div class="wechat-draft-detail-body" id="wechatDraftDetailPanel">
          <div class="empty-state"><strong>选择一篇帖子查看详情</strong><p>点击左侧帖子可预览图片、检查标题和正文，再创建草稿。</p></div>
        </div>
      </section>
    </div>
  `;

  $("#distributionUsed").innerHTML = `
    ${stageHeader("used", `已全部发送 · ${usedCollections.length} 个压缩包`, "这里只存三端都已发布的 ZIP。压缩校验成功后，原作品文件夹会被删除。")}
    <div class="package-list">${usedCollections.length ? usedCollections.map((collection) => `
      <article class="distribution-package-row">
        <div class="package-select"><span class="package-radio archived" aria-hidden="true"></span><span><strong>${escapeHtml(collection.name)}</strong><small>归档压缩包 · 以真实 ZIP 为准</small></span></div>
        <div class="badge-line"><span class="state-badge good">三端已发布</span></div>
        <div class="device-actions"><button type="button" data-open-collection="${escapeHtml(collection.archivePath || "")}" ${collection.archivePath ? "" : "disabled"}>打开压缩包</button></div>
      </article>
    `).join("") : `<div class="empty-state"><strong>已发送文件夹为空</strong><p>完成三端发布并归档后，会在这里生成 ZIP。</p></div>`}</div>
  `;

  $("#distributionHistory").innerHTML = `
    <header class="distribution-stage-header history-heading"><div><span class="stage-folder-kicker">可追溯流水</span><h3>操作记录</h3><p>文件夹是最终事实；这里记录设备传送、公众号确认和结果状态。</p></div></header>
    ${renderTransferTasks()}
    <div class="distribution-history-grid">
      <section><h4>设备传送记录</h4>${renderDistributionRecords(data.deviceHistory || [], "device")}</section>
      <section><h4>公众号与归档记录</h4>${renderDistributionRecords(data.officialAccountHistory || [], "official")}</section>
      <section><h4>文件夹操作记录</h4>${(data.operationHistory || []).length ? `<div class="record-list">${data.operationHistory.map((row) => `
        <article class="record-row">
          <div class="device-number">夹</div>
          <div><h3>${escapeHtml(row.action || "文件夹操作")}</h3><p>${escapeHtml(row.collection || "")}${row.targetCollection ? ` → ${escapeHtml(row.targetCollection)}` : ""} · ${escapeHtml(row.time || "")}</p></div>
          <span class="state-badge good">${escapeHtml(row.status || "completed")}</span>
          <div></div>
        </article>
      `).join("")}</div>` : `<div class="empty-state"><strong>暂无文件夹操作</strong><p>分类改名、阶段移动和归档后会显示在这里。</p></div>`}</section>
      <section><h4>自动检测与分发记录</h4>${(data.automationHistory || []).length ? `<div class="record-list">${data.automationHistory.map((row) => `
        <article class="record-row">
          <div class="device-number">自</div>
          <div><h3>${escapeHtml(row.message || "自动检测")}</h3><p>${escapeHtml(row.device || "")}${row.collection ? ` · ${escapeHtml(row.collection)}` : ""} · ${escapeHtml(row.time || "")}</p></div>
          <span class="state-badge ${row.event === "failed" ? "bad" : "good"}">${escapeHtml(row.progress == null ? row.event || "已记录" : `${row.progress}%`)}</span>
          <div></div>
        </article>
      `).join("")}</div>` : `<div class="empty-state"><strong>暂无自动分发记录</strong><p>开启自动分发后，开始、逐项完成与失败都会记录。</p></div>`}</section>
    </div>
  `;
  showDistributionPanel(activeDistributionPanel);
  renderDistributionReserveAlert();
}

// ─── 微信公众号草稿发布器 ─────────────────────────────

async function loadWechatDraftPosts(collectionName) {
  wechatDraftSelectedCollection = collectionName;
  wechatDraftSelectedPost = null;
  wechatDraftPosts = [];
  renderDistribution();
  const right = $("#wechatDraftRight");
  if (!right) return;
  right.innerHTML = `<div class="empty-state"><strong>加载中...</strong><p>正在扫描 ${escapeHtml(collectionName)} 中的帖子</p></div>`;
  const detail = $("#wechatDraftDetailPanel");
  if (detail) detail.innerHTML = `<div class="empty-state"><strong>选择一篇帖子查看详情</strong><p>点击左侧帖子可预览图片、检查标题和正文，再创建草稿。</p></div>`;
  try {
    const result = await api(`/api/wechat-draft/posts/${encodeURIComponent(collectionName)}`);
    wechatDraftPosts = result.posts || [];
    renderWechatDraftRight();
  } catch (error) {
    right.innerHTML = `<div class="empty-state"><strong>扫描失败</strong><p>${escapeHtml(error.message || String(error))}</p></div>`;
    const bar = $("#wechatBatchBar");
    if (bar) { bar.className = "wechat-batch-bar"; bar.innerHTML = ""; }
  }
}

function renderWechatDraftRight() {
  const right = $("#wechatDraftRight");
  const detail = $("#wechatDraftDetailPanel");
  const batchBar = $("#wechatBatchBar");
  if (!right) return;

  // 更新帖子列表区提示
  const hint = $("#wechatPostsHint");
  if (hint) {
    hint.textContent = wechatDraftPosts.length ? `${wechatDraftPosts.length} 篇帖子` : "请先选择作品集";
  }

  // 渲染批量操作栏到独立容器
  if (batchBar) {
    const validCount = wechatDraftPosts.filter((p) => p.valid).length;
    const modeLabel = wechatBatchDryRun ? "测试模式" : "正式模式";
    const modeClass = wechatBatchDryRun ? "batch-mode-dryrun" : "batch-mode-formal";
    const toggleLabel = wechatBatchDryRun ? "切到正式模式" : "切到测试模式";

    if (wechatDraftPosts.length > 0) {
      batchBar.className = `wechat-batch-bar ${modeClass}`;
      batchBar.innerHTML = `
        <label class="checker-option batch-select-all-label"><input type="checkbox" id="wechatBatchSelectAll" /> 全选</label>
        <span class="batch-mode-indicator">${modeLabel}</span>
        <span class="batch-valid-count">${validCount}/${wechatDraftPosts.length} 篇可用</span>
        <div class="batch-bar-actions">
          <button type="button" class="secondary-button" id="wechatBatchDryRunToggle" ${validCount > 0 ? "" : "disabled"}>${toggleLabel}</button>
          <button type="button" class="primary-button" id="wechatBatchCreateBtn" ${validCount > 0 ? "" : "disabled"}>批量创建</button>
        </div>
      `;
    } else {
      batchBar.className = "wechat-batch-bar";
      batchBar.innerHTML = "";
    }
  }

  if (!wechatDraftPosts.length) {
    right.innerHTML = `<div class="empty-state"><strong>没有找到帖子</strong><p>该作品集中没有有效的帖子（需要至少1张图片和1个TXT文案）。</p></div>`;
    if (detail) detail.innerHTML = `<div class="empty-state"><strong>选择一篇帖子查看详情</strong><p>点击左侧帖子可预览图片、检查标题和正文，再创建草稿。</p></div>`;
    return;
  }

  const postsList = wechatDraftPosts.map((post, index) => `
    <article class="wechat-draft-post-card ${wechatDraftSelectedPost?.path === post.path ? "active" : ""} ${post.valid ? "" : "invalid"}" data-wechat-post-index="${index}">
      <div class="post-card-header">
        <label class="post-card-checkbox" onclick="event.stopPropagation()">
          <input type="checkbox" class="wechat-batch-checkbox" data-post-index="${index}" ${post.valid ? "" : "disabled"} />
        </label>
        <strong>${escapeHtml(post.name)}</strong>
        <span class="state-badge ${post.valid ? "good" : "bad"}">${post.valid ? `${post.imageCount}图` : "无效"}</span>
      </div>
      ${post.invalidReason ? `<small class="post-invalid-reason">${escapeHtml(post.invalidReason)}</small>` : ""}
      <small class="post-card-title">${escapeHtml(post.title || "(无标题)")}</small>
    </article>
  `).join("");

  // 帖子列表 → #wechatDraftRight
  right.innerHTML = `
    <div class="wechat-batch-progress" id="wechatBatchProgress" hidden></div>
    <div class="wechat-draft-post-list">
      ${postsList}
    </div>
  `;

  // 草稿检查台 → #wechatDraftDetailPanel
  if (!detail) return;

  if (wechatDraftSelectedPost) {
    const post = wechatDraftSelectedPost;
    const titleChars = Array.from(post.title || "").filter((c) => !/\s/.test(c)).length;
    const bodyChars = Array.from(post.body || "").filter((c) => !/\s/.test(c)).length;
    const titleWarning = titleChars > 24;
    const bodyWarning = bodyChars > 1000;
    const images = post.images || [];

    detail.innerHTML = `
      <div class="wechat-draft-checker">
        <div class="checker-header">
          <h4>${escapeHtml(post.name)}</h4>
          <span class="state-badge ${post.valid ? "good" : "bad"}">${post.valid ? "可创建草稿" : "无效帖子"}</span>
        </div>

        <div class="checker-section">
          <label>图片（${images.length}张，按上传顺序）</label>
          <div class="checker-image-grid">
            ${images.map((img, i) => `
              <div class="checker-image-item">
                <img src="/api/wechat-draft/image-preview?path=${encodeURIComponent(post.path + "\\" + img)}" alt="${escapeHtml(img)}" loading="lazy" />
                <span class="image-order">${i + 1}</span>
                <small>${escapeHtml(img)}</small>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="checker-section">
          <label>标题 <span class="char-count ${titleWarning ? "warn" : ""}">${titleChars} 字${titleWarning ? " · 超过24字建议缩短" : ""}</span></label>
          <input type="text" id="wechatDraftTitle" value="${escapeHtml(post.title || "")}" placeholder="标题" class="checker-title-input" />
        </div>

        <div class="checker-section">
          <label>正文 <span class="char-count ${bodyWarning ? "warn" : ""}">${bodyChars} 字${bodyWarning ? " · 超过1000字（仍可创建）" : ""}</span></label>
          <textarea id="wechatDraftBody" rows="8" placeholder="正文内容" class="checker-body-input">${escapeHtml(post.body || "")}</textarea>
        </div>

        <div class="checker-section checker-options">
          <label class="checker-option">
            <input type="checkbox" id="wechatDraftForce" />
            <span>强制重复创建</span>
          </label>
        </div>

        <div class="checker-actions">
          <button type="button" class="primary-button" id="wechatDraftCreateBtn" ${post.valid ? "" : "disabled"} ${wechatDraftCreating ? "disabled" : ""}>
            ${wechatDraftCreating ? "创建中..." : `创建草稿（${wechatBatchDryRun ? "测试模式" : "正式模式"}）`}
          </button>
        </div>

        <div class="checker-status" id="wechatDraftStatus"></div>
      </div>
    `;
  } else {
    detail.innerHTML = `<div class="empty-state"><strong>选择一篇帖子查看详情</strong><p>点击左侧帖子可预览图片、检查标题和正文，再创建草稿。</p></div>`;
  }
}

async function createWechatDraft() {
  if (wechatDraftCreating || !wechatDraftSelectedPost) return;
  wechatDraftCreating = true;
  const btn = $("#wechatDraftCreateBtn");
  const status = $("#wechatDraftStatus");
  if (btn) btn.textContent = "创建中...";
  if (status) status.innerHTML = `<span class="state-badge warn">正在创建草稿...</span>`;

  const title = $("#wechatDraftTitle")?.value || "";
  const body = $("#wechatDraftBody")?.value || "";
  const dryRun = wechatBatchDryRun;
  const forceCreate = $("#wechatDraftForce")?.checked === true;

  try {
    const result = await api("/api/wechat-draft/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postPath: wechatDraftSelectedPost.path,
        title,
        body,
        dryRun,
        forceCreate,
        account: wechatDraftSettings?.defaultAccount || "main"
      })
    });

    if (result.success) {
      const dryRunTag = result.dryRun ? '<span class="state-badge warn">测试模式</span>' : '<span class="state-badge good">正式草稿</span>';
      const bodyWarning = result.bodyWarning ? '<span class="state-badge warn">正文超长</span>' : "";
      status.innerHTML = `
        <div class="checker-success">
          ${dryRunTag} ${bodyWarning}
          <strong>草稿创建成功</strong>
          <p>草稿 ID: <code>${escapeHtml(result.draftMediaId || "")}</code></p>
          <small>${escapeHtml(result.message || "")}</small>
        </div>
      `;
    } else if (result.duplicate) {
      status.innerHTML = `
        <div class="checker-warning">
          <span class="state-badge warn">重复</span>
          <strong>${escapeHtml(result.message || "该帖子已创建过草稿")}</strong>
          <p>上次创建时间: ${escapeHtml(result.previousRecord?.createdAt || "")}</p>
          <p>草稿 ID: <code>${escapeHtml(result.previousRecord?.draftMediaId || "")}</code></p>
          <small>勾选"强制重复创建"可创建新草稿</small>
        </div>
      `;
    } else {
      status.innerHTML = `
        <div class="checker-error">
          <span class="state-badge bad">失败</span>
          <strong>创建失败</strong>
          <p>${escapeHtml(result.error || "未知错误")}</p>
          ${result.stage ? `<small>失败阶段: ${escapeHtml(result.stage)}</small>` : ""}
        </div>
      `;
    }
  } catch (error) {
    if (status) status.innerHTML = `
      <div class="checker-error">
        <span class="state-badge bad">错误</span>
        <strong>请求失败</strong>
        <p>${escapeHtml(error.message || String(error))}</p>
      </div>
    `;
  } finally {
    wechatDraftCreating = false;
    if (btn) btn.textContent = `创建草稿（${wechatBatchDryRun ? "测试模式" : "正式模式"}）`;
  }
}

// ─── 批量草稿队列 ─────────────────────────────────────

let wechatBatchProcessing = false;
let wechatBatchDryRun = true;

function getSelectedBatchPosts() {
  const checkboxes = document.querySelectorAll(".wechat-batch-checkbox:checked");
  const indices = Array.from(checkboxes).map((cb) => Number(cb.dataset.postIndex));
  return indices.map((i) => wechatDraftPosts[i]).filter(Boolean);
}

async function startWechatBatchCreate() {
  if (wechatBatchProcessing) return;
  const selected = getSelectedBatchPosts();
  if (!selected.length) {
    alert("请先勾选要批量创建的帖子");
    return;
  }

  const posts = selected.map((p) => ({
    postPath: p.path,
    title: p.title || p.name,
    body: p.body || ""
  }));

  const progress = $("#wechatBatchProgress");
  const btn = $("#wechatBatchCreateBtn");
  if (btn) btn.disabled = true;

  try {
    const createResult = await api("/api/wechat-draft/batch/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ posts })
    });

    wechatBatchProcessing = true;
    if (progress) progress.hidden = false;
    renderWechatBatchProgress({ status: "running", total: posts.length, success: 0, failed: 0, skipped: 0, pending: posts.length, items: [] });

    await processWechatBatchNext(createResult.batchId);
  } catch (error) {
    if (progress) {
      progress.hidden = false;
      progress.innerHTML = `<div class="checker-error"><span class="state-badge bad">错误</span><strong>创建批量队列失败</strong><p>${escapeHtml(error.message || String(error))}</p></div>`;
    }
    if (btn) btn.disabled = false;
  }
}

async function processWechatBatchNext(batchId) {
  const progress = $("#wechatBatchProgress");
  try {
    const result = await api("/api/wechat-draft/batch/process-next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchId,
        dryRun: wechatBatchDryRun,
        account: wechatDraftSettings?.defaultAccount || "main"
      })
    });

    const status = await api("/api/wechat-draft/batch/status");
    renderWechatBatchProgress(status);

    if (!result.done && wechatBatchProcessing) {
      setTimeout(() => processWechatBatchNext(batchId), 500);
    } else {
      wechatBatchProcessing = false;
      const btn = $("#wechatBatchCreateBtn");
      if (btn) btn.disabled = false;
      // 完成通知
      const modeText = wechatBatchDryRun ? "测试模式" : "正式模式";
      const successCount = status.success || 0;
      const failedCount = status.failed || 0;
      const skippedCount = status.skipped || 0;
      toast(`批量${modeText}完成：成功 ${successCount} 篇，失败 ${failedCount} 篇，跳过 ${skippedCount} 篇`);
    }
  } catch (error) {
    if (progress) {
      progress.innerHTML = `<div class="checker-error"><span class="state-badge bad">错误</span><strong>处理失败</strong><p>${escapeHtml(error.message || String(error))}</p></div>`;
    }
    wechatBatchProcessing = false;
    const btn = $("#wechatBatchCreateBtn");
    if (btn) btn.disabled = false;
  }
}

function renderWechatBatchProgress(status) {
  const progress = $("#wechatBatchProgress");
  if (!progress) return;

  const total = status.total || 0;
  const done = (status.success || 0) + (status.failed || 0) + (status.skipped || 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const itemsHtml = (status.items || []).map((item) => {
    const badge = item.status === "success" ? '<span class="state-badge good">成功</span>'
      : item.status === "failed" ? '<span class="state-badge bad">失败</span>'
      : item.status === "skipped" ? '<span class="state-badge warn">跳过</span>'
      : item.status === "processing" ? '<span class="state-badge warn">处理中</span>'
      : '<span class="state-badge">待处理</span>';
    return `<div class="batch-progress-item">${badge} <span>${escapeHtml(item.title || item.postPath || "")}</span>${item.error ? `<small>${escapeHtml(item.error)}</small>` : ""}</div>`;
  }).join("");

  progress.innerHTML = `
    <div class="batch-progress-header">
      <strong>批量进度 ${pct}%（${done}/${total}）</strong>
      <span class="state-badge good">成功 ${status.success || 0}</span>
      <span class="state-badge bad">失败 ${status.failed || 0}</span>
      <span class="state-badge warn">跳过 ${status.skipped || 0}</span>
      ${wechatBatchProcessing ? '<button type="button" class="secondary-button" id="wechatBatchCancelBtn">取消</button>' : '<button type="button" class="secondary-button" id="wechatBatchClearBtn">清空记录</button>'}
    </div>
    <div class="batch-progress-bar"><div class="batch-progress-fill" style="width:${pct}%"></div></div>
    <div class="batch-progress-items">${itemsHtml}</div>
  `;
}

async function cancelWechatBatchCreate() {
  wechatBatchProcessing = false;
  try {
    await api("/api/wechat-draft/batch/cancel", { method: "POST" });
    const status = await api("/api/wechat-draft/batch/status");
    renderWechatBatchProgress(status);
  } catch {
    // 忽略错误
  }
  const btn = $("#wechatBatchCreateBtn");
  if (btn) btn.disabled = false;
}

async function clearWechatBatchRecords() {
  try {
    await api("/api/wechat-draft/batch/clear", { method: "POST" });
    const progress = $("#wechatBatchProgress");
    if (progress) {
      progress.hidden = true;
      progress.innerHTML = "";
    }
  } catch {
    // 忽略错误
  }
}

// ─── 微信公众号账号状态展示 ──────────────────────────

function renderWechatAccountStatus() {
  // 返回占位容器，异步加载实际状态
  setTimeout(() => loadWechatAccountStatus(), 0);
  return '<div id="wechatAccountStatus" class="wechat-account-status loading"><span class="status-dot pulse"></span>正在检查账号配置...</div>';
}

async function loadWechatAccountStatus() {
  const container = $("#wechatAccountStatus");
  if (!container) return;

  let status;
  try {
    status = await api("/api/wechat-draft/account-status");
  } catch {
    container.className = "wechat-account-status error";
    container.innerHTML = '<span class="status-dot bad"></span>无法获取账号状态，请检查工作台是否正常运行。';
    return;
  }

  if (!status.accounts || status.accounts.length === 0) {
    container.className = "wechat-account-status not-configured";
    container.innerHTML = `
      <div class="account-status-card not-ready">
        <div class="account-status-header">
          <span class="status-dot warn"></span>
          <strong>还没配置公众号账号</strong>
        </div>
        <div class="account-status-guide">
          <p>按以下 3 步完成配置，配好后就能一键创建草稿：</p>
          <ol>
            <li>点上方<strong>「账号设置」</strong>按钮，填写 AppID 和 AppSecret</li>
            <li>到<strong>公众号后台 → 开发 → 基本配置 → IP白名单</strong>，添加本机 IP（否则 API 调用会被拒绝）</li>
            <li>保存后<strong>重启工作台</strong>（关掉再打开），然后点下方<strong>「测试连接」</strong>验证</li>
          </ol>
        </div>
      </div>
    `;
    return;
  }

  const accountsHtml = status.accounts.map((acc) => {
    const dots = [];
    if (acc.appIdSet) {
      dots.push('<span class="config-check ok">AppID 已填写</span>');
    } else {
      dots.push('<span class="config-check no">AppID 未填写</span>');
    }
    if (acc.appSecretSet) {
      dots.push('<span class="config-check ok">AppSecret 已设置</span>');
    } else {
      dots.push('<span class="config-check no">AppSecret 未设置（需重启工作台）</span>');
    }
    return `
      <div class="account-status-item ${acc.ready ? "ready" : "not-ready"}">
        <div class="account-status-header">
          <span class="status-dot ${acc.ready ? "good" : "warn"}"></span>
          <strong>${escapeHtml(acc.name)}</strong>
          ${acc.ready ? '<span class="account-ready-tag">可创建草稿</span>' : '<span class="account-ready-tag warn">未就绪</span>'}
        </div>
        <div class="account-status-details">
          <small>AppID: ${escapeHtml(acc.appId || "(未填写)")}</small>
          <div class="config-checks">${dots.join("")}</div>
        </div>
        <button type="button" class="test-connection-btn" data-test-connection="${escapeHtml(acc.key)}">测试连接</button>
      </div>
    `;
  }).join("");

  const guideHtml = status.anyReady ? "" : `
    <div class="account-setup-hint">
      <p>配置还没完成，按以下步骤操作：</p>
      <ol>
        <li>点上方<strong>「账号设置」</strong>，确保 AppID 和 AppSecret 都已填写并保存</li>
        <li>如果刚保存了 AppSecret，需要<strong>重启工作台</strong>（关掉再打开）让环境变量生效</li>
        <li>到<strong>公众号后台 → 开发 → 基本配置 → IP白名单</strong>，添加本机 IP</li>
        <li>回来点<strong>「测试连接」</strong>，看到"连接成功"就可以创建草稿了</li>
      </ol>
    </div>
  `;

  container.className = "wechat-account-status";
  container.innerHTML = `
    <div class="account-status-card">
      ${accountsHtml}
      ${guideHtml}
    </div>
  `;
}

async function testWechatConnection(accountKey) {
  const btn = document.querySelector(`[data-test-connection="${accountKey}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "正在测试...";
  }
  try {
    const result = await api("/api/wechat-draft/test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: accountKey })
    });
    if (result.success) {
      toast(result.message || "连接成功！配置有效，可以创建草稿了。");
      if (btn) {
        btn.textContent = "连接成功";
        btn.classList.add("success");
      }
    } else {
      const msg = result.hint ? `${result.error}\n${result.hint}` : (result.error || "连接失败");
      toast(msg, "error");
      if (btn) {
        btn.textContent = "连接失败，点此重试";
        btn.classList.add("fail");
      }
    }
  } catch (error) {
    let msg = error.message || String(error);
    // 尝试解析 JSON 响应中的 hint
    try {
      const parsed = JSON.parse(msg);
      msg = parsed.hint ? `${parsed.error}\n${parsed.hint}` : (parsed.error || msg);
    } catch {}
    toast(msg, "error");
    if (btn) {
      btn.textContent = "连接失败，点此重试";
      btn.classList.add("fail");
    }
  } finally {
    if (btn) {
      btn.disabled = false;
    }
  }
}

async function openWechatDraftSettings() {
  try {
    wechatDraftSettings = await api("/api/wechat-draft/settings");
  } catch {
    wechatDraftSettings = { defaultAccount: "main", accounts: {} };
  }

  const accounts = wechatDraftSettings.accounts || {};
  const accountKeys = Object.keys(accounts);
  const accountHtml = accountKeys.length ? accountKeys.map((key) => {
    const acc = accounts[key];
    return `
      <div class="settings-account-row" data-account-key="${escapeHtml(key)}">
        <strong>${escapeHtml(acc.name || key)}</strong>
        <small>AppID: ${escapeHtml(acc.appId || "(未设置)")} · 密钥环境变量: ${escapeHtml(acc.appSecretEnv || `WECHAT_${key.toUpperCase()}_APP_SECRET`)}</small>
        <button type="button" data-edit-account="${escapeHtml(key)}">编辑</button>
      </div>
    `;
  }).join("") : '<p>暂无账号配置</p>';

  const overlay = document.createElement("div");
  overlay.className = "device-picker-backdrop";
  overlay.innerHTML = `
    <section class="device-picker-dialog wechat-draft-settings-dialog" role="dialog" aria-modal="true">
      <header>
        <div><strong>微信公众号账号设置</strong></div>
        <button type="button" data-close-settings aria-label="关闭">×</button>
      </header>
      <div class="settings-dialog-body">
        <div class="settings-section">
          <label>默认账号</label>
          <input type="text" id="settingsDefaultAccount" value="${escapeHtml(wechatDraftSettings.defaultAccount || "main")}" />
        </div>
        <div class="settings-section">
          <h5>已配置账号</h5>
          ${accountHtml}
          <button type="button" data-add-account>添加账号</button>
        </div>
        <div class="settings-section" id="accountEditArea"></div>
        <div class="settings-section">
          <p class="settings-hint">AppSecret 通过环境变量设置，例如：<br/><code>setx WECHAT_MAIN_APP_SECRET "你的AppSecret"</code><br/>不会在页面中显示或存储 AppSecret 明文。</p>
        </div>
      </div>
    </section>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest("[data-close-settings]")) {
      overlay.remove();
    }
    if (e.target.closest("[data-add-account]")) {
      $("#accountEditArea").innerHTML = renderAccountEditForm("", { name: "", appId: "", appSecretEnv: "" });
    }
    const editBtn = e.target.closest("[data-edit-account]");
    if (editBtn) {
      const key = editBtn.dataset.editAccount;
      const acc = accounts[key] || {};
      $("#accountEditArea").innerHTML = renderAccountEditForm(key, acc);
    }
    const saveBtn = e.target.closest("[data-save-account]");
    if (saveBtn) {
      saveAccountFromForm(overlay);
    }
  });
}

function renderAccountEditForm(key, acc) {
  const envName = acc.appSecretEnv || `WECHAT_${(key || "main").toUpperCase()}_APP_SECRET`;
  return `
    <div class="account-edit-form">
      <h5>${key ? "编辑账号" : "添加账号"}</h5>
      <label>账号 Key（英文标识，如 main）</label>
      <input type="text" id="editAccountKey" value="${escapeHtml(key)}" ${key ? "readonly" : ""} placeholder="main" />
      <label>显示名称</label>
      <input type="text" id="editAccountName" value="${escapeHtml(acc.name || "")}" placeholder="团建公众号" />
      <label>AppID</label>
      <input type="text" id="editAppId" value="${escapeHtml(acc.appId || "")}" placeholder="wx开头的应用ID" />
      <label>AppSecret（应用密钥）</label>
      <input type="password" id="editAppSecret" value="" placeholder="从公众号后台复制，点保存后自动设置环境变量" autocomplete="off" />
      <small style="color:var(--muted);font-size:11px;margin-bottom:8px;display:block">仅首次填写或更换密钥时填入。留空表示不修改。系统会自动设置环境变量 <code>${escapeHtml(envName)}</code>，不会存入配置文件。</small>
      <input type="hidden" id="editAppSecretEnv" value="${escapeHtml(envName)}" />
      <button type="button" data-save-account>保存账号</button>
    </div>
  `;
}

async function saveAccountFromForm(overlay) {
  const key = $("#editAccountKey")?.value.trim();
  if (!key) return;
  const name = $("#editAccountName")?.value.trim() || key;
  const appId = $("#editAppId")?.value.trim() || "";
  const appSecret = $("#editAppSecret")?.value.trim() || "";
  const appSecretEnv = $("#editAppSecretEnv")?.value.trim() || `WECHAT_${key.toUpperCase()}_APP_SECRET`;
  const defaultAccount = $("#settingsDefaultAccount")?.value.trim() || key;

  try {
    // 如果填了 AppSecret，先设置环境变量
    if (appSecret) {
      const secretResult = await api("/api/wechat-draft/set-secret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ envVar: appSecretEnv, value: appSecret })
      });
      if (!secretResult.success) {
        alert("环境变量设置失败: " + (secretResult.error || ""));
        return;
      }
    }
    // 保存账号配置（不含 AppSecret 明文）
    const result = await api("/api/wechat-draft/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defaultAccount,
        accounts: {
          [key]: { name, appId, appSecretEnv, author: "" }
        }
      })
    });
    wechatDraftSettings = result;
    overlay.remove();
    // 保存成功后给明确反馈
    if (appSecret) {
      toast("账号已保存，AppSecret 已设置。需要重启工作台才能生效——关掉再打开就行。");
    } else {
      toast("账号已保存。");
    }
    openWechatDraftSettings();
    // 刷新主页面的账号状态
    loadWechatAccountStatus();
  } catch (error) {
    alert("保存失败: " + (error.message || String(error)));
  }
}

function renderTransferTasks() {
  const tasks = [
    ...Array.from(distributionTransferUiTasks.values()).map((task) => ({ ...task, taskKind: "distribution" })),
    ...Array.from(genericTransferUiTasks.values()).map((task) => ({ ...task, taskKind: "generic" }))
  ].sort((left, right) => String(right.startedAt || "").localeCompare(String(left.startedAt || "")));
  const visibleTasks = tasks.filter((task) => {
    if (["running", "cancelling"].includes(task.state)) return true;
    const finishedAt = Date.parse(task.finishedAt || task.startedAt || "");
    return !Number.isFinite(finishedAt) || Date.now() - finishedAt < TRANSFER_TASK_VISIBLE_MS;
  });
  visibleTasks.forEach((task) => {
    if (["running", "cancelling"].includes(task.state) || transferDismissTimers.has(task.id)) return;
    const finishedAt = Date.parse(task.finishedAt || task.startedAt || "");
    const remaining = Number.isFinite(finishedAt)
      ? Math.max(200, TRANSFER_TASK_VISIBLE_MS - (Date.now() - finishedAt))
      : TRANSFER_TASK_VISIBLE_MS;
    transferDismissTimers.set(task.id, window.setTimeout(() => {
      transferDismissTimers.delete(task.id);
      (task.taskKind === "distribution" ? distributionTransferUiTasks : genericTransferUiTasks).delete(task.id);
      renderDistribution();
    }, remaining));
  });
  if (!visibleTasks.length) return "";
  return `<section class="transfer-task-list">${visibleTasks.map((task) => `
    <article class="transfer-task ${escapeHtml(task.state)}" aria-live="polite">
      <div class="transfer-task-copy">
        <span class="transfer-kind">${task.taskKind === "distribution" ? "作品包分发" : "文件传送"}</span>
        <strong>${escapeHtml(task.collection || task.source?.split(/[\\/]/).at(-1) || "传送任务")}</strong>
        <small>${escapeHtml(task.stageLabel || task.message || "")}${task.device ? ` · ${escapeHtml(task.device)}` : ""}</small>
        ${task.transport ? renderTransportTag(String(task.transport).toLowerCase().includes("usb") ? "usb" : "wifi", task.transport, "active") : ""}
      </div>
      <div class="transfer-meter">
        <div class="transfer-progress"><i style="width:${Math.max(0, Math.min(100, Number(task.progress) || 0))}%"></i></div>
        <span>${escapeHtml(task.message || "")}</span>
      </div>
      <b>${Number(task.progress) || 0}%</b>
      ${["running", "cancelling"].includes(task.state)
        ? `<button type="button" data-cancel-transfer="${escapeHtml(task.id)}" data-transfer-kind="${task.taskKind}" ${task.state === "cancelling" ? "disabled" : ""}>${task.state === "cancelling" ? "停止中" : "停止"}</button>`
        : `<div class="transfer-finished-actions"><span class="state-badge ${task.state === "completed" ? "good" : task.state === "failed" ? "bad" : "warn"}">${task.state === "completed" ? "已完成并记录" : task.state === "cancelled" ? "已停止待核对" : "未完成"}</span><button type="button" data-dismiss-transfer="${escapeHtml(task.id)}" data-transfer-kind="${task.taskKind}" title="仅清除当前提示，历史记录仍保留">清除</button></div>`}
    </article>
  `).join("")}</section>`;
}

async function dismissTransferTask(taskId, taskKind) {
  const endpoint = taskKind === "distribution"
    ? `/api/distribution/tasks/${encodeURIComponent(taskId)}`
    : `/api/transfers/${encodeURIComponent(taskId)}`;
  try {
    await api(endpoint, { method: "DELETE" });
    (taskKind === "distribution" ? distributionTransferUiTasks : genericTransferUiTasks).delete(taskId);
    renderDistribution();
  } catch (error) {
    showSystemNotice("暂时不能清除", error.message, { tone: "danger" });
  }
}

async function startGenericTransfer(deviceId, sourcePath) {
  const devices = DistributionUI.decorateDevices(
    dashboard?.distribution?.devices || [],
    deviceCheckState.onlineDevices || []
  );
  const device = devices.find((item) => item.id === deviceId && item.online && item.trusted !== false);
  if (!device) return showSystemNotice("目标设备不可发送", "只有在线且已确认归属的设备可以接收内容。");
  if (!sourcePath) return;
  const needsConfirmation = pageSettings().distribution?.requireSendConfirmation === true;
  const confirmed = !needsConfirmation || await openSystemDialog({
    eyebrow: "文件传送",
    title: "确认发送到这台设备？",
    description: "确认后会立即建立传送任务，并在分发页面显示实时进度。",
    details: [
      { label: "文件", value: sourcePath.split(/[\\/]/).at(-1) },
      { label: "目标设备", value: device.note || device.displayName }
    ],
    cancelLabel: "返回",
    confirmLabel: "开始发送"
  });
  if (!confirmed) return;
  try {
    const task = await api("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: sourcePath,
        device: device.aliases?.[0] || device.displayName,
        confirmed: true
      })
    });
    genericTransferUiTasks.set(task.id, task);
    uploadChoiceDeviceId = "";
    renderDistribution();
    ensureTransferPolling();
  } catch (error) {
    showSystemNotice("无法开始传送", error.message, { tone: "danger" });
  }
}

function ensureTransferPolling() {
  if (transferPollTimer) return;
  transferPollTimer = window.setInterval(async () => {
    const genericRunning = Array.from(genericTransferUiTasks.values()).filter((task) =>
      ["running", "cancelling"].includes(task.state)
    );
    const distributionRunning = Array.from(distributionTransferUiTasks.values()).filter((task) =>
      ["running", "cancelling"].includes(task.state)
    );
    if (!genericRunning.length && !distributionRunning.length) {
      window.clearInterval(transferPollTimer);
      transferPollTimer = null;
      return;
    }
    let distributionFinished = false;
    await Promise.all(genericRunning.map(async (task) => {
      try {
        genericTransferUiTasks.set(task.id, await api(`/api/transfers/${encodeURIComponent(task.id)}`));
      } catch (error) {
        genericTransferUiTasks.set(task.id, { ...task, state: "failed", message: error.message });
      }
    }));
    await Promise.all(distributionRunning.map(async (task) => {
      try {
        const next = await api(`/api/distribution/tasks/${encodeURIComponent(task.id)}`);
        distributionTransferUiTasks.set(task.id, next);
        if (!["running", "cancelling"].includes(next.state)) {
          distributionFinished = true;
          if (notifiedTransferStates.get(next.id) !== next.state
            && pageSettings().distribution?.completionNotificationEnabled !== false) {
            notifiedTransferStates.set(next.id, next.state);
            toast(next.state === "completed"
              ? `作品集已发送完成：${next.collection || "本次任务"}`
              : `作品集发送未完成：${next.message || "请查看记录"}`);
          }
        }
      } catch (error) {
        distributionTransferUiTasks.set(task.id, {
          ...task,
          state: "failed",
          stageLabel: "无法读取任务状态",
          message: error.message
        });
      }
    }));
    if (distributionFinished) await loadDashboard(true);
    renderDistribution();
  }, 800);
}

async function restoreTransferTasks() {
  try {
    const [distributionTasks, genericTasks] = await Promise.all([
      api("/api/distribution/tasks"),
      api("/api/transfers")
    ]);
    distributionTransferUiTasks.clear();
    genericTransferUiTasks.clear();
    (distributionTasks || []).forEach((task) => distributionTransferUiTasks.set(task.id, task));
    (genericTasks || []).forEach((task) => genericTransferUiTasks.set(task.id, task));
    const allTasks = [...(distributionTasks || []), ...(genericTasks || [])];
    if (allTasks.some((task) =>
      ["running", "cancelling"].includes(task.state)
    )) ensureTransferPolling();
    if (dashboard?.distribution) renderDistribution();
  } catch (error) {
    console.warn("无法恢复传送任务", error);
  }
}

async function chooseGenericTransferSource(deviceId, kind) {
  try {
    const endpoint = kind === "folder" ? "/api/pick-folder" : "/api/pick-file";
    const result = await api(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kind === "folder"
        ? { description: "选择要传送的整个文件夹" }
        : { title: "选择要传送的文件" })
    });
    if (result.path) await startGenericTransfer(deviceId, result.path);
  } catch (error) {
    showSystemNotice("没有选到可发送内容", error.message, { tone: "danger" });
  }
}

function renderDistributionRecords(rows, kind) {
  if (!rows.length) return `<div class="empty-state"><strong>暂无分发记录</strong><p>完成一次真实分发后会显示在这里。</p></div>`;
  return `<div class="record-list">${rows.slice(0, 80).map((row) => `
    <article class="record-row">
      <div class="device-number">${kind === "device" ? "机" : "公"}</div>
      <div><h3>${escapeHtml(row["源作品集"] || row["作品集"] || "未命名")}</h3><p>${escapeHtml(row["设备名"] || row["公众号账号"] || "")} · ${escapeHtml(row["时间"] || "")}</p></div>
      <span class="state-badge">${escapeHtml(row["接收确认"] || row["状态"] || "已记录")}</span>
      <div></div>
    </article>
  `).join("")}</div>`;
}

function assistantElements() {
  return {
    launcher: $("#workbenchAssistantLauncher"),
    panel: $("#workbenchAssistantPanel"),
    bubble: $("#workbenchAssistantBubble"),
    logPanel: $("#workbenchAssistantLogPanel")
  };
}

function syncWorkbenchAssistantDock(left, top) {
  const { launcher, panel, bubble, logPanel } = assistantElements();
  if (!launcher) return;
  if (Number.isFinite(left) && Number.isFinite(top)) {
    const rect = launcher.getBoundingClientRect();
    const launcherW = rect.width || 82;
    const launcherH = rect.height || 94;
    const safeLeft = Math.max(8, Math.min(window.innerWidth - launcherW - 8, left));
    const safeTop = Math.max(launcherH / 2 + 8, Math.min(window.innerHeight - launcherH / 2 - 8, top));
    launcher.style.left = `${safeLeft}px`;
    launcher.style.top = `${safeTop}px`;
    launcher.style.right = "auto";
    launcher.style.bottom = "auto";
    launcher.style.transform = "translateY(-50%)";
    const placeOnRight = safeLeft + launcherW / 2 < window.innerWidth / 2;
    [panel, bubble, logPanel].forEach((element) => {
      if (!element) return;
      const width = element.getBoundingClientRect().width || (element === bubble ? 306 : 380);
      const height = element.getBoundingClientRect().height || (element === bubble ? 82 : 300);
      const bubbleGap = element === bubble ? 12 : 4;
      if (placeOnRight) {
        element.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, safeLeft + launcherW + bubbleGap))}px`;
      } else {
        element.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, safeLeft - width - bubbleGap))}px`;
      }
      element.style.right = "auto";
      element.style.top = `${Math.max(height / 2 + 8, Math.min(window.innerHeight - height / 2 - 8, safeTop))}px`;
      element.style.bottom = "auto";
      element.style.transform = "translateY(-50%)";
      element.dataset.side = placeOnRight ? "right" : "left";
    });
  } else {
    [launcher, panel, bubble, logPanel].forEach((element) => {
      if (!element) return;
      element.style.left = "";
      element.style.top = "";
      element.style.right = "";
      element.style.bottom = "";
      element.style.transform = "";
    });
  }
}

function resyncWorkbenchAssistantDockFromLauncher() {
  const { launcher } = assistantElements();
  if (!launcher) return;
  const rect = launcher.getBoundingClientRect();
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return;
  syncWorkbenchAssistantDock(rect.left, rect.top + rect.height / 2);
}

function restoreWorkbenchAssistantDock() {
  try {
    const stored = JSON.parse(localStorage.getItem("tb-workbench-assistant-position-v5") || "null");
    if (stored?.userMoved === true && Number.isFinite(stored.left) && Number.isFinite(stored.top)) {
      syncWorkbenchAssistantDock(stored.left, stored.top);
    }
  } catch {
    // Ignore a damaged position and use the centered default.
  }
}

function setupWorkbenchAssistantDrag() {
  const { launcher } = assistantElements();
  if (!launcher || launcher.dataset.dragReady) return;
  launcher.dataset.dragReady = "true";
  launcher.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const rect = launcher.getBoundingClientRect();
    assistantDragState = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top + rect.height / 2, moved: false };
    launcher.setPointerCapture?.(event.pointerId);
  });
  launcher.addEventListener("pointermove", (event) => {
    if (!assistantDragState || assistantDragState.pointerId !== event.pointerId) return;
    const dx = event.clientX - assistantDragState.startX;
    const dy = event.clientY - assistantDragState.startY;
    if (!assistantDragState.moved && Math.hypot(dx, dy) < 5) return;
    assistantDragState.moved = true;
    launcher.classList.add("is-dragging");
    syncWorkbenchAssistantDock(assistantDragState.left + dx, assistantDragState.top + dy);
  });
  const finish = (event) => {
    if (!assistantDragState || assistantDragState.pointerId !== event.pointerId) return;
    if (assistantDragState.moved) {
      const rect = launcher.getBoundingClientRect();
      localStorage.setItem("tb-workbench-assistant-position-v5", JSON.stringify({ userMoved: true, left: rect.left, top: rect.top + rect.height / 2 }));
      assistantSuppressClickUntil = Date.now() + 350;
      event.preventDefault();
      event.stopPropagation();
    }
    launcher.classList.remove("is-dragging");
    assistantDragState = null;
  };
  launcher.addEventListener("pointerup", finish);
  launcher.addEventListener("pointercancel", finish);
  window.addEventListener("resize", () => {
    try {
      const stored = JSON.parse(localStorage.getItem("tb-workbench-assistant-position-v5") || "null");
      if (stored?.userMoved === true && Number.isFinite(stored.left) && Number.isFinite(stored.top)) syncWorkbenchAssistantDock(stored.left, stored.top);
    } catch {}
  });
  restoreWorkbenchAssistantDock();
}

function showWorkbenchAssistantBubble(message, options = {}) {
  const { bubble } = assistantElements();
  if (!bubble || !message) return;
  const page = document.querySelector(".view.active")?.id || "global";
  const entry = { page, message: String(message), at: new Date().toISOString(), tone: String(options.tone || "") };
  assistantEventLog.push(entry);
  if (assistantEventLog.length > 300) assistantEventLog.splice(0, assistantEventLog.length - 300);
  renderWorkbenchAssistantLog();
  lastAssistantBubbleMessage = entry.message;
  if (options.persistent !== false && options.transient !== true) {
    assistantPersistentMessage = entry.message;
    localStorage.setItem(ASSISTANT_PERSISTENT_MESSAGE_KEY, assistantPersistentMessage);
  }
  if (Date.now() < assistantMuteUntil) {
    bubble.hidden = true;
    window.gptWorkbench?.updateAssistant?.({ message: entry.message, visible: false }).catch(() => {});
    return;
  }
  const content = $("#workbenchAssistantBubbleContent");
  if (content) content.textContent = entry.message;
  else bubble.textContent = entry.message;
  bubble.hidden = false;
  requestAnimationFrame(() => resyncWorkbenchAssistantDockFromLauncher());
  window.gptWorkbench?.updateAssistant?.({ message: entry.message, visible: !assistantChatOpen }).catch(() => {});
  clearTimeout(assistantBubbleTimer);
  if (Number(options.duration || 0) > 0) {
    assistantBubbleTimer = window.setTimeout(() => {
      if (options.transient === true && assistantPersistentMessage && assistantPersistentMessage !== entry.message) {
        const content = $("#workbenchAssistantBubbleContent");
        if (content) content.textContent = assistantPersistentMessage;
        bubble.hidden = false;
        window.gptWorkbench?.updateAssistant?.({ message: assistantPersistentMessage, visible: !assistantChatOpen }).catch(() => {});
      } else if (options.transient === true && assistantPersistentMessage) {
        bubble.hidden = false;
        window.gptWorkbench?.updateAssistant?.({ message: assistantPersistentMessage, visible: !assistantChatOpen }).catch(() => {});
      } else {
        bubble.hidden = true;
        window.gptWorkbench?.updateAssistant?.({ message: entry.message, visible: false }).catch(() => {});
      }
    }, Number(options.duration));
  }
}

function appendGptProductionHistory(task, status, result = {}, error = "") {
  const startedAt = String(task?._startedAt || new Date().toISOString());
  const finishedAt = new Date().toISOString();
  const stageHistory = Array.isArray(result?.stageHistory) ? result.stageHistory : [];
  const sumStageDuration = (matcher) => stageHistory.reduce((total, stage) =>
    matcher.test(String(stage?.stage || "")) ? total + Number(stage?.durationMs || 0) : total, 0);
  gptProductionHistory.unshift({
    id: String(task?.requestId || Date.now()),
    requestId: String(task?.requestId || ""),
    accountId: String(task?.accountId || task?.quotaAccountId || ""),
    accountName: String(gptAccounts.find((account) => account.id === (task?.accountId || task?.quotaAccountId))?.name || "当前账号窗口"),
    name: String(task?.name || "未命名作品"),
    status: String(status || "unknown"),
    stage: String(task?._stage || ""),
    percent: Number(task?._percent || 0),
    startedAt,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
    planDurationMs: sumStageDuration(/迁移计划|提交迁移计划/),
    imageDurationMs: sumStageDuration(/确认出图|等待图片|生成图片/),
    copyDurationMs: sumStageDuration(/小红书文案/),
    packageDurationMs: sumStageDuration(/下载图片|打包作品|归档素材/),
    stageHistory,
    packagePath: String(result?.packagePath || result?.result?.packageResult?.packagePath || result?.packageResult?.packagePath || ""),
    downloadRoot: String(result?.downloadRoot || result?.result?.downloadRoot || ""),
    copyTextLength: Number(result?.copyTextLength || result?.result?.copyTextLength || 0),
    conversationUrl: String(result?.conversationUrl || result?.result?.conversationUrl || ""),
    error: String(error || "")
  });
  gptProductionHistory = gptProductionHistory.slice(0, 200);
  localStorage.setItem(GPT_HISTORY_STORAGE_KEY, JSON.stringify(gptProductionHistory));
  renderGptProductionHistory();
}

function formatProductionDuration(value = 0) {
  const seconds = Math.max(0, Math.round(Number(value || 0) / 1000));
  if (seconds < 60) return `${seconds}秒`;
  return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, "0")}秒`;
}

function renderGptProductionSummary() {
  const host = $("#gptProductionHistorySummary");
  if (!host) return;
  const completed = gptProductionHistory.filter((item) => item.status === "completed");
  const totalMs = completed.reduce((sum, item) => sum + Math.max(0, Number(item.durationMs || 0)), 0);
  const planRows = completed.filter((item) => Number(item.planDurationMs || 0) > 0);
  const averagePlanMs = planRows.length
    ? planRows.reduce((sum, item) => sum + Number(item.planDurationMs || 0), 0) / planRows.length
    : 0;
  host.innerHTML = `
    <div><strong>${completed.length}</strong><span>总作品数</span></div>
    <div><strong>${formatProductionDuration(totalMs)}</strong><span>总耗时</span></div>
    <div><strong>${planRows.length ? formatProductionDuration(averagePlanMs) : "暂无"}</strong><span>平均出计划</span></div>`;
}

function renderGptProductionHistory() {
  const host = $("#gptProductionHistoryList");
  if (!host) return;
  renderGptProductionSummary();
  const rows = [...gptProductionHistory].sort((left, right) => {
    const rightTime = Date.parse(String(right.finishedAt || right.updatedAt || right.startedAt || "")) || 0;
    const leftTime = Date.parse(String(left.finishedAt || left.updatedAt || left.startedAt || "")) || 0;
    return rightTime - leftTime;
  });
  host.innerHTML = rows.length ? rows.map((item) => `
    <article class="gpt-production-history-item" data-production-path="${escapeHtml(item.packagePath || item.productPath || "")}">
      <strong>${escapeHtml(item.name)}</strong>
      <p>${escapeHtml(item.accountName || "当前账号窗口")} · ${escapeHtml(item.status === "completed" ? "已完成" : item.status === "failed" ? "失败" : "已暂停")} · ${escapeHtml(item.stage || "未记录阶段")} · 总耗时 ${formatProductionDuration(item.durationMs)}</p>
      ${(item.planDurationMs || item.imageDurationMs || item.copyDurationMs) ? `<div class="gpt-production-history-timings"><span>计划 ${formatProductionDuration(item.planDurationMs)}</span><span>出图 ${formatProductionDuration(item.imageDurationMs)}</span><span>文案 ${formatProductionDuration(item.copyDurationMs)}</span></div>` : ""}
      ${(item.packagePath || item.productPath || item.downloadRoot) ? `<button class="gpt-production-open-path" type="button" data-open-production-path="${escapeHtml(item.packagePath || item.productPath || item.downloadRoot)}">${item.packagePath || item.productPath ? (item.packageValid === false ? "打开成品文件夹（待核对）" : "打开成品文件夹") : "打开图片暂存目录"}</button><p>${item.packagePath || item.productPath ? "成品" : "暂存"}：${escapeHtml(item.packagePath || item.productPath || item.downloadRoot)}</p>${item.packagePath && item.packageValid === false ? `<p class="muted">完整性：图片 ${Number(item.packageImageCount || 0)} 张，文案 TXT ${Number(item.packageTextCount || 0)} 个；未通过完整打包校验。</p>` : ""}` : ""}
      ${item.error ? `<p>原因：${escapeHtml(item.error)}</p>` : ""}
      ${item.sourceMaterialPath ? `<p>原素材：${escapeHtml(item.sourceMaterialPath)}</p>` : ""}
      <p>${escapeHtml(new Date(item.finishedAt || item.updatedAt || Date.now()).toLocaleString("zh-CN", { hour12: false }))}</p>
    </article>`).join("") : '<div class="empty-state"><strong>暂无生产记录</strong><p>自动闭环完成、暂停或失败后会保留在这里。</p></div>';
  host.querySelectorAll("[data-open-production-path]").forEach((button) => button.addEventListener("click", async () => {
    const target = button.dataset.openProductionPath || "";
    if (!target) return;
    await openPath(target).catch((error) => toast(error.message));
  }));
}

async function syncGptProductionHistory() {
  const result = await api("/api/gpt-production/history").catch(() => null);
  if (!Array.isArray(result?.items)) return;
  const byRequestId = new Map(gptProductionHistory.map((item) => [item.requestId, item]).filter(([requestId]) => requestId));
  for (const checkpoint of result.items) {
    if (!checkpoint.requestId) continue;
    const packageName = String(checkpoint.packagePath || "").split(/[\\/]/).filter(Boolean).pop();
    const existing = byRequestId.get(checkpoint.requestId);
    if (existing) {
      existing.stage ||= checkpoint.stage || "检查点";
      existing.taskState ||= checkpoint.taskState || "";
      existing.confirmSentAt ||= checkpoint.confirmSentAt || "";
      existing.imageGenerationDetectedAt ||= checkpoint.imageGenerationDetectedAt || "";
      existing.quotaDetectedAt ||= checkpoint.quotaDetectedAt || "";
      existing.nextProbeAt ||= checkpoint.nextProbeAt || "";
      existing.percent = Math.max(Number(existing.percent || 0), Number(checkpoint.percent || 0));
      existing.packagePath ||= checkpoint.packagePath || "";
      existing.productPath ||= checkpoint.packagePath || "";
      existing.downloadRoot ||= checkpoint.downloadRoot || "";
      existing.copyTextLength = Math.max(Number(existing.copyTextLength || 0), Number(checkpoint.copyTextLength || 0));
      existing.packageValid = checkpoint.packagePath ? checkpoint.packageValid !== false : false;
      existing.packageImageCount = Number(checkpoint.packageImageCount || 0);
      existing.packageTextCount = Number(checkpoint.packageTextCount || 0);
      existing.packageExpectedImageCount = Number(checkpoint.packageExpectedImageCount || 0);
      existing.packageValidatedByRecord = checkpoint.packageValidatedByRecord === true;
      existing.updatedAt = checkpoint.updatedAt || existing.updatedAt || existing.finishedAt || new Date().toISOString();
      if (checkpoint.packagePath && checkpoint.packageValid !== false) existing.status = "completed";
      else if (existing.status === "completed") existing.status = "paused";
      continue;
    }
    const added = {
      requestId: checkpoint.requestId,
      name: packageName || checkpoint.requestId,
      // A checkpoint reaching 100% is not a completed work package by itself.
      // The authoritative completion signal is a real packagePath returned by
      // the packager after the TXT and image count checks pass.
      status: checkpoint.packagePath && checkpoint.packageValid !== false ? "completed" : "paused",
      stage: checkpoint.stage || "检查点",
      durationMs: 0,
      packagePath: checkpoint.packagePath || "",
      productPath: checkpoint.packagePath || "",
      downloadRoot: checkpoint.downloadRoot || "",
      copyTextLength: Number(checkpoint.copyTextLength || 0),
      packageValid: checkpoint.packagePath ? checkpoint.packageValid !== false : false,
      packageImageCount: Number(checkpoint.packageImageCount || 0),
      packageTextCount: Number(checkpoint.packageTextCount || 0),
      packageExpectedImageCount: Number(checkpoint.packageExpectedImageCount || 0),
      packageValidatedByRecord: checkpoint.packageValidatedByRecord === true,
      finishedAt: checkpoint.updatedAt || new Date().toISOString(),
      updatedAt: checkpoint.updatedAt || new Date().toISOString()
    };
    gptProductionHistory.push(added);
    byRequestId.set(checkpoint.requestId, added);
  }
  gptProductionHistory.sort((left, right) => {
    const rightTime = Date.parse(String(right.finishedAt || right.updatedAt || right.startedAt || "")) || 0;
    const leftTime = Date.parse(String(left.finishedAt || left.updatedAt || left.startedAt || "")) || 0;
    return rightTime - leftTime;
  });
  gptProductionHistory = gptProductionHistory.slice(0, 200);
  localStorage.setItem(GPT_HISTORY_STORAGE_KEY, JSON.stringify(gptProductionHistory));
}

async function openGptProductionHistory(open = true) {
  const panel = $("#gptProductionHistoryPanel");
  if (!panel) return;
  const gptActive = $("#gptProductionTestView")?.classList.contains("active");
  if (open) {
    // A native WebContentsView is composited above the renderer regardless of
    // CSS z-index. Hide it before revealing the DOM panel, otherwise the
    // history sheet can appear to jump above/below GPT depending on timing.
    if (gptActive) await window.gptWorkbench?.hide?.().catch(() => {});
    await syncGptProductionHistory();
    renderGptProductionHistory();
    panel.hidden = false;
  } else {
    panel.hidden = true;
    if (gptActive) restoreEmbeddedGptView();
  }
}

function renderWorkbenchAssistantLog() {
  const host = $("#workbenchAssistantLogList");
  if (!host) return;
  const page = document.querySelector(".view.active")?.id || "global";
  const rows = assistantEventLog.filter((item) => item.page === page || item.page === "global").slice(-50).reverse();
  $("#workbenchAssistantLogPage").textContent = document.querySelector(".view.active h2")?.textContent?.trim() || "当前页面";
  host.innerHTML = rows.length ? rows.map((item) => `<article class="workbench-assistant-log-item">${escapeHtml(item.message)}<time>${escapeHtml(new Date(item.at).toLocaleString("zh-CN", { hour12: false }))}</time></article>`).join("") : '<div class="empty-state"><strong>暂无状态</strong><p>本页操作、进度和错误会记录在这里。</p></div>';
}

function openWorkbenchAssistantLog(open = true) {
  const { logPanel, panel } = assistantElements();
  if (!logPanel) return;
  if (open) {
    assistantChatOpen = false;
    if (panel) panel.hidden = true;
    renderWorkbenchAssistantLog();
  }
  logPanel.hidden = !open;
  if ($("#gptProductionTestView")?.classList.contains("active")) {
    if (open) window.gptWorkbench?.hide?.().catch(() => {});
    else restoreEmbeddedGptView();
  }
}

function muteWorkbenchAssistant(minutes) {
  assistantMuteUntil = Date.now() + Math.max(1, Number(minutes || 1)) * 60_000;
  localStorage.setItem("tb-workbench-assistant-muted-until", String(assistantMuteUntil));
  const { bubble } = assistantElements();
  if (bubble) bubble.hidden = true;
  window.gptWorkbench?.updateAssistant?.({ message: assistantPersistentMessage || lastAssistantBubbleMessage, visible: false }).catch(() => {});
  clearTimeout(assistantMuteTimer);
  assistantMuteTimer = window.setTimeout(() => {
    assistantMuteUntil = 0;
    localStorage.removeItem("tb-workbench-assistant-muted-until");
    if (assistantPersistentMessage || lastAssistantBubbleMessage) showWorkbenchAssistantBubble(assistantPersistentMessage || lastAssistantBubbleMessage, { duration: 0, persistent: true });
  }, Math.max(1000, assistantMuteUntil - Date.now()));
  openWorkbenchAssistantLog(false);
  const muteMenu = $("#workbenchAssistantMuteMenu");
  if (muteMenu) muteMenu.hidden = true;
}

function openWorkbenchAssistantMuteMenu(event) {
  const menu = $("#workbenchAssistantMuteMenu");
  if (!menu) return;
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const x = Number(event?.clientX || 0);
  const y = Number(event?.clientY || 0);
  menu.hidden = false;
  const width = menu.offsetWidth || 150;
  const height = menu.offsetHeight || 120;
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, x))}px`;
  menu.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, y))}px`;
}

function appendWorkbenchAssistantMessage(message, role = "assistant") {
  const container = $("#workbenchAssistantMessages");
  if (!container) return;
  const item = document.createElement("article");
  item.className = `assistant-message ${role === "user" ? "is-user" : ""}`;
  item.textContent = message;
  container.appendChild(item);
  container.scrollTop = container.scrollHeight;
}

async function toggleWorkbenchAssistant(open) {
  const panel = $("#workbenchAssistantPanel");
  const launcher = $("#workbenchAssistantLauncher");
  if (!panel || !launcher) return;
  const shouldOpen = open ?? panel.hidden;
  if (shouldOpen) {
    assistantChatOpen = true;
    // The GPT WebContentsView is a native layer and can briefly remain above
    // the renderer after a synchronous DOM toggle. Hide it first, then reveal
    // the chat panel so the panel cannot land underneath the webpage.
    await window.gptWorkbench?.hide?.().catch(() => {});
    panel.hidden = false;
    const { logPanel } = assistantElements();
    if (logPanel) logPanel.hidden = true;
  } else {
    assistantChatOpen = false;
    panel.hidden = true;
    window.gptWorkbench?.updateAssistant?.({ message: assistantPersistentMessage || lastAssistantBubbleMessage, visible: true }).catch(() => {});
  }
  launcher.setAttribute("aria-expanded", String(shouldOpen));
  if (!shouldOpen && $("#gptProductionTestView")?.classList.contains("active")) restoreEmbeddedGptView();
  if (shouldOpen) window.setTimeout(() => $("#workbenchAssistantCommand")?.focus(), 0);
}

function assistantDevice(number) {
  const devices = DistributionUI.decorateDevices(
    dashboard?.distribution?.devices || [],
    deviceCheckState.onlineDevices || []
  );
  return devices.find((device) => {
    const text = [device.note, device.displayName, ...(device.aliases || [])].join(" ");
    return new RegExp(`(^|\\D)${number}\\s*号`).test(text);
  });
}

function workbenchAssistantCapabilities() {
  return [
    "我现在能做这些事：",
    "1. 检测在线设备、可信状态和作品库存；",
    "2. 给已确认的指定设备发送某个作品集，或补精准/泛流量作品；",
    "3. 打开内容制作、内容分发、流量转化、插件市场和各页设置；",
    "4. 查看当前作品储备、在线设备和运行任务；",
    "5. 建立批量生产计划、查询生产进度、停止或继续未完成任务；",
    "6. 立即备份、验证云端备份是否可恢复，并打开相关设置。",
    "不明确或有风险的指令我会先追问，不会猜着删除、覆盖或给陌生设备发送。"
  ].join("\n");
}

function workbenchAssistantStatus() {
  const distribution = dashboard?.distribution || {};
  const devices = DistributionUI.decorateDevices(distribution.devices || [], deviceCheckState.onlineDevices || []);
  const online = devices.filter((item) => item.online).length;
  const trustedOnline = devices.filter((item) => item.online && item.trusted !== false).length;
  const running = [...distributionTransferUiTasks.values(), ...genericTransferUiTasks.values()]
    .filter((task) => ["running", "cancelling"].includes(task.state)).length;
  const reserve = distribution.reserve || {};
  return `当前：${online} 台设备在线，其中 ${trustedOnline} 台可安全发送；电脑待发作品精准 ${reserve.conversion || 0} 个、泛流量 ${reserve.traffic || 0} 个、未分类 ${reserve.unclassified || 0} 个；进行中任务 ${running} 个。`;
}

async function executeInterpretedWorkbenchAssistant(interpretation) {
  const intent = interpretation || {};
  if (intent.action === "capabilities") {
    appendWorkbenchAssistantMessage(workbenchAssistantCapabilities());
    return;
  }
  if (intent.action === "status") {
    appendWorkbenchAssistantMessage(workbenchAssistantStatus());
    return;
  }
  if (intent.action === "open_tab" && intent.tab) {
    activateTab(intent.tab);
    const labels = { dashboard: "内容制作", distribution: "内容分发", conversion: "流量转化", plugins: "插件市场", settings: "设置" };
    appendWorkbenchAssistantMessage(`已经打开${labels[intent.tab] || "对应页面"}。`);
    return;
  }
  if (intent.action === "open_settings") {
    if (["production", "distribution"].includes(intent.settings)) {
      const tab = intent.settings === "production" ? "dashboard" : "distribution";
      activateTab(tab);
      openPageSettings(intent.settings);
      appendWorkbenchAssistantMessage(`已经打开${intent.settings === "production" ? "内容制作" : "内容分发"}设置。`);
    } else {
      activateTab("settings");
      appendWorkbenchAssistantMessage("已经打开全局设置；备份、API 和软件诊断都在这里。");
    }
    return;
  }
  if (intent.action === "detect_devices") {
    activateTab("distribution");
    appendWorkbenchAssistantMessage("正在检测可信设备和作品库存。");
    await checkDistributionDevices();
    appendWorkbenchAssistantMessage(workbenchAssistantStatus());
    return;
  }
  if (intent.action === "produce") {
    activateTab("dashboard");
    appendWorkbenchAssistantMessage(`已经进入内容制作。请先选择素材和模板${intent.count ? `，本次目标 ${intent.count} 套` : ""}；确认计划后再开始，避免误用素材。`);
    return;
  }
  if (intent.action === "backup") {
    activateTab("settings");
    appendWorkbenchAssistantMessage("已经打开备份设置。这里能查看备份目录、进度、周期和最近结果；真正上传前仍会按当前安全配置执行。");
    return;
  }
  if (intent.action === "restock_device" && intent.deviceNumber && intent.category) {
    const categoryLabel = intent.category === "conversion" ? "精准流量" : intent.category === "traffic" ? "泛流量" : "";
    if (categoryLabel) {
      await executeWorkbenchAssistantCommand(`给${intent.deviceNumber}号发一个${categoryLabel}作品`, { allowModel: false, echo: false });
      return;
    }
  }
  if (intent.action === "send_collection" && intent.deviceNumber && intent.collection) {
    const collection = /^作品集/i.test(intent.collection) ? intent.collection : `作品集_${intent.collection}`;
    await executeWorkbenchAssistantCommand(`给${intent.deviceNumber}号发送${collection}`, { allowModel: false, echo: false });
    return;
  }
  appendWorkbenchAssistantMessage(intent.reply || "我还缺少一点信息。请告诉我具体页面、设备号码、作品集或流量分类。");
}

async function executeWorkbenchAssistantCommand(rawCommand, options = {}) {
  const command = String(rawCommand || "").trim();
  if (!command) return;
  if (options.echo !== false) appendWorkbenchAssistantMessage(command, "user");
  if (/你能|能做什么|能干嘛|帮助|怎么用|有哪些功能|支持什么/.test(command)) {
    appendWorkbenchAssistantMessage(workbenchAssistantCapabilities());
    return;
  }
  if (/检测|刷新/.test(command) && /设备|在线|库存|分发/.test(command)) {
    activateTab("distribution");
    appendWorkbenchAssistantMessage("正在检测可信设备和作品库存。");
    await checkDistributionDevices();
    const online = deviceCheckState.onlineDevices?.length || 0;
    appendWorkbenchAssistantMessage(`检测完成：当前发现 ${online} 台在线设备，分发页已经刷新。`);
    return;
  }
  if (/生产|生图|制作/.test(command) && /状态|进度|到哪|完成多少/.test(command)) {
    const result = await api("/api/production/tasks");
    const latest = (result.tasks || [])[0];
    if (!latest) {
      appendWorkbenchAssistantMessage("当前没有生产任务。");
      return;
    }
    const percent = latest.total ? Math.round((latest.progress / latest.total) * 100) : 0;
    appendWorkbenchAssistantMessage(`最近任务：${latest.message || latest.status}；已完成 ${latest.progress}/${latest.total} 张（${percent}%），状态 ${latest.status}。`);
    return;
  }
  if (/继续|恢复|重试|补做/.test(command) && /生产|生图|失败页|任务/.test(command)) {
    const result = await api("/api/production/tasks");
    const latest = (result.tasks || []).find((task) => task.resumable);
    if (!latest) {
      appendWorkbenchAssistantMessage("没有可继续的生产任务。");
      return;
    }
    activateTab("dashboard");
    appendWorkbenchAssistantMessage(`正在继续最近任务，已完成的 ${latest.progress} 张不会重复生成。`);
    await resumeProductionJob(latest.id);
    return;
  }
  if (/停止|取消/.test(command) && /生产|生图|任务/.test(command)) {
    const result = await api("/api/production/tasks");
    const running = (result.tasks || []).find((task) => task.cancelable);
    if (!running) {
      appendWorkbenchAssistantMessage("当前没有正在运行的生产任务。");
      return;
    }
    await cancelProductionJob(running.id);
    appendWorkbenchAssistantMessage("已申请停止；系统会在当前页面结束后停下，并保留已经完成的文件。");
    return;
  }
  if (/立即|现在|马上/.test(command) && /备份/.test(command)) {
    activateTab("settings");
    appendWorkbenchAssistantMessage("正在备份工作台设置、提示词、任务索引和分发记录。");
    await runCloudBackup();
    appendWorkbenchAssistantMessage("坚果云备份已经完成。");
    return;
  }
  if (/验证|检查|测试/.test(command) && /备份|恢复/.test(command)) {
    activateTab("settings");
    appendWorkbenchAssistantMessage("正在读取云端最新备份并验证恢复格式。");
    await inspectCloudBackup();
    appendWorkbenchAssistantMessage("验证完成，详情已经显示在设置页。");
    return;
  }
  if (/设置/.test(command) && /分发|设备|发送/.test(command)) {
    activateTab("distribution");
    openPageSettings("distribution");
    appendWorkbenchAssistantMessage("已经打开内容分发设置。");
    return;
  }
  if (/内容制作|作品制作|生产界面/.test(command) && !/生产\s*\d+/.test(command)) {
    activateTab("dashboard");
    appendWorkbenchAssistantMessage("已经切换到内容制作。");
    return;
  }
  if (/打开|进入|切换/.test(command) && /流量转化/.test(command)) {
    activateTab("conversion");
    appendWorkbenchAssistantMessage("已经打开流量转化。");
    return;
  }
  if (/打开|进入|切换/.test(command) && /插件/.test(command)) {
    activateTab("plugins");
    appendWorkbenchAssistantMessage("已经打开插件市场。");
    return;
  }
  if (/打开|进入|切换/.test(command) && /全局设置|软件设置|API|备份/.test(command)) {
    activateTab("settings");
    appendWorkbenchAssistantMessage("已经打开全局设置；API、备份和软件诊断都在这里。");
    return;
  }
  if (/当前|现在|状态|概况|还有多少|剩多少/.test(command) && /设备|作品|库存|任务|系统|工作台/.test(command)) {
    appendWorkbenchAssistantMessage(workbenchAssistantStatus());
    return;
  }

  const deviceNumber = command.match(/(\d+)\s*号/)?.[1];
  const collectionToken = command.match(/作品集[_-]?\d+(?:\[(?:泛|转)\])?/i)?.[0];
  const wantsSend = /发|发送|推送|补/.test(command);
  if (wantsSend && deviceNumber) {
    const device = assistantDevice(deviceNumber);
    if (!device) {
      appendWorkbenchAssistantMessage(`没有找到已登记的 ${deviceNumber} 号设备。`);
      return;
    }
    if (!device.online || device.trusted === false) {
      appendWorkbenchAssistantMessage(`${deviceNumber}号当前离线或尚未确认，已阻止发送。`);
      return;
    }
    activateTab("distribution");
    if (collectionToken) {
      const collection = (dashboard?.distribution?.collections || []).find((item) =>
        item.name.toLowerCase().startsWith(collectionToken.toLowerCase())
      );
      if (!collection || !collection.sourceValid || !collection.dualPlatformEligible) {
        appendWorkbenchAssistantMessage(`${collectionToken} 当前不可发送，可能已经使用或不在手机待发阶段。`);
        return;
      }
      selectedDistributionCollectionName = collection.name;
      selectedDistributionDeviceId = device.id;
      appendWorkbenchAssistantMessage(`已核对 ${collection.name} 和 ${deviceNumber}号，正在按分发安全规则执行。`);
      await sendSelectedDistributionPackage();
      return;
    }
    const type = /精准|业务|转化/.test(command) ? "conversion" : /泛流量|游戏/.test(command) ? "traffic" : "";
    if (!type) {
      appendWorkbenchAssistantMessage("请补充“精准流量”或“泛流量”，我才能选择正确作品集。");
      return;
    }
    appendWorkbenchAssistantMessage(`正在给${deviceNumber}号补充一个${type === "conversion" ? "精准流量" : "泛流量"}作品集。`);
    await executeDistributionAction({
      action: "device-restock",
      device: device.aliases?.[0] || device.displayName,
      type
    }, `给${deviceNumber}号发送一个${type === "conversion" ? "精准流量" : "泛流量"}作品集`);
    return;
  }

  const productionCount = Number(command.match(/(?:生产|制作)\s*(\d+)\s*(?:个|套)/)?.[1] || 0);
  if (productionCount) {
    activateTab("dashboard");
    const selectedCount = selectedProductionMaterials().length;
    if (selectedCount && selectedTemplate) {
      appendWorkbenchAssistantMessage(`当前已选 ${selectedCount} 个素材文件夹和模板 ${selectedTemplate.name || selectedTemplate.id}。我正在建立生产计划，计划出来后请确认页面清单。`);
      await createProductionPlan();
    } else {
      appendWorkbenchAssistantMessage(`已经切到内容制作。请在左侧选择 ${productionCount} 个素材文件夹和一个模板；系统会自动按选择数量建立批量计划。`);
    }
    return;
  }
  if (options.allowModel === false) {
    appendWorkbenchAssistantMessage("我还缺少必要信息。请补充设备号码、作品集名称或精准/泛流量分类。");
    return;
  }
  appendWorkbenchAssistantMessage("我先理解一下你的意思，再决定是直接执行还是追问。");
  try {
    const result = await api("/api/workbench-assistant/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command })
    });
    await executeInterpretedWorkbenchAssistant(result.interpretation);
  } catch {
    appendWorkbenchAssistantMessage("智能理解当前没有连上，但常用操作仍可直接执行。你可以说“你能干嘛”查看能力，或补充页面、设备号码、作品集和流量分类。");
  }
}

function showDistributionPanel(panel) {
  activeDistributionPanel = panel || "devices";
  $$("#distributionTabs button").forEach((button) => button.classList.toggle("active", button.dataset.panel === activeDistributionPanel));
  $$(".distribution-panel").forEach((section) => section.classList.toggle("active", section.id === `distribution${activeDistributionPanel[0].toUpperCase()}${activeDistributionPanel.slice(1)}`));
}

const WORKBENCH_THEME_ORDER = ["neo", "glass", "midnight", "midnight-glass"];
const WORKBENCH_THEME_NAMES = { neo: "拟态浅色", glass: "玻璃浅色", midnight: "拟态深色", "midnight-glass": "玻璃深色" };

function applyTheme(theme, options = {}) {
  const aliases = {
    solid: "neo",
    neumorphic: "neo",
    jianghu: "neo",
    editorial: "neo",
    dark: "midnight"
  };
  const value = WORKBENCH_THEME_ORDER.includes(theme) ? theme : (aliases[theme] || "neo");
  document.body.dataset.theme = value;
  if (options.persist !== false) localStorage.setItem("tb-dashboard-theme", value);
  $$(".theme-option").forEach((button) => button.classList.toggle("active", button.dataset.theme === value));
  const cycleButton = $("#globalThemeCycleBtn");
  const themeName = $("#globalThemeName");
  const currentIndex = WORKBENCH_THEME_ORDER.indexOf(value);
  const nextValue = WORKBENCH_THEME_ORDER[(currentIndex + 1) % WORKBENCH_THEME_ORDER.length];
  const currentName = WORKBENCH_THEME_NAMES[value];
  const nextName = WORKBENCH_THEME_NAMES[nextValue];
  if (themeName) themeName.textContent = currentName;
  if (cycleButton) {
    cycleButton.dataset.currentTheme = value;
    cycleButton.title = `当前${currentName}，点击切换为${nextName}`;
    cycleButton.setAttribute("aria-label", cycleButton.title);
  }
  syncConversionTheme(value);
  window.gptWorkbench?.setTheme?.(value).catch(() => {});
}

function syncConversionTheme(theme = document.body.dataset.theme || "neo") {
  const view = $("#conversionView");
  if (view) view.dataset.themeSynced = theme;
}

async function startDistributionTransfer(payload) {
  try {
    const task = await api("/api/distribution/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, confirmed: true })
    });
    distributionTransferUiTasks.set(task.id, task);
    packageDevicePickerCollectionName = "";
    renderDistribution();
    renderCollections();
    ensureTransferPolling();
    toast("发送任务已经建立，可在页面查看进度");
  } catch (error) {
    showSystemNotice("无法开始分发", error.message, { tone: "danger" });
  }
}

async function executeDistributionAction(payload, description) {
  const isOfficial = payload.action === "official-reserve";
  const needsConfirmation = isOfficial || pageSettings().distribution?.requireSendConfirmation === true;
  const confirmed = !needsConfirmation || await openSystemDialog({
    eyebrow: isOfficial ? "公众号补笔记" : "手机补笔记",
    title: isOfficial ? "打开一个公众号可用作品包？" : "确认随机补充作品包？",
    description,
    details: isOfficial ? [] : [
      { label: "目标设备", value: payload.device },
      { label: "内容类型", value: payload.type === "conversion" ? "精准流量（业务类）" : "泛流量" }
    ],
    warning: isOfficial
      ? "打开文件夹只会登记为“已打开过”，上传完成后还需要回到这里确认。"
      : "手机确认接收后，原作品文件夹会真实移动到“微信公众号”，不会再次进入手机待发送列表。",
    cancelLabel: "返回",
    confirmLabel: isOfficial ? "打开作品包" : "确认发送"
  });
  if (!confirmed) return;
  if (!isOfficial) {
    await startDistributionTransfer(payload);
    return;
  }
  toast("正在准备公众号作品包");
  try {
    await api("/api/distribution/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, confirmed: true })
    });
    await loadDashboard(true);
    activateTab("distribution");
    showDistributionPanel("official");
    toast("作品包已打开，并登记为已打开过");
  } catch (error) {
    showSystemNotice("公众号作品包没有打开", error.message, { tone: "danger" });
  }
}

async function confirmOfficialCollection(collection) {
  const confirmed = await openSystemDialog({
    eyebrow: "公众号上传确认",
    title: "这份作品已经上传完成？",
    description: "确认后会写入完成记录，作品源文件仍然保留。",
    details: [{ label: "作品包", value: collection }],
    warning: "只有确实在公众号后台完成上传后再确认，避免下次误判可用库存。",
    cancelLabel: "还没有",
    confirmLabel: "确认已上传"
  });
  if (!confirmed) return;
  try {
    await api("/api/distribution/confirm-official", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, confirmed: true })
    });
    await loadDashboard(true);
    activateTab("distribution");
    showDistributionPanel("official");
    toast("已记录为公众号上传完成");
  } catch (error) {
    showSystemNotice("确认记录没有保存", error.message, { tone: "danger" });
  }
}

async function markCollectionUsed(collection) {
  const confirmed = await openSystemDialog({
    eyebrow: "公众号",
    title: "确认抖音、小红书和公众号都已发布？",
    description: "确认后会在“已发送”生成压缩包；压缩包校验成功后删除原作品文件夹。",
    details: [{ label: "作品包", value: collection }],
    warning: "这是释放空间的归档动作。压缩失败或存在同名压缩包时，原文件夹会保留。",
    cancelLabel: "取消",
    confirmLabel: "压缩并归档"
  });
  if (!confirmed) return;
  try {
    await api("/api/distribution/mark-used", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, confirmed: true })
    });
    await loadDashboard(true);
    collectionFilters.stage = "used";
    activeDistributionPanel = "used";
    renderCollections();
    renderDistribution();
    toast("已压缩到“已发送”，原文件夹已清理");
  } catch (error) {
    showSystemNotice("没有完成移动", error.message, { tone: "danger" });
  }
}

async function classifyDistributionCollection(collection, type) {
  const label = type === "conversion" ? "精准流量帖" : type === "traffic" ? "泛流量帖" : "未分类";
  try {
    const result = await api("/api/distribution/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, type, confirmed: true })
    });
    distributionCollectionTypeFilter = type;
    selectedDistributionCollectionName = result.targetName || collection;
    await loadDashboard(true);
    renderCollections();
    renderDistribution();
    toast(`已归为“${label}”，本地文件夹已同步改名`);
  } catch (error) {
    await loadDashboard(true);
    renderDistribution();
    showSystemNotice("分类没有修改", error.message, { tone: "danger" });
  }
}

async function reconcileDistributionFolders() {
  const confirmed = await openSystemDialog({
    eyebrow: "本地文件夹整理",
    title: "按历史发布记录整理现有作品？",
    description: "未发送的作品移入“抖音小红书”；已发手机的移入“微信公众号”；三端已发布的压缩到“已发送”并清理原文件夹。",
    details: [
      { label: "待手机", value: dashboard?.distribution?.stageRoots?.mobile || "抖音小红书" },
      { label: "待公众号", value: dashboard?.distribution?.stageRoots?.official || "微信公众号" },
      { label: "已完成", value: dashboard?.distribution?.stageRoots?.used || "已发送" }
    ],
    warning: "同名文件或压缩包冲突时会停止对应作品，不会覆盖；压缩失败不会删除原文件夹。",
    cancelLabel: "取消",
    confirmLabel: "开始整理"
  });
  if (!confirmed) return;
  try {
    const result = await api("/api/distribution/reconcile-folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true })
    });
    await loadDashboard(true);
    renderCollections();
    const summary = result.summary || {};
    toast(`整理完成：抖音小红书 ${summary.mobile || 0}，微信公众号 ${summary.official || 0}，已发送 ${summary.used || 0}`);
  } catch (error) {
    showSystemNotice("文件夹整理没有完成", error.message, { tone: "danger" });
  }
}

function beginDeviceNoteEdit(button) {
  const row = button.closest("[data-device-id]");
  const device = dashboard?.distribution?.devices?.find((item) => item.id === row?.dataset.deviceId);
  if (!device || row.querySelector(".device-note-input")) return;
  const input = document.createElement("input");
  input.className = "device-note-input";
  input.value = device.note || device.localRemark || device.displayName;
  input.maxLength = 100;
  input.setAttribute("aria-label", "设备名称或编号");
  button.replaceWith(input);
  input.focus();
  input.select();
  let saved = false;
  const finish = async (cancel = false) => {
    if (saved) return;
    saved = true;
    if (!cancel) {
      try {
        await api("/api/devices/note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: device.id, note: input.value })
        });
        device.note = input.value.trim();
        toast("设备名称或编号已保存");
      } catch (error) {
        showSystemNotice("设备名称或编号没有保存", error.message, { tone: "danger" });
      }
    }
    renderDistribution();
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") finish();
    if (event.key === "Escape") finish(true);
  });
  input.addEventListener("blur", () => finish());
}

async function sendSelectedDistributionPackage() {
  const data = dashboard?.distribution || {};
  const collection = (data.collections || []).find((item) =>
    item.name === selectedDistributionCollectionName
  );
  const devices = DistributionUI.decorateDevices(data.devices || [], deviceCheckState.onlineDevices || []);
  const device = devices.find((item) => item.id === selectedDistributionDeviceId && item.online && item.trusted !== false);
  if (!collection) return showSystemNotice("还没有选择作品包", "请先在列表里选择要发送的作品包。");
  if (!device) return showSystemNotice("目标设备已经离线", "返回设备选择列表，选择一台当前在线设备。");
  const typeLabel = collection.type === "conversion" ? "精准流量" : "泛流量";
  const needsConfirmation = pageSettings().distribution?.requireSendConfirmation === true;
  const confirmed = !needsConfirmation || await openSystemDialog({
    eyebrow: "发送作品包",
    title: "确认发送到这台设备？",
    description: "确认后会立即开始发送，页面会持续显示百分比、当前阶段和最终结果。",
    details: [
      { label: "作品包", value: collection.name },
      { label: "目标设备", value: device.note || device.displayName },
      { label: "内容类型", value: typeLabel }
    ],
    warning: "发送完成并由手机确认接收后，作品文件夹会进入“微信公众号”，等待公众号发布。",
    cancelLabel: "返回重选",
    confirmLabel: "确认发送"
  });
  if (!confirmed) {
    packageDevicePickerCollectionName = collection.name;
    renderDistribution();
    return;
  }
  await startDistributionTransfer({
    action: "device-restock",
    device: device.aliases?.[0] || device.displayName,
    type: collection.type,
    collection: collection.name
  });
}

async function checkDistributionDevices(options = {}) {
  if (deviceScanRunning) return;
  deviceScanRunning = true;
  deviceCheckState = { ...deviceCheckState, scanning: true };
  if (dashboard?.distribution) renderDistribution();
  const refreshButton = $("#distributionRefreshBtn");
  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.classList.add("is-refreshing");
    refreshButton.setAttribute("aria-label", "正在刷新设备状态");
  }
  if (!options.silent) toast("正在刷新设备与库存");
  try {
    const result = await api("/api/distribution/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inventory: options.refreshInventory !== false,
        force: options.silent !== true
      })
    });
    deviceCheckState = {
      registered: Number.isFinite(result.registered) ? result.registered : DistributionUI.parseDeviceCheckOutput(result.output).registered,
      online: Number.isFinite(result.online) ? result.online : DistributionUI.parseDeviceCheckOutput(result.output).online,
      output: result.output || "",
      onlineDevices: Array.isArray(result.onlineDevices)
        ? result.onlineDevices
        : DistributionUI.parseDeviceStatusOutput(result.statusOutput),
      scanning: false
    };
    deviceScanStarted = true;
    if (options.refreshInventory !== false) await loadDashboard(true);
    renderDistribution();
    if ((result.automationTriggered || []).length) {
      const count = result.automationTriggered.reduce((sum, item) => sum + Number(item.count || 0), 0);
      toast(`已自动建立 ${count} 个作品集分发任务，可查看实时进度`);
      ensureTransferPolling();
      await restoreTransferTasks();
    }
    if (!options.silent) {
      toast(deviceCheckState.online == null ? "刷新完成，请查看结果" : `已刷新：当前在线 ${deviceCheckState.online} 台`);
    }
  } catch (error) {
    deviceCheckState = { ...deviceCheckState, scanning: false };
    if (dashboard?.distribution) renderDistribution();
    if (!options.silent) showSystemNotice("设备状态刷新失败", error.message, { tone: "danger" });
    else console.warn("设备自动扫描跳过（静默模式）:", error.message || error);
  } finally {
    deviceScanRunning = false;
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.classList.remove("is-refreshing");
      refreshButton.setAttribute("aria-label", "立即刷新设备与库存");
    }
  }
}

async function loadJuguang(force = false) {
  if (juguangData && !force) return renderJuguang();
  juguangData = await api("/api/juguang");
  renderJuguang();
}

function renderJuguang() {
  if (!juguangData) return;
  const counts = juguangData.counts || {};
  $("#juguangMode").textContent = `数据更新：${juguangData.updatedAt ? new Date(juguangData.updatedAt).toLocaleString("zh-CN") : "暂无"}`;
  $("#juguangApiStatus").textContent = juguangData.api?.configured ? "Marketing API 已配置" : "本地快照模式";
  $("#juguangApiMessage").textContent = juguangData.api?.message || "";
  $("#juguangLeadStatus").textContent = `${juguangData.leads?.total || 0} 条线索 · ${juguangData.leads?.attributed || 0} 条可归因`;
  $("#juguangStats").innerHTML = [["关键词", counts.all], ["蓝海词", counts.blueOcean], ["高点击词", counts.highClick], ["同行买词", counts.peerBuying], ["笔记样本", counts.notes]]
    .map(([label, value]) => `<article class="panel glass juguang-stat"><span>${label}</span><strong>${formatNumber(value)}</strong></article>`).join("");
  $("#juguangNextActions").innerHTML = (juguangData.nextActions || []).map((action) => `<li>${escapeHtml(action)}</li>`).join("");
  renderJuguangRecommendations();
}

function renderJuguangRecommendations() {
  if (!juguangData) return;
  const query = ($("#juguangKeywordSearch")?.value || "").trim().toLowerCase();
  const items = (juguangData.recommendations || []).filter((item) => !query || item.keyword.toLowerCase().includes(query) || item.reason.toLowerCase().includes(query));
  $("#juguangRecommendations").innerHTML = items.length ? items.map((item) => `
    <article class="juguang-row">
      <div><strong>${escapeHtml(item.keyword)}</strong><p>${escapeHtml(item.reason || "业务相关候选")}</p></div>
      <div class="juguang-metrics"><span>搜索 ${formatNumber(item.monthlySearch)}</span><span>竞争 ${escapeHtml(item.competition || "-")}</span><span>出价 ¥${Number(item.marketBid || 0).toFixed(2)}</span></div>
      <div><b>${escapeHtml(item.action)}</b><p>${escapeHtml(item.titlePattern)}</p></div>
      <button class="ghost-button juguang-copy" data-keyword="${escapeHtml(item.keyword)}">复制选题</button>
    </article>`).join("") : `<div class="summary-text">当前候选里没有匹配项。可先补采该地域/玩法词。</div>`;
  $$(".juguang-copy").forEach((button) => button.addEventListener("click", () => {
    copyText(`复刻选题：${button.dataset.keyword}。按“人数 + 玩法 + 预算/路线 + 避坑”生成团建笔记，并保留目标关键词。`, "选题指令已复制");
  }));
}

function conversionSopData() {
  return conversionData?.sop?.数据 || conversionData?.sop?.data || {};
}

function conversionRoles() {
  return conversionSopData()?.角色 || conversionSopData()?.roles || {};
}

function readableConversionValue(value, depth = 0) {
  if (value == null || value === "") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return `<p>${escapeHtml(String(value))}</p>`;
  }
  if (Array.isArray(value)) {
    return `<ul>${value.map((item) => `<li>${typeof item === "object" ? readableConversionValue(item, depth + 1) : escapeHtml(String(item))}</li>`).join("")}</ul>`;
  }
  if (depth > 3) return `<p>${escapeHtml(JSON.stringify(value))}</p>`;
  return Object.entries(value).map(([key, item]) => `
    <section class="conversion-result-section">
      <strong>${escapeHtml(key)}</strong>
      ${readableConversionValue(item, depth + 1)}
    </section>`).join("");
}

function conversionSearchSnapshot() {
  return conversionData?.search?.数据 || conversionData?.search?.data || {};
}

function conversionHistories() {
  const data = conversionSearchSnapshot();
  return Array.isArray(data.候选) ? data.候选 : Array.isArray(data.items) ? data.items : [];
}

function conversionPlans() {
  const data = conversionData?.plans?.数据 || conversionData?.plans?.data || {};
  return Array.isArray(data.方案) ? data.方案 : Array.isArray(data.plans) ? data.plans : [];
}

function conversionNorm(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function conversionHistoryQuestion(item) {
  return item?.问题 || item?.客户问题 || item?.客户原话 || item?.question || item?.标题 || item?.用户 || item?.原文 || "";
}

function conversionHistoryAnswer(item) {
  const value = item?.回复 || item?.回答 || item?.answer || item?.建议回复 || item?.内容 || item?.历史回复 || item?.历史回复原话 || "";
  return Array.isArray(value) ? value.join("\n") : String(value || "");
}

function conversionHistoryText(item) {
  return [
    conversionHistoryQuestion(item),
    conversionHistoryAnswer(item),
    item?.身份,
    item?.角色,
    item?.来源,
    item?.source,
    item?.标签,
    item?.场景
  ].flat().filter(Boolean).join(" ");
}

function matchConversionHistories(query = "", role = conversionRole) {
  const q = conversionNorm(query);
  return conversionHistories()
    .map((item, index) => {
      const text = conversionNorm(conversionHistoryText(item));
      const roleHit = !role || text.includes(conversionNorm(role)) ? 8 : 0;
      const queryHit = q ? (text.includes(q) ? 30 : q.split(/[，,。！？\s]+/).filter(Boolean).reduce((sum, token) => sum + (text.includes(token) ? 6 : 0), 0)) : 10;
      return { item, index, score: roleHit + queryHit };
    })
    .filter(row => !q || row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 25)
    .map(row => row.item);
}

function renderConversionHistoryCards(rows = matchConversionHistories("", conversionRole)) {
  if (!rows.length) return '<div class="conversion-empty">没有匹配到历史回答，可以换一句客户原话再搜。</div>';
  return rows.map((item) => {
    const question = conversionHistoryQuestion(item) || "未命名客户问题";
    const answer = conversionHistoryAnswer(item) || "这条历史记录暂无可展示回复。";
    const tags = [item?.身份, item?.角色, item?.分桶, item?.环节, item?.来源, item?.source, item?.场景].filter(Boolean).slice(0, 4);
    const meta = [item?.时间, item?.日期, item?.文件, item?.会话, item?.回复人].flat().filter(Boolean).join(" · ");
    return `
      <article class="conversion-history-card">
        <div class="conversion-history-head">
          <div class="conversion-history-tags">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
          <button class="conversion-btn" type="button" data-copy-history="${escapeHtml(answer)}">复制</button>
        </div>
        <h3>${escapeHtml(question)}</h3>
        <p>${escapeHtml(answer)}</p>
        ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
      </article>`;
  }).join("");
}

function renderConversionChatSourceStats() {
  const status = conversionData?.search?.状态 || conversionData?.search?.status || {};
  const indexed = status.已入库统计 || {};
  const scan = status.扫描统计 || {};
  const items = [
    ["历史问答", indexed.候选 || indexed.问答 || conversionHistories().length],
    ["有效会话", scan.会话],
    ["消息", scan.消息],
    ["群聊", scan.群聊],
    ["私聊", scan.私聊]
  ].filter(([, value]) => value !== undefined && value !== "");
  return `<section class="conversion-source-stats" id="conversionChatSourceStats">${items.map(([name, value]) => `<span><small>${escapeHtml(name)}</small><b>${formatNumber(Number(value) || 0)}</b></span>`).join("")}</section>`;
}

function conversionPlanText(plan) {
  return conversionNorm([
    plan?.标题,
    plan?.城市,
    plan?.省份,
    plan?.时长,
    plan?.状态,
    plan?.格式,
    plan?.摘要,
    plan?.原文件,
    ...(plan?.活动 || []),
    ...(plan?.标签 || [])
  ].filter(Boolean).join(" "));
}

function matchConversionPlans(query = "", filters = []) {
  const q = conversionNorm(query);
  const picked = filters.map(item => conversionNorm(String(item).split(":").pop())).filter(Boolean);
  if (!q && !picked.length) return conversionPlans().slice(0, 12);
  return conversionPlans()
    .map((plan) => {
      const text = conversionPlanText(plan);
      const filterHit = picked.reduce((sum, token) => sum + (text.includes(token) ? 10 : 0), 0);
      const queryHit = q ? (text.includes(q) ? 25 : q.split(/[，,。！？\s]+/).filter(Boolean).reduce((sum, token) => sum + (text.includes(token) ? 5 : 0), 0)) : 0;
      return { plan, score: filterHit + queryHit };
    })
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
    .map(row => row.plan);
}

function renderConversionPlanCards(rows = []) {
  if (!rows.length) return '<div class="conversion-empty">输入需求或选择筛选条件后，这里会显示本地方案匹配结果。</div>';
  return rows.map((plan) => {
    const tags = [plan?.城市, plan?.时长, plan?.状态, plan?.格式, ...(plan?.活动 || [])].filter(Boolean).slice(0, 10);
    return `
      <article class="conversion-plan-card">
        <div>
          <h3>${escapeHtml(plan?.标题 || "未命名方案")}</h3>
          <div class="conversion-plan-tags">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
          ${plan?.摘要 ? `<p>${escapeHtml(plan.摘要)}</p>` : ""}
        </div>
        <small>${escapeHtml(plan?.原文件 || "")}</small>
      </article>`;
  }).join("");
}

function renderConversionProposalStats() {
  const plans = conversionPlans();
  const status = conversionData?.plans?.状态 || conversionData?.plans?.status || {};
  const counts = { PPT: 0, PDF: 0, Word: 0, 其他: 0 };
  plans.forEach(plan => {
    const format = String(plan?.格式 || plan?.原文件 || "").toLowerCase();
    if (format.includes("ppt")) counts.PPT += 1;
    else if (format.includes("pdf")) counts.PDF += 1;
    else if (format.includes("doc") || format.includes("wps")) counts.Word += 1;
    else counts.其他 += 1;
  });
  const total = plans.length || Number(status.索引方案 || 0);
  return `<section class="conversion-proposal-stats"><span><small>当前方案库</small><b>${formatNumber(total)}</b></span>${Object.entries(counts).map(([name, value]) => `<span><small>${name}</small><b>${formatNumber(value)}</b></span>`).join("")}</section>`;
}

const DEFAULT_CONVERSION_JOURNEY_STAGES = [
  { n: "01", role: "公域运营", title: "客户第一次出现", signal: "评论区、私信、公众号、抖音/小红书截图，客户提出团建、人事群或方案需求。", yes: "识别为真实团建需求，进入轻量承接。", no: "广告、供应商、人事群闲聊、无关内容，标记脏数据并停止推进。", next: "来源确认 → 需求收集", copy: "您好呀，您这边是想了解团建方案，还是想进相关交流群呢？", method: "先判断是不是业务线索，不把所有加好友都当客户。" },
  { n: "02", role: "前端运营", title: "轻量确认最小信息", signal: "客户愿意继续聊，但需求还不完整。", yes: "至少拿到人数 + 大致地点/出发地，能问则补日期或天数。", no: "客户只说“先看看/还没定”，不追问一串表格，保留一个自然入口。", next: "信息基本完整 → 引导加微信/PPT/拉群", copy: "可以的，我先简单了解下：大概多少人、从哪里出发呢？有个方向后我就能帮您找合适的方案。", method: "前端只完成必要信息交换，不在公域报价，不把客户问烦。" },
  { n: "03", role: "前端运营", title: "判断是否推进到微信或策划群", signal: "人数和方向明确，或客户主动要方案、报价、PPT。", yes: "自然说明微信/PPT/策划师承接的价值，再完成加微或拉群。", no: "客户对加微信有顾虑，先在当前渠道继续解决一个关键问题，再二次引导。", next: "加微成功 → 轻量互动 → 拉群交接", copy: "您把人数和方向告诉我就行，完整行程和报价需要策划师按团队定制。我先给您拉个群对接，您不用重复说一遍。", method: "不是为了“加上就算完成”，而是让客户知道下一步会得到什么。" },
  { n: "04", role: "前端运营", title: "拉群交接与信息摘要", signal: "客户已加微信或进入客户转化群。", yes: "把已知人数、日期、地点、偏好、预算和未确认项一次性交给策划师。", no: "客户未回复或暂时没时间，建立待跟进，不重复轰炸。", next: "策划师接手 → 需求确认", copy: "我先把您刚才说的情况同步给策划师，稍等下他会在群里和您对接，方案和报价也会按这个方向来。", method: "交接的核心是减少客户重复叙述，避免前后端信息断层。" },
  { n: "05", role: "后端转化", title: "需求确认与方案匹配", signal: "策划师进入群，客户已提供部分需求。", yes: "补齐日期、人数、出发、住宿、餐标、交通、活动偏好和预算边界。", no: "信息矛盾、预算不匹配或需求变更，先复述确认，再给可选方向。", next: "形成一版或多版定制方案 → 解释差异", copy: "我先按您现在确认的条件梳理一下：人数、日期、出发地和预算先不变，活动和住宿我给您配两种方向，您看哪种更接近？", method: "后端不是只发 PPT，而是把客户条件变成可比较的方案选择。" },
  { n: "06", role: "后端转化", title: "方案、报价与异议处理", signal: "客户已看到方案，开始问价格、包含项、酒店、活动、天气或替代方案。", yes: "逐项回答客户真正问的内容，说明差异、边界和可调整项，再推进确认。", no: "客户沉默、说贵、要讨论或暂时没日期，记录原因和下一次跟进点。", next: "方案确认 → 合同税务付款", copy: "这个价格差异主要在住宿和活动时长，我把两版的区别列给您看；如果预算要控制，我们可以先保留核心活动，再调整住宿标准。", method: "先接住问题，再推进成交；不能用“好的/收到/稍等”代替解释。" },
  { n: "07", role: "后端转化", title: "合同、付款与执行交底", signal: "客户确认方案、要求出合同或准备付款。", yes: "确认公司信息、开票、定金、尾款、盖章、联系人及执行细节。", no: "合同信息缺失、付款未到或临时变更，明确责任人和截止时间，留下可追踪记录。", next: "执行前复核 → 活动交付 → 复购/转介绍", copy: "好的，合同我按确认方案整理；麻烦补充开票信息和联系人，定金安排后把截图发我，我这边跟财务核对。", method: "成交不是收完定金就结束，执行前的信息复核决定最终体验。" },
  { n: "08", role: "全链路复盘", title: "结果回流知识库", signal: "成交、流失、未回复、方案调整或客户提出新问题。", yes: "把有效路径、错配回复、流失原因和新分支归档到对应 SOP。", no: "只有一句孤立回复或无法判断上下文，保留为待复核，不直接进入推荐。", next: "下一次搜索与推荐继续使用", copy: "这次对话已记录：客户从哪里来、在哪一步卡住、哪种回复推进了下一步，后续同类客户直接复用。", method: "知识库不是“存消息”，而是持续更新判断树和可执行动作。" }
];

function renderConversionSearch() {
  const identities = [
    { key: "前端运营", label: "前端运营", desc: "主动搞流量 · 价值钩子 · 留资交接", goal: "目标是把公域流量拉到私域，再拉群交接给策划师。" },
    { key: "后端转化", label: "后端转化", desc: "补齐需求 · 方案报价 · 跟进成交", goal: "目标是在群里补齐需求、出方案、报价并促成定金。" }
  ];
  const current = identities.find(i => i.key === conversionRole) || identities[0];
  const initialHistories = matchConversionHistories("", conversionRole);
  return `
    ${renderConversionChatSourceStats()}
    <section class="conversion-assistant-shell">
      <aside class="conversion-identity-panel">
        <div class="conversion-identity-title">我现在负责</div>
        ${identities.map(id => `
          <button class="conversion-identity-option ${id.key === conversionRole ? "active" : ""}" type="button" data-conversion-role="${escapeHtml(id.key)}">
            <b>${escapeHtml(id.label)}</b>
            <span>${escapeHtml(id.desc)}</span>
          </button>`).join("")}
        <div class="conversion-identity-goal">${escapeHtml(current.goal)}</div>
      </aside>
      <div class="conversion-search-shell">
        <div class="conversion-customer-label">
          <span>客户刚刚说</span>
          <small>直接粘贴一句或一段真实对话</small>
        </div>
        <textarea id="conversionQuestion" class="conversion-query" rows="5" placeholder="例如：客户说预算还没定，先看看有哪些适合30人的杭州周边方案"></textarea>
        <div class="conversion-composer-actions">
          <button class="conversion-btn" id="conversionLocalSearchBtn" type="button">查历史回答</button>
          <button class="conversion-btn primary" id="conversionSearchBtn" type="button">AI 智能建议</button>
        </div>
      </div>
    </section>
    <div class="conversion-statusline" id="conversionStatusline">当前身份：${escapeHtml(conversionRole)} · 已载入 ${formatNumber(conversionHistories().length)} 条历史问答，默认展示最相关的 ${initialHistories.length} 条。</div>
    <section class="conversion-result" id="conversionSearchResult">${conversionResult ? readableConversionValue(conversionResult) : '<div class="conversion-empty">输入客户原话后，这里会显示 AI 可直接使用的回复与下一步。</div>'}</section>
    <section class="conversion-local-results">
      <header><span>真实历史回答</span><small>来自聊天源和已确认问答，不是临时占位。</small></header>
      <div id="conversionHistoryResults">${renderConversionHistoryCards(initialHistories)}</div>
    </section>`;
}

function renderConversionSop() {
  const roles = conversionRoles();
  const role = roles[conversionRole] || Object.values(roles)[0] || {};
  const stages = role.环节 || role.stages || [];
  const activeStage = stages[conversionActiveStageIndex] || stages[0] || {};
  const questions = activeStage.问答 || activeStage.questions || [];
  const totalQuestions = Number(role.问题数 || 0) || stages.reduce((sum, s) => sum + (s.问答 || []).length, 0);
  return `
    <section class="conversion-sop-shell">
      <aside class="conversion-sop-rail">
        <div class="conversion-role-intro">
          <div class="conversion-role-switch">
            ${Object.keys(roles).map((name) => `<button class="${name === conversionRole ? "active" : ""}" type="button" data-conversion-role="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("")}
          </div>
          <p class="conversion-role-desc">${escapeHtml(role.定位 || "按客户当前所在环节查看下一步。")}</p>
          <small class="conversion-sop-count">${totalQuestions} 个正式问题</small>
        </div>
        <div class="conversion-stage-list">
          ${stages.map((stage, idx) => `
            <button class="conversion-stage-button ${idx === conversionActiveStageIndex ? "active" : ""}" type="button" data-conversion-stage="${idx}">
              <span class="conversion-stage-code">${escapeHtml(stage.编号 || String(idx + 1).padStart(2, "0"))}</span>
              <span><b>${escapeHtml(stage.名称 || "未命名环节")}</b><br><small>${(stage.问答 || []).length} 个问题</small></span>
              <span class="conversion-stage-arrow">›</span>
            </button>`).join("") || '<div class="conversion-empty">当前没有可显示的 SOP 环节。</div>'}
        </div>
      </aside>
      <div class="conversion-stage-detail">
        ${activeStage && activeStage.名称 ? `
          <div class="conversion-stage-kicker">${escapeHtml(conversionRole)} · 按时间顺序执行</div>
          <h2>${escapeHtml(activeStage.名称 || "")}</h2>
          <p class="conversion-stage-principle">${escapeHtml(activeStage.原则 || "一个问题可以有多个回复；第一条是当前推荐，其他是可换着用的表达。")}</p>
          ${questions.map(question => {
            const answers = question.回复 || [];
            const best = answers[0];
            const more = answers.slice(1);
            return `
              <article class="conversion-script-block" data-question="${escapeHtml(question.编号 || "")}">
                <h3>${escapeHtml(question.问题 || "")}</h3>
                ${best ? `
                  <div class="conversion-answer-main">
                    <span class="conversion-answer-label">问题回复</span>
                    <div class="conversion-answer-text">${escapeHtml(best.内容 || "")}</div>
                    <div class="conversion-answer-actions">
                      <button class="conversion-btn primary" data-copy-answer="${escapeHtml(best.id || "")}">复制</button>
                      <button class="conversion-like-btn" data-like-answer="${escapeHtml(best.id || "")}">👍 <b>${Number(best.默认点赞 || 0)}</b></button>
                    </div>
                  </div>` : ""}
                ${more.length ? `
                  <details class="conversion-more-answers">
                    <summary>更多回复（${more.length}）</summary>
                    ${more.map(answer => `
                      <div class="conversion-answer-alt">
                        <div class="conversion-answer-text">${escapeHtml(answer.内容 || "")}</div>
                        <div class="conversion-answer-actions">
                          <button class="conversion-btn primary" data-copy-answer="${escapeHtml(answer.id || "")}">复制</button>
                          <button class="conversion-like-btn" data-like-answer="${escapeHtml(answer.id || "")}">👍 <b>${Number(answer.默认点赞 || 0)}</b></button>
                        </div>
                      </div>`).join("")}
                  </details>` : ""}
                <div class="conversion-next-step"><b>下一步：</b>${escapeHtml(question.下一步 || "根据客户反馈继续推进")}</div>
              </article>`;
          }).join("") || '<div class="conversion-empty">这个环节暂无问答内容。</div>'}
        ` : '<div class="conversion-empty">选择左侧环节查看详情。</div>'}
      </div>
    </section>`;
}

function renderConversionProposal() {
  const filterGroups = [
    { label: "地点", options: ["杭州", "安吉", "莫干山", "临安", "舟山", "上海", "义乌", "诸暨", "宁波", "绍兴", "湖州", "嘉兴", "苏州", "富阳", "桐庐", "千岛湖", "德清", "长兴"] },
    { label: "时长", options: ["半日", "一日", "两日", "三日"] },
    { label: "活动", options: ["草坪", "烧烤", "露营", "溯溪", "骑行", "飞盘", "剧本杀", "篝火", "采摘", "漂流"] },
    { label: "住宿", options: ["酒店", "民宿", "帐篷", "别墅", "不需住宿"] },
    { label: "价格", options: ["人均200以下", "人均200-300", "人均300-500", "人均500以上"] }
  ];
  const initialPlans = matchConversionPlans("", []);
  return `
    <section class="conversion-proposal-shell">
      ${renderConversionProposalStats()}
      <div class="conversion-intro-card">
        <span>按客户需求找方案</span>
        <h3>先说清楚真实需求，再从本地方案源中匹配</h3>
        <p>可写人数、城市、日期、预算、天数和偏好。未知信息不用编，系统会标出缺口。</p>
      </div>
      <div class="conversion-proposal-form">
        <div class="conversion-proposal-left">
          <textarea id="conversionDemand" class="conversion-query" rows="5" placeholder="例如：杭州出发，35人，9月周五，一日，想轻松一点，有草坪和烧烤，预算人均300左右"></textarea>
          <div class="conversion-proposal-strip">
            <details class="conversion-manual-filter">
              <summary>手动筛选</summary>
              <div class="conversion-filter-groups">
                ${filterGroups.map(g => `
                  <div class="conversion-filter-group">
                    <b>${g.label}</b>
                    <div class="conversion-filter-options">
                      ${g.options.map(opt => `<button class="conversion-filter-chip" type="button" data-filter="${escapeHtml(g.label)}:${escapeHtml(opt)}">${escapeHtml(opt)}</button>`).join("")}
                    </div>
                  </div>`).join("")}
              </div>
            </details>
            <div class="conversion-rotating-prompt" id="conversionRotatingPrompt">试试描述<strong>人数、城市、预算</strong>，匹配更精准</div>
          </div>
        </div>
        <div class="conversion-proposal-actions">
          <button class="conversion-btn" id="conversionMatchProposalBtn" type="button">匹配方案</button>
          <button class="conversion-btn primary" id="conversionProposalBtn" type="button">AI 策划匹配</button>
        </div>
      </div>
      <div class="conversion-statusline" id="conversionProposalStatus">方案资料仍由企业方案库维护，不复制到本工作台；当前已载入 ${formatNumber(conversionPlans().length)} 份方案索引。</div>
      <section class="conversion-result" id="conversionProposalResult">${conversionResult ? readableConversionValue(conversionResult) : '<div class="conversion-empty">AI 匹配结果会在这里按推荐理由、风险和下一步呈现。</div>'}</section>
      <section class="conversion-local-results">
        <header><span>本地方案匹配</span><small>输入需求或点选筛选条件后，会从方案索引中即时筛选。</small></header>
        <div id="conversionProposalLocalResults">${renderConversionPlanCards(initialPlans)}</div>
      </section>
    </section>`;
}

function conversionJourneyData() {
  return conversionData?.journey?.画板 || conversionData?.journey?.board || {};
}

function renderConversionJourney() {
  const board = conversionJourneyData();
  const nodes = board.节点 || board.nodes || [];
  const links = board.连线 || board.links || [];
  if (nodes.length > 0) {
    const roleGroups = {};
    nodes.forEach(node => {
      const role = (node.note && (node.note.role || node.note.角色)) || "通用";
      if (!roleGroups[role]) roleGroups[role] = [];
      roleGroups[role].push(node);
    });
    return `
      <section class="conversion-journey-shell">
        <header><span>用户旅程</span><h3>从公域咨询，到方案、决策与长期跟进</h3><p>先判断客户现在在哪个节点，再选择动作；不从第一句话直接跳到报价。</p></header>
        <div class="conversion-journey-lanes">
          ${Object.entries(roleGroups).map(([roleName, roleNodes]) => `
            <section class="conversion-journey-lane">
              <div class="conversion-journey-role"><strong>${escapeHtml(roleName)}</strong><span>${roleNodes.length} 个节点</span></div>
              ${roleNodes.map((node, index) => `
                <article>
                  <b class="conversion-step-num">${String(index + 1).padStart(2, "0")}</b>
                  <div>
                    <strong>${escapeHtml((node.label || ["未命名"]).join(" · "))}</strong>
                    ${node.sub ? `<p>${escapeHtml(node.sub)}</p>` : ""}
                    ${node.note && node.note.signal ? `<div class="conversion-journey-signal"><b>信号：</b>${escapeHtml(node.note.signal)}</div>` : ""}
                    ${node.note && node.note.action ? `<div class="conversion-journey-action"><b>动作：</b>${escapeHtml(node.note.action)}</div>` : ""}
                    ${node.note && node.note.script ? `<div class="conversion-journey-script"><b>话术：</b>${escapeHtml(node.note.script)}</div>` : ""}
                    ${node.note && node.note.method ? `<div class="conversion-journey-method"><b>方法：</b>${escapeHtml(node.note.method)}</div>` : ""}
                  </div>
                </article>`).join("")}
            </section>`).join("")}
        </div>
      </section>`;
  }
  const lanes = DEFAULT_CONVERSION_JOURNEY_STAGES.reduce((groups, stage) => {
    if (!groups[stage.role]) groups[stage.role] = [];
    groups[stage.role].push(stage);
    return groups;
  }, {});
  return `
    <section class="conversion-journey-shell">
      <header><span>用户旅程</span><h3>从公域咨询，到方案、决策与长期跟进</h3><p>先判断客户现在在哪个节点，再选择动作；不从第一句话直接跳到报价。</p></header>
      <div class="conversion-journey-lanes">
        ${Object.entries(lanes).map(([roleName, stages]) => `
          <section class="conversion-journey-lane">
            <div class="conversion-journey-role"><strong>${escapeHtml(roleName)}</strong><span>${stages.length} 个节点</span></div>
            ${stages.map((stage) => `
              <article>
                <b class="conversion-step-num">${escapeHtml(stage.n)}</b>
                <div>
                  <strong>${escapeHtml(stage.title)}</strong>
                  <div class="conversion-journey-signal"><b>进入信号：</b>${escapeHtml(stage.signal)}</div>
                  <div class="conversion-journey-branch yes"><b>是：</b>${escapeHtml(stage.yes)}</div>
                  <div class="conversion-journey-branch no"><b>否：</b>${escapeHtml(stage.no)}</div>
                  <div class="conversion-journey-action"><b>下一步：</b>${escapeHtml(stage.next)}</div>
                  <div class="conversion-journey-copy"><b>可复制话术：</b>${escapeHtml(stage.copy)} <button class="conversion-btn" type="button" data-copy-journey="${escapeHtml(stage.copy)}">复制</button></div>
                  <div class="conversion-journey-method"><b>背后的判断：</b>${escapeHtml(stage.method)}</div>
                </div>
              </article>`).join("")}
          </section>`).join("")}
      </div>
    </section>`;
}

function bindConversionWorkspace() {
  $$("[data-conversion-role]").forEach((button) => button.addEventListener("click", () => {
    conversionRole = button.dataset.conversionRole;
    conversionResult = null;
    conversionActiveStageIndex = 0;
    renderConversionHub();
  }));
  $("#conversionSearchBtn")?.addEventListener("click", async () => {
    const question = $("#conversionQuestion")?.value.trim();
    if (!question) return toast("先输入客户刚刚说的话");
    const button = $("#conversionSearchBtn");
    button.disabled = true;
    button.textContent = "正在匹配…";
    try {
      const payload = await api("/api/conversion/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, role: conversionRole })
      });
      conversionResult = payload.结果 || payload.result || payload;
      $("#conversionSearchResult").innerHTML = readableConversionValue(conversionResult);
    } catch (error) {
      $("#conversionSearchResult").innerHTML = `<div class="conversion-empty danger">${escapeHtml(error.message)}</div>`;
    } finally {
      button.disabled = false;
      button.textContent = "AI 智能建议";
    }
  });
  $("#conversionProposalBtn")?.addEventListener("click", async () => {
    const demand = $("#conversionDemand")?.value.trim();
    if (!demand) return toast("先写下客户需求");
    const button = $("#conversionProposalBtn");
    button.disabled = true;
    button.textContent = "正在匹配…";
    try {
      const payload = await api("/api/conversion/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demand })
      });
      conversionResult = payload.结果 || payload.result || payload;
      $("#conversionProposalResult").innerHTML = readableConversionValue(conversionResult);
    } catch (error) {
      $("#conversionProposalResult").innerHTML = `<div class="conversion-empty danger">${escapeHtml(error.message)}</div>`;
    } finally {
      button.disabled = false;
      button.textContent = "AI 策划匹配";
    }
  });
  $("#conversionLocalSearchBtn")?.addEventListener("click", () => {
    const question = $("#conversionQuestion")?.value.trim() || "";
    const rows = matchConversionHistories(question, conversionRole);
    const target = $("#conversionHistoryResults");
    if (target) target.innerHTML = renderConversionHistoryCards(rows);
    const status = $("#conversionStatusline");
    if (status) status.textContent = `当前身份：${conversionRole} · 从 ${formatNumber(conversionHistories().length)} 条历史问答中匹配到 ${rows.length} 条。`;
  });
  function renderLocalProposalMatches() {
    const demand = $("#conversionDemand")?.value.trim() || "";
    const filters = $$(".conversion-filter-chip.active").map(chip => chip.dataset.filter || "");
    const rows = matchConversionPlans(demand, filters);
    const target = $("#conversionProposalLocalResults");
    if (target) target.innerHTML = renderConversionPlanCards(rows);
    const status = $("#conversionProposalStatus");
    if (status) status.textContent = `当前方案库 ${formatNumber(conversionPlans().length)} 份 · 本地匹配 ${rows.length} 份。`;
  }
  $("#conversionMatchProposalBtn")?.addEventListener("click", renderLocalProposalMatches);
  // 阶段点击切换
  $$("[data-conversion-stage]").forEach((button) => button.addEventListener("click", () => {
    conversionActiveStageIndex = Number(button.dataset.conversionStage);
    renderConversionHub();
  }));
  // SOP 回复复制
  function findConversionAnswer(answerId) {
    const roles = conversionRoles();
    const role = roles[conversionRole] || Object.values(roles)[0] || {};
    const stages = role.环节 || [];
    for (const stage of stages) {
      for (const question of (stage.问答 || [])) {
        const found = (question.回复 || []).find(a => a.id === answerId);
        if (found) return found;
      }
    }
    return null;
  }
  $$("[data-copy-answer]").forEach((button) => button.addEventListener("click", () => {
    const answer = findConversionAnswer(button.dataset.copyAnswer);
    if (answer) {
      copyText(answer.内容 || "", "已复制回复");
    }
  }));
  $$("[data-copy-history]").forEach((button) => button.addEventListener("click", () => {
    copyText(button.dataset.copyHistory || "", "已复制历史回复");
  }));
  $$("[data-copy-journey]").forEach((button) => button.addEventListener("click", () => {
    copyText(button.dataset.copyJourney || "", "已复制旅程话术");
  }));
  // SOP 回复点赞
  $$("[data-like-answer]").forEach((button) => button.addEventListener("click", () => {
    const b = button.querySelector("b");
    if (b) b.textContent = String(Number(b.textContent || 0) + 1);
    button.classList.add("liked");
    toast("已点赞");
  }));
  // 筛选标签切换
  $$(".conversion-filter-chip").forEach((chip) => chip.addEventListener("click", () => {
    chip.classList.toggle("active");
    renderLocalProposalMatches();
  }));
}

function renderConversionHub() {
  const content = $("#conversionContent");
  if (!content) return;
  $$("[data-conversion-module]").forEach((button) => button.classList.toggle("active", button.dataset.conversionModule === conversionModule));
  const titleMap = {
    search: ["客户怎么回", "选择当前身份，粘贴客户原话，直接得到建议回复和下一步。"],
    sop: ["转化 SOP", "运营负责公域搞流量和客资交接，策划师负责方案到成交；新人可以直接照着执行。"],
    proposal: ["按客户需求找方案", "说清楚真实需求，从本地方案源中匹配最合适的方案。"],
    journey: ["用户旅程", "从公域获客到方案、决策与长期跟进，查看判断分支和对应 SOP。"]
  };
  const pageTitle = $("#conversionPageTitle");
  const pageSub = $("#conversionPageSub");
  const meta = titleMap[conversionModule] || titleMap.search;
  if (pageTitle) pageTitle.textContent = meta[0];
  if (pageSub) pageSub.textContent = meta[1];
  if (!conversionData?.ok) {
    content.innerHTML = `
      <div class="conversion-offline">
        <span>转化知识库未连接</span>
        <h3>生产与分发仍可使用，转化能力需要启动本机知识库。</h3>
        <p>${escapeHtml(conversionData?.error || "流量转化内容暂未就绪")}</p>
        <button class="primary-button" id="conversionStartServiceBtn" type="button">启动转化知识库</button>
      </div>`;
    $("#conversionStartServiceBtn")?.addEventListener("click", async () => {
      await api("/api/conversion/start", { method: "POST" });
      toast("正在启动转化知识库");
      window.setTimeout(() => loadConversionHub(true), 2200);
    });
    return;
  }
  const roles = conversionRoles();
  const roleEntries = Object.entries(roles);
  const frontRole = roles["前端运营"] || Object.values(roles)[0] || {};
  const backRole = roles["后端转化"] || Object.values(roles)[1] || {};
  const frontCount = Number(frontRole.问题数 || 0) || (frontRole.环节 || []).reduce((sum, s) => sum + (s.问答 || []).length, 0);
  const backCount = Number(backRole.问题数 || 0) || (backRole.环节 || []).reduce((sum, s) => sum + (s.问答 || []).length, 0);
  const planCount = conversionPlans().length || Number(conversionData?.plans?.状态?.索引方案 || 0);
  const countBox = $("#conversionCountBox");
  if (countBox) {
    countBox.hidden = false;
    const shotEl = $("#conversionShotCount");
    const convertEl = $("#conversionConvertCount");
    const proposalEl = $("#conversionProposalCount");
    if (shotEl) shotEl.textContent = formatNumber(frontCount);
    if (convertEl) convertEl.textContent = formatNumber(backCount);
    if (proposalEl) proposalEl.textContent = formatNumber(planCount);
  }
  content.innerHTML = conversionModule === "sop"
    ? renderConversionSop()
    : conversionModule === "proposal"
      ? renderConversionProposal()
      : conversionModule === "journey"
        ? renderConversionJourney()
        : renderConversionSearch();
  bindConversionWorkspace();
}

async function loadConversionHub(force = false) {
  if (conversionData?.ok && !force) return renderConversionHub();
  const status = $("#conversionServiceStatus");
  if (status) status.textContent = "正在加载流量转化内容…";
  try {
    conversionData = await api("/api/conversion/snapshot");
  } catch (error) {
    conversionData = { ok: false, error: error.message };
  }
  if (status) {
    const health = conversionData?.health || {};
    status.textContent = conversionData?.ok
      ? `${conversionData.source} · ${health.模型 || health.model || "已连接"}`
      : "转化知识库未连接";
    status.classList.toggle("offline", !conversionData?.ok);
  }
  renderConversionHub();
}

async function copyMobileConversionEntry() {
  const button = $("#conversionMobileEntryBtn");
  const originalTitle = button?.title || "";
  if (button) button.disabled = true;
  try {
    const payload = await api("/api/conversion/mobile-link");
    if (!payload.enabled) throw new Error("当前版本尚未开启手机入口，请使用开发测试版或更新正式版后再试");
    await navigator.clipboard.writeText(payload.url);
    toast("手机入口已复制：手机与电脑连接同一 Wi-Fi 后粘贴打开");
    if (button) button.title = "已复制，粘贴到手机浏览器打开";
  } catch (error) {
    toast(error.message || "手机入口复制失败");
  } finally {
    if (button) button.disabled = false;
    window.setTimeout(() => {
      if (button) button.title = originalTitle;
    }, 3200);
  }
}

const PAGE_HELP = {
  overviewView: {
    title: "工作流总览说明",
    description: "总览不是一张装饰性仪表盘，而是整条生产链的事实入口。它把素材、模板、成品、设备和分发阶段连接起来，帮助你判断今天应该从哪里继续。",
    details: [
      ["开发背景", "过去的生产信息分散在聊天、文件夹、脚本和手机里，容易忘记素材是否用过、作品是否发过。总览把这些真实状态集中呈现。"],
      ["方法论", "文件夹是客观事实，数据库负责补充历史与关系，界面只负责解释和操作；三者冲突时优先核对真实文件。"],
      ["怎么使用", "先看异常和待办数字，再点击素材生产、作品集或分发卡片进入对应页面。需要最新状态时点击“刷新状态”。"],
      ["结果标准", "每个数字都应能追溯到真实文件夹或操作记录，不显示无法验证的虚构进度。"]
    ]
  },
  dashboardView: {
    title: "素材生产说明",
    description: "这是围绕团建内容生产设计的三栏工作台：左边选择帖子素材与模板，中间用模板专属对话生产，右边查看真实成品并打包到抖音小红书待发。",
    details: [
      ["开发背景", "网页对话的优势是能根据口述调整，但素材、模板、结果和历史容易分散。这里把稳定生产规则固化，同时保留本批次的对话调整能力。"],
      ["左侧怎么用", "选择素材库后递归读取帖子文件夹；可跨分类多选，卡片直接显示图片数、文案、母标签和使用次数。下面先选游戏/转化类型，再看缩略图选择具体模板。"],
      ["中间怎么用", "每个模板保存自己的长期规则和对话历史。只需补充本次变化，例如“图上文字少一点”或“只处理前10个已选帖子”。实际处理对象完全取决于左侧勾选的帖子文件夹。"],
      ["右侧怎么用", "生产完成后会显示待审作品及正式成品。勾选合格作品，点击“打包到抖音小红书待发”，系统会复制完整作品文件夹并写入操作记录。"],
      ["合格结果", "每个作品文件夹至少包含多张独立3:4成品图和一份小红书文案，并保留出图计划、模板来源和生产记录。"],
      ["安全边界", "素材和成品文件夹是真实依据；打包不覆盖同名作品、不删除唯一成品；没有明确价格就不生成价格，不虚构场地、项目和车程。"]
    ]
  },
  productsView: {
    title: "成品库说明",
    description: "成品库用真实作品文件夹管理生产结果，而不是只在软件里画一个状态。图片、文案、生产记录和作品集归属都应在磁盘上可见。",
    details: [
      ["开发背景", "只靠界面状态会让其他软件和人工操作看不懂，也容易重复发布，所以作品必须落到稳定目录。"],
      ["方法论", "作品文件夹是最小交付单元；作品集是批量分发单元；数据库只记录哈希、来源、时间与操作，不替代原文件。"],
      ["怎么使用", "按分类查看作品或作品集，双击预览，打开真实目录核对图片和文案。确认合格后再进入分发阶段。"],
      ["防重复", "系统同时使用作品记录、文件哈希和分发历史；即使文件夹改名，也尽量通过内容指纹识别旧作品。"]
    ]
  },
  distributionView: {
    title: "分发中心说明",
    description: "分发中心按真实文件夹阶段工作：抖音小红书 → 微信公众号 → 已发送。界面切标签、发送、归档后，本地文件必须同步变化。",
    details: [
      ["开发背景", "发布最怕重复和漏发。单靠人工记忆不可靠，所以把平台阶段、作品类型和设备反馈都落到文件与记录中。"],
      ["顶部标签", "设备用于确认连接；抖音小红书与微信公众号展示待发布作品；已发送只存三端完成后的压缩包；操作记录用于追溯。"],
      ["分类标签", "泛流量帖、精准流量帖、未分类来自作品集文件夹名称。切换分类会真实重命名文件夹，不是只改界面颜色。"],
      ["标准流程", "先发送到手机并等待真实接收反馈；确认抖音/小红书完成后移到微信公众号；公众号完成后压缩进已发送，并删除原作品集目录节省空间。"],
      ["事实与恢复", "磁盘文件夹是最终事实，操作记录保存时间、来源、目标和结果；发生异常时先核对文件，再用记录定位原因。"]
    ]
  },
  conversionView: {
    title: "流量转化说明",
    description: "流量转化是团建工作台的客户承接模块：客户刚说一句话时找回复，进入具体阶段时查 SOP，需要方案时按真实需求匹配。",
    details: [
      ["为什么放在这里", "内容生产和分发带来流量，客户咨询后的承接与成交属于同一条业务链。统一入口可以减少在多个软件之间寻找，但不复制知识库数据。"],
      ["搜问题和话术", "选择前端运营或后端转化，粘贴客户原话。结果来自当前正式知识库和模型，一次只推进一个判断。"],
      ["转化 SOP", "按角色查看客户当前环节、原则和下一步。已知信息不重复问，信息够用就立即推进。"],
      ["按需求找方案", "输入人数、城市、日期、预算、天数和偏好。方案仍从企业方案库读取，未知内容会保留为待确认。"],
      ["数据边界", "正式 SOP、聊天证据、用户旅程和方案源统一由流量转化模块读取，不建立平行知识库。"]
    ]
  },
  pluginsView: {
    title: "插件市场说明",
    description: "插件市场是本地生产生态的导航页。它不会把所有工具强行揉进工作台，而是让每个独立插件、软件和脚本保留自己的边界，同时提供统一入口。",
    details: [
      ["开发背景", "生产链上已经有网页脚本、浏览器扩展、下载器、本地助手和转化系统。入口分散会导致找不到版本、装错副本或忘记用途。"],
      ["收录原则", "只收录本地真实存在或有明确开源地址的资产；测试中和停用项必须标注；密钥、私人数据和内部仓库内容不会展示。"],
      ["怎么使用", "按“浏览器辅助、本地软件、脚本工具、测试中”筛选。点击“打开本地”进入真实目录或启动入口；点击“源码/发布页”跳到对应网站。"],
      ["版本原则", "卡片展示的是已核对版本。升级仍在各自项目中完成，插件市场只做入口和状态说明，不复制第二份源码。"],
      ["故障处理", "浏览器扩展升级后通常需要在扩展管理页重新加载；油猴脚本需由脚本管理器安装；本地软件打不开时先打开项目目录查看说明。"]
    ]
  },
  settingsView: {
    title: "设置中心说明",
    description: "设置中心管理路径、外观、生产参数和诊断入口。它不保存素材正文，也不会因为更换主题而修改业务文件。",
    details: [
      ["开发背景", "路径、API、作品集数量和界面偏好变化频繁，需要集中管理，同时避免散落在脚本源码里。"],
      ["怎么使用", "先设置素材目录和成品目录，再配置作品集数量与自动整理；接口设置只在需要本地 API 生产时修改。"],
      ["保存规则", "普通升级保留用户明确保存的配置；密钥只进入本机受忽略的运行配置，不写进仓库、日志或公开发布包。"],
      ["排错方法", "修改后刷新数据；仍有问题时复制诊断信息，核对版本、运行目录和真实路径是否一致。"]
    ]
  },
  juguangView: {
    title: "聚光数据怎么用",
    description: "这里用于查看和筛选投放、关键词及选题参考。刷新后读取最新数据，复制选题不会自动发布内容。"
  },
  workflowView: {
    title: "自动化工作流怎么用",
    description: "这里查看生产与分发自动化的执行状态。每次任务都应有开始、完成或失败记录，文件是否存在仍以本地目录为准。"
  }
};

const PLUGIN_MARKET_ITEMS = [
  {
    id: "weflow",
    name: "WeFlow",
    type: "desktop",
    typeLabel: "微信聊天记录导出",
    version: "官方最新版",
    status: "可下载",
    statusTone: "ready",
    description: "读取并导出本机微信聊天记录，支持媒体文件和本地 HTTP API，可作为流量转化知识库的原始聊天来源。",
    capabilities: ["聊天导出", "媒体整理", "本地 HTTP API", "转化语料来源"],
    sourceUrl: "https://github.com/hicccc77/WeFlow",
    releaseUrl: "https://github.com/hicccc77/WeFlow/releases/latest",
    sourceLabel: "官方开源仓库"
  },
  {
    id: "chatgpt-work-assistant",
    name: "ChatGPT 作品助手",
    type: "browser",
    typeLabel: "油猴脚本＋本地助手",
    version: "1.15.3",
    status: "可用",
    statusTone: "ready",
    description: "给 ChatGPT 最近对话增加可拖动分组、提示词、图片批量下载，并把生成结果交给本地作品打包器整理、查重和组成作品集。",
    capabilities: ["对话分组", "图片批量下载", "作品打包", "查重与作品集"],
    localPath: "D:\\AICode\\工具开发\\projects\\chatgpt-conversation-tree",
    installPath: "D:\\AICode\\工具开发\\projects\\chatgpt-conversation-tree\\releases\\GPT作品助手-傻瓜安装包.zip",
    sourceUrl: "https://github.com/zwmopen/scripts",
    installUrl: "https://raw.githubusercontent.com/zwmopen/scripts/master/chatgpt-conversation-tree.user.js",
    sourceLabel: "开源脚本"
  },
  {
    id: "teambuilding-gpt-extension",
    name: "团建 GPT 数字作品生产助手",
    type: "browser",
    typeLabel: "Chrome / Edge 扩展",
    version: "0.2.31",
    status: "可用",
    statusTone: "ready",
    description: "在 ChatGPT 右侧提供素材库和成品库，支持筛选、拖入真实附件、生产指令、下载打包与使用次数回填。",
    capabilities: ["素材传 GPT", "全库标签筛选", "生成结果下载", "生产历史"],
    localPath: "D:\\AICode\\工具开发\\projects\\teambuilding-workflow-dashboard\\src\\integrations\\gpt-production-extension",
    installPath: "D:\\AICode\\工具开发\\projects\\teambuilding-workflow-dashboard\\src\\integrations\\gpt-production-extension",
    sourceUrl: "https://github.com/zwmopen/teambuilding-gpt-production-extension",
    releaseUrl: "https://github.com/zwmopen/teambuilding-gpt-production-extension/releases/tag/v0.2.31",
    sourceLabel: "内置集成"
  },
  {
    id: "jianghu-conversion",
    name: "流量转化",
    type: "desktop",
    typeLabel: "独立本地软件",
    version: "1.0.6",
    status: "可用",
    statusTone: "ready",
    description: "把微信聊天、正式 SOP、客户话术和方案库做成本地检索与转化协作系统，服务前端接粉和后端成交。",
    capabilities: ["话术检索", "转化 SOP", "方案匹配", "聊天证据沉淀"],
    localPath: "D:\\AICode\\工具开发\\projects\\jianghu-conversion-assistant",
    launchPath: "D:\\AICode\\工具开发\\projects\\jianghu-conversion-assistant\\start.vbs",
    sourceUrl: "https://github.com/zwmopen/jianghu-conversion-assistant",
    sourceLabel: "私有仓库"
  },
  {
    id: "xhs-downloader",
    name: "红薯下载",
    type: "desktop",
    typeLabel: "素材采集软件",
    version: "2.4.0",
    status: "可用",
    statusTone: "ready",
    description: "批量读取小红书公开分享链接，下载原始图片或视频并保存文案，作为素材库的上游采集入口。",
    capabilities: ["批量链接", "原始媒体", "文案落盘", "下载历史"],
    localPath: "D:\\AICode\\工具开发\\projects\\xhs-dl",
    sourceUrl: "https://github.com/zwmopen/xhs-dl",
    upstreamUrl: "https://github.com/JoeanAmier/XHS-Downloader",
    sourceLabel: "开源仓库"
  },
  {
    id: "text-to-excel",
    name: "一键提取文案",
    type: "desktop",
    typeLabel: "本地整理工具",
    version: "0.1.0",
    status: "可用",
    statusTone: "ready",
    description: "把采集目录中的 TXT 文案汇总到 Excel，并从文件名提取标题、点赞量等字段，便于筛选和复盘。",
    capabilities: ["TXT 汇总", "Excel 输出", "标题提取", "批量整理"],
    localPath: "D:\\AICode\\工具开发\\projects\\一键提取文案",
    sourceLabel: "本地项目"
  },
  {
    id: "media-copy-extractor",
    name: "视频音频文案提取",
    type: "testing",
    typeLabel: "本地测试工具",
    version: "0.1.0",
    status: "测试中",
    statusTone: "testing",
    description: "从本地视频或音频批量提取 TXT、SRT 和 JSON。当前保留测试入口，真实短样本复核完成前不作为正式生产依赖。",
    capabilities: ["音视频转写", "批量处理", "字幕输出", "测试资产"],
    localPath: "D:\\AICode\\工具开发\\projects\\视频音频文案提取",
    sourceLabel: "本地测试"
  },
  {
    id: "hardlink-preview",
    name: "素材硬链接预览",
    type: "script",
    typeLabel: "文件辅助脚本",
    version: "本地版",
    status: "可用",
    statusTone: "ready",
    description: "为素材建立不重复占空间的硬链接工作副本，方便预览、筛选和临时加工，同时保留原素材目录作为真源。",
    capabilities: ["硬链接副本", "节省空间", "素材预览", "真源保护"],
    localPath: "D:\\AICode\\工具开发\\projects\\public-scripts\\本地文件处理脚本\\素材处理脚本",
    sourceUrl: "https://github.com/zwmopen/scripts",
    sourceLabel: "开源脚本库"
  }
];

let activePluginFilter = "all";

function renderPluginMarket() {
  const grid = $("#pluginMarketGrid");
  if (!grid) return;
  const query = ($("#pluginMarketSearch")?.value || "").trim().toLowerCase();
  const items = PLUGIN_MARKET_ITEMS.filter((item) => {
    const typeMatch = activePluginFilter === "all"
      || item.type === activePluginFilter
      || (activePluginFilter === "desktop" && item.type === "testing");
    const haystack = [item.name, item.typeLabel, item.description, ...(item.capabilities || [])].join(" ").toLowerCase();
    return typeMatch && (!query || haystack.includes(query));
  });
  grid.innerHTML = items.length ? items.map((item) => `
    <article class="plugin-market-card">
      <div class="plugin-card-topline">
        <span class="plugin-kind">${escapeHtml(item.typeLabel)}</span>
        <span class="plugin-status ${escapeHtml(item.statusTone)}">${escapeHtml(item.status)}</span>
      </div>
      <div class="plugin-card-title">
        <span class="plugin-glyph">${escapeHtml(item.name.slice(0, 1))}</span>
        <div><h3>${escapeHtml(item.name)}</h3><small>v${escapeHtml(item.version)}</small></div>
      </div>
      <p>${escapeHtml(item.description)}</p>
      <div class="plugin-capabilities">${item.capabilities.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="plugin-card-actions">
        ${item.launchPath ? `<button class="primary-button" type="button" data-plugin-path="${escapeHtml(item.launchPath)}">启动</button>` : ""}
        <button type="button" data-plugin-path="${escapeHtml(item.installPath || item.localPath)}">${item.installPath ? "打开安装包" : "打开本地"}</button>
        ${item.releaseUrl ? `<button type="button" data-plugin-url="${escapeHtml(item.releaseUrl)}">发布页</button>` : ""}
        ${item.installUrl ? `<button type="button" data-plugin-url="${escapeHtml(item.installUrl)}">安装脚本</button>` : ""}
        ${item.sourceUrl ? `<button type="button" data-plugin-url="${escapeHtml(item.sourceUrl)}">${escapeHtml(item.sourceLabel || "源码")}</button>` : ""}
        ${item.upstreamUrl ? `<button type="button" data-plugin-url="${escapeHtml(item.upstreamUrl)}">上游项目</button>` : ""}
      </div>
    </article>
  `).join("") : `<div class="plugin-market-empty">没有匹配的本地工具。换一个关键词或分类试试。</div>`;
  $$("#pluginMarketFilters [data-plugin-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.pluginFilter === activePluginFilter);
  });
}

function installPageHelpButtons() {
  const buttonContent = `<svg class="round-action-icon help-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 9a2.75 2.75 0 1 1 4.4 2.2c-1.1.8-1.9 1.35-1.9 2.8"/><circle cx="12" cy="17.2" r=".75"/></svg>`;
  Object.entries(PAGE_HELP).forEach(([viewId, help]) => {
    const view = document.getElementById(viewId);
    const heading = view?.querySelector(".page-heading, .production-workbench-heading, .production-api-flow");
    if (!heading) return;
    let button = heading.querySelector("[data-page-help]");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "page-help-button";
      button.dataset.pageHelp = viewId;
      const actionRow = heading.querySelector(".detail-button-row");
      if (actionRow) actionRow.appendChild(button);
      else heading.appendChild(button);
    }
    document.querySelectorAll(`[data-page-help="${viewId}"]`).forEach((helpButton) => {
      helpButton.innerHTML = buttonContent;
      helpButton.title = `${help.title}：${help.description}`;
      helpButton.setAttribute("aria-label", `${help.title}，点击查看说明`);
    });
  });
}

function restoreSelection() {
  const state = getSavedState();
  const material = dashboard.materials.categories
    .flatMap((category) => category.items.map((item) => ({ item, category })))
    .find((entry) => entry.item.id === state.selectedMaterial);
  const template = dashboard.templates.templates.find((item) => item.id === (state.selectedTemplate || "T01"));

  if (material) selectMaterial(material.item, material.category);
  else {
    const firstCategory = getVisibleMaterialCategories().find((category) => category.items.length);
    if (firstCategory) selectMaterial(firstCategory.items[0], firstCategory);
  }

  if (template) selectTemplate(template);
  else if (dashboard.templates.templates[0]) selectTemplate(dashboard.templates.templates[0]);

  if (selectedMaterial?.path && !workbenchSelectedMaterials.size) workbenchSelectedMaterials.add(selectedMaterial.path);
  renderWorkbenchMaterials();
  renderWorkbenchTemplates();

  activateTab(window.MaterialWorkspace.resolveInitialTab(state.activeTab));
}

function activateTab(name) {
  name = window.MaterialWorkspace.resolveInitialTab(name);
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  $$(".view").forEach((view) => view.classList.remove("active"));
  $(`#${name}View`)?.classList.add("active");
  if (name === "gptProductionTest") {
    renderGptProductionTest();
  } else if (window.gptWorkbench?.available) {
    window.gptWorkbench.hide().catch(() => {});
  }
  if (name === "products") {
    renderCollections();
    productsRendered = true;
  }
  if (name === "distribution") {
    renderDistribution();
    if (!deviceScanStarted) {
      checkDistributionDevices({ silent: true, refreshInventory: false });
    }
  }
  if (name === "conversion") {
    loadConversionHub().catch(() => {});
  }
  if (name === "workflow" && !logsRendered) {
    renderLogs();
    logsRendered = true;
  }
  if (name === "juguang" && !juguangRendered) {
    loadJuguang().catch((error) => {
      console.error(error);
      toast("聚光数据读取失败");
    });
    juguangRendered = true;
  }
  if (name === "settings") {
    applyTheme(localStorage.getItem("tb-dashboard-theme") || "neo");
    loadDedupStatus().catch((error) => {
      if ($("#dedupSummary")) $("#dedupSummary").textContent = `防重复账本读取失败：${error.message}`;
    });
  }
  showAssistantTipForActiveView();
  saveLocalState({ activeTab: name });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyPaneWidths(state = getSavedState()) {
  const pane = $("#threePane");
  if (!pane) return;
  const widths = state.paneWidths || {};
  const available = Math.max(960, window.innerWidth - 32);
  const left = clamp(Number(widths.left) || 286, 230, Math.max(230, available - 730));
  const right = clamp(Number(widths.right) || 390, 320, Math.max(320, available - left - 410));
  pane.style.setProperty("--left-pane-width", `${Math.round(left)}px`);
  pane.style.setProperty("--right-pane-width", `${Math.round(right)}px`);
}

function bindPaneResizers() {
  const pane = $("#threePane");
  if (!pane) return;
  $$(".pane-resizer").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      const rect = pane.getBoundingClientRect();
      const startX = event.clientX;
      const style = getComputedStyle(pane);
      const startLeft = parseFloat(style.getPropertyValue("--left-pane-width")) || pane.querySelector(".filter-pane").getBoundingClientRect().width;
      const startRight = parseFloat(style.getPropertyValue("--right-pane-width")) || pane.querySelector(".detail-pane").getBoundingClientRect().width;
      const type = handle.dataset.resizer;
      pane.classList.add("resizing");

      const onMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const maxLeft = Math.max(230, rect.width - startRight - 410);
        const maxRight = Math.max(320, rect.width - startLeft - 410);
        if (type === "left") {
          pane.style.setProperty("--left-pane-width", `${Math.round(clamp(startLeft + dx, 230, maxLeft))}px`);
        } else {
          pane.style.setProperty("--right-pane-width", `${Math.round(clamp(startRight - dx, 320, maxRight))}px`);
        }
      };

      const onUp = () => {
        pane.classList.remove("resizing");
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        const currentStyle = getComputedStyle(pane);
        saveLocalState({
          paneWidths: {
            left: Math.round(parseFloat(currentStyle.getPropertyValue("--left-pane-width")) || startLeft),
            right: Math.round(parseFloat(currentStyle.getPropertyValue("--right-pane-width")) || startRight)
          }
        });
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  });
}

async function openPath(targetPath) {
  if (!targetPath) return;
  await api("/api/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: targetPath })
  });
}

async function openExternal(target) {
  await api("/api/open-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target })
  });
}

function findMaterialEntry(itemId) {
  return dashboard.materials.categories
    .flatMap((category) => category.items.map((item) => ({ item, category })))
    .find(({ item }) => item.id === itemId);
}

async function transmitMaterialToGpt(itemId = selectedMaterial?.id) {
  const entry = findMaterialEntry(itemId);
  if (!entry) {
    toast("请先选择一个帖子文件夹");
    return;
  }
  selectMaterial(entry.item, entry.category, { keepFeed: true });
  const instruction = window.MaterialWorkspace.buildChatGptInstruction(
    entry.item,
    entry.category,
    selectedTemplate?.id || "T04"
  );
  $("#commandBox").value = instruction;
  await navigator.clipboard.writeText(instruction);
  saveLocalState({
    gptTaskBinding: {
      materialId: entry.item.id,
      materialPath: entry.item.path,
      templateId: selectedTemplate?.id || "T04",
      preparedAt: new Date().toISOString()
    }
  });
  if (window.desktopFiles?.sendToGpt) {
    window.desktopFiles.sendToGpt({
      instruction,
      files: entry.item.attachments || entry.item.images?.map((image) => image.path) || []
    });
    toast("正在把帖子素材放入右侧 ChatGPT");
    return;
  }
  await openExternal("https://chatgpt.com/");
  toast("帖子与指令已准备，正在打开真实 ChatGPT");
}

async function renamePath(targetPath, currentLabel) {
  if (!targetPath) return;
  const oldName = (currentLabel || targetPath).replace(/（\\d+条）$/, "").trim();
  const nextName = await openSystemDialog({
    eyebrow: "文件夹管理",
    title: "修改文件夹名称",
    description: "只修改当前文件夹名称，不改变里面的图片和文案。",
    input: { label: "新名称", value: oldName, maxLength: 160 },
    cancelLabel: "取消",
    confirmLabel: "保存名称"
  });
  if (!nextName || nextName === oldName) return;
  try {
    await api("/api/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: targetPath, newName: nextName })
    });
    await loadDashboard("materials", $("#materialLibraryFilter")?.value || "");
    toast("已重命名并刷新");
  } catch (error) {
    showSystemNotice("文件夹没有重命名", error.message, { tone: "danger" });
  }
}

function buildTemplateCommand(target) {
  return `请把这个素材识别并转化为团建笔记模板：\\n\\n素材/模板名称：${target?.label || ""}\\n本地路径：${target?.path || ""}\\n\\n执行要求：\\n1. 读取该文件夹里的图片和文案，只分析固定视觉骨架，不继承具体内容主题。\\n2. 识别封面结构、内页结构、字体气质、配色、标题位置、拼图比例、页面角色和适用素材类型。\\n3. 按“封面核心结构＋标题样式 × 内页结构＋拼图样式”自动命名模板。\\n4. 在 01-素材库/团建攻略图文素材/模板素材 下创建对应模板文件夹，复制参考图，写入模板说明.md 和模板提示词.md。\\n5. 更新 02-模板库/爆款链接库.csv，记录模板ID、模板名称、适用内容、默认页数、源模板路径和状态。\\n6. 后续生产时把它作为 A 类永久视觉母版，素材只负责提供内容。`;
}

function renderCloudBackupStatus(status = {}) {
  if (!$("#cloudBackupStatus")) return;
  $("#cloudBackupStatus").textContent = status.configured ? "已接入" : "未接入";
  $("#cloudBackupStatus").classList.toggle("is-ready", Boolean(status.configured));
  $("#cloudBackupSource").textContent = status.importedFrom || "尚未导入";
  if ($("#cloudBackupAccount")) $("#cloudBackupAccount").textContent = status.account || "—";
  $("#cloudBackupPath").textContent = status.basePath || "—";
  $("#cloudBackupTime").textContent = status.lastBackupAt
    ? new Date(status.lastBackupAt).toLocaleString("zh-CN", { hour12: false })
    : "尚未备份";
  $("#cloudBackupMessage").textContent = status.lastResult
    || "备份范围：设置、提示词、生产任务索引、设备备注、分发记录和防重复账本；素材与成品大文件仍以本地文件夹为真源。";
  $("#testCloudBackupBtn").disabled = !status.configured;
  $("#runCloudBackupBtn").disabled = !status.configured;
  $("#runLargeCloudBackupBtn").disabled = !status.configured;
  $("#inspectCloudBackupBtn").disabled = !status.configured;
  $("#restoreCloudBackupBtn").disabled = !status.configured;
  renderLargeCloudBackupProgress(status.largeBackup);
}

function renderLargeCloudBackupProgress(task) {
  const container = $("#largeCloudBackupProgress");
  if (!container) return;
  container.hidden = !task;
  if (!task) return;
  const percent = Math.max(0, Math.min(100, Number(task.percent || 0)));
  $("#largeCloudBackupBar").value = percent;
  $("#largeCloudBackupPercent").textContent = `${percent}%`;
  $("#largeCloudBackupLabel").textContent = task.message || "方案文件备份";
  $("#runLargeCloudBackupBtn").disabled = task.state === "running" || task.state === "starting";
}

async function loadCloudBackupStatus() {
  if (!$("#cloudBackupStatus")) return;
  try {
    renderCloudBackupStatus(await api("/api/cloud-backup/status"));
  } catch (error) {
    $("#cloudBackupStatus").textContent = "读取失败";
    $("#cloudBackupMessage").textContent = error.message;
  }
}

async function importLifeGameCloudConfig() {
  $("#importLifeGameCloudBtn").disabled = true;
  $("#cloudBackupMessage").textContent = "正在从人生游戏系统安全读取坚果云配置…";
  try {
    const status = await api("/api/cloud-backup/import-life-game", { method: "POST" });
    renderCloudBackupStatus(status);
    toast("已沿用人生游戏系统的坚果云配置");
  } catch (error) {
    showSystemNotice("坚果云配置没有导入", error.message, {
      tone: "danger",
      warning: "不会读取或显示你的明文密码；请确认人生游戏系统已配置并能正常启动。"
    });
    await loadCloudBackupStatus();
  } finally {
    $("#importLifeGameCloudBtn").disabled = false;
  }
}

async function saveCloudBackupConfig() {
  const passwordInput = $("#cloudBackupPassword");
  const password = passwordInput?.value || "";
  if (!$("#cloudBackupUsername")?.value.trim() || !password) {
    showSystemNotice("坚果云配置不完整", "首次设置需要填写账号和应用密码；已经保存过时无需重复填写。", { tone: "danger" });
    return;
  }
  $("#saveCloudBackupConfigBtn").disabled = true;
  $("#cloudBackupMessage").textContent = "正在加密保存并测试坚果云连接…";
  try {
    const status = await api("/api/cloud-backup/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: $("#cloudBackupUrl")?.value || "https://dav.jianguoyun.com/dav/",
        username: $("#cloudBackupUsername")?.value || "",
        password,
        basePath: $("#cloudBackupBasePath")?.value || "/团建工作台备份"
      })
    });
    if (passwordInput) passwordInput.value = "";
    renderCloudBackupStatus(status);
    toast("坚果云已安全接入");
  } catch (error) {
    $("#cloudBackupMessage").textContent = error.message;
    showSystemNotice("坚果云配置没有保存", error.message, { tone: "danger" });
  } finally {
    $("#saveCloudBackupConfigBtn").disabled = false;
  }
}

async function testCloudBackup() {
  $("#testCloudBackupBtn").disabled = true;
  $("#cloudBackupMessage").textContent = "正在测试坚果云连接…";
  try {
    const result = await api("/api/cloud-backup/test", { method: "POST" });
    $("#cloudBackupMessage").textContent = result.message;
    toast("坚果云连接正常");
  } catch (error) {
    showSystemNotice("坚果云连接失败", error.message, { tone: "danger" });
    $("#cloudBackupMessage").textContent = error.message;
  } finally {
    $("#testCloudBackupBtn").disabled = false;
  }
}

async function runCloudBackup() {
  $("#runCloudBackupBtn").disabled = true;
  $("#cloudBackupMessage").textContent = "正在备份设置和操作记录…";
  try {
    const status = await api("/api/cloud-backup/run", { method: "POST" });
    renderCloudBackupStatus(status);
    toast("坚果云备份完成");
  } catch (error) {
    showSystemNotice("坚果云备份没有完成", error.message, { tone: "danger" });
    $("#cloudBackupMessage").textContent = error.message;
  } finally {
    $("#runCloudBackupBtn").disabled = false;
  }
}

async function inspectCloudBackup() {
  $("#inspectCloudBackupBtn").disabled = true;
  $("#cloudBackupMessage").textContent = "正在从云端读取最新备份并核对格式…";
  try {
    const result = await api("/api/cloud-backup/inspect-latest", { method: "POST" });
    $("#cloudBackupMessage").textContent = `${result.message}；备份时间 ${new Date(result.createdAt).toLocaleString("zh-CN", { hour12: false })}`;
    showSystemNotice("云端备份可以恢复", result.message, {
      tone: "success",
      details: [
        { label: "备份版本", value: result.appVersion || "未知" },
        { label: "备份时间", value: result.createdAt ? new Date(result.createdAt).toLocaleString("zh-CN", { hour12: false }) : "未知" },
        { label: "记录数量", value: String(result.recordCount || 0) }
      ]
    });
  } catch (error) {
    $("#cloudBackupMessage").textContent = error.message;
    showSystemNotice("云端备份无法恢复", error.message, { tone: "danger" });
  } finally {
    $("#inspectCloudBackupBtn").disabled = false;
  }
}

async function restoreCloudBackup() {
  const accepted = window.confirm("将用云端最新记录覆盖本机设置与台账。系统会先自动保存一份恢复前快照。确定继续吗？");
  if (!accepted) return;
  $("#restoreCloudBackupBtn").disabled = true;
  $("#cloudBackupMessage").textContent = "正在保存本机快照并恢复云端记录…";
  try {
    const result = await api("/api/cloud-backup/restore-latest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true })
    });
    $("#cloudBackupMessage").textContent = result.message;
    showSystemNotice("云端记录已恢复", result.message, {
      tone: "success",
      warning: "重新打开工作台后会按恢复后的设置读取。恢复前的本机快照仍在运行数据目录。"
    });
  } catch (error) {
    $("#cloudBackupMessage").textContent = error.message;
    showSystemNotice("云端记录没有恢复", error.message, { tone: "danger" });
  } finally {
    $("#restoreCloudBackupBtn").disabled = false;
  }
}

async function pollLargeCloudBackup() {
  const result = await api("/api/cloud-backup/large-status");
  const task = result.task;
  renderLargeCloudBackupProgress(task);
  if (task && ["running", "starting"].includes(task.state)) {
    window.setTimeout(() => pollLargeCloudBackup().catch(() => {}), 1200);
  } else if (task?.state === "completed") {
    toast(task.message || "方案文件备份完成");
  } else if (task?.state === "failed") {
    showSystemNotice("方案文件备份没有完成", task.message || "请检查备份设置", { tone: "danger" });
  }
}

async function runLargeCloudBackup() {
  $("#runLargeCloudBackupBtn").disabled = true;
  $("#cloudBackupMessage").textContent = "正在核对方案文件与本月上传额度…";
  try {
    const result = await api("/api/cloud-backup/run-large", { method: "POST" });
    renderLargeCloudBackupProgress(result.task);
    await pollLargeCloudBackup();
  } catch (error) {
    $("#runLargeCloudBackupBtn").disabled = false;
    $("#cloudBackupMessage").textContent = error.message;
    showSystemNotice("方案文件备份没有启动", error.message, { tone: "danger" });
  }
}

function bindEvents() {
  setupWorkbenchAssistantDrag();
  $("#dashboardView .work-canvas")?.addEventListener("scroll", maybeLoadMoreMaterials, { passive: true });
  $("#productsView .product-preview-pane")?.addEventListener("scroll", maybeLoadMoreProducts, { passive: true });
  document.addEventListener("contextmenu", (event) => {
    const gptMaterialFolder = event.target.closest("[data-gpt-test-post-folder]");
    if (gptMaterialFolder) {
      const entry = findMaterialEntry(gptMaterialFolder.dataset.gptTestPostFolder);
      if (!entry) return;
      event.preventDefault();
      contextMenuTarget = {
        kind: "gpt-material-folder",
        label: entry.item.name,
        path: entry.item.path
      };
      showContextMenu(event.clientX, event.clientY);
      return;
    }
    const materialButton = event.target.closest("[data-workbench-material-filter]");
    const outputButton = event.target.closest("[data-workbench-output-filter]");
    if (!materialButton && !outputButton) return;
    event.preventDefault();
    const bindings = effectiveWorkbenchFolderBindings();
    const key = materialButton
      ? `material-${materialButton.dataset.workbenchMaterialFilter}`
      : `output-${outputButton.dataset.workbenchOutputFilter}`;
    contextMenuTarget = {
      kind: "folder-binding",
      bindingKey: key,
      label: (materialButton || outputButton).textContent.trim(),
      path: bindings[key] || ""
    };
    showContextMenu(event.clientX, event.clientY);
  });
  document.addEventListener("dragstart", (event) => {
    const source = event.target.closest("[data-gpt-material-path]");
    if (!source || gptAutoRunning) return event.preventDefault();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/x-teambuilding-material-path", source.dataset.gptMaterialPath || "");
  });
  document.addEventListener("dragover", (event) => {
    const target = event.target.closest("[data-gpt-drop-category]");
    if (!target || gptAutoRunning) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });
  document.addEventListener("drop", async (event) => {
    const target = event.target.closest("[data-gpt-drop-category]");
    if (!target || gptAutoRunning) return;
    const sourcePath = event.dataTransfer.getData("text/x-teambuilding-material-path");
    const targetPath = target.dataset.gptDropCategory || "";
    if (!sourcePath || !targetPath) return;
    event.preventDefault();
    try {
      await api("/api/extension/move-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath, targetPath })
      });
      showWorkbenchAssistantBubble("素材文件夹已移动，正在刷新左侧目录。", { duration: 0 });
      await loadDashboard(true);
      renderGptTestMaterials();
    } catch (error) {
      showWorkbenchAssistantBubble(`移动失败：${error.message}`, { duration: 0 });
    }
  });
  document.addEventListener("click", async (event) => {
    if (!event.target.closest(".custom-select")) closeCustomSelects();
    if (!event.target.closest(".context-menu")) hideContextMenu();
    const resumeProduction = event.target.closest("[data-production-resume]");
    if (resumeProduction) {
      resumeProduction.disabled = true;
      resumeProductionJob(resumeProduction.dataset.productionResume)
        .catch((error) => showSystemNotice("未能继续生产", error.message, { tone: "danger" }))
        .finally(() => { resumeProduction.disabled = false; });
      return;
    }
    const cancelProduction = event.target.closest("[data-production-cancel]");
    if (cancelProduction) {
      cancelProduction.disabled = true;
      cancelProductionJob(cancelProduction.dataset.productionCancel)
        .catch((error) => showSystemNotice("未能停止任务", error.message, { tone: "danger" }))
        .finally(() => { cancelProduction.disabled = false; });
      return;
    }
    const openProduction = event.target.closest("[data-production-open]");
    if (openProduction) {
      openPath(openProduction.dataset.productionOpen);
      return;
    }
    const productionReport = event.target.closest("[data-production-report]");
    if (productionReport) {
      openPath(productionReport.dataset.productionReport);
      return;
    }
    const settingsButton = event.target.closest("[data-open-page-settings]");
    if (settingsButton) {
      openPageSettings(settingsButton.dataset.openPageSettings);
      return;
    }
    if (event.target.closest("#closePageSettingsBtn")
      || (event.target.id === "pageSettingsBackdrop")) {
      closePageSettings();
      return;
    }
    const dismissReserve = event.target.closest("[data-dismiss-reserve-alert]");
    if (dismissReserve) {
      localStorage.setItem(dismissReserve.dataset.dismissReserveAlert, "1");
      renderDistributionReserveAlert();
      return;
    }
    const imagePreview = event.target.closest("[data-image-preview]");
    if (imagePreview) {
      event.preventDefault();
      event.stopPropagation();
      openImageLightbox(imagePreview.dataset.imagePreview, imagePreview.dataset.imageCaption || "图片预览");
      return;
    }
    const workbenchTextPreview = event.target.closest("[data-workbench-text-path]");
    if (workbenchTextPreview) {
      event.preventDefault();
      event.stopPropagation();
      await openWorkbenchTextAsset(workbenchTextPreview);
      return;
    }
    const gptMaterialCategory = event.target.closest("[data-gpt-test-material-category]");
    if (gptMaterialCategory) {
      const categoryPath = gptMaterialCategory.dataset.gptTestMaterialCategory;
      const category = dashboard?.materials?.categories?.find((item) => item.path === categoryPath);
      if (gptTestExpandedCategories.has(categoryPath)) gptTestExpandedCategories.delete(categoryPath);
      else gptTestExpandedCategories.add(categoryPath);
      renderGptTestMaterials();
      if (category?.loaded === false && gptTestExpandedCategories.has(categoryPath)) {
        await loadMaterialCategory(categoryPath);
        renderGptTestMaterials();
      }
      return;
    }
    const gptCategoryCheck = event.target.closest("[data-gpt-test-category-check]");
    if (gptCategoryCheck) {
      if (blockGptSelectionDuringRun()) return;
      const categoryPath = gptCategoryCheck.dataset.gptTestCategoryCheck;
      const shouldSelect = gptCategoryCheck.checked;
      let category = dashboard?.materials?.categories?.find((item) => item.path === categoryPath);
      if (category?.loaded === false) {
        gptTestExpandedCategories.add(categoryPath);
        await loadMaterialCategory(categoryPath);
        category = dashboard?.materials?.categories?.find((item) => item.path === categoryPath);
      }
      (category?.items || []).forEach((item) => {
        if (shouldSelect) {
          gptTestSelectedMaterials.add(item.path);
          gptTestMaterialEntries.set(item.path, { item, category });
        } else {
          gptTestSelectedMaterials.delete(item.path);
          gptTestMaterialEntries.delete(item.path);
        }
      });
      gptTestQueue = [];
      gptTestQueueIndex = 0;
      renderGptTestMaterials();
      return;
    }
    const gptPostFolder = event.target.closest("[data-gpt-test-post-folder]");
    if (gptPostFolder) {
      const entry = findMaterialEntry(gptPostFolder.dataset.gptTestPostFolder);
      if (entry) {
        if (gptTestExpandedMaterials.has(entry.item.path)) gptTestExpandedMaterials.delete(entry.item.path);
        else gptTestExpandedMaterials.add(entry.item.path);
        renderGptTestMaterials();
      }
      return;
    }
    const gptUploadPost = event.target.closest("[data-gpt-upload-post]");
    if (gptUploadPost) {
      if (blockGptSelectionDuringRun()) return;
      const entry = findMaterialEntry(gptUploadPost.dataset.gptUploadPost);
      if (!entry) return;
      try {
        await uploadMaterialToCurrentGpt(entry);
      } catch (error) {
        showSystemNotice("素材上传失败", error.message, { tone: "danger" });
      }
      return;
    }
    const gptMaterialCheck = event.target.closest("[data-gpt-test-material-check]");
    if (gptMaterialCheck) {
      if (blockGptSelectionDuringRun()) return;
      const entry = findMaterialEntry(gptMaterialCheck.dataset.gptTestMaterialCheck);
      if (entry) {
        if (gptMaterialCheck.checked) gptTestSelectedMaterials.add(entry.item.path);
        else gptTestSelectedMaterials.delete(entry.item.path);
        if (gptMaterialCheck.checked) gptTestMaterialEntries.set(entry.item.path, entry);
        else gptTestMaterialEntries.delete(entry.item.path);
        gptTestQueue = [];
        gptTestQueueIndex = 0;
        renderGptTestMaterials();
      }
      return;
    }
    const gptTemplateButton = event.target.closest("[data-gpt-test-template]");
    if (gptTemplateButton) {
      const templateId = gptTemplateButton.dataset.gptTestTemplate;
      if (gptTestExpandedTemplates.has(templateId)) gptTestExpandedTemplates.delete(templateId);
      else gptTestExpandedTemplates.add(templateId);
      gptTestQueue = [];
      gptTestQueueIndex = 0;
      renderGptTestTemplates();
      return;
    }
    const gptUploadTemplate = event.target.closest("[data-gpt-upload-template]");
    if (gptUploadTemplate) {
      if (blockGptSelectionDuringRun()) return;
      const templateId = gptUploadTemplate.dataset.gptUploadTemplate;
      const templates = gptTemplateMode === "online" ? gptOnlineTemplates : (dashboard?.templates?.templates || []);
      const template = templates.find((item) => item.id === templateId);
      if (!template) return;
      try {
        await uploadTemplateToCurrentGpt(template);
      } catch (error) {
        showSystemNotice("模板上传失败", error.message, { tone: "danger" });
      }
      return;
    }
    const onlineTemplateDelete = event.target.closest("[data-gpt-online-template-delete]");
    if (onlineTemplateDelete) {
      if (blockGptSelectionDuringRun()) return;
      event.preventDefault();
      event.stopPropagation();
      const templateId = onlineTemplateDelete.dataset.gptOnlineTemplateDelete;
      try {
        const result = await api("/api/gpt-online-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", id: templateId })
        });
        gptOnlineTemplates = Array.isArray(result?.templates) ? result.templates : [];
        gptTestSelectedTemplates.delete(templateId);
        gptTestExpandedTemplates.delete(templateId);
        renderGptTestTemplates();
        showWorkbenchAssistantBubble("在线模板已从链接模板.txt 删除。", { duration: 3200 });
      } catch (error) {
        showSystemNotice("在线模板删除失败", error.message, { tone: "danger" });
      }
      return;
    }
    const gptTemplateCheck = event.target.closest("[data-gpt-test-template-check]");
    if (gptTemplateCheck) {
      if (blockGptSelectionDuringRun()) return;
      const templateId = gptTemplateCheck.dataset.gptTestTemplateCheck;
      if (gptTemplateCheck.checked) gptTestSelectedTemplates.add(templateId);
      else gptTestSelectedTemplates.delete(templateId);
      gptTestQueue = [];
      gptTestQueueIndex = 0;
      renderGptTestTemplates();
      return;
    }
    const jump = event.target.closest("[data-jump]");
    if (jump) activateTab(jump.dataset.jump);
    const materialFilter = event.target.closest("[data-workbench-material-filter]");
    if (materialFilter) {
      workbenchMaterialFilter = materialFilter.dataset.workbenchMaterialFilter || "all";
      $$("[data-workbench-material-filter]").forEach((button) => button.classList.toggle("active", button === materialFilter));
      renderWorkbenchMaterials();
    }
    const materialFolder = event.target.closest("[data-workbench-material-folder]");
    if (materialFolder) {
      const categoryPath = materialFolder.dataset.workbenchMaterialFolder;
      const category = dashboard?.materials?.categories?.find((item) => item.path === categoryPath);
      workbenchActiveMaterialCategoryPath = categoryPath;
      workbenchExpandedMaterialCategoryPath = workbenchExpandedMaterialCategoryPath === categoryPath ? "" : categoryPath;
      workbenchExpandedMaterialPath = "";
      saveLocalState({ selectedMaterialCategory: category?.name || "", selectedMaterialCategoryPath: categoryPath, selectedMaterial: "" });
      if (category?.loaded === false) {
        materialFolder.classList.add("loading");
        await loadDashboard(false, categoryPath);
      } else {
        renderWorkbenchMaterials();
      }
      return;
    }
    const postFolder = event.target.closest("[data-workbench-post-folder]");
    if (postFolder) {
      const entry = findMaterialEntry(postFolder.dataset.workbenchPostFolder);
      if (entry) {
        workbenchExpandedMaterialPath = workbenchExpandedMaterialPath === entry.item.path ? "" : entry.item.path;
        selectMaterial(entry.item, entry.category, { keepFeed: true });
        renderWorkbenchMaterials();
      }
      return;
    }
    const materialCheck = event.target.closest("[data-workbench-material-check]");
    if (materialCheck) {
      const entry = findMaterialEntry(materialCheck.dataset.workbenchMaterialCheck);
      if (entry) {
        const checked = materialCheck.checked;
        if (checked) workbenchSelectedMaterials.add(entry.item.path);
        else workbenchSelectedMaterials.delete(entry.item.path);
        selectMaterial(entry.item, entry.category, { keepFeed: true });
        renderWorkbenchMaterials();
      }
      return;
    }
    const templateType = event.target.closest("[data-template-type]");
    if (templateType) {
      workbenchTemplateType = templateType.dataset.templateType;
      $$("[data-template-type]").forEach((button) => button.classList.toggle("active", button === templateType));
      renderWorkbenchTemplates();
    }
    const workbenchTemplate = event.target.closest("[data-workbench-template]");
    if (workbenchTemplate) {
      const template = dashboard.templates.templates.find((item) => item.id === workbenchTemplate.dataset.workbenchTemplate);
      if (template) {
        selectTemplate(template);
        renderWorkbenchTemplates();
      }
    }
    const outputFilter = event.target.closest("[data-workbench-output-filter]");
    if (outputFilter) {
      workbenchOutputFilter = outputFilter.dataset.workbenchOutputFilter;
      $$("[data-workbench-output-filter]").forEach((button) => button.classList.toggle("active", button === outputFilter));
      workbenchExpandedProductPath = "";
      renderWorkbenchProducts();
      return;
    }
    const productFolder = event.target.closest("[data-workbench-product-folder]");
    if (productFolder) {
      const productPath = productFolder.dataset.workbenchProductFolder;
      workbenchExpandedProductPath = workbenchExpandedProductPath === productPath ? "" : productPath;
      renderWorkbenchProducts();
      return;
    }
    const productCheck = event.target.closest("[data-workbench-product-check]");
    if (productCheck) {
      const productPath = productCheck.dataset.workbenchProductCheck;
      const checked = productCheck.checked;
      if (checked) workbenchSelectedProducts.add(productPath);
      else workbenchSelectedProducts.delete(productPath);
      renderWorkbenchProducts();
      return;
    }
    const treeToggle = event.target.closest("[data-tree-toggle]");
    if (treeToggle) {
      const categoryPath = treeToggle.dataset.treeToggle;
      const category = dashboard?.materials?.categories?.find((item) => item.path === categoryPath);
      if (expandedMaterialPaths.has(categoryPath)) {
        expandedMaterialPaths.delete(categoryPath);
      } else {
        expandedMaterialPaths.add(categoryPath);
        if (category && category.loaded === false) {
          saveLocalState({ selectedMaterialCategory: category.name, selectedMaterialCategoryPath: categoryPath, selectedMaterial: "" });
          await loadDashboard(false, categoryPath);
        }
      }
      renderMaterials();
    }
    const treeView = event.target.closest("[data-material-tree-view]");
    if (treeView) {
      materialTreeView = treeView.dataset.materialTreeView === "icons" ? "icons" : "list";
      window.localStorage.setItem("materialTreeView", materialTreeView);
      renderMaterials();
    }
    const treeSelect = event.target.closest("[data-tree-select]");
    if (treeSelect) {
      const entry = findMaterialEntry(treeSelect.dataset.treeSelect);
      if (entry) selectMaterial(entry.item, entry.category, { keepFeed: true });
    }
    const treeSend = event.target.closest("[data-tree-send]");
    if (treeSend) transmitMaterialToGpt(treeSend.dataset.treeSend).catch((error) => {
      console.error(error);
      toast("打开 ChatGPT 失败，请检查默认浏览器");
    });
    const filter = event.target.closest("[data-filter-key]");
    if (filter) {
      collectionFilters[filter.dataset.filterKey] = filter.dataset.filterValue;
      renderCollections();
    }
    const workflowStage = event.target.closest("[data-workflow-stage]");
    if (workflowStage) {
      collectionFilters.stage = workflowStage.dataset.workflowStage;
      packageDevicePickerCollectionName = "";
      renderCollections();
    }
    const collectionToggle = event.target.closest("[data-collection-toggle]");
    if (collectionToggle) {
      event.preventDefault();
      event.stopPropagation();
      const name = collectionToggle.dataset.collectionToggle;
      if (expandedCollectionNames.has(name)) expandedCollectionNames.delete(name);
      else expandedCollectionNames.add(name);
      renderCollections();
    }
    const collectionView = event.target.closest("[data-collection-view-toggle]");
    if (collectionView) {
      collectionViewMode = collectionViewMode === "grid" ? "list" : "grid";
      window.localStorage.setItem("collectionViewMode", collectionViewMode);
      renderCollections();
    }
    const workPreview = event.target.closest("[data-preview-work]");
    if (workPreview) showCollectionWorkPreview(workPreview.dataset.previewWork, workPreview.dataset.previewText, workPreview.dataset.workPath);
    const openPreviewFolder = event.target.closest("[data-open-preview-folder]");
    if (openPreviewFolder?.dataset.openPreviewFolder) openPath(openPreviewFolder.dataset.openPreviewFolder);
    const distributionTab = event.target.closest("#distributionTabs [data-panel]");
    if (distributionTab) showDistributionPanel(distributionTab.dataset.panel);
    const stageTypeFilter = event.target.closest("[data-stage-type-filter]");
    if (stageTypeFilter) {
      distributionCollectionTypeFilter = stageTypeFilter.dataset.stageTypeFilter;
      packageDevicePickerCollectionName = "";
      renderDistribution();
    }
    const renameBtn = event.target.closest("[data-rename-collection]");
    if (renameBtn) {
      const oldName = renameBtn.dataset.renameCollection;
      const newName = prompt("输入新的作品集名称：", oldName);
      if (newName && newName !== oldName) {
        api("/api/distribution/rename-collection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collection: oldName, newName })
        }).then(() => {
          toast(`已重命名为 ${newName}`);
          loadDashboard(true).then(renderDistribution);
        }).catch((err) => toast(`重命名失败：${err.message || err}`, { tone: "error" }));
      }
    }
    const deleteBtn = event.target.closest("[data-delete-collection]");
    if (deleteBtn) {
      const collName = deleteBtn.dataset.deleteCollection;
      if (confirm(`确认删除空作品集「${collName}」？\n\n只能删除不含图片的空作品集。`)) {
        api("/api/distribution/delete-collection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collection: collName, confirmed: true })
        }).then(() => {
          toast(`已删除空作品集 ${collName}`);
          loadDashboard(true).then(renderDistribution);
        }).catch((err) => toast(`删除失败：${err.message || err}`, { tone: "error" }));
      }
    }
    const openStageRoot = event.target.closest("[data-open-stage-root]");
    if (openStageRoot) openPath(dashboard?.distribution?.stageRoots?.[openStageRoot.dataset.openStageRoot]);
    const distributionFilter = event.target.closest("[data-distribution-filter]");
    if (distributionFilter) {
      distributionSummaryFilter = distributionFilter.dataset.distributionFilter;
      packageDevicePickerCollectionName = "";
      selectedDistributionDeviceId = "";
      renderDistribution();
    }
    const editDeviceNote = event.target.closest("[data-edit-device-note]");
    if (editDeviceNote) beginDeviceNoteEdit(editDeviceNote);
    const uploadOther = event.target.closest("[data-upload-other]");
    if (uploadOther) {
      uploadChoiceDeviceId = uploadChoiceDeviceId === uploadOther.dataset.uploadOther
        ? ""
        : uploadOther.dataset.uploadOther;
      renderDistribution();
    }
    const genericSource = event.target.closest("[data-generic-source]");
    if (genericSource) chooseGenericTransferSource(
      genericSource.dataset.genericDevice,
      genericSource.dataset.genericSource
    );
    if (event.target.closest("[data-close-upload-choice]")) {
      uploadChoiceDeviceId = "";
      renderDistribution();
    }
    const cancelTransfer = event.target.closest("[data-cancel-transfer]");
    if (cancelTransfer) {
      const isDistributionTask = cancelTransfer.dataset.transferKind === "distribution";
      const endpoint = isDistributionTask
        ? `/api/distribution/tasks/${encodeURIComponent(cancelTransfer.dataset.cancelTransfer)}/cancel`
        : `/api/transfers/${encodeURIComponent(cancelTransfer.dataset.cancelTransfer)}/cancel`;
      api(endpoint, {
        method: "POST"
      }).then((task) => {
        (isDistributionTask ? distributionTransferUiTasks : genericTransferUiTasks).set(task.id, task);
        renderDistribution();
      }).catch((error) => showSystemNotice("无法停止任务", error.message, { tone: "danger" }));
    }
    const dismissTransfer = event.target.closest("[data-dismiss-transfer]");
    if (dismissTransfer) {
      dismissTransferTask(dismissTransfer.dataset.dismissTransfer, dismissTransfer.dataset.transferKind);
      return;
    }
    const sendPackage = event.target.closest("[data-send-package]");
    if (sendPackage) {
      selectedDistributionCollectionName = sendPackage.dataset.sendPackage;
      packageDevicePickerCollectionName = sendPackage.dataset.sendPackage;
      if (sendPackage.closest("#productsView")) renderCollections();
      else renderDistribution();
    }
    const markUsed = event.target.closest("[data-mark-used]");
    if (markUsed) markCollectionUsed(markUsed.dataset.markUsed);
    const confirmPackageDevice = event.target.closest("[data-confirm-package-device]");
    if (confirmPackageDevice) {
      selectedDistributionDeviceId = confirmPackageDevice.dataset.confirmPackageDevice;
      packageDevicePickerCollectionName = "";
      renderDistribution();
      renderCollections();
      sendSelectedDistributionPackage();
    }
    const closeDevicePicker = event.target.closest("[data-close-device-picker]");
    if (closeDevicePicker && event.target === closeDevicePicker) {
      packageDevicePickerCollectionName = "";
      renderDistribution();
      renderCollections();
    }
    if (event.target.closest("[data-open-official-site]")) openExternal("https://mp.weixin.qq.com/");

    // 微信公众号草稿发布器事件
    const wechatCollection = event.target.closest("[data-wechat-collection]");
    if (wechatCollection) {
      loadWechatDraftPosts(wechatCollection.dataset.wechatCollection);
      return;
    }
    const wechatPost = event.target.closest("[data-wechat-post-index]");
    if (wechatPost) {
      const index = Number(wechatPost.dataset.wechatPostIndex);
      if (wechatDraftPosts[index]) {
        wechatDraftSelectedPost = wechatDraftPosts[index];
        renderWechatDraftRight();
      }
      return;
    }
    if (event.target.closest("[data-wechat-draft-settings]")) {
      openWechatDraftSettings();
      return;
    }
    const testConnBtn = event.target.closest("[data-test-connection]");
    if (testConnBtn) {
      testWechatConnection(testConnBtn.dataset.testConnection);
      return;
    }
    const createDraftBtn = event.target.closest("#wechatDraftCreateBtn");
    if (createDraftBtn) {
      createWechatDraft();
      return;
    }
    // 批量草稿队列事件
    if (event.target.closest("#wechatBatchCreateBtn")) {
      startWechatBatchCreate();
      return;
    }
    if (event.target.closest("#wechatBatchCancelBtn")) {
      cancelWechatBatchCreate();
      return;
    }
    if (event.target.closest("#wechatBatchClearBtn")) {
      clearWechatBatchRecords();
      return;
    }
    if (event.target.closest("#wechatBatchDryRunToggle")) {
      wechatBatchDryRun = !wechatBatchDryRun;
      renderWechatDraftRight();
      return;
    }
    const batchSelectAll = event.target.closest("#wechatBatchSelectAll");
    if (batchSelectAll) {
      const checked = batchSelectAll.checked;
      document.querySelectorAll(".wechat-batch-checkbox").forEach((cb) => {
        if (!cb.disabled) cb.checked = checked;
      });
      return;
    }
    const deviceAction = event.target.closest("[data-device-action]");
    if (deviceAction) {
      const type = deviceAction.dataset.deviceAction;
      const typeLabel = type === "conversion" ? "精准流量" : "泛流量";
      executeDistributionAction(
        { action: "device-restock", device: deviceAction.dataset.device, type },
        `将给 ${deviceAction.dataset.device} 随机补充一个${typeLabel}作品集。`
      );
    }
    const officialAction = event.target.closest("[data-official-action]");
    if (officialAction) {
      executeDistributionAction(
        { action: "official-reserve", type: "traffic" },
        "将打开一个公众号可用作品集，并记录为“已打开过”。"
      );
    }
    const confirmOfficial = event.target.closest("[data-confirm-official]");
    if (confirmOfficial) confirmOfficialCollection(confirmOfficial.dataset.confirmOfficial);
    const pageHelp = event.target.closest("[data-page-help]");
    if (pageHelp && PAGE_HELP[pageHelp.dataset.pageHelp]) {
      const help = PAGE_HELP[pageHelp.dataset.pageHelp];
      showSystemNotice(help.title, help.description, {
        eyebrow: "使用说明",
        details: help.details,
        warning: help.warning
      });
    }
    const pluginFilter = event.target.closest("[data-plugin-filter]");
    if (pluginFilter) {
      activePluginFilter = pluginFilter.dataset.pluginFilter || "all";
      renderPluginMarket();
    }
    const pluginPath = event.target.closest("[data-plugin-path]");
    if (pluginPath?.dataset.pluginPath) {
      openPath(pluginPath.dataset.pluginPath);
    }
    const pluginUrl = event.target.closest("[data-plugin-url]");
    if (pluginUrl?.dataset.pluginUrl) {
      openExternal(pluginUrl.dataset.pluginUrl);
    }
    const theme = event.target.closest("[data-theme]");
    if (theme) applyTheme(theme.dataset.theme);
    const themeCycle = event.target.closest("#globalThemeCycleBtn");
    if (themeCycle) {
      const currentIndex = WORKBENCH_THEME_ORDER.indexOf(document.body.dataset.theme || "neo");
      localStorage.setItem("tb-dashboard-theme-mode", "manual");
      applyTheme(WORKBENCH_THEME_ORDER[(currentIndex + 1) % WORKBENCH_THEME_ORDER.length]);
    }
  });
  document.addEventListener("change", (event) => {
    const classification = event.target.closest?.("[data-classify-collection]");
    if (classification) classifyDistributionCollection(
      classification.dataset.classifyCollection,
      classification.value
    );
    // 批量 checkbox 变化时同步全选框状态
    if (event.target.classList?.contains("wechat-batch-checkbox")) {
      const allCheckboxes = document.querySelectorAll(".wechat-batch-checkbox:not(:disabled)");
      const checkedCount = document.querySelectorAll(".wechat-batch-checkbox:checked").length;
      const selectAll = $("#wechatBatchSelectAll");
      if (selectAll) {
        selectAll.checked = allCheckboxes.length > 0 && checkedCount === allCheckboxes.length;
        selectAll.indeterminate = checkedCount > 0 && checkedCount < allCheckboxes.length;
      }
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCustomSelects();
      closeImageLightbox();
      closePageSettings();
    }
  });
  document.addEventListener("dragover", (event) => {
    const row = event.target.closest?.(".device-row.is-online");
    if (!row || !event.dataTransfer?.types?.includes("Files")) return;
    event.preventDefault();
    row.classList.add("is-drag-target");
  });
  document.addEventListener("dragleave", (event) => {
    event.target.closest?.(".device-row")?.classList.remove("is-drag-target");
  });
  document.addEventListener("drop", async (event) => {
    const row = event.target.closest?.(".device-row.is-online");
    if (!row) return;
    event.preventDefault();
    row.classList.remove("is-drag-target");
    const file = event.dataTransfer?.files?.[0];
    const sourcePath = file
      ? (window.desktopFiles?.getPath?.(file) || file.path || "")
      : "";
    if (!sourcePath) {
      showSystemNotice("浏览器调试版不能读取拖入路径", "请使用桌面应用拖放，或点击设备右侧的“上传其他”。");
      return;
    }
    await startGenericTransfer(row.dataset.deviceId, sourcePath);
  });

  $("#refreshBtn").addEventListener("click", async () => {
    await loadDashboard("materials", $("#materialLibraryFilter")?.value || "");
    toast("已刷新本地库");
  });
  $("#materialRefreshBtn")?.addEventListener("click", async () => {
    await loadDashboard("materials");
    toast("本地文件树已刷新");
  });
  $("#gptTestMaterialRefreshBtn")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await loadDashboard("materials");
      renderGptTestMaterials();
      renderGptTestTemplates();
      updateGptTestQueueStatus("素材区已刷新；当前已选项目保持不变。");
      toast("GPT 素材区已刷新");
    } finally {
      button.disabled = false;
    }
  });
  $("#openChatGptBtn")?.addEventListener("click", () => openExternal("https://chatgpt.com/"));
  $("#sendSelectedToGptBtn")?.addEventListener("click", () => transmitMaterialToGpt());
  $("#runWorkPackageBtn")?.addEventListener("click", () => openExternal("cgpt-workpkg://run"));
  $("#configureWorkPackageBtn")?.addEventListener("click", () => openExternal("cgpt-workpkg://configure"));
  $("#runExistingWorkPackageBtn")?.addEventListener("click", () => openExternal("cgpt-workpkg://run"));
  $("#chooseMaterialRootBtn")?.addEventListener("click", async () => {
    try {
      const selectedPath = await chooseFolder("选择需要递归扫描的素材目录");
      if (selectedPath) $("#materialRootInput").value = selectedPath;
    } catch (error) {
      showSystemNotice("目录选择失败", error.message, { tone: "danger" });
    }
  });
  $("#applyMaterialRootBtn")?.addEventListener("click", () => {
    saveWorkspacePaths({
      materialRoot: $("#materialRootInput").value,
      materialOnly: true,
      returnTab: "dashboard"
    }).catch((error) => showSystemNotice("目录扫描失败", error.message, { tone: "danger" }));
  });
  $("#materialRootInput")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    $("#applyMaterialRootBtn")?.click();
  });
  $("#chooseSettingsMaterialRootBtn")?.addEventListener("click", async () => {
    try {
      const selectedPath = await chooseFolder("选择素材目录");
      if (selectedPath) $("#settingsMaterialRoot").value = selectedPath;
    } catch (error) {
      showSystemNotice("目录选择失败", error.message, { tone: "danger" });
    }
  });
  $("#choosePortfolioRootBtn")?.addEventListener("click", async () => {
    try {
      const selectedPath = await chooseFolder("选择作品集存放目录");
      if (selectedPath) $("#settingsPortfolioRoot").value = selectedPath;
    } catch (error) {
      showSystemNotice("目录选择失败", error.message, { tone: "danger" });
    }
  });
  const bindCollectionRootControls = (inputSelector, chooseSelector, applySelector, returnTab) => {
    const commit = () => {
      const input = $(inputSelector);
      if (!input?.value.trim()) return;
      saveWorkspacePaths({
        portfolioRoot: input.value,
        returnTab
      }).catch((error) => showSystemNotice("作品集目录读取失败", error.message, { tone: "danger" }));
    };
    $(chooseSelector)?.addEventListener("click", async () => {
      try {
        const selectedPath = await chooseFolder("选择作品集存放目录");
        if (selectedPath) {
          $(inputSelector).value = selectedPath;
          commit();
        }
      } catch (error) {
        showSystemNotice("目录选择失败", error.message, { tone: "danger" });
      }
    });
    $(applySelector)?.addEventListener("click", commit);
    $(inputSelector)?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commit();
    });
    $(inputSelector)?.addEventListener("change", commit);
  };
  bindCollectionRootControls("#collectionRootInput", "#chooseCollectionRootBtn", "#applyCollectionRootBtn", "products");
  bindCollectionRootControls("#distributionCollectionRootInput", "#chooseDistributionCollectionRootBtn", "#applyDistributionCollectionRootBtn", "distribution");
  $("#savePathSettingsBtn")?.addEventListener("click", () => {
    saveWorkspacePaths({ returnTab: "settings" })
      .catch((error) => showSystemNotice("设置没有保存", error.message, { tone: "danger" }));
  });
  $("#saveProductionApiBtn")?.addEventListener("click", () => saveProductionApi().catch((error) => setProductionLiveStatus(error.message, "error")));
  $("#testProductionApiBtn")?.addEventListener("click", testProductionApi);
  $("#createProductionPlanBtn")?.addEventListener("click", () => (
    activeProductionPlan ? confirmProductionPlan() : createProductionPlan()
  ));
  $("#cancelProductionPlanBtn")?.addEventListener("click", () => {
    invalidateProductionPlan();
    setProductionLiveStatus("已取消当前计划，可以重新选择。");
  });
  $("#productionApiProvider")?.addEventListener("change", () => {
    const provider = $("#productionApiProvider").value;
    const selected = WORKBENCH_PROVIDER_DEFAULTS[provider] || WORKBENCH_PROVIDER_DEFAULTS["local-openai"];
    $("#productionApiBaseUrl").value = selected.baseUrl;
    $("#productionApiModel").value = selected.imageModel;
    setProductionLiveStatus(`已切换 ${selected.label}；文案平台保持独立配置。`);
  });
  $("#productionTextProvider")?.addEventListener("change", () => {
    const provider = $("#productionTextProvider").value;
    const selected = WORKBENCH_TEXT_PROVIDER_DEFAULTS[provider] || WORKBENCH_TEXT_PROVIDER_DEFAULTS.minimax;
    $("#productionTextBaseUrl").value = selected.baseUrl;
    const modelSelect = $("#productionTextModel");
    if (modelSelect) {
      const options = [...new Set([selected.textModel, ...(provider === "minimax" ? ["MiniMax-M2.7"] : ["gpt-5.6-terra"])])];
      modelSelect.innerHTML = options.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("");
      modelSelect.value = selected.textModel;
      syncCustomSelect(modelSelect);
    }
    workbenchModelsLoaded = false;
    renderWorkbenchModelOptions();
    setProductionLiveStatus(`已切换 ${selected.label}；请保存后测试文案连接。`);
  });
  renderProductionMode();
  $("#workbenchMaterialSearch")?.addEventListener("input", renderWorkbenchMaterials);
  $("#workbenchRefreshModelsBtn")?.addEventListener("click", () => refreshWorkbenchModels(true));
  $("#workbenchImageProvider")?.addEventListener("change", () => {
    workbenchModelsLoaded = false;
    renderWorkbenchModelOptions();
    saveWorkbenchModels().then(() => refreshWorkbenchModels(true)).catch((error) => {
      if ($("#workbenchModelStatus")) $("#workbenchModelStatus").textContent = `模型没有保存：${error.message}`;
    });
  });
  ["#workbenchImageModel", "#workbenchTextModel"].forEach((selector) => {
    $(selector)?.addEventListener("change", () => {
      saveWorkbenchModels().catch((error) => {
        if ($("#workbenchModelStatus")) $("#workbenchModelStatus").textContent = `模型没有保存：${error.message}`;
      });
    });
  });
  $("#workbenchSelectAllBtn")?.addEventListener("click", () => {
    const entries = currentWorkbenchMaterials();
    const allSelected = entries.length && entries.every(({ item }) => workbenchSelectedMaterials.has(item.path));
    entries.forEach(({ item }) => allSelected ? workbenchSelectedMaterials.delete(item.path) : workbenchSelectedMaterials.add(item.path));
    renderWorkbenchMaterials();
  });
  $("#workbenchChooseMaterialRootBtn")?.addEventListener("click", async () => {
    try {
      const selectedPath = await chooseFolder("选择需要递归扫描的素材库");
      if (selectedPath) {
        $("#workbenchMaterialRoot").value = selectedPath;
        workbenchActiveMaterialCategoryPath = "";
        workbenchExpandedMaterialCategoryPath = "";
        workbenchExpandedMaterialPath = "";
        await saveWorkspacePaths({ materialRoot: selectedPath, materialOnly: true, returnTab: "dashboard" });
        toast("已自动扫描新的素材目录");
      }
    } catch (error) {
      showSystemNotice("目录选择失败", error.message, { tone: "danger" });
    }
  });
  const commitWorkbenchMaterialRoot = () => {
    saveWorkspacePaths({
      materialRoot: $("#workbenchMaterialRoot").value,
      materialOnly: true,
      returnTab: "dashboard"
    }).catch((error) => showSystemNotice("素材库没有读取成功", error.message, { tone: "danger" }));
  };
  $("#workbenchApplyMaterialRootBtn")?.addEventListener("click", commitWorkbenchMaterialRoot);
  $("#workbenchMaterialRoot")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitWorkbenchMaterialRoot();
  });
  $("#workbenchMaterialRoot")?.addEventListener("change", commitWorkbenchMaterialRoot);
  bindCollectionRootControls("#workbenchProductRoot", "#workbenchChooseProductRootBtn", "#workbenchApplyProductRootBtn", "dashboard");
  $("#chooseProductionPackedRootBtn")?.addEventListener("click", async () => {
    try {
      const selectedPath = await chooseFolder("选择已打包作品集目录");
      if (!selectedPath) return;
      $("#productionPackedRoot").value = selectedPath;
      await savePageSettingsFromUi("production");
      await loadProductionWorkspace();
      toast("已打包库已切换");
    } catch (error) {
      showSystemNotice("已打包库没有保存", error.message, { tone: "danger" });
    }
  });
  $("#chooseProductionTemplateRootBtn")?.addEventListener("click", async () => {
    try {
      const selectedPath = await chooseFolder("选择模板库目录");
      if (!selectedPath) return;
      $("#productionTemplateRoot").value = selectedPath;
      await savePageSettingsFromUi("production");
      toast("模板库设置已保存");
    } catch (error) {
      showSystemNotice("模板目录没有保存", error.message, { tone: "danger" });
    }
  });
  [["#chooseGptDownloadRootBtn", "#gptDownloadRoot", "选择 GPT 图片下载暂存目录"], ["#chooseGptProductRootBtn", "#gptProductRoot", "选择 GPT 成品库目录"]].forEach(([buttonSelector, inputSelector, title]) => {
    $(buttonSelector)?.addEventListener("click", async () => {
      const input = $(inputSelector);
      const selectedPath = await chooseFolder(title, input?.value || "");
      if (!selectedPath || !input) return;
      input.value = selectedPath;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));
    });
  });
  $("#gptCopyMasterPromptBtn")?.addEventListener("click", () => {
    copyText($("#gptMasterPromptRules")?.value || currentGptMasterPrompt(), "初始化提示词已复制");
  });
  $("#gptRestoreMasterPromptBtn")?.addEventListener("click", () => {
    if (gptAutoRunning) {
      showWorkbenchAssistantBubble("当前作品正在执行，只允许查看和复制提示词；作品闭环后再恢复默认。", { duration: 4200 });
      return;
    }
    if ($("#gptMasterPromptRules")) $("#gptMasterPromptRules").value = GPT_CURRENT_MASTER_PROMPT;
    saveGptAutoSettings();
    toast(`已恢复 V${GPT_CURRENT_MASTER_PROMPT_VERSION} 初始化提示词`);
  });
  $("#gptSaveMasterPromptBtn")?.addEventListener("click", () => {
    if (gptAutoRunning) {
      showWorkbenchAssistantBubble("当前作品正在执行，只允许查看和复制提示词；作品闭环后再保存修改。", { duration: 4200 });
      return;
    }
    const value = String($("#gptMasterPromptRules")?.value || "").trim();
    if (!value) {
      showWorkbenchAssistantBubble("初始化提示词不能为空；可以点击“恢复 V4.5”。", { duration: 4200, tone: "warning" });
      return;
    }
    saveGptAutoSettings();
    toast(value === GPT_CURRENT_MASTER_PROMPT ? `V${GPT_CURRENT_MASTER_PROMPT_VERSION} 初始化提示词已保存` : "自定义初始化提示词已保存");
  });
  [
    "#productionTemplateRoot", "#productionPackedRoot", "#productionBasePromptRules", "#productionReserveThreshold",
    "#productionReserveCategory", "#productionItemsPerCollection", "#productionScheduleTime",
    "#productionAutoProduceEnabled", "#productionScheduleEnabled", "#productionCompressCollections"
  ].forEach((selector) => {
    $(selector)?.addEventListener("change", () => savePageSettingsFromUi("production")
      .then(async () => {
        if (selector === "#productionPackedRoot") await loadProductionWorkspace();
        toast("内容制作设置已保存");
      })
      .catch((error) => showSystemNotice("内容制作设置没有保存", error.message, { tone: "danger" })));
  });
  [
    "#desktopReserveThreshold", "#desktopReserveCategory", "#desktopReserveAlertEnabled",
    "#phoneReserveThreshold", "#autoDistributionCategory", "#autoDistributionCount",
    "#detectOnConnection", "#autoDistributionEnabled", "#requireSendConfirmation",
    "#completionNotificationEnabled"
  ].forEach((selector) => {
    $(selector)?.addEventListener("change", () => savePageSettingsFromUi("distribution")
      .then(() => toast("内容分发设置已保存"))
      .catch((error) => showSystemNotice("内容分发设置没有保存", error.message, { tone: "danger" })));
  });
  $("#workbenchMaterialCategory")?.addEventListener("change", async (event) => {
    const categoryPath = event.target.value;
    const category = dashboard?.materials?.categories?.find((item) => item.path === categoryPath);
    saveLocalState({ selectedMaterialCategory: category?.name || "", selectedMaterialCategoryPath: categoryPath, selectedMaterial: "" });
    await loadDashboard(false, categoryPath);
    renderWorkbenchMaterials();
    toast("已切换素材分类");
  });
  $("#gptTestMaterialSearch")?.addEventListener("input", renderGptTestMaterials);
  $("#gptLocalTemplateModeBtn")?.addEventListener("click", () => switchGptTemplateMode("local"));
  $("#gptOnlineTemplateModeBtn")?.addEventListener("click", () => switchGptTemplateMode("online"));
  $("#gptSaveOnlineTemplateBtn")?.addEventListener("click", () => saveGptOnlineTemplate()
    .catch((error) => showSystemNotice("在线模板没有保存", error.message, { tone: "danger" })));
  ["#gptOnlineTemplateName", "#gptOnlineTemplateUrl"].forEach((selector) => {
    $(selector)?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      saveGptOnlineTemplate().catch((error) => showSystemNotice("在线模板没有保存", error.message, { tone: "danger" }));
    });
  });
  $("#gptTestExtraPrompt")?.addEventListener("input", () => {
    if (gptAutoRunning) {
      showWorkbenchAssistantBubble("自动生产进行中，本批补充要求已锁定；请暂停后再修改。", { duration: 4200 });
      return;
    }
    gptTestQueue = [];
    gptTestQueueIndex = 0;
    updateGptTestQueueStatus();
  });
  $("#gptTestSendBtn")?.addEventListener("click", async () => {
    const accountId = activeGptAccountId;
    // Guard: if a manual task is waiting for the user to send the prompt in
    // GPT, do not start a new upload.  The button should be disabled already,
    // but this prevents race conditions from keyboard shortcuts or rapid clicks.
    if (gptCurrentManualTask) {
      showWorkbenchAssistantBubble('当前已有手动任务等待发送；请在 GPT 中发送提示词后点「完成当前，上传下一套」。', { duration: 4200 });
      return;
    }
    // Guard: if a semi-auto task is waiting for the user to confirm the plan,
    // do not start a new upload.  The "确认继续出图" button is the only way forward.
    if (gptSemiAutoPendingTask) {
      showWorkbenchAssistantBubble('当前已有半自动任务等待确认；请审核计划后点「确认继续出图」。', { duration: 4200 });
      return;
    }
    writeGptWindowRuntime(accountId, { stoppedByUser: false, pausedByUser: false, status: "idle" });
    if (isContinuousGptMode()) {
      setContinuousGptProductionArmed(true);
      if (gptTestQueueIndex >= gptTestQueue.length && !gptTestSelectedMaterials.size) {
        await prepareAllDayGptQueue();
      }
    }
    const pausedTaskError = String(gptLastFailedTask?._error || "");
    const allowQuotaOverride = gptQueuePaused && /额度|限额|quota|rate limit|usage limit/i.test(pausedTaskError);
    if (allowQuotaOverride) {
      showWorkbenchAssistantBubble("已收到手动继续指令：本地额度提醒不再拦截本轮，网页真实返回限流时才停止。", { duration: 5200 });
    }
    gptQuotaPauseStatus = "";
    sendNextGptTestTask({ accountId, allowQuotaOverride, userInitiated: true, allowWindowSwitch: true });
  });
  $("#gptProductionMode")?.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const mode = normalizeGptProductionMode($("#gptProductionMode")?.value);
    contextMenuTarget = {
      kind: "gpt-production-mode",
      mode,
      label: gptModeProfiles[mode]?.name || GPT_MODE_DEFINITIONS[mode].defaultName,
      path: ""
    };
    showContextMenu(event.clientX, event.clientY);
  });
  const handleGptModeChange = (event) => {
    if (gptAutoRunning) {
      renderGptAutoSettings();
      showWorkbenchAssistantBubble("当前作品正在运行，不能切换账号生产模式；暂停或完成后再切换。", { duration: 4200 });
      return;
    }
    const key = normalizeGptProductionMode(event.target?.value);
    // Clear any pending semi-auto task when switching modes.  A semi-auto
    // pause is owned by the semi-auto mode; switching to another mode
    // orphaned the pending task and left the "确认继续出图" button visible.
    if (gptSemiAutoPendingTask && key !== "semi-auto") {
      gptSemiAutoPendingTask = null;
    }
    if (gptMultiRunState) {
      const switchedRun = TBGptAccountRotation.rotationRunAfterModeSwitch(gptMultiRunState, key);
      if (switchedRun) persistGptMultiRun(switchedRun);
    }
    gptAutoSettings.mode = key;
    applyGptModeProfile(key);
    if ($("#gptProductionMode")) $("#gptProductionMode").value = key;
    // Per-window mode: persist this mode on the current account so switching
    // to another window and back restores each window's own mode.
    const currentAccount = gptAccounts.find((item) => item.id === activeGptAccountId);
    if (currentAccount) {
      currentAccount.mode = key;
      saveGptAccounts();
    }
    renderGptAutoSettings();
    showWorkbenchAssistantBubble(`已切换到“${gptModeProfiles[key]?.name || GPT_MODE_DEFINITIONS[key].defaultName}”。新任务会绑定当前账号窗口。`, { duration: 3600 });
  };
  $("#gptProductionMode")?.addEventListener("change", handleGptModeChange);
  $("#gptModeInfoBtn")?.addEventListener("click", () => {
    const popover = $("#gptModeInfoPopover");
    if (popover) popover.hidden = !popover.hidden;
  });
  // ── Mode add/delete buttons ──
  $("#gptAddModeBtn")?.addEventListener("click", () => {
    if (gptAutoRunning) {
      showWorkbenchAssistantBubble("任务运行中，不能新增模式。", { duration: 3600 });
      return;
    }
    const name = window.prompt("输入新模式名称：", "自定义模式");
    if (!name || !name.trim()) return;
    const trimmed = name.trim().slice(0, 40);
    // 生成唯一 key
    let idx = 1;
    while (gptModeProfiles[`custom-${idx}`]) idx++;
    const customKey = `custom-${idx}`;
    const baseKey = activeSettingsModeKey();
    const baseProfile = gptModeProfiles[baseKey] || gptModeProfiles.manual;
    gptModeProfiles[customKey] = {
      name: trimmed,
      useCurrentSession: baseProfile.useCurrentSession !== false,
      confirmText: baseProfile.confirmText || "1",
      copyPrompt: normalizeGptCopyPrompt(baseProfile.copyPrompt),
      steps: normalizeGptWorkflowSteps(baseProfile.steps),
      isCustom: true,
      baseMode: baseKey
    };
    saveGptModeProfiles();
    // 动态添加模式标签
    const tabsContainer = $("#gptModeQuickTabs");
    if (tabsContainer) {
      const newTab = document.createElement("button");
      newTab.type = "button";
      newTab.className = "mode-quick-tab";
      newTab.dataset.mode = customKey;
      newTab.setAttribute("role", "tab");
      newTab.innerHTML = `<span>${escapeHtml(trimmed)}</span><small>自定义</small>`;
      newTab.addEventListener("click", () => {
        if (gptAutoRunning) { showWorkbenchAssistantBubble("任务运行中，不能切换模式。", { duration: 3600 }); return; }
        gptSettingsPreviewMode = customKey;
        renderGptModeProfile();
        updateModeQuickTabs(customKey);
      });
      tabsContainer.appendChild(newTab);
    }
    gptSettingsPreviewMode = customKey;
    renderGptModeProfile();
    updateModeQuickTabs(customKey);
    showWorkbenchAssistantBubble(`已创建模式「${trimmed}」，基于「${baseProfile.name}」的设置。`, { duration: 4200 });
  });
  $("#gptDeleteModeBtn")?.addEventListener("click", () => {
    if (gptAutoRunning) {
      showWorkbenchAssistantBubble("任务运行中，不能删除模式。", { duration: 3600 });
      return;
    }
    const key = activeSettingsModeKey();
    const profile = gptModeProfiles[key];
    const modeName = profile?.name || key;
    if (profile?.isCustom) {
      // 自定义模式：直接删除
      if (!window.confirm(`删除自定义模式「${modeName}」？此操作不可撤销。`)) return;
      delete gptModeProfiles[key];
      saveGptModeProfiles();
      // 移除标签
      const tab = document.querySelector(`#gptModeQuickTabs .mode-quick-tab[data-mode="${key}"]`);
      if (tab) tab.remove();
      // 切回默认模式
      gptSettingsPreviewMode = normalizeGptProductionMode(gptAutoSettings.mode);
      renderGptModeProfile();
      updateModeQuickTabs();
      showWorkbenchAssistantBubble(`已删除自定义模式「${modeName}」。`, { duration: 3600 });
    } else {
      // 内置模式：重置为默认
      if (!window.confirm(`重置「${modeName}」为默认设置？自定义的工作流和参数将被清除。`)) return;
      gptModeProfiles[key] = {
        name: GPT_MODE_DEFINITIONS[key]?.defaultName || modeName,
        useCurrentSession: true,
        confirmText: "1",
        copyPrompt: GPT_PUBLISH_COPY_PROMPT,
        steps: defaultGptWorkflowSteps()
      };
      saveGptModeProfiles();
      applyGptModeProfile(key);
      renderGptAutoSettings();
      showWorkbenchAssistantBubble(`「${modeName}」已重置为默认设置。`, { duration: 3600 });
    }
  });
  document.querySelectorAll("#gptModeQuickTabs .mode-quick-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (gptAutoRunning) {
        showWorkbenchAssistantBubble("当前作品正在运行，不能切换生产模式；暂停或完成后再切换。", { duration: 4200 });
        updateModeQuickTabs();
        return;
      }
      const key = normalizeGptProductionMode(tab.dataset.mode);
      if (key === activeSettingsModeKey()) return;
      gptSettingsPreviewMode = key;
      renderGptModeProfile();
      updateModeQuickTabs(key);
    });
  });
  $("#gptPatrolAllowlist")?.addEventListener("change", (event) => {
    const values = String(event.currentTarget.value || "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    savePatrolAllowlist(values);
    gptPatrolDiscovery = null;
    renderGptPatrolDiscovery();
    $("#gptPatrolDiscoverStatus").textContent = "准入名单已保存；请重新只读扫描";
  });
  $("#gptPatrolDiscoverBtn")?.addEventListener("click", () => {
    discoverCurrentAccountPatrolConversations();
  });
  $("#gptPatrolConversationList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-patrol-toggle]");
    if (!button || !gptPatrolDiscovery) return;
    const templates = gptPatrolDiscovery.conversations.filter((item) => item.titleMatched);
    const item = templates[Number(button.dataset.patrolToggle || -1)];
    if (!item) return;
    const values = new Set(patrolAllowlist());
    if (item.eligible) values.delete(item.url);
    else values.add(item.url);
    const allowlist = savePatrolAllowlist([...values]);
    $("#gptPatrolAllowlist").value = allowlist.join("\n");
    gptPatrolDiscovery.conversations = gptPatrolDiscovery.conversations.map((candidate) => ({
      ...candidate,
      explicitlyAllowed: allowlist.includes(candidate.url) || allowlist.includes(candidate.title),
      eligible: candidate.titleMatched && (allowlist.includes(candidate.url) || allowlist.includes(candidate.title))
    }));
    gptPatrolDiscovery.eligibleCount = gptPatrolDiscovery.conversations.filter((candidate) => candidate.eligible).length;
    renderGptPatrolDiscovery();
    $("#gptPatrolDiscoverStatus").textContent = `准入名单已更新：${gptPatrolDiscovery.eligibleCount} 个对话可续接；当前仍未执行任何对话动作`;
  });
  $("#gptAddModeWorkflowStepBtn")?.addEventListener("click", () => {
    if (gptAutoRunning) {
      showWorkbenchAssistantBubble("本批任务正在执行，流程不能在运行中修改；暂停或完成后再添加环节。", { duration: 4200 });
      return;
    }
    const key = activeSettingsModeKey();
    const steps = normalizeGptWorkflowSteps(readGptModeWorkflowFromUi());
    steps.push({ action: "wait-plan", text: "", timeoutSeconds: 60, enabled: true, autoDetect: true });
    gptModeProfiles[key] = { ...(gptModeProfiles[key] || {}), steps };
    saveGptModeProfiles();
    renderGptModeProfile();
    toast("已添加环节并实时保存");
  });
  // ── Real-time save: any edit in the workflow editor immediately persists ──
  $("#gptModeWorkflowEditor")?.addEventListener("input", () => {
    if (gptAutoRunning) return;
    const key = activeGptModeKey();
    const draft = readGptModeWorkflowFromUi();
    if (!draft.length) return;
    const validation = validateGptWorkflowSteps(draft);
    if (!validation.ok) return; // silent — let the user finish typing
    gptModeProfiles[key] = { ...(gptModeProfiles[key] || {}), steps: validation.steps, useCurrentSession: $("#gptModeStartBehavior")?.value !== "inject" };
    saveGptModeProfiles();
    applyGptModeProfile(key);
  });
  $("#gptModeWorkflowEditor")?.addEventListener("change", (event) => {
    if (gptAutoRunning) {
      renderGptAutoSettings();
      showWorkbenchAssistantBubble("本批任务正在执行，生产设置已锁定；暂停或完成后再修改。", { duration: 4200 });
      return;
    }
    const key = activeGptModeKey();
    const draft = readGptModeWorkflowFromUi();
    if (!draft.length) return;
    const validation = validateGptWorkflowSteps(draft);
    if (!validation.ok) {
      showWorkbenchAssistantBubble(`流程有误：${validation.error}`, { duration: 5200 });
      return;
    }
    gptModeProfiles[key] = { ...(gptModeProfiles[key] || {}), steps: validation.steps, useCurrentSession: $("#gptModeStartBehavior")?.value !== "inject" };
    saveGptModeProfiles();
    applyGptModeProfile(key);
    saveGptAutoSettings();
    // 提示词预设选择器：选择「默认」时自动填充默认提示词
    if (event.target?.dataset?.workflowField === "textPreset") {
      const action = event.target.dataset.action || "";
      const defaultsList = defaultGptWorkflowSteps();
      const defaultStep = defaultsList.find((s) => s.action === action);
      const textInput = event.target.closest(".gpt-workflow-text-cell")?.querySelector('[data-workflow-field="text"]');
      if (event.target.value === "default" && defaultStep?.text && textInput) {
        textInput.value = defaultStep.text;
        // 触发保存
        const draft = readGptModeWorkflowFromUi();
        const validation = validateGptWorkflowSteps(draft);
        if (validation.ok) {
          gptModeProfiles[key] = { ...(gptModeProfiles[key] || {}), steps: validation.steps, useCurrentSession: $("#gptModeStartBehavior")?.value !== "inject" };
          saveGptModeProfiles();
          applyGptModeProfile(key);
          saveGptAutoSettings();
        }
      }
    }
    // If the action dropdown changed, re-render to show/hide correct input fields
    if (event.target?.dataset?.workflowField === "action") {
      renderGptModeWorkflow();
    } else {
      // Update auto-detect visual state without full re-render
      const waitActions = new Set(["upload-material", "wait-plan", "wait-images", "wait-copy", "download-images", "save-text"]);
      document.querySelectorAll("#gptModeWorkflowEditor .gpt-workflow-step").forEach((row) => {
        const checkbox = row.querySelector('[data-workflow-field="autoDetect"]');
        if (checkbox) {
          const action = row.querySelector('[data-workflow-field="action"]')?.value || "";
          row.classList.toggle("is-auto-wait", checkbox.checked && waitActions.has(action));
        }
      });
    }
  });

  // ── Prompt expand/collapse: inline expansion for workflow step prompts ──
  function togglePromptExpand(row, editor, presetSelect, stepIndex, actionLabel, options = {}) {
    if (!editor || !row) return;
    const existing = row.querySelector(".gpt-workflow-prompt-expanded");
    if (existing) {
      existing.remove();
      const btn = row.querySelector("[data-workflow-prompt-edit]");
      if (btn) btn.textContent = "编辑提示词";
      return;
    }
    const wrapper = document.createElement("div");
    wrapper.className = "gpt-workflow-prompt-expanded";
    const originalValue = editor.value || "";
    const presetValue = presetSelect?.value || "custom";
    wrapper.innerHTML = `
      <div class="gpt-workflow-prompt-expanded-header">
        <span class="gpt-workflow-prompt-expanded-title">第${stepIndex}步 · ${escapeHtml(actionLabel || "提示词")}</span>
        <span class="gpt-workflow-prompt-expanded-count">${originalValue.length} 字</span>
      </div>
      <div class="gpt-workflow-prompt-expanded-preset">
        <label>提示词来源</label>
        <select class="gpt-workflow-prompt-expanded-preset-select">
          <option value="custom"${presetValue === "custom" ? " selected" : ""}>自定义</option>
          <option value="default"${presetValue === "default" ? " selected" : ""}>默认</option>
        </select>
      </div>
      <textarea class="gpt-workflow-prompt-expanded-textarea" rows="8" placeholder="点击输入提示词内容..."></textarea>
      <div class="gpt-workflow-prompt-expanded-actions">
        <button type="button" class="gpt-workflow-prompt-expanded-cancel dialog-secondary">取消</button>
        <button type="button" class="gpt-workflow-prompt-expanded-save primary-button">保存并收起</button>
      </div>`;
    const mainRow = row.querySelector(".gpt-workflow-main");
    if (mainRow && mainRow.nextSibling) {
      row.insertBefore(wrapper, mainRow.nextSibling);
    } else {
      row.appendChild(wrapper);
    }
    const ta = wrapper.querySelector(".gpt-workflow-prompt-expanded-textarea");
    const charCount = wrapper.querySelector(".gpt-workflow-prompt-expanded-count");
    ta.value = originalValue;
    ta.readOnly = options.readOnly === true;
    wrapper.querySelector(".gpt-workflow-prompt-expanded-preset-select").disabled = options.readOnly === true;
    wrapper.querySelector(".gpt-workflow-prompt-expanded-save").hidden = options.readOnly === true;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.addEventListener("input", () => {
      charCount.textContent = `${ta.value.length} 字`;
    });
    const presetEl = wrapper.querySelector(".gpt-workflow-prompt-expanded-preset-select");
    const save = () => {
      editor.value = ta.value;
      if (presetSelect) presetSelect.value = presetEl.value;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      wrapper.remove();
      const btn = row.querySelector("[data-workflow-prompt-edit]");
      if (btn) btn.textContent = "编辑提示词";
    };
    const cancel = () => {
      wrapper.remove();
      const btn = row.querySelector("[data-workflow-prompt-edit]");
      if (btn) btn.textContent = "编辑提示词";
    };
    wrapper.querySelector(".gpt-workflow-prompt-expanded-save").addEventListener("click", save);
    wrapper.querySelector(".gpt-workflow-prompt-expanded-cancel").addEventListener("click", cancel);
    wrapper.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { cancel(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { save(); }
    });
    const btn = row.querySelector("[data-workflow-prompt-edit]");
    if (btn) btn.textContent = "收起编辑";
  }

  // ── Click handler: move up/down, delete, and drag-and-drop ──
  $("#gptModeWorkflowEditor")?.addEventListener("click", (event) => {
    const row = event.target.closest(".gpt-workflow-step");
    if (!row) return;
    const promptEdit = event.target.closest("[data-workflow-prompt-edit]");
    if (promptEdit) {
      const editor = row.querySelector('[data-workflow-field="text"]');
      const presetSelect = row.querySelector('[data-workflow-field="textPreset"]');
      const stepIndex = Number(row.dataset.workflowIndex) + 2;
      const actionLabel = row.querySelector('[data-workflow-field="action"]')?.selectedOptions?.[0]?.textContent || "";
      togglePromptExpand(row, editor, presetSelect, stepIndex, actionLabel, { readOnly: gptAutoRunning });
      return;
    }
    if (gptAutoRunning) return;
    const remove = event.target.closest("[data-workflow-remove]");
    if (!remove) return;
    const steps = normalizeGptWorkflowSteps(readGptModeWorkflowFromUi());
    const index = Number(row.dataset.workflowIndex);
    if (!Number.isInteger(index) || !steps[index]) return;
    if (steps.length <= 1) return;
    steps.splice(index, 1);
    const key = activeGptModeKey();
    gptModeProfiles[key] = { ...(gptModeProfiles[key] || {}), steps };
    saveGptModeProfiles();
    applyGptModeProfile(key);
    renderGptModeWorkflow();
  });
  // ── Drag-and-drop reordering ──
  let gptWorkflowDragSrc = null;
  $("#gptModeWorkflowEditor")?.addEventListener("dragstart", (event) => {
    if (gptAutoRunning) { event.preventDefault(); return; }
    // Don't start drag from inside inputs, selects, or textareas — let users select text
    if (event.target.matches("input, select, textarea")) { event.preventDefault(); return; }
    const row = event.target.closest(".gpt-workflow-step");
    if (!row) return;
    gptWorkflowDragSrc = row;
    row.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", row.dataset.workflowIndex);
  });
  $("#gptModeWorkflowEditor")?.addEventListener("dragend", () => {
    if (gptWorkflowDragSrc) gptWorkflowDragSrc.classList.remove("dragging");
    gptWorkflowDragSrc = null;
    document.querySelectorAll("#gptModeWorkflowEditor .gpt-workflow-step.drag-over").forEach((el) => el.classList.remove("drag-over"));
  });
  $("#gptModeWorkflowEditor")?.addEventListener("dragover", (event) => {
    if (gptAutoRunning || !gptWorkflowDragSrc) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const row = event.target.closest(".gpt-workflow-step");
    if (!row || row === gptWorkflowDragSrc) return;
    document.querySelectorAll("#gptModeWorkflowEditor .gpt-workflow-step.drag-over").forEach((el) => el.classList.remove("drag-over"));
    row.classList.add("drag-over");
  });
  $("#gptModeWorkflowEditor")?.addEventListener("drop", (event) => {
    if (gptAutoRunning || !gptWorkflowDragSrc) return;
    event.preventDefault();
    const targetRow = event.target.closest(".gpt-workflow-step");
    if (!targetRow || targetRow === gptWorkflowDragSrc) return;
    const steps = normalizeGptWorkflowSteps(readGptModeWorkflowFromUi());
    const fromIndex = Number(gptWorkflowDragSrc.dataset.workflowIndex);
    const toIndex = Number(targetRow.dataset.workflowIndex);
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex === toIndex) return;
    const [moved] = steps.splice(fromIndex, 1);
    steps.splice(toIndex, 0, moved);
    const key = activeGptModeKey();
    gptModeProfiles[key] = { ...(gptModeProfiles[key] || {}), steps };
    saveGptModeProfiles();
    applyGptModeProfile(key);
    renderGptModeWorkflow();
    toast("环节顺序已更新");
  });
  $("#gptManualNextBtn")?.addEventListener("click", completeCurrentManualGptTask);
  $("#gptSemiAutoResumeBtn")?.addEventListener("click", resumeSemiAutoGptTask);
  $("#gptPauseQueueBtn")?.addEventListener("click", () => {
    const accountId = activeGptAccountId;
    const runtime = readGptWindowRuntime(accountId);
    if (gptAutoRunning && gptAutoPaused) {
      // The current stage is already winding down.  A second click only
      // releases the pause flag; it never injects a new post into the page.
      gptAutoPaused = false;
      writeGptWindowRuntime(accountId, { pausedByUser: false, status: "running", stoppedByUser: false });
      updateGptTestQueueStatus("已继续当前工作流；仍会先完成当前帖子再进入下一帖");
      showWorkbenchAssistantBubble("已继续当前工作流，当前帖子完成后才会处理下一帖。", { duration: 3600 });
      return;
    }
    if (!gptAutoRunning && gptQueuePaused) {
      // Semi-auto pause: the queue is waiting for the user to confirm the
      // plan, not for a generic resume.  The "确认继续出图" button is the
      // only way forward; clicking "继续" here must not bypass it.
      if (gptSemiAutoPendingTask) {
        showWorkbenchAssistantBubble('当前正在等待你确认迁移计划。请审核计划后点「确认继续出图」继续出图。', { duration: 4200 });
        return;
      }
      writeGptWindowRuntime(accountId, { pausedByUser: false, stoppedByUser: false, status: "probing", currentStage: "准备继续" });
      if (isContinuousGptMode()) setContinuousGptProductionArmed(true);
      const pausedTaskError = String(gptLastFailedTask?._error || "");
      const allowQuotaOverride = /额度|限额|quota|rate limit|usage limit/i.test(pausedTaskError);
      gptQuotaPauseStatus = "";
      sendNextGptTestTask({ accountId, allowQuotaOverride, userInitiated: true, allowWindowSwitch: true }).catch((error) => {
        updateGptTestQueueStatus(`继续失败：${error?.message || "未知错误"}`);
      });
      return;
    }
    if (!gptAutoRunning) return;
    setContinuousGptProductionArmed(false);
    clearTimeout(gptContinuousLaunchTimer);
    gptContinuousLaunchTimer = null;
    clearTimeout(gptWindowRetryTimers.get(accountId));
    gptWindowRetryTimers.delete(accountId);
    gptAutoPaused = true;
    writeGptWindowRuntime(accountId, { pausedByUser: true, status: "paused", currentStage: "用户暂停" });
    persistGptQueue();
    updateGptTestQueueStatus("已暂停；当前阶段结束后停在安全检查点");
    showWorkbenchAssistantBubble("已暂停当前工作流；不会注入下一帖，按钮现在可点“继续”。", { duration: 4200 });
  });
  $("#gptStopQueueBtn")?.addEventListener("click", async () => {
    const accountId = activeGptAccountId;
    const runtime = readGptWindowRuntime(accountId);
    if (runtime.stoppedByUser) {
      gptAutoPaused = false;
      gptQueuePaused = false;
      writeGptWindowRuntime(accountId, { stoppedByUser: false, pausedByUser: false, status: "idle", currentStage: "等待启动" });
      setContinuousGptProductionArmed(isContinuousGptMode());
      updateGptTestQueueStatus("已启动当前账号窗口；正在恢复到上次安全检查点。");
      reconcileGptWindow(accountId, { force: true }).catch((error) => updateGptTestQueueStatus(`启动失败：${error?.message || "未知错误"}`));
      return;
    }
    if (!window.confirm("停止当前账号窗口的生产模式？未完成队列会保留，但不会继续上传或自动重试。")) return;
    clearTimeout(gptContinuousLaunchTimer);
    gptContinuousLaunchTimer = null;
    clearTimeout(gptWindowRetryTimers.get(accountId));
    gptWindowRetryTimers.delete(accountId);
    setContinuousGptProductionArmed(false);
    gptAutoPaused = true;
    gptQueuePaused = true;
    gptAutoRunning = false;
    // Clear any pending semi-auto task so the "确认继续出图" button
    // disappears when the user explicitly stops production.
    gptSemiAutoPendingTask = null;
    writeGptWindowRuntime(accountId, { stoppedByUser: true, pausedByUser: false, status: "stopped", currentStage: "已停止" });
    persistGptQueue();
    updateGptTestQueueStatus("当前账号窗口已停止；队列和登录状态已保留，点击“启动”可恢复。");
    showWorkbenchAssistantBubble("已停止当前账号窗口；不会继续注入下一帖，也不会自动重试。", { duration: 0, tone: "warning" });
  });
  $("#gptRetryTaskBtn")?.addEventListener("click", retryCurrentGptTask);
  $("#gptSkipTaskBtn")?.addEventListener("click", () => {
    if (gptAutoRunning) {
      showSystemNotice("当前阶段仍在执行", "为避免附件或下载串批，请先暂停，当前阶段结束后再跳过。");
      return;
    }
    gptCurrentManualTask = null;
    // If skipping while a semi-auto task is pending for confirmation, clear
    // the pending state so the "确认继续出图" button disappears and the
    // queue advances to the next material.
    if (gptSemiAutoPendingTask) {
      gptSemiAutoPendingTask = null;
      gptAutoPaused = false;
      gptQueuePaused = false;
    }
    gptTestQueueIndex = Math.min(gptTestQueue.length, gptTestQueueIndex + 1);
    if (gptTestQueue[gptTestQueueIndex - 1]) gptTestQueue[gptTestQueueIndex - 1]._status = "skipped";
    persistGptQueue();
    updateGptTestQueueStatus("已跳过当前队列步骤，可以继续剩余任务");
  });
  $("#gptProductionHistoryBtn")?.addEventListener("click", () => openGptProductionHistory($("#gptProductionHistoryPanel")?.hidden !== false));
  $("#closeGptProductionHistory")?.addEventListener("click", () => openGptProductionHistory(false));
  $("#gptBrowserBackBtn")?.addEventListener("click", () => navigateEmbeddedGpt("back"));
  $("#gptBrowserForwardBtn")?.addEventListener("click", () => navigateEmbeddedGpt("forward"));
  $("#gptBrowserReloadBtn")?.addEventListener("click", () => navigateEmbeddedGpt("reload"));
  $("#gptBrowserHomeBtn")?.addEventListener("click", () => navigateEmbeddedGpt("home"));
  function resolveGptBrowserInput(value = "") {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const url = new URL(candidate);
      const hostLooksLikeAddress = Boolean(url.hostname)
        && (url.hostname === "localhost"
          || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname)
          || url.hostname.includes(".")
          || url.hostname.startsWith("["));
      if ((url.protocol === "http:" || url.protocol === "https:") && hostLooksLikeAddress) {
        return url.href;
      }
    } catch {
      // Plain text is intentionally handled as a search query below.
    }
    return `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
  }

  const submitGptBrowserAddress = () => {
    const input = $("#gptBrowserAddressInput");
    const value = String(input?.value || "").trim();
    if (!value) return;
    const target = resolveGptBrowserInput(value);
    navigateEmbeddedGpt("url", target).finally(() => input?.blur());
  };
  $("#gptBrowserGoBtn")?.addEventListener("click", submitGptBrowserAddress);
  $("#gptBrowserAddressInput")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitGptBrowserAddress();
  });
  $("#gptAddAccountBtn")?.addEventListener("click", () => addGptAccount());
  $("#exportLocalSettingsBtn")?.addEventListener("click", () => exportLocalWorkbenchSettings()
    .catch((error) => showSystemNotice("本地设置没有导出", error.message, { tone: "danger" })));
  $("#importLocalSettingsBtn")?.addEventListener("click", () => $("#importLocalSettingsFile")?.click());
  $("#importLocalSettingsFile")?.addEventListener("change", (event) => {
    importLocalWorkbenchSettings(event.target.files?.[0])
      .catch((error) => showSystemNotice("本地设置没有恢复", error.message, { tone: "danger" }))
      .finally(() => { event.target.value = ""; });
  });
  $("#createGptLoginRecoveryBtn")?.addEventListener("click", async () => {
    if (!window.gptWorkbench?.available) return;
    if (!window.confirm("登录恢复点包含当前账号的本机浏览器登录资料，只能保存在这台可信电脑。确认创建吗？")) return;
    try {
      await window.gptWorkbench.createLoginRecovery(activeGptAccountId);
      $("#gptLoginRecoveryStatus").textContent = "当前账号的本机 GPT 登录恢复点已创建；它不会上传坚果云。";
      toast("本机 GPT 登录恢复点已创建");
    } catch (error) {
      showSystemNotice("登录恢复点没有创建", error.message, { tone: "danger" });
    }
  });
  $("#restoreGptLoginRecoveryBtn")?.addEventListener("click", async () => {
    if (!window.gptWorkbench?.available) return;
    if (!window.confirm("恢复会覆盖当前账号的本机登录分区，并自动重启团建工作台。继续吗？")) return;
    try {
      await window.gptWorkbench.restoreLoginRecovery(activeGptAccountId);
    } catch (error) {
      showSystemNotice("登录档案没有恢复", error.message, { tone: "danger" });
    }
  });
  [
    "#gptProductionMode",
    "#gptQuotaReminderEnabled",
    "#gptAutoTaskTimeout", "#gptAutoAccountLimit", "#gptParallelWorkers", "#gptUploadLimit", "#gptGenerationLimit", "#gptQuotaWindowHours",
    "#gptMinimumImageCount", "#gptIdleUnloadMinutes", "#gptDownloadRoot", "#gptProductRoot",
    "#gptPromptLibraryEnabled", "#gptMessageDownloadsEnabled", "#gptScheduledEnabled", "#gptScheduledTime", "#gptScheduledJitter", "#gptSchedulePlan",
    "#gptLaunchAtLogin", "#gptContinuousAutoStart", "#gptContinuousWorkHoursEnabled", "#gptContinuousWorkStart", "#gptContinuousWorkEnd",
    "#gptExtraPromptRules", "#gptModeStartBehavior"
  ].forEach((selector) => {
    $(selector)?.addEventListener("change", () => {
      if (gptAutoRunning) {
        renderGptAutoSettings();
        showWorkbenchAssistantBubble("本批任务正在执行，生产设置已锁定；暂停或完成后再修改。", { duration: 4200 });
        return;
      }
      saveGptAutoSettings();
      if (isContinuousGptMode()
        && gptAutoSettings.continuousAutoStart !== false
        && !gptQueuePaused
        && !currentGptQueueIntegrityBlock()) {
        setContinuousGptProductionArmed(true);
        clearTimeout(gptContinuousLaunchTimer);
        gptContinuousLaunchTimer = null;
        scheduleContinuousGptProduction();
      } else if (!isContinuousGptMode()) {
        setContinuousGptProductionArmed(false);
        clearTimeout(gptContinuousLaunchTimer);
        gptContinuousLaunchTimer = null;
      }
      // Settings and mode changes must not erase a paused/recoverable queue.
      // Queue rebuilding belongs to explicit material selection/start actions.
      updateGptTestQueueStatus();
      toast("自动生产设置已保存");
    });
  });
  $("#gptAccountTabs")?.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-gpt-account]");
    if (tab) switchGptAccount(tab.dataset.gptAccount);
  });
  $("#gptAccountTabs")?.addEventListener("contextmenu", (event) => {
    const tab = event.target.closest("[data-gpt-account]");
    if (!tab) return;
    event.preventDefault();
    const account = gptAccounts.find((item) => item.id === tab.dataset.gptAccount);
    contextMenuTarget = {
      kind: "gpt-browser-profile",
      accountId: tab.dataset.gptAccount,
      label: account?.name || "账号窗口",
      path: ""
    };
    showContextMenu(event.clientX, event.clientY);
  });
  $("#gptAccountTabs")?.addEventListener("dragstart", (event) => {
    const tab = event.target.closest("[data-gpt-account]");
    if (!tab) return;
    draggedGptAccountId = tab.dataset.gptAccount;
    tab.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedGptAccountId);
  });
  $("#gptAccountTabs")?.addEventListener("dragover", (event) => {
    const tab = event.target.closest("[data-gpt-account]");
    if (!tab || !draggedGptAccountId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });
  $("#gptAccountTabs")?.addEventListener("drop", (event) => {
    const tab = event.target.closest("[data-gpt-account]");
    if (!tab) return;
    event.preventDefault();
    const sourceId = draggedGptAccountId || event.dataTransfer.getData("text/plain");
    draggedGptAccountId = "";
    reorderGptAccounts(sourceId, tab.dataset.gptAccount).catch((error) => {
      showSystemNotice("账号窗口排序没有保存", error.message, { tone: "danger" });
    });
  });
  $("#gptAccountTabs")?.addEventListener("dragend", (event) => {
    event.target.closest("[data-gpt-account]")?.classList.remove("dragging");
    draggedGptAccountId = "";
  });
  $("#gptBrowserManager")?.addEventListener("change", async (event) => {
    const nameInput = event.target.closest("[data-browser-name]");
    const quotaInput = event.target.closest("[data-browser-quota-group]");
    const id = nameInput?.dataset.browserName || quotaInput?.dataset.browserQuotaGroup;
    if (!id) return;
    const account = gptAccounts.find((item) => item.id === id);
    if (!account) return;
    if (nameInput) account.name = String(nameInput.value || account.name).trim().slice(0, 24) || account.name;
    if (quotaInput) account.quotaGroup = String(quotaInput.value || account.id).trim().slice(0, 48) || account.id;
    if (window.gptWorkbench?.saveProfile) {
      const state = await window.gptWorkbench.saveProfile({ ...account, active: false });
      gptAccounts = state.profiles.map((profile) => ({ ...profile }));
    }
    saveGptAccounts();
    renderGptAccountTabs();
    renderGptBrowserManager();
    showWorkbenchAssistantBubble(`${account.name} 已保存；额度组为 ${account.quotaGroup}。`);
  });
  $("#gptBrowserManager")?.addEventListener("click", async (event) => {
    const toggleDisable = event.target.closest("[data-browser-toggle-disable]");
    const toggle = event.target.closest("[data-browser-toggle]");
    const recovery = event.target.closest("[data-browser-recovery]");
    const remove = event.target.closest("[data-browser-remove]");
    const deleteLogin = event.target.closest("[data-browser-delete-login]");
    if (toggleDisable) return toggleGptAccountDisabled(toggleDisable.dataset.browserToggleDisable);
    if (deleteLogin) return deleteGptAccountLogin(deleteLogin.dataset.browserDeleteLogin);
    if (remove) return removeGptAccount(remove.dataset.browserRemove);
    if (recovery) {
      showWorkbenchAssistantBubble("正在创建本机登录恢复点，软件会自动重启。", { duration: 0 });
      return window.gptWorkbench?.createLoginRecovery?.(recovery.dataset.browserRecovery);
    }
    if (!toggle) return;
    const account = gptAccounts.find((item) => item.id === toggle.dataset.browserToggle);
    if (!account || !window.gptWorkbench?.hideProfile) return;
    const state = await window.gptWorkbench.hideProfile({ id: account.id, hidden: !account.hidden });
    gptAccounts = state.profiles.map((profile) => ({ ...profile }));
    activeGptAccountId = state.activeId;
    saveGptAccounts();
    renderGptAccountTabs();
    renderGptBrowserManager();
    if (account.hidden) await showEmbeddedGptView();
  });
  window.addEventListener("resize", () => {
    if (!$("#gptProductionTestView")?.classList.contains("active") || !window.gptWorkbench?.available) return;
    clearTimeout(gptEmbeddedResizeTimer);
    gptEmbeddedResizeTimer = setTimeout(() => {
      gptLastShowSignature = "";
      showEmbeddedGptView().catch(() => {});
    }, 140);
  });
  $("#workbenchOpenTemplateBtn")?.addEventListener("click", () => selectedTemplate && openPath(selectedTemplate.path));
  $("#workbenchSavePromptBtn")?.addEventListener("click", () => {
    if (!selectedTemplate) return;
    localStorage.setItem(workbenchStorageKey("prompt"), $("#workbenchPromptEditor").value);
    $("#workbenchPromptVersion").textContent = `已保存 · ${new Date().toLocaleString("zh-CN", { hour12: false })}`;
    toast("当前模板规则已保存");
  });
  $("#workbenchSendRequirementBtn")?.addEventListener("click", () => {
    const input = $("#workbenchConversationInput");
    const text = input?.value.trim();
    if (!text || !selectedTemplate) return;
    const messages = readTemplateConversation();
    messages.push({ role: "user", text, time: new Date().toLocaleString("zh-CN", { hour12: false }) });
    messages.push({ role: "system", text: "已加入本次生产要求；生成计划时会和模板规则一起执行。", time: "系统" });
    writeTemplateConversation(messages);
    input.value = "";
    renderWorkbenchConversation();
  });
  $("#workbenchStartProductionBtn")?.addEventListener("click", () => {
    if (activeProductionPlan) {
      confirmProductionPlan();
      return;
    }
    const firstPath = [...workbenchSelectedMaterials][0];
    const entry = dashboard.materials.categories
      .flatMap((category) => (category.items || []).map((item) => ({ item, category })))
      .find(({ item }) => item.path === firstPath);
    if (entry) selectMaterial(entry.item, entry.category, { keepFeed: true });
    syncWorkbenchProductionSettings();
    createProductionPlan();
  });
  $("#workbenchEditPlanBtn")?.addEventListener("click", () => {
    invalidateProductionPlan();
    setProductionLiveStatus("已返回调整。修改页数、质量或本批要求后，再点击开始生产。", "", 0, "等待调整");
  });
  $("#workbenchRefreshProductsBtn")?.addEventListener("click", () => loadProductionWorkspace().catch((error) => showSystemNotice("成品库刷新失败", error.message, { tone: "danger" })));
  $("#workbenchPackBtn")?.addEventListener("click", () => packSelectedProductionWorks().catch((error) => showSystemNotice("没有完成打包", error.message, { tone: "danger" })));
  $("#checkAppUpdateBtn")?.addEventListener("click", async () => {
    const previousVersion = dashboard?.appInfo?.version || "未知";
    await loadDashboard(true);
    const currentVersion = dashboard?.appInfo?.version || previousVersion;
    showSystemNotice("版本检查完成", `当前已安装 v${currentVersion}，发布包目录可直接打开核对。`, { tone: "success" });
  });
  $("#openReleaseRootBtn")?.addEventListener("click", () => openPath(dashboard?.appInfo?.releaseRoot));
  $("#openRuntimeRootBtn")?.addEventListener("click", () => openPath(dashboard?.appInfo?.runtimeRoot));
  $("#copyDiagnosticsBtn")?.addEventListener("click", () => copyText(buildDiagnosticsText(), "诊断信息已复制"));
  $("#syncDedupHistoryBtn")?.addEventListener("click", async () => {
    try {
      await loadDedupStatus(true);
      toast("生产历史与分发记录已同步");
    } catch (error) {
      showSystemNotice("历史数据没有同步", error.message, { tone: "danger" });
    }
  });
  $("#openDedupRootBtn")?.addEventListener("click", async () => {
    const info = dedupInfo || await loadDedupStatus();
    await openPath(info.dataRoot);
  });
  $("#exportDedupLedgerBtn")?.addEventListener("click", () => {
    const anchor = document.createElement("a");
    anchor.href = "/api/dedup/export";
    anchor.download = "teambuilding-dedup-ledger.json";
    anchor.click();
  });
  $("#openExtensionRootBtn")?.addEventListener("click", async () => {
    try {
      const info = await api("/api/extension/info");
      await openPath(info.path);
    } catch (error) {
      showSystemNotice("扩展目录没有打开", error.message, { tone: "danger" });
    }
  });
  $("#copyExtensionAddressBtn")?.addEventListener("click", async () => {
    const info = await api("/api/extension/info");
    copyText(info.path, "扩展安装地址已复制");
  });
  $("#overviewRefreshBtn")?.addEventListener("click", async () => {
    await loadDashboard(true);
    activateTab("overview");
    toast("已刷新真实状态");
  });
  $("#distributionRefreshBtn")?.addEventListener("click", async () => {
    await checkDistributionDevices();
  });
  $("#openPublishRootBtn")?.addEventListener("click", () => openPath(dashboard?.distribution?.workflowRoot || dashboard?.distribution?.libraryRoot));
  $("#workbenchAssistantLauncher")?.addEventListener("click", () => {
    if (Date.now() < assistantSuppressClickUntil) return;
    toggleWorkbenchAssistant();
  });
  $("#workbenchAssistantBubble")?.addEventListener("click", (event) => event.preventDefault());
  $("#workbenchAssistantBubble")?.addEventListener("contextmenu", openWorkbenchAssistantMuteMenu);
  $("#closeWorkbenchAssistantLog")?.addEventListener("click", () => openWorkbenchAssistantLog(false));
  document.querySelectorAll("[data-assistant-mute]").forEach((button) => button.addEventListener("click", () => {
    muteWorkbenchAssistant(Number(button.dataset.assistantMute || 1));
  }));
  document.addEventListener("pointerdown", (event) => {
    const menu = $("#workbenchAssistantMuteMenu");
    if (!menu || menu.hidden || menu.contains(event.target)) return;
    menu.hidden = true;
  });
  $("#closeWorkbenchAssistant")?.addEventListener("click", () => toggleWorkbenchAssistant(false));
  $("#runWorkbenchAssistantCommand")?.addEventListener("click", async () => {
    const input = $("#workbenchAssistantCommand");
    const command = input?.value || "";
    if (input) input.value = "";
    await executeWorkbenchAssistantCommand(command);
  });
  $("#workbenchAssistantCommand")?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const command = event.currentTarget.value;
    event.currentTarget.value = "";
    await executeWorkbenchAssistantCommand(command);
  });
  $("#refreshJuguangBtn")?.addEventListener("click", async () => {
    await loadJuguang(true);
    toast("聚光数据已刷新");
  });
  $("#juguangKeywordSearch")?.addEventListener("input", renderJuguangRecommendations);
  $("#pluginMarketSearch")?.addEventListener("input", renderPluginMarket);
  $("#importLifeGameCloudBtn")?.addEventListener("click", importLifeGameCloudConfig);
  $("#saveCloudBackupConfigBtn")?.addEventListener("click", saveCloudBackupConfig);
  $("#testCloudBackupBtn")?.addEventListener("click", testCloudBackup);
  $("#runCloudBackupBtn")?.addEventListener("click", runCloudBackup);
  $("#inspectCloudBackupBtn")?.addEventListener("click", inspectCloudBackup);
  $("#restoreCloudBackupBtn")?.addEventListener("click", restoreCloudBackup);
  $("#runLargeCloudBackupBtn")?.addEventListener("click", runLargeCloudBackup);
  $("#chooseCloudBackupSourceBtn")?.addEventListener("click", async () => {
    try {
      const selectedPath = await chooseFolder("选择需要增量备份的方案文件夹");
      if (!selectedPath) return;
      $("#cloudBackupSourceRoot").value = selectedPath;
      await saveBackupSettingsFromUi();
    } catch (error) {
      showSystemNotice("备份来源没有保存", error.message, { tone: "danger" });
    }
  });
  ["#cloudBackupScheduleEnabled", "#cloudBackupFrequency", "#cloudBackupIntervalHours", "#cloudBackupMonthlyLimitMb"]
    .forEach((selector) => $(selector)?.addEventListener("change", () =>
      saveBackupSettingsFromUi().catch((error) => showSystemNotice("备份设置没有保存", error.message, { tone: "danger" }))
    ));
  $("#cloudBackupSourceRoot")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.blur();
  });
  $("#cloudBackupSourceRoot")?.addEventListener("blur", () =>
    saveBackupSettingsFromUi().catch((error) => showSystemNotice("备份来源没有保存", error.message, { tone: "danger" }))
  );

  $("#materialLibraryFilter").addEventListener("change", async () => {
    const libraryPath = $("#materialLibraryFilter").value;
    saveLocalState({ selectedMaterialCategoryPath: libraryPath, selectedMaterial: "" });
    await loadDashboard(false, libraryPath);
    toast("已切换素材库");
  });
  $("#materialQuickSelect").addEventListener("change", () => {
    const entry = getVisibleMaterialEntries().find(({ item }) => item.id === $("#materialQuickSelect").value)
      || dashboard.materials.categories
        .flatMap((category) => category.items.map((item) => ({ item, category })))
        .find(({ item }) => item.id === $("#materialQuickSelect").value);
    if (entry) selectMaterial(entry.item, entry.category);
    toast("已切换素材");
  });
  $("#materialSearch").addEventListener("input", () => {
    renderMaterialQuickSelect();
    renderMaterials();
    const firstEntry = getVisibleMaterialEntries()[0];
    if (firstEntry) selectMaterial(firstEntry.item, firstEntry.category);
  });
  $("#templateQuickSelect").addEventListener("change", async () => {
    const template = dashboard.templates.templates.find((item) => item.id === $("#templateQuickSelect").value);
    if (template) {
      selectTemplate(template);
      const state = { ...getSavedState(), selectedTemplate: template.id };
      await api("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state)
      }).catch(() => {});
      await loadDashboard(false, $("#materialLibraryFilter")?.value || "");
    }
    toast("已切换模板");
  });
  $("#productSearch").addEventListener("input", renderProducts);
  $("#productTemplateFilter").addEventListener("change", () => {
    selectedProductGroup = dashboard.products.groups.find((group) => group.path === $("#productTemplateFilter").value) || null;
    selectedProductWork = null;
    renderProducts();
    toast("已切换成品模板");
  });
  $("#productWorkFilter").addEventListener("change", () => {
    const entry = getVisibleProductWorks().find(({ work }) => work.id === $("#productWorkFilter").value);
    if (entry) selectProductWork(entry.work, entry.group);
    toast("已切换成品");
  });
  $("#productWorkQuickSelect").addEventListener("change", () => {
    const entry = getVisibleProductWorks().find(({ work }) => work.id === $("#productWorkQuickSelect").value);
    if (entry) selectProductWork(entry.work, entry.group, { keepFeed: true });
    toast("已切换成品");
  });

  $$(".tab").forEach((tab) => tab.addEventListener("click", () => activateTab(tab.dataset.tab)));
  $$("[data-conversion-module]").forEach((button) => button.addEventListener("click", () => {
    conversionModule = button.dataset.conversionModule;
    conversionResult = null;
    conversionActiveStageIndex = 0;
    renderConversionHub();
  }));
  $("#conversionMobileEntryBtn")?.addEventListener("click", copyMobileConversionEntry);

  $("#openProjectBtn").addEventListener("click", () => openPath(dashboard.projectRoot));
  $("#openTemplateBtn").addEventListener("click", () => copyText(currentFocusFolder(), "当前路径已复制"));
  $("#copyMaterialBtn").addEventListener("click", () => openPath(currentFocusFolder()));
  $("#copyCommandBtn").addEventListener("click", () => copyText($("#commandBox").value, "生产指令已复制"));
  $("#viewCopyBtn").addEventListener("click", () => {
    if (!selectedMaterial) return;
    setFocusTextPreview("笔记文案", selectedMaterial.name, selectedMaterial.preview || "无文案预览");
  });
  $("#openProductBtn").addEventListener("click", () => selectedProductWork && openPath(selectedProductWork.path));
  $("#copyProductPathBtn").addEventListener("click", () => copyText(selectedProductWork?.path || "", "成品路径已复制"));
  $("#contextOpenFolder").addEventListener("click", () => {
    if (contextMenuTarget?.path) openPath(contextMenuTarget.path);
    hideContextMenu();
  });
  $("#contextCopyPath").addEventListener("click", () => {
    copyText(contextMenuTarget?.path || "", "目录地址已复制");
    hideContextMenu();
  });
  $("#contextRename").addEventListener("click", async () => {
    const target = contextMenuTarget;
    hideContextMenu();
    if (target?.kind === "gpt-browser-profile") {
      await renameGptAccount(target.accountId);
      return;
    }
    if (target?.kind === "gpt-production-mode") {
      const key = activeGptModeKey(target.mode);
      const current = gptModeProfiles[key]?.name || GPT_MODE_DEFINITIONS[key].defaultName;
      const next = window.prompt("重命名当前生产模式", current);
      if (next === null) return;
      const clean = String(next).trim();
      if (!clean) return showSystemNotice("模式名称没有保存", "名称不能为空。", { tone: "warning" });
      gptModeProfiles[key] = { ...(gptModeProfiles[key] || {}), name: clean.slice(0, 40) };
      saveGptModeProfiles();
      renderGptModeProfile();
      showWorkbenchAssistantBubble(`当前模式已重命名为“${clean.slice(0, 40)}”。`, { duration: 3600 });
      return;
    }
    await renamePath(target?.path, target?.label);
  });
  $("#contextToggleDisable")?.addEventListener("click", () => {
    const target = contextMenuTarget;
    hideContextMenu();
    if (target?.kind !== "gpt-browser-profile") return;
    toggleGptAccountDisabled(target.accountId);
  });
  $("#contextRemoveAccount")?.addEventListener("click", () => {
    const target = contextMenuTarget;
    hideContextMenu();
    if (target?.kind !== "gpt-browser-profile") return;
    removeGptAccount(target.accountId);
  });
  $("#contextModeSettings")?.addEventListener("click", async () => {
    const target = contextMenuTarget;
    hideContextMenu();
    if (target?.kind === "gpt-browser-profile") {
      await switchGptAccount(target.accountId, { silent: true, resumeWindow: false });
      renderGptAutoSettings();
      openPageSettings("gptAuto");
      showWorkbenchAssistantBubble(`${gptAccounts.find((item) => item.id === target.accountId)?.name || "当前账号窗口"} 的生产模式与额度设置已打开。`, { duration: 4200 });
      return;
    }
    if (target?.kind !== "gpt-production-mode") return;
    const key = activeGptModeKey(target.mode);
    if ($("#gptProductionMode")) $("#gptProductionMode").value = key;
    applyGptModeProfile(key);
    renderGptAutoSettings();
    openPageSettings("gptAuto");
    showWorkbenchAssistantBubble(`已打开“${gptModeProfiles[key]?.name || GPT_MODE_DEFINITIONS[key].defaultName}”的专属设置。每个模式的确认词、文案请求词和起始环节互不影响。`, { duration: 5200 });
  });
  $("#contextDeleteMode")?.addEventListener("click", () => {
    const target = contextMenuTarget;
    hideContextMenu();
    if (target?.kind !== "gpt-production-mode") return;
    const key = activeGptModeKey(target.mode);
    if (!window.confirm(`删除“${gptModeProfiles[key]?.name || GPT_MODE_DEFINITIONS[key].defaultName}”的自定义设置？系统内置模式不会被删除。`)) return;
    gptModeProfiles[key] = {
      name: GPT_MODE_DEFINITIONS[key].defaultName,
      useCurrentSession: true,
      confirmText: "1",
      copyPrompt: GPT_PUBLISH_COPY_PROMPT,
      steps: defaultGptWorkflowSteps()
    };
    saveGptModeProfiles();
    applyGptModeProfile(key);
    renderGptAutoSettings();
    showWorkbenchAssistantBubble("当前模式的自定义设置已删除，已恢复默认流程。", { duration: 3600 });
  });
  $("#contextCopyTemplateCommand").addEventListener("click", () => {
    copyText(buildTemplateCommand(contextMenuTarget), "转模板指令已复制");
    hideContextMenu();
  });
  $("#copyContinueBtn")?.addEventListener("click", () => copyText("继续：使用模板1 T01，处理素材库1 信息流素材，从未完成/未制作处续接，每轮最多约40张图。", "继续指令已复制"));
  $("#collectFilteredBtn")?.addEventListener("click", () => collectFilteredMaterials().catch((error) => toast(error.message || "整合失败")));
  $("#copyContinueTopBtn")?.addEventListener("click", () => copyText("继续：使用模板1 T01，处理素材库1 信息流素材，从未完成/未制作处续接，每轮最多约40张图。", "继续指令已复制"));
  $("#openProjectTopBtn")?.addEventListener("click", () => openPath(dashboard.projectRoot));

  $("#promptVersion").addEventListener("change", renderPromptVersion);
  $(".preview-copy-block")?.addEventListener("click", () => {
    if (!selectedMaterial) return;
    setFocusTextPreview("素材文案/信息源", selectedMaterial.name, selectedMaterial.preview || "无文案预览");
  });
  $("#copyPromptBtn").addEventListener("click", () => copyText($("#promptContent").value, "提示词已复制"));
  $("#savePromptBtn").addEventListener("click", async () => {
    if (!selectedPrompt) return;
    const version = `V${selectedPrompt.versions.length + 1}`;
    dashboard.prompts = await api("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selectedPrompt.id, version, content: $("#promptContent").value })
    });
    selectedPrompt = dashboard.prompts.prompts.find((item) => item.id === selectedPrompt.id);
    renderPrompts();
    selectPrompt(selectedPrompt);
    toast(`已保存 ${version}`);
  });

}

bindEvents();
if (window.gptWorkbench?.assistantOverlay) document.body.classList.add("native-assistant-overlay");
// Keep the lightweight address bar in sync with navigation that happens
// inside the embedded WebContentsView. Clicking a GPT conversation or an
// online template does not call navigateEmbeddedGpt(), so polling only on tab
// switches would leave the old URL visible until the next refresh.
window.gptWorkbench?.onUrlChanged?.((input = {}) => {
  const accountId = String(input.accountId || "");
  if (accountId && accountId !== activeGptAccountId) return;
  syncGptBrowserAddress(String(input.url || ""));
});
window.gptWorkbench?.onAssistantAction?.((input = {}) => {
  if (input.type === "chat") toggleWorkbenchAssistant();
  if (input.type === "mute") muteWorkbenchAssistant(Number(input.minutes || 1));
});
window.gptWorkbench?.onPauseProduction?.(() => {
  if (!gptAutoRunning) return;
  gptAutoPaused = true;
  showWorkbenchAssistantBubble("已从系统托盘请求暂停，当前阶段结束后会停在安全检查点。", { duration: 0 });
  updateGptTestQueueStatus("将在当前阶段安全结束后暂停");
});
window.gptWorkbench?.onWindowRestored?.(() => {
  if (!$("#gptProductionTestView")?.classList.contains("active")) return;
  restoreEmbeddedGptView();
});
bindPaneResizers();
window.addEventListener("message", (event) => {
  if (event.origin === window.location.origin && event.data?.type === "tb-workbench-quota-updated") {
    const quotaId = String(event.data.accountId || "");
    const accountId = String(gptAccounts.find((item) => item.id === quotaId || item.quotaGroup === quotaId)?.id || quotaId);
    const quota = event.data.quota;
    if (accountId && quota) {
      const snapshot = { accountId, status: quota };
      gptQuotaSnapshots.set(accountId, snapshot);
      if (accountId === String(activeGptAccountId)) {
        gptQuotaSnapshot = snapshot;
        updateGptAssistantBubble();
      }
    }
    return;
  }
  if (event.origin !== window.location.origin || event.data?.type !== "jianghu-theme-ready") return;
  syncConversionTheme();
});
window.addEventListener("desktop-gpt-transfer-result", (event) => {
  const result = event.detail || {};
  if (!result.ok) {
    showSystemNotice("素材没有放入 ChatGPT", result.detail || result.error || "请打开一个 ChatGPT 对话后重试", { tone: "danger" });
    return;
  }
  toast(result.filesAttached
    ? `已放入 ${result.fileCount} 个文件和生产指令，请在右侧确认发送`
    : "生产指令已填入；请打开一个对话后再次点击传 GPT 上传文件");
});
const themeDefaultVersion = "jianghu-workbench-four-themes-v2";
const storedThemeDefaultVersion = localStorage.getItem("tb-dashboard-theme-default-version");
const systemPrefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches === true;
const storedThemeMode = localStorage.getItem("tb-dashboard-theme-mode") || "system";
const initialTheme = storedThemeMode === "system"
  ? (systemPrefersDark ? "midnight" : "neo")
  : storedThemeDefaultVersion === themeDefaultVersion
    ? (localStorage.getItem("tb-dashboard-theme") || "neo")
    : "neo";
localStorage.setItem("tb-dashboard-theme-default-version", themeDefaultVersion);
applyTheme(initialTheme, { persist: storedThemeMode !== "system" });
window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", (event) => {
  if ((localStorage.getItem("tb-dashboard-theme-mode") || "system") !== "system") return;
  applyTheme(event.matches ? "midnight" : "neo", { persist: false });
});
loadDashboard()
  .then(async () => {
    await hydrateGptBrowserProfiles();
    restoreGptQueue();
    await syncGptProductionHistory();
    renderGptProductionHistory();
    const latestProduction = [...gptProductionHistory].sort((left, right) => {
      const rightTime = Date.parse(String(right.finishedAt || right.updatedAt || right.startedAt || "")) || 0;
      const leftTime = Date.parse(String(left.finishedAt || left.updatedAt || left.startedAt || "")) || 0;
      return rightTime - leftTime;
    })[0];
    if (latestProduction?.status === "completed") {
      showWorkbenchAssistantBubble(`${latestProduction.name} 已完成${latestProduction.packagePath ? " · 成品已打包，点击“查看生产记录”可直接打开文件夹" : ""}`, { duration: 0, persistent: true });
    } else if (latestProduction?.status === "failed") {
      showWorkbenchAssistantBubble(`${latestProduction.name} 生产失败并已记录${latestProduction.error ? `：${latestProduction.error}` : ""}`, { duration: 0, persistent: true, tone: "danger" });
    }
    renderPluginMarket();
    installPageHelpButtons();
    restoreTransferTasks();
    if (!deviceScanStarted) checkDistributionDevices({ silent: true, refreshInventory: false });
    window.setInterval(() => {
      if (!deviceScanRunning) checkDistributionDevices({ silent: true, refreshInventory: false });
    }, 20_000);
    window.setInterval(checkScheduledGptProduction, 30_000);
    checkScheduledGptProduction();
    restoreGptQuotaProbeTimers();
    restoreGptTemporaryCacheMaintenanceTimers();
    if (isContinuousGptMode()
      && gptAutoSettings.continuousAutoStart !== false
      && !gptQueuePaused
      && !currentGptQueueIntegrityBlock()) {
      setContinuousGptProductionArmed(true);
      scheduleContinuousGptProduction(1800);
    } else {
      // A previous continuous/rotation session may have left the durable arm
      // bit behind.  The restored per-window mode is authoritative: manual,
      // one-shot and single-account modes must never inherit that scheduler.
      if (!isContinuousGptMode()) {
        setContinuousGptProductionArmed(false);
        clearTimeout(gptContinuousLaunchTimer);
        gptContinuousLaunchTimer = null;
      }
      if (gptQueuePaused) {
        showWorkbenchAssistantBubble("发现未完成的单帖队列，已停在安全检查点；点击“继续”后才会恢复，不会自动上传下一帖。", { duration: 0, tone: "warning" });
      }
    }
    window.gptWorkbench?.setLaunchAtLogin?.(gptAutoSettings.launchAtLogin !== false).catch(() => {});
    window.addEventListener("online", () => {
      if (isContinuousGptProductionArmed()) scheduleContinuousGptProduction(1500);
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && isContinuousGptProductionArmed()) scheduleContinuousGptProduction(1500);
    });
    window.setInterval(() => {
      if (isContinuousGptProductionArmed() && !gptAutoRunning && !gptAutoPaused) {
        scheduleContinuousGptProduction(1500);
      }
    }, 60_000);
    window.setInterval(() => refreshExpandedGptMaterialTrees().catch(() => {}), 15_000);
    let lastMaterialStaleTime = dashboard?.materialCacheStaleTime || 0;
    window.setInterval(() => {
      if (document.hidden) return;
      const activeView = $(".view.active")?.id || "";
      if (!["dashboardView", "distributionView", "gptProductionTestView"].includes(activeView)) return;
      fetch("/api/dashboard")
        .then((r) => r.json())
        .then((data) => {
          const staleTime = data?.materialCacheStaleTime || 0;
          if (staleTime > lastMaterialStaleTime) {
            lastMaterialStaleTime = staleTime;
            loadDashboard("materials").catch(() => {});
          }
        })
        .catch(() => {});
    }, 8_000);
    startGptQuotaUsageRefresh();
    window.setInterval(() => {
      window.gptWorkbench?.releaseIdle?.(gptAutoSettings.idleUnloadMinutes || 30).catch(() => {});
    }, 5 * 60_000);
  })
  .catch((error) => {
    console.error(error);
    toast("读取本地库失败");
    // Even if loadDashboard failed, still hydrate GPT profiles from the
    // main process so account tabs are not lost when localStorage is empty.
    hydrateGptBrowserProfiles().catch(() => {});
  });

// Independent safety-net: hydrate GPT profiles shortly after load regardless
// of loadDashboard outcome.  This covers the race where the renderer starts
// before the server is ready, or when localStorage was cleared (e.g. during
// cookie cleanup) and the .then() chain never runs.
window.setTimeout(() => {
  hydrateGptBrowserProfiles().catch(() => {});
}, 2000);
window.setTimeout(() => {
  hydrateGptBrowserProfiles().catch(() => {});
}, 5000);
  $("#contextTrashFolder")?.addEventListener("click", async () => {
    const target = contextMenuTarget;
    hideContextMenu();
    if (!target?.path || !window.confirm(`确定把“${target.label || "这个文件夹"}”移到 Windows 回收站吗？可从回收站恢复。`)) return;
    try {
      await api("/api/trash-workspace-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: target.path })
      });
      gptTestSelectedMaterials.delete(target.path);
      gptTestMaterialEntries.delete(target.path);
      showWorkbenchAssistantBubble("文件夹已移到 Windows 回收站。", { duration: 0 });
      await loadDashboard(true);
      renderGptTestMaterials();
    } catch (error) {
      showWorkbenchAssistantBubble(`删除失败：${error.message}`, { duration: 0 });
    }
  });
  $("#contextSetFolder")?.addEventListener("click", async () => {
    const target = contextMenuTarget;
    hideContextMenu();
    if (target?.kind !== "folder-binding") return;
    try {
      const selectedPath = await chooseFolder(`选择「${target.label}」关联文件夹`);
      if (!selectedPath) return;
      workbenchFolderBindings[target.bindingKey] = selectedPath;
      if (target.bindingKey === "output-packed" && $("#productionPackedRoot")) {
        $("#productionPackedRoot").value = selectedPath;
      }
      await savePageSettingsFromUi("production");
      if (target.bindingKey === "output-packed") await loadProductionWorkspace();
      toast(`「${target.label}」关联文件夹已保存`);
    } catch (error) {
      showSystemNotice("关联文件夹没有保存", error.message, { tone: "danger" });
    }
  });

// === Diagnostic & Auto-Recovery System ===
// Expose diagnostic function on window for external debugging
window.tbGptDiagnostic = async function(accountId = activeGptAccountId) {
  if (!window.gptWorkbench?.diagnostic) {
    return { ok: false, error: "diagnostic method not available in this version" };
  }
  try {
    const result = await window.gptWorkbench.diagnostic(accountId);
    console.log("[TB Diagnostic]", JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    return { ok: false, error: error.message, accountId };
  }
};

// Auto-retry: when productionReady fails, wait and retry instead of pausing
let gptProductionRetryTimer = null;
let gptProductionRetryCount = 0;
const GPT_PRODUCTION_MAX_RETRIES = 3;
const GPT_PRODUCTION_RETRY_DELAY = 30_000;

function scheduleGptProductionRetry(accountId, attempt = 1) {
  if (gptProductionRetryTimer) return;
  gptProductionRetryCount = attempt;
  const accountName = gptAccounts.find((item) => item.id === accountId)?.name || accountId;
  showWorkbenchAssistantBubble(
    `${accountName} 尚未就绪，${GPT_PRODUCTION_RETRY_DELAY / 1000} 秒后自动重试 (第 ${attempt}/${GPT_PRODUCTION_MAX_RETRIES} 次)...`,
    { duration: GPT_PRODUCTION_RETRY_DELAY, tone: "info" }
  );
  gptProductionRetryTimer = setTimeout(async () => {
    gptProductionRetryTimer = null;
    const preflight = await window.gptWorkbench.status(accountId).catch(() => null);
    if (preflight?.productionReady) {
      gptProductionRetryCount = 0;
      showWorkbenchAssistantBubble(`${accountName} 已就绪，自动恢复生产。`, { duration: 3000, tone: "success" });
      gptQueuePaused = false;
      persistGptQueue();
      sendNextGptTestTask({ userInitiated: false, continuousResume: true }).catch(() => {});
    } else if (attempt < GPT_PRODUCTION_MAX_RETRIES) {
      scheduleGptProductionRetry(accountId, attempt + 1);
    } else {
      gptProductionRetryCount = 0;
      const reasons = preflight?.notReadyReasons || [];
      const reason = preflight?.authenticationRequired
        ? `${accountName}需要先完成登录或验证码`
        : reasons.length
          ? `${accountName}未就绪: ${reasons.join("; ")}`
          : `${accountName}的生产助手尚未就绪`;
      gptQueuePaused = true;
      persistGptQueue();
      updateGptTestQueueStatus(reason);
      showWorkbenchAssistantBubble(`${reason}；已暂停，请手动处理后再继续。`, { duration: 0, tone: "warning" });
    }
  }, GPT_PRODUCTION_RETRY_DELAY);
}

// Queue auto-recovery lives in an isolated controller so readiness checks can
// be tested without loading the entire renderer. The controller deliberately
// awaits a second status check before it resumes a persisted queue.
const gptRuntimeRecoveryController = window.TBGptRuntimeRecovery?.createController({
  getActiveAccountId: () => activeGptAccountId,
  getState: () => ({
    queuePaused: gptQueuePaused,
    autoRunning: gptAutoRunning,
    autoPaused: gptAutoPaused,
    continuousMode: isContinuousGptMode(),
    continuousArmed: isContinuousGptProductionArmed(),
    retryPending: Boolean(gptProductionRetryTimer),
    windowStopped: gptWindowIsUserStopped(activeGptAccountId),
    windowPaused: gptWindowIsUserPaused(activeGptAccountId)
  }),
  status: (accountId) => window.gptWorkbench?.status?.(accountId),
  setQueuePaused: (value) => { gptQueuePaused = Boolean(value); },
  resetRetryCount: () => { gptProductionRetryCount = 0; },
  persistQueue: () => persistGptQueue(),
  showBubble: (message, options) => showWorkbenchAssistantBubble(message, options),
  sendNext: (options) => sendNextGptTestTask(options)
});
window.setInterval(() => {
  gptRuntimeRecoveryController?.checkPausedQueue().catch(() => {});
}, 120_000);
