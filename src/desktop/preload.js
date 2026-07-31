const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("desktopFiles", {
  getPath(file) {
    return webUtils.getPathForFile(file);
  }
});

contextBridge.exposeInMainWorld("desktopDialogs", {
  pickFolder(options = {}) {
    return ipcRenderer.invoke("desktop:pick-folder", {
      title: String(options.title || "选择文件夹"),
      defaultPath: String(options.defaultPath || "")
    });
  }
});

contextBridge.exposeInMainWorld("gptWorkbench", {
  available: true,
  status(accountId = "") {
    return ipcRenderer.invoke("desktop:gpt-status", String(accountId || ""));
  },
  show(bounds, accountId = "") {
    return ipcRenderer.invoke("desktop:gpt-show", {
      bounds,
      accountId: String(accountId || "")
    });
  },
  hide() {
    return ipcRenderer.invoke("desktop:gpt-hide");
  },
  releaseIdle(minutes = 30) {
    return ipcRenderer.invoke("desktop:gpt-release-idle", { minutes: Number(minutes || 30) });
  },
  navigate(action, accountId = "") {
    return ipcRenderer.invoke("desktop:gpt-navigate", {
      action: String(action || "reload"),
      accountId: String(accountId || "")
    });
  },
  reload(accountId = "") {
    return ipcRenderer.invoke("desktop:gpt-navigate", {
      action: "reload",
      accountId: String(accountId || "")
    });
  },
  sendTask(task) {
    return ipcRenderer.invoke("desktop:gpt-send-task", task);
  },
  workflowStatus(accountId = "") {
    return ipcRenderer.invoke("desktop:gpt-workflow-status", String(accountId || ""));
  },
  loginRecoveryStatus(accountId = "") {
    return ipcRenderer.invoke("desktop:gpt-login-recovery-status", String(accountId || ""));
  },
  createLoginRecovery(accountId = "") {
    return ipcRenderer.invoke("desktop:gpt-login-recovery-create", String(accountId || ""));
  },
  restoreLoginRecovery(accountId = "") {
    return ipcRenderer.invoke("desktop:gpt-login-recovery-restore", String(accountId || ""));
  },
  profiles() {
    return ipcRenderer.invoke("desktop:gpt-profiles");
  },
  saveProfile(profile = {}) {
    return ipcRenderer.invoke("desktop:gpt-profile-save", profile);
  },
  hideProfile(profile = {}) {
    return ipcRenderer.invoke("desktop:gpt-profile-hide", profile);
  },
  removeProfile(accountId = "") {
    return ipcRenderer.invoke("desktop:gpt-profile-remove", String(accountId || ""));
  },
  deleteProfileLogin(accountId = "") {
    return ipcRenderer.invoke("desktop:gpt-profile-delete-login", String(accountId || ""));
  },
  setProductionActive(active = false) {
    return ipcRenderer.invoke("desktop:production-active", Boolean(active));
  },
  notify(input = "", body = "") {
    const payload = input && typeof input === "object"
      ? input
      : { title: String(input || ""), body: String(body || "") };
    return ipcRenderer.invoke("desktop:notify", payload);
  },
  onPauseProduction(callback) {
    if (typeof callback !== "function") return () => {};
    const listener = () => callback();
    ipcRenderer.on("desktop:pause-production", listener);
    return () => ipcRenderer.removeListener("desktop:pause-production", listener);
  }
});
