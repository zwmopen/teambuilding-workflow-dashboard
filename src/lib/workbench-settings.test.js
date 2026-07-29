const test = require("node:test");
const assert = require("node:assert/strict");
const {
  countReserve,
  decorateTrustedDevices,
  findTrustedDevice,
  normalizePageSettings
} = require("./workbench-settings");

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
