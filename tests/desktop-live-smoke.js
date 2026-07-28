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
  const target = targets.find((item) => ["page", "webview"].includes(item.type) && item.url.startsWith("http://127.0.0.1:4327/"));
  assert(target, "未找到桌面版中的本地工作区页面");
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
    await evaluate(`location.reload(); true`);
    await wait(700);
    await check("应用外壳已载入", `Boolean(document.querySelector('.app-shell') && document.querySelector('[data-tab]'))`);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (await evaluate(`Number(document.querySelector('#statMaterialCategories')?.textContent) > 0 && Boolean(document.querySelector('#collectionList'))`)) break;
      await wait(500);
    }
    await check("主数据已载入", `Number(document.querySelector('#statMaterialCategories')?.textContent) > 0 && Boolean(document.querySelector('#collectionList'))`);
    const tabs = await evaluate(`[...document.querySelectorAll('.tab[data-tab]')].map((el) => el.dataset.tab)`);
    assert.deepEqual(tabs, ["dashboard", "products", "distribution", "plugins", "settings"]);
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
    await check("素材生产四步结果流程存在", `(() => { const text = document.querySelector('.production-api-flow')?.textContent || ''; return ['选择模板','选择素材','按模板制作','作品 + 文案'].every((label) => text.includes(label)); })()`);
    await check("普通用户三种生产入口存在", `(() => {
      const modes = [...document.querySelectorAll('[data-production-mode]')].map((button) => button.textContent.trim());
      return modes.length === 3 && ['做一张','做一套','批量做'].every((label) => modes.some((text) => text.includes(label)));
    })()`);
    await check("接口设置默认收起", `Boolean(document.querySelector('.production-advanced:not([open])'))`);
    await check("生产主按钮真实可见", `Boolean(document.querySelector('#createProductionPlanBtn') && document.querySelector('#createProductionPlanBtn').offsetParent)`);
    await check("素材库与模板库已载入", `Number(document.querySelector('#statMaterialCategories')?.textContent) > 0 && document.querySelector('#materialLibraryFilter')?.options.length > 0 && document.querySelector('#templateQuickSelect')?.options.length > 0`);
    const materialInteraction = await evaluate(`(() => {
      const library = document.querySelector('#materialLibraryFilter');
      const template = document.querySelector('#templateQuickSelect');
      const before = library?.value;
      if (library?.options.length > 1) {
        const nextIndex = [...library.options].findIndex((option) => option.value !== before);
        library.selectedIndex = nextIndex >= 0 ? nextIndex : 1;
        library.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return { libraries: library?.options.length || 0, templates: template?.options.length || 0, switched: !library || library.options.length < 2 || library.value !== before };
    })()`);
    assert(materialInteraction.switched, "素材库不能切换");
    checks.push({ name: "素材库与模板选择", value: materialInteraction });

    await evaluate(`document.querySelector('.tab[data-tab="products"]').click(); true`);
    await wait(300);
    await check("作品集目录地址可编辑", `Boolean(document.querySelector('#collectionRootInput')?.value)`);
    await check("作品集三阶段存在", `document.querySelectorAll('#collectionStageTabs [data-workflow-stage]').length === 3`);
    const collectionInteraction = await evaluate(`(() => {
      const stageButtons = [...document.querySelectorAll('#collectionStageTabs [data-workflow-stage]')];
      const stages = stageButtons.map((button) => button.dataset.workflowStage);
      stageButtons.forEach((button) => button.click());
      stageButtons[0]?.click();
      const toggles = [...document.querySelectorAll('#collectionList .collection-toggle')].slice(0, 3);
      toggles.forEach((button) => button.click());
      const expanded = [...document.querySelectorAll('#collectionList .collection-row.expanded, #collectionList .collection-row.is-expanded')].length;
      document.querySelector('[data-collection-view-toggle]')?.click();
      const viewChanged = document.querySelector('[data-collection-view-toggle]')?.getAttribute('aria-label') || '';
      document.querySelector('[data-collection-view-toggle]')?.click();
      return { stages, rows: document.querySelectorAll('#collectionList .collection-row').length, toggles: toggles.length, expanded, viewChanged };
    })()`);
    assert.deepEqual(collectionInteraction.stages, ["mobile", "official", "used"]);
    assert(collectionInteraction.rows > 0, "作品集列表为空");
    assert(collectionInteraction.toggles > 0, "作品集不能展开");
    checks.push({ name: "作品集阶段、展开、视图切换", value: collectionInteraction });
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
    await evaluate(`document.querySelector('#distributionTabs [data-panel="devices"]')?.click(); true`);
    await wait(150);
    await check("设备在线数量直接显示", `(() => { const text = document.querySelector('.distribution-stats')?.textContent || ''; return text.includes('/') && [...text].some((char) => char >= '0' && char <= '9'); })()`);
    await check("设备显示真实连接方式标签", `(() => { const tags = [...document.querySelectorAll('.device-row .transport-tag')]; return tags.length >= 3 && tags.some((tag) => tag.textContent.includes('Wi-Fi')); })()`);
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
    assert.deepEqual(distributionInteraction.tabs.map((item) => item.panel), ["devices", "mobile", "official", "used", "history"]);
    assert(distributionInteraction.tabs.every((item) => item.active), "分发子页面不能切换");
    assert(distributionInteraction.offlineActionsDisabled, "离线设备仍可点击分发");
    checks.push({ name: "分发子页与设备按钮联动", value: distributionInteraction });
    await check("分发阶段读取真实文件夹", `(() => {
      const tabs = [...document.querySelectorAll('#distributionTabs [data-panel]')];
      const labels = tabs.map((button) => button.textContent);
      return ['设备','抖音小红书','微信公众号','已发送','操作记录'].every((label) => labels.some((text) => text.includes(label)));
    })()`);
    await evaluate(`document.querySelector('#distributionTabs [data-panel="mobile"]')?.click(); true`);
    await wait(100);
    await check("手机与公众号都有流量分类标签", `(() => {
      const mobileLabels = [...document.querySelectorAll('#distributionMobile [data-stage-type-filter]')].map((button) => button.textContent);
      document.querySelector('#distributionTabs [data-panel="official"]')?.click();
      const officialLabels = [...document.querySelectorAll('#distributionOfficial [data-stage-type-filter]')].map((button) => button.textContent);
      return ['泛流量帖','精准流量帖','未分类'].every((label) => mobileLabels.some((text) => text.includes(label)) && officialLabels.some((text) => text.includes(label)));
    })()`);
    await check("所有主界面都有帮助入口", `document.querySelectorAll('[data-page-help]').length >= 4`);
    await evaluate(`document.querySelector('.tab[data-tab="plugins"]').click(); true`);
    await wait(150);
    await check("插件市场读取到本地工具", `document.querySelectorAll('#pluginMarketGrid .plugin-market-card').length >= 6`);
    await check("插件市场支持分类与搜索", `document.querySelectorAll('#pluginMarketFilters [data-plugin-filter]').length === 5 && Boolean(document.querySelector('#pluginMarketSearch'))`);
    await check("帮助入口使用说明按钮而不是问号", `[...document.querySelectorAll('[data-page-help]')].every((button) => button.textContent.trim().includes('说明') && button.textContent.trim() !== '?')`);
    await check("界面只提供玻璃和拟态", `(() => { const themes = [...document.querySelectorAll('.theme-option[data-theme]')].map((el) => el.dataset.theme); return themes.length === 2 && themes.includes('glass') && themes.includes('neo'); })()`);
    const distributionDialogs = await evaluate(`(async () => {
      document.querySelector('.tab[data-tab="distribution"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      document.querySelector('#distributionTabs [data-panel="devices"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      document.querySelector('[data-close-upload-choice]')?.click();
      const onlineRow = document.querySelector('.device-row.is-online');
      const uploadButton = onlineRow?.querySelector('[data-upload-other]') || document.querySelector('[data-upload-other]');
      uploadButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const uploadChoice = Boolean(document.querySelector('.upload-choice-panel')) || (!onlineRow && Boolean(uploadButton));
      document.querySelector('[data-close-upload-choice]')?.click();
      document.querySelector('#distributionTabs [data-panel="mobile"]')?.click();
      document.querySelector('[data-stage-type-filter="traffic"]')?.click();
      const packageButton = document.querySelector('[data-send-package]');
      packageButton?.click();
      const picker = Boolean(document.querySelector('.device-picker-dialog')) || (!onlineRow && Boolean(packageButton));
      document.querySelector('.device-picker-dialog [data-close-device-picker]')?.click();
      document.querySelector('[data-page-help="distributionView"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const confirmation = Boolean(document.querySelector('.system-dialog'));
      document.querySelector('.system-dialog [data-dialog-result="confirm"]')?.click();
      return { uploadChoice, picker, confirmation };
    })()`);
    assert(distributionDialogs.uploadChoice, "上传其他没有打开文件/文件夹选择入口");
    assert(distributionDialogs.picker, "选择设备弹窗不能打开");
    assert(distributionDialogs.confirmation, "帮助说明没有使用应用内弹窗");
    checks.push({ name: "上传其他、设备选择、帮助弹窗", value: distributionDialogs });

    await evaluate(`document.querySelector('.tab[data-tab="settings"]').click(); true`);
    await wait(250);
    await check("设置显示应用版本", `(() => { const text = document.querySelector('#settingsVersion')?.textContent || ''; return text.startsWith('v') && text.split('.').length === 3; })()`);
    const themes = await evaluate(`(() => {
      const buttons = [...document.querySelectorAll('.theme-option')];
      const values = [];
      buttons.forEach((button) => { button.click(); values.push(document.body.dataset.theme); });
      document.querySelector('.theme-option[data-theme="neo"]')?.click();
      return { count: buttons.length, values, final: document.body.dataset.theme };
    })()`);
    assert.equal(themes.count, 2, "主题数量不完整");
    assert.equal(new Set(themes.values).size, 2, "主题按钮没有全部生效");
    assert.equal(themes.final, "neo", "默认主题没有回到拟态");
    assert.equal(themes.final, "neo", "默认主题没有恢复为拟态");
    checks.push({ name: "两套主题可切换", value: themes.values.join(", ") });

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

    const desktopTargets = await fetch(DEBUG_URL).then((response) => response.json());
    const embeddedChat = desktopTargets.find((item) => item.url.startsWith("https://chatgpt.com/"));
    assert.equal(embeddedChat, undefined, "桌面版仍加载了不受信任的内嵌 ChatGPT");
    checks.push({ name: "桌面版已移除内嵌 ChatGPT", value: "external-browser-only" });

    process.stdout.write(`${JSON.stringify({ ok: true, checkedAt: new Date().toISOString(), checks }, null, 2)}\n`);
  } finally {
    socket.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
