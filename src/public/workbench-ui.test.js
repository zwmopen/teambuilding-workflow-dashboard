const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");

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

test("production confirmation stays in the main action dock instead of a hidden panel footer", () => {
  assert.match(html, /class="workbench-action-dock"/);
  assert.match(html, /id="workbenchPlanPanel"[^>]*hidden[\s\S]*id="workbenchEditPlanBtn"[^>]*hidden[\s\S]*id="workbenchStartProductionBtn"/);
  assert.match(app, /activeProductionPlan\s*\?\s*confirmProductionPlan\(\)\s*:\s*createProductionPlan\(\)/);
  assert.match(app, /workbenchStartProductionBtn"\)\.textContent = "确认并开始生成"/);
  assert.match(app, /workbenchPlanPanel"\)\?\.scrollIntoView/);
  assert.doesNotMatch(app, /data-confirm-production-plan/);
  assert.match(css, /\.workbench-action-dock\{position:sticky/);
});

test("production model and page controls use one compact toolbar", () => {
  assert.match(html, /class="workbench-run-settings compact"/);
  assert.match(css, /\.workbench-run-settings\.compact\{grid-template-columns:/);
  assert.match(css, /\.workbench-run-settings\.compact select\{height:30px/);
});
