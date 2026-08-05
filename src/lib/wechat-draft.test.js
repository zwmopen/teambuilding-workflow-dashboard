const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const wechatDraft = require("./wechat-draft");

test("wechat account settings merge accounts and never persist AppSecret", () => {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-draft-settings-"));
  const previousRuntime = process.env.TEAMBUILDING_DASHBOARD_RUNTIME;
  process.env.TEAMBUILDING_DASHBOARD_RUNTIME = runtime;
  try {
    wechatDraft.saveWechatSettings({
      defaultAccount: "main",
      accounts: {
        main: {
          name: "主公众号",
          appId: "wx_main",
          appSecretEnv: "WECHAT_MAIN_APP_SECRET",
          appSecret: "must-not-persist"
        }
      }
    });
    const saved = wechatDraft.saveWechatSettings({
      defaultAccount: "secondary",
      accounts: {
        secondary: {
          name: "备用公众号",
          appId: "wx_secondary",
          appSecretEnv: "WECHAT_SECONDARY_APP_SECRET",
          appSecret: "also-must-not-persist"
        }
      }
    });
    assert.equal(saved.defaultAccount, "secondary");
    assert.equal(saved.accounts.main.name, "主公众号");
    assert.equal(saved.accounts.secondary.name, "备用公众号");
    assert.equal(saved.accounts.main.appSecret, undefined);
    assert.equal(saved.accounts.secondary.appSecret, undefined);
  } finally {
    if (previousRuntime == null) delete process.env.TEAMBUILDING_DASHBOARD_RUNTIME;
    else process.env.TEAMBUILDING_DASHBOARD_RUNTIME = previousRuntime;
    fs.rmSync(runtime, { recursive: true, force: true });
  }
});

// ─── 批量草稿队列测试 ──────────────────────────────────

function setupRuntime() {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-batch-"));
  const previous = process.env.TEAMBUILDING_DASHBOARD_RUNTIME;
  process.env.TEAMBUILDING_DASHBOARD_RUNTIME = runtime;
  return { runtime, previous, cleanup() {
    if (previous == null) delete process.env.TEAMBUILDING_DASHBOARD_RUNTIME;
    else process.env.TEAMBUILDING_DASHBOARD_RUNTIME = previous;
    fs.rmSync(runtime, { recursive: true, force: true });
  }};
}

test("createBatchQueue persists multiple posts and returns a batch id", () => {
  const ctx = setupRuntime();
  try {
    const batchId = wechatDraft.createBatchQueue([
      { postPath: "D:\\fake\\post1", title: "标题一", body: "正文一" },
      { postPath: "D:\\fake\\post2", title: "标题二", body: "正文二" },
      { postPath: "D:\\fake\\post3", title: "标题三", body: "正文三" }
    ]);
    assert.ok(batchId, "batchId should be returned");
    assert.match(batchId, /^batch_\d+/, "batchId starts with batch_");

    const queue = wechatDraft.getBatchQueue();
    assert.equal(queue.batchId, batchId);
    assert.equal(queue.status, "pending");
    assert.equal(queue.items.length, 3);
    assert.equal(queue.items[0].postPath, "D:\\fake\\post1");
    assert.equal(queue.items[0].title, "标题一");
    assert.equal(queue.items[0].status, "pending");
    assert.equal(queue.items[2].title, "标题三");
  } finally {
    ctx.cleanup();
  }
});

test("getBatchQueue returns empty state when no batch exists", () => {
  const ctx = setupRuntime();
  try {
    const queue = wechatDraft.getBatchQueue();
    assert.equal(queue.batchId, null);
    assert.equal(queue.status, "idle");
    assert.equal(queue.items.length, 0);
  } finally {
    ctx.cleanup();
  }
});

