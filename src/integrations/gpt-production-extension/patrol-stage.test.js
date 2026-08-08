"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { classifyPatrolStage } = require("./patrol-stage");

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
