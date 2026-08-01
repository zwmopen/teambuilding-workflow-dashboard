const DISTRIBUTION_CATEGORIES = new Set(["all", "traffic", "conversion", "unclassified"]);

const DEFAULT_PAGE_SETTINGS = Object.freeze({
  production: {
    templateRoot: "",
    packedRoot: "",
    folderBindings: {},
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
  },
  backup: {
    scheduleEnabled: true,
    frequency: "daily",
    intervalHours: 24,
    monthlyLargeFileLimitMb: 2560,
    sourceRoot: ""
  },
  gptAuto: {
    mode: "automatic",
    autoConfirm: true,
    autoCopy: true,
    autoPackage: true,
    pauseOnFailure: true,
    autoArchive: true,
    quotaReminderEnabled: true,
    minDelaySeconds: 25,
    maxDelaySeconds: 55,
    taskTimeoutMinutes: 30,
    accountTaskLimit: 8,
    accounts: [{ id: "account-1", name: "账号 1", uploadLimit: 80, generationLimit: 50, windowHours: 3 }]
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
  const backup = value.backup || {};
  const gptAuto = value.gptAuto || {};
  const backupFrequency = ["daily", "weekly", "interval"].includes(backup.frequency)
    ? backup.frequency : DEFAULT_PAGE_SETTINGS.backup.frequency;
  const defaultInterval = backupFrequency === "weekly" ? 168 : 24;
  return {
    production: {
      templateRoot: String(production.templateRoot || "").trim().slice(0, 1000),
      packedRoot: String(production.packedRoot || "").trim().slice(0, 1000),
      folderBindings: Object.fromEntries(Object.entries(production.folderBindings || {})
        .filter(([key, value]) => /^[a-z-]{3,40}$/.test(key) && typeof value === "string")
        .slice(0, 20)
        .map(([key, value]) => [key, value.trim().slice(0, 1000)])),
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
    },
    backup: {
      scheduleEnabled: backup.scheduleEnabled !== false,
      frequency: backupFrequency,
      intervalHours: backupFrequency === "interval"
        ? clampInteger(backup.intervalHours, defaultInterval, 1, 24 * 31)
        : defaultInterval,
      monthlyLargeFileLimitMb: clampInteger(backup.monthlyLargeFileLimitMb, 2560, 0, 10240),
      sourceRoot: String(backup.sourceRoot || "").trim().slice(0, 1000)
    },
    gptAuto: {
      mode: ["manual", "multi", "random", "all-day"].includes(gptAuto.mode) ? gptAuto.mode : "automatic",
      autoConfirm: gptAuto.autoConfirm !== false,
      autoCopy: gptAuto.autoCopy !== false,
      autoPackage: gptAuto.autoPackage !== false,
      pauseOnFailure: gptAuto.pauseOnFailure !== false,
      autoArchive: gptAuto.autoArchive !== false,
      quotaReminderEnabled: gptAuto.quotaReminderEnabled !== false,
      minDelaySeconds: clampInteger(gptAuto.minDelaySeconds, 25, 5, 600),
      maxDelaySeconds: clampInteger(gptAuto.maxDelaySeconds, 55, 5, 900),
      taskTimeoutMinutes: clampInteger(gptAuto.taskTimeoutMinutes, 30, 5, 90),
      accountTaskLimit: clampInteger(gptAuto.accountTaskLimit, 8, 1, 50),
      accounts: (Array.isArray(gptAuto.accounts) ? gptAuto.accounts : DEFAULT_PAGE_SETTINGS.gptAuto.accounts)
        .filter((account) => account && /^[a-z0-9_-]+$/i.test(String(account.id || "")))
        .slice(0, 8)
        .map((account, index) => ({
          id: String(account.id),
          name: String(account.name || `账号 ${index + 1}`).trim().slice(0, 24),
          uploadLimit: clampInteger(account.uploadLimit, 80, 1, 1000),
          generationLimit: clampInteger(account.generationLimit, 50, 1, 1000),
          windowHours: clampInteger(account.windowHours, 3, 1, 24)
        }))
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
