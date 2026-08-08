const test = require("node:test");
const assert = require("node:assert/strict");

const {
  accountParticipatesInRotation,
  accountQuotaBoundary,
  effectiveProductionMode,
  rotationRunAfterModeSwitch,
  reconcileAccountQuotaSettings,
  rotationResumeCheckpoint,
  shouldInitializeTemplate,
  taskQuotaBoundary,
  selectNextRotationAccount
} = require("./gpt-account-rotation");

test("an unfinished rotation run stays authoritative across pause and restart", () => {
  assert.equal(effectiveProductionMode("single", { mode: "rotate", status: "running" }), "rotate");
  assert.equal(effectiveProductionMode("single", { rotation: true, status: "paused" }), "rotate");
  assert.equal(effectiveProductionMode("single", { mode: "rotate", status: "waiting-quota" }), "rotate");
  assert.equal(effectiveProductionMode("single", { mode: "rotate", status: "completed" }), "single");
  assert.equal(effectiveProductionMode("manual", null), "manual");
});

test("an explicit user mode switch suspends rotation without deleting its resumable run", () => {
  const paused = { mode: "rotate", rotation: true, status: "paused", runId: "run-1" };
  const suspended = rotationRunAfterModeSwitch(paused, "manual");
  assert.equal(suspended.status, "paused-mode-switch");
  assert.equal(suspended.suspendedByModeSwitch, true);
  assert.equal(suspended.runId, "run-1");
  assert.equal(effectiveProductionMode("manual", suspended), "manual");

  const resumed = rotationRunAfterModeSwitch(suspended, "rotate");
  assert.equal(resumed.status, "paused");
  assert.equal(resumed.suspendedByModeSwitch, false);
  assert.equal(resumed.suspendedForMode, null);
  assert.equal(effectiveProductionMode("rotate", resumed), "rotate");
});

test("a submitted material resumes its existing conversation without template reinitialization", () => {
  assert.equal(shouldInitializeTemplate({ taskType: "material", templateId: "T03", _submittedToGpt: true }, false), false);
  assert.equal(shouldInitializeTemplate({ taskType: "material", templateId: "T03" }, true), false);
  assert.equal(shouldInitializeTemplate({ taskType: "material", templateId: "T03" }, false), true);
  assert.equal(shouldInitializeTemplate({ taskType: "material" }, false), false);
});

test("a submitted rotation task resumes the web checkpoint without charging or uploading again", () => {
  assert.deepEqual(rotationResumeCheckpoint({
    taskType: "material",
    _submittedToGpt: true,
    _stage: "等待图片",
    _percent: 64
  }), { resuming: true, stage: "等待图片", percent: 64 });
  assert.deepEqual(rotationResumeCheckpoint({
    taskType: "material",
    _submittedToGpt: true,
    _stage: "等待附件就绪",
    _percent: 16
  }), { resuming: true, stage: "等待迁移计划", percent: 24 });
  assert.deepEqual(rotationResumeCheckpoint({ taskType: "material", _submittedToGpt: false }), {
    resuming: false,
    stage: "",
    percent: 0
  });
});

test("later-added account inherits current quota defaults without overwriting existing settings", () => {
  assert.deepEqual(reconcileAccountQuotaSettings({
    profiles: [
      { id: "account-1", name: "primary" },
      { id: "account-6", name: "new account" }
    ],
    settings: [
      { id: "account-1", name: "primary", uploadLimit: 60, generationLimit: 40, windowHours: 4 }
    ],
    defaults: { uploadLimit: 80, generationLimit: 45, windowHours: 3 }
  }), [
    { id: "account-1", name: "primary", uploadLimit: 60, generationLimit: 40, windowHours: 4 },
    { id: "account-6", name: "new account", uploadLimit: 80, generationLimit: 45, windowHours: 3 }
  ]);
});

test("a new work starts only when all attachments and the complete image set fit quota", () => {
  assert.deepEqual(taskQuotaBoundary({
    requiredUploads: 6,
    requiredGenerations: 5,
    remainingUploads: 7,
    remainingGenerations: 1
  }), { reached: true, kind: "generation", required: 5, remaining: 1 });
  assert.deepEqual(taskQuotaBoundary({
    requiredUploads: 6,
    requiredGenerations: 5,
    remainingUploads: 5,
    remainingGenerations: 20
  }), { reached: true, kind: "upload", required: 6, remaining: 5 });
  assert.deepEqual(taskQuotaBoundary({
    requiredUploads: 6,
    requiredGenerations: 5,
    remainingUploads: 6,
    remainingGenerations: 5
  }), { reached: false, kind: "", required: 0, remaining: 0 });
});

test("全局轮换只接纳启用且模式为 rotate 的账号", () => {
  assert.equal(accountParticipatesInRotation({ id: "a", mode: "rotate" }), true);
  assert.equal(accountParticipatesInRotation({ id: "b", mode: "manual" }), false);
  assert.equal(accountParticipatesInRotation({ id: "c", mode: "single" }), false);
  assert.equal(accountParticipatesInRotation({ id: "d", mode: "rotate", disabled: true }), false);
  assert.equal(accountParticipatesInRotation({ id: "e", mode: "rotate", hidden: true }), true);
  assert.equal(accountParticipatesInRotation({ id: "f", mode: "rotate" }, { pausedByUser: true }), false);
  assert.equal(accountParticipatesInRotation({ id: "g", mode: "rotate" }, { stoppedByUser: true }), false);
});

test("安全线只在完整作品结束后触发冷却并使用最早滚动恢复时间", () => {
  const now = Date.parse("2026-08-07T12:00:00.000Z");
  assert.deepEqual(accountQuotaBoundary({ generated: 44, settings: { generationLimit: 45 } }, now), {
    reached: false,
    generated: 44,
    limit: 45,
    nextProbeAt: 0
  });
  assert.deepEqual(accountQuotaBoundary({
    generated: 49,
    nextExpiryAt: "2026-08-07T14:15:00.000Z",
    settings: { generationLimit: 45 }
  }, now), {
    reached: true,
    generated: 49,
    limit: 45,
    nextProbeAt: Date.parse("2026-08-07T14:15:00.000Z")
  });
});

test("轮换从当前游标向后循环，跳过冷却和不参与账号", () => {
  const now = Date.parse("2026-08-07T12:00:00.000Z");
  const accounts = [
    { id: "a", mode: "rotate" },
    { id: "b", mode: "manual" },
    { id: "c", mode: "rotate" }
  ];
  const selected = selectNextRotationAccount({
    accounts,
    cursor: 0,
    now,
    cycleByAccount: {
      a: { nextProbeAt: now + 60_000 },
      c: { nextProbeAt: 0 }
    }
  });
  assert.equal(selected.account.id, "c");
  assert.equal(selected.cursor, 2);

  const wrapped = selectNextRotationAccount({
    accounts,
    cursor: 3,
    now,
    cycleByAccount: { a: {}, c: {} }
  });
  assert.equal(wrapped.account.id, "a");
  assert.equal(wrapped.cursor, 0);
});

test("全部轮换账号冷却时返回最早恢复时间", () => {
  const now = Date.parse("2026-08-07T12:00:00.000Z");
  const first = now + 30 * 60_000;
  const second = now + 90 * 60_000;
  const selected = selectNextRotationAccount({
    accounts: [{ id: "a", mode: "rotate" }, { id: "b", mode: "rotate" }],
    cursor: 0,
    now,
    cycleByAccount: {
      a: { nextProbeAt: second },
      b: { nextProbeAt: first }
    }
  });
  assert.equal(selected.account, null);
  assert.equal(selected.nextProbeAt, first);
});
