(function initTeambuildingPatrolStage(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TeambuildingGptPatrolStage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function result(key, label, nextActionKey, safeToAct, detail = "") {
    return { key, label, nextActionKey, safeToAct, detail };
  }

  function classifyPatrolStage(options = {}) {
    const stage = String(options.stage || "").trim();
    const imageCount = Math.max(0, Number(options.imageCount || 0));
    const expectedImageCount = Math.max(0, Number(options.expectedImageCount || 0));
    const generating = Boolean(options.generating);

    if (!stage || stage === "unknown") {
      return options.hasMaterialBoundary
        ? result("uncertain", "阶段证据不足", "inspect", false, "保留只读，禁止猜测下一步")
        : result("awaiting-material", "待上传素材", "upload-material", true);
    }
    if (stage === "waiting-plan") return result("waiting-plan", "已发素材，等待逐页计划", "wait", false);
    if (stage === "plan-ready") return result("awaiting-confirm", "计划完成，待回复 1", "send-confirm", true);
    if (stage === "generation-limit-or-script") {
      return result("limit-or-script", "疑似触顶或脚本兜底", "pause", false, "等待额度恢复或人工复核")
    }
    if (stage === "waiting-images") {
      if (generating) return result("generating-images", "正在生成图片", "wait", false);
      if (imageCount > 0 && expectedImageCount > imageCount) {
        return result("partial-images", `图片不足（${imageCount}/${expectedImageCount}）`, "regenerate-batch", true, "只能整批重做，不能补单张混批");
      }
      return result("waiting-images", "已回复 1，等待图片", "wait", false);
    }
    if (stage === "images-ready") return result("awaiting-copy", `图片完成（${imageCount} 张），待文案`, "request-copy", true);
    if (stage === "waiting-copy") return result("waiting-copy", "已请求文案，等待成稿", "wait", false);
    if (stage === "completed-copy-pending-package") {
      return result("awaiting-package", "图片和文案完成，待下载归档", "download-and-package", true);
    }
    if (stage === "completed" || stage === "archived") return result("completed", "作品已闭环", "none", false);
    return result("uncertain", "阶段证据不足", "inspect", false, "保留只读，禁止猜测下一步");
  }

  return { classifyPatrolStage };
});
