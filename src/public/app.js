let dashboard = null;
let selectedMaterial = null;
let selectedMaterialCategory = null;
let selectedTemplate = null;
let selectedPrompt = null;
let selectedProductGroup = null;
let selectedProductWork = null;
let focusTarget = null;
let contextMenuTarget = null;
let productsRendered = false;
let logsRendered = false;
let juguangRendered = false;
let juguangData = null;
let materialRenderLimit = 12;
let productRenderLimit = 8;
let collectionFilters = { stage: "mobile" };
let activeDistributionPanel = "devices";
let distributionSummaryFilter = "devices";
let distributionCollectionTypeFilter = "traffic";
let selectedDistributionCollectionName = "";
let selectedDistributionDeviceId = "";
let packageDevicePickerCollectionName = "";
let uploadChoiceDeviceId = "";
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
let selectedProductionMode = "one";
let activeProductionPlan = null;
let activeProductionJobId = "";
let productionJobPollTimer = null;
const expandedMaterialPaths = new Set();
const expandedCollectionNames = new Set();
let materialTreeInitialized = false;
let materialTreeView = window.localStorage.getItem("materialTreeView") === "icons" ? "icons" : "list";
let collectionViewMode = window.localStorage.getItem("collectionViewMode") === "grid" ? "grid" : "list";

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
  const response = await fetch(path, options);
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

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 1800);
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
    <small>${task ? nextLine : (history ? `可验证历史：${escapeHtml(history["素材标题"] || history["素材ID"] || "同模板记录")}` : (missing.length ? `待补：${escapeHtml(missing.join("、"))}` : "先写出图计划，再按 V3.6 母版规则生成。"))}</small>
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
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.classList.add("show");
}

