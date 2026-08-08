(function exposeGptAccountRotation(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TBGptAccountRotation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createGptAccountRotation() {
  function effectiveProductionMode(configuredMode = "manual", runState = null) {
    const mode = String(configuredMode || "manual");
    const runStatus = String(runState?.status || "");
    const unfinishedRotation = (runState?.rotation === true || runState?.mode === "rotate")
      && runState?.suspendedByModeSwitch !== true
      && ["running", "paused", "paused-integrity-boundary", "waiting-quota"].includes(runStatus);
    return unfinishedRotation ? "rotate" : mode;
  }

  function rotationRunAfterModeSwitch(runState = null, targetMode = "manual") {
    if (!runState || (runState.rotation !== true && runState.mode !== "rotate")) return runState;
    const mode = String(targetMode || "manual");
    if (mode === "rotate") {
      return {
        ...runState,
        status: runState.status === "paused-mode-switch" ? "paused" : runState.status,
        suspendedByModeSwitch: false,
        suspendedForMode: null
      };
    }
    return {
      ...runState,
      status: "paused-mode-switch",
      suspendedByModeSwitch: true,
      suspendedForMode: mode
    };
  }

  function shouldInitializeTemplate(task = {}, templateReady = false) {
    return task.taskType === "material"
      && Boolean(task.templateId)
      && task._submittedToGpt !== true
      && templateReady !== true;
  }

  function rotationResumeCheckpoint(task = {}) {
    const resuming = task.taskType === "material" && task._submittedToGpt === true;
    if (!resuming) return { resuming: false, stage: "", percent: 0 };
    const savedStage = String(task._stage || task.retryFromStage || "");
    const uploadLikeStage = !savedStage || /排队|准备|上传|附件/i.test(savedStage);
    return {
      resuming: true,
      stage: uploadLikeStage ? "等待迁移计划" : savedStage,
      percent: uploadLikeStage ? 24 : Math.max(1, Number(task._percent || task.retryFromPercent || 24))
    };
  }

  function accountParticipatesInRotation(account = {}, runtime = {}) {
    return Boolean(account.id)
      && account.mode === "rotate"
      && account.disabled !== true
      && runtime.pausedByUser !== true
      && runtime.stoppedByUser !== true;
  }

  function accountQuotaBoundary(quota = {}, now = Date.now()) {
    const generated = Math.max(0, Number(quota.generated || 0));
    const limit = Math.max(1, Number(quota.settings?.generationLimit || 45));
    const expiry = Date.parse(String(quota.nextExpiryAt || ""));
    return {
      reached: generated >= limit,
      generated,
      limit,
      nextProbeAt: generated >= limit && Number.isFinite(expiry) && expiry > now ? expiry : 0
    };
  }

  function reconcileAccountQuotaSettings({ profiles = [], settings = [], defaults = {} } = {}) {
    const existing = new Map((Array.isArray(settings) ? settings : [])
      .filter((account) => account?.id)
      .map((account) => [String(account.id), account]));
    const fallback = {
      uploadLimit: Math.max(1, Number(defaults.uploadLimit || 80)),
      generationLimit: Math.max(1, Number(defaults.generationLimit || 45)),
      windowHours: Math.max(1, Number(defaults.windowHours || 3))
    };
    return (Array.isArray(profiles) ? profiles : [])
      .filter((profile) => profile?.id)
      .map((profile, index) => {
        const saved = existing.get(String(profile.id));
        if (saved) return { ...saved };
        return {
          id: String(profile.id),
          name: String(profile.name || `账号 ${index + 1}`),
          ...fallback
        };
      });
  }

  function taskQuotaBoundary(options = {}) {
    const requiredUploads = Math.max(0, Number(options.requiredUploads || 0));
    const requiredGenerations = Math.max(0, Number(options.requiredGenerations || 0));
    const remainingUploads = Math.max(0, Number(options.remainingUploads || 0));
    const remainingGenerations = Math.max(0, Number(options.remainingGenerations || 0));
    if (requiredUploads > remainingUploads) {
      return { reached: true, kind: "upload", required: requiredUploads, remaining: remainingUploads };
    }
    if (requiredGenerations > remainingGenerations) {
      return { reached: true, kind: "generation", required: requiredGenerations, remaining: remainingGenerations };
    }
    return { reached: false, kind: "", required: 0, remaining: 0 };
  }

  function normalizeMaterialPath(value = "") {
    return String(value || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/+$/g, "")
      .toLowerCase();
  }

  function materialIdentityKey(value = '') {
    const normalized = normalizeMaterialPath(value);
    if (!normalized) return '';
    const stableId = normalized.match(/[（(]([0-9a-f]{8,64})[）)]$/i)?.[1];
    if (stableId) return `id:${stableId}`;
    const parts = normalized.split('/').filter(Boolean);
    return `name:${parts.at(-1) || normalized}`;
  }

  function recentSuccessfulMaterialKeys(checkpoints = [], now = Date.now(), maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
    const keys = new Set();
    (Array.isArray(checkpoints) ? checkpoints : []).forEach((checkpoint) => {
      if (checkpoint?.packageValid !== true) return;
      const updatedAt = Date.parse(String(checkpoint?.updatedAt || checkpoint?.finishedAt || ''));
      const age = Number(now) - updatedAt;
      if (!Number.isFinite(updatedAt) || age < -5 * 60 * 1000 || age > Math.max(0, Number(maxAgeMs || 0))) return;
      const key = materialIdentityKey(checkpoint?.sourceMaterialPath);
      if (key) keys.add(key);
    });
    return [...keys];
  }

  function recoverableMaterialPaths(checkpoints = [], now = Date.now(), maxAgeMs = 24 * 60 * 60 * 1000) {
    const paths = new Set();
    (Array.isArray(checkpoints) ? checkpoints : []).forEach((checkpoint) => {
      const sourcePath = normalizeMaterialPath(checkpoint?.sourceMaterialPath);
      if (!sourcePath || checkpoint?.packageValid === true) return;
      const updatedAt = Date.parse(String(checkpoint?.updatedAt || ""));
      const age = Number(now) - updatedAt;
      if (!Number.isFinite(updatedAt) || age < -5 * 60 * 1000 || age > Math.max(0, Number(maxAgeMs || 0))) return;
      const percent = Math.max(0, Number(checkpoint?.percent || 0));
      const hasArtifact = Number(checkpoint?.plannedImageCount || 0) > 0
        || Number(checkpoint?.downloadedImageCount || 0) > 0
        || Number(checkpoint?.copyTextLength || 0) > 0;
      const meaningfulStage = /计划|确认|生图|图片|文案|下载|txt|打包|归档|plan|image|copy|download|package/i
        .test(String(checkpoint?.stage || ""));
      if (percent >= 20 && (meaningfulStage || hasArtifact)) paths.add(sourcePath);
    });
    return [...paths];
  }

  function selectNextRotationAccount({
    accounts = [],
    cursor = 0,
    blocked = new Set(),
    cycleByAccount = {},
    runtimeByAccount = {},
    now = Date.now()
  } = {}) {
    if (!accounts.length) return { account: null, cursor: 0, nextProbeAt: 0 };
    const normalizedCursor = ((Number(cursor || 0) % accounts.length) + accounts.length) % accounts.length;
    let nextProbeAt = 0;
    for (let offset = 0; offset < accounts.length; offset += 1) {
      const index = (normalizedCursor + offset) % accounts.length;
      const account = accounts[index];
      if (!accountParticipatesInRotation(account, runtimeByAccount[account.id] || {})) continue;
      const probeAt = Math.max(0, Number(cycleByAccount[account.id]?.nextProbeAt || 0));
      if (blocked.has(account.id) || probeAt > now) {
        if (probeAt > now && (!nextProbeAt || probeAt < nextProbeAt)) nextProbeAt = probeAt;
        continue;
      }
      return { account, cursor: index, nextProbeAt: 0 };
    }
    return { account: null, cursor: normalizedCursor, nextProbeAt };
  }

  return {
    accountParticipatesInRotation,
    accountQuotaBoundary,
    effectiveProductionMode,
    materialIdentityKey,
    recentSuccessfulMaterialKeys,
    recoverableMaterialPaths,
    reconcileAccountQuotaSettings,
    rotationRunAfterModeSwitch,
    rotationResumeCheckpoint,
    shouldInitializeTemplate,
    taskQuotaBoundary,
    selectNextRotationAccount
  };
});
