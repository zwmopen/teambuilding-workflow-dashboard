const DISTRIBUTION_CATEGORIES = new Set(["all", "traffic", "conversion", "unclassified"]);

const DEFAULT_PAGE_SETTINGS = Object.freeze({
  production: {
    templateRoot: "",
    promptRules: "",
    scheduleEnabled: false,
    scheduleTime: "09:00",
    autoProduceEnabled: false,
    reserveThreshold: 10,
    reserveCategory: "conversion",
    itemsPerCollection: 9,
    compressCollections: false
  },
  distribution: {
    desktopReserveAlertEnabled: true,
    desktopReserveThreshold: 10,
    desktopReserveCategory: "conversion",
    requireSendConfirmation: false,
    completionNotificationEnabled: true,
    autoDistributionEnabled: false,
    detectOnConnection: true,
    phoneReserveThreshold: 10,
    autoCategory: "conversion",
    autoSendCount: 1
  }
});

function clampInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

function normalizeCategory(value, fallback = "conversion") {
  const category = String(value || "").trim();
  return DISTRIBUTION_CATEGORIES.has(category) ? category : fallback;
}

function normalizePageSettings(value = {}) {
  const production = value.production || {};
  const distribution = value.distribution || {};
  return {
    production: {
      templateRoot: String(production.templateRoot || "").trim().slice(0, 1000),
      promptRules: String(production.promptRules || "").trim().slice(0, 24000),
      scheduleEnabled: production.scheduleEnabled === true,
      scheduleTime: /^\d{2}:\d{2}$/.test(String(production.scheduleTime || ""))
        ? String(production.scheduleTime) : DEFAULT_PAGE_SETTINGS.production.scheduleTime,
      autoProduceEnabled: production.autoProduceEnabled === true,
      reserveThreshold: clampInteger(production.reserveThreshold, 10, 1, 500),
      reserveCategory: normalizeCategory(production.reserveCategory),
      itemsPerCollection: clampInteger(production.itemsPerCollection, 9, 1, 30),
      compressCollections: production.compressCollections === true
    },
    distribution: {
      desktopReserveAlertEnabled: distribution.desktopReserveAlertEnabled !== false,
      desktopReserveThreshold: clampInteger(distribution.desktopReserveThreshold, 10, 1, 500),
      desktopReserveCategory: normalizeCategory(distribution.desktopReserveCategory),
      requireSendConfirmation: distribution.requireSendConfirmation === true,
      completionNotificationEnabled: distribution.completionNotificationEnabled !== false,
      autoDistributionEnabled: distribution.autoDistributionEnabled === true,
      detectOnConnection: distribution.detectOnConnection !== false,
      phoneReserveThreshold: clampInteger(distribution.phoneReserveThreshold, 10, 1, 500),
      autoCategory: normalizeCategory(distribution.autoCategory),
      autoSendCount: clampInteger(distribution.autoSendCount, 1, 1, 20)
    }
  };
}

function countReserve(collections = [], category = "conversion") {
  const normalized = normalizeCategory(category);
  return (Array.isArray(collections) ? collections : []).filter((collection) => {
    if (collection.workflowStage && collection.workflowStage !== "mobile") return false;
    if (collection.sourceValid === false || collection.dualPlatformEligible === false) return false;
    return normalized === "all" || collection.type === normalized;
  }).length;
}

function isTrustedRegistryDevice(device = {}) {
  return device.trusted === true
    || device.platformStatus === "confirmed"
    || device.connectionStatus === "confirmed";
}

function decorateTrustedDevices(devices = []) {
  return (Array.isArray(devices) ? devices : []).map((device) => ({
    ...device,
    trusted: isTrustedRegistryDevice(device),
    trustLabel: isTrustedRegistryDevice(device) ? "已确认设备" : "陌生设备"
  }));
}

function deviceIdentityTokens(device = {}) {
  return [
    device.id,
    device.displayName,
    device.localRemark,
    device.note,
    ...(Array.isArray(device.aliases) ? device.aliases : []),
    ...(Array.isArray(device.models) ? device.models : []),
    device.model
  ]
    .map((value) => String(value || "").toLowerCase().replace(/[\s（）()·_\-/\\]+/g, ""))
    .filter(Boolean);
}

function findTrustedDevice(devices = [], target = "") {
  const normalizedTarget = String(target || "")
    .toLowerCase()
    .replace(/[\s（）()·_\-/\\]+/g, "");
  if (!normalizedTarget) return null;
  return decorateTrustedDevices(devices).find((device) => device.trusted
    && deviceIdentityTokens(device).some((token) =>
      token === normalizedTarget || token.includes(normalizedTarget) || normalizedTarget.includes(token)
    )) || null;
}

module.exports = {
  DEFAULT_PAGE_SETTINGS,
  countReserve,
  decorateTrustedDevices,
  findTrustedDevice,
  isTrustedRegistryDevice,
  normalizePageSettings
};
