(function initTeambuildingGptAutomationCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TeambuildingGptAutomationCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function parsePlannedImageCount(text) {
    const source = String(text || "");
    // GPT does not use one fixed label. Real plans commonly say
    // “本轮输出页数：10 页”, “建议输出：9 页”, “预计输出总张数：9 张”
    // or only enumerate P1/P2/... headings. Keep the match local to a page/
    // image-count label so prices, people counts and route durations cannot
    // become the page total by accident.
    const explicit = [
      /(?:本轮|本次|本批)?\s*(?:预计|建议)?\s*(?:输出|生成|制作)?\s*(?:总)?(?:页数|张数|图片数|图片数量)\s*[：:＝=]?\s*(\d{1,2})\s*(?:张|页|张图|张图片)?/giu,
      /(?:建议|预计|本轮|本次|本批)?\s*(?:输出|生成|制作)\s*[：:＝=]\s*(\d{1,2})\s*(?:张|页|张图|张图片)/giu,
      /(?:预计输出(?:总)?(?:张数|页数)|输出总张数|共计|合计|总计|固定)\s*[：:＝=]?\s*(?:\D{0,40})?(\d{1,2})\s*(?:张|页)/giu
    ].flatMap((pattern) => [...source.matchAll(pattern)])
      .map((match) => Number(match[1]))
      .filter((value) => value > 0 && value <= 30);
    if (explicit.length) return explicit[explicit.length - 1];
    const pages = [...source.matchAll(/^\s*P\s*(\d{1,2})(?=\s*(?:[｜|：:\-—.．]|\b|$))/gim)]
      .map((match) => Number(match[1]))
      .filter((value) => value > 0 && value <= 30);
    return pages.length ? Math.max(...pages) : 0;
  }

  function requiresPlannedImageCount(taskType = "") {
    return String(taskType || "").trim() !== "template-init";
  }

  function isArchivedAutomationBoundary(options = {}) {
    const marker = options.marker && typeof options.marker === "object" ? options.marker : null;
    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
    if (!marker) return false;
    return normalize(options.currentUrl) === normalize(marker.conversationUrl)
      && Boolean(normalize(options.materialText))
      && normalize(options.materialText) === normalize(marker.materialText);
  }

  function firstBatchChoice(options = {}) {
    const maximum = Math.max(1, Number(options.maximum || 10));
    const planned = Math.max(1, Number(options.plannedImageCount || maximum));
    const expectedImageCount = Math.min(planned, maximum);
    return {
      reply: `先出 P1-P${expectedImageCount}`,
      expectedImageCount
    };
  }

  function shouldRecoverSilentAssistant(options = {}) {
    const elapsedMs = Math.max(0, Number(options.elapsedMs || 0));
    const thresholdMs = Math.max(1, Number(options.thresholdMs || 60_000));
    return elapsedMs >= thresholdMs
      && Math.max(0, Number(options.freshTurnCount || 0)) === 0
      && !options.generating
      && Boolean(options.composerEmpty);
  }

  function shouldRecoverSilentImageGeneration(options = {}) {
    const elapsedMs = Math.max(0, Number(options.elapsedMs || 0));
    const thresholdMs = Math.max(1, Number(options.thresholdMs || 60_000));
    return elapsedMs >= thresholdMs
      && Math.max(0, Number(options.freshTurnCount || 0)) === 0
      && Math.max(0, Number(options.freshImageCount || 0)) === 0
      && !options.generating;
  }

  function shouldRetryThreadError(options = {}) {
    const elapsedMs = Math.max(0, Number(options.elapsedMs || 0));
    const thresholdMs = Math.max(1, Number(options.thresholdMs || 15_000));
    return elapsedMs >= thresholdMs
      && Boolean(options.retryVisible)
      && Math.max(0, Number(options.freshTurnCount || 0)) === 0
      && !options.alreadyRetried;
  }

  function detectRepetitiveAssistantLoop(text, minimumRepeats = 8) {
    const lines = String(text || "").split(/\r?\n/)
      .map((line) => line.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    const token = lines.at(-1) || "";
    if (!token || token.length > 40) return { detected: false, token: "", repeats: 0 };
    let repeats = 0;
    for (let index = lines.length - 1; index >= 0 && lines[index] === token; index -= 1) repeats += 1;
    return { detected: repeats >= Math.max(2, Number(minimumRepeats || 8)), token, repeats };
  }

  function classifyPatrolConversationCandidate(options = {}) {
    const title = String(options.title || "").replace(/\s+/g, " ").trim();
    const url = String(options.url || "").trim();
    const allowlist = (Array.isArray(options.allowlist) ? options.allowlist : [])
      .map((value) => String(value || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const titleMatched = /模板/i.test(title);
    const explicitlyAllowed = Boolean(url && allowlist.includes(url)) || Boolean(title && allowlist.includes(title));
    return { title, url, titleMatched, explicitlyAllowed, eligible: titleMatched && explicitlyAllowed };
  }

  function uniqueGeneratedImageUrls(urls) {
    const seen = new Set();
    return (Array.isArray(urls) ? urls : []).map((value) => String(value || "").trim()).filter((url) => {
      if (!/^(?:https?:|blob:|data:image\/)/i.test(url)) return false;
      // ChatGPT may render one generated file through several signed URLs
      // (thumbnail/full-size/lazy-loaded variants).  The backend file id is
      // the stable identity; comparing the entire signed URL made one image
      // count as two or three pages and was the source of false low-output
      // limit detections.
      let identity = url;
      try {
        const parsed = new URL(url);
        const fileId = parsed.searchParams.get("id");
        if (fileId) identity = `chatgpt-file:${fileId}`;
      } catch { /* blob/data URLs keep their full identity */ }
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }

  function isCompleteCopy(text, minimum = 300) {
    return String(text || "").replace(/\s/g, "").length >= Math.max(1, Number(minimum || 300));
  }

  function isLikelyPublishCopy(text, minimum = 300) {
    const source = String(text || "").trim();
    if (!isCompleteCopy(source, minimum)) return false;
    if (/母版页数不是输出上限|逐页迁移计划|迁移计划|等待.{0,12}(?:回复|输入).{0,6}1|暂时不出图/i.test(source)) return false;
    const pageHeadings = source.match(/(?:^|\n)\s*P\s*\d{1,2}\s*[｜|：:\-—]/gim) || [];
    if (pageHeadings.length >= 2) return false;
    return /#[^\s#]{2,}|(?:适合|地点|行程|玩法|团建|公司团队|出发前)/i.test(source);
  }

  function escapeRegExpLiteral(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function defaultKeywordPattern(action) {
    const key = String(action || "").trim();
    if (key === "wait-plan" || key === "detect-plan") return "迁移计划|逐页|P\\s*1|计划完成";
    if (key === "wait-images" || key === "detect-images") return "出图完毕|图片完成|生成完成";
    if (key === "wait-copy" || key === "detect-copy") return "文案完成|文案已完成|复制文案完成";
    return "";
  }

  function keywordPatternMatches(text, pattern) {
    const source = String(text || "");
    const raw = String(pattern || "").trim();
    if (!source || !raw) return false;
    try {
      return new RegExp(raw, "i").test(source);
    } catch {
      return new RegExp(escapeRegExpLiteral(raw), "i").test(source);
    }
  }

  function completionKeywordDetected(text, options = {}) {
    const action = String(options.action || "").trim();
    const pattern = String(options.keywordPattern || options.pattern || defaultKeywordPattern(action) || "").trim();
    return {
      matched: keywordPatternMatches(text, pattern),
      pattern
    };
  }

  function classifyAttachmentUploadResult(options = {}) {
    const expected = Math.max(0, Number(options.expected || 0));
    const observed = Math.max(0, Math.min(expected, Number(options.observed || 0)));
    if (expected > 0 && observed >= expected) {
      return { status: "complete", expected, observed };
    }
    if (observed > 0) {
      return { status: "partial", expected, observed, code: "UPLOAD_LIMIT_SIGNAL" };
    }
    return { status: "missing", expected, observed, code: "ATTACHMENT_UPLOAD_NOT_READY" };
  }

  function classifyPlanDetectionResult(options = {}) {
    if (!options.validPlan) return { ready: false, code: "PLAN_NOT_READY" };
    if (!options.planComplete) return { ready: false, code: "PLAN_NOT_COMPLETE" };
    if (Object.prototype.hasOwnProperty.call(options, "plannedImageCount")
      && Math.max(0, Number(options.plannedImageCount || 0)) === 0) {
      return { ready: false, code: "PLAN_NOT_COMPLETE" };
    }
    return { ready: true, code: "" };
  }

  function decidePlanRecovery(options = {}) {
    const attempts = Math.max(0, Number(options.attempts || 0));
    const maxAttempts = Math.max(0, Number(options.maxAttempts ?? 2));
    if (attempts < maxAttempts) return { action: "retry-current", nextAttempt: attempts + 1 };
    return { action: "pause", nextAttempt: attempts };
  }

  function isActiveGenerationControl(options = {}) {
    if (!options.visible || options.disabled) return false;
    return /stop-(?:button|generating|streaming|response)|stop\s+(?:generating|streaming|response)|停止(?:生成|回答|响应|流式|思考)/i.test(String(options.label || ""));
  }

  // ── GPT 触顶特征检测 ──
  // 用户反馈:GPT 撞到生图上限后,可能不用 DALL-E 原生出图,而是用 PY/代码解释器
  // 直接拼接垃圾图;只出 4 张及以下也是撞上限的表现。

  // PY 脚本兜底拼图检测:GPT 撞到上限后用代码解释器/脚本生成低质量图片,而非
  // DALL-E 原生出图。判定条件:有图片(>0) 且有脚本特征(代码信号或脚本文件)。
  // 无图片时不判定(纯脚本/沙盒输出由 detectScriptOutputLimitSignal 单独处理)。
  function detectPyScriptFallbackSignal(options = {}) {
    const nativeImages = Math.max(0, Number(options.nativeImages || 0));
    const hasCodeSignal = Boolean(options.hasCodeSignal);
    const hasScriptArtifact = Boolean(options.hasScriptArtifact);
    if (nativeImages <= 0) return { detected: false, reason: "" };
    if (hasCodeSignal || hasScriptArtifact) {
      return {
        detected: true,
        reason: "py-script-fallback",
        factors: {
          nativeImages,
          hasCodeSignal,
          hasScriptArtifact
        }
      };
    }
    return { detected: false, reason: "" };
  }

  // 纯脚本/沙盒输出检测:没有原生生图,但出现代码解释器、脚本文件、压缩包或
  // 批量下载等产物。这也是生图触顶特征,不能只当普通脚本异常。
  function detectScriptOutputLimitSignal(options = {}) {
    const nativeImages = Math.max(0, Number(options.nativeImages || 0));
    const artifactCount = Math.max(0, Number(options.artifactCount || 0));
    const hasCodeSignal = Boolean(options.hasCodeSignal);
    const hasScriptArtifact = Boolean(options.hasScriptArtifact);
    const hasArchiveSignal = Boolean(options.hasArchiveSignal);
    if (nativeImages > 0 || artifactCount <= 0) return { detected: false, reason: "" };
    if (hasCodeSignal || hasScriptArtifact || hasArchiveSignal) {
      return { detected: true, reason: "script-output-limit" };
    }
    return { detected: false, reason: "" };
  }

  // 低图触顶检测:GPT 只生成 threshold(默认 4) 张及以下图片,视为撞上限特征。
  // nativeImages 为 0 时不判定(无图由其他检测处理)。
  function detectLowImageLimit(options = {}) {
    const nativeImages = Math.max(0, Number(options.nativeImages || 0));
    const threshold = Math.max(1, Number(options.threshold || 4));
    const detected = nativeImages > 0 && nativeImages <= threshold;
    return {
      detected,
      count: nativeImages,
      threshold
    };
  }

  function classifyAutomationBoundaryPause(snapshot = {}) {
    if (snapshot.scriptOutputLimitSignal) {
      return {
        shouldPause: true,
        boundaryPaused: true,
        code: "GENERATION_LIMIT_SIGNAL",
        riskReason: "script-output-limit",
        message: "检测到纯脚本/沙盒产物输出，按生图触顶处理，停止当前帖子"
      };
    }
    if (snapshot.pyScriptFallbackSignal) {
      return {
        shouldPause: true,
        boundaryPaused: true,
        code: "GENERATION_LIMIT_SIGNAL",
        riskReason: "py-script-fallback",
        message: "检测到 GPT 使用 PY 代码兜底拼接垃圾图，停止当前帖子，疑似撞到生图上限"
      };
    }
    if (snapshot.limitSignal) {
      return {
        shouldPause: true,
        boundaryPaused: true,
        code: "GENERATION_LIMIT_SIGNAL",
        riskReason: "retry-or-limit-signal",
        message: "检测到 GPT 重试或额度限制信号，停止当前帖子，等待下一个时间点"
      };
    }
    if (snapshot.scriptOutput) {
      return {
        shouldPause: true,
        boundaryPaused: true,
        code: "SCRIPT_GENERATED_OUTPUT",
        riskReason: "script-output",
        message: "检测到代码解释器或脚本输出，停止当前帖子，不把脚本拼图当作正常生图"
      };
    }
    return {
      shouldPause: false,
      boundaryPaused: false,
      code: "",
      riskReason: "",
      message: ""
    };
  }

  return {
    parsePlannedImageCount,
    requiresPlannedImageCount,
    isArchivedAutomationBoundary,
    firstBatchChoice,
    shouldRecoverSilentAssistant,
    shouldRecoverSilentImageGeneration,
    shouldRetryThreadError,
    detectRepetitiveAssistantLoop,
    classifyPatrolConversationCandidate,
    uniqueGeneratedImageUrls,
    isCompleteCopy,
    isLikelyPublishCopy,
    defaultKeywordPattern,
    keywordPatternMatches,
    completionKeywordDetected,
    classifyAttachmentUploadResult,
    classifyPlanDetectionResult,
    decidePlanRecovery,
    isActiveGenerationControl,
    detectPyScriptFallbackSignal,
    detectScriptOutputLimitSignal,
    detectLowImageLimit,
    classifyAutomationBoundaryPause
  };
});