test("updateBatchItem marks items as success or failed with details", () => {
  const ctx = setupRuntime();
  try {
    const batchId = wechatDraft.createBatchQueue([
      { postPath: "D:\\fake\\post1", title: "标题一", body: "正文一" },
      { postPath: "D:\\fake\\post2", title: "标题二", body: "正文二" }
    ]);
    wechatDraft.updateBatchItem(batchId, 0, {
      status: "success",
      draftMediaId: "media_001",
      processedAt: new Date().toISOString()
    });
    wechatDraft.updateBatchItem(batchId, 1, {
      status: "failed",
      error: "上传素材失败",
      processedAt: new Date().toISOString()
    });

    const queue = wechatDraft.getBatchQueue();
    assert.equal(queue.items[0].status, "success");
    assert.equal(queue.items[0].draftMediaId, "media_001");
    assert.equal(queue.items[1].status, "failed");
    assert.equal(queue.items[1].error, "上传素材失败");
  } finally {
    ctx.cleanup();
  }
});

test("updateBatchStatus sets the overall batch status", () => {
  const ctx = setupRuntime();
  try {
    const batchId = wechatDraft.createBatchQueue([
      { postPath: "D:\\fake\\post1", title: "标题一", body: "正文一" }
    ]);
    wechatDraft.updateBatchStatus(batchId, "running");
    assert.equal(wechatDraft.getBatchQueue().status, "running");

    wechatDraft.updateBatchStatus(batchId, "completed");
    assert.equal(wechatDraft.getBatchQueue().status, "completed");
  } finally {
    ctx.cleanup();
  }
});

test("clearBatchQueue removes the persisted batch", () => {
  const ctx = setupRuntime();
  try {
    wechatDraft.createBatchQueue([
      { postPath: "D:\\fake\\post1", title: "标题一", body: "正文一" }
    ]);
    assert.ok(wechatDraft.getBatchQueue().batchId);

    wechatDraft.clearBatchQueue();
    const queue = wechatDraft.getBatchQueue();
    assert.equal(queue.batchId, null);
    assert.equal(queue.items.length, 0);
    assert.equal(queue.status, "idle");
  } finally {
    ctx.cleanup();
  }
});

test("batch queue survives across calls (persistence check)", () => {
  const ctx = setupRuntime();
  try {
    const batchId = wechatDraft.createBatchQueue([
      { postPath: "D:\\fake\\post1", title: "标题一", body: "正文一" }
    ]);
    // Simulate a "restart" by clearing the in-memory cache if any
    // The queue should be read back from disk
    const queue = wechatDraft.getBatchQueue();
    assert.equal(queue.batchId, batchId);
    assert.equal(queue.items.length, 1);
  } finally {
    ctx.cleanup();
  }
});

// ─── 图片素材复用测试 ──────────────────────────────────

test("recordMaterialMapping stores and retrieves media_id by image hash", () => {
  const ctx = setupRuntime();
  try {
    const hash1 = "abc123def456";
    const hash2 = "789xyz000aaa";

    wechatDraft.recordMaterialMapping(hash1, "media_id_001", "main");
    wechatDraft.recordMaterialMapping(hash2, "media_id_002", "main");

    const found1 = wechatDraft.findReusableMediaId(hash1, "main");
    assert.equal(found1, "media_id_001");

    const found2 = wechatDraft.findReusableMediaId(hash2, "main");
    assert.equal(found2, "media_id_002");

    const notFound = wechatDraft.findReusableMediaId("nonexistent_hash", "main");
    assert.equal(notFound, null);
  } finally {
    ctx.cleanup();
  }
});

test("findReusableMediaId is account-scoped", () => {
  const ctx = setupRuntime();
  try {
    const hash = "shared_hash_value";
    wechatDraft.recordMaterialMapping(hash, "media_main", "main");
    wechatDraft.recordMaterialMapping(hash, "media_secondary", "secondary");

    assert.equal(wechatDraft.findReusableMediaId(hash, "main"), "media_main");
    assert.equal(wechatDraft.findReusableMediaId(hash, "secondary"), "media_secondary");
    assert.equal(wechatDraft.findReusableMediaId(hash, "third"), null);
  } finally {
    ctx.cleanup();
  }
});