function hideContextMenu() {
  $("#contextMenu")?.classList.remove("show");
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
      contextMenuTarget = {
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

async function loadDashboard(force = false, libraryPath = "") {
  const params = new URLSearchParams();
  if (force) params.set("refresh", force === "materials" ? "materials" : "1");
  if (libraryPath) params.set("library", libraryPath);
  const query = params.toString();
  dashboard = await api(`/api/dashboard${query ? `?${query}` : ""}`);
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
  renderPrompts();
  renderWorkspaceSettings();
  if ($("#overviewView")) renderOverview();
  restoreSelection();
}

function openSystemDialog(options = {}) {
  return new Promise((resolve) => {
    document.querySelector(".system-dialog-backdrop")?.remove();
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
  const imageApiReady = Boolean(settings.imageApi?.baseUrl && settings.imageApi?.model && settings.imageApi?.credentialConfigured);
  if ($("#settingsImageApiStatus")) $("#settingsImageApiStatus").textContent = imageApiReady ? "凭据已连接" : settings.imageApi?.baseUrl ? "等待本机密钥" : "待接入";
  if ($("#imageApiStatus")) $("#imageApiStatus").textContent = imageApiReady ? "生产引擎已就绪" : settings.imageApi?.baseUrl ? "等待本机密钥" : "生产引擎待连接";
  const appInfo = dashboard?.appInfo || {};
  if ($("#settingsVersion")) $("#settingsVersion").textContent = `v${appInfo.version || "未知"}`;
  if ($("#settingsVersionChannel")) $("#settingsVersionChannel").textContent = appInfo.channel || "本地便携版";
  if ($("#settingsVersionStatus")) $("#settingsVersionStatus").textContent = appInfo.desktop ? "桌面版运行中" : "浏览器预览中";
  if ($("#settingsDiagnosticsSummary")) {
    $("#settingsDiagnosticsSummary").textContent = `运行数据：${appInfo.runtimeRoot || "未识别"}`;
  }
}

function currentImageApiPayload() {
  return {
    provider: $("#productionApiProvider")?.value || "local-openai",
    baseUrl: $("#productionApiBaseUrl")?.value || "",
    model: $("#productionApiModel")?.value || "",
    apiKey: $("#productionApiKey")?.value || ""
  };
}

function setProductionLiveStatus(message, tone = "") {
  const status = $("#productionLiveStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `production-live-status${tone ? ` ${tone}` : ""}`;
}

async function saveProductionApi() {
  const payload = currentImageApiPayload();
  const result = await api("/api/image-api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if ($("#productionApiKey")) $("#productionApiKey").value = "";
  dashboard.workspaceSettings.imageApi = result.imageApi;
  renderWorkspaceSettings();
  setProductionLiveStatus(`${result.imageApi.model} 已保存到本机安全凭据区。`);
}

async function testProductionApi() {
  setProductionLiveStatus("正在核对接口与模型……", "running");
  try {
    const result = await api("/api/image-api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentImageApiPayload())
    });
    setProductionLiveStatus(result.modelAvailable ? "连接成功，当前模型可用。" : "接口已连接，但模型列表里没有当前模型。", result.modelAvailable ? "" : "error");
  } catch (error) {
    setProductionLiveStatus(error.message, "error");
  }
}

function renderProductionOutputs(result) {
  const grid = $("#productionOutputGrid");
  if (!grid) return;
  grid.innerHTML = (result.results || []).map((item, index) => `
    <button class="production-output-card${item.type === "copy" ? " copy-output-card" : ""}" type="button" data-output-path="${escapeHtml(item.outputFile)}">
      ${item.type === "copy"
        ? `<div class="copy-output-icon">文案</div>`
        : `<img src="${escapeHtml(item.previewUrl)}" alt="待审图 ${index + 1}" />`}
      <span>${escapeHtml(item.page || item.work || "结果")} · ${item.type === "copy" ? "小红书文案" : `${item.width || "?"}×${item.height || "?"}`}</span>
    </button>
  `).join("");
  grid.querySelectorAll("[data-output-path]").forEach((button) => button.addEventListener("click", () => openPath(button.dataset.outputPath)));
}

function productionModeLabel(mode = selectedProductionMode) {
  return ({ one: "做一张", set: "做一套", batch: "批量做" })[mode] || "做一套";
}

function renderProductionMode() {
  $$("[data-production-mode]").forEach((button) => button.classList.toggle("active", button.dataset.productionMode === selectedProductionMode));
  if ($("#onePageTypeField")) $("#onePageTypeField").hidden = selectedProductionMode !== "one";
  if ($("#batchWorksField")) $("#batchWorksField").hidden = selectedProductionMode !== "batch";
  if ($("#productionPageCount")) $("#productionPageCount").disabled = selectedProductionMode === "one";
  const button = $("#createProductionPlanBtn");
  if (button) button.textContent = selectedProductionMode === "one"
    ? "开始做这一张"
    : selectedProductionMode === "set"
    ? "生成整套作品"
    : "开始批量生产";
}

function invalidateProductionPlan() {
  if (activeProductionJobId) return;
  activeProductionPlan = null;
  if ($("#productionPlanPanel")) {
    $("#productionPlanPanel").hidden = true;
    $("#productionPlanPanel").innerHTML = "";
  }
  if ($("#cancelProductionPlanBtn")) $("#cancelProductionPlanBtn").hidden = true;
}

function currentBatchMaterialPaths() {
  const count = Number($("#batchWorksCount")?.value || 2);
  const entries = getVisibleMaterialEntries().map(({ item }) => item);
  const selectedIndex = entries.findIndex((item) => item.id === selectedMaterial?.id);
  if (selectedIndex < 0) return selectedMaterial?.path ? [selectedMaterial.path] : [];
  return entries.slice(selectedIndex, selectedIndex + count).map((item) => item.path);
}

function renderProductionPlan(planBundle) {
  const panel = $("#productionPlanPanel");
  if (!panel) return;
  const workSections = planBundle.plans.map((plan) => `
    <article class="production-plan-work">
      <header><strong>${escapeHtml(plan.materialName)}</strong><span>${plan.pageCount} 张独立图片${planBundle.mode === "one" ? "" : " + 文案"}</span></header>
      <p>套用：${escapeHtml(plan.recipe.name)}</p>
      <div class="production-plan-pages">${plan.pages.map((page) => `<span><b>${escapeHtml(page.code)}</b>${escapeHtml(page.title)} · ${escapeHtml(page.roleLabel)}</span>`).join("")}</div>
    </article>
  `).join("");
  panel.hidden = false;
  panel.innerHTML = `
    <div class="production-plan-title">
      <div><small>系统已经按聊天记录中的规则拆好</small><h3>确认这次生产计划</h3></div>
      <strong>${planBundle.totals.works} 套 · ${planBundle.totals.images} 张图 · ${planBundle.totals.copyFiles} 份文案</strong>
    </div>
    ${workSections}
    <div class="production-plan-safeguards">
      ${(planBundle.plans[0]?.safeguards || []).map((item) => `<span>✓ ${escapeHtml(item)}</span>`).join("")}
    </div>
    <div class="production-actions">
      <button id="confirmProductionPlanBtn" class="primary-button production-main-button" type="button">确认，开始生产</button>
      <button id="editProductionPlanBtn" type="button">返回修改</button>
    </div>
  `;
  $("#confirmProductionPlanBtn")?.addEventListener("click", confirmProductionPlan);
  $("#editProductionPlanBtn")?.addEventListener("click", () => {
    invalidateProductionPlan();
    setProductionLiveStatus("已返回选择。修改生产方式、页数或额外要求后，再点击开始。");
  });
}

async function createProductionPlan() {
  if (!selectedMaterial || !selectedTemplate) {
    setProductionLiveStatus("请先从素材库和模板库各选择一项。", "error");
    return;
  }
  const materialPaths = selectedProductionMode === "batch" ? currentBatchMaterialPaths() : [selectedMaterial.path];
  const expectedBatch = Number($("#batchWorksCount")?.value || 2);
  if (selectedProductionMode === "batch" && materialPaths.length < expectedBatch) {
    setProductionLiveStatus(`当前筛选从这条开始只剩 ${materialPaths.length} 套素材，请调小批量数量或换一条起点。`, "error");
    return;
  }
  setProductionLiveStatus("正在读取素材、模板和事实，生成可确认的出图计划……", "running");
  $("#createProductionPlanBtn").disabled = true;
  try {
    const result = await api("/api/production/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: selectedProductionMode,
        materialPath: selectedMaterial.path,
        materialPaths,
        templatePath: selectedTemplate.path,
        onePageType: $("#onePageType")?.value || "cover",
        requestedPages: $("#productionPageCount")?.value || "",
        textModel: $("#productionTextModel")?.value || "gpt-5.6-terra"
      })
    });
    activeProductionPlan = result.plan;
    renderProductionPlan(result.plan);
    if ($("#cancelProductionPlanBtn")) $("#cancelProductionPlanBtn").hidden = false;
    setProductionLiveStatus(`计划已生成：${result.plan.totals.works} 套、${result.plan.totals.images} 张独立图片。请看清页面清单后确认。`);
  } catch (error) {
    setProductionLiveStatus(error.message, "error");
  } finally {
    $("#createProductionPlanBtn").disabled = false;
  }
}

async function confirmProductionPlan() {
  if (!activeProductionPlan) {
    setProductionLiveStatus("计划已经失效，请重新生成。", "error");
    return;
  }
  $("#confirmProductionPlanBtn").disabled = true;
  setProductionLiveStatus("已确认计划，正在启动生产任务……", "running");
  try {
    const result = await api("/api/production/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...currentImageApiPayload(),
        planId: activeProductionPlan.id,
        confirmed: true,
        quality: $("#productionQuality")?.value || "严格母版",
        prompt: $("#productionPrompt")?.value || "",
        textModel: $("#productionTextModel")?.value || "gpt-5.6-terra"
      })
    });
    activeProductionJobId = result.job.id;
    renderProductionJob(result.job);
    startProductionJobPolling();
  } catch (error) {
    $("#confirmProductionPlanBtn").disabled = false;
    setProductionLiveStatus(error.message, "error");
  }
}

