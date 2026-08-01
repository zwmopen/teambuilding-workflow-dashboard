const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
const desktopMain = fs.readFileSync(path.join(__dirname, "..", "desktop", "main.js"), "utf8");
const desktopPreload = fs.readFileSync(path.join(__dirname, "..", "desktop", "preload.js"), "utf8");
const assistantOverlay = fs.readFileSync(path.join(__dirname, "assistant-overlay.html"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const gptSidebar = fs.readFileSync(path.join(__dirname, "..", "integrations", "gpt-production-extension", "sidebar.js"), "utf8");
const gptBackground = fs.readFileSync(path.join(__dirname, "..", "integrations", "gpt-production-extension", "background.js"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

test("GPT production exposes prompt and random current-session modes", () => {
  assert.match(html, /value="automatic">单窗口自动（有提示词）/);
  assert.match(html, /value="random">单窗口自动-随机/);
  assert.match(app, /gptAutoSettings\.mode === "random"/);
  assert.match(app, /const prompt = randomMode \? ""/);
  assert.match(gptSidebar, /noPromptMode/);
  assert.match(gptSidebar, /复用当前会话母版计划/);
});

test("GPT production exposes the all-day scheduled mode and low-usage material selection", () => {
  assert.match(html, /value="all-day">单窗口全天自动/);
  assert.match(app, /async function prepareAllDayGptQueue/);
  assert.match(app, /isHiddenMaterialPath/);
  assert.match(app, /Number\(left\.item\.usageCount/);
  assert.match(app, /gptAutoSettings\.mode === "all-day"/);
  assert.match(server, /!entry\.name\.startsWith\("\."\)/);
  assert.match(server, /includeHidden = options\.includeHidden === true/);
  assert.match(server, /scanPostFolders\(categoryRoot, \{ includeHidden: true \}\)/);
});

test("GPT production exposes explicit material refresh and multi-slot scheduled mode", () => {
  assert.match(html, /id="gptTestMaterialRefreshBtn"/);
  assert.match(html, /value="scheduled">定时启动/);
  assert.match(html, /id="gptSchedulePlan"/);
  assert.match(html, /gptMinimumImageCount[^>]*value="4"/);
  assert.match(html, /1–3 张时视为额度触顶/);
  assert.match(app, /function parseGptSchedulePlan/);
  assert.match(app, /prepareAutoGptQueue/);
  assert.match(app, /gptTestMaterialRefreshBtn/);
});

test("GPT production history exposes cumulative work, time and average plan summary", () => {
  assert.match(html, /id="gptProductionHistorySummary"/);
  assert.match(app, /function renderGptProductionSummary/);
  assert.match(app, /平均出计划/);
  assert.match(css, /\.gpt-production-history-summary/);
});

test("GPT production history hides the native GPT view before opening its DOM panel", () => {
  assert.match(app, /if \(gptActive\) await window\.gptWorkbench\?\.hide\?\.\(\)\.catch/);
  assert.match(app, /panel\.hidden = false/);
});

test("GPT production exposes prompt and random current-session modes", () => {
  assert.match(html, /value="automatic">单窗口自动（有提示词）/);
  assert.match(html, /value="random">单窗口自动-随机/);
  assert.match(app, /gptAutoSettings\.mode === "random"/);
  assert.match(app, /const prompt = randomMode \? ""/);
});

test("GPT 内置测试把本地素材和模板与持久原生网页合成一个生产界面", () => {
  assert.match(html, /data-tab="gptProductionTest"/);
  assert.match(html, /id="gptTestMaterialFolders"/);
  assert.match(html, /id="gptTestTemplateList"/);
  assert.match(html, /id="gptEmbeddedHost"/);
  assert.match(html, /id="gptTestSendBtn"/);
  assert.match(app, /gptTestSelectedMaterials/);
  assert.match(app, /gptTestSelectedTemplates/);
  assert.match(app, /buildGptTemplateInitTask/);
  assert.match(app, /当前 GPT 会话里已经沉淀好的母版环境/);
  assert.match(app, /templates\.flatMap/);
  assert.match(app, /window\.gptWorkbench\.sendTask/);
  assert.doesNotMatch(html, /做一套|做一批/);
  assert.match(desktopMain, /new WebContentsView/);
  assert.match(desktopMain, /persist:teambuilding-gpt-production/);
  assert.match(desktopMain, /integrations["'], ["']gpt-production-extension/);
  assert.match(desktopMain, /app\.isPackaged \? \[bundled, development\]/);
  assert.match(desktopMain, /loadExtension/);
  assert.match(serverSource, /\/api\/extension\/save-generated-image/);
  assert.match(serverSource, /sharp\(bytes\)\.metadata\(\)/);
  assert.match(serverSource, /new TextDecoder\("gb18030"\)/);
  assert.match(serverSource, /\/\^OK\$\/m/);
  assert.match(serverSource, /\/\^DUPLICATE\$\/m/);
  assert.match(serverSource, /duplicateReason:\s*String\(fields\.DuplicateReason/);
  assert.match(serverSource, /deletedImages:\s*Math\.max\(0, Number\(fields\.DeletedImages/);
  assert.match(desktopMain, /tb-workbench-upload/);
  assert.match(desktopPreload, /gptWorkbench/);
  assert.match(css, /\.gpt-production-test-grid/);
});

test("GPT 自动生产 uses isolated accounts, browser controls, real serial completion and random pacing", () => {
  assert.match(html, /内容生产（自动）/);
  assert.match(html, /id="gptBrowserBackBtn"/);
  assert.match(html, /id="gptBrowserForwardBtn"/);
  assert.match(html, /id="gptBrowserReloadBtn"/);
  assert.match(html, /id="gptBrowserHomeBtn"/);
  assert.match(html, /id="gptAccountTabs"/);
  assert.match(html, /id="gptAutoMinDelay"/);
  assert.match(html, /id="gptAutoMaxDelay"/);
  assert.match(app, /Math\.random\(\) \* \(maxDelay - minDelay\)/);
  assert.match(app, /await window\.gptWorkbench\.sendTask\(task\)/);
  assert.match(app, /gptAutoSettings\.accountTaskLimit/);
  assert.match(desktopMain, /GPT_PARTITION_PREFIX = "persist:teambuilding-gpt-production"/);
  assert.match(desktopMain, /partition: `\$\{GPT_PARTITION_PREFIX\}-\$\{id\}`/);
  assert.match(desktopMain, /desktop:gpt-navigate/);
});

test("GPT 自动生产 downloads and packages only the current verified batch", () => {
  assert.match(gptSidebar, /chatgpt-workpkg-\$\{batchId\}-\$\{index \+ 1\}-of-\$\{urls\.length\}/);
  assert.match(gptSidebar, /type: "tb-download"/);
  assert.match(gptSidebar, /batchId: downloadResult\.batchId/);
  assert.match(gptSidebar, /expectedImageCount: downloadedImages/);
  assert.match(gptSidebar, /platformPauseReason\(\)/);
  assert.match(gptBackground, /api\/extension\/download-event/);
  assert.match(server, /chatgpt-workpkg-task-\$\{batchId\}\.json/);
  assert.match(server, /"-BatchId", batchId, "-ExpectedImageCount"/);
  assert.match(server, /成品图片核对失败/);
  assert.match(server, /成品文件夹没有 TXT 文案/);
});

test("GPT automatic production exposes safe retry, quota and real archive controls", () => {
  assert.match(html, /id="gptRetryTaskBtn"/);
  assert.match(html, /id="gptAutoArchiveEnabled"/);
  assert.match(html, /id="gptUploadLimit"/);
  assert.match(html, /id="gptGenerationLimit"/);
  assert.match(app, /retryFromStage/);
  assert.match(app, /retryFromPercent/);
  assert.match(app, /gpt-production\/quota/);
  assert.match(gptSidebar, /resumeExistingWorkflow/);
  assert.match(gptSidebar, /autoArchive/);
  assert.match(gptSidebar, /gpt-production\/archive-material/);
  assert.match(server, /function archiveMaterialAfterProduction/);
});

test("quota reminders do not hard-block a deliberate manual continuation", () => {
  assert.match(app, /allowManualOverride/);
  assert.match(app, /不会阻止本次上传/);
  assert.match(app, /allowQuotaOverride/);
});

test("single-window continuation keeps quota warnings informational and reattaches tasks paused before the bridge", () => {
  assert.match(app, /gptAutoSettings\.mode !== "multi" \|\| Boolean\(options\.allowQuotaOverride\)/);
  assert.match(app, /task\._submittedToGpt = true/);
  assert.match(app, /shouldReattachGptTaskOnResume/);
  assert.match(app, /task\.forceUpload = true/);
  assert.match(desktopMain, /forceUpload: Boolean\(task\.forceUpload\)/);
  assert.match(gptSidebar, /const forceUpload = Boolean\(message\.forceUpload\)/);
  assert.match(gptSidebar, /!entry\.forceUpload/);
});

test("local quota estimates never block uploads and real web limits are recorded separately", () => {
  assert.match(app, /不会阻止本次上传；以 GPT 网页真实提示为准/);
  assert.match(app, /return \{ quota, warningOnly: true \}/);
  assert.match(app, /function isActualGptLimitMessage/);
  assert.match(app, /function recordActualGptLimit/);
  assert.match(app, /function inferGptQuotaLimitKind/);
  assert.match(app, /上传本轮起点/);
  assert.match(app, /等待真实消耗后计算/);
  assert.doesNotMatch(app, /scheduleGptQuotaReminder\(quota\.nextExpiryAt/);
  assert.match(app, /uploadCycleStartAt/);
  assert.match(app, /generationCycleStartAt/);
  assert.match(app, /nextUploadProbeAt/);
  assert.match(app, /nextGenerationProbeAt/);
});

test("low-output generation is a batch-level limit signal", () => {
  assert.match(app, /function isLowOutputGptLimitMessage/);
  assert.match(app, /生成结果不足\|本轮只检测到\|安全线为\|额度触顶\|生成不完整/);
  assert.match(app, /const lowOutputLimit = isLowOutputGptLimitMessage/);
  assert.match(app, /已识别为触顶征兆，本批暂停/);
  assert.match(app, /等待下一轮额度探测/);
  assert.match(app, /本轮图片低于安全线，判定为触顶\/降级征兆/);
});

test("GPT material tree never presents an unloaded parent folder as a fake zero", () => {
  assert.match(app, /category\.countKnown === false \? "…" : Number\(category\.count/);
  assert.match(app, /const categoryItems = category\.items \|\| \[\]/);
  assert.match(app, /const shouldSelect = gptCategoryCheck\.checked/);
});

test("GPT login recovery stays local and never enters ordinary cloud settings export", () => {
  assert.match(html, /id="createGptLoginRecoveryBtn"/);
  assert.match(html, /id="restoreGptLoginRecoveryBtn"/);
  assert.match(desktopPreload, /createLoginRecovery/);
  assert.match(desktopPreload, /restoreLoginRecovery/);
  assert.match(desktopMain, /GPT_LOGIN_RECOVERY_ROOT/);
  assert.match(desktopMain, /GPT_PENDING_RESTORE_FILE/);
  assert.match(desktopMain, /applyPendingGptLoginRestore/);
  assert.doesNotMatch(server, /GPT_LOGIN_RECOVERY_ROOT/);
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
  assert.match(html, /id="workbenchAssistantBubble"/);
  assert.match(app, /function setupWorkbenchAssistantDrag\(/);
  assert.match(app, /tb-workbench-assistant-position/);
  assert.match(app, /showWorkbenchAssistantBubble\(/);
});

test("GPT production locks selection while running and exposes a real pause/continue state", () => {
  assert.match(app, /function blockGptSelectionDuringRun\(/);
  assert.match(app, /if \(blockGptSelectionDuringRun\(\)\) return;/);
  assert.match(app, /let gptQueuePaused = false/);
  assert.match(app, /继续自动生产/);
  assert.match(app, /pauseButton\.textContent = gptAutoRunning/);
  assert.match(app, /gptQueuePaused = true/);
});

test("GPT production keeps a recoverable queue and supports multiple permanent browser workers", () => {
  assert.match(app, /GPT_QUEUE_STORAGE_KEY/);
  assert.match(app, /function persistGptQueue\(/);
  assert.match(app, /function restoreGptQueue\(/);
  assert.match(app, /sendMultiWindowGptTasks/);
  assert.match(app, /parallelWorkers/);
  assert.match(html, /value="automatic">单窗口自动/);
  assert.match(html, /value="multi">多窗口自动/);
  assert.match(html, /value="manual">手动模式/);
  assert.match(html, /添加浏览器/);
  assert.match(html, /id="gptBrowserManager"/);
  assert.match(desktopMain, /gpt-browser-profiles\.json/);
  assert.match(desktopMain, /desktop:gpt-profile-save/);
});

test("GPT queue recovery persists the final failed stage and replaces stale retry checkpoints", () => {
  assert.match(app, /task\._stage = gptLastFailedStage;/);
  assert.match(app, /task\._error = taskError\.message;/);
  assert.match(app, /if \(resuming && task\._stage && task\._status !== "completed"\)/);
  assert.match(app, /failedTask\._stage = gptLastFailedStage \|\| failedTask\._stage/);
  assert.match(server, /GPT_PRODUCTION_CHECKPOINT_FILE/);
  assert.match(server, /gpt-production\/recover-image-batch/);
  assert.match(server, /图片暂存目录必须位于工作台下载目录内/);
});

test("desktop close goes to tray without clearing GPT cache or login partitions", () => {
  assert.match(desktopMain, /new Tray\(/);
  assert.match(desktopMain, /打开团建工作台/);
  assert.match(desktopMain, /彻底退出/);
  assert.match(desktopMain, /event\.preventDefault\(\)/);
  assert.match(desktopMain, /window\.hide\(\)/);
  assert.doesNotMatch(desktopMain, /\.clearCache\(\)/);
  assert.match(desktopMain, /persist:teambuilding-gpt-production/);
  assert.match(desktopMain, /async function flushAllGptStorageData\(\)/);
  assert.match(desktopMain, /flushStorageData\(\)/);
  assert.match(desktopMain, /if \(!quitFlushCompleted\)/);
});

test("restoring a minimized workbench reattaches the live GPT surface without reloading it", () => {
  assert.match(desktopMain, /window\.on\("restore",/);
  assert.match(desktopMain, /notifyWindowRestored\("restore"\)/);
  assert.match(desktopMain, /contentView\.removeChildView\(account\.view\)/);
  assert.match(desktopMain, /contentView\.addChildView\(account\.view\)/);
  assert.match(desktopMain, /desktop:window-restored/);
  assert.doesNotMatch(desktopMain, /notifyWindowRestored[\s\S]{0,1800}reload\(/);
});

test("portable desktop copies runtime resources to a durable version directory before background service starts", () => {
  assert.match(desktopMain, /ensureDurableRuntimeResources/);
  assert.match(desktopMain, /durableRuntimeAppRoot/);
  assert.match(desktopMain, /runtime-manifest\.json/);
  assert.match(desktopMain, /serverFile = path\.join\(runtimeAppRoot\(\), "server\.js"\)/);
});

test("embedded GPT reports real page readiness instead of treating a created view as loaded", () => {
  assert.match(desktopMain, /pageState/);
  assert.match(desktopMain, /did-start-loading/);
  assert.match(desktopMain, /did-finish-load/);
  assert.match(desktopMain, /domReady/);
  assert.match(desktopMain, /extensionReady/);
  assert.match(desktopMain, /document\.documentElement\.dataset\.tbGptProductionExtension/);
  assert.match(desktopMain, /setBorderRadius\(16\)/);
  assert.match(app, /function restoreEmbeddedGptView/);
});

test("global assistant is a draggable cat with separate status log and chat layers", () => {
  assert.match(html, /workbenchAssistantCat/);
  assert.match(html, /assistant-black-cat-v2\.png/);
  assert.match(html, /workbenchAssistantBubbleContent/);
  assert.match(html, /workbenchAssistantLogPanel/);
  assert.match(html, /data-assistant-mute="1"/);
  assert.match(html, /data-assistant-mute="5"/);
  assert.match(html, /data-assistant-mute="60"/);
  assert.match(css, /@keyframes tb-cat-bounce/);
  assert.match(app, /assistantEventLog/);
  assert.match(app, /openWorkbenchAssistantLog/);
  assert.match(app, /tb-workbench-assistant-position-v5/);
  assert.doesNotMatch(app, /const assistantRail = 76/);
  assert.doesNotMatch(app, /const inset = 12/);
  assert.match(app, /x:\s*rect\.left,[\s\S]*?width:\s*Math\.max\(320, rect\.width\)/);
  assert.doesNotMatch(html, /id="gptSelectionAssistant"/);
  assert.match(css, /\.workbench-assistant-bubble\s*\{[\s\S]*?background:\s*#fff/);
  assert.match(css, /\.workbench-assistant-bubble::after/);
  assert.match(css, /\.workbench-assistant-launcher\s*\{[\s\S]*?top:\s*96px/);
  assert.match(app, /gptProductionHistoryPanel"\)\?\.hidden !== false/);
  assert.match(desktopMain, /assistantOverlayWindow/);
  assert.match(desktopMain, /assistant-overlay\.html/);
  assert.match(desktopPreload, /assistantOverlay:\s*true/);
  assert.match(assistantOverlay, /data-theme="midnight-glass"/);
  assert.match(assistantOverlay, /document\.documentElement\.dataset\.theme = state\.theme/);
  assert.match(desktopMain, /assistantOverlayState = \{ \.\.\.assistantOverlayState, theme: gptThemeName \}/);
  assert.match(app, /native-assistant-overlay/);
  assert.doesNotMatch(app, /workbenchAssistantBubble"\)\?\.addEventListener\("mouseenter"/);
  assert.match(app, /assistantSuppressClickUntil/);
});

test("GPT automatic production keeps a durable user-visible production history", () => {
  assert.match(html, /id="gptProductionHistoryBtn"/);
  assert.match(html, /id="gptProductionHistoryPanel"/);
  assert.match(app, /GPT_HISTORY_STORAGE_KEY/);
  assert.match(app, /appendGptProductionHistory/);
  assert.match(app, /openGptProductionHistory/);
  assert.match(app, /\/api\/gpt-production\/history/);
  assert.match(app, /planDurationMs/);
  assert.match(app, /imageDurationMs/);
  assert.match(app, /data-open-production-path/);
  assert.match(server, /pathname === "\/api\/gpt-production\/history"/);
});

test("GPT browser profiles remember the last safe conversation URL", () => {
  assert.match(desktopMain, /lastUrl:\s*GPT_URL/);
  assert.match(desktopMain, /function safeGptUrl/);
  assert.match(desktopMain, /did-navigate-in-page/);
  assert.match(desktopMain, /loadURL\(safeGptUrl\(savedProfile\?\.lastUrl\)\)/);
});

test("GPT material folders support context editing, recycle-bin deletion and drag move", () => {
  assert.match(html, /id="contextTrashFolder"/);
  assert.match(app, /data-gpt-material-path/);
  assert.match(app, /text\/x-teambuilding-material-path/);
  assert.match(app, /\/api\/extension\/move-entry/);
  assert.match(app, /\/api\/trash-workspace-folder/);
  assert.match(server, /function trashEditableWorkspaceDirectory/);
  assert.match(server, /RecycleOption\]::SendToRecycleBin/);
});

test("embedded GPT packages do not leak a foreground login page title", () => {
  assert.match(server, /conversationTitle:\s*publishTitle/);
  assert.match(server, /验证你的身份 - OpenAI/);
});

test("GPT production exposes real paths, minimum image checks, tool toggles and scheduled start", () => {
  assert.match(html, /id="gptMinimumImageCount"/);
  assert.match(html, /id="gptDownloadRoot"/);
  assert.match(html, /id="gptProductRoot"/);
  assert.match(html, /id="gptPromptLibraryEnabled"/);
  assert.match(html, /id="gptMessageDownloadsEnabled"/);
  assert.match(html, /id="gptScheduledEnabled"/);
  assert.match(app, /checkScheduledGptProduction/);
  assert.match(app, /scheduleGptQuotaReminder/);
  assert.match(server, /requestedDownloadRoot/);
  assert.match(server, /requestedProductRoot/);
});

test("normal production never routes package output into acceptance folders", () => {
  assert.match(server, /isAcceptancePath/);
  assert.match(server, /normalProductRoot/);
  assert.match(app, /normalizeProductionPath/);
});

test("GPT packaging writes its task manifest beside the actual downloaded images", () => {
  assert.match(server, /const effectiveDownloadRoot = requestedDownloadRoot/);
  assert.match(server, /taskFile = path\.join\(effectiveDownloadRoot, `chatgpt-workpkg-task-/);
});

test("GPT material parent checkbox keeps valid independent accessibility attributes", () => {
  assert.match(app, /data-indeterminate="\$\{partial \? "true" : "false"\}" aria-label="选择此文件夹中的全部帖子"/);
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

test("settings keep image and copy credentials separate and default copy to MiniMax", () => {
  assert.match(html, /id="productionTextProvider"[\s\S]*?<option value="minimax" selected>MiniMax 文案<\/option>/);
  assert.match(html, /id="productionTextModel"[\s\S]*?<option value="MiniMax-M2\.7" selected>MiniMax-M2\.7<\/option>/);
  assert.match(html, /id="productionTextApiKey"/);
  assert.match(app, /const WORKBENCH_TEXT_PROVIDER_DEFAULTS =/);
  assert.match(app, /function currentTextApiPayload\(/);
  assert.match(app, /api\("\/api\/text-api\/config"/);
  assert.match(app, /api\("\/api\/text-api\/test"/);
  assert.match(app, /#productionTextProvider/);
  assert.match(server, /\/api\/text-api\/config/);
  assert.match(server, /publicTextApiSettings/);
});

test("integrated conversion view shares the workbench background without a nested card shell", () => {
  assert.match(css, /#conversionView\s*\{[\s\S]*?padding:\s*0;/);
  assert.match(css, /\.conversion-embedded-shell\s*\{[\s\S]*?border-radius:\s*0;/);
  assert.match(css, /\.conversion-embedded-shell\s*\{[\s\S]*?box-shadow:\s*none;/);
  assert.match(css, /\.conversion-embedded-shell iframe\s*\{[\s\S]*?background:\s*transparent;/);
});

test("embedded GPT follows the workbench light or dark theme without a duplicate card shell", () => {
  assert.match(app, /gptWorkbench\?\.setTheme\?\.\(value\)/);
  assert.match(desktopPreload, /setTheme\(theme = "neo"\)/);
  assert.match(desktopMain, /ipcMain\.handle\("desktop:gpt-theme"/);
  assert.match(desktopMain, /function applyEmbeddedGptTheme/);
  assert.match(desktopMain, /function embeddedGptPalette/);
  assert.match(desktopMain, /document\.body\?\.style\.setProperty\("background-color", palette\.main, "important"\)/);
  assert.match(css, /\.gpt-production-browser-panel\s*\{[\s\S]*?padding:\s*0;[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/);
  assert.match(css, /\.gpt-embedded-host\s*\{[\s\S]*?margin:\s*0;/);
  assert.match(css, /\.gpt-embedded-host\s*\{[\s\S]*?background:\s*var\(--page-bg/);
  assert.match(css, /#gptProductionTestView\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.gpt-production-test-shell\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/);
  assert.match(css, /\.gpt-production-test-library\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;/);
  assert.match(css, /body\[data-theme="midnight-glass"\] \.rail-tab\.active span\s*\{[\s\S]*?color:\s*inherit/);
});
