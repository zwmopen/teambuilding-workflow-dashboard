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
let collectionFilters = { type: "all", platform: "all", query: "" };
let selectedCollectionName = "";
let activeDistributionPanel = "phones";
let deviceCheckState = { registered: null, online: null, output: "" };
const expandedMaterialPaths = new Set();
let materialTreeInitialized = false;

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
  if (!response.ok) throw new Error(await response.text());
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
  return String(value || "").replace(/[&<>'"]/g, (char) => ({
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
  if (force) params.set("refresh", "1");
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
  if ($("#overviewView")) renderOverview();
  restoreSelection();
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
  $("#treeSummary").textContent = `${categories.length} 个素材库 · ${entries.length} 个帖子`;
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
              <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(shortText(item.preview || "本地帖子文件夹", 34))}</small></span>
            </button>
            <button class="tree-send-button" type="button" data-tree-send="${escapeHtml(item.id)}">传 GPT <span>→</span></button>
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
  if (state === "available" || state === "archived" || state === "confirmed_published") return "good";
  if (state === "reserved_pending_upload" || state === "unknown") return "warn";
  if (state === "invalid") return "bad";
  return "";
}

function renderCollectionFilters() {
  const counts = DistributionUI.countCollectionFacets(
    dashboard?.distribution?.collections || [],
    collectionFilters
  );
  const typeOptions = [
    ["all", "全部"],
    ["traffic", "游戏/泛流量"],
    ["conversion", "团建转化"],
    ["unclassified", "未分类"]
  ];
  const platformOptions = [
    ["all", "全部状态"],
    ["dual", "双平台可用"],
    ["xhs", "小红书可用"],
    ["official", "公众号可用"],
    ["official_pending", "已领取待上传"],
    ["douyin_archived", "抖音已归档"],
    ["all_used", "全部已使用"]
  ];
  const render = (selector, options, key) => {
    const container = $(selector);
    if (!container) return;
    const facetCounts = key === "type" ? counts.types : counts.platforms;
    container.innerHTML = options.map(([value, label]) => `
      <button type="button" class="filter-chip ${collectionFilters[key] === value ? "active" : ""}" data-filter-key="${key}" data-filter-value="${value}">
        <span>${label}</span><strong class="filter-chip-count">${formatNumber(facetCounts[value])}</strong>
      </button>
    `).join("");
  };
  render("#collectionTypeFilters", typeOptions, "type");
  render("#collectionPlatformFilters", platformOptions, "platform");
}

function getFilteredCollections() {
  return DistributionUI.filterCollections(
    dashboard?.distribution?.collections || [],
    collectionFilters
  );
}

function renderCollections() {
  const data = dashboard?.distribution;
  if (!data) return;
  renderCollectionFilters();
  const collections = getFilteredCollections();
  const list = $("#collectionList");
  list.innerHTML = collections.length ? collections.map((collection) => {
    const badges = [
      [collection.typeLabel, collection.type === "unclassified" ? "warn" : ""],
      [`小红书 ${DistributionUI.platformStateLabel(collection.xhs)}`, collectionStateClass(collection.xhs)],
      [`抖音 ${DistributionUI.platformStateLabel(collection.douyin)}`, collectionStateClass(collection.douyin)],
      [`公众号 ${DistributionUI.platformStateLabel(collection.officialAccount)}`, collectionStateClass(collection.officialAccount)]
    ];
    return `
      <article class="collection-row ${selectedCollectionName === collection.name ? "active" : ""}" data-collection="${escapeHtml(collection.name)}">
        <div class="collection-count">${collection.itemCount || 0}/14</div>
        <div class="collection-title"><strong>${escapeHtml(collection.name)}</strong><span>${collection.dualPlatformEligible ? "可用于双平台手机" : (collection.exclusionReasons?.[0] || "查看平台使用状态")}</span></div>
        <div class="badge-line">${badges.map(([label, className]) => `<span class="state-badge ${className}">${escapeHtml(label)}</span>`).join("")}</div>
        <button class="collection-open" type="button" aria-label="查看 ${escapeHtml(collection.name)}">›</button>
      </article>
    `;
  }).join("") : `<div class="empty-state"><strong>没有匹配的作品集</strong><p>换一个类型或平台状态筛选。</p></div>`;
  if (!selectedCollectionName || !collections.some((item) => item.name === selectedCollectionName)) {
    selectedCollectionName = collections[0]?.name || "";
  }
  renderCollectionDetail(selectedCollectionName);
}

