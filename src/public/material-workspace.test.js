const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resolveInitialTab,
  inferSelectionMode,
  categoryCountLabel,
  buildMaterialTree,
  buildChatGptInstruction
} = require("./material-workspace");

test("production scope follows selected material folders without exposing set/batch UI", () => {
  assert.deepEqual(inferSelectionMode(["D:\\posts\\a"]), {
    mode: "set",
    workCount: 1,
    label: "已选 1 个素材文件夹"
  });
  assert.deepEqual(inferSelectionMode(["D:\\posts\\a", "D:\\posts\\b", "D:\\posts\\a"]), {
    mode: "batch",
    workCount: 2,
    label: "已选 2 个素材文件夹"
  });
});

test("unloaded material categories are not presented as zero", () => {
  assert.equal(categoryCountLabel({ loaded: false, countKnown: false, count: 0 }), "未读取");
  assert.equal(categoryCountLabel({ loaded: true, countKnown: true, count: 0 }), "0");
  assert.equal(categoryCountLabel({ loaded: false, countKnown: true, count: 12 }), "12");
});

test("旧版总览状态会迁移到素材生产", () => {
  assert.equal(resolveInitialTab("overview"), "dashboard");
  assert.equal(resolveInitialTab("products"), "dashboard");
  assert.equal(resolveInitialTab("conversion"), "conversion");
  assert.equal(resolveInitialTab("plugins"), "plugins");
  assert.equal(resolveInitialTab(""), "dashboard");
});

test("流量转化作为同源模块融入工作台，不暴露独立服务地址", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  assert.match(html, /data-tab="conversion"/);
  assert.match(html, /id="conversionAppFrame"[^>]+src="\/conversion-integrated\/\?embedded=1"/);
  assert.doesNotMatch(html, /id="conversionAppFrame"[^>]+src="http:\/\/127\.0\.0\.1:8765/);
  assert.match(html, /id="globalThemeCycleBtn"/);
  assert.doesNotMatch(html, /rail-theme-switch[^]*data-theme="glass"/);
  assert.match(app, /postMessage\(\{ type: "jianghu-theme", theme \}, window\.location\.origin\)/);
  assert.match(app, /\/conversion-integrated\/\?embedded=1&theme=/);
  assert.doesNotMatch(html, /id="conversionContent"/);
  assert.doesNotMatch(html, /data-conversion-module=/);
});

test("流量转化状态不再暴露旧版独立助手措辞", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  assert.doesNotMatch(html, /正在连接江湖团建转化助手/);
  assert.doesNotMatch(appSource, /转化助手暂时没有连接/);
  assert.match(html, /正在加载流量转化/);
});

test("设置页集中全局接口、目录、备份、本地数据与诊断", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.match(html, /id="settingsMaterialRoot"/);
  assert.match(html, /id="settingsPortfolioRoot"/);
  assert.match(html, /id="cloudBackupStatus"/);
  assert.match(html, /id="dedupProductionGroups"/);
  assert.match(html, /id="settingsVersion"/);
  assert.match(html, /id="productionApiProvider"/);
  assert.match(html, /id="productionTextModel"/);
  assert.doesNotMatch(html, /appearance-card/);
  assert.doesNotMatch(html, /id="settingsBatchSize"/);
  assert.doesNotMatch(html, /id="settingsAutoGroup"/);
  assert.doesNotMatch(html, /id="settingsAutoZip"/);
  assert.doesNotMatch(html, /id="runExistingWorkPackageBtn"/);
  assert.doesNotMatch(html, /id="openExtensionRootBtn"/);
  assert.doesNotMatch(html, /id="checkAppUpdateBtn"/);
  assert.doesNotMatch(html, /id="openReleaseRootBtn"/);
  assert.doesNotMatch(html, /advanced-card/);
});

test("素材分类会转换为可展开的本地文件树", () => {
  const categories = [{
    name: "夏季团建",
    path: "D:\\素材\\夏季团建",
    count: 2,
    items: [
      { id: "a", name: "安吉两天一夜", path: "D:\\素材\\夏季团建\\安吉两天一夜", imageCount: 9 },
      { id: "b", name: "杭州周边团建", path: "D:\\素材\\夏季团建\\杭州周边团建", imageCount: 7 }
    ]
  }];

  const tree = buildMaterialTree(categories, "b", ["D:\\素材\\夏季团建"]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].expanded, true);
  assert.equal(tree[0].items.length, 2);
  assert.equal(tree[0].items[1].selected, true);
  assert.equal(tree[0].items[1].imageCount, 7);
});

test("传 GPT 指令包含帖子文件夹路径和真实操作边界", () => {
  const instruction = buildChatGptInstruction(
    { name: "安吉两天一夜", path: "D:\\素材\\安吉两天一夜", imageCount: 9 },
    { name: "夏季团建" },
    "T04"
  );

  assert.match(instruction, /安吉两天一夜/);
  assert.match(instruction, /D:\\素材\\安吉两天一夜/);
  assert.match(instruction, /T04/);
  assert.match(instruction, /本地文件夹/);
});