function renderProductionJob(job) {
  const percent = job.total ? Math.round((job.progress / job.total) * 100) : 0;
  const suffix = job.status === "running" ? ` · ${job.progress}/${job.total} 张（${percent}%）` : "";
  setProductionLiveStatus(`${job.message || "正在生产"}${suffix}`, job.status === "failed" ? "error" : job.status === "running" ? "running" : "");
  renderProductionOutputs(job);
  if (job.status === "review-ready") {
    activeProductionJobId = "";
    activeProductionPlan = null;
    if ($("#productionPlanPanel")) $("#productionPlanPanel").hidden = true;
    if ($("#cancelProductionPlanBtn")) $("#cancelProductionPlanBtn").hidden = true;
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = "打开待审作品文件夹";
    openButton.addEventListener("click", () => openPath(job.outputRoots?.[0]));
    $("#productionLiveStatus")?.append(" ", openButton);
  }
  if (job.status === "failed") {
    activeProductionJobId = "";
    setProductionLiveStatus(`${job.message} ${job.error || ""}`, "error");
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
    `${appInfo.name || "团建内容工作台"} v${appInfo.version || "未知"}`,
    `运行方式：${appInfo.desktop ? "桌面版" : "浏览器预览"}`,
    `项目目录：${dashboard?.projectRoot || "未识别"}`,
    `素材目录：${dashboard?.workspaceSettings?.materialRoot || "未识别"}`,
    `作品集目录：${dashboard?.workspaceSettings?.workPackage?.libraryPath || "未识别"}`,
    `设备在线：${online}/${(distribution.devices || []).length}`,
    `数据生成时间：${dashboard?.generatedAt || "未知"}`,
    `运行数据：${appInfo.runtimeRoot || "未识别"}`
  ].join("\n");
}

