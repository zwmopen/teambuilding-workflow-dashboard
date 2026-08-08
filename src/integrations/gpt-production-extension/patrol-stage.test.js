"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { classifyPatrolStage, decidePatrolSingleStep, isAutomationMaterialPrompt, preferredRecoveryImageUrls } = require("./patrol-stage");

test("patrol recognizes both legacy and current complete-attachment material prompts", () => {
  assert.equal(isAutomationMaterialPrompt("请完整读取全部附件，不要省略 TXT。\n当前素材文件夹：作品 A"), true);
  assert.equal(isAutomationMaterialPrompt("请读取全部附件。\n当前素材文件夹：作品 B"), true);
  assert.equal(isAutomationMaterialPrompt("日常聊天，请看看附件"), false);
});

test("restart recovery prefers the more complete checkpoint image set over a partially hydrated page", () => {
  assert.deepEqual(preferredRecoveryImageUrls(["page-1"], ["saved-1", "saved-2", "saved-3"]), ["saved-1", "saved-2", "saved-3"]);
  assert.deepEqual(preferredRecoveryImageUrls(["page-1", "page-2"], ["saved-1"]), ["page-1", "page-2"]);
});

test("patrol stage classifier maps the production evidence chain without taking action", () => {
  assert.equal(classifyPatrolStage({}).key, "awaiting-material");
  assert.equal(classifyPatrolStage({ stage: "waiting-plan", hasMaterialBoundary: true }).safeToAct, false);
  assert.deepEqual(
    classifyPatrolStage({ stage: "plan-ready", hasMaterialBoundary: true }),
    { key: "awaiting-confirm", label: "计划完成，待回复 1", nextActionKey: "send-confirm", safeToAct: true, detail: "" }
  );
  assert.equal(classifyPatrolStage({ stage: "images-ready", imageCount: 8 }).nextActionKey, "request-copy");
  assert.equal(classifyPatrolStage({ stage: "completed-copy-pending-package", imageCount: 8 }).nextActionKey, "download-and-package");
});

test("a settled partial image batch is identified for whole-batch regeneration", () => {
  const partial = classifyPatrolStage({
    stage: "waiting-images",
    hasMaterialBoundary: true,
    imageCount: 3,
    expectedImageCount: 10,
    generating: false
  });
  assert.equal(partial.key, "partial-images");
  assert.equal(partial.nextActionKey, "regenerate-batch");
  assert.equal(partial.safeToAct, true);
  assert.match(partial.detail, /整批重做/);
  assert.equal(classifyPatrolStage({ stage: "waiting-images", imageCount: 3, expectedImageCount: 10, generating: true }).key, "generating-images");
});

test("uncertain and limit states remain read-only", () => {
  assert.equal(classifyPatrolStage({ stage: "unknown", hasMaterialBoundary: true }).safeToAct, false);
  assert.equal(classifyPatrolStage({ stage: "generation-limit-or-script" }).nextActionKey, "pause");
});

test("patrol single-step requires an automatically eligible non-excluded title", () => {
  const state = classifyPatrolStage({ stage: "plan-ready", hasMaterialBoundary: true });
  assert.equal(decidePatrolSingleStep({ candidate: { titleMatched: false, eligible: false }, patrolState: state }).allowed, false);
  assert.equal(decidePatrolSingleStep({ candidate: { titleMatched: true, excluded: true, eligible: false }, patrolState: state }).allowed, false);
  assert.deepEqual(
    decidePatrolSingleStep({
      candidate: { titleMatched: true, excluded: false, eligible: true },
      patrolState: state,
      composerReady: true,
      composerEmpty: true
    }),
    { allowed: true, action: "send-confirm", reason: "ready" }
  );
});

test("patrol single-step never acts while generating, drafting, uncertain, or over the generation cap", () => {
  const candidate = { titleMatched: true, excluded: false, eligible: true };
  const confirm = classifyPatrolStage({ stage: "plan-ready", hasMaterialBoundary: true });
  assert.equal(decidePatrolSingleStep({ candidate, patrolState: confirm, generating: true, composerReady: true, composerEmpty: true }).allowed, false);
  assert.equal(decidePatrolSingleStep({ candidate, patrolState: confirm, composerReady: true, composerEmpty: false }).allowed, false);
  assert.equal(decidePatrolSingleStep({ candidate, patrolState: confirm, composerReady: true, composerEmpty: true, generationRequestCount: 5, maximumGenerationRequests: 5 }).reason, "generation-cap-reached");
  assert.equal(decidePatrolSingleStep({ candidate, patrolState: classifyPatrolStage({ stage: "unknown", hasMaterialBoundary: true }), composerReady: true, composerEmpty: true }).allowed, false);
});

test("patrol single-step permits deterministic text actions and verified packaging", () => {
  const candidate = { titleMatched: true, excluded: false, eligible: true };
  const copy = classifyPatrolStage({ stage: "images-ready", imageCount: 8 });
  const packageState = classifyPatrolStage({ stage: "completed-copy-pending-package", imageCount: 8 });
  assert.equal(decidePatrolSingleStep({ candidate, patrolState: copy, composerReady: true, composerEmpty: true }).action, "request-copy");
  assert.equal(decidePatrolSingleStep({ candidate, patrolState: packageState, composerReady: true, composerEmpty: true }).action, "download-and-package");
});
