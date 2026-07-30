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
  status() {
    return ipcRenderer.invoke("desktop:gpt-status");
  },
  show(bounds) {
    return ipcRenderer.invoke("desktop:gpt-show", bounds);
  },
  hide() {
    return ipcRenderer.invoke("desktop:gpt-hide");
  },
  reload() {
    return ipcRenderer.invoke("desktop:gpt-reload");
  },
  sendTask(task) {
    return ipcRenderer.invoke("desktop:gpt-send-task", task);
  }
});