function renderCollectionDetail(name) {
  const container = $("#collectionDetail");
  const collection = dashboard?.distribution?.collections?.find((item) => item.name === name);
  if (!container || !collection) {
    if (container) container.innerHTML = `<div class="empty-state"><strong>选择一个作品集</strong><p>查看平台资格和使用记录。</p></div>`;
    return;
  }
  selectedCollectionName = collection.name;
  $$(".collection-row").forEach((row) => row.classList.toggle("active", row.dataset.collection === collection.name));
  const platform = (label, state) => `
    <div class="platform-state"><span>${label}</span><strong>${DistributionUI.platformStateLabel(state)}</strong></div>
  `;
  container.innerHTML = `
    <h3>${escapeHtml(collection.name)}</h3>
    <p>${escapeHtml(collection.typeLabel)} · ${collection.itemCount || 0} 条 · ${collection.fileCount || 0} 个文件 · ${formatBytes(collection.bytes)}</p>
    <div class="platform-state-grid">
      ${platform("小红书", collection.xhs)}
      ${platform("抖音", collection.douyin)}
      ${platform("公众号", collection.officialAccount)}
      <div class="platform-state"><span>双平台手机</span><strong>${collection.dualPlatformEligible ? "可分发" : "不可分发"}</strong></div>
      <div class="platform-state"><span>手机分发记录</span><strong>${collection.deviceHistoryCount || 0} 次</strong></div>
      <div class="platform-state"><span>公众号记录</span><strong>${collection.officialAccountHistoryCount || 0} 次</strong></div>
    </div>
    ${collection.exclusionReasons?.length ? `<div class="detail-warning">${escapeHtml(collection.exclusionReasons.join("；"))}</div>` : ""}
    <div class="detail-button-row">
      <button type="button" data-open-collection="${escapeHtml(collection.sourcePath)}">打开源文件夹</button>
      <button type="button" data-distribute-collection="${escapeHtml(collection.name)}">进入分发</button>
    </div>
  `;
}

function renderDistribution() {
  const data = dashboard?.distribution || { summary: {}, devices: [] };
  const summary = data.summary || {};
  const devices = data.devices || [];
  $("#distributionPhones").innerHTML = `
    <div class="distribution-stats">
      ${DistributionUI.phoneDistributionStats(summary, deviceCheckState, devices.length)
        .map(([label, value]) => `<article class="summary-card"><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`).join("")}
    </div>
    <div class="device-list">${devices.map((device) => `
      <article class="device-row">
        <div class="device-number">${device.number}号</div>
        <div><h3>${escapeHtml(device.displayName)}</h3><p>${escapeHtml(device.ownerGroup)} · ${escapeHtml((device.platforms || []).join(" + "))}</p></div>
        <div class="badge-line"><span class="state-badge">${device.platforms?.length === 1 ? "单平台设备" : "双平台设备"}</span></div>
        <div class="device-actions">
          <button type="button" data-device-action="traffic" data-device="${escapeHtml(device.aliases?.[0] || device.displayName)}">补泛流量</button>
          <button type="button" data-device-action="conversion" data-device="${escapeHtml(device.aliases?.[0] || device.displayName)}">补团建转化</button>
        </div>
      </article>
    `).join("")}</div>
  `;
  const pending = data.collections?.filter((item) => item.officialAccount === "reserved_pending_upload") || [];
  $("#distributionOfficial").innerHTML = `
    <div class="distribution-stats">
      ${[["公众号活跃入口", summary.officialAvailable || 0], ["已领取待上传", summary.officialPending || 0], ["已确认上传", summary.officialConfirmed || 0], ["入口异常", data.collections?.filter((item) => item.officialAccount === "invalid").length || 0]]
        .map(([label, value]) => `<article class="summary-card"><span>${label}</span><strong>${value}</strong></article>`).join("")}
    </div>
    <div class="detail-warning">领取不等于发布。只有你确认电脑上传完成后，状态才会变为“已确认上传”。</div>
    <div class="record-list">
      ${pending.map((collection) => `<article class="official-card"><div class="device-number">待</div><div><h3>${escapeHtml(collection.name)}</h3><p>江湖有旅人团建策划师 · 已领取待电脑上传</p></div><span class="state-badge warn">等待人工确认</span><div class="device-actions"><button data-confirm-official="${escapeHtml(collection.name)}">确认上传完成</button></div></article>`).join("")}
      <article class="official-card"><div class="device-number">${summary.officialAvailable || 0}</div><div><h3>随机领取一个公众号作品集</h3><p>优先选择小红书和抖音入口均已处理的合集</p></div><span class="state-badge good">电脑批量上传</span><div class="device-actions"><button data-official-action="execute">随机领取</button></div></article>
    </div>
  `;
  $("#distributionHistory").innerHTML = renderDistributionRecords(data.deviceHistory || [], "device");
  const archiveCollections = data.collections?.filter((item) => item.douyin === "archived" || item.douyin === "invalid") || [];
  $("#distributionArchive").innerHTML = archiveCollections.length ? `<div class="record-list">${archiveCollections.map((item) => `
    <article class="record-row"><div class="device-number">抖</div><div><h3>${escapeHtml(item.name)}</h3><p>${item.douyin === "archived" ? "归档入口有效，可按安全规则恢复" : "归档入口存在，但源目录不可用"}</p></div><span class="state-badge ${item.douyin === "archived" ? "good" : "bad"}">${item.douyin === "archived" ? "已归档" : "入口异常"}</span><div></div></article>
  `).join("")}</div>` : `<div class="empty-state"><strong>暂无抖音归档</strong><p>单平台手机分发成功后的抖音入口会显示在这里。</p></div>`;
  showDistributionPanel(activeDistributionPanel);
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
  activeDistributionPanel = panel || "phones";
  $$("#distributionTabs button").forEach((button) => button.classList.toggle("active", button.dataset.panel === activeDistributionPanel));
  $$(".distribution-panel").forEach((section) => section.classList.toggle("active", section.id === `distribution${activeDistributionPanel[0].toUpperCase()}${activeDistributionPanel.slice(1)}`));
}

