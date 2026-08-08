const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parsePlannedImageCount,
  defaultKeywordPattern,
  keywordPatternMatches,
  completionKeywordDetected,
  classifyAttachmentUploadResult,
  isActiveGenerationControl,
  detectPyScriptFallbackSignal,
  detectScriptOutputLimitSignal,
  detectLowImageLimit,
  classifyAutomationBoundaryPause,
  classifyPlanDetectionResult,
  decidePlanRecovery,
  requiresPlannedImageCount,
  shouldRecoverSilentAssistant,
  shouldRecoverSilentImageGeneration,
  shouldRetryThreadError,
  detectRepetitiveAssistantLoop,
  isArchivedAutomationBoundary,
  firstBatchChoice
} = require("./gpt-automation-core");

test("patrol candidates require both a template title and explicit allowlist entry", () => {
  const { classifyPatrolConversationCandidate } = require("./gpt-automation-core");
  const url = "https://chatgpt.com/c/template-123";
  assert.deepEqual(
    classifyPatrolConversationCandidate({ title: "轮播模板｜杭州团建", url, allowlist: [url] }),
    { title: "轮播模板｜杭州团建", url, titleMatched: true, explicitlyAllowed: true, eligible: true }
  );
  assert.equal(classifyPatrolConversationCandidate({ title: "日常聊天", url, allowlist: [url] }).eligible, false);
  assert.equal(classifyPatrolConversationCandidate({ title: "轮播模板｜未准入", url, allowlist: [] }).eligible, false);
  assert.equal(classifyPatrolConversationCandidate({ title: "轮播模板｜按标题准入", url, allowlist: ["轮播模板｜按标题准入"] }).eligible, true);
});

test("a successfully archived material boundary no longer blocks the next post", () => {
  const marker = {
    conversationUrl: "https://chatgpt.com/c/example",
    materialText: "请读取全部附件\n当前素材文件夹：上一套"
  };
  assert.equal(isArchivedAutomationBoundary({
    currentUrl: "https://chatgpt.com/c/example",
    materialText: "  请读取全部附件 \n 当前素材文件夹：上一套  ",
    marker
  }), true);
  assert.equal(isArchivedAutomationBoundary({
    currentUrl: "https://chatgpt.com/c/example",
    materialText: "请读取全部附件\n当前素材文件夹：下一套",
    marker
  }), false);
  assert.equal(isArchivedAutomationBoundary({
    currentUrl: "https://chatgpt.com/c/another",
    materialText: marker.materialText,
    marker
  }), false);
});

test("plans above the ChatGPT batch cap select P1-P10 and expect only that batch", () => {
  assert.deepEqual(firstBatchChoice({ plannedImageCount: 12, maximum: 10 }), {
    reply: "先出 P1-P10",
    expectedImageCount: 10
  });
  assert.deepEqual(firstBatchChoice({ plannedImageCount: 7, maximum: 10 }), {
    reply: "先出 P1-P7",
    expectedImageCount: 7
  });
});

test("template initialization completion does not require a planned image count", () => {
  assert.equal(requiresPlannedImageCount("template-init"), false);
  assert.equal(requiresPlannedImageCount("material"), true);
});

test("a submitted plan with no assistant response recovers after a stable idle minute", () => {
  assert.equal(shouldRecoverSilentAssistant({
    elapsedMs: 59_999,
    thresholdMs: 60_000,
    freshTurnCount: 0,
    generating: false,
    composerEmpty: true
  }), false);
  assert.equal(shouldRecoverSilentAssistant({
    elapsedMs: 60_000,
    thresholdMs: 60_000,
    freshTurnCount: 0,
    generating: false,
    composerEmpty: true
  }), true);
  assert.equal(shouldRecoverSilentAssistant({
    elapsedMs: 90_000,
    thresholdMs: 60_000,
    freshTurnCount: 0,
    generating: true,
    composerEmpty: true
  }), false);
  assert.equal(shouldRecoverSilentAssistant({
    elapsedMs: 90_000,
    thresholdMs: 60_000,
    freshTurnCount: 1,
    generating: false,
    composerEmpty: true
  }), false);
});

