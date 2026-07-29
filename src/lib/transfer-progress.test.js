"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  publicTransferTask,
  updateTransferProgress
} = require("./transfer-progress");

test("distribution output becomes human-readable progress stages", () => {
  const record = { progress: 0, output: "", child: { pid: 1 } };
  updateTransferProgress(record, "目标：1号；指定作品集：作品集_008[转]\n");
  assert.equal(record.progress, 3);
  assert.equal(record.stageLabel, "正在核对作品包与设备");

  updateTransferProgress(record, "接收任务 task-skill-20260725123456\n");
  assert.equal(record.remoteTaskId, "task-skill-20260725123456");
  assert.equal(record.progress, 8);

  updateTransferProgress(record, "传送 42%\n");
  assert.equal(record.progress, 42);
  assert.equal(record.stageLabel, "正在发送到设备");

  updateTransferProgress(record, "接收确认成功\n");
  assert.equal(record.progress, 97);
  assert.equal(record.stageLabel, "设备已接收，正在确认");

  updateTransferProgress(record, '补货完成：{"transport":"Wi-Fi"}\n');
  assert.equal(record.progress, 99);
  assert.equal(record.stageLabel, "正在写入使用记录");
  assert.equal(record.transport, "Wi-Fi");
});

test("automatic distribution records the collection selected by the transfer script", () => {
  const record = { progress: 0, output: "", collection: "" };
  updateTransferProgress(
    record,
    '补货完成：{"device":"苹果12","asset":"作品集_050[转]","transport":"Wi-Fi"}\n'
  );

  assert.equal(record.collection, "作品集_050[转]");
  assert.equal(record.transport, "Wi-Fi");
  assert.equal(record.progress, 99);
});

test("automatic distribution also handles a completion line split across output chunks", () => {
  const record = { progress: 0, output: "", collection: "" };
  updateTransferProgress(record, '补货完成：{"device":"苹果12",');
  updateTransferProgress(record, '"asset":"作品集_051[转]","transport":"Wi-Fi"}\n');

  assert.equal(record.collection, "作品集_051[转]");
  assert.equal(record.transport, "Wi-Fi");
});

test("public task never exposes the child process", () => {
  assert.deepEqual(
    publicTransferTask({ id: "task-1", child: { pid: 1 }, progress: 10 }),
    { id: "task-1", progress: 10 }
  );
});