function applyTheme(theme) {
  const value = ["solid", "glass", "neumorphic"].includes(theme) ? theme : "solid";
  document.body.dataset.theme = value;
  localStorage.setItem("tb-dashboard-theme", value);
  $$(".theme-option").forEach((button) => button.classList.toggle("active", button.dataset.theme === value));
}

async function executeDistributionAction(payload, description) {
  const confirmed = window.confirm(`${description}\n\n接收确认后，现有分发技能会按平台规则处理 Junction；源作品集不会删除。是否继续？`);
  if (!confirmed) return;
  toast("正在执行真实分发，请保持设备接收页面开启");
  try {
    const result = await api("/api/distribution/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, confirmed: true })
    });
    window.alert(result.output || "操作已完成");
    await loadDashboard(true);
    activateTab("distribution");
  } catch (error) {
    window.alert(`分发未完成：${error.message}`);
  }
}

async function confirmOfficialCollection(collection) {
  if (!window.confirm(`确认“${collection}”已经在电脑端上传完成？\n\n这会追加一条确认记录，不会删除源作品集。`)) return;
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
    window.alert(`确认失败：${error.message}`);
  }
}

async function checkDistributionDevices() {
  toast("正在扫描设备与库存");
  try {
    const result = await api("/api/distribution/check", { method: "POST" });
    deviceCheckState = {
      ...DistributionUI.parseDeviceCheckOutput(result.output),
      output: result.output || ""
    };
    await loadDashboard(true);
    activateTab("distribution");
    toast(deviceCheckState.online == null ? "扫描完成，请查看结果" : `扫描完成：当前在线 ${deviceCheckState.online} 台`);
  } catch (error) {
    window.alert(`扫描失败：${error.message}`);
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
  if (name === "distribution") renderDistribution();
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
  if (name === "settings") applyTheme(localStorage.getItem("tb-dashboard-theme") || "solid");
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
  await openExternal("https://chatgpt.com/");
  toast("帖子与指令已准备，正在打开真实 ChatGPT");
}

async function renamePath(targetPath, currentLabel) {
  if (!targetPath) return;
  const oldName = (currentLabel || targetPath).replace(/（\\d+条）$/, "").trim();
  const nextName = window.prompt("输入新的文件夹名称", oldName);
  if (!nextName || nextName === oldName) return;
  await api("/api/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: targetPath, newName: nextName })
  });
  await loadDashboard(true, $("#materialLibraryFilter")?.value || "");
  toast("已重命名并刷新");
}