test("a confirmed image request with no assistant turn or image recovers after generation stops", () => {
  assert.equal(shouldRecoverSilentImageGeneration({
    elapsedMs: 59_999,
    freshTurnCount: 0,
    freshImageCount: 0,
    generating: false
  }), false);
  assert.equal(shouldRecoverSilentImageGeneration({
    elapsedMs: 60_000,
    freshTurnCount: 0,
    freshImageCount: 0,
    generating: false
  }), true);
  assert.equal(shouldRecoverSilentImageGeneration({
    elapsedMs: 60_000,
    freshTurnCount: 0,
    freshImageCount: 0,
    generating: true
  }), false);
  assert.equal(shouldRecoverSilentImageGeneration({
    elapsedMs: 60_000,
    freshTurnCount: 1,
    freshImageCount: 0,
    generating: false
  }), false);
  assert.equal(shouldRecoverSilentImageGeneration({
    elapsedMs: 60_000,
    freshTurnCount: 0,
    freshImageCount: 1,
    generating: false
  }), false);
});

test("a native thread error retries once even when ChatGPT leaves a stop button visible", () => {
  assert.equal(shouldRetryThreadError({
    elapsedMs: 14_999,
    thresholdMs: 15_000,
    retryVisible: true,
    freshTurnCount: 0,
    alreadyRetried: false
  }), false);
  assert.equal(shouldRetryThreadError({
    elapsedMs: 15_000,
    thresholdMs: 15_000,
    retryVisible: true,
    freshTurnCount: 0,
    alreadyRetried: false
  }), true);
  assert.equal(shouldRetryThreadError({
    elapsedMs: 30_000,
    thresholdMs: 15_000,
    retryVisible: true,
    freshTurnCount: 0,
    alreadyRetried: true
  }), false);
  assert.equal(shouldRetryThreadError({
    elapsedMs: 30_000,
    thresholdMs: 15_000,
    retryVisible: true,
    freshTurnCount: 1,
    alreadyRetried: false
  }), false);
});

test("a streaming reply that repeats one placeholder line eight times is a recoverable loop", () => {
  assert.deepEqual(detectRepetitiveAssistantLoop([
    "已重新",
    "文案", "文案", "文案", "文案", "文案", "文案", "文案", "文案"
  ].join("\n\n")), {
    detected: true,
    token: "文案",
    repeats: 8
  });
  assert.equal(detectRepetitiveAssistantLoop([
    "P1｜封面", "页面角色：路线封面", "P2｜漂流", "页面角色：玩法页",
    "P3｜溯溪", "页面角色：玩法页", "P4｜住宿", "页面角色：场景页"
  ].join("\n")).detected, false);
});

test("计划只渲染标题时不能提前通过，完整规划总页数可以恢复当前帖子", () => {
  const partialPlan = "【显性逐页迁移计划｜待确认】\n当前任务名称";
  const plan = [
    "【显性逐页迁移计划｜待确认】",
    "本轮规划总页数：5页",
    "P1 苏州·西山岛国庆团建",
    "P2 私享庭院",
    "P3 包栋公区",
    "P4 星空派对",
    "P5 围炉煮茶",
    "逐页迁移计划已经完成。回复 1 后直接进入5页整套批量出图。"
  ].join("\n");

  assert.deepEqual(classifyPlanDetectionResult({
    validPlan: true,
    planComplete: true,
    plannedImageCount: parsePlannedImageCount(partialPlan)
  }), {
    ready: false,
    code: "PLAN_NOT_COMPLETE"
  });
  assert.equal(parsePlannedImageCount(plan), 5);
});

test("计划未返回时必须暂停当前帖子，不能跳过并上传下一套", () => {
  assert.deepEqual(classifyPlanDetectionResult({ validPlan: false, planComplete: false }), {
    ready: false,
    code: "PLAN_NOT_READY"
  });
  assert.deepEqual(classifyPlanDetectionResult({ validPlan: true, planComplete: false }), {
    ready: false,
    code: "PLAN_NOT_COMPLETE"
  });
  assert.deepEqual(classifyPlanDetectionResult({ validPlan: true, planComplete: true }), {
    ready: true,
    code: ""
  });
});

