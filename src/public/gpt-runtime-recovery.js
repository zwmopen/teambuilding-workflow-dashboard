(function exposeGptRuntimeRecovery(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TBGptRuntimeRecovery = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createGptRuntimeRecoveryApi() {
  function createController(deps = {}) {
    const delay = deps.delay || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));

    async function checkPausedQueue() {
      const state = deps.getState?.() || {};
      if (!state.queuePaused || state.autoRunning || state.autoPaused) return false;
      if (!state.continuousMode || !state.continuousArmed || state.retryPending) return false;
      if (state.windowStopped || state.windowPaused) return false;

      const accountId = deps.getActiveAccountId?.();
      const firstCheck = await deps.status?.(accountId).catch(() => null);
      if (!firstCheck?.productionReady) return false;

      await delay(3000);
      const latestState = deps.getState?.() || {};
      if (!latestState.queuePaused || latestState.autoRunning) return false;
      const confirmed = await deps.status?.(accountId).catch(() => null);
      if (!confirmed?.productionReady) return false;

      deps.showBubble?.("检测到 GPT 已就绪，自动恢复暂停的队列。", { duration: 4000, tone: "success" });
      deps.setQueuePaused?.(false);
      deps.resetRetryCount?.();
      deps.persistQueue?.();
      await deps.sendNext?.({ userInitiated: false, continuousResume: true });
      return true;
    }

    return { checkPausedQueue };
  }

  return { createController };
});