function buildTemplateCommand(target) {
  return `请把这个素材识别并转化为团建笔记模板：\\n\\n素材/模板名称：${target?.label || ""}\\n本地路径：${target?.path || ""}\\n\\n执行要求：\\n1. 读取该文件夹里的图片和文案，只分析固定视觉骨架，不继承具体内容主题。\\n2. 识别封面结构、内页结构、字体气质、配色、标题位置、拼图比例、页面角色和适用素材类型。\\n3. 按“封面核心结构＋标题样式 × 内页结构＋拼图样式”自动命名模板。\\n4. 在 01-素材库/团建攻略图文素材/模板素材 下创建对应模板文件夹，复制参考图，写入模板说明.md 和模板提示词.md。\\n5. 更新 02-模板库/爆款链接库.csv，记录模板ID、模板名称、适用内容、默认页数、源模板路径和状态。\\n6. 后续生产时把它作为 A 类永久视觉母版，素材只负责提供内容。`;
}

function bindEvents() {
  $("#dashboardView .work-canvas")?.addEventListener("scroll", maybeLoadMoreMaterials, { passive: true });
  $("#productsView .product-preview-pane")?.addEventListener("scroll", maybeLoadMoreProducts, { passive: true });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".custom-select")) closeCustomSelects();
    if (!event.target.closest(".context-menu")) hideContextMenu();
    const jump = event.target.closest("[data-jump]");
    if (jump) activateTab(jump.dataset.jump);
    const treeToggle = event.target.closest("[data-tree-toggle]");
    if (treeToggle) {
      const categoryPath = treeToggle.dataset.treeToggle;
      if (expandedMaterialPaths.has(categoryPath)) expandedMaterialPaths.delete(categoryPath);
      else expandedMaterialPaths.add(categoryPath);
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
    const collectionRow = event.target.closest("[data-collection]");
    if (collectionRow) renderCollectionDetail(collectionRow.dataset.collection);
    const openCollection = event.target.closest("[data-open-collection]");
    if (openCollection?.dataset.openCollection) openPath(openCollection.dataset.openCollection);
    const enterDistribution = event.target.closest("[data-distribute-collection]");
    if (enterDistribution) {
      activateTab("distribution");
      $("#distributionCommand").value = `分发 ${enterDistribution.dataset.distributeCollection}`;
    }
    const distributionTab = event.target.closest("#distributionTabs [data-panel]");
    if (distributionTab) showDistributionPanel(distributionTab.dataset.panel);
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
        "将为“江湖有旅人团建策划师”随机领取一个公众号作品集，并记录为已领取待电脑上传。"
      );
    }
    const confirmOfficial = event.target.closest("[data-confirm-official]");
    if (confirmOfficial) confirmOfficialCollection(confirmOfficial.dataset.confirmOfficial);
    const theme = event.target.closest("[data-theme]");
    if (theme) applyTheme(theme.dataset.theme);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCustomSelects();
  });

  $("#refreshBtn").addEventListener("click", async () => {
    await loadDashboard(true, $("#materialLibraryFilter")?.value || "");
    toast("已刷新本地库");
  });
  $("#materialRefreshBtn")?.addEventListener("click", async () => {
    await loadDashboard(true);
    toast("本地文件树已刷新");
  });
  $("#openChatGptBtn")?.addEventListener("click", () => openExternal("https://chatgpt.com/"));
  $("#sendSelectedToGptBtn")?.addEventListener("click", () => transmitMaterialToGpt());
  $("#runWorkPackageBtn")?.addEventListener("click", () => openExternal("cgpt-workpkg://run"));
  $("#configureWorkPackageBtn")?.addEventListener("click", () => openExternal("cgpt-workpkg://configure"));
  $("#overviewRefreshBtn")?.addEventListener("click", async () => {
    await loadDashboard(true);
    activateTab("overview");
    toast("已刷新真实状态");
  });
  $("#distributionRefreshBtn")?.addEventListener("click", async () => {
    await checkDistributionDevices();
  });
  $("#openPublishRootBtn")?.addEventListener("click", () => openPath(dashboard?.distribution?.publishRoot));
  $("#collectionSearch")?.addEventListener("input", (event) => {
    collectionFilters.query = event.target.value;
    renderCollections();
  });
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
applyTheme(localStorage.getItem("tb-dashboard-theme") || "solid");
loadDashboard().catch((error) => {
  console.error(error);
  toast("读取本地库失败");
});
