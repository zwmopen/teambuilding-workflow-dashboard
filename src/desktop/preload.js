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
  }
});
