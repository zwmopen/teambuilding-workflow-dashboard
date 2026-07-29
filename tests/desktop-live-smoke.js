const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DEBUG_URL = process.env.TB_DEBUG_URL || "http://127.0.0.1:9333/json";
const APP_URL = process.env.TB_APP_URL || "http://127.0.0.1:4327/";
const ARTIFACT_ROOT = process.env.TB_SMOKE_ARTIFACTS
  || path.resolve(__dirname, "..", "artifacts", "desktop-smoke");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectLocalWorkspace() {
  const targets = await fetch(DEBUG_URL).then((response) => response.json());
  const target = targets.find((item) => ["page", "webview"].includes(item.type) && item.url.startsWith(APP_URL));
  assert(target, `未找到桌面工作台页面：${APP_URL}`);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const browserErrors = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.exceptionThrown") {
      browserErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || "页面异常");
    }
    if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
      browserErrors.push(`${message.params.entry.text} ${message.params.entry.url || ""}`.trim());
    }
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const screenshot = async (name) => {
    const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
    const output = path.join(ARTIFACT_ROOT, `${name}.png`);
    fs.writeFileSync(output, Buffer.from(result.data, "base64"));
    return output;
  };
  return { socket, send, evaluate, screenshot, browserErrors };
}

async function main() {
  const { socket, send, evaluate, screenshot, browserErrors } = await connectLocalWorkspace();
  const checks = [];
  const check = async (name, expression) => {
    const value = await evaluate(expression);
    assert(value, name);
    checks.push({ name, value });
  };

  try {
    await evaluate("location.reload(); true");
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const ready = await evaluate(`document.readyState === 'complete'
        && Number(document.querySelector('#statMaterialCategories')?.textContent || 0) > 0
        && Boolean(document.querySelector('#workbenchMaterialFolders [data-workbench-material-folder]'))`);
      if (ready) break;
      await wait(250);
    }

    const tabs = await evaluate(`[...document.querySelectorAll('.tab[data-tab]')].map((el) => el.dataset.tab)`);
    assert.deepEqual(tabs, ["dashboard", "distribution", "conversion", "plugins", "settings"]);
    checks.push({ name: "主工作流入口", value: tabs });

    for (const tab of tabs) {
      await evaluate(`document.querySelector('.tab[data-tab="${tab}"]').click(); true`);
      await wait(tab === "conversion" ? 650 : 180);
      const state = await evaluate(`(() => {
        const view = document.querySelector('.view.active');
        const visible = (el) => el && getComputedStyle(el).display !== 'none'
          && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
        const clipped = [...view.querySelectorAll('button, .tab, .segmented-button, .setting-label')]
          .filter(visible)
          .filter((el) => el.scrollWidth > el.clientWidth + 4)
          .map((el) => (el.textContent || '').trim()).filter(Boolean).slice(0, 8);
        return {
          tab: document.querySelector('.tab.active')?.dataset.tab,
          view: view?.id,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
          clipped
        };
      })()`);
      assert.equal(state.tab, tab, `${tab} 未切换成功`);
      assert(state.view, `${tab} 没有活动界面`);
      assert.equal(state.horizontalOverflow, false, `${tab} 存在整页横向溢出`);
      assert.deepEqual(state.clipped, [], `${tab} 有按钮或标签文字被裁切`);
      checks.push({ name: `${tab} 布局`, value: state });
      await screenshot(tab);
    }

    await evaluate(`document.querySelector('.tab[data-tab="dashboard"]').click(); true`);
    await wait(250);
    await check("素材生产三栏工作台", `Boolean(document.querySelector('.production-library-column')
      && document.querySelector('.production-dialog-column')
      && document.querySelector('.production-output-column'))`);
    await check("生产范围由素材文件夹选择决定", `!document.querySelector('[data-workbench-mode]')
      && document.querySelectorAll('[data-workbench-material-folder]').length > 0
      && Boolean(document.querySelector('#workbenchMaterialCount'))`);
    await check("素材文件夹可展开且图文资源不设复选框", `(async () => {
      const category = document.querySelector('[data-workbench-material-folder]');
      category?.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const post = document.querySelector('[data-workbench-post-folder]');
      post?.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const assets = [...document.querySelectorAll('#workbenchMaterialFolders [data-image-preview], #workbenchMaterialFolders [data-workbench-text]')];
      return Boolean(category && post && assets.length)
        && assets.every((item) => !item.querySelector('input[type="checkbox"]'));
    })()`);
    await check("生产确认区在主界面可操作", `Boolean(document.querySelector('#workbenchStartProductionBtn')?.offsetParent
      && document.querySelector('#workbenchPlanPanel'))`);
    await check("任务进度和质量报告区存在", `Boolean(document.querySelector('#workbenchProgressBar')
      && document.querySelector('#workbenchTaskActions')
      && document.querySelector('#workbenchQualitySummary'))`);
    await check("正式桌面端暴露原生文件夹选择器", `typeof window.desktopDialogs?.pickFolder === 'function'`);

    await evaluate(`document.querySelector('.tab[data-tab="conversion"]').click(); true`);
    await wait(650);
    await check("流量转化同层显示且没有加载壳提示", `(() => {
      const frame = document.querySelector('#conversionAppFrame');
      const status = document.querySelector('#conversionEmbeddedStatus');
      return Boolean(frame?.offsetParent)
        && (!status || getComputedStyle(status).display === 'none')
        && !document.body.textContent.includes('正在连接')
        && !document.body.textContent.includes('独立运行');
    })()`);
    await check("流量转化已由同源代理加载", `(() => {
      const frame = document.querySelector('#conversionAppFrame');
      try { return Boolean(frame?.contentDocument?.body?.textContent?.trim()); } catch { return false; }
    })()`);

    await evaluate(`document.querySelector('.tab[data-tab="distribution"]').click(); true`);
    await wait(300);
    await check("内容分发包含设备、三阶段与记录", `(() => {
      const labels = [...document.querySelectorAll('#distributionTabs [data-panel]')].map((item) => item.textContent);
      return ['设备','抖音小红书','微信公众号','已发送','操作记录']
        .every((label) => labels.some((text) => text.includes(label)));
    })()`);
    await check("设备操作遵守在线和信任状态", `(() => {
      const rows = [...document.querySelectorAll('.device-row')];
      return rows.every((row) => {
        const disabled = [...row.querySelectorAll('.device-actions button')].every((button) => button.disabled);
        return row.classList.contains('is-online') && !row.classList.contains('is-untrusted') ? true : disabled;
      });
    })()`);

    await evaluate(`document.querySelector('.tab[data-tab="plugins"]').click(); true`);
    await wait(200);
    await check("插件市场有分类与工具卡", `document.querySelectorAll('#pluginMarketGrid .plugin-market-card').length >= 6
      && document.querySelectorAll('#pluginMarketFilters [data-plugin-filter]').length >= 4`);

    await evaluate(`document.querySelector('.tab[data-tab="settings"]').click(); true`);
    await wait(200);
    await check("设置只保留全局接口备份与软件信息", `Boolean(document.querySelector('#productionApiProvider')
      && document.querySelector('#cloudBackupStatus')
      && document.querySelector('#settingsVersion'))
      && !document.querySelector('#settingsMaterialRoot')
      && !document.querySelector('#settingsPortfolioRoot')`);
    await check("帮助图标统一为小圆按钮", `(() => {
      const buttons = [...document.querySelectorAll('[data-page-help]')];
      return buttons.length >= 4 && buttons.every((button) => {
        const rect = button.getBoundingClientRect();
        const radius = parseFloat(getComputedStyle(button).borderRadius);
        return Math.abs(rect.width - rect.height) <= 2 && radius >= rect.width * 0.45;
      });
    })()`);
    await check("坚果云已配置且备份恢复入口齐全", `Boolean(document.querySelector('#cloudBackupStatus')?.textContent.includes('已接入')
      && document.querySelector('#runCloudBackupBtn')
      && document.querySelector('#inspectCloudBackupBtn')
      && document.querySelector('#restoreCloudBackupBtn'))`);

    await send("Emulation.setDeviceMetricsOverride", {
      width: 1180,
      height: 760,
      deviceScaleFactor: 1,
      mobile: false
    });
    for (const tab of tabs) {
      await evaluate(`document.querySelector('.tab[data-tab="${tab}"]').click(); true`);
      await wait(tab === "conversion" ? 450 : 100);
      const compact = await evaluate(`(() => {
        const view = document.querySelector('.view.active');
        const visible = (el) => el && getComputedStyle(el).display !== 'none'
          && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
        return {
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
          clippedButtons: [...view.querySelectorAll('.page-heading button, .settings-actions button, .production-controls button, .production-toolbar button, .distribution-page-tabs button, .segmented-control button')].filter(visible)
            .filter((el) => el.scrollWidth > el.clientWidth + 4)
            .map((el) => (el.textContent || '').trim()).filter(Boolean).slice(0, 5)
        };
      })()`);
      assert.equal(compact.overflow, false, `${tab} 在 1180px 下出现横向溢出`);
      assert.deepEqual(compact.clippedButtons, [], `${tab} 在 1180px 下有按钮文字被裁切`);
      checks.push({ name: `${tab} 紧凑屏幕`, value: compact });
    }
    await evaluate(`document.querySelector('.tab[data-tab="dashboard"]').click(); true`);
    await wait(120);
    await screenshot("dashboard-1180");
    await send("Emulation.clearDeviceMetricsOverride");

    const apiChecks = await evaluate(`Promise.all([
      fetch('/api/dashboard').then((r) => r.status),
      fetch('/api/production/workspace').then((r) => r.status),
      fetch('/api/production/tasks').then((r) => r.status),
      fetch('/api/cloud-backup/status').then((r) => r.status),
      fetch('/api/distribution/status').then((r) => r.status)
    ])`);
    assert(apiChecks.every((status) => status === 200), "有核心 API 入口不可用");
    checks.push({ name: "核心 API", value: apiChecks });

    assert.deepEqual(browserErrors, [], `浏览器控制台出现错误：${browserErrors.join(" | ")}`);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      checkedAt: new Date().toISOString(),
      artifacts: ARTIFACT_ROOT,
      checks
    }, null, 2)}\n`);
  } finally {
    socket.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
