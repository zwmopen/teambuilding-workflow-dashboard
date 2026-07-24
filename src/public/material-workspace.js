(function materialWorkspaceModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MaterialWorkspace = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMaterialWorkspace() {
  const allowedTabs = new Set(["dashboard", "products", "distribution", "publishing", "review", "settings"]);

  function resolveInitialTab(savedTab) {
    return allowedTabs.has(savedTab) ? savedTab : "dashboard";
  }

  function buildMaterialTree(categories, selectedId = "", expandedPaths = []) {
    const expanded = new Set(expandedPaths || []);
    return (categories || []).map((category) => ({
      name: category.name || "未命名素材库",
      path: category.path || "",
      count: Number(category.count || category.items?.length || 0),
      expanded: expanded.has(category.path),
      items: (category.items || []).map((item) => ({
        ...item,
        selected: item.id === selectedId,
        imageCount: Number(item.imageCount || 0)
      }))
    }));
  }

  function buildChatGptInstruction(item, category, template = "T04") {
    return [
      `请按 ${template || "T04"} 固定母版处理当前团建素材。`,
      `素材分类：${category?.name || "未分类"}`,
      `帖子文件夹：${item?.name || "未选择"}`,
      `本地文件夹：${item?.path || ""}`,
      `素材图片：${Number(item?.imageCount || 0)} 张`,
      "",
      "请先读取已发送的图片与文案，给出逐页出图计划；确认后再按现有网页脚本和本地工作包流程执行。"
    ].join("\n");
  }

  function installShell() {
    const overviewTab = document.querySelector('[data-tab="overview"]');
    const overviewView = document.querySelector("#overviewView");
    overviewTab?.remove();
    overviewView?.remove();

    const dashboardTab = document.querySelector('[data-tab="dashboard"]');
    dashboardTab?.classList.add("active");

    const distributionTab = document.querySelector('[data-tab="distribution"]');
    if (distributionTab && !document.querySelector('[data-tab="publishing"]')) {
      distributionTab.insertAdjacentHTML("afterend", `
        <button class="tab rail-tab" data-tab="publishing" type="button" title="发布调度">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h11"/><path d="m13 8 4 4-4 4"/><rect x="4" y="4" width="16" height="16" rx="4"/></svg>
          <span>发布调度</span><small class="rail-plan-badge">待开发</small>
        </button>
      `);
    }

    const dashboardView = document.querySelector("#dashboardView");
    if (dashboardView) {
      dashboardView.classList.add("active");
      dashboardView.innerHTML = `
        <section class="material-workspace">
          <header class="material-workspace-head">
            <div>
              <p class="label">本地素材 × 真实网页</p>
              <h2>素材生产</h2>
              <p>左侧读取本地帖子文件夹；右侧连接现有 ChatGPT、网页脚本与本地工作包。</p>
            </div>
            <div class="workspace-head-actions">
              <button class="ghost-button" id="openProjectBtn" type="button">打开项目目录</button>
              <button class="primary-button" id="materialRefreshBtn" type="button">刷新文件树</button>
            </div>
          </header>
          <div class="material-dual-pane">
            <aside class="material-tree-panel">
              <div class="tree-toolbar">
                <div><strong>本地素材</strong><span id="treeSummary">正在读取…</span></div>
                <input id="materialSearch" class="search-input" placeholder="搜索文件夹或帖子" />
              </div>
              <div id="materialFeed" class="material-folder-tree" aria-label="本地素材文件树"></div>
            </aside>
            <section class="gpt-connection-panel">
              <header class="gpt-connection-head">
                <div class="browser-traffic" aria-hidden="true"><i></i><i></i><i></i></div>
                <div>
                  <strong>ChatGPT · 真实网页工作区</strong>
                  <span>使用你已经登录的浏览器账号和现有网页脚本</span>
                </div>
                <button id="openChatGptBtn" class="primary-button" type="button">打开 / 激活 ChatGPT</button>
              </header>
              <div class="gpt-address">
                <span class="status-dot"></span>
                <code>chatgpt.com</code>
                <span>会话、母版和脚本继续使用原件，不复制源码</span>
              </div>
              <section class="gpt-task-card">
                <div class="task-card-head">
                  <div><p class="label">当前传输任务</p><h3 id="focusPreviewTitle">请选择左侧帖子</h3></div>
                  <span id="focusPreviewMeta">尚未绑定素材</span>
                </div>
                <div class="task-preview-row">
                  <figure class="focus-preview compact" id="focusPreview">
                    <img id="focusPreviewImage" alt="当前素材封面" />
                    <textarea id="focusPreviewText" class="focus-preview-text" spellcheck="false"></textarea>
                    <figcaption hidden></figcaption>
                  </figure>
                  <div class="task-copy">
                    <label for="commandBox">发送给 GPT 的内容</label>
                    <textarea id="commandBox" class="command-box" spellcheck="false"></textarea>
                  </div>
                </div>
                <p id="materialPath" class="path-line">选择帖子后显示本地路径</p>
                <section class="production-status" id="productionStatus" aria-live="polite"></section>
                <div class="gpt-action-grid">
                  <button class="primary-button" id="sendSelectedToGptBtn" type="button">传 GPT</button>
                  <button class="ghost-button" id="copyCommandBtn" type="button">复制生产指令</button>
                  <button class="ghost-button" id="copyMaterialBtn" type="button">打开帖子文件夹</button>
                  <button class="ghost-button" id="runWorkPackageBtn" type="button">运行本地工作包</button>
                  <button class="ghost-button" id="configureWorkPackageBtn" type="button">配置工作包</button>
                </div>
                <div class="integration-note">
                  <strong>联动方式</strong>
                  <span>“传 GPT”会准备当前帖子路径与生产指令，并打开真实 ChatGPT。浏览器中的对话树、图片下载和一键工作包脚本照常工作。</span>
                </div>
              </section>
            </section>
          </div>
          <div class="legacy-material-controls" hidden>
            <strong id="statMaterialCategories"></strong><strong id="statMaterialItems"></strong><strong id="statTemplates"></strong><strong id="statProducts"></strong>
            <input id="filterMatchSwitch" type="checkbox" checked />
            <select id="materialLibraryFilter"></select><select id="materialTypeKeywordFilters"></select><select id="durationKeywordFilters"></select>
            <select id="locationKeywordFilters"></select><select id="activityKeywordFilters"></select><select id="seasonKeywordFilters"></select>
            <select id="monthKeywordFilters"></select><select id="festivalKeywordFilters"></select><select id="templateQuickSelect"></select>
            <select id="materialQuickSelect"></select><select id="materialSortSwitch"></select>
            <button id="collectFilteredBtn"></button><button id="openTemplateBtn"></button><button id="viewCopyBtn"></button>
          </div>
        </section>
      `;
    }

    if (!document.querySelector("#publishingView")) {
      const reviewView = document.querySelector("#reviewView");
      reviewView?.insertAdjacentHTML("beforebegin", `
        <section class="view" id="publishingView">
          <section class="future-feature">
            <div class="future-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h11"/><path d="m13 8 4 4-4 4"/><rect x="4" y="4" width="16" height="16" rx="4"/></svg></div>
            <p class="label">兼容性预留入口</p>
            <h2>发布调度</h2>
            <p>这里先保留位置，不模拟自动发布。后续再接入设备、账号、网络状态、错峰队列和人工确认。</p>
            <span>当前状态：等待后续开发</span>
          </section>
        </section>
      `);
    }
  }

  return {
    resolveInitialTab,
    buildMaterialTree,
    buildChatGptInstruction,
    installShell
  };
});
