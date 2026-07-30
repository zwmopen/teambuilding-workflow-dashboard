const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
const desktopMain = fs.readFileSync(path.join(__dirname, "..", "desktop", "main.js"), "utf8");
const desktopPreload = fs.readFileSync(path.join(__dirname, "..", "desktop", "preload.js"), "utf8");

test("GPT 内置测试把本地素材和模板与持久原生网页合成一个生产界面", () => {
  assert.match(html, /data-tab="gptProductionTest"/);
  assert.match(html, /id="gptTestMaterialFolders"/);
  assert.match(html, /id="gptTestTemplateList"/);
  assert.match(html, /id="gptEmbeddedHost"/);
  assert.match(html, /id="gptTestSendBtn"/);
  assert.match(app, /gptTestSelectedMaterials/);
  assert.match(app, /一套模板可以连续处理多个素材文件夹/);
  assert.match(app, /slice\(0, 2\)/);
  assert.match(app, /window\.gptWorkbench\.sendTask/);
  assert.doesNotMatch(html, /做一套|做一批/);
  assert.match(desktopMain, /new WebContentsView/);
  assert.match(desktopMain, /persist:teambuilding-gpt-production/);
  assert.match(desktopMain, /loadExtension/);
  assert.match(desktopMain, /tb-workbench-upload/);
  assert.match(desktopPreload, /gptWorkbench/);
  assert.match(css, /\.gpt-production-test-grid/);
});