test("计划未返回时先恢复当前附件消息，连续失败后才暂停", () => {
  assert.deepEqual(decidePlanRecovery({ attempts: 0, maxAttempts: 2 }), {
    action: "retry-current",
    nextAttempt: 1
  });
  assert.deepEqual(decidePlanRecovery({ attempts: 1, maxAttempts: 2 }), {
    action: "retry-current",
    nextAttempt: 2
  });
  assert.deepEqual(decidePlanRecovery({ attempts: 2, maxAttempts: 2 }), {
    action: "pause",
    nextAttempt: 2
  });
});

test("附件全部出现时允许进入自动处理", () => {
  assert.deepEqual(classifyAttachmentUploadResult({ expected: 7, observed: 7 }), {
    status: "complete",
    expected: 7,
    observed: 7
  });
});

test("附件只出现一部分时判定上传上限并停止发送", () => {
  assert.deepEqual(classifyAttachmentUploadResult({ expected: 7, observed: 3 }), {
    status: "partial",
    expected: 7,
    observed: 3,
    code: "UPLOAD_LIMIT_SIGNAL"
  });
});

test("附件一个都没出现时保留普通上传失败", () => {
  assert.deepEqual(classifyAttachmentUploadResult({ expected: 7, observed: 0 }), {
    status: "missing",
    expected: 7,
    observed: 0,
    code: "ATTACHMENT_UPLOAD_NOT_READY"
  });
});

test("禁用的停止回答按钮不再被判定为生成中", () => {
  assert.equal(isActiveGenerationControl({ visible: true, disabled: true, label: "停止回答" }), false);
  assert.equal(isActiveGenerationControl({ visible: true, disabled: false, label: "停止回答" }), true);
  assert.equal(isActiveGenerationControl({ visible: false, disabled: false, label: "停止回答" }), false);
});

test("关键词正则可检测计划、图片、文案完成信号", () => {
  const replies = {
    plan: "P1｜封面迁移\nP2｜内页迁移\n计划完成，等待你回复 1。",
    images: "本轮图片已经全部生成。\n出图完毕",
    copy: "适合 HR 收藏的团建攻略正文...\n#团建 #公司团建\n文案完成"
  };

  assert.equal(keywordPatternMatches(replies.plan, "计划完成"), true);
  assert.equal(keywordPatternMatches(replies.images, "出图完毕"), true);
  assert.equal(keywordPatternMatches(replies.copy, "文案完成"), true);
});

test("等待模块空关键词会使用可编辑默认值", () => {
  assert.equal(defaultKeywordPattern("wait-plan"), "迁移计划|逐页|P\\s*1|计划完成");
  assert.equal(defaultKeywordPattern("wait-images"), "出图完毕|图片完成|生成完成");
  assert.equal(defaultKeywordPattern("wait-copy"), "文案完成|文案已完成|复制文案完成");
});

test("完成关键词检测返回命中状态和来源", () => {
  const result = completionKeywordDetected("图片都好了，出图完毕。", {
    action: "wait-images",
    keywordPattern: ""
  });

  assert.deepEqual(result, {
    matched: true,
    pattern: "出图完毕|图片完成|生成完成"
  });
});

test("无效正则不抛异常并按普通文本匹配", () => {
  assert.equal(keywordPatternMatches("计划完成", "["), false);
  assert.equal(keywordPatternMatches("请输出 [完成] 标记", "[完成]"), true);
});

// ── PY 脚本兜底拼图检测 ──

test("PY脚本兜底拼图:有图+脚本特征+大量文字 → 检测到", () => {
  const result = detectPyScriptFallbackSignal({
    text: "我已用Python脚本为你生成了图片。以下是图片的详细描述：这张图片展示了团建活动的场景..." + "x".repeat(600),
    nativeImages: 3,
    hasCodeSignal: true,
    hasScriptArtifact: false
  });
  assert.equal(result.detected, true);
  assert.equal(result.reason, "py-script-fallback");
});

test("PY脚本兜底拼图:有图+脚本文件附件 → 检测到(无论文字量)", () => {
  const result = detectPyScriptFallbackSignal({
    text: "图片已生成",
    nativeImages: 2,
    hasCodeSignal: false,
    hasScriptArtifact: true
  });
  assert.equal(result.detected, true);
});

