const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const modulePath = path.join(__dirname, "gpt-runtime-recovery.js");

test("GPT runtime recovery is exposed as an independent controller factory", () => {
  const api = fs.existsSync(modulePath) ? require(modulePath) : {};
  assert.equal(typeof api.createController, "function");
});

test("a paused continuous queue awaits two ready checks before resuming", async () => {
  const { createController } = require(modulePath);
  const events = [];
  let statusCalls = 0;
  const controller = createController({
    getActiveAccountId: () => "account-1",
    getState: () => ({
      queuePaused: true,
      autoRunning: false,
      autoPaused: false,
      continuousMode: true,
      continuousArmed: true,
      retryPending: false,
      windowStopped: false,
      windowPaused: false
    }),
    status: async () => {
      statusCalls += 1;
      events.push(`status-${statusCalls}`);
      return { productionReady: true };
    },
    delay: async () => events.push("delay"),
    setQueuePaused: (value) => events.push(`paused-${value}`),
    resetRetryCount: () => events.push("reset-retry"),
    persistQueue: () => events.push("persist"),
    showBubble: () => events.push("bubble"),
    sendNext: async () => events.push("send-next")
  });

  const resumed = await controller.checkPausedQueue();

  assert.equal(resumed, true);
  assert.equal(statusCalls, 2);
  assert.deepEqual(events, [
    "status-1",
    "delay",
    "status-2",
    "bubble",
    "paused-false",
    "reset-retry",
    "persist",
    "send-next"
  ]);
});
