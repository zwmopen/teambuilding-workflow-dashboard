(function materialWorkspaceModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MaterialWorkspace = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMaterialWorkspace() {
  const allowedTabs = new Set(["dashboard", "products", "distribution", "review", "settings"]);

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

    document.querySelector('[data-tab="publishing"]')?.remove();
    document.querySelector("#publishingView")?.remove();

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
          <section class="material-root-bar" aria-label="项目目录设置">
            <div>
              <span class="label">项目目录设置</span>
              <strong>递归扫描素材帖子</strong>
            </div>
            <input id="materialRootInput" class="search-input" type="text" placeholder="选择目录，或粘贴本地目录路径后按回车" />
            <button id="chooseMaterialRootBtn" class="ghost-button" type="button">选择目录</button>
            <button id="applyMaterialRootBtn" class="primary-button" type="button">扫描目录</button>
          </section>
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
              </header>
              <div class="gpt-address">
                <span class="status-dot"></span>
                <code>chatgpt.com</code>
                <span>会话、母版和脚本继续使用原件，不复制源码</span>
              </div>
              <section class="gpt-browser-placeholder">
                <div>
                  <strong>ChatGPT 真实网页</strong>
                  <p>桌面应用会在这里直接显示可登录的 ChatGPT 网页，并保留原有脚本和账号会话。</p>
                  <button id="openChatGptBtn" class="primary-button" type="button">在当前浏览器打开 ChatGPT</button>
                </div>
              </section>
              <div hidden>
                <h3 id="focusPreviewTitle"></h3><span id="focusPreviewMeta"></span>
                <figure id="focusPreview"><img id="focusPreviewImage" alt="" /><textarea id="focusPreviewText"></textarea></figure>
                <textarea id="commandBox"></textarea><p id="materialPath"></p><section id="productionStatus"></section>
                <button id="sendSelectedToGptBtn"></button><button id="copyCommandBtn"></button><button id="copyMaterialBtn"></button>
                <button id="runWorkPackageBtn"></button><button id="configureWorkPackageBtn"></button>
              </div>
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

  }

  return {
    resolveInitialTab,
    buildMaterialTree,
    buildChatGptInstruction,
    installShell
  };
});