test("production exposes phase, percent, progressbar, status and recent log", () => {
  assert.match(html, /id="workbenchProgressPhase"/);
  assert.match(html, /id="workbenchProgressPercent"/);
  assert.match(html, /role="progressbar"[^>]+aria-valuenow="0"/);
  assert.match(html, /id="workbenchProgressBar"/);
  assert.match(html, /id="workbenchProductionStatus"/);
  assert.match(html, /id="workbenchProductionLog"/);
  assert.match(app, /function updateWorkbenchProgress\(/);
  assert.match(app, /30 \+ Math\.round\(percent \* 0\.7\)/);
  assert.match(css, /\.workbench-progress-track/);
  assert.match(css, /@keyframes statusPulse/);
});

test("directory actions use compact labels", () => {
  assert.doesNotMatch(html, />\s*切换目录\s*</);
  assert.doesNotMatch(html, />\s*选择目录\s*</);
  assert.match(html, /id="workbenchChooseMaterialRootBtn"[^>]*>选择<\/button>/);
  assert.match(html, /id="workbenchChooseProductRootBtn"[^>]*>选择<\/button>/);
});

test("status surfaces have a compact visual reminder", () => {
  assert.match(css, /\.version-status[^\{]*\.production-live-status[^\{]*\.workbench-production-status/);
  assert.match(css, /#workbenchModelStatus::before/);
  assert.match(css, /#imageApiStatus::before/);
});

test("production confirmation stays in the main action dock and starts with one paid calibration image", () => {
  assert.match(html, /class="workbench-action-dock"/);
  assert.match(html, /id="workbenchPlanPanel"[^>]*hidden[\s\S]*id="workbenchEditPlanBtn"[^>]*hidden[\s\S]*id="workbenchStartProductionBtn"/);
  assert.match(app, /activeProductionPlan\s*\?\s*confirmProductionPlan\(\)\s*:\s*createProductionPlan\(\)/);
  assert.match(app, /workbenchStartProductionBtn"\)\.textContent = "生成首张校准图（仅1次调用）"/);
  assert.match(app, /runScope: "calibration"/);
  assert.match(app, /首图确认无误，继续生成剩余/);
  assert.match(app, /失败不自动重试/);
  assert.match(app, /workbenchPlanPanel"\)\?\.scrollIntoView/);
  assert.doesNotMatch(app, /data-confirm-production-plan/);
  assert.match(css, /\.workbench-action-dock\{position:sticky/);
});

test("production model and page controls use one compact toolbar", () => {
  assert.match(html, /class="workbench-run-settings compact"/);
  assert.match(css, /\.workbench-run-settings\.compact\{grid-template-columns:/);
  assert.match(css, /\.workbench-run-settings\.compact select\{height:30px/);
});

test("page help and settings actions use fixed round svg icons", () => {
  assert.match(html, /class="page-help-button"[\s\S]*class="round-action-icon help-icon"/);
  assert.match(html, /class="page-settings-button"[\s\S]*class="round-action-icon"/);
  assert.match(app, /const buttonContent = `<svg class="round-action-icon help-icon"/);
  assert.match(css, /inline-size: 36px !important/);
  assert.match(css, /block-size: 36px !important/);
  assert.match(css, /aspect-ratio: 1 \/ 1/);
});

test("settings cards and compact production layout cannot collapse into narrow columns", () => {
  assert.match(css, /\.settings-layout > \.api-settings-card\s*\{\s*grid-column: span 5/);
  assert.match(css, /\.settings-layout > \.version-card\s*\{\s*grid-column: 1 \/ -1/);
  assert.match(css, /@media \(max-width: 1180px\)[\s\S]*grid-column: 1 \/ -1/);
  assert.match(css, /@media \(max-width: 1050px\)[\s\S]*grid-template-columns: minmax\(250px, \.9fr\) minmax\(420px, 1\.4fr\)/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.production-workbench-grid\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
});

test("finished products use the same expandable image and TXT folder interaction as materials", () => {
  assert.match(html, /data-workbench-output-filter="unpacked">未打包/);
  assert.match(html, /data-workbench-output-filter="packed">已打包/);
  assert.match(html, /data-workbench-output-filter="history">打包记录/);
  assert.match(html, /data-workbench-material-filter="conversion">精准流量贴/);
  assert.match(html, /data-workbench-material-filter="traffic">泛流量贴/);
  assert.match(html, /data-workbench-material-filter="unclassified">未分类/);
  assert.doesNotMatch(html, /data-workbench-output-type=/);
  assert.match(app, /data-workbench-product-folder=/);
  assert.match(app, /data-workbench-product-check=/);
  assert.match(app, /data-workbench-text-path=/);
  assert.match(app, /workbenchExpandedProductPath === work\.path/);
  assert.match(css, /\.workbench-output-folder \.workbench-post-assets/);
});

test("production settings expose a separate packed-library path", () => {
  assert.match(html, /id="productionPackedRoot"/);
  assert.match(html, /id="chooseProductionPackedRootBtn"[^>]*>选择<\/button>/);
  assert.match(app, /packedRoot: \$\("#productionPackedRoot"\)\?\.value/);
});

test("material and output tabs support persistent folder bindings from the context menu", () => {
  assert.match(html, /id="contextSetFolder"[^>]*>设置关联文件夹<\/button>/);
  assert.match(app, /function effectiveWorkbenchFolderBindings\(/);
  assert.match(app, /material-\$\{materialButton\.dataset\.workbenchMaterialFilter\}/);
  assert.match(app, /output-\$\{outputButton\.dataset\.workbenchOutputFilter\}/);
  assert.match(app, /folderBindings: effectiveWorkbenchFolderBindings\(\)/);
});

test("distribution uses a floating command assistant and no longer exposes migration maintenance", () => {
  assert.doesNotMatch(html, /id="reconcileDistributionFoldersBtn"/);
  assert.doesNotMatch(html, /class="codex-command-bar"/);
  assert.match(html, /id="workbenchAssistantLauncher"/);
  assert.match(html, /id="workbenchAssistantPanel"/);
  assert.match(html, /团建中控助手/);
  assert.match(app, /function executeWorkbenchAssistantCommand\(/);
  assert.match(css, /\.workbench-assistant-launcher/);
});

test("workbench assistant explains its capabilities and safely falls back to model intent understanding", () => {
  assert.match(html, /我能理解自然语言/);
  assert.match(app, /function workbenchAssistantCapabilities\(/);
  assert.match(app, /function executeInterpretedWorkbenchAssistant\(/);
  assert.match(app, /\/api\/workbench-assistant\/interpret/);
  assert.match(app, /options\.allowModel === false/);
});

test("distribution package selection lifts the whole row and actions share one height", () => {
  assert.match(css, /\.distribution-package-row\.active[\s\S]*transform: translateY\(-3px\)/);
  assert.match(css, /\.distribution-package-row \.device-actions > :is\(button, label\)/);
  assert.match(app, /const issueBadge = sendable \? ""/);
  assert.doesNotMatch(app, /\["good", "可发送到手机"\]/);
});

test("finished transfer tasks can be dismissed and expire from the live surface", () => {
  assert.match(app, /data-dismiss-transfer=/);
  assert.match(app, /TRANSFER_TASK_VISIBLE_MS\s*=\s*3 \* 60 \* 1000/);
  assert.match(app, /dismissTransferTask\(/);
});

test("cloud backup exposes automatic schedule and monthly upload budget controls", () => {
  assert.match(html, /id="cloudBackupScheduleEnabled"/);
  assert.match(html, /id="cloudBackupFrequency"/);
  assert.match(html, /id="cloudBackupIntervalHours"/);
  assert.match(html, /id="cloudBackupMonthlyLimitMb"/);
  assert.match(html, /id="cloudBackupSourceRoot"/);
});

test("integrated conversion view shares the workbench background without a nested card shell", () => {
  assert.match(css, /#conversionView\s*\{[\s\S]*?padding:\s*0;/);
  assert.match(css, /\.conversion-embedded-shell\s*\{[\s\S]*?border-radius:\s*0;/);
  assert.match(css, /\.conversion-embedded-shell\s*\{[\s\S]*?box-shadow:\s*none;/);
  assert.match(css, /\.conversion-embedded-shell iframe\s*\{[\s\S]*?background:\s*transparent;/);
});
