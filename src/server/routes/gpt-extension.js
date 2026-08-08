/**
 * GPT 自动生产、扩展工具与去重路由
 * 匹配 /api/gpt-online-templates, /api/extension/*, /api/gpt-production/*, /api/dedup/*
 * @returns {Promise<boolean>} true 表示已匹配并处理
 */
async function handle(req, res, pathname, parsed, ctx) {
  const {
    send, sendJson, sendExtensionJson, getBody, readJson, writeJson,
    isPathInside, exists,
    PORT,
    DOWNLOAD_ROOT, WORKPKG_CONFIG_FILE, EXTENSION_DOWNLOAD_LOG_FILE, DEDUP_LEDGER_FILE,
    GPT_PRODUCTION_CHECKPOINT_FILE, GPT_CONVERSATION_LOG_FILE,
    getWorkspaceSettings, saveWorkspaceSettings, inspectGptWorkPackage,
    moveWorkspaceEntry,
    readOnlineTemplates, updateOnlineTemplate,
    extensionProductSnapshot, extensionProductTreeSnapshot,
    runExtensionWorkPackage, saveExtensionCopyText,
    readGptProductionCheckpoint, writeGptProductionCheckpoint,
    findRecoverableImageBatch, gptQuotaSnapshot, appendGptQuotaEvent,
    archiveMaterialAfterProduction,
    recordMaterialUsage, checkMaterialUsage, updateMaterialMetadata,
    getMaterialGlobalIndex,
    publicDedupStatus, syncHistoricalDedupLedger, getDedupLedger,
    isDownloadedText, registerDownloadedText,
  } = ctx;

  const path = require("path");
  const fs = require("fs");
  const sharp = require("sharp");
  const { resolveAuthorizedDownloadRoot } = require("../../lib/gpt-download-root");

  // --- /api/gpt-online-templates ---
  if (pathname === "/api/gpt-online-templates" && req.method === "GET") {
    return sendExtensionJson(req, res, readOnlineTemplates());
  }

  if (pathname === "/api/gpt-online-templates" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    return sendExtensionJson(req, res, { ok: true, ...updateOnlineTemplate(body) });
  }

  // --- /api/extension/* (workspace / settings / products / work-package) ---
  if (pathname === "/api/extension/workspace" && req.method === "GET") {
    const settings = getWorkspaceSettings();
    return sendExtensionJson(req, res, {
      generatedAt: new Date().toISOString(),
      settings,
      products: extensionProductSnapshot(),
      dedup: publicDedupStatus()
    });
  }

  if (pathname === "/api/extension/settings" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    const settings = saveWorkspaceSettings(body);
    return sendExtensionJson(req, res, {
      ok: true,
      settings,
      products: extensionProductSnapshot(),
      dedup: publicDedupStatus()
    });
  }

  if (pathname === "/api/extension/products" && req.method === "GET") {
    const collection = parsed.query.collection ? decodeURIComponent(parsed.query.collection) : "";
    return sendExtensionJson(req, res, {
      generatedAt: new Date().toISOString(),
      products: extensionProductSnapshot(collection)
    });
  }

  if (pathname === "/api/extension/product-tree" && req.method === "GET") {
    const target = parsed.query.path ? decodeURIComponent(parsed.query.path) : "";
    return sendExtensionJson(req, res, {
      generatedAt: new Date().toISOString(),
      tree: extensionProductTreeSnapshot(target)
    });
  }

  if (pathname === "/api/extension/work-package" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 256_000) || "{}");
    return sendExtensionJson(req, res, await runExtensionWorkPackage(body));
  }

  if (pathname === "/api/extension/save-copy-text" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 256_000) || "{}");
    try {
      return sendExtensionJson(req, res, saveExtensionCopyText(body));
    } catch (error) {
      return sendExtensionJson(req, res, { error: error.message }, 400);
    }
  }

  if (pathname === "/api/extension/save-generated-image" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 42_000_000) || "{}");
    const filename = String(body.filename || "").trim();
    const safeName = path.basename(filename);
    if (safeName !== filename
      || !/^chatgpt-workpkg-\d{8}-\d{6}-[a-z0-9]{4}-\d+-of-\d+\.(?:png|jpe?g|webp)$/i.test(safeName)) {
      return send(res, 400, JSON.stringify({ error: "生成图片文件名无效" }));
    }
    if (!/^image\/(?:png|jpe?g|webp)$/i.test(String(body.contentType || ""))) {
      return send(res, 400, JSON.stringify({ error: "生成图片类型无效" }));
    }
    const bytes = Buffer.from(String(body.data || ""), "base64");
    if (bytes.length < 1_000 || bytes.length > 30_000_000) {
      return send(res, 400, JSON.stringify({ error: "生成图片大小无效" }));
    }
    try {
      const metadata = await sharp(bytes).metadata();
      if (!["png", "jpeg", "webp"].includes(String(metadata.format || ""))
        || Number(metadata.width || 0) < 256 || Number(metadata.height || 0) < 256) {
        return send(res, 400, JSON.stringify({ error: "生成图片内容校验失败" }));
      }
      const requestedRoot = String(body.downloadRoot || "").trim();
      const configuredRoot = String(readJson(WORKPKG_CONFIG_FILE, {}).image_inbox_path || "").trim();
      const targetRoot = resolveAuthorizedDownloadRoot(requestedRoot, {
        defaultRoot: DOWNLOAD_ROOT,
        configuredRoot
      });
      fs.mkdirSync(targetRoot, { recursive: true });
      const target = path.join(targetRoot, safeName);
      fs.writeFileSync(target, bytes, { flag: "wx" });
      return sendExtensionJson(req, res, {
        ok: true,
        filename: target,
        bytes: bytes.length,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format
      });
    } catch (error) {
      if (error?.code === "EEXIST") {
        return send(res, 409, JSON.stringify({ error: "同批次图片已经存在，请重新恢复任务" }));
      }
      return send(res, 400, JSON.stringify({ error: `生成图片保存失败：${error.message}` }));
    }
  }

  // --- /api/gpt-production/* ---
  if (pathname === "/api/gpt-production/checkpoint" && req.method === "GET") {
    const requestId = parsed.query.requestId ? decodeURIComponent(parsed.query.requestId) : "";
    return sendExtensionJson(req, res, { ok: true, checkpoint: readGptProductionCheckpoint(requestId) });
  }

  if (pathname === "/api/gpt-production/history" && req.method === "GET") {
    const saved = readJson(GPT_PRODUCTION_CHECKPOINT_FILE, { version: 1, items: {} });
    const items = Object.values(saved.items || {}).sort((left, right) =>
      String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""))
    ).slice(0, 200).map((item) => {
      const packagePath = String(item.packagePath || "").trim();
      const packageInspection = inspectGptWorkPackage(packagePath, Number(item.plannedImageCount || 0));
      return {
        requestId: item.requestId,
        stage: packagePath && !packageInspection.valid ? "成品缺 TXT 或图片，已暂停" : item.stage,
        percent: item.percent,
        plannedImageCount: item.plannedImageCount,
        downloadedImageCount: Array.isArray(item.downloadedFiles) ? item.downloadedFiles.length : 0,
        downloadRoot: item.downloadRoot,
        copyTextLength: String(item.copyText || "").trim().length,
        packagePath,
        packageValid: packagePath ? packageInspection.valid : false,
        packageImageCount: packageInspection.imageCount,
        packageTextCount: packageInspection.textCount,
        packageExpectedImageCount: packageInspection.expectedImageCount,
        packageValidatedByRecord: packageInspection.validatedByPackageRecord === true,
        conversationUrl: item.conversationUrl,
        sourceMaterialPath: item.sourceMaterialPath || "",
        updatedAt: item.updatedAt
      };
    });
    return sendExtensionJson(req, res, { ok: true, items });
  }

  if (pathname === "/api/gpt-production/checkpoint" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 512_000) || "{}");
    return sendExtensionJson(req, res, { ok: true, checkpoint: writeGptProductionCheckpoint(body) });
  }

  if (pathname === "/api/gpt-production/recover-image-batch" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    return sendExtensionJson(req, res, { ok: true, batch: findRecoverableImageBatch(body) });
  }

  if (pathname === "/api/gpt-production/quota" && req.method === "GET") {
    const accountId = parsed.query.account ? decodeURIComponent(parsed.query.account) : "";
    return sendExtensionJson(req, res, { ok: true, quota: gptQuotaSnapshot(accountId) });
  }

  if (pathname === "/api/gpt-production/quota-event" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    try {
      return sendExtensionJson(req, res, { ok: true, quota: appendGptQuotaEvent(body) });
    } catch (error) {
      return send(res, 400, JSON.stringify({ error: error.message }));
    }
  }

  if (pathname === "/api/gpt-production/archive-material" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    try {
      return sendExtensionJson(req, res, { ok: true, archive: archiveMaterialAfterProduction(body) });
    } catch (error) {
      return send(res, 400, JSON.stringify({ error: error.message }));
    }
  }

  // --- /api/gpt-production/conversation-log ---
  // 扩展端工作流每一步发送/接收的完整内容都写入 jsonl，供排查使用
  if (pathname === "/api/gpt-production/conversation-log" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 512_000) || "{}");
    try {
      const entry = {
        timestamp: new Date().toISOString(),
        event: String(body.event || "").slice(0, 80),
        requestId: String(body.requestId || "").slice(0, 120),
        account: String(body.account || "").slice(0, 60),
        conversationUrl: String(body.conversationUrl || "").slice(0, 500),
        materialName: String(body.materialName || "").slice(0, 300),
        step: String(body.step || "").slice(0, 60),
        // 发送的文字内容（完整，截断到 10000 字符防止日志膨胀）
        sentText: typeof body.sentText === "string" ? body.sentText.slice(0, 10000) : "",
        // GPT 回复的文字内容（完整，截断到 10000 字符）
        receivedText: typeof body.receivedText === "string" ? body.receivedText.slice(0, 10000) : "",
        // 图片 URL 列表
        imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls.slice(0, 50) : [],
        // 下载的文件路径列表
        downloadedFiles: Array.isArray(body.downloadedFiles) ? body.downloadedFiles.slice(0, 50).map(f => String(f).slice(0, 500)) : [],
        // 文案保存路径
        copyTextPath: String(body.copyTextPath || "").slice(0, 500),
        // 打包结果路径
        packagePath: String(body.packagePath || "").slice(0, 500),
        // 额外元数据
        meta: body.meta || {}
      };
      fs.mkdirSync(path.dirname(GPT_CONVERSATION_LOG_FILE), { recursive: true });
      fs.appendFileSync(GPT_CONVERSATION_LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
      return sendExtensionJson(req, res, { ok: true });
    } catch (error) {
      return send(res, 400, JSON.stringify({ error: error.message }));
    }
  }

  // --- /api/gpt-production/dom-snapshot ---
  // 扩展端发送 GPT 页面 DOM 结构快照，用于排查附件/发送按钮检测失败
  if (pathname === "/api/gpt-production/dom-snapshot" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 512_000) || "{}");
    try {
      const entry = { timestamp: new Date().toISOString(), ...body };
      const snapshotFile = path.join(path.dirname(GPT_CONVERSATION_LOG_FILE), "gpt-dom-snapshot.jsonl");
      fs.mkdirSync(path.dirname(snapshotFile), { recursive: true });
      fs.appendFileSync(snapshotFile, JSON.stringify(entry).slice(0, 200000) + "\n", "utf8");
      return sendExtensionJson(req, res, { ok: true });
    } catch (error) {
      return send(res, 400, JSON.stringify({ error: error.message }));
    }
  }

  if (pathname === "/api/gpt-production/conversation-log" && req.method === "GET") {
    const limit = Math.min(200, Math.max(1, Number(parsed.query.limit || 50)));
    try {
      if (!fs.existsSync(GPT_CONVERSATION_LOG_FILE)) {
        return sendExtensionJson(req, res, { ok: true, entries: [] });
      }
      const lines = fs.readFileSync(GPT_CONVERSATION_LOG_FILE, "utf8")
        .split("\n")
        .filter(Boolean)
        .slice(-limit)
        .reverse();
      const entries = lines.map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
      return sendExtensionJson(req, res, { ok: true, entries });
    } catch (error) {
      return send(res, 400, JSON.stringify({ error: error.message }));
    }
  }

  // --- /api/extension/* (material management) ---
  if (pathname === "/api/extension/material-use" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    try {
      return sendExtensionJson(req, res, { ok: true, record: recordMaterialUsage(body) });
    } catch (error) {
      return send(res, 400, JSON.stringify({ error: error.message }));
    }
  }

  if (pathname === "/api/extension/material-usage-check" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    try {
      return sendExtensionJson(req, res, { ok: true, ...checkMaterialUsage(body) });
    } catch (error) {
      return send(res, 400, JSON.stringify({ error: error.message }));
    }
  }

  if (pathname === "/api/extension/material-metadata" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    try {
      return sendExtensionJson(req, res, { ok: true, record: updateMaterialMetadata(body) });
    } catch (error) {
      return sendExtensionJson(req, res, { error: error.message }, 400);
    }
  }

  if (pathname === "/api/extension/material-index" && req.method === "GET") {
    return sendExtensionJson(req, res, {
      ok: true,
      index: getMaterialGlobalIndex({ refresh: parsed.query.refresh === "true" })
    });
  }

  if (pathname === "/api/extension/move-entry" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    try {
      return sendExtensionJson(req, res, { ok: true, ...moveWorkspaceEntry(body) });
    } catch (error) {
      return send(res, 400, JSON.stringify({ error: error.message }));
    }
  }

  // --- /api/dedup/* ---
  if (pathname === "/api/dedup/status" && req.method === "GET") {
    return sendJson(res, publicDedupStatus());
  }

  if (pathname === "/api/dedup/sync" && req.method === "POST") {
    return sendJson(res, publicDedupStatus(syncHistoricalDedupLedger()));
  }

  if (pathname === "/api/dedup/export" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="teambuilding-dedup-ledger.json"',
      "Cache-Control": "no-store"
    });
    return res.end(JSON.stringify(getDedupLedger(), null, 2));
  }

  if (pathname === "/api/dedup/check-text" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 256_000) || "{}");
    const result = isDownloadedText(getDedupLedger(), String(body.text || ""));
    return sendExtensionJson(req, res, {
      duplicate: result.duplicate,
      textHash: result.textHash,
      record: result.record ? {
        title: result.record.title,
        path: result.record.path,
        recordedAt: result.record.recordedAt,
        source: result.record.source
      } : null
    });
  }

  if (pathname === "/api/dedup/register-download" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 256_000) || "{}");
    if (!String(body.text || "").trim()) {
      return send(res, 400, JSON.stringify({ error: "文案内容不能为空" }));
    }
    const result = registerDownloadedText(DEDUP_LEDGER_FILE, body.text, {
      title: body.title,
      path: body.path,
      conversationUrl: body.conversationUrl
    });
    return sendJson(res, {
      duplicate: result.duplicate,
      textHash: result.textHash,
      status: publicDedupStatus(result.ledger)
    });
  }

  // --- /api/extension/download-event & info ---
  if (pathname === "/api/extension/download-event" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 256_000) || "{}");
    const filename = path.resolve(String(body.filename || "").trim());
    if (!filename || !isPathInside(path.resolve(DOWNLOAD_ROOT), filename)) {
      return send(res, 400, JSON.stringify({ error: "只记录下载目录中的文件" }));
    }
    const saved = readJson(EXTENSION_DOWNLOAD_LOG_FILE, { version: 1, events: [] });
    const event = {
      downloadId: Number(body.downloadId || 0),
      requestId: String(body.requestId || ""),
      filename,
      url: String(body.url || ""),
      finalUrl: String(body.finalUrl || ""),
      totalBytes: Number(body.totalBytes || 0),
      conversationUrl: String(body.conversationUrl || ""),
      completedAt: String(body.completedAt || new Date().toISOString()),
      exists: exists(filename)
    };
    saved.events = [...(saved.events || []), event].slice(-500);
    saved.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(EXTENSION_DOWNLOAD_LOG_FILE), { recursive: true });
    writeJson(EXTENSION_DOWNLOAD_LOG_FILE, saved);
    return sendExtensionJson(req, res, { ok: true, event });
  }

  if (pathname === "/api/extension/info" && req.method === "GET") {
    return sendExtensionJson(req, res, {
      name: "团建工作台 · GPT 助手",
      path: "D:\\AICode\\工具开发\\projects\\teambuilding-workflow-dashboard\\src\\integrations\\gpt-production-extension",
      modules: ["最新版会话树", "成品区", "素材区", "生产去重状态", "上传到当前 GPT"],
      localApi: `http://127.0.0.1:${PORT}`
    });
  }

  return false;
}

module.exports = { handle };
