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
let conversionData = null;
let conversionModule = "search";
let conversionRole = "前端运营";
let conversionResult = null;
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
let activeProductionPlan = null;
let activeProductionJobId = "";
let productionJobPollTimer = null;
let workbenchProgressValue = 0;
const workbenchProductionLog = [];
const workbenchSelectedMaterials = new Set();
const workbenchSelectedProducts = new Set();
let workbenchTemplateType = "conversion";
let workbenchMaterialFilter = "all";
let workbenchOutputFilter = "all";
let workbenchActiveMaterialCategoryPath = "";
let workbenchExpandedMaterialCategoryPath = "";
let workbenchExpandedMaterialPath = "";
let workbenchModelsLoaded = false;
let productionWorkspace = null;
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
  renderPrompts();
  renderWorkspaceSettings();
  loadCloudBackupStatus();
  if ($("#overviewView")) renderOverview();
  restoreSelection();
}

function closeImageLightbox() {
  document.querySelector(".image-lightbox")?.remove();
}

function openImageLightbox(imageUrl, caption = "图片预览") {
  closeImageLightbox();
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
    : `你正在使用「${template.name}」生产团建转化内容。${masterRule}\n永久锁定母版的封面结构、内页结构、字体气质、配色、标题位置和拼图比例；新素材只提供地点、项目、路线和文案事实。图上文字少而准，优先地点词、项目词和路线词；不得虚构价格、场地、车程或项目。所有页面输出为独立 3:4 图片，人物与道具按规则去重，保留真实场景，避免广告感和 AI 味。每套作品同时生成小红书文案、出图计划和生产记录。`;
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
  const activeCategory = categories.find((category) => category.path === workbenchActiveMaterialCategoryPath)
    || categories.find((category) => category.loaded !== false)
    || categories[0];
  return (activeCategory?.items || [])
    .map((item) => ({ item, category: activeCategory }))
    .filter(({ item }) => {
      const text = `${item.name} ${item.preview || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
      const mainTag = item.mainTag || item.metadata?.mainTag || "";
      if (query && !text.includes(query)) return false;
      if (workbenchMaterialFilter === "conversion" && mainTag && mainTag !== "团建转化") return false;
      if (workbenchMaterialFilter === "game" && mainTag && mainTag !== "团建游戏") return false;
      if (workbenchMaterialFilter === "guide" && mainTag && mainTag !== "合集攻略") return false;
      if (workbenchMaterialFilter === "unused" && Number(item.usageCount || item.metadata?.usageCount || 0) !== 0) return false;
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
  if (!categories.some((category) => category.path === workbenchActiveMaterialCategoryPath)) {
    workbenchActiveMaterialCategoryPath = getSavedState().selectedMaterialCategoryPath
      || selectedMaterialCategory?.path
      || categories.find((category) => category.loaded !== false)?.path
      || categories[0]?.path
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
  folders.innerHTML = categories.length ? categories.map((category) => {
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
  renderWorkbenchProducts();
}

const WORKBENCH_PROVIDER_DEFAULTS = {
  "local-openai": { baseUrl: "http://localhost:62104/v1", imageModel: "gpt-image-2", label: "本地 GPT 生图" },
  bytecat: { baseUrl: "https://codecdn.bytecatcode.org/v1", imageModel: "gpt-image-2", label: "ByteCat" },
  minimax: { baseUrl: "https://api.minimaxi.com/v1", imageModel: "image-01", label: "MiniMax" }
};

function currentWorkbenchProvider() {
  return $("#workbenchImageProvider")?.value
    || localStorage.getItem("tb-workbench-image-provider")
    || dashboard?.workspaceSettings?.imageApi?.provider
    || "local-openai";
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
  }
  const textSelect = $("#workbenchTextModel");
  if (textSelect) {
    const rememberedText = localStorage.getItem("tb-workbench-text-model") || "gpt-5.6-terra";
    const likelyText = textModels.filter((model) => !/image|imagen|dall|flux|recraft|seedream|embedding|audio|whisper|tts/i.test(String(model)));
    const options = [...new Set([rememberedText, "gpt-5.6-terra", ...likelyText].filter(Boolean))];
    textSelect.innerHTML = options.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("");
    textSelect.value = options.includes(rememberedText) ? rememberedText : options[0];
    if ($("#productionTextModel")) $("#productionTextModel").value = textSelect.value;
  }
}

async function fetchModelCatalog(payload) {
  return api("/api/image-api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function refreshWorkbenchModels(force = false) {
  if (workbenchModelsLoaded && !force) return;
  const status = $("#workbenchModelStatus");
  if (status) status.textContent = "正在分别读取生图与文案模型…";
  const provider = currentWorkbenchProvider();
  const providerDefaults = WORKBENCH_PROVIDER_DEFAULTS[provider] || WORKBENCH_PROVIDER_DEFAULTS["local-openai"];
  renderWorkbenchModelOptions();
  const [imageCatalog, textCatalog] = await Promise.allSettled([
    fetchModelCatalog({ provider, baseUrl: providerDefaults.baseUrl, model: $("#workbenchImageModel")?.value || providerDefaults.imageModel }),
    fetchModelCatalog({ provider: "local-openai", baseUrl: WORKBENCH_PROVIDER_DEFAULTS["local-openai"].baseUrl, model: $("#workbenchTextModel")?.value || "gpt-5.6-terra" })
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
      : "文案模型暂不可读，保留当前模型";
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
  const textModel = $("#workbenchTextModel")?.value || "gpt-5.6-terra";
  localStorage.setItem("tb-workbench-image-provider", provider);
  localStorage.setItem(`tb-workbench-image-model-${provider}`, model);
  localStorage.setItem("tb-workbench-text-model", textModel);
  if ($("#productionApiProvider")) $("#productionApiProvider").value = provider;
  if ($("#productionApiBaseUrl")) $("#productionApiBaseUrl").value = providerDefaults.baseUrl;
  if ($("#productionApiModel")) $("#productionApiModel").value = model;
  if ($("#productionTextModel")) $("#productionTextModel").value = textModel;
  const result = await api("/api/image-api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, baseUrl: providerDefaults.baseUrl, model })
  });
  dashboard.workspaceSettings.imageApi = result.imageApi;
  $("#workbenchEngineState").textContent = `${providerDefaults.label} · ${model} 已配置`;
  $("#workbenchModelStatus").textContent = `图片用 ${model}；文案用 ${textModel}`;
}

function filteredWorkbenchProducts() {
  return (productionWorkspace?.works || []).filter((work) => {
    if (workbenchOutputFilter === "review") return work.source === "待审区";
    if (workbenchOutputFilter === "unpacked") return !work.packed;
    if (workbenchOutputFilter === "packed") return work.packed;
    return true;
  });
}

function renderWorkbenchProducts() {
  const list = $("#workbenchProductList");
  if (!list) return;
  const works = filteredWorkbenchProducts();
  list.innerHTML = works.length ? works.map((work) => {
    const selected = workbenchSelectedProducts.has(work.path);
    const image = work.images?.[0]?.url || "";
    return `<label class="workbench-product-item${selected ? " active" : ""}" data-workbench-product="${escapeHtml(work.path)}">
      <input class="product-check" type="checkbox" ${selected ? "checked" : ""} />
      ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" />` : `<span class="work-placeholder">${work.imageCount || 0}图</span>`}
      <span><strong>${escapeHtml(work.name)}</strong><small>${escapeHtml(work.templateName || "未识别模板")} · ${work.imageCount} 张图 · ${work.hasCopy ? "有文案" : "无文案"}</small><span class="status-line"><span>${escapeHtml(work.source)}</span><span class="${work.packed ? "packed" : ""}">${work.packed ? "已在待发" : "待打包"}</span></span></span>
    </label>`;
  }).join("") : `<div class="empty-state"><strong>这里暂时没有成品</strong><p>生产完成后会自动出现在待审区。</p></div>`;
  $("#workbenchProductCount").textContent = `${productionWorkspace?.works?.length || 0} 个成品`;
  $("#workbenchSelectedProductCount").textContent = `已选 ${workbenchSelectedProducts.size} 个`;
  $("#workbenchOutputPath").textContent = productionWorkspace?.pendingRoot ? `待发目录：${productionWorkspace.pendingRoot}` : "正在读取待发目录…";
}

async function renderProductionWorkbench() {
  if (!$("#workbenchMaterialFolders")) return;
  const settings = dashboard?.workspaceSettings || {};
  $("#workbenchMaterialRoot").value = settings.materialRoot || "";
  if ($("#workbenchProductRoot")) $("#workbenchProductRoot").value = settings.workPackage?.libraryPath || "";
  $("#workbenchEngineState").textContent = settings.imageApi?.credentialConfigured ? `${settings.imageApi.model} 已配置` : "生图引擎待配置";
  if ($("#workbenchImageProvider")) {
    $("#workbenchImageProvider").value = localStorage.getItem("tb-workbench-image-provider") || settings.imageApi?.provider || "local-openai";
  }
  renderWorkbenchModelOptions();
  if (!workbenchSelectedMaterials.size && selectedMaterial?.path) workbenchSelectedMaterials.add(selectedMaterial.path);
  renderWorkbenchMaterials();
  const activeCategory = dashboard?.materials?.categories?.find((category) => category.path === workbenchActiveMaterialCategoryPath);
  if (activeCategory?.loaded === false) {
    if ($("#workbenchProductionStatus")) $("#workbenchProductionStatus").textContent = `正在自动扫描 ${activeCategory.name}…`;
    await loadDashboard(false, activeCategory.path);
    return;
  }
  if (!selectedTemplate) selectedTemplate = dashboard?.templates?.templates?.find((item) => templateTypeOf(item) === workbenchTemplateType) || null;
  renderWorkbenchTemplates();
  refreshWorkbenchModels().catch(() => {});
  try {
    await loadProductionWorkspace();
  } catch (error) {
    $("#workbenchOutputPath").textContent = `成品库读取失败：${error.message}`;
  }
}

function syncWorkbenchProductionSettings() {
  if ($("#productionPageCount")) $("#productionPageCount").value = $("#workbenchPageCount")?.value || "";
  if ($("#productionQuality")) $("#productionQuality").value = $("#workbenchQuality")?.value || "严格母版";
  if ($("#productionTextModel")) $("#productionTextModel").value = $("#workbenchTextModel")?.value || "gpt-5.6-terra";
  const conversation = readTemplateConversation().filter((item) => item.role === "user").map((item) => item.text);
  const prompt = [
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
  const provider = currentWorkbenchProvider();
  const providerDefaults = WORKBENCH_PROVIDER_DEFAULTS[provider] || WORKBENCH_PROVIDER_DEFAULTS["local-openai"];
  return {
    provider,
    baseUrl: providerDefaults.baseUrl,
    model: $("#workbenchImageModel")?.value || $("#productionApiModel")?.value || "",
    apiKey: $("#productionApiKey")?.value || ""
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
  `;
  ["#productionPlanPanel", "#workbenchPlanPanel"].forEach((selector) => {
    const panel = $(selector);
    if (!panel) return;
    panel.hidden = false;
    panel.innerHTML = markup;
  });
  if ($("#workbenchStartProductionBtn")) $("#workbenchStartProductionBtn").textContent = "确认并开始生成";
  if ($("#createProductionPlanBtn")) $("#createProductionPlanBtn").textContent = "确认并开始生成";
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
        textModel: $("#workbenchTextModel")?.value || $("#productionTextModel")?.value || "gpt-5.6-terra"
      })
    });
    activeProductionPlan = result.plan;
    renderProductionPlan(result.plan);
    if ($("#cancelProductionPlanBtn")) $("#cancelProductionPlanBtn").hidden = false;
    setProductionLiveStatus(`计划已生成：${result.plan.totals.works} 套、${result.plan.totals.images} 张独立图片。请看清页面清单后确认。`, "", 25, "等待确认");
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
  setProductionLiveStatus("已确认计划，正在启动生产任务……", "running", 30, "启动生产");
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
        textModel: $("#workbenchTextModel")?.value || $("#productionTextModel")?.value || "gpt-5.6-terra"
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
  const overallPercent = job.status === "review-ready" ? 100 : job.status === "running" ? 30 + Math.round(percent * 0.7) : workbenchProgressValue;
  const phase = job.status === "review-ready" ? "生产完成" : job.status === "failed" ? "生产失败" : "正在生图";
  setProductionLiveStatus(`${job.message || "正在生产"}${suffix}`, job.status === "failed" ? "error" : job.status === "running" ? "running" : "", overallPercent, phase);
  renderProductionOutputs(job);
  if (job.status === "review-ready") {
    activeProductionJobId = "";
    activeProductionPlan = null;
    if ($("#productionPlanPanel")) $("#productionPlanPanel").hidden = true;
    if ($("#workbenchPlanPanel")) $("#workbenchPlanPanel").hidden = true;
    if ($("#workbenchEditPlanBtn")) {
      $("#workbenchEditPlanBtn").hidden = true;
      $("#workbenchEditPlanBtn").disabled = false;
    }
    if ($("#workbenchStartProductionBtn")) {
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
      ${renderDevicePlatformIcon(device)}
      <div class="device-copy">
        <button class="editable-device-name" type="button" data-edit-device-note="${escapeHtml(device.id)}" title="点击编辑设备名称或编号">${escapeHtml(cleanDeviceDisplayName(device.note || device.displayName))}</button>
        <p>${escapeHtml(cleanDeviceDisplayName(device.displayName))} · ${escapeHtml(device.ownerGroup)} · ${escapeHtml((device.platforms || []).join(" + "))}${device.workCount == null ? "" : ` · 当前 ${device.workCount} 个作品`}</p>
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
            ${renderDevicePlatformIcon(device, "picker-platform-icon")}
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
              ${renderDevicePlatformIcon(device, "picker-platform-icon")}
              <strong>${escapeHtml(cleanDeviceDisplayName(device.note || device.displayName))}</strong>
              ${renderDeviceTransportTags(device, true)}
            </button>
          `).join("") : `<div class="empty-state"><strong>当前没有在线设备</strong><p>设备上线后刷新即可发送。</p></div>`}
        </div>
      </section>
    </div>
  ` : "";
  const deviceRows = devices.map((device) => `
    <article class="device-row ${device.online ? "is-online" : "is-offline"}" data-device-id="${escapeHtml(device.id)}">
      ${renderDevicePlatformIcon(device)}
      <div class="device-copy">
        <button class="editable-device-name" type="button" data-edit-device-note="${escapeHtml(device.id)}" title="点击编辑设备名称或编号">${escapeHtml(cleanDeviceDisplayName(device.note || device.displayName))}</button>
        <p>${escapeHtml(cleanDeviceDisplayName(device.displayName))} · ${escapeHtml(device.ownerGroup)} · ${device.online ? "在线" : "离线"}</p>
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
  const aliases = {
    solid: "neo",
    neumorphic: "neo",
    jianghu: "neo",
    editorial: "neo",
    midnight: "glass"
  };
  const value = ["glass", "neo"].includes(theme) ? theme : (aliases[theme] || "neo");
  document.body.dataset.theme = value;
  localStorage.setItem("tb-dashboard-theme", value);
  $$(".theme-option").forEach((button) => button.classList.toggle("active", button.dataset.theme === value));
  const cycleButton = $("#globalThemeCycleBtn");
  const themeName = $("#globalThemeName");
  const currentName = value === "neo" ? "拟态" : "玻璃";
  const nextName = value === "neo" ? "玻璃" : "拟态";
  if (themeName) themeName.textContent = currentName;
  if (cycleButton) {
    cycleButton.dataset.currentTheme = value;
    cycleButton.title = `当前${currentName}，点击切换为${nextName}`;
    cycleButton.setAttribute("aria-label", cycleButton.title);
  }
  syncConversionTheme(value);
}

function syncConversionTheme(theme = document.body.dataset.theme || "neo") {
  const frame = $("#conversionAppFrame");
  if (!frame?.contentWindow) return;
  frame.dataset.themeSynced = theme;
  frame.contentWindow.postMessage({ type: "jianghu-theme", theme }, window.location.origin);
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

function renderConversionSearch() {
  return `
    <section class="conversion-search-shell">
      <div class="conversion-intro-card">
        <span>客户刚刚说</span>
        <h3>把原话放进来，找下一句怎么回</h3>
        <p>选择当前由前端运营还是后端策划承接。系统会结合正式知识库和 SOP 给出回复与下一步。</p>
      </div>
      <div class="conversion-role-switch">
        <button class="${conversionRole === "前端运营" ? "active" : ""}" type="button" data-conversion-role="前端运营">前端运营</button>
        <button class="${conversionRole === "后端转化" ? "active" : ""}" type="button" data-conversion-role="后端转化">后端转化</button>
      </div>
      <textarea id="conversionQuestion" class="conversion-query" rows="5" placeholder="例如：客户说预算还没定，先看看有哪些适合30人的杭州周边方案"></textarea>
      <div class="conversion-action-row">
        <span>一次只推进一个判断，避免连续盘问客户。</span>
        <button class="primary-button" id="conversionSearchBtn" type="button">查找回复话术</button>
      </div>
      <section class="conversion-result" id="conversionSearchResult">${conversionResult ? readableConversionValue(conversionResult) : '<div class="conversion-empty">输入客户原话后，这里会显示可直接使用的回复与下一步。</div>'}</section>
    </section>`;
}

function renderConversionSop() {
  const roles = conversionRoles();
  const role = roles[conversionRole] || Object.values(roles)[0] || {};
  const stages = role.环节 || role.stages || [];
  return `
    <section class="conversion-sop-shell">
      <aside class="conversion-sop-rail">
        <div class="conversion-role-switch">
          ${Object.keys(roles).map((name) => `<button class="${name === conversionRole ? "active" : ""}" type="button" data-conversion-role="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("")}
        </div>
        <p>${escapeHtml(role.定位 || role.positioning || "按客户当前所在环节查看下一步。")}</p>
        <strong>${Number(role.问题数 || role.questionCount || 0)} 个正式问题</strong>
      </aside>
      <div class="conversion-stage-list">
        ${stages.map((stage) => `
          <article class="conversion-stage-card">
            <span>${escapeHtml(stage.编号 || stage.id || "")}</span>
            <div><h3>${escapeHtml(stage.名称 || stage.name || "未命名环节")}</h3><p>${escapeHtml(stage.原则 || stage.principle || "")}</p></div>
          </article>`).join("") || '<div class="conversion-empty">当前没有可显示的 SOP 环节。</div>'}
      </div>
    </section>`;
}

function renderConversionProposal() {
  return `
    <section class="conversion-proposal-shell">
      <div class="conversion-intro-card">
        <span>按客户需求找方案</span>
        <h3>先说清楚真实需求，再从本地方案源中匹配</h3>
        <p>可写人数、城市、日期、预算、天数和偏好。未知信息不用编，系统会标出缺口。</p>
      </div>
      <textarea id="conversionDemand" class="conversion-query" rows="7" placeholder="例如：杭州出发，35人，9月周五，一日，想轻松一点，有草坪和烧烤，预算人均300左右"></textarea>
      <div class="conversion-action-row">
        <span>方案资料仍由企业方案库维护，不复制到本工作台。</span>
        <button class="primary-button" id="conversionProposalBtn" type="button">开始匹配方案</button>
      </div>
      <section class="conversion-result" id="conversionProposalResult">${conversionResult ? readableConversionValue(conversionResult) : '<div class="conversion-empty">匹配结果会在这里按推荐理由、风险和下一步呈现。</div>'}</section>
    </section>`;
}

function renderConversionJourney() {
  const roles = conversionRoles();
  const lanes = Object.entries(roles);
  return `
    <section class="conversion-journey-shell">
      <header><span>用户旅程</span><h3>从公域咨询，到方案、决策与长期跟进</h3><p>先判断客户现在在哪个节点，再选择动作；不从第一句话直接跳到报价。</p></header>
      <div class="conversion-journey-lanes">
        ${lanes.map(([roleName, role]) => `
          <section class="conversion-journey-lane">
            <div class="conversion-journey-role"><strong>${escapeHtml(roleName)}</strong><span>${Number(role.问题数 || 0)} 个问题</span></div>
            ${(role.环节 || []).map((stage, index) => `
              <article><b>${String(index + 1).padStart(2, "0")}</b><div><strong>${escapeHtml(stage.名称 || "")}</strong><p>${escapeHtml(stage.原则 || "")}</p></div></article>`).join("")}
          </section>`).join("")}
      </div>
    </section>`;
}

function bindConversionWorkspace() {
  $$("[data-conversion-role]").forEach((button) => button.addEventListener("click", () => {
    conversionRole = button.dataset.conversionRole;
    conversionResult = null;
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
      button.textContent = "查找回复话术";
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
      button.textContent = "开始匹配方案";
    }
  });
}

function renderConversionHub() {
  const content = $("#conversionContent");
  if (!content) return;
  $$("[data-conversion-module]").forEach((button) => button.classList.toggle("active", button.dataset.conversionModule === conversionModule));
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

async function ensureEmbeddedConversionApp(force = false) {
  const frame = $("#conversionAppFrame");
  const status = $("#conversionEmbeddedStatus");
  if (!frame) return;
  if (!force && frame.dataset.ready === "1") return;
  if (status) {
    status.hidden = false;
    status.textContent = "正在加载流量转化…";
  }
  try {
    let snapshot = await api("/api/conversion/snapshot");
    if (!snapshot?.ok) {
      await api("/api/conversion/start", { method: "POST" });
      await new Promise((resolve) => window.setTimeout(resolve, 1800));
      snapshot = await api("/api/conversion/snapshot");
    }
    if (!snapshot?.ok) throw new Error(snapshot?.error || "流量转化模块尚未就绪");
    frame.onload = () => {
      frame.dataset.ready = "1";
      syncConversionTheme();
      if (status) status.hidden = true;
    };
    const theme = document.body.dataset.theme || "neo";
    frame.src = `/conversion-integrated/?embedded=1&theme=${encodeURIComponent(theme)}&v=${Date.now()}`;
  } catch (error) {
    if (status) {
      status.hidden = false;
      status.innerHTML = `流量转化暂时无法加载。<button type="button" id="retryConversionEmbedBtn">重试</button>`;
      $("#retryConversionEmbedBtn")?.addEventListener("click", () => ensureEmbeddedConversionApp(true));
    }
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
    version: "0.2.2",
    status: "可用",
    statusTone: "ready",
    description: "在 ChatGPT 右侧提供素材库和成品库，支持筛选、拖入真实附件、生产指令、下载打包与使用次数回填。",
    capabilities: ["素材传 GPT", "全库标签筛选", "生成结果下载", "生产历史"],
    localPath: "D:\\AICode\\工具开发\\projects\\teambuilding-gpt-production-extension",
    installPath: "D:\\AICode\\工具开发\\projects\\teambuilding-gpt-production-extension\\releases\\0.2.2",
    sourceUrl: "https://github.com/zwmopen/teambuilding-gpt-production-extension",
    releaseUrl: "https://github.com/zwmopen/teambuilding-gpt-production-extension/releases/tag/v0.2.2",
    sourceLabel: "开源仓库"
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
  const buttonContent = `<span aria-hidden="true">?</span>`;
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
    ensureEmbeddedConversionApp().catch(() => {});
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

function bindEvents() {
  $("#dashboardView .work-canvas")?.addEventListener("scroll", maybeLoadMoreMaterials, { passive: true });
  $("#productsView .product-preview-pane")?.addEventListener("scroll", maybeLoadMoreProducts, { passive: true });
  document.addEventListener("click", async (event) => {
    if (!event.target.closest(".custom-select")) closeCustomSelects();
    if (!event.target.closest(".context-menu")) hideContextMenu();
    const imagePreview = event.target.closest("[data-image-preview]");
    if (imagePreview) {
      event.preventDefault();
      event.stopPropagation();
      openImageLightbox(imagePreview.dataset.imagePreview, imagePreview.dataset.imageCaption || "图片预览");
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
      renderWorkbenchProducts();
    }
    const productItem = event.target.closest("[data-workbench-product]");
    if (productItem) {
      const productPath = productItem.dataset.workbenchProduct;
      const checked = productItem.querySelector("input")?.checked;
      if (checked) workbenchSelectedProducts.add(productPath);
      else workbenchSelectedProducts.delete(productPath);
      renderWorkbenchProducts();
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
    if (themeCycle) applyTheme(document.body.dataset.theme === "neo" ? "glass" : "neo");
  });
  document.addEventListener("change", (event) => {
    const classification = event.target.closest?.("[data-classify-collection]");
    if (classification) classifyDistributionCollection(
      classification.dataset.classifyCollection,
      classification.value
    );
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCustomSelects();
      closeImageLightbox();
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
  $("#createProductionPlanBtn")?.addEventListener("click", () => (
    activeProductionPlan ? confirmProductionPlan() : createProductionPlan()
  ));
  $("#cancelProductionPlanBtn")?.addEventListener("click", () => {
    invalidateProductionPlan();
    setProductionLiveStatus("已取消当前计划，可以重新选择。");
  });
  $("#productionApiProvider")?.addEventListener("change", () => {
    const provider = $("#productionApiProvider").value;
    const defaults = {
      "local-openai": {
        baseUrl: "http://localhost:62104/v1",
        model: "gpt-image-2",
        textModel: "gpt-5.6-terra",
        message: "已切换本地 GPT 生图。"
      },
      bytecat: {
        baseUrl: "https://codecdn.bytecatcode.org/v1",
        model: "gpt-image-2",
        textModel: "gpt-5.6-terra",
        message: "已切换 ByteCat Image 2.0；图片走 ByteCat，文案自动走本地接口。"
      },
      minimax: {
        baseUrl: "https://api.minimaxi.com/v1",
        model: "image-01",
        textModel: "gpt-5.6-terra",
        message: "已切换 MiniMax；请测试当前密钥是否有效。"
      }
    };
    const selected = defaults[provider] || defaults["local-openai"];
    $("#productionApiBaseUrl").value = selected.baseUrl;
    $("#productionApiModel").value = selected.model;
    if ($("#productionTextModel")) $("#productionTextModel").value = selected.textModel;
    setProductionLiveStatus(selected.message);
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
  $("#workbenchApplyMaterialRootBtn")?.addEventListener("click", () => {
    saveWorkspacePaths({
      materialRoot: $("#workbenchMaterialRoot").value,
      materialOnly: true,
      returnTab: "dashboard"
    }).catch((error) => showSystemNotice("素材库没有读取成功", error.message, { tone: "danger" }));
  });
  $("#workbenchMaterialRoot")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    $("#workbenchApplyMaterialRootBtn")?.click();
  });
  bindCollectionRootControls("#workbenchProductRoot", "#workbenchChooseProductRootBtn", "#workbenchApplyProductRootBtn", "dashboard");
  $("#workbenchMaterialCategory")?.addEventListener("change", async (event) => {
    const categoryPath = event.target.value;
    const category = dashboard?.materials?.categories?.find((item) => item.path === categoryPath);
    saveLocalState({ selectedMaterialCategory: category?.name || "", selectedMaterialCategoryPath: categoryPath, selectedMaterial: "" });
    await loadDashboard(false, categoryPath);
    renderWorkbenchMaterials();
    toast("已切换素材分类");
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
  $("#reconcileDistributionFoldersBtn")?.addEventListener("click", reconcileDistributionFolders);
  $("#copyDistributionCommand")?.addEventListener("click", () => copyText($("#distributionCommand").value, "分发指令已复制"));
  $("#refreshJuguangBtn")?.addEventListener("click", async () => {
    await loadJuguang(true);
    toast("聚光数据已刷新");
  });
  $("#juguangKeywordSearch")?.addEventListener("input", renderJuguangRecommendations);
  $("#pluginMarketSearch")?.addEventListener("input", renderPluginMarket);
  $("#importLifeGameCloudBtn")?.addEventListener("click", importLifeGameCloudConfig);
  $("#testCloudBackupBtn")?.addEventListener("click", testCloudBackup);
  $("#runCloudBackupBtn")?.addEventListener("click", runCloudBackup);

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
    renderConversionHub();
  }));

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
window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin || event.data?.type !== "jianghu-theme-ready") return;
  const frame = $("#conversionAppFrame");
  if (frame) frame.dataset.themeSynced = document.body.dataset.theme || "neo";
  syncConversionTheme();
});
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
const themeDefaultVersion = "jianghu-knowledge-two-themes-v1";
const storedThemeDefaultVersion = localStorage.getItem("tb-dashboard-theme-default-version");
const initialTheme = storedThemeDefaultVersion === themeDefaultVersion
  ? (localStorage.getItem("tb-dashboard-theme") || "neo")
  : "neo";
localStorage.setItem("tb-dashboard-theme-default-version", themeDefaultVersion);
applyTheme(initialTheme);
loadDashboard()
  .then(() => {
    renderPluginMarket();
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
