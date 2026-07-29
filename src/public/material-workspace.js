(function materialWorkspaceModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MaterialWorkspace = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMaterialWorkspace() {
  const allowedTabs = new Set(["dashboard", "distribution", "conversion", "plugins", "settings"]);

  function resolveInitialTab(savedTab) {
    return allowedTabs.has(savedTab) ? savedTab : "dashboard";
  }

  function inferSelectionMode(materialPaths = []) {
    const paths = [...new Set((materialPaths || []).filter(Boolean))];
    return {
      mode: paths.length > 1 ? "batch" : "set",
      workCount: paths.length,
      label: paths.length ? `已选 ${paths.length} 个素材文件夹` : "未选择素材"
    };
  }

  function categoryCountLabel(category = {}) {
    return category.loaded === false && category.countKnown === false
      ? "未读取"
      : String(Number(category.count || 0));
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
    document.querySelector('[data-tab="publishing"]')?.remove();
    document.querySelector("#publishingView")?.remove();
  }

  return {
    resolveInitialTab,
    inferSelectionMode,
    categoryCountLabel,
    buildMaterialTree,
    buildChatGptInstruction,
    installShell
  };
});
