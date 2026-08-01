const test = require("node:test");
const assert = require("node:assert/strict");
const {
  countReserve,
  decorateTrustedDevices,
  findTrustedDevice,
  normalizePageSettings
} = require("./workbench-settings");

test("GPT production settings preserve random no-prompt mode", () => {
  const settings = normalizePageSettings({ gptAuto: { mode: "random" } });
  assert.equal(settings.gptAuto.mode, "random");
});

test("GPT all-day settings preserve automatic restart and cross-midnight work hours", () => {
  const settings = normalizePageSettings({
    gptAuto: {
      mode: "all-day",
      launchAtLogin: true,
      continuousAutoStart: true,
      continuousWorkHoursEnabled: true,
      continuousWorkStart: "08:00",
      continuousWorkEnd: "01:00"
    }
  });
  assert.equal(settings.gptAuto.mode, "all-day");
  assert.equal(settings.gptAuto.launchAtLogin, true);
  assert.equal(settings.gptAuto.continuousAutoStart, true);
  assert.equal(settings.gptAuto.continuousWorkHoursEnabled, true);
  assert.equal(settings.gptAuto.continuousWorkStart, "08:00");
  assert.equal(settings.gptAuto.continuousWorkEnd, "01:00");
});

test("page settings keep safe defaults and clamp DIY values", () => {
  const settings = normalizePageSettings({
    production: { reserveThreshold: 0, itemsPerCollection: 200, compressCollections: true },
    distribution: {
      desktopReserveThreshold: 12,
      autoCategory: "conversion",
      autoSendCount: 50,
      autoDistributionEnabled: true
    }
  });
  assert.equal(settings.production.reserveThreshold, 1);
  assert.equal(settings.production.itemsPerCollection, 30);
  assert.equal(settings.production.compressCollections, true);
  assert.equal(settings.distribution.desktopReserveThreshold, 12);
  assert.equal(settings.distribution.autoSendCount, 20);
  assert.equal(settings.distribution.autoDistributionEnabled, true);
  assert.equal(settings.distribution.requireSendConfirmation, false);
  assert.equal(settings.backup.scheduleEnabled, true);
  assert.equal(settings.backup.frequency, "daily");
  assert.equal(settings.backup.intervalHours, 24);
  assert.equal(settings.backup.monthlyLargeFileLimitMb, 2560);
  assert.equal(settings.gptAuto.mode, "automatic");
  assert.equal(settings.gptAuto.accounts[0].uploadLimit, 80);
});

test("GPT automatic production settings keep per-account quotas", () => {
  const settings = normalizePageSettings({
    gptAuto: {
      mode: "manual",
      minDelaySeconds: 1,
      accounts: [{ id: "account-2", name: "运营号", uploadLimit: 90, generationLimit: 60, windowHours: 4 }]
    }
  });
  assert.equal(settings.gptAuto.mode, "manual");
  assert.equal(settings.gptAuto.minDelaySeconds, 5);
  assert.deepEqual(settings.gptAuto.accounts[0], {
    id: "account-2",
    name: "运营号",
    uploadLimit: 90,
    generationLimit: 60,
    windowHours: 4
  });
});

test("backup settings keep a practical schedule and clamp the monthly upload budget", () => {
  const settings = normalizePageSettings({
    backup: {
      scheduleEnabled: false,
      frequency: "weekly",
      intervalHours: 999,
      monthlyLargeFileLimitMb: 999999,
      sourceRoot: "D:\\团建方案库"
    }
  });
  assert.equal(settings.backup.scheduleEnabled, false);
  assert.equal(settings.backup.frequency, "weekly");
  assert.equal(settings.backup.intervalHours, 168);
  assert.equal(settings.backup.monthlyLargeFileLimitMb, 10240);
  assert.equal(settings.backup.sourceRoot, "D:\\团建方案库");
});

test("production page settings preserve the optional packed-library path", () => {
  const settings = normalizePageSettings({
    production: {
      packedRoot: "D:\\作品库\\抖音小红书",
      folderBindings: { "material-traffic": "D:\\素材库\\泛流量贴" }
    }
  });
  assert.equal(settings.production.packedRoot, "D:\\作品库\\抖音小红书");
  assert.equal(settings.production.folderBindings["material-traffic"], "D:\\素材库\\泛流量贴");
});

test("reserve count uses real mobile-stage sendable folders and category", () => {
  const collections = [
    { workflowStage: "mobile", type: "conversion", sourceValid: true, dualPlatformEligible: true },
    { workflowStage: "mobile", type: "traffic", sourceValid: true, dualPlatformEligible: true },
    { workflowStage: "official", type: "conversion", sourceValid: true, dualPlatformEligible: true },
    { workflowStage: "mobile", type: "conversion", sourceValid: false, dualPlatformEligible: true }
  ];
  assert.equal(countReserve(collections, "conversion"), 1);
  assert.equal(countReserve(collections, "all"), 2);
});

test("confirmed registry devices become trusted and unknown devices stay blocked", () => {
  const devices = decorateTrustedDevices([
    { id: "iphone-12", displayName: "2号 苹果12", aliases: ["2号"], platformStatus: "confirmed" },
    { id: "guest", displayName: "临时手机", aliases: ["临时手机"] }
  ]);
  assert.equal(devices[0].trusted, true);
  assert.equal(devices[1].trusted, false);
  assert.equal(findTrustedDevice(devices, "2号").id, "iphone-12");
  assert.equal(findTrustedDevice(devices, "临时手机"), null);
});
