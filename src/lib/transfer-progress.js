"use strict";

function lastLine(text) {
  return String(text || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1) || "";
}

function updateTransferProgress(record, chunk, isError = false) {
  const text = String(chunk || "");
  if (!text) return record;

  record.output = `${record.output || ""}${text}`.slice(-64 * 1024);
  const line = lastLine(text);
  if (line) record.message = line;
  if (isError && line) record.error = line;

  const remoteMatch = text.match(/接收任务\s+(task-skill-\d{14})/);
  if (remoteMatch) record.remoteTaskId = remoteMatch[1];

  const packageMatches = [...text.matchAll(/打包\s+(\d+)%/g)];
  if (packageMatches.length) {
    record.stage = "packing";
    record.stageLabel = "正在整理作品包";
    record.progress = Math.max(record.progress || 0, Math.min(12, Math.round(Number(packageMatches.at(-1)[1]) * 0.12)));
  }

  if (/目标：/.test(text)) {
    record.stage = "preparing";
    record.stageLabel = "正在核对作品包与设备";
    record.progress = Math.max(record.progress || 0, 3);
  }
  if (/接收任务\s+task-skill-/.test(text)) {
    record.stage = "connecting";
    record.stageLabel = "设备已响应，准备接收";
    record.progress = Math.max(record.progress || 0, 8);
  }

  const transferMatches = [...text.matchAll(/传送\s+(\d+)%/g)];
  if (transferMatches.length) {
    record.stage = "sending";
    record.stageLabel = "正在发送到设备";
    record.progress = Math.max(record.progress || 0, Math.min(95, Number(transferMatches.at(-1)[1])));
  }
  if (/接收确认|接收成功/.test(text)) {
    record.stage = "confirming";
    record.stageLabel = "设备已接收，正在确认";
    record.progress = Math.max(record.progress || 0, 97);
  }
  if (/补货完成：|发送完成：/.test(record.output)) {
    record.stage = "recording";
    record.stageLabel = "正在写入使用记录";
    record.progress = Math.max(record.progress || 0, 99);
    const resultMatch = record.output.match(/(?:补货完成|发送完成)：(\{[^\r\n]+\})/);
    if (resultMatch) {
      try {
        const result = JSON.parse(resultMatch[1]);
        if (result.transport) record.transport = String(result.transport);
        if (result.asset) record.collection = String(result.asset).trim();
      } catch {
        // 旧版脚本可能输出非 JSON 文本；不影响任务完成判定。
      }
    }
  }
  return record;
}

function publicTransferTask(record) {
  if (!record) return null;
  const { child, ...safe } = record;
  return safe;
}

module.exports = {
  lastLine,
  publicTransferTask,
  updateTransferProgress
};
