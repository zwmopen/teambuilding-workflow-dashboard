const assert = require("node:assert/strict");

const DEBUG_URL = process.env.TB_DEBUG_URL || "http://127.0.0.1:9333/json";

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function evaluateTarget(target, expression) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const response = new Promise((resolve, reject) => {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) return;
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
  });
  socket.send(JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: { expression, awaitPromise: true, returnByValue: true }
  }));
  const result = await response;
  socket.close();
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function connectLocalWorkspace() {
  const targets = await fetch(DEBUG_URL).then((response) => response.json());
  const target = targets.find((item) => item.type === "webview" && item.url.startsWith("http://127.0.0.1:4327/"));
  assert(target, "未找到桌面版中的本地工作区 webview");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
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
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  return { socket, evaluate };
}

async function main() {
  const { socket, evaluate } = await connectLocalWorkspace();
  const checks = [];
  const check = async (name, expression) => {
    const value = await evaluate(expression);
    assert(value, name);
    checks.push({ name, value });
  };

  try {
    await check("应用外壳已载入", `Boolean(document.querySelector('.app-shell') && document.querySelector('[data-tab]'))`);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (await evaluate(`Boolean(document.querySelector('#materialFeed .tree-category') && document.querySelector('#collectionList'))`)) break;
      await wait(500);
    }
    await check("主数据已载入", `Boolean(document.querySelector('#materialFeed .tree-category') && document.querySelector('#collectionList'))`);
    const tabs = await evaluate(`[...document.querySelectorAll('.tab[data-tab]')].map((el) => el.dataset.tab)`);
    assert.deepEqual(tabs, ["dashboard", "products", "distribution", "settings"]);
    checks.push({ name: "左侧工作流入口", value: tabs.join(", ") });

    for (const tab of tabs) {
      await evaluate(`document.querySelector('.tab[data-tab="${tab}"]').click(); true`);
      await wait(250);
      const state = await evaluate(`(() => {
        const view = document.querySelector('.view.active');
        const visible = (el) => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
        return {
          tab: document.querySelector('.tab.active')?.dataset.tab,
          view: view?.id,
          buttons: [...view.querySelectorAll('button')].filter(visible).length,
          inputs: [...view.querySelectorAll('input,select,textarea')].filter(visible).length,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
        };
      })()`);
      assert.equal(state.tab, tab, `${tab} 未切换成功`);
      assert(state.view, `${tab} 没有活动界面`);
      assert.equal(state.horizontalOverflow, false, `${tab} 存在横向溢出`);
      checks.push({ name: `${tab} 界面`, value: `${state.view} · ${state.buttons} buttons · ${state.inputs} inputs` });
    }

    await evaluate(`document.querySelector('.tab[data-tab="dashboard"]').click(); true`);
    await wait(250);
    await check("素材目录地址可编辑", `Boolean(document.querySelector('#materialRootInput')?.value)`);
    await check("素材文件树有内容", `document.querySelectorAll('#materialFeed .tree-category').length > 0`);
    await check("素材支持列表/小图标切换", `document.querySelectorAll('[data-material-tree-view]').length >= 2`);
    const materialInteraction = await evaluate(`(() => {
      const category = document.querySelector('#materialFeed .tree-category');
      const before = category?.classList.contains('expanded');
      category?.querySelector('.tree-category-head,button')?.click();
      const after = document.querySelector('#materialFeed .tree-category')?.classList.contains('expanded');
      document.querySelector('[data-material-tree-view="icons"]')?.click();
      const grid = document.querySelector('#materialFeed')?.dataset.view === 'icons';
      document.querySelector('[data-material-tree-view="list"]')?.click();
      return { toggled: before !== after, switched: Boolean(grid) };
    })()`);
    assert(materialInteraction.toggled, "素材分类不能展开/收起");
    checks.push({ name: "素材树展开与视图切换", value: materialInteraction });
    const materialCategoryCount = await evaluate(`document.querySelectorAll('#materialFeed .tree-category').length`);
    let materialCategoriesToggled = 0;
    for (let index = 0; index < materialCategoryCount; index += 1) {
      const toggled = await evaluate(`(() => {
        const row = document.querySelectorAll('#materialFeed .tree-category')[${index}];
        const before = row?.classList.contains('expanded');
        row?.querySelector('[data-tree-toggle]')?.click();
        const afterRow = document.querySelectorAll('#materialFeed .tree-category')[${index}];
        const after = afterRow?.classList.contains('expanded');
        afterRow?.querySelector('[data-tree-toggle]')?.click();
        return before !== after;
      })()`);
      if (toggled) materialCategoriesToggled += 1;
    }
    assert.equal(materialCategoriesToggled, materialCategoryCount, "有素材分类不能展开/收起");
    checks.push({ name: "全部素材分类逐项展开", value: `${materialCategoriesToggled}/${materialCategoryCount}` });

    await evaluate(`document.querySelector('.tab[data-tab="products"]').click(); true`);
    await wait(300);
    await check("作品集目录地址可编辑", `Boolean(document.querySelector('#collectionRootInput')?.value)`);
    await check("作品集筛选数量存在", `document.querySelectorAll('#collectionTypeFilters button').length >= 3 && document.querySelectorAll('#collectionPlatformFilters button').length >= 3`);
    const collectionInteraction = await evaluate(`(() => {
      const typeButtons = [...document.querySelectorAll('#collectionTypeFilters button')];
      const platformButtons = [...document.querySelectorAll('#collectionPlatformFilters button')];
      typeButtons.forEach((button) => button.click());
      typeButtons[0]?.click();
      platformButtons.forEach((button) => button.click());
      platformButtons[0]?.click();
      const toggles = [...document.querySelectorAll('#collectionList .collection-toggle')].slice(0, 3);
      toggles.forEach((button) => button.click());
      const expanded = [...document.querySelectorAll('#collectionList .collection-row.expanded, #collectionList .collection-row.is-expanded')].length;
      document.querySelector('[data-collection-view-toggle]')?.click();
      const viewChanged = document.querySelector('[data-collection-view-toggle]')?.getAttribute('aria-label') || '';
      document.querySelector('[data-collection-view-toggle]')?.click();
      return { rows: document.querySelectorAll('#collectionList .collection-row').length, toggles: toggles.length, expanded, viewChanged };
    })()`);
    assert(collectionInteraction.rows > 0, "作品集列表为空");
    assert(collectionInteraction.toggles > 0, "作品集不能展开");
    checks.push({ name: "作品集筛选、展开、视图切换", value: collectionInteraction });
    const collectionNames = await evaluate(`[...document.querySelectorAll('#collectionList [data-collection]')].map((row) => row.dataset.collection)`);
    let collectionsToggled = 0;
    for (const name of collectionNames) {
      const toggled = await evaluate(`(() => {
        const name = ${JSON.stringify(name)};
        const button = [...document.querySelectorAll('#collectionList [data-collection-toggle]')].find((item) => item.dataset.collectionToggle === name);
        const before = button?.getAttribute('aria-expanded');
        button?.click();
        const afterButton = [...document.querySelectorAll('#collectionList [data-collection-toggle]')].find((item) => item.dataset.collectionToggle === name);
        const after = afterButton?.getAttribute('aria-expanded');
        afterButton?.click();
        return before !== after;
      })()`);
      if (toggled) collectionsToggled += 1;
    }
    assert.equal(collectionsToggled, collectionNames.length, "有作品集不能展开/收起");
    checks.push({ name: "全部作品集逐项展开", value: `${collectionsToggled}/${collectionNames.length}` });
    const previewOpened = await evaluate(`(async () => {
      let work = document.querySelector('#collectionList [data-preview-work]');
      for (const name of ${JSON.stringify(collectionNames)}) {
        if (work) break;
        const button = [...document.querySelectorAll('#collectionList [data-collection-toggle]')]
          .find((item) => item.dataset.collectionToggle === name);
        if (button?.getAttribute('aria-expanded') !== 'true') button?.click();
        await new Promise((resolve) => setTimeout(resolve, 30));
        work = document.querySelector('#collectionList [data-preview-work]');
      }
      work?.click();
      await new Promise((resolve) => setTimeout(resolve, 350));
      const dialog = document.querySelector('#collectionPreviewDialog');
      const result = Boolean(dialog?.open && dialog.querySelector('.preview-stage'));
      dialog?.querySelector('.preview-close')?.click();
      return result;
    })()`);
    assert(previewOpened, "作品预览弹窗不能打开");
    checks.push({ name: "作品图片/文本预览", value: true });

    await evaluate(`document.querySelector('.tab[data-tab="distribution"]').click(); true`);
    await wait(350);
    await evaluate(`document.querySelector('[data-distribution-filter="devices"]')?.click(); true`);
    await wait(100);
    await check("设备在线数量直接显示", `(() => { const text = document.querySelector('.distribution-stats')?.textContent || ''; return text.includes('/') && [...text].some((char) => char >= '0' && char <= '9'); })()`);
    const distributionInteraction = await evaluate(`(() => {
      const tabs = [...document.querySelectorAll('#distributionTabs [data-panel]')];
      const results = [];
      tabs.forEach((button) => {
        button.click();
        results.push({ panel: button.dataset.panel, active: button.classList.contains('active') });
      });
      tabs[0]?.click();
      const online = [...document.querySelectorAll('.device-row.is-online')];
      const offline = [...document.querySelectorAll('.device-row:not(.is-online)')];
      return {
        tabs: results,
        online: online.length,
        offline: offline.length,
        onlineActionsEnabled: online.every((row) => [...row.querySelectorAll('.device-actions button')].every((button) => !button.disabled)),
        offlineActionsDisabled: offline.every((row) => [...row.querySelectorAll('.device-actions button')].every((button) => button.disabled))
      };
    })()`);
    assert(distributionInteraction.tabs.every((item) => item.active), "分发子页面不能切换");
    assert(distributionInteraction.offlineActionsDisabled, "离线设备仍可点击分发");
    checks.push({ name: "分发子页与设备按钮联动", value: distributionInteraction });
    const distributionDialogs = await evaluate(`(async () => {
      document.querySelector('[data-distribution-filter="devices"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const onlineRow = document.querySelector('.device-row.is-online');
      onlineRow?.querySelector('[data-upload-other]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const uploadChoice = Boolean(document.querySelector('.upload-choice-panel'));
      document.querySelector('[data-close-upload-choice]')?.click();
      document.querySelector('[data-distribution-filter="traffic"]')?.click();
      const packageButton = document.querySelector('[data-send-package]');
      packageButton?.click();
      const picker = Boolean(document.querySelector('.device-picker-dialog'));
      document.querySelector('[data-confirm-package-device]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const confirmation = Boolean(document.querySelector('.system-dialog'));
      document.querySelector('.system-dialog [data-dialog-result="cancel"]')?.click();
      return { uploadChoice, picker, confirmation };
    })()`);
    assert(distributionDialogs.uploadChoice, "上传其他没有打开文件/文件夹选择入口");
    assert(distributionDialogs.picker, "选择设备弹窗不能打开");
    assert(distributionDialogs.confirmation, "发送确认仍未使用应用内弹窗");
    checks.push({ name: "上传其他、设备选择、应用内确认弹窗", value: distributionDialogs });

    await evaluate(`document.querySelector('.tab[data-tab="settings"]').click(); true`);
    await wait(250);
    await check("设置显示应用版本", `(() => { const text = document.querySelector('#settingsVersion')?.textContent || ''; return text.startsWith('v') && text.split('.').length === 3; })()`);
    const themes = await evaluate(`(() => {
      const buttons = [...document.querySelectorAll('.theme-option')];
      const values = [];
      buttons.forEach((button) => { button.click(); values.push(document.body.dataset.theme); });
      document.querySelector('.theme-option[data-theme="jianghu"]')?.click();
      return { count: buttons.length, values, final: document.body.dataset.theme };
    })()`);
    assert.equal(themes.count, 6, "主题数量不完整");
    assert.equal(new Set(themes.values).size, 6, "主题按钮没有全部生效");
    assert.equal(themes.final, "jianghu", "默认主题没有恢复为拟态悬浮");
    checks.push({ name: "六套主题可切换", value: themes.values.join(", ") });

    await evaluate(`document.querySelector('#checkAppUpdateBtn').click(); true`);
    await wait(500);
    await check("版本检查有反馈", `Boolean(document.querySelector('.system-notice, .toast, [role="status"]'))`);
    await evaluate(`document.querySelector('#copyDiagnosticsBtn').click(); true`);
    await wait(150);
    checks.push({ name: "诊断复制按钮", value: "clicked" });

    const apiChecks = await evaluate(`Promise.all([
      fetch('/api/dashboard').then((r) => ({name:'dashboard', status:r.status})),
      fetch('/api/distribution/status').then((r) => ({name:'distribution-status', status:r.status})),
      fetch('/api/juguang').then((r) => ({name:'juguang', status:r.status})),
      fetch('/api/collections/export').then((r) => ({name:'collection-export', status:r.status}))
    ])`);
    assert(apiChecks.every((item) => item.status === 200), "有 API 入口不可用");
    checks.push({ name: "核心 API", value: apiChecks });

    const chatTargets = await fetch(DEBUG_URL).then((response) => response.json());
    const chat = chatTargets.find((item) => item.type === "webview" && item.url.startsWith("https://chatgpt.com/"));
    assert(chat, "右侧真实 ChatGPT 网页未加载");
    const chatState = await evaluateTarget(chat, `({
      url: location.href,
      title: document.title,
      userscriptLoaded: window.__TB_CHATGPT_USERSCRIPT_LOADED__ === true,
      hasLogin: Boolean(document.querySelector('a[href*="auth"], button[data-testid*="login"]')),
      hasPrompt: Boolean(document.querySelector('#prompt-textarea, [contenteditable="true"][data-lexical-editor="true"], textarea')),
      historyStatePresent: Boolean(localStorage.getItem('cgpt-conversation-tree:state:v3') || localStorage.getItem('cgpt-conversation-tree:state:v1'))
    })`);
    assert(chatState.userscriptLoaded, "ChatGPT 用户脚本未注入");
    assert(chatState.hasLogin || chatState.hasPrompt, "ChatGPT 页面没有登录入口或对话输入框");
    checks.push({ name: "ChatGPT 真实网页、登录入口与用户脚本", value: chatState });

    process.stdout.write(`${JSON.stringify({ ok: true, checkedAt: new Date().toISOString(), checks }, null, 2)}\n`);
  } finally {
    socket.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
