const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const version = fs.readFileSync(path.join(__dirname, "..", "..", "VERSION"), "utf8").trim();
const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
const desktopMain = fs.readFileSync(path.join(__dirname, "..", "desktop", "main.js"), "utf8");
const desktopPreload = fs.readFileSync(path.join(__dirname, "..", "desktop", "preload.js"), "utf8");
const assistantOverlay = fs.readFileSync(path.join(__dirname, "assistant-overlay.html"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const gptSidebar = fs.readFileSync(path.join(__dirname, "..", "integrations", "gpt-production-extension", "sidebar.js"), "utf8");
const gptBackground = fs.readFileSync(path.join(__dirname, "..", "integrations", "gpt-production-extension", "background.js"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

test("开发版静态资源缓存版本与 VERSION 同步", () => {
  assert.ok(version, "VERSION must not be empty");
  const versionPattern = version.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
  assert.match(html, new RegExp(`styles\\.css\\?v=${versionPattern}`));
  assert.match(html, new RegExp(`distribution-ui\\.js\\?v=${versionPattern}`));
  assert.match(html, new RegExp(`material-workspace\\.js\\?v=${versionPattern}`));
  assert.match(html, new RegExp(`app\\.js\\?v=${versionPattern}`));
});

test("GPT production exposes manual, single-account and multi-account mode profiles", () => {
  assert.match(html, /value="manual">人工控制/);
  assert.match(html, /value="single">/);
  assert.match(html, /value="rotate">/);
  assert.match(html, /value="scheduled">/);
  assert.match(html, /value="patrol">/);
  assert.match(app, /GPT_MODE_DEFINITIONS/);
  assert.match(app, /useCurrentSession/);
  assert.match(app, /gptModeProfiles/);
  assert.match(gptSidebar, /noPromptMode/);
  assert.match(gptSidebar, /conversationStateSnapshot/);
});

test("embedded GPT browser exposes an account-partitioned address bar", () => {
  assert.match(html, /id="gptBrowserAddressInput"/);
  assert.match(html, /id="gptBrowserGoBtn"/);
  assert.match(html, /id="gptBrowserGoBtn"[^>]*aria-label="访问当前网址"[^>]*>→<\/button>/);
  assert.match(html, /aria-label="账号窗口切换"/);
  assert.match(html, /aria-label="当前账号窗口网页"/);
  assert.match(html, /默认 ChatGPT，可输入其他网址/);
  assert.match(app, /submitGptBrowserAddress/);
  assert.match(app, /syncGptBrowserAddress/);
  assert.match(desktopPreload, /action: String\(action \|\| "reload"\)/);
  assert.match(desktopMain, /function safeBrowserUrl/);
  assert.match(desktopMain, /只允许访问 http:\/\/ 或 https:\/\/ 网页/);
  assert.match(desktopMain, /await contents\.loadURL\(targetUrl\)/);
  assert.match(desktopMain, /isChatGpt: \/\^https/);
  assert.match(app, /浏览器网页已打开 · 返回 GPT 可继续生产/);
  assert.match(desktopMain, /desktop:gpt-url-changed/);
  assert.match(desktopPreload, /onUrlChanged\(callback\)/);
  assert.match(app, /onUrlChanged\?\.\(\(input = \{\}\) =>/);
  assert.match(app, /function resolveGptBrowserInput/);
  assert.match(app, /https:\/\/www\.google\.com\/search\?q=\$\{encodeURIComponent\(raw\)\}/);
});

test("the literal single-account mode survives normalization and settings save", () => {
  assert.match(app, /mode === "single".*return "single"/s);
  assert.match(app, /const normalizedMode = normalizeGptProductionMode\(gptAutoSettings\.mode\)/);
});

test("GPT production exposes the endless mode and low-usage material selection", () => {
  assert.match(html, /value="single">/);
  assert.match(app, /async function prepareAllDayGptQueue/);
  assert.match(app, /isHiddenMaterialPath/);
  assert.match(app, /gptMaterialUsageCount\(left\.item, left\.category\)/);
  assert.match(app, /normalizeGptProductionMode\(gptAutoSettings\.mode\)/);
  assert.match(server, /!entry\.name\.startsWith\("\."\)/);
  assert.match(server, /includeHidden = options\.includeHidden === true/);
  assert.match(server, /scanPostFolders\(categoryRoot, \{ includeHidden: true \}\)/);
});

test("GPT all-day production persists across restarts and obeys cross-midnight work hours", () => {
  assert.match(html, /id="gptContinuousAutoStart"/);
  assert.match(html, /id="gptLaunchAtLogin"/);
  assert.match(html, /id="gptContinuousWorkHoursEnabled"/);
  assert.match(html, /id="gptContinuousWorkStart"[^>]*value="07:00"/);
  assert.match(html, /id="gptContinuousWorkEnd"[^>]*value="02:00"/);
  assert.match(app, /GPT_CONTINUOUS_RUN_STORAGE_KEY/);
  assert.match(app, /function getGptContinuousWorkWindow/);
  assert.match(app, /const crossesMidnight = startMinutes > endMinutes/);
  assert.match(app, /function scheduleContinuousGptProduction/);
  assert.match(app, /window\.addEventListener\("online"/);
  assert.match(app, /document\.addEventListener\("visibilitychange"/);
  assert.match(app, /gptAutoSettings\.continuousAutoStart !== false/);
  assert.match(app, /GPT_DEFAULT_MODE_MIGRATION_KEY/);
  assert.match(app, /openPageSettings\("gptAuto"\)/);
  assert.match(desktopPreload, /setLaunchAtLogin/);
  assert.match(desktopMain, /app\.setLoginItemSettings/);
});

test("GPT production exposes explicit material refresh and multi-slot scheduled mode", () => {
  assert.match(html, /id="gptTestMaterialRefreshBtn"/);
  assert.match(html, /id="gptScheduledEnabled"/);
  assert.match(html, /id="gptSchedulePlan"/);
  assert.match(html, /gptMinimumImageCount[^>]*value="4"/);
  assert.match(app, /1.3 张/);
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

test("GPT production exposes editable current-session and injected-prompt profiles", () => {
  assert.match(app, /id="gptModeStartBehavior"/);
  assert.match(app, /value="current"[^>]*>继续使用当前会话/);
  assert.match(app, /value="inject"[^>]*>注入模板提示词/);
  assert.match(app, /const useCurrentSession = \$\("#gptModeStartBehavior"\)\?\.value !== "inject"/);
  assert.match(app, /useCurrentSession \? "" :/);
  assert.match(html, /id="gptModeWorkflowEditor"/);
  assert.match(html, /id="gptAddModeWorkflowStepBtn"/);
  assert.match(app, /function defaultGptWorkflowSteps/);
  assert.match(app, /function validateGptWorkflowSteps/);
  assert.match(app, /必须在计划完成后/);
  assert.match(app, /profileSteps/);
  assert.match(app, /select\.id === "gptProductionMode" \|\| select\.id === "gptProductionModeSetting"/);
  assert.match(app, /kind: "gpt-production-mode"/);
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
  assert.match(app, /GPT_V36_MASTER_PROMPT/);
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
  // 0.14.31: delay inputs moved into workflow steps as「随机等待」modules
  assert.match(app, /Math\.random\(\) \* \(maxDelay - minDelay\)/);
  assert.match(app, /await window\.gptWorkbench\.sendTask\(task\)/);
  assert.match(app, /gptAutoSettings\.accountTaskLimit/);
  assert.match(desktopMain, /GPT_PARTITION_PREFIX = "persist:teambuilding-gpt-production"/);
  assert.match(desktopMain, /partition: `\$\{GPT_PARTITION_PREFIX\}-\$\{id\}`/);
  assert.match(desktopMain, /desktop:gpt-navigate/);
});

test("GPT automatic queue enforces one post folder per serial upload", () => {
  assert.match(app, /function attachmentsForSingleMaterial\(/);
  assert.match(app, /normalized\.startsWith\(prefix\)/);
  assert.match(app, /task\.attachments = attachmentsForSingleMaterial/);
  assert.match(app, /const attachments = attachmentsForSingleMaterial\(entry\.item\)/);
  assert.match(app, /await window\.gptWorkbench\.sendTask\(task\)/);
  assert.match(gptSidebar, /function assertSinglePostAttachmentBoundary\(/);
  assert.match(gptSidebar, /const existingComposerAttachments = attachmentPreviewCount\(\)/);
});

test("composer attachment conflicts pause the batch without advancing to another post", () => {
  assert.match(app, /COMPOSER_ATTACHMENTS_PENDING/);
  assert.match(app, /COMPOSER_DRAFT_PENDING/);
  assert.match(app, /queue-integrity failure/);
  assert.match(app, /gptAutoPaused = true/);
  assert.match(app, /清理输入框后从当前帖子继续/);
  assert.match(app, /function currentGptQueueIntegrityBlock\(/);
  assert.match(app, /const integrityBlock = currentGptQueueIntegrityBlock\(\)/);
  assert.match(app, /delete failedTask\._errorCode/);
});

test("single-account production refuses authentication pages before claiming or uploading a post", () => {
  assert.match(desktopMain, /authenticationRequired/);
  assert.match(desktopMain, /productionReady/);
  assert.match(desktopMain, /TeambuildingGptConversationStateSnapshot/);
  assert.match(app, /const preflight = await window\.gptWorkbench\.status\(runAccountId\)/);
  assert.match(app, /if \(!preflight\?\.productionReady\)/);
  assert.match(app, /本次没有上传任何素材/);
  const preflightIndex = app.indexOf("const preflight = await window.gptWorkbench.status(runAccountId)");
  const runningIndex = app.indexOf("gptAutoRunning = true;", preflightIndex);
  assert.ok(preflightIndex >= 0 && runningIndex > preflightIndex, "preflight must run before the queue is marked running");
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
  // 0.14.31: archive checkbox moved into workflow as「移动到成品库」step
  assert.match(html, /id="gptUploadLimit"/);
  assert.match(html, /id="gptGenerationLimit"/);
  assert.match(app, /retryFromStage/);
  assert.match(app, /retryFromPercent/);
  assert.match(app, /gpt-production\/quota/);
  assert.match(gptSidebar, /resumeExistingWorkflow/);
  assert.match(gptSidebar, /autoArchive/);
  assert.match(gptSidebar, /gpt-production\/archive-material/);
  assert.match(server, /function archiveMaterialAfterProduction/);
  assert.match(server, /sourceMaterialArchivePath: finalPath/);
  assert.match(server, /packageRecord\.sourceMaterialArchivePath = finalPath/);
});

  test("partial GPT attachments are treated as an upload-limit signal and the cat chat stays above the native page", () => {
  assert.match(gptSidebar, /UPLOAD_LIMIT_SIGNAL/);
  assert.match(gptSidebar, /GPT 上传未完整/);
  assert.match(gptSidebar, /可能触达上传图片\/文件上限/);
  assert.match(app, /UPLOAD_LIMIT_SIGNAL/);
  assert.match(app, /assistantChatOpen/);
  assert.match(app, /await window\.gptWorkbench\?\.hide/);
    assert.match(css, /\.workbench-assistant-panel[\s\S]*z-index: var\(--tb-layer-assistant-panel\)/);
    assert.match(css, /\.workbench-assistant-messages[\s\S]*max-height: min\(150px, 22vh\)/);
    assert.match(css, /\.workbench-assistant-panel[\s\S]*max-height: min\(300px, 46vh\)/);
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

test("retrying a failed send or composer boundary forces a clean one-post upload", () => {
  assert.match(app, /const failureText = `\$\{gptLastFailedStage \|\| ""\} \$\{failedTask\._error \|\| failedTask\.error \|\| ""\}`/);
  assert.match(app, /requiresFreshUpload = \/没有检测到新消息\|发送按钮已出现\|未发送附件/);
  assert.match(app, /failedTask\.forceUpload = true/);
  assert.match(app, /failedTask\._submittedToGpt = false/);
  assert.match(app, /delete failedTask\.workflow/);
});

test("local quota estimates never block uploads and real web limits are recorded separately", () => {
  assert.match(app, /不会阻止本次上传；以 GPT 网页真实提示为准/);
  assert.match(app, /return \{ quota, warningOnly: true \}/);
  assert.match(app, /function isActualGptLimitMessage/);
  assert.match(app, /function recordActualGptLimit/);
  assert.match(app, /function inferGptQuotaLimitKind/);
  assert.match(app, /function formatGptQuotaProbeTime/);
  assert.match(app, /已触发额度\/低产出上限/);
  assert.match(app, /自动重新探测/);
  assert.match(app, /gptQuotaPauseStatus && gptQueuePaused/);
  assert.match(app, /继续（等额度）/);
  assert.match(app, /已触达额度或低产出上限/);
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
  assert.match(app, /已识别为触顶征兆，当前素材跳过，本批暂停/);
  assert.match(app, /等待下一轮额度探测/);
  assert.match(app, /本轮图片低于安全线，判定为触顶\/降级征兆/);
  assert.match(app, /if \(lowOutputLimit\) gptTestQueueIndex \+= 1/);
  assert.match(app, /quotaPausedTask = task/);
  assert.match(app, /if \(!quotaPausedTask && failedTask/);
  assert.match(app, /function resetGptCycleForAutomaticProbe/);
  assert.match(app, /async function resumeGptQueueAfterQuotaProbe/);
  assert.match(app, /正在用下一条素材自动试跑/);
  assert.match(app, /function restoreGptQuotaProbeTimers/);
  assert.match(app, /restoreGptQuotaProbeTimers\(\)/);
});

test("uncertain GPT image counts preserve the current material instead of faking a quota limit", () => {
  assert.match(app, /"IMAGE_COUNT_UNCERTAIN"/);
  assert.match(app, /\(\?:只检测到\|完整回复只有\)/);
  assert.match(gptSidebar, /copy-turn-action-button/);
  assert.match(gptSidebar, /assistant-response-quiet-complete/);
  assert.match(gptSidebar, /未判定额度触顶/);
  assert.match(app, /LEGACY_IMAGE_COUNT_RECHECK/);
  assert.match(app, /本轮只检测到\\s\*1\\s\*张/);
  assert.match(app, /task\.retryFromStage = "等待图片"/);
  assert.match(app, /delete task\._endedAt/);
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
  assert.match(app, /pauseButton\.textContent = runtime\.pausedByUser/);
  assert.match(html, /id="gptStopQueueBtn"/);
  assert.match(app, /function reconcileGptWindow\(/);
  assert.match(app, /gptQueuePaused = true/);
});

test("GPT production keeps a recoverable queue and supports multiple permanent account-window workers", () => {
  assert.match(app, /GPT_QUEUE_STORAGE_KEY/);
  assert.match(app, /function persistGptQueue\(/);
  assert.match(app, /function restoreGptQueue\(/);
  assert.match(app, /sendMultiWindowGptTasks/);
  assert.match(app, /parallelWorkers/);
  assert.match(html, /value="single">/);
  assert.match(html, /value="rotate">/);
  assert.match(html, /value="manual">人工控制/);
  assert.match(html, /添加账号窗口/);
  assert.match(html, /id="gptBrowserManager"/);
  assert.match(app, /当前账号窗口打开在线模板/);
  assert.match(app, /name: `账号窗口 \${index \+ 1}`/);
  assert.match(app, /单账号全自动/);
  assert.match(app, /多账号全自动已启动/);
  assert.match(html, /账号窗口/);
  assert.match(desktopMain, /gpt-browser-profiles\.json/);
  assert.match(desktopMain, /desktop:gpt-profile-save/);
});

test("GPT rotation mode serially switches account windows only after a real quota signal", () => {
  assert.match(html, /value="automatic">/);
  assert.match(html, /value="rotate">/);
  assert.match(app, /function isRotatingGptMode\(/);
  assert.match(app, /async function sendRotatingWindowGptTasks\(/);
  assert.match(app, /function nextRotationAccount\(/);
  assert.match(app, /resetGptTaskForRotation\(/);
  assert.match(app, /触达真实限额，切换到/);
  assert.match(app, /所有账号窗口都在等待额度恢复/);
  assert.match(app, /一次只处理一帖/);
  assert.match(app, /Rotation is quota-driven, not round-robin/);
  assert.match(app, /blockedAccounts\.add\(account\.id\)[\s\S]{0,700}accountCursor = \(accountCursor \+ 1\) % accounts\.length/);
  assert.doesNotMatch(app, /state\.completed \+= 1;[\s\S]{0,220}accountCursor = \(accountCursor \+ 1\) % accounts\.length/);
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

test("desktop close goes to tray and temporary cache maintenance never clears login storage", () => {
  assert.match(desktopMain, /new Tray\(/);
  assert.match(desktopMain, /打开团建工作台/);
  assert.match(desktopMain, /彻底退出/);
  assert.match(desktopMain, /event\.preventDefault\(\)/);
  assert.match(desktopMain, /window\.hide\(\)/);
  assert.match(desktopMain, /partition: WORKBENCH_PARTITION,[\s\S]{0,260}backgroundThrottling: false/);
  assert.match(desktopMain, /async function refreshGptAccountSession\(/);
  assert.match(desktopMain, /await account\.session\.clearCache\(\)/);
  assert.match(desktopMain, /desktop:gpt-maintenance/);
  assert.match(desktopMain, /clearStorageData\(\)/);
  assert.match(desktopPreload, /maintenance\(input = \{\}\)/);
  assert.match(desktopMain, /persist:teambuilding-gpt-production/);
  assert.match(desktopMain, /async function flushAllGptStorageData\(\)/);
  assert.match(desktopMain, /flushStorageData\(\)/);
  assert.match(desktopMain, /if \(!quitFlushCompleted\)/);
});

test("GPT production refreshes after a completed post and clears only temporary cache every configured three-hour window", () => {
  assert.match(app, /GPT_TEMPORARY_CACHE_STORAGE_KEY/);
  assert.match(app, /function scheduleGptTemporaryCacheMaintenance\(/);
  assert.match(app, /async function refreshGptAfterProduction\(/);
  assert.match(app, /async function runGptTemporaryCacheMaintenance\(/);
  assert.match(app, /clearTemporaryCache: true/);
  assert.match(app, /GPT_TEMPORARY_CACHE_INTERVAL_MS = 3 \* 60 \* 60 \* 1000/);
  assert.match(app, /task\?\.taskType === "material" \|\|/);
  assert.match(app, /gptTemporaryCacheIntervalMs/);
  assert.match(app, /await refreshGptAfterProduction\(account\.id, "rotation-production-complete"\)/);
  assert.match(app, /await refreshGptAfterProduction\(runAccountId, "production-complete"\)/);
  assert.match(app, /production-limit-signal/);
  assert.match(desktopMain, /reloadIgnoringCache/);
  assert.match(desktopMain, /Never call clearStorageData here/);
  assert.match(desktopPreload, /desktop:gpt-maintenance/);
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

test("workbench keeps a single explicit renderer layer contract", () => {
  assert.match(css, /--tb-layer-gpt:\s*10/);
  assert.match(css, /--tb-layer-assistant-bubble:\s*1000/);
  assert.match(css, /\.workbench-assistant-launcher\s*\{\s*z-index:\s*var\(--tb-layer-assistant-cat\)/);
  assert.match(css, /\.context-menu[\s\S]*?z-index:\s*var\(--tb-layer-context-menu\)/);
  assert.match(css, /\.system-dialog-backdrop[\s\S]*?z-index:\s*var\(--tb-layer-dialog\)/);
  assert.match(desktopMain, /overlay\.setAlwaysOnTop\(true, "floating", 1\)/);
});

test("GPT automatic production keeps a durable user-visible production history", () => {
  assert.match(html, /id="gptProductionHistoryBtn"/);
  assert.match(html, /id="gptProductionHistoryPanel"/);
  assert.match(app, /GPT_HISTORY_STORAGE_KEY/);
  assert.match(app, /appendGptProductionHistory/);
  assert.match(app, /accountName: String\(gptAccounts\.find/);
  assert.match(app, /escapeHtml\(item\.accountName \|\| "当前账号窗口"\)/);
  assert.match(app, /openGptProductionHistory/);
  assert.match(app, /\/api\/gpt-production\/history/);
  assert.match(app, /planDurationMs/);
  assert.match(app, /imageDurationMs/);
  assert.match(app, /data-open-production-path/);
  assert.match(app, /打开成品文件夹/);
  assert.match(app, /打开图片暂存目录/);
  assert.match(app, /function openPath/);
  assert.match(server, /pathname === "\/api\/gpt-production\/history"/);
  assert.match(server, /downloadRoot/);
  assert.match(server, /copyTextLength/);
  assert.match(server, /packagePath/);
});

test("GPT browser profiles remember the last safe conversation URL", () => {
  assert.match(desktopMain, /lastUrl:\s*GPT_URL/);
  assert.match(desktopMain, /lastBrowserUrl:\s*GPT_URL/);
  assert.match(desktopMain, /const lastBrowserUrl = safeBrowserUrlOrDefault\(/);
  assert.match(desktopMain, /lastBrowserUrl,/);
  assert.match(desktopMain, /function safeGptUrl/);
  assert.match(desktopMain, /function safeBrowserUrl/);
  assert.match(desktopMain, /function rememberBrowserUrl/);
  assert.match(desktopMain, /did-navigate-in-page/);
  assert.match(desktopMain, /loadURL\(safeBrowserUrlOrDefault\(savedProfile\?\.lastBrowserUrl/);
  assert.match(desktopMain, /!\["http:", "https:"\]\.includes\(parsed\.protocol\)/);
  assert.match(desktopMain, /parsed\.username \|\| parsed\.password/);
});

test("GPT browser tabs keep an independent live URL and return home to ChatGPT", () => {
  assert.match(desktopMain, /partition:\s*`\$\{GPT_PARTITION_PREFIX\}-\$\{id\}`/);
  assert.match(desktopMain, /savedProfile\?\.lastBrowserUrl \|\| savedProfile\?\.lastUrl \|\| GPT_URL/);
  assert.match(desktopMain, /action === "home" \|\| action === "new-chat"\) await contents\.loadURL\(GPT_URL\)/);
  assert.match(app, /syncGptBrowserAddress\(result\.url\)/);
  assert.match(app, /gptBrowserHomeBtn.*navigateEmbeddedGpt\("home"\)/);
  assert.match(html, /id="gptBrowserAddressInput"/);
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
  assert.match(server, /sourceMaterialPath: String\(body\.sourceMaterialPath \|\| ""\)/);
  assert.match(server, /sourceMaterialPath: String\(source\.sourceMaterialPath \|\| ""\)/);
  assert.match(server, /sourceMaterialPath: item\.sourceMaterialPath \|\| ""/);
  assert.match(server, /pathname === "\/api\/extension\/save-copy-text"/);
  assert.match(server, /\.gpt-copy-staging/);
  assert.match(server, /removeExtensionCopyText/);
  assert.match(server, /function inspectGptWorkPackage\(/);
  assert.match(server, /packageValid: packagePath \? packageInspection\.valid : false/);
  assert.match(server, /recordMatchesDisk = packageRecord\?\.status === "completed"/);
  assert.match(server, /recordedActual === recordedExpected/);
  assert.match(server, /validatedByPackageRecord: recordMatchesDisk/);
  assert.match(app, /打开成品文件夹（待核对）/);
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

test("GPT browser tabs can be reordered and renamed without changing the running task owner", () => {
  assert.match(app, /data-gpt-account[^>]*draggable="true"/);
  assert.match(app, /reorderGptAccounts/);
  assert.match(app, /renameGptAccount/);
  assert.match(desktopPreload, /reorderProfiles/);
  assert.match(desktopMain, /desktop:gpt-profile-reorder/);
  assert.match(app, /gptAutoRunning && !options\.silent/);
});

test("GPT account tab context menu supports disable, rename and remove with cookie warning", () => {
  assert.match(html, /id="contextToggleDisable"/);
  assert.match(html, /id="contextRemoveAccount"/);
  assert.match(app, /toggleGptAccountDisabled/);
  assert.match(app, /removeGptAccount/);
  assert.match(app, /renameGptAccount[\s\S]*?openSystemDialog/);
  assert.match(app, /removeGptAccount[\s\S]*?openSystemDialog/);
  assert.match(app, /Cookie、GPT 登录状态、Google 登录/);
  assert.match(app, /gpt-account-tab\.disabled/);
});

test("GPT template panel supports local folders and persistent online conversation templates", () => {
  assert.match(html, /id="gptLocalTemplateModeBtn"/);
  assert.match(html, /id="gptOnlineTemplateModeBtn"/);
  assert.match(html, /id="gptOnlineTemplateName"/);
  assert.match(html, /id="gptOnlineTemplateUrl"/);
  assert.match(app, /loadGptOnlineTemplates/);
  assert.match(app, /saveGptOnlineTemplate/);
  assert.match(app, /data-gpt-online-template-delete/);
  assert.match(server, /pathname === "\/api\/gpt-online-templates"/);
  assert.match(desktopMain, /safeBrowserUrl/);
  assert.match(desktopMain, /await contents\.loadURL\(targetUrl\)/);
});

test("material and template rows expose the same manual upload action without starting automation", () => {
  assert.match(app, /data-gpt-upload-post/);
  assert.match(app, /data-gpt-upload-template/);
  assert.match(app, />上传素材<\/button>/);
  assert.match(app, />上传模板<\/button>/);
  assert.match(app, /uploadMaterialToCurrentGpt/);
  assert.match(app, /uploadTemplateToCurrentGpt/);
  assert.match(app, /autoRun:\s*false/);
  assert.match(app, /尚未自动发送/);
  assert.doesNotMatch(app, /data-gpt-send-post/);
  assert.match(css, /\.gpt-test-template-list \.workbench-folder-row\s*\{\s*grid-template-columns:\s*22px minmax\(0, 1fr\) auto;/);
});

test("new account windows receive the V3.6 master prompt while trained conversations stay compact", () => {
  assert.match(app, /const GPT_V36_MASTER_PROMPT/);
  assert.match(app, /function gptAccountNeedsMasterPrompt/);
  assert.match(app, /task\.taskType === "template-init"/);
  assert.match(app, /没有可确认的历史母版/);
  assert.match(app, /lastUrl: String\(profile\.lastUrl \|\| ""\)/);
});

test("multi-account endless mode keeps one serial task per browser and isolates quota stops", () => {
  assert.match(html, /value="multi"[^>]*>多账号全自动（旧版）/);
  assert.match(app, /pendingGroups\.splice\(claimIndex, 1\)/);
  assert.match(app, /await runGptTaskOnBrowser\(task, account, tracker\)/);
  assert.match(app, /isActualGptLimitMessage[\s\S]*?return;/);
  assert.match(app, /allowedAccountIds/);
});

test("multi-account production persists workers, filters accounts and leaves quota-pending posts queued", () => {
  assert.match(app, /GPT_MULTI_RUN_STORAGE_KEY/);
  assert.match(app, /function persistGptMultiRun\(/);
  assert.match(app, /function availableMultiWindowAccounts\(/);
  assert.match(app, /multiAccountIds/);
  assert.match(app, /status\s*=\s*"waiting-quota"/);
  assert.match(app, /pendingGroups\.unshift\(\{ group: group\.slice\(taskIndex \+ 1\)/);
  assert.match(app, /gptQueuePaused = pending\.length > 0/);
  assert.match(app, /!\["completed", "skipped"\]\.includes\(task\._status\)/);
});

test("endless material selection only queues complete non-hidden post folders in usage order", () => {
  assert.match(app, /const imageCount = Number\(item\.imageCount \|\| 0\)/);
  assert.match(app, /const textCount = Number\(item\.textCount \|\| 0\)/);
  assert.match(app, /return hasImage && hasText/);
  assert.match(app, /isHiddenMaterialPath\(item\.path\)/);
  assert.match(app, /gptMaterialUsageCount\(left\.item, left\.category\) - gptMaterialUsageCount\(right\.item, right\.category\)/);
});

test("endless selection treats physical 已使用/已上传 folders as usage evidence even with a stale zero ledger", () => {
  assert.match(app, /function gptMaterialUsageCount\(item = \{\}, category = \{\}\)/);
  assert.match(app, /gptMaterialUsageCount\(left\.item, left\.category\) - gptMaterialUsageCount\(right\.item, right\.category\)/);
});

test("endless scheduler freezes a deliberate selected batch before automatic refill", () => {
  assert.match(app, /if \(!hasPendingQueue && gptTestSelectedMaterials\.size\)/);
  assert.match(app, /gptTestQueue = buildGptProductionQueue\(\)/);
  const selectedBatch = app.indexOf("if (!hasPendingQueue && gptTestSelectedMaterials.size)");
  const autoRefill = app.indexOf("prepareAllDayGptQueue()", selectedBatch);
  assert.ok(selectedBatch >= 0 && autoRefill > selectedBatch, "selected batch must win before endless refill");
});

test("retrying a stale previous-post boundary forces a clean upload of the selected post", () => {
  assert.match(app, /上一帖\|composer\|COMPOSER/);
  assert.match(app, /WINDOW_STAGE_PENDING/);
  assert.match(app, /failedTask\.forceUpload = true/);
  assert.match(app, /failedTask\._submittedToGpt = false/);
});

test("desktop manual download actions cross the isolated extension world through a DOM bridge", () => {
  assert.match(desktopMain, /tb-workbench-manual-action-request/);
  assert.match(desktopMain, /tb-workbench-manual-action-result/);
  assert.doesNotMatch(desktopMain, /window\.CGPTImageDownloadDebug\?\.manualAction/);
});

test("a new post cannot upload while the previous GPT response is still generating", () => {
  assert.match(gptSidebar, /waitForPageIdleBeforeFreshUpload/);
  assert.match(gptSidebar, /WEB_RESPONSE_IN_FLIGHT/);
  assert.match(gptSidebar, /等待上一帖完成/);
});

test("continuous account windows retry only transient readiness failures and isolate quota snapshots", () => {
  assert.match(app, /function isTransientGptWindowFailure/);
  assert.match(app, /网页状态没有完成确认/);
  assert.match(app, /clearTimeout\(gptWindowRetryTimers\.get\(accountId\)\)/);
  assert.match(app, /const quotaKey = String\(gptAccounts\.find\(\(item\) => item\.id === key\)\?\.quotaGroup \|\| key\)/);
  assert.match(app, /await refreshGptQuota\(account\.id\)/);
});

test("cat usage is account-window specific and refreshes from real quota events", () => {
  assert.match(app, /currentSetNumber/);
  assert.match(app, /近\$\{quota\.settings\?\.windowHours \|\| 3\}小时上传/);
  assert.doesNotMatch(app, /预计上传 \$\{imageUploads\} 张图/);
  assert.match(app, /tb-workbench-quota-updated/);
  assert.match(app, /startGptQuotaUsageRefresh/);
});

test("generated quota is recorded when the current reply is confirmed, before download", () => {
  assert.match(gptSidebar, /generationQuotaRecorded/);
  assert.match(gptSidebar, /recordWorkbenchQuota\(task\.entry, "generated", imageUrls\.length\)/);
  assert.doesNotMatch(gptSidebar, /recordWorkbenchQuota\(task\.entry, "generated", downloadedImages\)/);
});

test("per-window mode: each account window stores and restores its own production mode", () => {
  // loadGptAccounts includes a mode field per account
  assert.match(app, /mode:\s*item\.mode\s*\?\s*normalizeGptProductionMode\(item\.mode\)/);
  // handleGptModeChange persists the mode on the current account
  assert.match(app, /currentAccount\.mode\s*=\s*key/);
  // switchGptAccount restores the mode from the account
  assert.match(app, /const accountMode\s*=\s*account\.mode/);
  assert.match(app, /gptAutoSettings\.mode\s*=\s*accountMode/);
  // hydrateGptBrowserProfiles preserves mode across Electron sync
  assert.match(app, /previousModes/);
  // Account tabs show the mode tag
  assert.match(app, /gpt-account-mode-tag/);
});


test("automatic mode is a one-shot batch that never refills or schedules endless production", () => {
  // automatic 模式不是连续模式
  assert.match(app, /automatic:\s*\{[^}]*continuous:\s*false/);
  // isContinuousGptProductionArmed 同时校验 isContinuousGptMode，automatic 永远不会触发永不停歇调度
  assert.match(app, /function isContinuousGptProductionArmed\(\)\s*\{\s*return isContinuousGptMode\(\)\s*&&\s*localStorage\.getItem\(GPT_CONTINUOUS_RUN_STORAGE_KEY\) === "true"/);
  // prepareAutoGptQueue 只在 isContinuousGptMode 守卫内调用，automatic 不补充素材
  assert.match(app, /if \(!hasPendingQueue && isContinuousGptMode\(\)\)\s*\{\s*hasPendingQueue = Boolean\(await prepareAutoGptQueue/);
  // automatic 模式 autoRun = true（非 manual 走全自动）
  assert.match(app, /const manualMode = normalizedMode === "manual"/);
  assert.match(app, /task\.autoRun = !manualMode/);
  // manual 模式主按钮必须说清楚：只上传到输入框，不会自动发送；automatic 仍是一轮自动生产
  assert.match(app, /modeKey === "manual"[\s\S]*?button\.textContent = "📤 上传素材到输入框"/);
  assert.match(app, /button\.textContent = `🚀 开始\$\{shortMode\}生产`/);
});

test("GPT production UI labels clarify upload actions, live status and optional extra prompt", () => {
  assert.match(html, /id="gptStatusBadge"/);
  assert.match(html, /class="gpt-extra-prompt-fold"/);
  assert.match(html, /补充要求（可留空）/);
  assert.match(app, /data-gpt-upload-post/);
  assert.match(app, />上传素材<\/button>/);
  assert.match(app, /data-gpt-upload-template/);
  assert.match(app, />上传模板<\/button>/);
  assert.match(app, /只把这个帖子的图片和 TXT 上传到当前 GPT 输入框，不自动发送/);
  assert.match(app, /只把这个模板的图片和规则上传到当前 GPT 输入框，不自动发送/);
  assert.match(app, /badgeText = "待发送"/);
  assert.match(css, /\.gpt-status-badge\.badge-running/);
  assert.match(css, /\.gpt-status-badge\.badge-pending/);
  assert.match(css, /\.gpt-status-badge\.badge-quota/);
  assert.match(css, /\.gpt-extra-prompt-fold/);
});

test("GPT production UI makes mode and template choices visible at a glance", () => {
  assert.match(html, /class="gpt-template-mode-switch"/);
  assert.match(css, /\.gpt-template-mode-switch button\.active/);
  assert.match(css, /\.gpt-mode-hint/);
  assert.match(app, /gpt-account-mode-tag/);
  assert.match(css, /\.gpt-account-mode-tag/);
  assert.match(app, /pauseButton\.hidden = !hasActiveWork/);
  assert.match(app, /skipBtn\.hidden = gptAutoRunning \? false : \(!gptTestQueue\.length \|\| gptTestQueueIndex >= gptTestQueue\.length\)/);
});

test("mode quick-tabs use shortNames consistent with GPT_MODE_DEFINITIONS and dropdown", () => {
  assert.match(html, /data-mode="manual"[^>]*role="tab"><span>人工<\/span>/);
  assert.match(html, /data-mode="automatic"[^>]*role="tab"><span>选材后<\/span>/);
  assert.match(html, /data-mode="single"[^>]*role="tab"><span>单账号<\/span>/);
  assert.match(html, /data-mode="rotate"[^>]*role="tab"><span>多账号<\/span>/);
  assert.match(html, /data-mode="patrol"[^>]*role="tab"><span>巡检<\/span>/);
  assert.doesNotMatch(html, /data-mode="semi-auto"[^>]*class="mode-quick-tab"/);
  assert.match(app, /shortName: "人工"/);
  assert.match(app, /shortName: "选材后"/);
  assert.match(app, /shortName: "单账号"/);
  assert.match(app, /shortName: "多账号"/);
  assert.match(app, /shortName: "巡检"/);
});

test("status badge uses English CSS class keys via BADGE_CLASS_KEY mapping", () => {
  assert.match(app, /BADGE_CLASS_KEY/);
  assert.match(app, /badge-\$\{BADGE_CLASS_KEY\[badgeText\] \|\| "idle"\}/);
  assert.match(css, /\.gpt-status-badge\.badge-running/);
  assert.match(css, /\.gpt-status-badge\.badge-ready/);
  assert.match(css, /\.gpt-status-badge\.badge-pending/);
  assert.match(css, /\.gpt-status-badge\.badge-confirm/);
  assert.match(css, /\.gpt-status-badge\.badge-paused/);
  assert.match(css, /\.gpt-status-badge\.badge-quota/);
  assert.match(css, /\.gpt-status-badge\.badge-restored/);
  assert.doesNotMatch(css, /badge-运行中/);
  assert.doesNotMatch(css, /badge-待发送/);
  assert.doesNotMatch(css, /badge-暂停中/);
});

test("production history button lives in heading actions not queue actions", () => {
  const headingMatch = html.match(/gpt-production-test-actions[\s\S]*?<\/div>/);
  assert.ok(headingMatch, "heading actions area must exist");
  assert.match(headingMatch[0], /id="gptProductionHistoryBtn"/);
  const queueMatch = html.match(/class="gpt-queue-actions"[\s\S]*?<\/div>/);
  assert.ok(queueMatch, "queue actions area must exist");
  assert.doesNotMatch(queueMatch[0], /gptProductionHistoryBtn/);
});

test("automatic mode resumes only the remaining queue after a quota probe, never refills new material", () => {
  const resumeIdx = app.indexOf("async function resumeGptQueueAfterQuotaProbe");
  assert.ok(resumeIdx >= 0, "resumeGptQueueAfterQuotaProbe must exist");
  const resumeSection = app.slice(resumeIdx, resumeIdx + 2400);
  // manual 模式不自动恢复
  assert.match(resumeSection, /if \(gptAutoSettings\.mode === "manual"\) return/);
  // 补充素材只在 continuous 模式，automatic 只续剩余队列
  assert.match(resumeSection, /if \(!hasPendingQueue && isContinuousGptMode\(\)\)\s*\{\s*hasPendingQueue = Boolean\(await prepareAutoGptQueue/);
});
test("stop button resets gptAutoRunning so mode switch works after stopping", () => {
  assert.match(app, /\$\("#gptStopQueueBtn"\)\?\.addEventListener\("click", async \(\) =>/);
  assert.match(app, /gptAutoPaused = true;[\s\S]*?gptQueuePaused = true;[\s\S]*?gptAutoRunning = false;/);
});

test("GPT mode definitions include 6 user-facing modes plus semi-auto compatibility", () => {
  assert.match(app, /manual:\s*\{[^}]*label:\s*"人工控制"/);
  assert.match(app, /automatic:\s*\{[^}]*label:\s*"选材后自动"/);
  assert.match(app, /single:\s*\{[^}]*label:\s*"单账号全自动"/);
  assert.match(app, /scheduled:\s*\{[^}]*label:\s*"定时单账号全自动"/);
  assert.match(app, /rotate:\s*\{[^}]*label:\s*"多账号全自动"/);
  assert.match(app, /patrol:\s*\{[^}]*label:\s*"单账号多对话巡检"/);
  assert.match(app, /"semi-auto":\s*\{[^}]*label:\s*"半自动（兼容）"[^}]*hidden:\s*true/);
});

test("normalizeGptProductionMode maps legacy multi to rotate and recognizes scheduled/patrol", () => {
  assert.match(app, /if \(mode === "scheduled"/);
  assert.match(app, /if \(mode === "patrol"/);
  assert.match(app, /if \(mode === "multi"\) return "rotate"/);
});

test("scheduled and patrol modes are continuous for automatic queue replenishment", () => {
  assert.match(app, /scheduled:\s*\{[^}]*continuous:\s*true/);
  assert.match(app, /patrol:\s*\{[^}]*continuous:\s*true/);
});