async function chooseFolder(description) {
  const result = await api("/api/pick-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description })
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
    payload.workPackage = {
      libraryPath: portfolioRoot,
      batchSize: Number($("#settingsBatchSize")?.value || 14),
      autoGroup: $("#settingsAutoGroup")?.checked !== false,
      autoZip: $("#settingsAutoZip")?.checked !== false
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
            <button class="tree-send-button" type="button" data-tree-send="${escapeHtml(item.id)}"><span>传 GPT</span><b aria-hidden="true">→</b></button>
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
    ["mobile", "抖音小红书"],
    ["official", "微信公众号"],
    ["used", "已发送"]
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

function renderDistributionLegacy() {
  const data = dashboard?.distribution || { summary: {}, devices: [] };
  const summary = data.summary || {};
  const devices = DistributionUI.decorateDevices(
    data.devices || [],
    deviceCheckState.onlineDevices || []
  );
  const distributableCollections = (data.collections || []).filter((collection) =>
    collection.dualPlatformEligible
  );
  const livePackageCounts = DistributionUI.countDistributablePackages(data.collections || []);
  const stats = DistributionUI.phoneDistributionStats(summary, deviceCheckState, devices.length)
    .map((stat) => livePackageCounts[stat.id] == null ? stat : { ...stat, value: livePackageCounts[stat.id] });
  const packageCollections = distributableCollections.filter((collection) =>
    collection.type === distributionSummaryFilter
  );
  const onlineDevices = devices.filter((device) => device.online);
  const renderRefreshIcon = () => deviceCheckState.scanning
    ? `<svg class="live-refresh-icon" viewBox="0 0 24 24" aria-label="正在刷新" role="img"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8.3A7 7 0 0 1 18.7 7L20 12M4 12l1.3 5A7 7 0 0 0 17.9 15.7"/></svg>`
    : "";
  const renderDeviceRows = () => devices.map((device) => `
    <article class="device-row ${device.online ? "is-online" : "is-offline"}" data-device-id="${escapeHtml(device.id)}">
      <div class="device-platform-icon" aria-label="${/iphone|apple|苹果/i.test(`${device.id} ${device.displayName}`) ? "苹果设备" : "安卓设备"}">
        ${/iphone|apple|苹果/i.test(`${device.id} ${device.displayName}`)
          ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.8 12.7c0-2.5 2.1-3.7 2.2-3.8-1.2-1.8-3.1-2-3.8-2-1.6-.2-3.1 1-3.9 1s-2-1-3.3-1c-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.3 2.5 1.3-.1 1.8-.8 3.4-.8 1.6 0 2.1.8 3.4.8 1.4 0 2.3-1.2 3.2-2.5 1-1.4 1.4-2.9 1.4-3-.1 0-3-.9-3-3.9Z"/><path d="M14.2 5.2c.7-.9 1.2-2.2 1.1-3.4-1.1 0-2.4.7-3.2 1.6-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.5-.6 3.2-1.5Z"/></svg>`
          : `<svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m7.4 5.8-1.3-2.2M16.6 5.8l1.3-2.2"/><path d="M6.2 10a5.8 5.8 0 0 1 11.6 0H6.2Z"/><circle cx="9.1" cy="7.8" r=".65"/><circle cx="14.9" cy="7.8" r=".65"/><path d="M6.2 11h11.6v6.1a2.1 2.1 0 0 1-2.1 2.1H8.3a2.1 2.1 0 0 1-2.1-2.1V11Z"/><path d="M4.3 11.5v5M19.7 11.5v5M9 19.2v2.4M15 19.2v2.4"/></svg>`}
        <b>${device.number}号</b>
      </div>
      <div class="device-copy">
        <button class="editable-device-name" type="button" data-edit-device-note="${escapeHtml(device.id)}" title="点击编辑设备备注">${escapeHtml(device.note || device.displayName)}</button>
        <p>${escapeHtml(device.displayName)} · ${escapeHtml(device.ownerGroup)} · ${escapeHtml((device.platforms || []).join(" + "))}${device.workCount == null ? "" : ` · 当前 ${device.workCount} 个作品`}</p>
      </div>
      <div class="badge-line device-status-badges">
        ${renderDeviceTransportTags(device)}
        <span class="state-badge">${device.platforms?.length === 1 ? "单平台设备" : "双平台设备"}</span>
      </div>
      <div class="device-actions">
        <button type="button" data-device-action="traffic" data-device="${escapeHtml(device.aliases?.[0] || device.displayName)}" ${device.online ? "" : "disabled"}>补泛流量</button>
        <button type="button" data-device-action="conversion" data-device="${escapeHtml(device.aliases?.[0] || device.displayName)}" ${device.online ? "" : "disabled"}>补团建转化</button>
        <button type="button" data-upload-other="${escapeHtml(device.id)}" ${device.online ? "" : "disabled"}>上传其他</button>
      </div>
      ${uploadChoiceDeviceId === device.id ? `<div class="upload-choice-panel">
        <span>选择要发送给 ${escapeHtml(device.note || device.displayName)} 的内容</span>
        <button type="button" data-generic-source="file" data-generic-device="${escapeHtml(device.id)}">选择文件</button>
        <button type="button" data-generic-source="folder" data-generic-device="${escapeHtml(device.id)}">选择文件夹</button>
        <button type="button" data-close-upload-choice>取消</button>
      </div>` : ""}
    </article>
  `).join("");
  const renderPackageRows = () => `
    <div class="package-list">${packageCollections.length ? packageCollections.map((collection) => `
      <article class="distribution-package-row ${selectedDistributionCollectionName === collection.name ? "active" : ""}" data-package-name="${escapeHtml(collection.name)}">
        <button class="package-select" type="button" data-select-package="${escapeHtml(collection.name)}" aria-pressed="${selectedDistributionCollectionName === collection.name}">
          <span class="package-radio" aria-hidden="true"></span>
          <span><strong>${escapeHtml(collection.name)}</strong><small>${collection.itemCount || 0} 个作品 · ${escapeHtml(collection.typeLabel || "")}</small></span>
        </button>
        <div class="badge-line">
          <span class="state-badge good">小红书 + 抖音可用</span>
          <span class="state-badge good">双平台可用</span>
        </div>
        <div class="device-actions">
          <button type="button" data-open-collection="${escapeHtml(collection.sourcePath || "")}">打开作品包</button>
          <button type="button" data-send-package="${escapeHtml(collection.name)}">选择设备</button>
        </div>
      </article>
    `).join("") : `<div class="empty-state"><strong>当前没有可用作品包</strong><p>已进入“已发送”或入口失效的作品包不会列在这里。</p></div>`}</div>
    ${packageDevicePickerCollectionName ? `<div class="device-picker-backdrop" data-close-device-picker>
      <section class="device-picker-dialog" role="dialog" aria-modal="true" aria-label="选择当前在线设备">
        <header><div><strong>发送作品包</strong><span>${escapeHtml(packageDevicePickerCollectionName)}</span></div><button type="button" data-close-device-picker aria-label="关闭">×</button></header>
        ${renderTransportGuide()}
        <div class="device-picker-list">
          ${onlineDevices.length ? onlineDevices.map((device) => `<button type="button" data-confirm-package-device="${escapeHtml(device.id)}">
            <span class="picker-platform-icon" aria-hidden="true">
              ${/iphone|apple|苹果/i.test(`${device.id} ${device.displayName}`)
                ? `<svg viewBox="0 0 24 24"><path d="M16.8 12.7c0-2.5 2.1-3.7 2.2-3.8-1.2-1.8-3.1-2-3.8-2-1.6-.2-3.1 1-3.9 1s-2-1-3.3-1c-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.3 2.5 1.3-.1 1.8-.8 3.4-.8 1.6 0 2.1.8 3.4.8 1.4 0 2.3-1.2 3.2-2.5 1-1.4 1.4-2.9 1.4-3-.1 0-3-.9-3-3.9Z"/><path d="M14.2 5.2c.7-.9 1.2-2.2 1.1-3.4-1.1 0-2.4.7-3.2 1.6-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.5-.6 3.2-1.5Z"/></svg>`
                : `<svg class="android-icon" viewBox="0 0 24 24"><path d="m7.4 5.8-1.3-2.2M16.6 5.8l1.3-2.2"/><path d="M6.2 10a5.8 5.8 0 0 1 11.6 0H6.2Z"/><circle cx="9.1" cy="7.8" r=".65"/><circle cx="14.9" cy="7.8" r=".65"/><path d="M6.2 11h11.6v6.1a2.1 2.1 0 0 1-2.1 2.1H8.3a2.1 2.1 0 0 1-2.1-2.1V11Z"/><path d="M4.3 11.5v5M19.7 11.5v5M9 19.2v2.4M15 19.2v2.4"/></svg>`}
            </span>
            <strong>${escapeHtml(device.note || device.displayName)}</strong>
            ${renderDeviceTransportTags(device, true)}
          </button>`).join("") : `<div class="empty-state"><strong>当前没有在线设备</strong><p>后台会继续自动刷新设备状态。</p></div>`}
        </div>
      </section>
    </div>` : ""}
  `;
  $("#distributionPhones").innerHTML = `
    <div class="distribution-stats">
      ${stats.map((stat) => `<button type="button" class="summary-card is-actionable ${distributionSummaryFilter === stat.id ? "active" : ""}" data-distribution-filter="${stat.id}"><span>${escapeHtml(stat.label)}</span><strong>${escapeHtml(stat.value)} <small>${escapeHtml(stat.unit)}</small>${stat.id === "devices" ? renderRefreshIcon() : ""}</strong></button>`).join("")}
    </div>
    ${renderTransferTasks()}
    ${distributionSummaryFilter === "devices" ? `<div class="device-list">${renderDeviceRows()}</div>` : renderPackageRows()}
  `;
  const pending = data.collections?.filter((item) => item.officialAccount === "reserved_pending_upload") || [];
  $("#distributionOfficial").innerHTML = `
    <div class="distribution-stats">
      ${[["公众号可用", summary.officialAvailable || 0], ["已打开过", summary.officialPending || 0], ["上传已完成", summary.officialConfirmed || 0]]
        .map(([label, value]) => `<article class="summary-card"><span>${label}</span><strong>${value}</strong></article>`).join("")}
    </div>
    <div class="official-launcher"><div><strong>公众号发布后台</strong><p>先打开官网上传作品，再回到这里确认结果。</p></div><button type="button" class="primary-button" data-open-official-site>打开公众号官网</button></div>
    <div class="detail-warning">打开作品文件夹后会标记为“已打开过”；完成公众号上传后，点击“是否已上传？”确认即可。</div>
    <div class="record-list">
      ${pending.map((collection) => `<article class="official-card"><div class="device-number">开</div><div><h3>${escapeHtml(collection.name)}</h3><p>作品文件夹已经打开过，等待你完成电脑上传</p></div><span class="state-badge warn">已打开过</span><div class="device-actions"><button data-confirm-official="${escapeHtml(collection.name)}">是否已上传？</button></div></article>`).join("")}
      <article class="official-card"><div class="device-number">${summary.officialAvailable || 0}</div><div><h3>打开一个公众号可用作品集</h3><p>打开文件夹并登记“已打开过”，上传完成后再确认</p></div><span class="state-badge good">公众号可用</span><div class="device-actions"><button data-official-action="execute">上传公众号</button></div></article>
    </div>
  `;
  $("#distributionHistory").innerHTML = renderDistributionRecords(data.deviceHistory || [], "device");
  showDistributionPanel(activeDistributionPanel);
}

function renderDistribution() {
  const data = dashboard?.distribution || { devices: [], collections: [] };
  const devices = DistributionUI.decorateDevices(data.devices || [], deviceCheckState.onlineDevices || []);
  const onlineDevices = devices.filter((device) => device.online);
  const collections = data.collections || [];
  const mobileCollections = collections.filter((item) => item.workflowStage === "mobile");
  const officialCollections = collections.filter((item) => item.workflowStage === "official");
  const usedCollections = collections.filter((item) => item.workflowStage === "used");
  const visibleMobileCollections = mobileCollections.filter((item) => item.type === distributionCollectionTypeFilter);
  const visibleOfficialCollections = officialCollections.filter((item) => item.type === distributionCollectionTypeFilter);
  const stageRoots = data.stageRoots || {};
  const tabItems = [
    ["devices", "设备", `${onlineDevices.length}/${devices.length}`],
    ["mobile", "抖音小红书", mobileCollections.length],
    ["official", "微信公众号", officialCollections.length],
    ["used", "已发送", usedCollections.length],
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
  const classificationSelect = (collection) => `
    <label class="classification-select">
      <span>分类</span>
      <select data-classify-collection="${escapeHtml(collection.name)}">
        <option value="traffic" ${collection.type === "traffic" ? "selected" : ""}>泛流量帖</option>
        <option value="conversion" ${collection.type === "conversion" ? "selected" : ""}>精准流量帖</option>
        <option value="unclassified" ${collection.type === "unclassified" ? "selected" : ""}>未分类</option>
      </select>
    </label>
  `;
  const devicePicker = () => packageDevicePickerCollectionName ? `
    <div class="device-picker-backdrop" data-close-device-picker>
      <section class="device-picker-dialog" role="dialog" aria-modal="true" aria-label="选择当前在线设备">
        <header><div><strong>发送作品包</strong><span>${escapeHtml(packageDevicePickerCollectionName)}</span></div><button type="button" data-close-device-picker aria-label="关闭">×</button></header>
        ${renderTransportGuide()}
        <div class="device-picker-list">
          ${onlineDevices.length ? onlineDevices.map((device) => `
            <button type="button" data-confirm-package-device="${escapeHtml(device.id)}">
              <strong>${escapeHtml(device.note || device.displayName)}</strong>
              ${renderDeviceTransportTags(device, true)}
            </button>
          `).join("") : `<div class="empty-state"><strong>当前没有在线设备</strong><p>设备上线后刷新即可发送。</p></div>`}
        </div>
      </section>
    </div>
  ` : "";
  const deviceRows = devices.map((device) => `
    <article class="device-row ${device.online ? "is-online" : "is-offline"}" data-device-id="${escapeHtml(device.id)}">
      <div class="device-platform-icon"><b>${device.number}号</b></div>
      <div class="device-copy">
        <button class="editable-device-name" type="button" data-edit-device-note="${escapeHtml(device.id)}">${escapeHtml(device.note || device.displayName)}</button>
        <p>${escapeHtml(device.displayName)} · ${escapeHtml(device.ownerGroup)} · ${device.online ? "在线" : "离线"}</p>
      </div>
      <div class="badge-line device-status-badges">
        ${renderDeviceTransportTags(device)}
        <span class="state-badge ${device.online ? "good" : "bad"}">${device.online ? "可发送" : "当前离线"}</span>
      </div>
      <div class="device-actions">
        <button type="button" data-device-action="traffic" data-device="${escapeHtml(device.aliases?.[0] || device.displayName)}" ${device.online ? "" : "disabled"}>补泛流量</button>
        <button type="button" data-device-action="conversion" data-device="${escapeHtml(device.aliases?.[0] || device.displayName)}" ${device.online ? "" : "disabled"}>补团建转化</button>
        <button type="button" data-upload-other="${escapeHtml(device.id)}" ${device.online ? "" : "disabled"}>上传其他</button>
      </div>
      ${uploadChoiceDeviceId === device.id ? `<div class="upload-choice-panel">
        <span>选择要发送给 ${escapeHtml(device.note || device.displayName)} 的内容</span>
        <button type="button" data-generic-source="file" data-generic-device="${escapeHtml(device.id)}">选择文件</button>
        <button type="button" data-generic-source="folder" data-generic-device="${escapeHtml(device.id)}">选择文件夹</button>
        <button type="button" data-close-upload-choice>取消</button>
      </div>` : ""}
    </article>
  `).join("");

  $("#distributionDevices").innerHTML = `
    <div class="distribution-stats">
      <article class="summary-card"><span>在线设备</span><strong>${onlineDevices.length}<small> / ${devices.length} 台</small></strong></article>
      <article class="summary-card"><span>待手机分发</span><strong>${mobileCollections.length}<small> 个</small></strong></article>
      <article class="summary-card"><span>进行中任务</span><strong>${[...distributionTransferUiTasks.values(), ...genericTransferUiTasks.values()].filter((task) => ["running", "cancelling"].includes(task.state)).length}<small> 个</small></strong></article>
    </div>
    ${renderTransferTasks()}
    <div class="device-list">${deviceRows || `<div class="empty-state"><strong>暂未发现设备</strong><p>刷新后会重新检测 Wi-Fi、USB 和远程连接。</p></div>`}</div>
  `;

  $("#distributionMobile").innerHTML = `
    ${stageHeader("mobile", `抖音小红书 · ${mobileCollections.length} 个作品集`, "这里的真实文件夹，就是待发送到手机并发布抖音、小红书的库存。")}
    ${typeTabs(mobileCollections)}
    ${renderTransferTasks()}
    <div class="package-list">${visibleMobileCollections.length ? visibleMobileCollections.map((collection) => {
      const sendable = collection.sourceValid && collection.dualPlatformEligible;
      const state = !collection.sourceValid ? ["bad", "作品为空"] : collection.type === "unclassified" ? ["warn", "待补 [泛] / [转] 标签"] : ["good", "可发送到手机"];
      return `<article class="distribution-package-row ${selectedDistributionCollectionName === collection.name ? "active" : ""}">
        <button class="package-select" type="button" data-select-package="${escapeHtml(collection.name)}">
          <span class="package-radio" aria-hidden="true"></span>
          <span><strong>${escapeHtml(collection.name)}</strong><small>${collection.itemCount || 0} 个作品 · ${escapeHtml(collection.typeLabel || "")}</small></span>
        </button>
        <div class="badge-line"><span class="state-badge ${state[0]}">${state[1]}</span></div>
        <div class="device-actions">
          <button type="button" data-open-collection="${escapeHtml(collection.sourcePath || "")}">打开作品包</button>
          <button type="button" data-send-package="${escapeHtml(collection.name)}" ${sendable ? "" : "disabled"}>选择设备发送</button>
          ${classificationSelect(collection)}
        </div>
      </article>`;
    }).join("") : `<div class="empty-state"><strong>这个分类暂时没有作品</strong><p>切换另一个分类，或打开真实文件夹核对。</p></div>`}</div>
    ${devicePicker()}
  `;

  $("#distributionOfficial").innerHTML = `
    ${stageHeader("official", `微信公众号 · ${officialCollections.length} 个作品集`, "手机端发布完成后放到这里；公众号也发布完成后，再压缩归档。")}
    ${typeTabs(officialCollections)}
    <div class="official-launcher"><div><strong>微信公众号发布后台</strong><p>先打开作品核对内容，再到公众号后台上传。</p></div><button type="button" class="primary-button" data-open-official-site>打开公众号官网</button></div>
    <div class="package-list">${visibleOfficialCollections.length ? visibleOfficialCollections.map((collection) => `
      <article class="distribution-package-row">
        <div class="package-select"><span class="package-radio" aria-hidden="true"></span><span><strong>${escapeHtml(collection.name)}</strong><small>${collection.itemCount || 0} 个作品 · ${escapeHtml(collection.typeLabel || "")}</small></span></div>
        <div class="badge-line"><span class="state-badge ${collection.sourceValid ? "good" : "bad"}">${collection.sourceValid ? "等待公众号发布" : "作品为空"}</span></div>
        <div class="device-actions">
          <button type="button" data-open-collection="${escapeHtml(collection.sourcePath || "")}">打开作品</button>
          <button type="button" data-mark-used="${escapeHtml(collection.name)}" ${collection.sourceValid ? "" : "disabled"}>三端已发布，归档</button>
          ${classificationSelect(collection)}
        </div>
      </article>
    `).join("") : `<div class="empty-state"><strong>这个分类暂时没有作品</strong><p>切换另一个分类，或打开真实文件夹核对。</p></div>`}</div>
  `;

  $("#distributionUsed").innerHTML = `
    ${stageHeader("used", `已发送 · ${usedCollections.length} 个压缩包`, "这里只存三端都已发布的 ZIP。压缩校验成功后，原作品文件夹会被删除。")}
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
    </div>
  `;
  showDistributionPanel(activeDistributionPanel);
}

function renderTransferTasks() {
  const tasks = [
    ...Array.from(distributionTransferUiTasks.values()).map((task) => ({ ...task, taskKind: "distribution" })),
    ...Array.from(genericTransferUiTasks.values()).map((task) => ({ ...task, taskKind: "generic" }))
  ].sort((left, right) => String(right.startedAt || "").localeCompare(String(left.startedAt || "")));
  if (!tasks.length) return "";
  return `<section class="transfer-task-list">${tasks.map((task) => `
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
        : `<span class="state-badge ${task.state === "completed" ? "good" : task.state === "failed" ? "bad" : "warn"}">${task.state === "completed" ? "已完成并记录" : task.state === "cancelled" ? "已停止待核对" : "未完成"}</span>`}
    </article>
  `).join("")}</section>`;
}

async function startGenericTransfer(deviceId, sourcePath) {
  const devices = DistributionUI.decorateDevices(
    dashboard?.distribution?.devices || [],
    deviceCheckState.onlineDevices || []
  );
  const device = devices.find((item) => item.id === deviceId && item.online);
  if (!device) return showSystemNotice("目标设备当前不在线", "设备恢复在线后，发送按钮会自动可用。");
  if (!sourcePath) return;
  const confirmed = await openSystemDialog({
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
        if (!["running", "cancelling"].includes(next.state)) distributionFinished = true;
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

function showDistributionPanel(panel) {
  activeDistributionPanel = panel || "devices";
  $$("#distributionTabs button").forEach((button) => button.classList.toggle("active", button.dataset.panel === activeDistributionPanel));
  $$(".distribution-panel").forEach((section) => section.classList.toggle("active", section.id === `distribution${activeDistributionPanel[0].toUpperCase()}${activeDistributionPanel.slice(1)}`));
}

function applyTheme(theme) {
  const value = ["solid", "glass", "neumorphic", "jianghu", "editorial", "midnight"].includes(theme) ? theme : "solid";
  document.body.dataset.theme = value;
  localStorage.setItem("tb-dashboard-theme", value);
  $$(".theme-option").forEach((button) => button.classList.toggle("active", button.dataset.theme === value));
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
  const confirmed = await openSystemDialog({
    eyebrow: isOfficial ? "公众号补笔记" : "手机补笔记",
    title: isOfficial ? "打开一个公众号可用作品包？" : "确认随机补充作品包？",
    description,
    details: isOfficial ? [] : [
      { label: "目标设备", value: payload.device },
      { label: "内容类型", value: payload.type === "conversion" ? "团建转化" : "泛流量" }
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
  input.setAttribute("aria-label", "设备备注");
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
        toast("设备备注已保存");
      } catch (error) {
        showSystemNotice("设备备注没有保存", error.message, { tone: "danger" });
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
  const device = devices.find((item) => item.id === selectedDistributionDeviceId && item.online);
  if (!collection) return showSystemNotice("还没有选择作品包", "请先在列表里选择要发送的作品包。");
  if (!device) return showSystemNotice("目标设备已经离线", "返回设备选择列表，选择一台当前在线设备。");
  const typeLabel = collection.type === "conversion" ? "团建转化" : "泛流量";
  const confirmed = await openSystemDialog({
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
    if (!options.silent) {
      toast(deviceCheckState.online == null ? "刷新完成，请查看结果" : `已刷新：当前在线 ${deviceCheckState.online} 台`);
    }
  } catch (error) {
    deviceCheckState = { ...deviceCheckState, scanning: false };
    if (dashboard?.distribution) renderDistribution();
    if (!options.silent) showSystemNotice("设备状态刷新失败", error.message, { tone: "danger" });
    else console.error("设备自动扫描失败", error);
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

const PAGE_HELP = {
  overviewView: {
    title: "总览怎么用",
    description: "这里汇总本地素材、模板、成品、设备和分发阶段。数字来自真实文件夹与运行记录，点击相应卡片可进入具体页面。"
  },
  dashboardView: {
    title: "素材与生产怎么用",
    description: "先选择素材文件夹和模板，再按作品数量与质量启动生产。素材只提供内容，模板负责固定风格，生成结果会进入成品库。"
  },
  productsView: {
    title: "成品库怎么用",
    description: "这里按真实文件夹查看作品集。抖音小红书、微信公众号、已发送分别对应三个物理目录，移动后刷新即可同步。"
  },
  distributionView: {
    title: "分发界面怎么用",
    description: "先在“抖音小红书”选择泛流量帖或精准流量帖并发送到在线设备；手机端发布完成后作品进入“微信公众号”；三端都发布后压缩到“已发送”并删除原目录。所有操作在“操作记录”中可追溯。"
  },
  settingsView: {
    title: "设置怎么用",
    description: "这里配置本地目录、外观和运行参数。修改目录后请刷新，系统会重新读取真实文件夹，不会凭界面状态猜测库存。"
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

function installPageHelpButtons() {
  Object.entries(PAGE_HELP).forEach(([viewId, help]) => {
    const view = document.getElementById(viewId);
    const heading = view?.querySelector(".page-heading, .production-api-flow");
    if (!heading || heading.querySelector("[data-page-help]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "page-help-button";
    button.dataset.pageHelp = viewId;
    button.title = help.description;
    button.setAttribute("aria-label", `${help.title}，点击查看说明`);
    button.textContent = "?";
    const actionRow = heading.querySelector(".detail-button-row");
    if (actionRow) actionRow.appendChild(button);
    else heading.appendChild(button);
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

  activateTab(window.MaterialWorkspace.resolveInitialTab(state.activeTab));
}

function activateTab(name) {
  name = window.MaterialWorkspace.resolveInitialTab(name);
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  $$(".view").forEach((view) => view.classList.remove("active"));
  $(`#${name}View`)?.classList.add("active");
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
    applyTheme(localStorage.getItem("tb-dashboard-theme") || "jianghu");
    loadDedupStatus().catch((error) => {
      if ($("#dedupSummary")) $("#dedupSummary").textContent = `防重复账本读取失败：${error.message}`;
    });
  }
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

function bindEvents() {
  $("#dashboardView .work-canvas")?.addEventListener("scroll", maybeLoadMoreMaterials, { passive: true });
  $("#productsView .product-preview-pane")?.addEventListener("scroll", maybeLoadMoreProducts, { passive: true });
  document.addEventListener("click", async (event) => {
    if (!event.target.closest(".custom-select")) closeCustomSelects();
    if (!event.target.closest(".context-menu")) hideContextMenu();
    const jump = event.target.closest("[data-jump]");
    if (jump) activateTab(jump.dataset.jump);
    const treeToggle = event.target.closest("[data-tree-toggle]");
    if (treeToggle) {
      const categoryPath = treeToggle.dataset.treeToggle;
      const category = dashboard?.materials?.categories?.find((item) => item.path === categoryPath);
      if (expandedMaterialPaths.has(categoryPath)) {
        expandedMaterialPaths.delete(categoryPath);
      } else {
        expandedMaterialPaths.add(categoryPath);
        if (category && category.loaded === false) {
          saveLocalState({ selectedMaterialCategoryPath: categoryPath, selectedMaterial: "" });
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
    const selectPackage = event.target.closest("[data-select-package]");
    if (selectPackage) {
      selectedDistributionCollectionName = selectPackage.dataset.selectPackage;
      renderDistribution();
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
    const deviceAction = event.target.closest("[data-device-action]");
    if (deviceAction) {
      const type = deviceAction.dataset.deviceAction;
      const typeLabel = type === "conversion" ? "团建转化" : "泛流量";
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
      showSystemNotice(help.title, help.description, { eyebrow: "使用说明" });
    }
    const theme = event.target.closest("[data-theme]");
    if (theme) applyTheme(theme.dataset.theme);
  });
  document.addEventListener("change", (event) => {
    const classification = event.target.closest?.("[data-classify-collection]");
    if (classification) classifyDistributionCollection(
      classification.dataset.classifyCollection,
      classification.value
    );
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCustomSelects();
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
  $("#choosePortfolioRootBtn")?.addEventListener("click", async () => {
    try {
      const selectedPath = await chooseFolder("选择作品集存放目录");
      if (selectedPath) $("#settingsPortfolioRoot").value = selectedPath;
    } catch (error) {
      showSystemNotice("目录选择失败", error.message, { tone: "danger" });
    }
  });
  const bindCollectionRootControls = (inputSelector, chooseSelector, applySelector, returnTab) => {
    $(chooseSelector)?.addEventListener("click", async () => {
      try {
        const selectedPath = await chooseFolder("选择作品集存放目录");
        if (selectedPath) $(inputSelector).value = selectedPath;
      } catch (error) {
        showSystemNotice("目录选择失败", error.message, { tone: "danger" });
      }
    });
    $(applySelector)?.addEventListener("click", () => {
      saveWorkspacePaths({
        portfolioRoot: $(inputSelector).value,
        returnTab
      }).catch((error) => showSystemNotice("作品集目录读取失败", error.message, { tone: "danger" }));
    });
    $(inputSelector)?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      $(applySelector)?.click();
    });
  };
  bindCollectionRootControls("#collectionRootInput", "#chooseCollectionRootBtn", "#applyCollectionRootBtn", "products");
  bindCollectionRootControls("#distributionCollectionRootInput", "#chooseDistributionCollectionRootBtn", "#applyDistributionCollectionRootBtn", "distribution");
  $("#savePathSettingsBtn")?.addEventListener("click", () => {
    saveWorkspacePaths({ returnTab: "settings" })
      .catch((error) => showSystemNotice("设置没有保存", error.message, { tone: "danger" }));
  });
  $("#saveProductionApiBtn")?.addEventListener("click", () => saveProductionApi().catch((error) => setProductionLiveStatus(error.message, "error")));
  $("#testProductionApiBtn")?.addEventListener("click", testProductionApi);
  $$("[data-production-mode]").forEach((button) => button.addEventListener("click", () => {
    if (activeProductionJobId) {
      setProductionLiveStatus("当前生产还在进行，完成后再切换生产方式。", "error");
      return;
    }
    selectedProductionMode = button.dataset.productionMode;
    invalidateProductionPlan();
    renderProductionMode();
    setProductionLiveStatus(`${productionModeLabel()}已选好。选择素材和模板后点击主按钮。`);
  }));
  $("#createProductionPlanBtn")?.addEventListener("click", createProductionPlan);
  $("#cancelProductionPlanBtn")?.addEventListener("click", () => {
    invalidateProductionPlan();
    setProductionLiveStatus("已取消当前计划，可以重新选择。");
  });
  $("#productionApiProvider")?.addEventListener("change", () => {
    const minimax = $("#productionApiProvider").value === "minimax";
    $("#productionApiBaseUrl").value = minimax ? "https://api.minimaxi.com/v1" : "http://localhost:62104/v1";
    $("#productionApiModel").value = minimax ? "image-01" : "gpt-image-2";
    setProductionLiveStatus(minimax ? "已切换 MiniMax；请测试当前密钥是否有效。" : "已切换本地 GPT 生图。");
  });
  renderProductionMode();
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
  $("#reconcileDistributionFoldersBtn")?.addEventListener("click", reconcileDistributionFolders);
  $("#copyDistributionCommand")?.addEventListener("click", () => copyText($("#distributionCommand").value, "分发指令已复制"));
  $("#refreshJuguangBtn")?.addEventListener("click", async () => {
    await loadJuguang(true);
    toast("聚光数据已刷新");
  });
  $("#juguangKeywordSearch")?.addEventListener("input", renderJuguangRecommendations);

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
    await renamePath(target?.path, target?.label);
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
bindPaneResizers();
window.addEventListener("desktop-gpt-transfer-result", (event) => {
  const result = event.detail || {};
  if (!result.ok) {
    showSystemNotice("素材没有放入 ChatGPT", result.error || "请打开一个 ChatGPT 对话后重试", { tone: "danger" });
    return;
  }
  toast(result.filesAttached
    ? `已放入 ${result.fileCount} 个文件和生产指令，请在右侧确认发送`
    : "生产指令已填入；请打开一个对话后再次点击传 GPT 上传文件");
});
const themeDefaultVersion = "jianghu-v2";
const storedThemeDefaultVersion = localStorage.getItem("tb-dashboard-theme-default-version");
const initialTheme = storedThemeDefaultVersion === themeDefaultVersion
  ? (localStorage.getItem("tb-dashboard-theme") || "jianghu")
  : "jianghu";
localStorage.setItem("tb-dashboard-theme-default-version", themeDefaultVersion);
applyTheme(initialTheme);
loadDashboard()
  .then(() => {
    installPageHelpButtons();
    restoreTransferTasks();
    if (!deviceScanStarted) checkDistributionDevices({ silent: true, refreshInventory: false });
    window.setInterval(() => {
      if (!deviceScanRunning) checkDistributionDevices({ silent: true, refreshInventory: false });
    }, 20_000);
  })
  .catch((error) => {
    console.error(error);
    toast("读取本地库失败");
  });