test("PY脚本兜底拼图:有图+无脚本特征+大量文字 → 不检测到(文字多不等于脚本)", () => {
  const result = detectPyScriptFallbackSignal({
    text: "这是一段非常长的文案描述" + "y".repeat(800),
    nativeImages: 4,
    hasCodeSignal: false,
    hasScriptArtifact: false
  });
  assert.equal(result.detected, false);
});

test("PY脚本兜底拼图:无图 → 不检测到(没有图片不判PY拼图)", () => {
  const result = detectPyScriptFallbackSignal({
    text: "Python脚本输出" + "z".repeat(600),
    nativeImages: 0,
    hasCodeSignal: true,
    hasScriptArtifact: true
  });
  assert.equal(result.detected, false);
});

test("PY脚本兜底拼图:有图+脚本特征+少量文字 → 检测到(脚本特征本身足够)", () => {
  const result = detectPyScriptFallbackSignal({
    text: "已用代码解释器生成图片",
    nativeImages: 4,
    hasCodeSignal: true,
    hasScriptArtifact: false
  });
  assert.equal(result.detected, true);
});

// ── 纯脚本/沙盒输出触顶检测 ──

test("纯脚本/沙盒输出:无原生图+脚本文件 → 判定为生图触顶", () => {
  const result = detectScriptOutputLimitSignal({
    nativeImages: 0,
    artifactCount: 1,
    hasCodeSignal: false,
    hasScriptArtifact: true,
    hasArchiveSignal: false
  });
  assert.deepEqual(result, {
    detected: true,
    reason: "script-output-limit"
  });
});

test("纯脚本/沙盒输出:无原生图+压缩包/批量下载产物 → 判定为生图触顶", () => {
  const result = detectScriptOutputLimitSignal({
    nativeImages: 0,
    artifactCount: 1,
    hasCodeSignal: false,
    hasScriptArtifact: false,
    hasArchiveSignal: true
  });
  assert.equal(result.detected, true);
  assert.equal(result.reason, "script-output-limit");
});

test("纯脚本/沙盒输出:已有原生图时不走纯脚本触顶", () => {
  const result = detectScriptOutputLimitSignal({
    nativeImages: 2,
    artifactCount: 1,
    hasCodeSignal: true,
    hasScriptArtifact: true,
    hasArchiveSignal: true
  });
  assert.equal(result.detected, false);
});

test("纯脚本/沙盒输出:无产物时不判触顶", () => {
  const result = detectScriptOutputLimitSignal({
    nativeImages: 0,
    artifactCount: 0,
    hasCodeSignal: true,
    hasScriptArtifact: false,
    hasArchiveSignal: false
  });
  assert.equal(result.detected, false);
});

test("mock工作流:纯脚本/沙盒输出会返回触顶暂停决策", () => {
  const decision = classifyAutomationBoundaryPause({
    scriptOutputLimitSignal: true,
    latestImageCount: 0,
    stage: "generation-limit-or-script"
  });
  assert.deepEqual(decision, {
    shouldPause: true,
    boundaryPaused: true,
    code: "GENERATION_LIMIT_SIGNAL",
    riskReason: "script-output-limit",
    message: "检测到纯脚本/沙盒产物输出，按生图触顶处理，停止当前帖子"
  });
});

// ── 低图触顶检测 ──

test("低图触顶:4张图 → 检测到", () => {
  const result = detectLowImageLimit({ nativeImages: 4, threshold: 4 });
  assert.equal(result.detected, true);
  assert.equal(result.count, 4);
  assert.equal(result.threshold, 4);
});

test("低图触顶:3张图 → 检测到", () => {
  const result = detectLowImageLimit({ nativeImages: 3, threshold: 4 });
  assert.equal(result.detected, true);
});

test("低图触顶:5张图 → 不检测到", () => {
  const result = detectLowImageLimit({ nativeImages: 5, threshold: 4 });
  assert.equal(result.detected, false);
});

test("低图触顶:0张图 → 不检测到(无图不判低产出)", () => {
  const result = detectLowImageLimit({ nativeImages: 0, threshold: 4 });
  assert.equal(result.detected, false);
});

test("低图触顶:默认阈值4", () => {
  const result = detectLowImageLimit({ nativeImages: 4 });
  assert.equal(result.detected, true);
  assert.equal(result.threshold, 4);
});
